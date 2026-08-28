-- Studio reservation, custody and location commands cross commerce and
-- physical-authority tables.  Keep every writer behind the same semantic
-- piece lock so a successful command can never race a stale app-side read.

-- Refuse to install transactional writers over a legacy split state. A
-- terminal hold must not leave inventory reserved unless a current hold or
-- active order independently owns that reservation.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM studio_manual_holds AS terminal_hold
    INNER JOIN shop_inventory AS inventory ON inventory.sku = terminal_hold.sku
    WHERE terminal_hold.status IN ('RELEASED', 'EXPIRED')
      AND inventory.availability = 'RESERVED'
      AND inventory.reserved > 0
      AND NOT EXISTS (
        SELECT 1
        FROM studio_manual_holds AS active_hold
        WHERE active_hold.sku = terminal_hold.sku
          AND active_hold.status = 'ACTIVE'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM shop_order_items AS items
        INNER JOIN shop_orders AS orders ON orders.id = items.order_id
        WHERE items.sku = terminal_hold.sku
          AND orders.lifecycle_status = 'ACTIVE'
      )
  ) THEN
    RAISE EXCEPTION 'STUDIO_LEGACY_HOLD_SPLIT: reconcile terminal holds before migration';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM studio_manual_holds AS active_hold
    LEFT JOIN shop_inventory AS inventory ON inventory.sku = active_hold.sku
    WHERE active_hold.status = 'ACTIVE'
      AND (
        inventory.sku IS NULL
        OR inventory.availability IS DISTINCT FROM 'RESERVED'
        OR inventory.on_hand IS DISTINCT FROM 1
        OR inventory.reserved IS DISTINCT FROM 1
        OR EXISTS (
          SELECT 1
          FROM shop_order_items AS items
          INNER JOIN shop_orders AS orders ON orders.id = items.order_id
          WHERE items.sku = active_hold.sku
            AND orders.lifecycle_status = 'ACTIVE'
        )
      )
  ) THEN
    RAISE EXCEPTION 'STUDIO_LEGACY_ACTIVE_HOLD_SPLIT: reconcile active holds before migration';
  END IF;
END
$$;
--> statement-breakpoint

