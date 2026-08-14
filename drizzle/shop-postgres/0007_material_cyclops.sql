CREATE TYPE "public"."shop_actor_kind" AS ENUM('CUSTOMER', 'OPERATOR', 'SYSTEM');--> statement-breakpoint
CREATE TYPE "public"."shop_event_visibility" AS ENUM('CUSTOMER', 'OPERATOR');--> statement-breakpoint
CREATE TYPE "public"."shop_fulfillment_status" AS ENUM('NOT_STARTED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF', 'IN_TRANSIT', 'DELIVERED');--> statement-breakpoint
CREATE TYPE "public"."shop_funds_confirmation_status" AS ENUM('UNCONFIRMED', 'CONFIRMED');--> statement-breakpoint
CREATE TYPE "public"."shop_notification_outbox_status" AS ENUM('PENDING', 'DELIVERED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."shop_order_lifecycle_status" AS ENUM('ACTIVE', 'COMPLETED', 'CANCELLED', 'EXPIRED');--> statement-breakpoint
CREATE TYPE "public"."shop_payment_evidence_status" AS ENUM('AUTHORIZED', 'RECEIVED', 'SUPERSEDED');--> statement-breakpoint
CREATE TYPE "public"."shop_payment_review_status" AS ENUM('AWAITING_EVIDENCE', 'EVIDENCE_RECEIVED', 'UNDER_REVIEW', 'REVIEW_APPROVED', 'REVIEW_REJECTED');--> statement-breakpoint
CREATE TYPE "public"."shop_refund_status" AS ENUM('NOT_STARTED', 'PENDING', 'COMPLETED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."shop_return_disposition" AS ENUM('RESTOCK', 'WRITE_OFF');--> statement-breakpoint
CREATE TYPE "public"."shop_return_reason" AS ENUM('WRONG_SIZE', 'NOT_AS_DESCRIBED', 'DAMAGED', 'CHANGED_MIND', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."shop_return_status" AS ENUM('REQUESTED', 'APPROVED', 'REJECTED', 'RECEIVED', 'RESOLVED');--> statement-breakpoint
CREATE TABLE "shop_notification_outbox" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"topic" varchar(80) NOT NULL,
	"dedupe_key" varchar(240) NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "shop_notification_outbox_status" DEFAULT 'PENDING' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"available_at" timestamp with time zone DEFAULT now() NOT NULL,
	"locked_at" timestamp with time zone,
	"locked_by" text,
	"delivered_at" timestamp with time zone,
	"last_error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shop_notification_outbox_payload_object" CHECK (jsonb_typeof("shop_notification_outbox"."payload") = 'object'),
	CONSTRAINT "shop_notification_outbox_attempts_nonnegative" CHECK ("shop_notification_outbox"."attempts" >= 0),
	CONSTRAINT "shop_notification_outbox_lock_pair" CHECK (
    ("shop_notification_outbox"."locked_at" is null and "shop_notification_outbox"."locked_by" is null)
    or ("shop_notification_outbox"."locked_at" is not null and "shop_notification_outbox"."locked_by" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "shop_order_returns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"status" "shop_return_status" DEFAULT 'REQUESTED' NOT NULL,
	"reason" "shop_return_reason" NOT NULL,
	"detail" text NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"eligible_until" timestamp with time zone NOT NULL,
	"approved_at" timestamp with time zone,
	"rejected_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"resolution_note" text,
	"refund_status" "shop_refund_status" DEFAULT 'NOT_STARTED' NOT NULL,
	"refund_reference" text,
	"refund_amount" integer,
	"refund_currency" varchar(3),
	"refund_updated_at" timestamp with time zone,
	"disposition" "shop_return_disposition",
	CONSTRAINT "shop_order_returns_request_fingerprint_sha256" CHECK ("shop_order_returns"."request_fingerprint" ~ '^[0-9a-f]{64}$'),
	CONSTRAINT "shop_order_returns_detail_length" CHECK (length(trim("shop_order_returns"."detail")) between 10 and 500),
	CONSTRAINT "shop_order_returns_refund_reference" CHECK (
    ("shop_order_returns"."refund_status" = 'COMPLETED'
      and "shop_order_returns"."refund_reference" is not null
      and "shop_order_returns"."refund_amount" > 0
      and "shop_order_returns"."refund_currency" = 'NGN')
    or ("shop_order_returns"."refund_status" <> 'COMPLETED'
      and "shop_order_returns"."refund_amount" is null
      and "shop_order_returns"."refund_currency" is null)
  ),
	CONSTRAINT "shop_order_returns_resolution" CHECK (
    ("shop_order_returns"."status" = 'RESOLVED'
      and "shop_order_returns"."resolved_at" is not null
      and "shop_order_returns"."disposition" is not null
      and "shop_order_returns"."refund_status" = 'COMPLETED')
    or ("shop_order_returns"."status" <> 'RESOLVED'
      and "shop_order_returns"."resolved_at" is null
      and "shop_order_returns"."disposition" is null)
  )
);
--> statement-breakpoint
CREATE TABLE "shop_payment_evidence" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"customer_id" uuid NOT NULL,
	"idempotency_key" varchar(160) NOT NULL,
	"request_fingerprint" varchar(64) NOT NULL,
	"status" "shop_payment_evidence_status" DEFAULT 'AUTHORIZED' NOT NULL,
	"original_file_name" varchar(180) NOT NULL,
	"content_type" varchar(80) NOT NULL,
	"byte_size" integer NOT NULL,
	"sha256" varchar(64) NOT NULL,
	"blob_pathname" text,
	"blob_url" text,
	"authorized_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"received_at" timestamp with time zone,
	CONSTRAINT "shop_payment_evidence_fingerprints_sha256" CHECK (
    "shop_payment_evidence"."request_fingerprint" ~ '^[0-9a-f]{64}$' and "shop_payment_evidence"."sha256" ~ '^[0-9a-f]{64}$'
  ),
	CONSTRAINT "shop_payment_evidence_size" CHECK ("shop_payment_evidence"."byte_size" > 0 and "shop_payment_evidence"."byte_size" <= 5000000),
	CONSTRAINT "shop_payment_evidence_mime" CHECK (
    "shop_payment_evidence"."content_type" in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  ),
	CONSTRAINT "shop_payment_evidence_received_metadata" CHECK (
    ("shop_payment_evidence"."status" = 'AUTHORIZED'
      and "shop_payment_evidence"."received_at" is null
      and "shop_payment_evidence"."blob_pathname" is null
      and "shop_payment_evidence"."blob_url" is null)
    or ("shop_payment_evidence"."status" in ('RECEIVED', 'SUPERSEDED')
      and "shop_payment_evidence"."received_at" is not null
      and "shop_payment_evidence"."blob_pathname" is not null
      and "shop_payment_evidence"."blob_url" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "studio_operator_membership" (
	"auth_subject" text PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"role" varchar(24) DEFAULT 'operator' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "studio_operator_membership_role" CHECK ("studio_operator_membership"."role" in ('operator', 'admin'))
);
--> statement-breakpoint
ALTER TABLE "shop_order_events" ALTER COLUMN "status" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "event_type" varchar(80) DEFAULT 'LEGACY_STATUS' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "actor_kind" "shop_actor_kind" DEFAULT 'SYSTEM' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "actor_subject" text DEFAULT 'migration:legacy' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "visibility" "shop_event_visibility" DEFAULT 'OPERATOR' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "lifecycle_status" "shop_order_lifecycle_status";--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "payment_review_status" "shop_payment_review_status";--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "funds_confirmation_status" "shop_funds_confirmation_status";--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD COLUMN "fulfillment_status" "shop_fulfillment_status";--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "lifecycle_status" "shop_order_lifecycle_status" DEFAULT 'ACTIVE' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "payment_review_status" "shop_payment_review_status" DEFAULT 'AWAITING_EVIDENCE' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_confirmation_status" "shop_funds_confirmation_status" DEFAULT 'UNCONFIRMED' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "fulfillment_status" "shop_fulfillment_status" DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "request_fingerprint" varchar(64) DEFAULT '0000000000000000000000000000000000000000000000000000000000000000' NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_transfer_reference" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_receiving_account_label" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_verifier_subject" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "funds_verifier_display_name" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "carrier_name" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "tracking_reference" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "pickup_appointment" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "recipient_name" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "dispatch_reference" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "dispatched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "delivery_proof_reference" text;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "reservation_expires_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "return_eligible_until" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "completed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "cancelled_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_orders" ADD COLUMN "expired_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "shop_notification_outbox" ADD CONSTRAINT "shop_notification_outbox_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_notification_outbox" ADD CONSTRAINT "shop_notification_outbox_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD CONSTRAINT "shop_order_returns_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_order_returns" ADD CONSTRAINT "shop_order_returns_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_payment_evidence" ADD CONSTRAINT "shop_payment_evidence_order_id_shop_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."shop_orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shop_payment_evidence" ADD CONSTRAINT "shop_payment_evidence_customer_id_shop_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."shop_customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "shop_notification_outbox_dedupe_unique" ON "shop_notification_outbox" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "shop_notification_outbox_delivery_idx" ON "shop_notification_outbox" USING btree ("status","available_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_returns_order_unique" ON "shop_order_returns" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_order_returns_customer_idempotency_unique" ON "shop_order_returns" USING btree ("customer_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "shop_order_returns_status_requested_idx" ON "shop_order_returns" USING btree ("status","requested_at");--> statement-breakpoint
CREATE UNIQUE INDEX "shop_payment_evidence_order_idempotency_unique" ON "shop_payment_evidence" USING btree ("order_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "shop_payment_evidence_order_status_idx" ON "shop_payment_evidence" USING btree ("order_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "studio_operator_membership_email_unique" ON "studio_operator_membership" USING btree (lower("email"));--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD CONSTRAINT "shop_order_events_type_nonempty" CHECK (length(trim("shop_order_events"."event_type")) > 0);--> statement-breakpoint
ALTER TABLE "shop_order_events" ADD CONSTRAINT "shop_order_events_actor_subject_nonempty" CHECK (length(trim("shop_order_events"."actor_subject")) > 0);--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_request_fingerprint_sha256" CHECK (
    "shop_orders"."request_fingerprint" ~ '^[0-9a-f]{64}$'
  );--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_version_nonnegative" CHECK ("shop_orders"."version" >= 0);--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_lifecycle_timestamps" CHECK (
    ("shop_orders"."lifecycle_status" = 'ACTIVE'
      and "shop_orders"."completed_at" is null
      and "shop_orders"."cancelled_at" is null
      and "shop_orders"."expired_at" is null)
    or ("shop_orders"."lifecycle_status" = 'COMPLETED'
      and "shop_orders"."completed_at" is not null
      and "shop_orders"."cancelled_at" is null
      and "shop_orders"."expired_at" is null)
    or ("shop_orders"."lifecycle_status" = 'CANCELLED'
      and "shop_orders"."completed_at" is null
      and "shop_orders"."cancelled_at" is not null
      and "shop_orders"."expired_at" is null)
    or ("shop_orders"."lifecycle_status" = 'EXPIRED'
      and "shop_orders"."completed_at" is null
      and "shop_orders"."cancelled_at" is null
      and "shop_orders"."expired_at" is not null)
  );--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_funds_audit_complete" CHECK (
    ("shop_orders"."funds_confirmation_status" = 'UNCONFIRMED'
      and "shop_orders"."funds_transfer_reference" is null
      and "shop_orders"."funds_receiving_account_label" is null
      and "shop_orders"."funds_confirmed_at" is null
      and "shop_orders"."funds_verifier_subject" is null
      and "shop_orders"."funds_verifier_display_name" is null)
    or ("shop_orders"."funds_confirmation_status" = 'CONFIRMED'
      and "shop_orders"."funds_transfer_reference" is not null
      and "shop_orders"."funds_receiving_account_label" is not null
      and "shop_orders"."funds_confirmed_at" is not null
      and "shop_orders"."funds_verifier_subject" is not null
      and "shop_orders"."funds_verifier_display_name" is not null)
  );--> statement-breakpoint
ALTER TABLE "shop_orders" ADD CONSTRAINT "shop_orders_fulfillment_facts_complete" CHECK (
    ("shop_orders"."fulfillment_status" in ('NOT_STARTED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF')
      and "shop_orders"."dispatched_at" is null and "shop_orders"."delivered_at" is null)
    or ("shop_orders"."fulfillment_status" = 'IN_TRANSIT'
      and "shop_orders"."fulfillment_kind" = 'DELIVERY'
      and "shop_orders"."carrier_name" is not null
      and "shop_orders"."tracking_reference" is not null
      and "shop_orders"."dispatch_reference" is not null
      and "shop_orders"."dispatched_at" is not null
      and "shop_orders"."delivered_at" is null)
    or ("shop_orders"."fulfillment_status" = 'DELIVERED'
      and "shop_orders"."recipient_name" is not null
      and "shop_orders"."delivered_at" is not null
      and "shop_orders"."delivery_proof_reference" is not null
      and (
        ("shop_orders"."fulfillment_kind" = 'DELIVERY'
          and "shop_orders"."carrier_name" is not null
          and "shop_orders"."tracking_reference" is not null
          and "shop_orders"."dispatch_reference" is not null
          and "shop_orders"."dispatched_at" is not null)
        or ("shop_orders"."fulfillment_kind" = 'PICKUP'
          and "shop_orders"."pickup_appointment" is not null
          and "shop_orders"."dispatched_at" is null)
      ))
  );
--> statement-breakpoint
CREATE FUNCTION "shop_payment_evidence_authorization_v2"("p_evidence_id" uuid)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', evidence.id,
    'orderId', evidence.order_id,
    'orderReference', orders.reference,
    'customerId', evidence.customer_id,
    'status', evidence.status,
    'originalFileName', evidence.original_file_name,
    'contentType', evidence.content_type,
    'byteSize', evidence.byte_size,
    'sha256', evidence.sha256,
    'authorizedAt', evidence.authorized_at,
    'expiresAt', evidence.expires_at,
    'receivedAt', evidence.received_at,
    'blobPathname', evidence.blob_pathname,
    'blobUrl', evidence.blob_url
  )
  FROM shop_payment_evidence AS evidence
  INNER JOIN shop_orders AS orders ON orders.id = evidence.order_id
  WHERE evidence.id = p_evidence_id
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_allowed_transitions_v2"("p_order_id" uuid, "p_now" timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  transitions jsonb := '[]'::jsonb;
BEGIN
  SELECT orders.* INTO order_record
  FROM shop_orders AS orders
  WHERE orders.id = p_order_id;

  IF NOT FOUND OR order_record.lifecycle_status <> 'ACTIVE' THEN
    RETURN transitions;
  END IF;

  IF order_record.fulfillment_status = 'NOT_STARTED'
    AND order_record.funds_confirmation_status = 'UNCONFIRMED'
  THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'LIFECYCLE', 'target', 'CANCELLED')
    );
  END IF;
  IF order_record.fulfillment_status = 'NOT_STARTED'
    AND order_record.funds_confirmation_status <> 'CONFIRMED'
    AND order_record.reservation_expires_at IS NOT NULL
    AND order_record.reservation_expires_at <= p_now
  THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'LIFECYCLE', 'target', 'EXPIRED')
    );
  END IF;

  IF order_record.payment_review_status = 'EVIDENCE_RECEIVED' THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'UNDER_REVIEW'),
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_APPROVED'),
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_REJECTED')
    );
  ELSIF order_record.payment_review_status = 'UNDER_REVIEW' THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_APPROVED'),
      jsonb_build_object('dimension', 'PAYMENT_REVIEW', 'target', 'REVIEW_REJECTED')
    );
  END IF;

  IF order_record.payment_review_status = 'REVIEW_APPROVED'
    AND order_record.funds_confirmation_status = 'UNCONFIRMED'
  THEN
    transitions := transitions || jsonb_build_array(
      jsonb_build_object('dimension', 'FUNDS_CONFIRMATION', 'target', 'CONFIRMED')
    );
  END IF;

  IF order_record.payment_review_status = 'REVIEW_APPROVED'
    AND order_record.funds_confirmation_status = 'CONFIRMED'
  THEN
    IF order_record.fulfillment_status = 'NOT_STARTED' THEN
      transitions := transitions || jsonb_build_array(
        jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'QUALITY_CHECK')
      );
    ELSIF order_record.fulfillment_status = 'QUALITY_CHECK' THEN
      transitions := transitions || jsonb_build_array(
        jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'READY_FOR_HANDOFF')
      );
    ELSIF order_record.fulfillment_status = 'READY_FOR_HANDOFF' THEN
      transitions := transitions || jsonb_build_array(jsonb_build_object(
        'dimension', 'FULFILLMENT',
        'target', CASE order_record.fulfillment_kind WHEN 'DELIVERY' THEN 'IN_TRANSIT' ELSE 'DELIVERED' END
      ));
    ELSIF order_record.fulfillment_status = 'IN_TRANSIT' THEN
      transitions := transitions || jsonb_build_array(
        jsonb_build_object('dimension', 'FULFILLMENT', 'target', 'DELIVERED')
      );
    END IF;
  END IF;

  RETURN transitions;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_allowed_return_transitions_v2"("p_order_id" uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  return_record record;
  transitions jsonb := '[]'::jsonb;
