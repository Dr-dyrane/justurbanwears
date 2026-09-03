CREATE OR REPLACE FUNCTION shop_transition_order_command_v4(
  p_reference text,
  p_actor_subject text,
  p_actor_display_name text,
  p_expected_version integer,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_dimension text,
  p_target text,
  p_details jsonb,
  p_note text,
  p_return_eligible_until timestamptz,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  existing_event record;
  receipt_event_id uuid;
  receipt_event_count integer;
  ignored jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 160
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid Studio command identity'; END IF;

  SELECT orders.* INTO order_record
  FROM shop_orders AS orders WHERE orders.reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;

  SELECT events.* INTO existing_event
  FROM shop_order_events AS events
  WHERE events.order_id = order_record.id
    AND events.actor_kind = 'OPERATOR'
    AND events.actor_subject = trim(p_actor_subject)
    AND events.metadata->>'studioCommandIdempotencyKey' = p_idempotency_key
  ORDER BY events.occurred_at DESC, events.id DESC
  LIMIT 1;
  IF FOUND THEN
    IF existing_event.metadata->>'studioCommandKind' IS DISTINCT FROM 'ORDER'
      OR existing_event.metadata->>'studioCommandRequestFingerprint' IS DISTINCT FROM p_request_fingerprint
      OR (existing_event.metadata->>'studioCommandExpectedVersion')::integer IS DISTINCT FROM p_expected_version
      OR existing_event.metadata->>'studioCommandDimension' IS DISTINCT FROM p_dimension
      OR existing_event.metadata->>'studioCommandTarget' IS DISTINCT FROM p_target
    THEN RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: Studio order command'; END IF;
    RETURN shop_order_document_v3(order_record.id, true);
  END IF;

  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: Studio order command';
  END IF;

  IF p_dimension = 'PICKUP' THEN
    ignored := shop_schedule_pickup_v3(
      p_reference, p_actor_subject, p_expected_version,
      (p_details->>'pickupAppointment')::timestamptz, p_note, p_now
    );
  ELSIF p_dimension = 'CANCELLATION_REFUND' THEN
    ignored := shop_transition_pre_handoff_recovery_v3(
      p_reference, p_actor_subject, p_expected_version, p_target,
      p_details->>'refundReference', (p_details->>'refundAmount')::integer,
      p_details->>'refundCurrency', p_note, p_now
    );
  ELSE
    ignored := shop_transition_order_v3(
      p_reference, p_actor_subject, p_actor_display_name, p_expected_version,
      p_dimension, p_target, p_details, p_note, p_return_eligible_until, p_now
    );
  END IF;

  SELECT min(events.id::text)::uuid, count(*) INTO receipt_event_id, receipt_event_count
  FROM shop_order_events AS events
  WHERE events.order_id = order_record.id
    AND events.actor_kind = 'OPERATOR'
    AND events.actor_subject = trim(p_actor_subject)
    AND events.occurred_at = p_now
    AND NOT (COALESCE(events.metadata, '{}'::jsonb) ? 'studioCommandIdempotencyKey');
  IF receipt_event_count <> 1 OR receipt_event_id IS NULL THEN
    RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: Studio order receipt';
  END IF;

  UPDATE shop_order_events
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'studioCommandVersion', 1,
    'studioCommandKind', 'ORDER',
    'studioCommandIdempotencyKey', p_idempotency_key,
    'studioCommandRequestFingerprint', p_request_fingerprint,
    'studioCommandExpectedVersion', p_expected_version,
    'studioCommandResultingVersion', p_expected_version + 1,
    'studioCommandDimension', p_dimension,
    'studioCommandTarget', p_target
  )
  WHERE id = receipt_event_id;

  RETURN shop_order_document_v3(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION shop_transition_return_command_v4(
  p_reference text,
  p_actor_subject text,
  p_expected_version integer,
  p_idempotency_key text,
  p_request_fingerprint text,
  p_dimension text,
  p_target text,
  p_refund_reference text,
  p_refund_amount integer,
  p_refund_currency text,
  p_line_dispositions jsonb,
  p_note text,
  p_now timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  existing_event record;
  receipt_event_id uuid;
  receipt_event_count integer;
  ignored jsonb;
BEGIN
  IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 8 AND 160
    OR p_request_fingerprint IS NULL OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
  THEN RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid Studio command identity'; END IF;

  SELECT orders.* INTO order_record
  FROM shop_orders AS orders WHERE orders.reference = p_reference FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;

  SELECT events.* INTO existing_event
  FROM shop_order_events AS events
  WHERE events.order_id = order_record.id
    AND events.actor_kind = 'OPERATOR'
    AND events.actor_subject = trim(p_actor_subject)
    AND events.metadata->>'studioCommandIdempotencyKey' = p_idempotency_key
  ORDER BY events.occurred_at DESC, events.id DESC
  LIMIT 1;
  IF FOUND THEN
    IF existing_event.metadata->>'studioCommandKind' IS DISTINCT FROM 'RETURN'
      OR existing_event.metadata->>'studioCommandRequestFingerprint' IS DISTINCT FROM p_request_fingerprint
      OR (existing_event.metadata->>'studioCommandExpectedVersion')::integer IS DISTINCT FROM p_expected_version
      OR existing_event.metadata->>'studioCommandDimension' IS DISTINCT FROM p_dimension
      OR existing_event.metadata->>'studioCommandTarget' IS DISTINCT FROM p_target
    THEN RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: Studio return command'; END IF;
    RETURN shop_order_document_v3(order_record.id, true);
  END IF;

  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: Studio return command';
  END IF;

  ignored := shop_transition_return_v3(
    p_reference, p_actor_subject, p_expected_version, p_dimension, p_target,
    p_refund_reference, p_refund_amount, p_refund_currency,
    p_line_dispositions, p_note, p_now
  );

  SELECT min(events.id::text)::uuid, count(*) INTO receipt_event_id, receipt_event_count
  FROM shop_order_events AS events
  WHERE events.order_id = order_record.id
    AND events.actor_kind = 'OPERATOR'
    AND events.actor_subject = trim(p_actor_subject)
    AND events.occurred_at = p_now
    AND NOT (COALESCE(events.metadata, '{}'::jsonb) ? 'studioCommandIdempotencyKey');
  IF receipt_event_count <> 1 OR receipt_event_id IS NULL THEN
    RAISE EXCEPTION 'SHOP_PERSISTENCE_UNAVAILABLE: Studio return receipt';
  END IF;

  UPDATE shop_order_events
  SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
    'studioCommandVersion', 1,
    'studioCommandKind', 'RETURN',
    'studioCommandIdempotencyKey', p_idempotency_key,
    'studioCommandRequestFingerprint', p_request_fingerprint,
    'studioCommandExpectedVersion', p_expected_version,
    'studioCommandResultingVersion', p_expected_version + 1,
    'studioCommandDimension', p_dimension,
    'studioCommandTarget', p_target
  )
  WHERE id = receipt_event_id;

  RETURN shop_order_document_v3(order_record.id, true);
END
$$;