-- OPEN/CLOSED has no cancellation reason, so auto-closing an incomplete
-- legacy count would misstate it as a successful stocktake. Stop before any
-- authority-function cutover and require an explicit operational resolution.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM studio_stocktakes AS stocktake
    WHERE stocktake.state = 'OPEN'
      AND CASE
        WHEN jsonb_typeof(stocktake.expected_pieces) IS DISTINCT FROM 'array' THEN true
        WHEN jsonb_array_length(stocktake.expected_pieces) = 0 THEN true
        ELSE EXISTS (
          SELECT 1
          FROM jsonb_array_elements(stocktake.expected_pieces) AS expected_piece(value)
          WHERE jsonb_typeof(expected_piece.value) IS DISTINCT FROM 'object'
            OR NOT (expected_piece.value ?& ARRAY[
              'authorityUpdatedAt',
              'locationVersion',
              'orderReference',
              'orderVersion',
              'orderLifecycleStatus',
              'orderFulfillmentStatus',
              'orderReturnStatus'
            ]::text[])
        )
      END
  ) THEN
    RAISE EXCEPTION 'STUDIO_LEGACY_OPEN_STOCKTAKE_AUTHORITY_REQUIRED: resolve open counts before migration';
  END IF;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION studio_piece_is_reconciled_v1(
  p_operator_subject text,
  p_sku text,
  p_expected_availability text,
  p_required_location_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  inventory_record record;
  current_order record;
  projection_record record;
  observation_record record;
  piece_key_value text;
  effective_location_key text;
  authority_updated_at timestamptz;
BEGIN
  IF p_operator_subject IS NULL OR length(trim(p_operator_subject)) NOT BETWEEN 1 AND 255
    OR p_sku IS NULL OR length(trim(p_sku)) NOT BETWEEN 1 AND 40
    OR p_expected_availability IS NULL
    OR p_expected_availability NOT IN ('AVAILABLE', 'RESERVED')
    OR p_required_location_key IS NULL
    OR p_required_location_key NOT IN ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  THEN
    RETURN false;
  END IF;

  SELECT inventory.* INTO inventory_record
  FROM shop_inventory AS inventory
  WHERE inventory.sku = trim(p_sku);

  IF NOT FOUND
    OR inventory_record.availability::text IS DISTINCT FROM p_expected_availability
    OR inventory_record.on_hand <> 1
    OR (
      p_expected_availability = 'AVAILABLE'
      AND inventory_record.reserved <> 0
    )
    OR (
      p_expected_availability = 'RESERVED'
      AND inventory_record.reserved <> 1
    )
  THEN
    RETURN false;
  END IF;

  SELECT
    orders.id,
    orders.reference,
    orders.version,
    orders.updated_at,
    orders.fulfillment_status::text AS fulfillment_status,
    returns.status::text AS return_status
  INTO current_order
  FROM shop_order_items AS items
  INNER JOIN shop_orders AS orders ON orders.id = items.order_id
  LEFT JOIN shop_order_returns AS returns ON returns.order_id = orders.id
  WHERE items.sku = trim(p_sku)
    AND orders.lifecycle_status IN ('ACTIVE', 'COMPLETED')
  ORDER BY orders.updated_at DESC, orders.id DESC
  LIMIT 1;

  authority_updated_at := greatest(
    inventory_record.updated_at,
    coalesce(current_order.updated_at, inventory_record.updated_at)
  );

  IF p_expected_availability = 'RESERVED'
    AND current_order.fulfillment_status IS NOT NULL
    AND current_order.fulfillment_status = 'IN_TRANSIT'
  THEN
    RETURN false;
  END IF;

  SELECT COALESCE(
    'wardrobe:' || publication.wardrobe_item_id::text,
    'sku:' || trim(p_sku)
  ) INTO piece_key_value
  FROM (SELECT 1) AS singleton
  LEFT JOIN studio_catalogue_publications AS publication
    ON publication.operator_subject = trim(p_operator_subject)
    AND publication.sku = trim(p_sku);

  SELECT custody.* INTO projection_record
  FROM studio_piece_custody AS custody
  WHERE custody.operator_subject = trim(p_operator_subject)
    AND custody.piece_key = piece_key_value
    AND custody.custody = 'STUDIO'
    AND custody.availability = p_expected_availability
    AND custody.order_reference IS NOT DISTINCT FROM current_order.reference
    AND custody.updated_at >= authority_updated_at;

  SELECT observation.* INTO observation_record
  FROM studio_physical_observations AS observation
  WHERE observation.operator_subject = trim(p_operator_subject)
    AND observation.piece_key = piece_key_value
  ORDER BY observation.occurred_at DESC, observation.id DESC
  LIMIT 1;

  IF projection_record.piece_key IS NOT NULL
    AND (
      observation_record.id IS NULL
      OR projection_record.updated_at > observation_record.occurred_at
    )
  THEN
    effective_location_key := projection_record.location_key;
  ELSIF observation_record.id IS NOT NULL
    AND observation_record.order_reference IS NOT DISTINCT FROM current_order.reference
    AND observation_record.observed_custody = 'STUDIO'
    AND observation_record.occurred_at >= authority_updated_at
  THEN
    effective_location_key := observation_record.observed_location_key;
  ELSE
    RETURN false;
  END IF;

  RETURN effective_location_key = p_required_location_key;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION studio_expire_manual_holds_v2(
  p_operator_subject text
)
RETURNS integer
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  candidate record;
  inventory_record record;
  changed_count integer;
  expired_count integer := 0;
BEGIN
  IF p_operator_subject IS NULL OR length(trim(p_operator_subject)) NOT BETWEEN 1 AND 255 THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: invalid hold operator';
  END IF;

  FOR candidate IN
    SELECT hold.id, hold.sku, hold.operator_subject
    FROM studio_manual_holds AS hold
    WHERE hold.status = 'ACTIVE'
      AND hold.expires_at <= clock_timestamp()
    ORDER BY hold.sku, hold.id
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('juw:studio:piece:' || candidate.sku, 0)
    );

    SELECT hold.id, hold.sku, hold.operator_subject INTO candidate
    FROM studio_manual_holds AS hold
    WHERE hold.id = candidate.id
      AND hold.status = 'ACTIVE'
      AND hold.expires_at <= clock_timestamp()
    FOR UPDATE;
    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    SELECT inventory.* INTO inventory_record
    FROM shop_inventory AS inventory
    WHERE inventory.sku = candidate.sku
    FOR UPDATE;

    IF inventory_record.sku IS NULL
      OR inventory_record.availability::text <> 'RESERVED'
      OR inventory_record.on_hand <> 1
      OR inventory_record.reserved <> 1
      OR EXISTS (
        SELECT 1
        FROM shop_order_items AS items
        INNER JOIN shop_orders AS orders ON orders.id = items.order_id
        WHERE items.sku = candidate.sku
          AND orders.lifecycle_status = 'ACTIVE'
      )
      OR NOT studio_piece_is_reconciled_v1(
        candidate.operator_subject, candidate.sku, 'RESERVED', 'WARDROBE_RAIL'
      )
    THEN
      -- Keep both the hold and inventory reserved until the operator proves
      -- the post-transition saleable location.  Expiry is not publication.
      CONTINUE;
    END IF;

    UPDATE studio_manual_holds AS hold
    SET status = 'EXPIRED', released_at = clock_timestamp()
    WHERE hold.id = candidate.id
      AND hold.status = 'ACTIVE';
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: hold expiry transition mismatch';
    END IF;

    UPDATE shop_inventory AS inventory
    SET availability = 'AVAILABLE', reserved = 0, updated_at = clock_timestamp()
    WHERE inventory.sku = candidate.sku
      AND inventory.availability = 'RESERVED'
      AND inventory.on_hand = 1
      AND inventory.reserved = 1;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: hold expiry inventory mismatch';
    END IF;
    expired_count := expired_count + 1;
  END LOOP;

  RETURN expired_count;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION studio_create_manual_hold_v2(
  p_operator_subject text,
  p_idempotency_key text,
  p_sku text,
  p_customer_name text,
  p_contact text,
  p_reason text,
  p_expires_at timestamptz
)
RETURNS TABLE(
  outcome text,
  id uuid,
  sku varchar,
  customer_name text,
  contact text,
  reason text,
  status varchar,
  expires_at timestamptz,
  created_at timestamptz,
  released_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_hold studio_manual_holds%ROWTYPE;
  active_hold studio_manual_holds%ROWTYPE;
  inventory_record shop_inventory%ROWTYPE;
  inserted_hold studio_manual_holds%ROWTYPE;
  changed_count integer;
BEGIN
  IF p_operator_subject IS NULL OR length(trim(p_operator_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_sku IS NULL OR length(trim(p_sku)) NOT BETWEEN 1 AND 40
    OR p_customer_name IS NULL
    OR length(trim(p_customer_name)) NOT BETWEEN 2 AND 120
    OR p_contact IS NULL
    OR length(trim(p_contact)) NOT BETWEEN 3 AND 160
    OR p_reason IS NULL
    OR length(trim(p_reason)) NOT BETWEEN 2 AND 240
    OR p_expires_at IS NULL
  THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: invalid hold request';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'juw:studio:hold:idempotency:' || trim(p_operator_subject) || ':' || p_idempotency_key,
    0
  ));

  SELECT hold.* INTO existing_hold
  FROM studio_manual_holds AS hold
  WHERE hold.operator_subject = trim(p_operator_subject)
    AND hold.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF existing_hold.id IS NOT NULL THEN
    IF existing_hold.sku IS DISTINCT FROM trim(p_sku)
      OR existing_hold.customer_name IS DISTINCT FROM trim(p_customer_name)
      OR existing_hold.contact IS DISTINCT FROM trim(p_contact)
      OR existing_hold.reason IS DISTINCT FROM trim(p_reason)
      OR existing_hold.expires_at IS DISTINCT FROM p_expires_at
    THEN
      RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: hold request differs';
    END IF;
    RETURN QUERY SELECT
      'REPLAYED', existing_hold.id, existing_hold.sku, existing_hold.customer_name,
      existing_hold.contact, existing_hold.reason, existing_hold.status,
      existing_hold.expires_at, existing_hold.created_at, existing_hold.released_at;
    RETURN;
  END IF;

  IF p_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: hold expiry must be in the future';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('juw:studio:piece:' || trim(p_sku), 0)
  );

  SELECT inventory.* INTO inventory_record
  FROM shop_inventory AS inventory
  WHERE inventory.sku = trim(p_sku)
  FOR UPDATE;
  IF inventory_record.sku IS NULL THEN
    RAISE EXCEPTION 'STUDIO_PIECE_UNAVAILABLE: inventory missing';
  END IF;

  SELECT hold.* INTO active_hold
  FROM studio_manual_holds AS hold
  WHERE hold.sku = trim(p_sku)
    AND hold.status = 'ACTIVE'
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM shop_order_items AS items
    INNER JOIN shop_orders AS orders ON orders.id = items.order_id
    WHERE items.sku = trim(p_sku)
      AND orders.lifecycle_status = 'ACTIVE'
  ) THEN
    RAISE EXCEPTION 'STUDIO_PIECE_UNAVAILABLE: active order owns piece';
  END IF;

  IF active_hold.id IS NOT NULL THEN
    IF active_hold.expires_at > clock_timestamp() THEN
      RAISE EXCEPTION 'STUDIO_PIECE_UNAVAILABLE: active hold owns piece';
    END IF;
    IF inventory_record.availability::text <> 'RESERVED'
      OR inventory_record.on_hand <> 1
      OR inventory_record.reserved <> 1
      OR NOT studio_piece_is_reconciled_v1(
        trim(p_operator_subject), trim(p_sku), 'RESERVED', 'WARDROBE_RAIL'
      )
    THEN
      RAISE EXCEPTION 'STUDIO_CUSTODY_CONFLICT: expired hold location is not saleable';
    END IF;
    UPDATE studio_manual_holds AS hold
    SET status = 'EXPIRED', released_at = clock_timestamp()
    WHERE hold.id = active_hold.id
      AND hold.status = 'ACTIVE';
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: prior hold expiry mismatch';
    END IF;
  ELSE
    IF inventory_record.availability::text <> 'AVAILABLE'
      OR inventory_record.on_hand <> 1
      OR inventory_record.reserved <> 0
    THEN
      RAISE EXCEPTION 'STUDIO_PIECE_UNAVAILABLE: piece is not available';
    END IF;
    IF NOT studio_piece_is_reconciled_v1(
      trim(p_operator_subject), trim(p_sku), 'AVAILABLE', 'WARDROBE_RAIL'
    ) THEN
      RAISE EXCEPTION 'STUDIO_CUSTODY_CONFLICT: piece location is not reconciled';
    END IF;
  END IF;

  -- The request can wait behind another piece transaction. Re-evaluate the
  -- deadline after acquiring that lock so a hold is never born expired.
  IF p_expires_at <= clock_timestamp() THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: hold expiry elapsed while waiting';
  END IF;

  INSERT INTO studio_manual_holds (
    operator_subject, idempotency_key, sku, customer_name,
    contact, reason, status, expires_at, created_at
  ) VALUES (
    trim(p_operator_subject), p_idempotency_key, trim(p_sku), trim(p_customer_name),
    trim(p_contact), trim(p_reason), 'ACTIVE', p_expires_at, clock_timestamp()
  ) RETURNING * INTO inserted_hold;

  IF active_hold.id IS NULL THEN
    UPDATE shop_inventory AS inventory
    SET availability = 'RESERVED', reserved = 1, updated_at = clock_timestamp()
    WHERE inventory.sku = trim(p_sku)
      AND inventory.availability = 'AVAILABLE'
      AND inventory.on_hand = 1
      AND inventory.reserved = 0;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: hold inventory reservation mismatch';
    END IF;
  END IF;

  RETURN QUERY SELECT
    'CREATED', inserted_hold.id, inserted_hold.sku, inserted_hold.customer_name,
    inserted_hold.contact, inserted_hold.reason, inserted_hold.status,
    inserted_hold.expires_at, inserted_hold.created_at, inserted_hold.released_at;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION studio_release_manual_hold_v2(
  p_operator_subject text,
  p_hold_id uuid
)
RETURNS TABLE(
  outcome text,
  id uuid,
  sku varchar,
  customer_name text,
  contact text,
  reason text,
  status varchar,
  expires_at timestamptz,
  created_at timestamptz,
  released_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  hold_record studio_manual_holds%ROWTYPE;
  inventory_record shop_inventory%ROWTYPE;
  changed_count integer;
BEGIN
  IF p_operator_subject IS NULL OR length(trim(p_operator_subject)) NOT BETWEEN 1 AND 255
    OR p_hold_id IS NULL
  THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: invalid hold release';
  END IF;

  SELECT hold.* INTO hold_record
  FROM studio_manual_holds AS hold
  WHERE hold.id = p_hold_id
    AND hold.operator_subject = trim(p_operator_subject);
  IF hold_record.id IS NULL THEN
    RAISE EXCEPTION 'STUDIO_NOT_FOUND: hold';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('juw:studio:piece:' || hold_record.sku, 0)
  );

  SELECT hold.* INTO hold_record
  FROM studio_manual_holds AS hold
  WHERE hold.id = p_hold_id
    AND hold.operator_subject = trim(p_operator_subject)
  FOR UPDATE;
  IF hold_record.id IS NULL THEN
    RAISE EXCEPTION 'STUDIO_NOT_FOUND: hold';
  END IF;

  IF hold_record.status <> 'ACTIVE' THEN
    RETURN QUERY SELECT
      CASE WHEN hold_record.status = 'EXPIRED' THEN 'ALREADY_EXPIRED' ELSE 'ALREADY_RELEASED' END,
      hold_record.id, hold_record.sku, hold_record.customer_name, hold_record.contact,
      hold_record.reason, hold_record.status, hold_record.expires_at,
      hold_record.created_at, hold_record.released_at;
    RETURN;
  END IF;

  SELECT inventory.* INTO inventory_record
  FROM shop_inventory AS inventory
  WHERE inventory.sku = hold_record.sku
  FOR UPDATE;

  IF inventory_record.sku IS NULL
    OR inventory_record.availability::text <> 'RESERVED'
    OR inventory_record.on_hand <> 1
    OR inventory_record.reserved <> 1
    OR EXISTS (
      SELECT 1
      FROM shop_order_items AS items
      INNER JOIN shop_orders AS orders ON orders.id = items.order_id
      WHERE items.sku = hold_record.sku
        AND orders.lifecycle_status = 'ACTIVE'
    )
    OR NOT studio_piece_is_reconciled_v1(
      trim(p_operator_subject), hold_record.sku, 'RESERVED', 'WARDROBE_RAIL'
    )
  THEN
    RAISE EXCEPTION 'STUDIO_CUSTODY_CONFLICT: move piece to Wardrobe rail before release';
  END IF;

  UPDATE studio_manual_holds AS hold
  SET status = 'RELEASED', released_at = clock_timestamp()
  WHERE hold.id = hold_record.id
    AND hold.status = 'ACTIVE'
  RETURNING * INTO hold_record;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: hold release mismatch';
  END IF;

  UPDATE shop_inventory AS inventory
  SET availability = 'AVAILABLE', reserved = 0, updated_at = clock_timestamp()
  WHERE inventory.sku = hold_record.sku
    AND inventory.availability = 'RESERVED'
    AND inventory.on_hand = 1
    AND inventory.reserved = 1;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: hold release inventory mismatch';
  END IF;

  RETURN QUERY SELECT
    'RELEASED', hold_record.id, hold_record.sku, hold_record.customer_name,
    hold_record.contact, hold_record.reason, hold_record.status,
    hold_record.expires_at, hold_record.created_at, hold_record.released_at;