BEGIN
  SELECT returns.* INTO return_record
  FROM shop_order_returns AS returns
  WHERE returns.order_id = p_order_id;
  IF NOT FOUND THEN RETURN transitions; END IF;

  IF return_record.status = 'REQUESTED' THEN
    transitions := jsonb_build_array(
      jsonb_build_object('dimension', 'RETURN', 'target', 'APPROVED'),
      jsonb_build_object('dimension', 'RETURN', 'target', 'REJECTED')
    );
  ELSIF return_record.status = 'APPROVED' THEN
    transitions := jsonb_build_array(
      jsonb_build_object('dimension', 'RETURN', 'target', 'RECEIVED')
    );
  ELSIF return_record.status = 'RECEIVED' THEN
    IF return_record.refund_status = 'NOT_STARTED' THEN
      transitions := jsonb_build_array(
        jsonb_build_object('dimension', 'REFUND', 'target', 'PENDING')
      );
    ELSIF return_record.refund_status IN ('PENDING', 'FAILED') THEN
      transitions := jsonb_build_array(
        jsonb_build_object('dimension', 'REFUND', 'target', 'COMPLETED'),
        jsonb_build_object('dimension', 'REFUND', 'target', 'FAILED')
      );
    ELSIF return_record.refund_status = 'COMPLETED' THEN
      transitions := jsonb_build_array(
        jsonb_build_object('dimension', 'RETURN_RESOLUTION', 'target', 'RESTOCK'),
        jsonb_build_object('dimension', 'RETURN_RESOLUTION', 'target', 'WRITE_OFF')
      );
    END IF;
  END IF;
  RETURN transitions;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_order_document_v2"("p_order_id" uuid, "p_include_private" boolean DEFAULT false)
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  SELECT jsonb_build_object(
    'id', orders.reference,
    'reference', orders.reference,
    'lines', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'snapshot', 'PRODUCT',
        'slug', items.product_slug,
        'sku', items.sku,
        'name', items.product_name,
        'taggedSize', items.tagged_size,
        'unitPrice', items.unit_price,
        'quantity', items.quantity
      ) ORDER BY items.id)
      FROM shop_order_items AS items
      WHERE items.order_id = orders.id
    ), '[]'::jsonb),
    'contact', jsonb_build_object(
      'name', orders.contact_name,
      'email', orders.contact_email,
      'phone', orders.contact_phone
    ),
    'fulfillment', CASE orders.fulfillment_kind
      WHEN 'PICKUP' THEN jsonb_build_object('kind', 'PICKUP', 'optionId', 'pickup')
      ELSE jsonb_build_object(
        'kind', 'DELIVERY',
        'optionId', orders.delivery_option_id,
        'address', orders.delivery_address
      )
    END,
    'subtotal', orders.subtotal,
    'deliveryFee', orders.delivery_fee,
    'total', orders.total,
    'deliveryLabel', orders.delivery_label,
    'deliveryEstimate', orders.delivery_estimate,
    'savedAt', orders.saved_at,
    'reservationExpiresAt', orders.reservation_expires_at,
    'returnEligibleUntil', orders.return_eligible_until,
    'status', CASE
      WHEN orders.lifecycle_status IN ('CANCELLED', 'EXPIRED') THEN 'CANCELLED'
      WHEN orders.lifecycle_status = 'COMPLETED' THEN 'DELIVERED'
      WHEN orders.fulfillment_status = 'DELIVERED' THEN 'DELIVERED'
      WHEN orders.fulfillment_status = 'IN_TRANSIT' THEN 'IN_TRANSIT'
      WHEN orders.fulfillment_status = 'READY_FOR_HANDOFF' THEN 'READY_FOR_HANDOFF'
      WHEN orders.fulfillment_status = 'QUALITY_CHECK' THEN 'QUALITY_CHECK'
      WHEN orders.funds_confirmation_status = 'CONFIRMED' THEN 'ORDER_RECEIVED'
      ELSE 'PAYMENT_REQUIRED'
    END,
    'transmission', 'SUBMITTED',
    'lifecycleStatus', orders.lifecycle_status,
    'paymentReviewStatus', orders.payment_review_status,
    'fundsConfirmationStatus', orders.funds_confirmation_status,
    'fundsConfirmation', CASE WHEN orders.funds_confirmation_status = 'CONFIRMED'
      THEN jsonb_strip_nulls(jsonb_build_object(
        'transferReference', orders.funds_transfer_reference,
        'receivingAccountLabel', orders.funds_receiving_account_label,
        'confirmedAt', orders.funds_confirmed_at,
        'verifierSubject', CASE WHEN p_include_private THEN orders.funds_verifier_subject ELSE NULL END,
        'verifierDisplayName', orders.funds_verifier_display_name
      ))
      ELSE NULL
    END,
    'fulfillmentStatus', orders.fulfillment_status,
    'fulfillmentFacts', jsonb_build_object(
      'kind', orders.fulfillment_kind,
      'carrierName', orders.carrier_name,
      'trackingReference', orders.tracking_reference,
      'pickupAppointment', orders.pickup_appointment,
      'recipientName', orders.recipient_name,
      'dispatchReference', orders.dispatch_reference,
      'dispatchedAt', orders.dispatched_at,
      'deliveredAt', orders.delivered_at,
      'deliveryProofReference', orders.delivery_proof_reference
    ),
    'return', (
      SELECT jsonb_build_object(
        'id', returns.id,
        'status', returns.status,
        'reason', returns.reason,
        'detail', returns.detail,
        'requestedAt', returns.requested_at,
        'eligibleUntil', returns.eligible_until,
        'approvedAt', returns.approved_at,
        'rejectedAt', returns.rejected_at,
        'receivedAt', returns.received_at,
        'resolvedAt', returns.resolved_at,
        'resolutionNote', returns.resolution_note,
        'refundStatus', returns.refund_status,
        'refundReference', returns.refund_reference,
        'refundAmount', returns.refund_amount,
        'refundCurrency', returns.refund_currency,
        'refundUpdatedAt', returns.refund_updated_at,
        'disposition', returns.disposition
      )
      FROM shop_order_returns AS returns
      WHERE returns.order_id = orders.id
    ),
    'version', orders.version,
    'evidence', COALESCE((
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', evidence.id,
          'status', evidence.status,
          'originalFileName', evidence.original_file_name,
          'contentType', evidence.content_type,
          'byteSize', evidence.byte_size,
          'sha256', evidence.sha256,
          'authorizedAt', evidence.authorized_at,
          'expiresAt', evidence.expires_at,
          'receivedAt', evidence.received_at,
          'notice', CASE WHEN evidence.received_at IS NULL
            THEN 'Payment evidence is authorized for private upload and has not been received.'
            ELSE 'Payment evidence received for review. This does not prove bank payment.'
          END,
          'blobPathname', CASE WHEN p_include_private THEN evidence.blob_pathname ELSE NULL END
        )) ORDER BY evidence.authorized_at
      )
      FROM shop_payment_evidence AS evidence
      WHERE evidence.order_id = orders.id
    ), '[]'::jsonb),
    'events', COALESCE((
      SELECT jsonb_agg(
        jsonb_strip_nulls(jsonb_build_object(
          'id', events.id,
          'eventType', events.event_type,
          'actorKind', events.actor_kind,
          'actorSubject', CASE WHEN p_include_private THEN events.actor_subject ELSE NULL END,
          'visibility', events.visibility,
          'lifecycleStatus', events.lifecycle_status,
          'paymentReviewStatus', events.payment_review_status,
          'fundsConfirmationStatus', events.funds_confirmation_status,
          'fulfillmentStatus', events.fulfillment_status,
          'note', events.note,
          'metadata', events.metadata,
          'occurredAt', events.occurred_at
        )) ORDER BY events.occurred_at, events.id
      )
      FROM shop_order_events AS events
      WHERE events.order_id = orders.id
        AND (p_include_private OR events.visibility = 'CUSTOMER')
    ), '[]'::jsonb),
    'allowedTransitions', CASE WHEN p_include_private
      THEN shop_allowed_transitions_v2(orders.id, now())
      ELSE '[]'::jsonb
    END,
    'allowedReturnTransitions', CASE WHEN p_include_private
      THEN shop_allowed_return_transitions_v2(orders.id)
      ELSE '[]'::jsonb
    END,
    'canRequestReturn', (
      NOT p_include_private
      AND orders.lifecycle_status = 'COMPLETED'
      AND orders.fulfillment_status = 'DELIVERED'
      AND orders.return_eligible_until >= now()
      AND NOT EXISTS (
        SELECT 1 FROM shop_order_returns AS returns WHERE returns.order_id = orders.id
      )
    )
  )
  FROM shop_orders AS orders
  WHERE orders.id = p_order_id
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_enqueue_notification_v2"(
  "p_order_id" uuid,
  "p_customer_id" uuid,
  "p_topic" text,
  "p_dedupe_key" text,
  "p_payload" jsonb,
  "p_now" timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_topic IS NULL OR length(trim(p_topic)) = 0
    OR p_dedupe_key IS NULL OR length(trim(p_dedupe_key)) = 0
    OR jsonb_typeof(p_payload) IS DISTINCT FROM 'object'
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid notification payload';
  END IF;

  INSERT INTO shop_notification_outbox (
    order_id, customer_id, topic, dedupe_key, payload, available_at, created_at
  ) VALUES (
    p_order_id, p_customer_id, p_topic, p_dedupe_key, p_payload, p_now, p_now
  ) ON CONFLICT (dedupe_key) DO NOTHING;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_release_order_inventory_v2"("p_order_id" uuid, "p_now" timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_count integer;
  changed_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM shop_order_items
  WHERE order_id = p_order_id;

  UPDATE shop_inventory AS inventory
  SET availability = 'AVAILABLE', reserved = 0, updated_at = p_now
  WHERE inventory.sku IN (
    SELECT items.sku FROM shop_order_items AS items WHERE items.order_id = p_order_id
  )
    AND inventory.availability = 'RESERVED'
    AND inventory.on_hand = 1
    AND inventory.reserved = 1;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  IF expected_count = 0 OR changed_count <> expected_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: reservation release mismatch';
  END IF;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_sell_order_inventory_v2"("p_order_id" uuid, "p_now" timestamptz)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_count integer;
  changed_count integer;