END
$$;
--> statement-breakpoint

ALTER TABLE studio_piece_custody_commands
  ADD COLUMN request_fingerprint varchar(64),
  ADD COLUMN expected_version integer,
  ADD COLUMN resulting_version integer;
--> statement-breakpoint
ALTER TABLE studio_piece_custody_commands
  DROP CONSTRAINT studio_piece_custody_command_known,
  ADD CONSTRAINT studio_piece_custody_command_known
    CHECK (command IN ('MOVE', 'CONFIRM')),
  ADD CONSTRAINT studio_piece_custody_command_fingerprint
    CHECK (request_fingerprint IS NULL OR request_fingerprint ~ '^[0-9a-f]{64}$'),
  ADD CONSTRAINT studio_piece_custody_command_expected_version_nonnegative
    CHECK (expected_version IS NULL OR expected_version >= 0),
  ADD CONSTRAINT studio_piece_custody_command_resulting_version_nonnegative
    CHECK (resulting_version IS NULL OR resulting_version >= 0),
  ADD CONSTRAINT studio_piece_custody_command_receipt_pair
    CHECK (
      (request_fingerprint IS NULL AND expected_version IS NULL AND resulting_version IS NULL)
      OR (
        request_fingerprint IS NOT NULL
        AND expected_version IS NOT NULL
        AND resulting_version IS NOT NULL
      )
    ),
  ADD CONSTRAINT studio_piece_custody_command_version_step
    CHECK (
      (expected_version IS NULL AND resulting_version IS NULL)
      OR (
        expected_version IS NOT NULL
        AND resulting_version IS NOT NULL
        AND (
          (command = 'MOVE' AND resulting_version = expected_version + 1)
          OR (command = 'CONFIRM' AND resulting_version = expected_version)
        )
      )
    );
--> statement-breakpoint

CREATE OR REPLACE FUNCTION studio_record_piece_move_v2(
  p_operator_subject text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_piece_key text,
  p_wardrobe_item_id uuid,
  p_sku text,
  p_availability text,
  p_order_reference text,
  p_expected_version integer,
  p_expected_authority_revision text,
  p_to_location_key text,
  p_reason text
)
RETURNS TABLE(
  outcome text,
  id uuid,
  piece_key varchar,
  command varchar,
  from_location_key varchar,
  from_location_label text,
  to_location_key varchar,
  to_location_label text,
  order_reference varchar,
  expected_version integer,
  resulting_version integer,
  created_at timestamptz
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_command studio_piece_custody_commands%ROWTYPE;
  inserted_command studio_piece_custody_commands%ROWTYPE;
  projection_record studio_piece_custody%ROWTYPE;
  inventory_record shop_inventory%ROWTYPE;
  wardrobe_record studio_wardrobe_items%ROWTYPE;
  locked_order record;
  current_order record;
  current_piece_key text;
  current_availability text;
  current_authority_updated_at timestamptz;
  current_order_reference text;
  base_location_key text;
  base_location_label text;
  current_location_key text;
  current_location_label text;
  target_location_label text;
  current_version integer;
  changed_count integer;
BEGIN
  IF p_operator_subject IS NULL OR length(trim(p_operator_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint IS NULL
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_piece_key IS NULL OR length(trim(p_piece_key)) NOT BETWEEN 1 AND 96
    OR (p_sku IS NOT NULL AND length(trim(p_sku)) NOT BETWEEN 1 AND 40)
    OR p_availability IS NULL
    OR p_availability NOT IN ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')
    OR p_expected_version IS NULL OR p_expected_version < 0
    OR p_expected_authority_revision IS NULL
    OR p_expected_authority_revision !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
    OR p_to_location_key IS NULL
    OR p_to_location_key NOT IN ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
    OR (p_reason IS NOT NULL AND length(trim(p_reason)) > 240)
    OR (p_sku IS NULL AND p_wardrobe_item_id IS NULL)
  THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: invalid location move';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'juw:studio:location:idempotency:' || trim(p_operator_subject) || ':' || p_idempotency_key,
    0
  ));

  SELECT custody_command.* INTO existing_command
  FROM studio_piece_custody_commands AS custody_command
  WHERE custody_command.operator_subject = trim(p_operator_subject)
    AND custody_command.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF existing_command.id IS NOT NULL THEN
    IF existing_command.request_fingerprint IS DISTINCT FROM p_request_fingerprint
      OR existing_command.command IS DISTINCT FROM 'MOVE'
    THEN
      RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: location move differs';
    END IF;
    RETURN QUERY SELECT
      'REPLAYED', existing_command.id, existing_command.piece_key,
      existing_command.command, existing_command.from_location_key,
      existing_command.from_location_label, existing_command.to_location_key,
      existing_command.to_location_label, existing_command.order_reference,
      existing_command.expected_version, existing_command.resulting_version,
      existing_command.created_at;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM studio_physical_observations AS observation
    WHERE observation.operator_subject = trim(p_operator_subject)
      AND observation.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: location key already used by an observation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'juw:studio:piece:' || COALESCE(trim(p_sku), trim(p_operator_subject) || ':' || trim(p_piece_key)),
    0
  ));

  -- Older application versions wrote observations without taking the shared
  -- location-idempotency lock. Recheck after the semantic piece lock so an
  -- in-flight legacy writer cannot cross-race this shared receipt.
  IF EXISTS (
    SELECT 1
    FROM studio_physical_observations AS observation
    WHERE observation.operator_subject = trim(p_operator_subject)
      AND observation.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: location key already used by an observation';
  END IF;

  IF p_sku IS NOT NULL THEN
    SELECT
      orders.id,
      orders.reference,
      orders.version,
      orders.lifecycle_status::text AS lifecycle_status,
      orders.fulfillment_status::text AS fulfillment_status,
      orders.updated_at AS authority_updated_at,
      returns.status::text AS return_status
    INTO locked_order
    FROM shop_order_items AS items
    INNER JOIN shop_orders AS orders ON orders.id = items.order_id
    LEFT JOIN shop_order_returns AS returns ON returns.order_id = orders.id
    WHERE items.sku = trim(p_sku)
      AND orders.lifecycle_status IN ('ACTIVE', 'COMPLETED')
    ORDER BY orders.updated_at DESC, orders.id DESC
    LIMIT 1
    FOR UPDATE OF orders;

    SELECT inventory.* INTO inventory_record
    FROM shop_inventory AS inventory
    WHERE inventory.sku = trim(p_sku)
    FOR UPDATE;
    IF inventory_record.sku IS NULL THEN
      RAISE EXCEPTION 'STUDIO_PIECE_UNAVAILABLE: inventory missing';
    END IF;

    SELECT
      orders.id,
      orders.reference,
      orders.version,
      orders.lifecycle_status::text AS lifecycle_status,
      orders.fulfillment_status::text AS fulfillment_status,
      orders.updated_at AS authority_updated_at,
      returns.status::text AS return_status
    INTO current_order
    FROM shop_order_items AS items
    INNER JOIN shop_orders AS orders ON orders.id = items.order_id
    LEFT JOIN shop_order_returns AS returns ON returns.order_id = orders.id
    WHERE items.sku = trim(p_sku)
      AND orders.lifecycle_status IN ('ACTIVE', 'COMPLETED')
    ORDER BY orders.updated_at DESC, orders.id DESC
    LIMIT 1;

    IF locked_order.id IS DISTINCT FROM current_order.id
      OR locked_order.reference IS DISTINCT FROM current_order.reference
      OR locked_order.version IS DISTINCT FROM current_order.version
      OR locked_order.lifecycle_status IS DISTINCT FROM current_order.lifecycle_status
      OR locked_order.fulfillment_status IS DISTINCT FROM current_order.fulfillment_status
      OR locked_order.return_status IS DISTINCT FROM current_order.return_status
      OR locked_order.authority_updated_at IS DISTINCT FROM current_order.authority_updated_at
    THEN
      RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: current order changed while inventory was locked';
    END IF;

    SELECT COALESCE(
      'wardrobe:' || publication.wardrobe_item_id::text,
      'sku:' || trim(p_sku)
    ) INTO current_piece_key
    FROM (SELECT 1) AS singleton
    LEFT JOIN studio_catalogue_publications AS publication
      ON publication.operator_subject = trim(p_operator_subject)
      AND publication.sku = trim(p_sku);

    current_availability := inventory_record.availability::text;
    current_authority_updated_at := greatest(
      inventory_record.updated_at,
      coalesce(current_order.authority_updated_at, inventory_record.updated_at)
    );
    current_order_reference := current_order.reference;
    IF current_availability = 'AVAILABLE' THEN
      base_location_key := 'WARDROBE_RAIL';
      base_location_label := 'Wardrobe rail';
    ELSIF current_availability = 'RESERVED'
      AND current_order.fulfillment_status = 'IN_TRANSIT'
    THEN
      RAISE EXCEPTION 'STUDIO_CUSTODY_CONFLICT: piece is with courier';
    ELSIF current_availability = 'RESERVED' THEN
      base_location_key := 'PACKING_SHELF';
      base_location_label := 'Packing shelf';
    ELSIF current_availability = 'SOLD'
      AND current_order.return_status = 'RECEIVED'
    THEN
      base_location_key := 'RETURN_INSPECTION';
      base_location_label := 'Return inspection';
    ELSE
      RAISE EXCEPTION 'STUDIO_CUSTODY_CONFLICT: piece is outside Studio custody';
    END IF;
  ELSE
    SELECT wardrobe.* INTO wardrobe_record
    FROM studio_wardrobe_items AS wardrobe
    WHERE wardrobe.id = p_wardrobe_item_id
      AND wardrobe.operator_subject = trim(p_operator_subject)
    FOR UPDATE;
    IF wardrobe_record.id IS NULL OR wardrobe_record.state = 'ARCHIVED' THEN
      RAISE EXCEPTION 'STUDIO_CUSTODY_CONFLICT: private piece is outside Studio custody';
    END IF;
    current_piece_key := 'wardrobe:' || wardrobe_record.id::text;
    current_availability := 'PRIVATE';
    current_authority_updated_at := wardrobe_record.updated_at;
    current_order_reference := NULL;
    base_location_key := 'WARDROBE_RAIL';
    base_location_label := 'Wardrobe rail';
  END IF;

  IF to_char(
    current_authority_updated_at AT TIME ZONE 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) IS DISTINCT FROM p_expected_authority_revision THEN
    RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: piece authority timestamp changed';
  END IF;

  IF current_piece_key IS DISTINCT FROM trim(p_piece_key)
    OR current_availability IS DISTINCT FROM p_availability
    OR current_order_reference IS DISTINCT FROM p_order_reference
  THEN
    RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: piece authority changed';
  END IF;

  SELECT custody.* INTO projection_record
  FROM studio_piece_custody AS custody
  WHERE custody.operator_subject = trim(p_operator_subject)
    AND custody.piece_key = trim(p_piece_key)
  FOR UPDATE;

  current_version := COALESCE(projection_record.version, 0);
  IF current_version <> p_expected_version THEN
    RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: location version changed';
  END IF;

  IF projection_record.piece_key IS NOT NULL
    AND projection_record.custody = 'STUDIO'
    AND projection_record.availability = current_availability
    AND projection_record.order_reference IS NOT DISTINCT FROM current_order_reference
    AND projection_record.updated_at >= current_authority_updated_at
  THEN
    current_location_key := projection_record.location_key;
    current_location_label := projection_record.location_label;
  ELSE
    current_location_key := base_location_key;
    current_location_label := base_location_label;
  END IF;

  IF current_location_key = p_to_location_key THEN
    RAISE EXCEPTION 'STUDIO_INVALID_TRANSITION: piece is already at target location';
  END IF;

  target_location_label := CASE p_to_location_key
    WHEN 'PACKING_SHELF' THEN 'Packing shelf'
    WHEN 'RETURN_INSPECTION' THEN 'Return inspection'
    ELSE 'Wardrobe rail'
  END;

  INSERT INTO studio_piece_custody_commands (
    operator_subject, idempotency_key, request_fingerprint, piece_key, command,
    from_location_key, from_location_label, to_location_key, to_location_label,
    custody, availability, order_reference, expected_version, resulting_version,
    reason, created_at
  ) VALUES (
    trim(p_operator_subject), p_idempotency_key, p_request_fingerprint,
    trim(p_piece_key), 'MOVE', current_location_key, current_location_label,
    p_to_location_key, target_location_label, 'STUDIO', current_availability,
    current_order_reference, p_expected_version, p_expected_version + 1,
    NULLIF(trim(p_reason), ''), clock_timestamp()
  ) RETURNING * INTO inserted_command;

  IF projection_record.piece_key IS NULL THEN
    INSERT INTO studio_piece_custody (
      operator_subject, piece_key, location_key, location_label, custody,
      availability, order_reference, last_command_id, version, updated_at
    ) VALUES (
      trim(p_operator_subject), trim(p_piece_key), p_to_location_key,
      target_location_label, 'STUDIO', current_availability,
      current_order_reference, inserted_command.id, p_expected_version + 1,
      inserted_command.created_at
    );
  ELSE
    UPDATE studio_piece_custody AS custody
    SET location_key = p_to_location_key,
        location_label = target_location_label,
        custody = 'STUDIO',
        availability = current_availability,
        order_reference = current_order_reference,
        last_command_id = inserted_command.id,
        version = p_expected_version + 1,
        updated_at = inserted_command.created_at
    WHERE custody.operator_subject = trim(p_operator_subject)
      AND custody.piece_key = trim(p_piece_key)
      AND custody.version = p_expected_version;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: location compare-and-swap failed';
    END IF;
  END IF;

  INSERT INTO studio_physical_observations (
    stocktake_id, operator_subject, idempotency_key, piece_key,
    wardrobe_item_id, sku, command,
    expected_location_key, expected_location_label, expected_custody,
    observed_location_key, observed_location_label, observed_custody,
    result, order_reference, note, occurred_at
  ) VALUES (
    null, trim(p_operator_subject), p_idempotency_key, trim(p_piece_key),
    p_wardrobe_item_id, p_sku, 'CONFIRM_IN_HAND',
    p_to_location_key, target_location_label, 'STUDIO',
    p_to_location_key, target_location_label, 'STUDIO',
    'MATCH', current_order_reference, NULLIF(trim(p_reason), ''),
    inserted_command.created_at
  );
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: location observation mismatch';
  END IF;

  RETURN QUERY SELECT
    'APPLIED', inserted_command.id, inserted_command.piece_key,
    inserted_command.command, inserted_command.from_location_key,
    inserted_command.from_location_label, inserted_command.to_location_key,
    inserted_command.to_location_label, inserted_command.order_reference,
    inserted_command.expected_version, inserted_command.resulting_version,
    inserted_command.created_at;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION studio_record_piece_confirmation_v2(
  p_operator_subject text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_source text,
  p_piece_key text,
  p_wardrobe_item_id uuid,
  p_sku text,
  p_expected_location_version integer,
  p_expected_authority_revision text,
  p_observed_location_key text,
  p_note text,
  p_stocktake_id uuid,
  p_expected_stocktake_version integer
)
RETURNS TABLE(
  outcome text,
  id uuid,
  stocktake_id uuid,
  piece_key varchar,
  wardrobe_item_id uuid,
  sku varchar,
  command varchar,
  expected_location_key varchar,
  expected_location_label text,
  expected_custody varchar,
  observed_location_key varchar,
  observed_location_label text,
  observed_custody varchar,
  result varchar,
  order_reference varchar,
  note text,
  occurred_at timestamptz,
  expected_version integer,
  resulting_version integer
)
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  existing_command studio_piece_custody_commands%ROWTYPE;
  existing_observation studio_physical_observations%ROWTYPE;
  inserted_command studio_piece_custody_commands%ROWTYPE;
  inserted_observation studio_physical_observations%ROWTYPE;
  projection_record studio_piece_custody%ROWTYPE;
  inventory_record shop_inventory%ROWTYPE;
  wardrobe_record studio_wardrobe_items%ROWTYPE;
  stocktake_record studio_stocktakes%ROWTYPE;
  expected_snapshot jsonb;
  locked_order record;
  current_order record;
  current_piece_key text;
  current_availability text;
  current_authority_updated_at timestamptz;
  current_order_reference text;
  current_order_version integer;
  current_order_lifecycle_status text;
  current_order_fulfillment_status text;
  current_order_return_status text;
  base_location_key text;
  base_location_label text;
  base_custody text;
  effective_location_key text;
  effective_location_label text;
  expected_location_key_value text;
  expected_location_label_value text;
  expected_custody_value text;
  expected_order_reference text;
  observed_location_label_value text;
  observation_result text;
  current_version integer;
  changed_count integer;
BEGIN
  IF p_operator_subject IS NULL OR length(trim(p_operator_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint IS NULL
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_source IS NULL
    OR p_source NOT IN ('OPERATIONS', 'STOCKTAKE')
    OR p_piece_key IS NULL OR length(trim(p_piece_key)) NOT BETWEEN 1 AND 96
    OR p_observed_location_key IS NULL
    OR p_observed_location_key NOT IN ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
    OR (p_note IS NOT NULL AND length(trim(p_note)) > 240)
    OR (p_sku IS NULL AND p_wardrobe_item_id IS NULL)
    OR (
      p_source = 'OPERATIONS'
      AND (
        p_expected_location_version IS NULL
        OR p_expected_location_version < 0
        OR p_expected_authority_revision IS NULL
        OR p_expected_authority_revision !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
        OR p_stocktake_id IS NOT NULL
        OR p_expected_stocktake_version IS NOT NULL
      )
    )
    OR (
      p_source = 'STOCKTAKE'
      AND (
        p_expected_location_version IS NOT NULL
        OR p_expected_authority_revision IS NOT NULL
        OR (p_stocktake_id IS NULL AND p_expected_stocktake_version IS NOT NULL)
        OR (p_stocktake_id IS NOT NULL AND (p_expected_stocktake_version IS NULL OR p_expected_stocktake_version < 1))
      )
    )
  THEN
    RAISE EXCEPTION 'STUDIO_INVALID_REQUEST: invalid location confirmation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'juw:studio:location:idempotency:' || trim(p_operator_subject) || ':' || p_idempotency_key,
    0
  ));

  SELECT custody_command.* INTO existing_command
  FROM studio_piece_custody_commands AS custody_command
  WHERE custody_command.operator_subject = trim(p_operator_subject)
    AND custody_command.idempotency_key = p_idempotency_key
  FOR UPDATE;

  IF existing_command.id IS NOT NULL THEN
    IF existing_command.request_fingerprint IS DISTINCT FROM p_request_fingerprint
      OR existing_command.command IS DISTINCT FROM 'CONFIRM'
    THEN
      RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: location confirmation differs';
    END IF;
    SELECT observation.* INTO existing_observation
    FROM studio_physical_observations AS observation
    WHERE observation.operator_subject = trim(p_operator_subject)
      AND observation.idempotency_key = p_idempotency_key;
    IF existing_observation.id IS NULL THEN
      RAISE EXCEPTION 'STUDIO_PERSISTENCE_UNAVAILABLE: confirmation receipt is incomplete';
    END IF;
    RETURN QUERY SELECT
      'REPLAYED', existing_observation.id, existing_observation.stocktake_id,
      existing_observation.piece_key, existing_observation.wardrobe_item_id,
      existing_observation.sku, existing_observation.command,
      existing_observation.expected_location_key,
      existing_observation.expected_location_label,
      existing_observation.expected_custody,
      existing_observation.observed_location_key,
      existing_observation.observed_location_label,
      existing_observation.observed_custody,
      existing_observation.result, existing_observation.order_reference,
      existing_observation.note, existing_observation.occurred_at,
      existing_command.expected_version, existing_command.resulting_version;
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM studio_physical_observations AS observation
    WHERE observation.operator_subject = trim(p_operator_subject)
      AND observation.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: location key already used by a legacy observation';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'juw:studio:piece:' || COALESCE(trim(p_sku), trim(p_operator_subject) || ':' || trim(p_piece_key)),
    0
  ));

  IF EXISTS (
    SELECT 1
    FROM studio_physical_observations AS observation
    WHERE observation.operator_subject = trim(p_operator_subject)
      AND observation.idempotency_key = p_idempotency_key
  ) THEN
    RAISE EXCEPTION 'STUDIO_IDEMPOTENCY_MISMATCH: location key already used by a legacy observation';
  END IF;

  IF p_sku IS NOT NULL THEN
    SELECT
      orders.id,
      orders.reference,
      orders.version,
      orders.lifecycle_status::text AS lifecycle_status,
      orders.fulfillment_status::text AS fulfillment_status,
      orders.updated_at AS authority_updated_at,
      returns.status::text AS return_status
    INTO locked_order
    FROM shop_order_items AS items
    INNER JOIN shop_orders AS orders ON orders.id = items.order_id
    LEFT JOIN shop_order_returns AS returns ON returns.order_id = orders.id
    WHERE items.sku = trim(p_sku)
      AND orders.lifecycle_status IN ('ACTIVE', 'COMPLETED')
    ORDER BY orders.updated_at DESC, orders.id DESC
    LIMIT 1
    FOR UPDATE OF orders;

    SELECT inventory.* INTO inventory_record
    FROM shop_inventory AS inventory
    WHERE inventory.sku = trim(p_sku)
    FOR UPDATE;
    IF inventory_record.sku IS NULL THEN
      RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: inventory authority changed';
    END IF;

    SELECT
      orders.id,
      orders.reference,
      orders.version,
      orders.lifecycle_status::text AS lifecycle_status,
      orders.fulfillment_status::text AS fulfillment_status,
      orders.updated_at AS authority_updated_at,
      returns.status::text AS return_status
    INTO current_order
    FROM shop_order_items AS items
    INNER JOIN shop_orders AS orders ON orders.id = items.order_id
    LEFT JOIN shop_order_returns AS returns ON returns.order_id = orders.id
    WHERE items.sku = trim(p_sku)
      AND orders.lifecycle_status IN ('ACTIVE', 'COMPLETED')
    ORDER BY orders.updated_at DESC, orders.id DESC
    LIMIT 1;

    IF locked_order.id IS DISTINCT FROM current_order.id
      OR locked_order.reference IS DISTINCT FROM current_order.reference
      OR locked_order.version IS DISTINCT FROM current_order.version
      OR locked_order.lifecycle_status IS DISTINCT FROM current_order.lifecycle_status
      OR locked_order.fulfillment_status IS DISTINCT FROM current_order.fulfillment_status
      OR locked_order.return_status IS DISTINCT FROM current_order.return_status
      OR locked_order.authority_updated_at IS DISTINCT FROM current_order.authority_updated_at
    THEN
      IF p_source = 'STOCKTAKE' THEN
        RAISE EXCEPTION 'STUDIO_STOCKTAKE_AUTHORITY_CONFLICT: current order changed while inventory was locked';
      ELSE
        RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: current order changed while inventory was locked';
      END IF;
    END IF;

    SELECT COALESCE(
      'wardrobe:' || publication.wardrobe_item_id::text,
      'sku:' || trim(p_sku)
    ) INTO current_piece_key
    FROM (SELECT 1) AS singleton
    LEFT JOIN studio_catalogue_publications AS publication
      ON publication.operator_subject = trim(p_operator_subject)
      AND publication.sku = trim(p_sku);

    current_availability := inventory_record.availability::text;
    current_authority_updated_at := greatest(
      inventory_record.updated_at,
      coalesce(current_order.authority_updated_at, inventory_record.updated_at)
    );
    current_order_reference := current_order.reference;
    current_order_version := current_order.version;
    current_order_lifecycle_status := current_order.lifecycle_status;
    current_order_fulfillment_status := current_order.fulfillment_status;
    current_order_return_status := current_order.return_status;
    IF current_availability = 'AVAILABLE' THEN
      base_location_key := 'WARDROBE_RAIL';
      base_location_label := 'Wardrobe rail';
      base_custody := 'STUDIO';
    ELSIF current_availability = 'RESERVED'
      AND current_order.fulfillment_status = 'IN_TRANSIT'
    THEN
      base_location_key := 'COURIER';
      base_location_label := 'With courier';
      base_custody := 'COURIER';
    ELSIF current_availability = 'RESERVED' THEN
      base_location_key := 'PACKING_SHELF';
      base_location_label := 'Packing shelf';
      base_custody := 'STUDIO';
    ELSIF current_availability = 'SOLD'
      AND current_order.return_status = 'RECEIVED'
    THEN
      base_location_key := 'RETURN_INSPECTION';
      base_location_label := 'Return inspection';
      base_custody := 'STUDIO';
    ELSIF current_availability = 'SOLD' THEN
      base_location_key := 'CUSTOMER';
      base_location_label := 'With customer';
      base_custody := 'CUSTOMER';
    ELSE
      base_location_key := 'RETIRED';
      base_location_label := 'Retired';
      base_custody := 'UNKNOWN';
    END IF;
  ELSE
    SELECT wardrobe.* INTO wardrobe_record
    FROM studio_wardrobe_items AS wardrobe
    WHERE wardrobe.id = p_wardrobe_item_id
      AND wardrobe.operator_subject = trim(p_operator_subject)
    FOR UPDATE;
    IF wardrobe_record.id IS NULL THEN
      RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: private piece authority changed';
    END IF;
    current_piece_key := 'wardrobe:' || wardrobe_record.id::text;
    current_authority_updated_at := wardrobe_record.updated_at;
    current_order_reference := NULL;
    current_order_version := NULL;
    current_order_lifecycle_status := NULL;
    current_order_fulfillment_status := NULL;
    current_order_return_status := NULL;
    IF wardrobe_record.state = 'ARCHIVED' THEN
      current_availability := 'ARCHIVED';
      base_location_key := 'RETIRED';
      base_location_label := 'Retired';
      base_custody := 'UNKNOWN';
    ELSE
      current_availability := 'PRIVATE';
      base_location_key := 'WARDROBE_RAIL';
      base_location_label := 'Wardrobe rail';
      base_custody := 'STUDIO';
    END IF;
  END IF;

  IF p_source = 'OPERATIONS'
    AND to_char(
      current_authority_updated_at AT TIME ZONE 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
    ) IS DISTINCT FROM p_expected_authority_revision
  THEN
    RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: piece authority timestamp changed';
  END IF;

  IF current_piece_key IS DISTINCT FROM trim(p_piece_key) THEN
    RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: piece authority changed';
  END IF;

  SELECT custody.* INTO projection_record
  FROM studio_piece_custody AS custody
  WHERE custody.operator_subject = trim(p_operator_subject)
    AND custody.piece_key = trim(p_piece_key)
  FOR UPDATE;

  current_version := COALESCE(projection_record.version, 0);
  IF p_source = 'OPERATIONS' AND current_version <> p_expected_location_version THEN
    RAISE EXCEPTION 'STUDIO_LOCATION_VERSION_CONFLICT: location version changed';
  END IF;

  IF projection_record.piece_key IS NOT NULL
    AND base_custody = 'STUDIO'
    AND projection_record.custody = 'STUDIO'
    AND projection_record.availability = current_availability
    AND projection_record.order_reference IS NOT DISTINCT FROM current_order_reference
    AND projection_record.updated_at >= current_authority_updated_at
  THEN
    effective_location_key := projection_record.location_key;
    effective_location_label := projection_record.location_label;
  ELSE
    effective_location_key := base_location_key;
    effective_location_label := base_location_label;
  END IF;

  expected_location_key_value := effective_location_key;
  expected_location_label_value := effective_location_label;
  expected_custody_value := base_custody;
  expected_order_reference := current_order_reference;

  IF p_source = 'STOCKTAKE' AND p_stocktake_id IS NOT NULL THEN
    SELECT stocktake.* INTO stocktake_record
    FROM studio_stocktakes AS stocktake
    WHERE stocktake.id = p_stocktake_id
      AND stocktake.operator_subject = trim(p_operator_subject)
    FOR UPDATE;
    IF stocktake_record.id IS NULL
      OR stocktake_record.state <> 'OPEN'
      OR stocktake_record.version <> p_expected_stocktake_version
      OR stocktake_record.location_key <> p_observed_location_key
    THEN
      RAISE EXCEPTION 'STUDIO_STOCKTAKE_VERSION_CONFLICT: count changed';
    END IF;

    SELECT expected_piece.value INTO expected_snapshot
    FROM jsonb_array_elements(stocktake_record.expected_pieces) AS expected_piece(value)
    WHERE expected_piece.value->>'pieceKey' = current_piece_key
    LIMIT 1;
    IF expected_snapshot IS NOT NULL THEN
      IF NOT (expected_snapshot ? 'authorityUpdatedAt')
        OR NOT (expected_snapshot ? 'locationVersion')
        OR NOT (expected_snapshot ? 'orderReference')
        OR NOT (expected_snapshot ? 'orderVersion')
        OR NOT (expected_snapshot ? 'orderLifecycleStatus')
        OR NOT (expected_snapshot ? 'orderFulfillmentStatus')
        OR NOT (expected_snapshot ? 'orderReturnStatus')
        OR expected_snapshot->'authorityUpdatedAt' IS DISTINCT FROM to_jsonb(current_authority_updated_at)
        OR expected_snapshot->>'locationVersion' IS DISTINCT FROM current_version::text
        OR expected_snapshot->>'availability' IS DISTINCT FROM current_availability
        OR NULLIF(expected_snapshot->>'orderReference', '') IS DISTINCT FROM current_order_reference
        OR expected_snapshot->>'orderVersion' IS DISTINCT FROM current_order_version::text
        OR expected_snapshot->>'orderLifecycleStatus' IS DISTINCT FROM current_order_lifecycle_status
        OR expected_snapshot->>'orderFulfillmentStatus' IS DISTINCT FROM current_order_fulfillment_status
        OR expected_snapshot->>'orderReturnStatus' IS DISTINCT FROM current_order_return_status
        OR expected_snapshot->>'expectedLocationKey' IS DISTINCT FROM effective_location_key
        OR expected_snapshot->>'expectedLocationLabel' IS DISTINCT FROM effective_location_label
        OR expected_snapshot->>'expectedCustody' IS DISTINCT FROM base_custody
      THEN
        RAISE EXCEPTION 'STUDIO_STOCKTAKE_AUTHORITY_CONFLICT: frozen piece authority changed';
      END IF;
      expected_location_key_value := expected_snapshot->>'expectedLocationKey';
      expected_location_label_value := expected_snapshot->>'expectedLocationLabel';
      expected_custody_value := expected_snapshot->>'expectedCustody';
      expected_order_reference := NULLIF(expected_snapshot->>'orderReference', '');
    END IF;
  END IF;

  observed_location_label_value := CASE p_observed_location_key
    WHEN 'PACKING_SHELF' THEN 'Packing shelf'
    WHEN 'RETURN_INSPECTION' THEN 'Return inspection'
    ELSE 'Wardrobe rail'
  END;
  observation_result := CASE
    WHEN expected_custody_value = 'STUDIO'
      AND expected_location_key_value = p_observed_location_key
      THEN 'MATCH'
    ELSE 'MISMATCH'
  END;

  INSERT INTO studio_piece_custody_commands (
    operator_subject, idempotency_key, request_fingerprint, piece_key, command,
    from_location_key, from_location_label, to_location_key, to_location_label,
    custody, availability, order_reference, expected_version, resulting_version,
    reason, created_at
  ) VALUES (
    trim(p_operator_subject), p_idempotency_key, p_request_fingerprint,
    trim(p_piece_key), 'CONFIRM', expected_location_key_value,
    expected_location_label_value, p_observed_location_key,
    observed_location_label_value, 'STUDIO', current_availability,
    expected_order_reference, current_version, current_version,
    NULLIF(trim(p_note), ''), clock_timestamp()
  ) RETURNING * INTO inserted_command;

  IF p_source = 'STOCKTAKE' AND p_stocktake_id IS NOT NULL THEN
    UPDATE studio_stocktakes AS stocktake
    SET version = stocktake.version + 1, updated_at = inserted_command.created_at
    WHERE stocktake.id = p_stocktake_id
      AND stocktake.operator_subject = trim(p_operator_subject)
      AND stocktake.state = 'OPEN'
      AND stocktake.version = p_expected_stocktake_version;
    GET DIAGNOSTICS changed_count = ROW_COUNT;
    IF changed_count <> 1 THEN
      RAISE EXCEPTION 'STUDIO_STOCKTAKE_VERSION_CONFLICT: count compare-and-swap failed';
    END IF;
  END IF;

  INSERT INTO studio_physical_observations (
    stocktake_id, operator_subject, idempotency_key, piece_key,
    wardrobe_item_id, sku, command,
    expected_location_key, expected_location_label, expected_custody,
    observed_location_key, observed_location_label, observed_custody,
    result, order_reference, note, occurred_at
  ) VALUES (
    p_stocktake_id, trim(p_operator_subject), p_idempotency_key,
    trim(p_piece_key), p_wardrobe_item_id, p_sku, 'CONFIRM_IN_HAND',
    expected_location_key_value, expected_location_label_value,
    expected_custody_value, p_observed_location_key,
    observed_location_label_value, 'STUDIO', observation_result,
    expected_order_reference, NULLIF(trim(p_note), ''),
    inserted_command.created_at
  ) RETURNING * INTO inserted_observation;

  RETURN QUERY SELECT
    'APPLIED', inserted_observation.id, inserted_observation.stocktake_id,
    inserted_observation.piece_key, inserted_observation.wardrobe_item_id,
    inserted_observation.sku, inserted_observation.command,
    inserted_observation.expected_location_key,
    inserted_observation.expected_location_label,
    inserted_observation.expected_custody,
    inserted_observation.observed_location_key,
    inserted_observation.observed_location_label,
    inserted_observation.observed_custody,
    inserted_observation.result, inserted_observation.order_reference,
    inserted_observation.note, inserted_observation.occurred_at,
    inserted_command.expected_version, inserted_command.resulting_version;