BEGIN
  SELECT count(*) INTO expected_count
  FROM shop_order_items
  WHERE order_id = p_order_id;

  UPDATE shop_inventory AS inventory
  SET
    availability = 'SOLD',
    on_hand = 0,
    reserved = 0,
    sold = sold + 1,
    updated_at = p_now
  WHERE inventory.sku IN (
    SELECT items.sku FROM shop_order_items AS items WHERE items.order_id = p_order_id
  )
    AND inventory.availability = 'RESERVED'
    AND inventory.on_hand = 1
    AND inventory.reserved = 1;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  IF expected_count = 0 OR changed_count <> expected_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: sale conversion mismatch';
  END IF;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_create_order_v2"(
  "p_auth_subject" text,
  "p_actor_email" text,
  "p_actor_display_name" text,
  "p_idempotency_key" text,
  "p_request_fingerprint" text,
  "p_lines" jsonb,
  "p_contact" jsonb,
  "p_fulfillment" jsonb,
  "p_now" timestamptz,
  "p_reservation_expires_at" timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  customer_id_value uuid;
  order_id_value uuid;
  existing_order_id uuid;
  existing_fingerprint text;
  order_reference text;
  line_count integer;
  matched_count integer := 0;
  changed_count integer;
  subtotal_value integer := 0;
  delivery_fee_value integer;
  delivery_label_value text;
  delivery_estimate_value text;
  fulfillment_kind_value shop_fulfillment_kind;
  delivery_address_value jsonb;
  item_record record;
BEGIN
  IF p_auth_subject IS NULL OR length(trim(p_auth_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR jsonb_typeof(p_lines) IS DISTINCT FROM 'array'
    OR jsonb_typeof(p_contact) IS DISTINCT FROM 'object'
    OR jsonb_typeof(p_fulfillment) IS DISTINCT FROM 'object'
    OR p_reservation_expires_at <= p_now
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid checkout envelope';
  END IF;

  line_count := jsonb_array_length(p_lines);
  IF line_count NOT BETWEEN 1 AND 10
    OR (SELECT count(DISTINCT line->>'slug') FROM jsonb_array_elements(p_lines) AS line) <> line_count
    OR EXISTS (
      SELECT 1 FROM jsonb_array_elements(p_lines) AS line
      WHERE line->>'slug' !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
        OR length(line->>'slug') > 160
        OR length(trim(line->>'taggedSize')) NOT BETWEEN 1 AND 60
        OR line->>'quantity' <> '1'
    )
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid checkout lines';
  END IF;

  IF length(trim(p_contact->>'name')) NOT BETWEEN 2 AND 100
    OR length(trim(p_contact->>'email')) NOT BETWEEN 3 AND 320
    OR position('@' in p_contact->>'email') < 2
    OR length(trim(p_contact->>'phone')) NOT BETWEEN 7 AND 30
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid checkout contact';
  END IF;

  IF p_fulfillment->>'kind' = 'PICKUP' AND p_fulfillment->>'optionId' = 'pickup' THEN
    fulfillment_kind_value := 'PICKUP';
    delivery_fee_value := 0;
    delivery_label_value := 'Studio pickup';
    delivery_estimate_value := 'After payment';
    delivery_address_value := NULL;
  ELSIF p_fulfillment->>'kind' = 'DELIVERY'
    AND p_fulfillment->>'optionId' IN ('lagos', 'nationwide')
    AND p_fulfillment->'address'->>'country' = 'Nigeria'
    AND length(trim(p_fulfillment->'address'->>'street')) BETWEEN 1 AND 180
    AND length(trim(p_fulfillment->'address'->>'area')) BETWEEN 1 AND 100
    AND length(trim(p_fulfillment->'address'->>'state')) BETWEEN 1 AND 100
  THEN
    fulfillment_kind_value := 'DELIVERY';
    delivery_address_value := p_fulfillment->'address';
    IF p_fulfillment->>'optionId' = 'lagos' THEN
      delivery_fee_value := 2500;
      delivery_label_value := 'Lagos delivery';
      delivery_estimate_value := '1–3 working days';
    ELSE
      delivery_fee_value := 4500;
      delivery_label_value := 'Nationwide delivery';
      delivery_estimate_value := '3–7 working days';
    END IF;
  ELSE
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid fulfillment selection';
  END IF;

  INSERT INTO shop_customers (
    auth_subject, email, phone, display_name, created_at, updated_at
  ) VALUES (
    trim(p_auth_subject),
    lower(COALESCE(NULLIF(trim(p_actor_email), ''), trim(p_contact->>'email'))),
    trim(p_contact->>'phone'),
    COALESCE(NULLIF(trim(p_actor_display_name), ''), trim(p_contact->>'name')),
    p_now,
    p_now
  ) ON CONFLICT (auth_subject) DO UPDATE SET
    email = EXCLUDED.email,
    phone = EXCLUDED.phone,
    display_name = EXCLUDED.display_name,
    updated_at = EXCLUDED.updated_at;

  SELECT customers.id INTO customer_id_value
  FROM shop_customers AS customers
  WHERE customers.auth_subject = trim(p_auth_subject)
  FOR UPDATE;

  SELECT orders.id, orders.request_fingerprint
  INTO existing_order_id, existing_fingerprint
  FROM shop_orders AS orders
  WHERE orders.customer_id = customer_id_value
    AND orders.idempotency_key = p_idempotency_key;

  IF existing_order_id IS NOT NULL THEN
    IF existing_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: checkout request differs';
    END IF;
    RETURN shop_order_document_v2(existing_order_id, false);
  END IF;

  FOR item_record IN
    SELECT
      catalogue.sku,
      catalogue.slug,
      catalogue.name,
      catalogue.tagged_size,
      catalogue.price,
      inventory.availability,
      inventory.on_hand,
      inventory.reserved,
      line->>'taggedSize' AS requested_size
    FROM jsonb_array_elements(p_lines) AS line
    INNER JOIN shop_catalogue_items AS catalogue ON catalogue.slug = line->>'slug'
    INNER JOIN shop_inventory AS inventory ON inventory.sku = catalogue.sku
    ORDER BY catalogue.sku
    FOR UPDATE OF catalogue, inventory
  LOOP
    matched_count := matched_count + 1;
    IF item_record.requested_size IS DISTINCT FROM item_record.tagged_size
      OR item_record.availability IS DISTINCT FROM 'AVAILABLE'
      OR item_record.on_hand <> 1
      OR item_record.reserved <> 0
    THEN
      RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: piece changed or unavailable';
    END IF;
    subtotal_value := subtotal_value + item_record.price;
  END LOOP;

  IF matched_count <> line_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: catalogue line mismatch';
  END IF;

  order_id_value := gen_random_uuid();
  order_reference := 'JUW-' || to_char(p_now AT TIME ZONE 'UTC', 'YYYYMMDD') || '-'
    || upper(substr(replace(order_id_value::text, '-', ''), 1, 10));

  INSERT INTO shop_orders (
    id, reference, idempotency_key, customer_id, status,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    request_fingerprint, version, transmission,
    contact_name, contact_email, contact_phone,
    fulfillment_kind, delivery_option_id, delivery_address,
    currency, subtotal, delivery_fee, total, delivery_label, delivery_estimate,
    saved_at, reservation_expires_at, updated_at
  ) VALUES (
    order_id_value, order_reference, p_idempotency_key, customer_id_value, 'PAYMENT_REQUIRED',
    'ACTIVE', 'AWAITING_EVIDENCE', 'UNCONFIRMED', 'NOT_STARTED',
    p_request_fingerprint, 0, 'SUBMITTED',
    trim(p_contact->>'name'), lower(trim(p_contact->>'email')), trim(p_contact->>'phone'),
    fulfillment_kind_value, p_fulfillment->>'optionId', delivery_address_value,
    'NGN', subtotal_value, delivery_fee_value, subtotal_value + delivery_fee_value,
    delivery_label_value, delivery_estimate_value,
    p_now, p_reservation_expires_at, p_now
  );

  UPDATE shop_inventory AS inventory
  SET availability = 'RESERVED', reserved = 1, updated_at = p_now
  WHERE inventory.sku IN (
    SELECT catalogue.sku
    FROM jsonb_array_elements(p_lines) AS line
    INNER JOIN shop_catalogue_items AS catalogue ON catalogue.slug = line->>'slug'
  )
    AND inventory.availability = 'AVAILABLE'
    AND inventory.on_hand = 1
    AND inventory.reserved = 0;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> line_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: reservation update mismatch';
  END IF;

  INSERT INTO shop_order_items (
    order_id, product_slug, sku, product_name, tagged_size,
    unit_price, quantity, line_total
  )
  SELECT
    order_id_value,
    catalogue.slug,
    catalogue.sku,
    catalogue.name,
    catalogue.tagged_size,
    catalogue.price,
    1,
    catalogue.price
  FROM jsonb_array_elements(p_lines) AS line
  INNER JOIN shop_catalogue_items AS catalogue ON catalogue.slug = line->>'slug';
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF changed_count <> line_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: item snapshot mismatch';
  END IF;

  INSERT INTO shop_order_events (
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_id_value, 'ORDER_CREATED', 'CUSTOMER', trim(p_auth_subject), 'CUSTOMER',
    'ACTIVE', 'AWAITING_EVIDENCE', 'UNCONFIRMED', 'NOT_STARTED',
    'Order received; payment evidence has not been received.',
    jsonb_build_object('reservationExpiresAt', p_reservation_expires_at),
    p_now
  );

  PERFORM shop_enqueue_notification_v2(
    order_id_value,
    customer_id_value,
    'ORDER_CREATED',
    'order:' || order_id_value::text || ':created',
    jsonb_build_object('orderReference', order_reference, 'lifecycleStatus', 'ACTIVE'),
    p_now
  );

  RETURN shop_order_document_v2(order_id_value, false);
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_transition_order_v2"(
  "p_reference" text,
  "p_actor_subject" text,
  "p_actor_display_name" text,
  "p_expected_version" integer,
  "p_dimension" text,
  "p_target" text,
  "p_details" jsonb,
  "p_note" text,
  "p_return_eligible_until" timestamptz,
  "p_now" timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  event_type_value text;
  event_note_value text;
  legacy_status_value shop_order_status;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_actor_display_name IS NULL OR length(trim(p_actor_display_name)) NOT BETWEEN 1 AND 120
    OR p_expected_version < 0
    OR (p_note IS NOT NULL AND length(p_note) > 500)
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid transition command';
  END IF;

  SELECT orders.* INTO order_record
  FROM shop_orders AS orders
  WHERE orders.reference = p_reference
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: transition';
  END IF;
  IF order_record.lifecycle_status <> 'ACTIVE' THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: inactive order';
  END IF;
  IF NOT shop_allowed_transitions_v2(order_record.id, p_now) @> jsonb_build_array(
    jsonb_build_object('dimension', p_dimension, 'target', p_target)
  ) THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: transition is not currently allowed';
  END IF;

  IF p_dimension = 'PAYMENT_REVIEW' THEN
    event_type_value := 'PAYMENT_' || p_target;
    event_note_value := CASE
      WHEN p_target = 'UNDER_REVIEW'
        THEN 'Payment evidence is under review. This does not prove bank payment.'
      ELSE 'Payment evidence reviewed. This review does not independently prove bank payment.'
    END || CASE WHEN p_note IS NULL THEN '' ELSE ' ' || p_note END;
    legacy_status_value := 'PAYMENT_REQUIRED';

    UPDATE shop_orders
    SET
      payment_review_status = p_target::shop_payment_review_status,
      status = legacy_status_value,
      version = version + 1,
      updated_at = p_now
    WHERE id = order_record.id;

    INSERT INTO shop_order_events (
      order_id, event_type, actor_kind, actor_subject, visibility,
      lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
      note, metadata, occurred_at
    ) VALUES (
      order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
      order_record.lifecycle_status, p_target::shop_payment_review_status,
      order_record.funds_confirmation_status, order_record.fulfillment_status,
      event_note_value, jsonb_build_object('previous', order_record.payment_review_status), p_now
    );
  ELSIF p_dimension = 'FUNDS_CONFIRMATION' THEN
    IF jsonb_typeof(p_details) IS DISTINCT FROM 'object'
      OR p_details->>'kind' <> 'FUNDS_CONFIRMATION'
      OR length(trim(p_details->>'transferReference')) NOT BETWEEN 4 AND 120
      OR length(trim(p_details->>'receivingAccountLabel')) NOT BETWEEN 3 AND 120
    THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: settlement audit details are required';
    END IF;
    event_type_value := 'FUNDS_CONFIRMATION_CONFIRMED';
    event_note_value := 'Payment confirmed against ' || trim(p_details->>'receivingAccountLabel')
      || '; transfer reference ' || trim(p_details->>'transferReference') || '.'
      || CASE WHEN p_note IS NULL THEN '' ELSE ' ' || p_note END;

    UPDATE shop_orders
    SET
      funds_confirmation_status = 'CONFIRMED',
      funds_transfer_reference = trim(p_details->>'transferReference'),
      funds_receiving_account_label = trim(p_details->>'receivingAccountLabel'),
      funds_confirmed_at = p_now,
      funds_verifier_subject = trim(p_actor_subject),
      funds_verifier_display_name = trim(p_actor_display_name),
      status = 'ORDER_RECEIVED',
      version = version + 1,
      updated_at = p_now
    WHERE id = order_record.id;

    INSERT INTO shop_order_events (
      order_id, event_type, actor_kind, actor_subject, visibility,
      lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
      note, metadata, occurred_at
    ) VALUES (
      order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
      order_record.lifecycle_status, order_record.payment_review_status,
      'CONFIRMED', order_record.fulfillment_status,
      event_note_value,
      jsonb_build_object(
        'previous', order_record.funds_confirmation_status,
        'transferReference', trim(p_details->>'transferReference'),
        'receivingAccountLabel', trim(p_details->>'receivingAccountLabel')
      ),
      p_now
    );
  ELSIF p_dimension = 'FULFILLMENT' THEN
    event_type_value := 'FULFILLMENT_' || p_target;
    legacy_status_value := p_target::shop_order_status;

    IF p_target = 'IN_TRANSIT' AND (
      order_record.fulfillment_kind <> 'DELIVERY'
      OR jsonb_typeof(p_details) IS DISTINCT FROM 'object'
      OR p_details->>'kind' <> 'DELIVERY_DISPATCH'
      OR length(trim(p_details->>'carrierName')) NOT BETWEEN 2 AND 120
      OR length(trim(p_details->>'trackingReference')) NOT BETWEEN 3 AND 120
      OR length(trim(p_details->>'dispatchReference')) NOT BETWEEN 3 AND 120
      OR p_details->>'dispatchedAt' IS NULL
    ) THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: delivery dispatch facts are required';
    END IF;
    IF p_target = 'DELIVERED' THEN
      IF p_details->>'deliveredAt' IS NULL
        OR (p_details->>'deliveredAt')::timestamptz > p_now
        OR p_return_eligible_until IS NULL
        OR p_return_eligible_until <= (p_details->>'deliveredAt')::timestamptz
      THEN
        RAISE EXCEPTION 'SHOP_INVALID_REQUEST: return eligibility window is invalid';
      END IF;
      IF order_record.fulfillment_kind = 'DELIVERY' AND (
        jsonb_typeof(p_details) IS DISTINCT FROM 'object'
        OR p_details->>'kind' <> 'DELIVERY_COMPLETE'
        OR length(trim(p_details->>'recipientName')) NOT BETWEEN 2 AND 120
        OR length(trim(p_details->>'deliveryProofReference')) NOT BETWEEN 3 AND 160
        OR p_details->>'deliveredAt' IS NULL
      ) THEN
        RAISE EXCEPTION 'SHOP_INVALID_REQUEST: delivery completion facts are required';
      ELSIF order_record.fulfillment_kind = 'PICKUP' AND (
        jsonb_typeof(p_details) IS DISTINCT FROM 'object'
        OR p_details->>'kind' <> 'PICKUP_COMPLETE'
        OR p_details->>'pickupAppointment' IS NULL
        OR length(trim(p_details->>'recipientName')) NOT BETWEEN 2 AND 120
        OR length(trim(p_details->>'deliveryProofReference')) NOT BETWEEN 3 AND 160
        OR p_details->>'deliveredAt' IS NULL
      ) THEN
        RAISE EXCEPTION 'SHOP_INVALID_REQUEST: pickup completion facts are required';
      END IF;
      PERFORM shop_sell_order_inventory_v2(order_record.id, p_now);
    END IF;

    UPDATE shop_orders
    SET
      fulfillment_status = p_target::shop_fulfillment_status,
      carrier_name = CASE WHEN p_target = 'IN_TRANSIT'
        THEN trim(p_details->>'carrierName') ELSE carrier_name END,
      tracking_reference = CASE WHEN p_target = 'IN_TRANSIT'
        THEN trim(p_details->>'trackingReference') ELSE tracking_reference END,
      dispatch_reference = CASE WHEN p_target = 'IN_TRANSIT'
        THEN trim(p_details->>'dispatchReference') ELSE dispatch_reference END,
      dispatched_at = CASE WHEN p_target = 'IN_TRANSIT'
        THEN (p_details->>'dispatchedAt')::timestamptz ELSE dispatched_at END,
      pickup_appointment = CASE WHEN p_target = 'DELIVERED' AND fulfillment_kind = 'PICKUP'
        THEN (p_details->>'pickupAppointment')::timestamptz ELSE pickup_appointment END,
      recipient_name = CASE WHEN p_target = 'DELIVERED'
        THEN trim(p_details->>'recipientName') ELSE recipient_name END,
      delivered_at = CASE WHEN p_target = 'DELIVERED'
        THEN (p_details->>'deliveredAt')::timestamptz ELSE delivered_at END,
      delivery_proof_reference = CASE WHEN p_target = 'DELIVERED'
        THEN trim(p_details->>'deliveryProofReference') ELSE delivery_proof_reference END,
      lifecycle_status = CASE WHEN p_target = 'DELIVERED'
        THEN 'COMPLETED'::shop_order_lifecycle_status ELSE lifecycle_status END,
      status = legacy_status_value,
      completed_at = CASE WHEN p_target = 'DELIVERED' THEN p_now ELSE completed_at END,
      return_eligible_until = CASE WHEN p_target = 'DELIVERED'
        THEN p_return_eligible_until ELSE return_eligible_until END,
      version = version + 1,
      updated_at = p_now
    WHERE id = order_record.id;

    INSERT INTO shop_order_events (
      order_id, event_type, actor_kind, actor_subject, visibility,
      lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
      note, metadata, occurred_at
    ) VALUES (
      order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
      CASE WHEN p_target = 'DELIVERED' THEN 'COMPLETED'::shop_order_lifecycle_status
        ELSE order_record.lifecycle_status END,
      order_record.payment_review_status, order_record.funds_confirmation_status,
      p_target::shop_fulfillment_status,
      COALESCE(p_note, CASE
        WHEN p_target = 'IN_TRANSIT' THEN 'Dispatched with ' || trim(p_details->>'carrierName')
          || '; tracking ' || trim(p_details->>'trackingReference') || '.'
        WHEN p_target = 'DELIVERED' AND order_record.fulfillment_kind = 'PICKUP'
          THEN 'Collected from the Studio by ' || trim(p_details->>'recipientName')
            || '; handoff ' || trim(p_details->>'deliveryProofReference') || '.'
        WHEN p_target = 'DELIVERED' THEN 'Delivered to ' || trim(p_details->>'recipientName')
          || '; proof ' || trim(p_details->>'deliveryProofReference') || '.'
        ELSE NULL
      END),
      jsonb_strip_nulls(jsonb_build_object(
        'previous', order_record.fulfillment_status,
        'carrierName', p_details->>'carrierName',
        'trackingReference', p_details->>'trackingReference',
        'dispatchReference', p_details->>'dispatchReference',
        'dispatchedAt', p_details->>'dispatchedAt',
        'pickupAppointment', p_details->>'pickupAppointment',
        'recipientName', p_details->>'recipientName',
        'deliveredAt', p_details->>'deliveredAt',
        'deliveryProofReference', p_details->>'deliveryProofReference',
        'returnEligibleUntil', p_return_eligible_until
      )),
      p_now
    );
  ELSIF p_dimension = 'LIFECYCLE' THEN
    IF p_target = 'CANCELLED' AND p_note IS NULL THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: cancellation reason is required';
    END IF;
    PERFORM shop_release_order_inventory_v2(order_record.id, p_now);
    event_type_value := 'LIFECYCLE_' || p_target;
    event_note_value := CASE WHEN p_target = 'EXPIRED'
      THEN 'The reservation expired and the pieces were released.' ELSE p_note END;

    UPDATE shop_orders
    SET
      lifecycle_status = p_target::shop_order_lifecycle_status,
      status = 'CANCELLED',
      cancelled_at = CASE WHEN p_target = 'CANCELLED' THEN p_now ELSE NULL END,
      expired_at = CASE WHEN p_target = 'EXPIRED' THEN p_now ELSE NULL END,
      version = version + 1,
      updated_at = p_now
    WHERE id = order_record.id;

    INSERT INTO shop_order_events (
      order_id, event_type, actor_kind, actor_subject, visibility,
      lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
      note, metadata, occurred_at
    ) VALUES (
      order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
      p_target::shop_order_lifecycle_status,
      order_record.payment_review_status, order_record.funds_confirmation_status,
      order_record.fulfillment_status,
      event_note_value,
      jsonb_build_object('previous', order_record.lifecycle_status, 'releasedInventory', true),
      p_now
    );
  ELSE
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: unknown transition dimension';
  END IF;

  PERFORM shop_enqueue_notification_v2(
    order_record.id,
    order_record.customer_id,
    event_type_value,
    'order:' || order_record.id::text || ':' || lower(p_dimension) || ':'
      || (order_record.version + 1)::text || ':' || lower(p_target),
    jsonb_build_object(
      'orderReference', order_record.reference,
      'dimension', p_dimension,
      'target', p_target
    ),
    p_now
  );

  RETURN shop_order_document_v2(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_resolve_return_inventory_v2"(
  "p_order_id" uuid,
  "p_disposition" shop_return_disposition,
  "p_now" timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  expected_count integer;
  changed_count integer;
  inventory_record record;
BEGIN
  SELECT count(*) INTO expected_count FROM shop_order_items WHERE order_id = p_order_id;
  FOR inventory_record IN
    SELECT inventory.*
    FROM shop_inventory AS inventory
    INNER JOIN shop_order_items AS items ON items.sku = inventory.sku
    WHERE items.order_id = p_order_id
    ORDER BY inventory.sku
    FOR UPDATE OF inventory
  LOOP
    IF inventory_record.availability <> 'SOLD'
      OR inventory_record.on_hand <> 0
      OR inventory_record.reserved <> 0
      OR inventory_record.sold - inventory_record.returned <> 1
    THEN
      RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: sold return inventory mismatch';
    END IF;
  END LOOP;

  UPDATE shop_inventory AS inventory
  SET
    availability = CASE p_disposition
      WHEN 'RESTOCK' THEN 'AVAILABLE'::shop_catalogue_availability
      ELSE 'ARCHIVED'::shop_catalogue_availability
    END,
    on_hand = CASE p_disposition WHEN 'RESTOCK' THEN 1 ELSE 0 END,
    returned = returned + 1,
    write_off = write_off + CASE p_disposition WHEN 'WRITE_OFF' THEN 1 ELSE 0 END,
    updated_at = p_now
  WHERE inventory.sku IN (
    SELECT items.sku FROM shop_order_items AS items WHERE items.order_id = p_order_id
  )
    AND inventory.availability = 'SOLD'
    AND inventory.on_hand = 0
    AND inventory.reserved = 0
    AND inventory.sold - inventory.returned = 1;
  GET DIAGNOSTICS changed_count = ROW_COUNT;
  IF expected_count = 0 OR changed_count <> expected_count THEN
    RAISE EXCEPTION 'SHOP_INVENTORY_UNAVAILABLE: returned inventory update mismatch';
  END IF;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_request_return_v2"(
  "p_reference" text,
  "p_auth_subject" text,
  "p_idempotency_key" text,
  "p_request_fingerprint" text,
  "p_reason" text,
  "p_detail" text,
  "p_now" timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  return_record record;
  return_id_value uuid;
BEGIN
  IF p_auth_subject IS NULL OR length(trim(p_auth_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_reason NOT IN ('WRONG_SIZE', 'NOT_AS_DESCRIBED', 'DAMAGED', 'CHANGED_MIND', 'OTHER')
    OR length(trim(p_detail)) NOT BETWEEN 10 AND 500
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid return request';
  END IF;

  SELECT orders.*, customers.auth_subject INTO order_record
  FROM shop_orders AS orders
  INNER JOIN shop_customers AS customers ON customers.id = orders.customer_id
  WHERE orders.reference = p_reference
  FOR UPDATE OF orders;

  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.auth_subject IS DISTINCT FROM trim(p_auth_subject) THEN
    RAISE EXCEPTION 'SHOP_FORBIDDEN: order ownership';
  END IF;

  SELECT returns.* INTO return_record
  FROM shop_order_returns AS returns
  WHERE returns.order_id = order_record.id;
  IF FOUND THEN
    IF return_record.idempotency_key = p_idempotency_key
      AND return_record.request_fingerprint = p_request_fingerprint
    THEN
      RETURN shop_order_document_v2(order_record.id, false);
    ELSIF return_record.idempotency_key = p_idempotency_key THEN
      RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: return request differs';
    END IF;
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: order already has a return request';
  END IF;

  IF order_record.lifecycle_status <> 'COMPLETED'
    OR order_record.fulfillment_status <> 'DELIVERED'
    OR order_record.funds_confirmation_status <> 'CONFIRMED'
    OR order_record.return_eligible_until IS NULL
    OR order_record.return_eligible_until < p_now
  THEN
    RAISE EXCEPTION 'SHOP_RETURN_WINDOW_CLOSED: order is not eligible for return';
  END IF;

  return_id_value := gen_random_uuid();
  INSERT INTO shop_order_returns (
    id, order_id, customer_id, idempotency_key, request_fingerprint,
    status, reason, detail, requested_at, eligible_until
  ) VALUES (
    return_id_value, order_record.id, order_record.customer_id, p_idempotency_key,
    p_request_fingerprint, 'REQUESTED', p_reason::shop_return_reason, trim(p_detail),
    p_now, order_record.return_eligible_until
  );

  UPDATE shop_orders SET version = version + 1, updated_at = p_now WHERE id = order_record.id;
  INSERT INTO shop_order_events (
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, 'RETURN_REQUESTED', 'CUSTOMER', trim(p_auth_subject), 'CUSTOMER',
    order_record.lifecycle_status, order_record.payment_review_status,
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    'Return requested. Lulu will review eligibility and next steps.',
    jsonb_build_object('returnId', return_id_value, 'reason', p_reason),
    p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, 'RETURN_REQUESTED',
    'order:' || order_record.id::text || ':return:requested',
    jsonb_build_object('orderReference', order_record.reference, 'returnId', return_id_value, 'reason', p_reason),
    p_now
  );
  RETURN shop_order_document_v2(order_record.id, false);
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_transition_return_v2"(
  "p_reference" text,
  "p_actor_subject" text,
  "p_expected_version" integer,
  "p_dimension" text,
  "p_target" text,
  "p_refund_reference" text,
  "p_refund_amount" integer,
  "p_refund_currency" text,
  "p_note" text,
  "p_now" timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  return_record record;
  event_type_value text;
  event_note_value text;
BEGIN
  IF p_actor_subject IS NULL OR length(trim(p_actor_subject)) NOT BETWEEN 1 AND 255
    OR p_expected_version < 0
    OR (p_note IS NOT NULL AND length(p_note) > 500)
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid return transition';
  END IF;

  SELECT orders.* INTO order_record
  FROM shop_orders AS orders
  WHERE orders.reference = p_reference
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.version <> p_expected_version THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: return transition';
  END IF;

  SELECT returns.* INTO return_record
  FROM shop_order_returns AS returns
  WHERE returns.order_id = order_record.id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: return'; END IF;
  IF NOT shop_allowed_return_transitions_v2(order_record.id) @> jsonb_build_array(
    jsonb_build_object('dimension', p_dimension, 'target', p_target)
  ) THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: return transition is not currently allowed';
  END IF;

  IF p_dimension = 'RETURN' THEN
    IF p_target = 'REJECTED' AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: rejection reason is required';
    END IF;
    UPDATE shop_order_returns
    SET
      status = p_target::shop_return_status,
      approved_at = CASE WHEN p_target = 'APPROVED' THEN p_now ELSE approved_at END,
      rejected_at = CASE WHEN p_target = 'REJECTED' THEN p_now ELSE rejected_at END,
      received_at = CASE WHEN p_target = 'RECEIVED' THEN p_now ELSE received_at END
    WHERE id = return_record.id;
    event_type_value := 'RETURN_' || p_target;
    event_note_value := COALESCE(p_note, CASE p_target
      WHEN 'APPROVED' THEN 'Return approved. Arrange the Studio handoff before sending the piece.'
      WHEN 'RECEIVED' THEN 'Returned piece received by the Studio.'
      ELSE NULL
    END);
  ELSIF p_dimension = 'REFUND' THEN
    IF p_target = 'COMPLETED' AND (
      p_refund_reference IS NULL OR length(trim(p_refund_reference)) NOT BETWEEN 4 AND 160
      OR p_refund_amount IS NULL OR p_refund_amount <= 0 OR p_refund_amount > order_record.total
      OR p_refund_currency <> order_record.currency
    ) THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: exact refund audit is required';
    END IF;
    IF p_target <> 'COMPLETED' AND (
      p_refund_amount IS NOT NULL OR p_refund_currency IS NOT NULL
    ) THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: refund amount applies only to completion';
    END IF;
    IF p_target = 'FAILED' AND (p_note IS NULL OR length(trim(p_note)) = 0) THEN
      RAISE EXCEPTION 'SHOP_INVALID_REQUEST: failed refund reason is required';
    END IF;
    UPDATE shop_order_returns
    SET
      refund_status = p_target::shop_refund_status,
      refund_reference = CASE WHEN p_target = 'COMPLETED' THEN trim(p_refund_reference) ELSE refund_reference END,
      refund_amount = CASE WHEN p_target = 'COMPLETED' THEN p_refund_amount ELSE refund_amount END,
      refund_currency = CASE WHEN p_target = 'COMPLETED' THEN p_refund_currency ELSE refund_currency END,
      refund_updated_at = p_now
    WHERE id = return_record.id;
    event_type_value := 'REFUND_' || p_target;
    event_note_value := COALESCE(p_note, CASE p_target
      WHEN 'PENDING' THEN 'Refund is being prepared.'
      WHEN 'COMPLETED' THEN 'Refund of ' || p_refund_currency || ' ' || p_refund_amount::text
        || ' completed; reference ' || trim(p_refund_reference) || '.'
      ELSE NULL
    END);
  ELSIF p_dimension = 'RETURN_RESOLUTION' THEN
    PERFORM shop_resolve_return_inventory_v2(
      order_record.id,
      p_target::shop_return_disposition,
      p_now
    );
    UPDATE shop_order_returns
    SET
      status = 'RESOLVED',
      resolved_at = p_now,
      resolution_note = p_note,
      disposition = p_target::shop_return_disposition
    WHERE id = return_record.id;
    event_type_value := 'RETURN_RESOLVED_' || p_target;
    event_note_value := COALESCE(p_note, CASE p_target
      WHEN 'RESTOCK' THEN 'Return resolved and the piece is available again.'
      ELSE 'Return resolved and the piece was written off.'
    END);
  ELSE
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: unknown return transition dimension';
  END IF;

  UPDATE shop_orders SET version = version + 1, updated_at = p_now WHERE id = order_record.id;
  INSERT INTO shop_order_events (
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, event_type_value, 'OPERATOR', trim(p_actor_subject), 'CUSTOMER',
    order_record.lifecycle_status, order_record.payment_review_status,
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    event_note_value,
    jsonb_strip_nulls(jsonb_build_object(
      'returnId', return_record.id,
      'returnStatus', CASE
        WHEN p_dimension = 'RETURN' THEN p_target
        WHEN p_dimension = 'RETURN_RESOLUTION' THEN 'RESOLVED'
        ELSE return_record.status::text
      END,
      'refundStatus', CASE WHEN p_dimension = 'REFUND' THEN p_target ELSE return_record.refund_status::text END,
      'refundReference', CASE WHEN p_target = 'COMPLETED' THEN trim(p_refund_reference) ELSE NULL END,
      'refundAmount', CASE WHEN p_target = 'COMPLETED' THEN p_refund_amount ELSE NULL END,
      'refundCurrency', CASE WHEN p_target = 'COMPLETED' THEN p_refund_currency ELSE NULL END,
      'disposition', CASE WHEN p_dimension = 'RETURN_RESOLUTION' THEN p_target ELSE NULL END
    )),
    p_now
  );
  PERFORM shop_enqueue_notification_v2(
    order_record.id, order_record.customer_id, event_type_value,
    'order:' || order_record.id::text || ':return:' || (order_record.version + 1)::text
      || ':' || lower(event_type_value),
    jsonb_build_object('orderReference', order_record.reference, 'returnId', return_record.id, 'eventType', event_type_value),
    p_now
  );
  RETURN shop_order_document_v2(order_record.id, true);
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_authorize_payment_evidence_v2"(
  "p_reference" text,
  "p_auth_subject" text,
  "p_idempotency_key" text,
  "p_request_fingerprint" text,
  "p_original_file_name" text,
  "p_content_type" text,
  "p_byte_size" integer,
  "p_sha256" text,
  "p_now" timestamptz,
  "p_expires_at" timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  existing_record record;
  evidence_id_value uuid;
BEGIN
  IF p_auth_subject IS NULL OR length(trim(p_auth_subject)) NOT BETWEEN 1 AND 255
    OR p_idempotency_key !~ '^[A-Za-z0-9][A-Za-z0-9:._-]{7,159}$'
    OR p_request_fingerprint !~ '^[0-9a-f]{64}$'
    OR p_original_file_name IS NULL OR length(p_original_file_name) NOT BETWEEN 1 AND 180
    OR p_original_file_name ~ '[/\\]'
    OR p_content_type NOT IN ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
    OR p_byte_size NOT BETWEEN 1 AND 5000000
    OR p_sha256 !~ '^[0-9a-f]{64}$'
    OR p_expires_at <= p_now
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid evidence authorization';
  END IF;

  IF NOT (
    (p_content_type = 'image/jpeg' AND lower(p_original_file_name) ~ '\.(jpg|jpeg)$')
    OR (p_content_type = 'image/png' AND lower(p_original_file_name) ~ '\.png$')
    OR (p_content_type = 'image/webp' AND lower(p_original_file_name) ~ '\.webp$')
    OR (p_content_type = 'application/pdf' AND lower(p_original_file_name) ~ '\.pdf$')
  ) THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: evidence extension mismatch';
  END IF;

  SELECT orders.*, customers.auth_subject
  INTO order_record
  FROM shop_orders AS orders
  INNER JOIN shop_customers AS customers ON customers.id = orders.customer_id
  WHERE orders.reference = p_reference
  FOR UPDATE OF orders;

  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.auth_subject IS DISTINCT FROM trim(p_auth_subject) THEN
    RAISE EXCEPTION 'SHOP_FORBIDDEN: order ownership';
  END IF;
  IF order_record.lifecycle_status <> 'ACTIVE'
    OR order_record.fulfillment_status <> 'NOT_STARTED'
    OR order_record.payment_review_status NOT IN ('AWAITING_EVIDENCE', 'REVIEW_REJECTED')
    OR order_record.funds_confirmation_status <> 'UNCONFIRMED'
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: evidence authorization';
  END IF;

  SELECT evidence.* INTO existing_record
  FROM shop_payment_evidence AS evidence
  WHERE evidence.order_id = order_record.id
    AND evidence.idempotency_key = p_idempotency_key;

  IF FOUND THEN
    IF existing_record.request_fingerprint IS DISTINCT FROM p_request_fingerprint THEN
      RAISE EXCEPTION 'SHOP_IDEMPOTENCY_MISMATCH: evidence authorization differs';
    END IF;
    RETURN shop_payment_evidence_authorization_v2(existing_record.id);
  END IF;

  evidence_id_value := gen_random_uuid();
  INSERT INTO shop_payment_evidence (
    id, order_id, customer_id, idempotency_key, request_fingerprint,
    status, original_file_name, content_type, byte_size, sha256,
    authorized_at, expires_at
  ) VALUES (
    evidence_id_value, order_record.id, order_record.customer_id,
    p_idempotency_key, p_request_fingerprint,
    'AUTHORIZED', p_original_file_name, p_content_type, p_byte_size, p_sha256,
    p_now, p_expires_at
  );

  UPDATE shop_orders
  SET version = version + 1, updated_at = p_now
  WHERE id = order_record.id;

  INSERT INTO shop_order_events (
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, 'PAYMENT_EVIDENCE_AUTHORIZED', 'CUSTOMER', trim(p_auth_subject), 'OPERATOR',
    order_record.lifecycle_status, order_record.payment_review_status,
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    'Private payment-evidence upload authorized; no evidence has been received.',
    jsonb_build_object(
      'evidenceId', evidence_id_value,
      'contentType', p_content_type,
      'byteSize', p_byte_size,
      'sha256', p_sha256,
      'expiresAt', p_expires_at
    ),
    p_now
  );

  RETURN shop_payment_evidence_authorization_v2(evidence_id_value);
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_receive_payment_evidence_v2"(
  "p_reference" text,
  "p_auth_subject" text,
  "p_evidence_id" uuid,
  "p_content_type" text,
  "p_byte_size" integer,
  "p_sha256" text,
  "p_blob_pathname" text,
  "p_blob_url" text,
  "p_now" timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  order_record record;
  evidence_record record;
  expected_pathname text;
BEGIN
  SELECT orders.*, customers.auth_subject
  INTO order_record
  FROM shop_orders AS orders
  INNER JOIN shop_customers AS customers ON customers.id = orders.customer_id
  WHERE orders.reference = p_reference
  FOR UPDATE OF orders;

  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: order'; END IF;
  IF order_record.auth_subject IS DISTINCT FROM trim(p_auth_subject) THEN
    RAISE EXCEPTION 'SHOP_FORBIDDEN: order ownership';
  END IF;
  IF order_record.lifecycle_status <> 'ACTIVE'
    OR order_record.fulfillment_status <> 'NOT_STARTED'
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: evidence receipt';
  END IF;

  SELECT evidence.* INTO evidence_record
  FROM shop_payment_evidence AS evidence
  WHERE evidence.id = p_evidence_id
    AND evidence.order_id = order_record.id
    AND evidence.customer_id = order_record.customer_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'SHOP_NOT_FOUND: evidence authorization'; END IF;

  expected_pathname := 'shop/payment-evidence/' || order_record.id::text || '/'
    || evidence_record.id::text || CASE evidence_record.content_type
      WHEN 'image/jpeg' THEN '.jpg'
      WHEN 'image/png' THEN '.png'
      WHEN 'image/webp' THEN '.webp'
      ELSE '.pdf'
    END;

  IF evidence_record.content_type IS DISTINCT FROM p_content_type
    OR evidence_record.byte_size IS DISTINCT FROM p_byte_size
    OR evidence_record.sha256 IS DISTINCT FROM p_sha256
    OR p_blob_pathname IS DISTINCT FROM expected_pathname
    OR p_blob_url !~ '^https://'
  THEN
    RAISE EXCEPTION 'SHOP_EVIDENCE_MISMATCH: received upload differs';
  END IF;

  IF evidence_record.status = 'RECEIVED' THEN
    IF evidence_record.blob_pathname IS DISTINCT FROM p_blob_pathname
      OR evidence_record.blob_url IS DISTINCT FROM p_blob_url
    THEN
      RAISE EXCEPTION 'SHOP_EVIDENCE_MISMATCH: replay differs';
    END IF;
    RETURN shop_order_document_v2(order_record.id, false);
  END IF;

  IF order_record.payment_review_status NOT IN ('AWAITING_EVIDENCE', 'REVIEW_REJECTED')
    OR order_record.funds_confirmation_status <> 'UNCONFIRMED'
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: evidence review has already advanced';
  END IF;

  IF evidence_record.status <> 'AUTHORIZED' THEN
    RAISE EXCEPTION 'SHOP_INVALID_TRANSITION: evidence already superseded';
  END IF;
  IF evidence_record.expires_at <= p_now THEN
    RAISE EXCEPTION 'SHOP_EVIDENCE_AUTHORIZATION_EXPIRED: evidence';
  END IF;

  UPDATE shop_payment_evidence
  SET status = 'SUPERSEDED'
  WHERE order_id = order_record.id
    AND id <> evidence_record.id
    AND status = 'RECEIVED';

  UPDATE shop_payment_evidence
  SET
    status = 'RECEIVED',
    blob_pathname = p_blob_pathname,
    blob_url = p_blob_url,
    received_at = p_now
  WHERE id = evidence_record.id;

  UPDATE shop_orders
  SET
    payment_review_status = 'EVIDENCE_RECEIVED',
    status = 'PAYMENT_REQUIRED',
    reservation_expires_at = GREATEST(reservation_expires_at, p_now + interval '24 hours'),
    version = version + 1,
    updated_at = p_now
  WHERE id = order_record.id;

  INSERT INTO shop_order_events (
    order_id, event_type, actor_kind, actor_subject, visibility,
    lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
    note, metadata, occurred_at
  ) VALUES (
    order_record.id, 'PAYMENT_EVIDENCE_RECEIVED', 'CUSTOMER', trim(p_auth_subject), 'CUSTOMER',
    order_record.lifecycle_status, 'EVIDENCE_RECEIVED',
    order_record.funds_confirmation_status, order_record.fulfillment_status,
    'Payment evidence received for review. This does not prove bank payment.',
    jsonb_build_object(
      'evidenceId', evidence_record.id,
      'contentType', evidence_record.content_type,
      'byteSize', evidence_record.byte_size,
      'sha256', evidence_record.sha256
    ),
    p_now
  );

  PERFORM shop_enqueue_notification_v2(
    order_record.id,
    order_record.customer_id,
    'PAYMENT_EVIDENCE_RECEIVED',
    'order:' || order_record.id::text || ':evidence:' || evidence_record.id::text || ':received',
    jsonb_build_object(
      'orderReference', order_record.reference,
      'evidenceId', evidence_record.id,
      'paymentReviewStatus', 'EVIDENCE_RECEIVED',
      'notice', 'Payment evidence received for review. This does not prove bank payment.'
    ),
    p_now
  );

  RETURN shop_order_document_v2(order_record.id, false);
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_claim_outbox_v2"(
  "p_worker_id" text,
  "p_limit" integer,
  "p_now" timestamptz
)
RETURNS SETOF jsonb
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) NOT BETWEEN 1 AND 120
    OR p_limit NOT BETWEEN 1 AND 100
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid outbox claim';
  END IF;

  RETURN QUERY
  WITH candidates AS (
    SELECT outbox.id
    FROM shop_notification_outbox AS outbox
    WHERE outbox.status IN ('PENDING', 'FAILED')
      AND outbox.available_at <= p_now
      AND (outbox.locked_at IS NULL OR outbox.locked_at < p_now - interval '5 minutes')
    ORDER BY outbox.available_at, outbox.created_at, outbox.id
    FOR UPDATE SKIP LOCKED
    LIMIT p_limit
  ), claimed AS (
    UPDATE shop_notification_outbox AS outbox
    SET
      locked_at = p_now,
      locked_by = trim(p_worker_id),
      attempts = outbox.attempts + 1,
      last_error = NULL
    FROM candidates
    WHERE outbox.id = candidates.id
    RETURNING outbox.*
  )
  SELECT jsonb_build_object(
    'id', claimed.id,
    'orderId', claimed.order_id,
    'customerId', claimed.customer_id,
    'topic', claimed.topic,
    'dedupeKey', claimed.dedupe_key,
    'payload', claimed.payload,
    'attempts', claimed.attempts,
    'createdAt', claimed.created_at
  )
  FROM claimed;
END
$$;
--> statement-breakpoint
CREATE FUNCTION "shop_complete_outbox_v2"(
  "p_message_id" uuid,
  "p_worker_id" text,
  "p_delivered" boolean,
  "p_error" text,
  "p_available_at" timestamptz,
  "p_now" timestamptz
)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  changed_count integer;
BEGIN
  IF p_worker_id IS NULL OR length(trim(p_worker_id)) NOT BETWEEN 1 AND 120
    OR (NOT p_delivered AND (p_error IS NULL OR length(p_error) > 500))
  THEN
    RAISE EXCEPTION 'SHOP_INVALID_REQUEST: invalid outbox completion';
  END IF;

  UPDATE shop_notification_outbox
  SET
    status = CASE WHEN p_delivered THEN 'DELIVERED'::shop_notification_outbox_status
      ELSE 'FAILED'::shop_notification_outbox_status END,
    available_at = CASE WHEN p_delivered THEN available_at ELSE p_available_at END,
    delivered_at = CASE WHEN p_delivered THEN p_now ELSE NULL END,
    last_error = CASE WHEN p_delivered THEN NULL ELSE p_error END,
    locked_at = NULL,
    locked_by = NULL
  WHERE id = p_message_id
    AND locked_by = trim(p_worker_id)
    AND locked_at IS NOT NULL;
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  IF changed_count <> 1 THEN
    RAISE EXCEPTION 'SHOP_VERSION_CONFLICT: outbox claim lost';
  END IF;
END
$$;