END
$$;
--> statement-breakpoint

CREATE OR REPLACE FUNCTION shop_create_assisted_order_v4(
  p_actor_subject text,
  p_actor_display_name text,
  p_source text,
  p_source_note text,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_lines jsonb,
  p_contact jsonb,
  p_fulfillment jsonb,
  p_now timestamptz,
  p_reservation_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  normalized_email text;
  existing_order record;
  customer_record record;
  assisted_subject text;
  item_record record;
  active_hold studio_manual_holds%ROWTYPE;
  reclaimed_expired_hold boolean;
  line_count integer;
  matched_count integer := 0;
  changed_count integer;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_source IS NULL
    OR p_source NOT IN ('PHONE', 'DM', 'IN_PERSON')
    OR p_idempotency_key IS NULL
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint IS NULL
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_contact) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_fulfillment) IS DISTINCT FROM 'object'
    OR p_now IS NULL
    OR p_reservation_expires_at IS NULL
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid assisted order';
  END IF;

  normalized_email := lower(trim(p_contact->>'email'));
  IF normalized_email IS NULL
    OR length(normalized_email) NOT BETWEEN 3 AND 320
    OR position('@' IN normalized_email) < 2
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid assisted customer';
  END IF;
  assisted_subject := 'assisted:' || md5(normalized_email);

  PERFORM pg_advisory_xact_lock(hashtextextended(
    'juw:studio:assisted-order:idempotency:' || normalized_email || ':' || p_idempotency_key,
    0
  ));

  -- Resolve an exact replay before customer creation, custody preflight or
  -- locks.  A lost response must remain replayable after inventory changed.
  SELECT orders.* INTO existing_order
  FROM shop_orders AS orders
  INNER JOIN shop_customers AS customers ON customers.id = orders.customer_id
  WHERE lower(customers.email) = normalized_email
    AND orders.idempotency_key = p_idempotency_key
  FOR UPDATE OF orders;

  IF existing_order.id IS NOT NULL THEN
    IF existing_order.request_fingerprint IS DISTINCT FROM p_request_fingerprint
      OR existing_order.source::text IS DISTINCT FROM p_source
      OR existing_order.created_by_actor_subject IS DISTINCT FROM trim(p_actor_subject)
    THEN
      RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: assisted order request differs';
    END IF;
    RETURN shop_order_document_v3(existing_order.id, true);
  END IF;

  -- Online checkout takes the customer lock before catalogue/inventory. Do
  -- the same here before the semantic piece locks so overlapping online and
  -- assisted orders cannot deadlock in opposite lock order. Any new customer
  -- row rolls back with this function if custody preflight later fails.
  SELECT customers.* INTO customer_record
  FROM shop_customers AS customers
  WHERE lower(customers.email) = normalized_email
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO shop_customers(
      auth_subject, email, phone, display_name, created_at, updated_at
    ) VALUES (
      assisted_subject, normalized_email, trim(p_contact->>'phone'),
      trim(p_contact->>'name'), p_now, p_now
    )
    ON CONFLICT DO NOTHING;
    SELECT customers.* INTO customer_record
    FROM shop_customers AS customers
    WHERE lower(customers.email) = normalized_email
    FOR UPDATE;
  END IF;
  IF customer_record.id IS NULL THEN
    RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: assisted customer could not be established';
  END IF;

  line_count := jsonb_array_length(p_lines);
  IF line_count NOT BETWEEN 1 AND 10 THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid assisted order lines';
  END IF;

  FOR item_record IN
    SELECT catalogue.sku
    FROM jsonb_array_elements(p_lines) AS line
    INNER JOIN shop_catalogue_items AS catalogue ON catalogue.slug = line->>'slug'
    ORDER BY catalogue.sku
  LOOP
    PERFORM pg_advisory_xact_lock(
      hashtextextended('juw:studio:piece:' || item_record.sku, 0)
    );
  END LOOP;

  FOR item_record IN
    SELECT
      catalogue.sku,
      catalogue.tagged_size,
      line->>'taggedSize' AS requested_size,
      inventory.availability::text AS availability,
      inventory.on_hand,
      inventory.reserved
    FROM jsonb_array_elements(p_lines) AS line
    INNER JOIN shop_catalogue_items AS catalogue ON catalogue.slug = line->>'slug'
    INNER JOIN shop_inventory AS inventory ON inventory.sku = catalogue.sku
    ORDER BY catalogue.sku
    FOR UPDATE OF catalogue, inventory
  LOOP
    matched_count := matched_count + 1;
    reclaimed_expired_hold := false;

    SELECT hold.* INTO active_hold
    FROM studio_manual_holds AS hold
    WHERE hold.sku = item_record.sku
      AND hold.status = 'ACTIVE'
    FOR UPDATE;

    IF active_hold.id IS NOT NULL THEN
      IF active_hold.expires_at > clock_timestamp() THEN
        RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: active hold owns piece';
      END IF;
      IF item_record.availability IS DISTINCT FROM 'RESERVED'
        OR item_record.on_hand <> 1
        OR item_record.reserved <> 1
        OR NOT studio_piece_is_reconciled_v1(
          trim(p_actor_subject), item_record.sku, 'RESERVED', 'WARDROBE_RAIL'
        )
      THEN
        RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: expired hold custody is not reconciled';
      END IF;

      UPDATE studio_manual_holds AS hold
      SET status = 'EXPIRED', released_at = clock_timestamp()
      WHERE hold.id = active_hold.id
        AND hold.status = 'ACTIVE';
      GET DIAGNOSTICS changed_count = ROW_COUNT;
      IF changed_count <> 1 THEN
        RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: assisted hold expiry mismatch';
      END IF;

      UPDATE shop_inventory AS inventory
      SET availability = 'AVAILABLE', reserved = 0, updated_at = clock_timestamp()
      WHERE inventory.sku = item_record.sku
        AND inventory.availability = 'RESERVED'
        AND inventory.on_hand = 1
        AND inventory.reserved = 1;
      GET DIAGNOSTICS changed_count = ROW_COUNT;
      IF changed_count <> 1 THEN
        RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: assisted hold inventory mismatch';
      END IF;
      reclaimed_expired_hold := true;
    END IF;

    IF item_record.requested_size IS DISTINCT FROM item_record.tagged_size
      OR (
        NOT reclaimed_expired_hold
        AND item_record.availability IS DISTINCT FROM 'AVAILABLE'
      )
      OR item_record.on_hand <> 1
      OR (
        NOT reclaimed_expired_hold
        AND item_record.reserved <> 0
      )
      OR (
        NOT reclaimed_expired_hold
        AND NOT studio_piece_is_reconciled_v1(
          trim(p_actor_subject), item_record.sku, 'AVAILABLE', 'WARDROBE_RAIL'
        )
      )
    THEN
      RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: Studio custody is not reconciled';
    END IF;
  END LOOP;

  IF matched_count <> line_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: catalogue line mismatch';
  END IF;

  RETURN shop_create_assisted_order_v3(
    p_actor_subject,
    p_actor_display_name,
    p_source,
    p_source_note,
    p_idempotency_key,
    p_request_fingerprint,
    p_lines,
    p_contact,
    p_fulfillment,
    p_now,
    p_reservation_expires_at
  );
END
$$;
--> statement-breakpoint
