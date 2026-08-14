// Server-only Postgres contract for the Neon-backed shop adapter.
// Keep this module out of public shop imports; it does not initialize a client or read credentials.
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgEnum,
  pgSequence,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

export const shopCatalogueAvailability = pgEnum("shop_catalogue_availability", [
  "AVAILABLE",
  "RESERVED",
  "SOLD",
  "ARCHIVED",
]);

// Compact public identities for Studio-published pieces. Sequence values may
// have harmless gaps; they are never derived with a race-prone max+1 query.
export const shopDynamicSkuSequence = pgSequence("shop_dynamic_sku_sequence", {
  startWith: 100,
});

export const shopCatalogueItems = pgTable("shop_catalogue_items", {
  sku: varchar("sku", { length: 40 }).primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  category: text("category").notNull(),
  price: integer("price").notNull(),
  taggedSize: text("tagged_size").notNull(),
  fit: text("fit").notNull(),
  condition: text("condition").notNull(),
  colour: text("colour").notNull(),
  dropLabel: text("drop_label").notNull(),
  tone: text("tone").notNull(),
  silhouette: text("silhouette").notNull(),
  note: text("note").notNull(),
  story: text("story").notNull(),
  details: jsonb("details").$type<string[]>().notNull(),
  measurements: jsonb("measurements").$type<Array<{
    label: string;
    value: string;
  }>>().notNull(),
  modelAnchor: jsonb("model_anchor").$type<{
    id: "lulu-v2" | "lulu-v3";
    src?: string;
  }>().notNull(),
  media: jsonb("media").$type<Array<{
    slot: string;
    src: string;
    modelAnchorId?: "lulu-v2" | "lulu-v3";
  }>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_catalogue_items_slug_unique").on(table.slug),
  check("shop_catalogue_items_price_nonnegative", sql`${table.price} >= 0`),
  check("shop_catalogue_items_details_array", sql`jsonb_typeof(${table.details}) = 'array'`),
  check("shop_catalogue_items_measurements_array", sql`jsonb_typeof(${table.measurements}) = 'array'`),
  check("shop_catalogue_items_model_anchor_object", sql`jsonb_typeof(${table.modelAnchor}) = 'object'`),
  check("shop_catalogue_items_media_array", sql`jsonb_typeof(${table.media}) = 'array'`),
]);

export const shopInventory = pgTable("shop_inventory", {
  sku: varchar("sku", { length: 40 })
    .primaryKey()
    .references(() => shopCatalogueItems.sku, { onDelete: "restrict", onUpdate: "cascade" }),
  availability: shopCatalogueAvailability("availability").notNull(),
  onHand: integer("on_hand").notNull(),
  reserved: integer("reserved").notNull(),
  sold: integer("sold").notNull(),
  returned: integer("returned").notNull(),
  writeOff: integer("write_off").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  check("shop_inventory_counts_nonnegative", sql`
    ${table.onHand} >= 0
    and ${table.reserved} >= 0
    and ${table.sold} >= 0
    and ${table.returned} >= 0
    and ${table.writeOff} >= 0
  `),
  check("shop_inventory_reserved_within_on_hand", sql`${table.reserved} <= ${table.onHand}`),
  check("shop_inventory_returns_within_sales", sql`${table.returned} <= ${table.sold}`),
  check("shop_inventory_one_off_conservation", sql`
    ${table.onHand} + ${table.sold} - ${table.returned} + ${table.writeOff} = 1
  `),
  check("shop_inventory_availability_consistent", sql`
    (${table.availability} = 'AVAILABLE' and ${table.onHand} = 1 and ${table.reserved} = 0)
    or (${table.availability} = 'RESERVED' and ${table.onHand} = 1 and ${table.reserved} = 1)
    or (${table.availability} = 'SOLD' and ${table.onHand} = 0 and ${table.reserved} = 0 and ${table.sold} > ${table.returned})
    or (${table.availability} = 'ARCHIVED' and ${table.reserved} = 0)
  `),
]);

export const shopSeedLedger = pgTable("shop_seed_ledger", {
  namespace: varchar("namespace", { length: 120 }).notNull(),
  revision: varchar("revision", { length: 120 }).notNull(),
  target: varchar("target", { length: 24 }).notNull(),
  gitSha: varchar("git_sha", { length: 64 }).notNull(),
  checksum: varchar("checksum", { length: 64 }).notNull(),
  rowCount: integer("row_count").notNull(),
  operation: varchar("operation", { length: 24 }).notNull(),
  appliedAt: timestamp("applied_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.namespace, table.revision] }),
  check("shop_seed_ledger_checksum_sha256", sql`${table.checksum} ~ '^[0-9a-f]{64}$'`),
  check("shop_seed_ledger_git_sha", sql`${table.gitSha} ~ '^[0-9a-f]{7,64}$'`),
  check("shop_seed_ledger_row_count_positive", sql`${table.rowCount} > 0`),
  check("shop_seed_ledger_target_known", sql`${table.target} in ('local', 'preview', 'production')`),
  check("shop_seed_ledger_operation_known", sql`${table.operation} in ('seed', 'descriptive-sync')`),
]);

export const shopCartStatus = pgEnum("shop_cart_status", [
  "ACTIVE",
  "CONVERTED",
  "ABANDONED",
]);

export const shopOrderStatus = pgEnum("shop_order_status", [
  "PAYMENT_REQUIRED",
  "ORDER_RECEIVED",
  "QUALITY_CHECK",
  "READY_FOR_HANDOFF",
  "IN_TRANSIT",
  "DELIVERED",
  "CANCELLED",
]);

export const shopOrderTransmission = pgEnum("shop_order_transmission", [
  "LOCAL_ONLY",
  "SUBMITTED",
]);

export const shopFulfillmentKind = pgEnum("shop_fulfillment_kind", [
  "DELIVERY",
  "PICKUP",
]);

export const shopActorKind = pgEnum("shop_actor_kind", ["CUSTOMER", "OPERATOR", "SYSTEM"]);
export const shopOrderLifecycleStatus = pgEnum("shop_order_lifecycle_status", [
  "ACTIVE",
  "COMPLETED",
  "CANCELLED",
  "EXPIRED",
]);
export const shopPaymentReviewStatus = pgEnum("shop_payment_review_status", [
  "AWAITING_EVIDENCE",
  "EVIDENCE_RECEIVED",
  "UNDER_REVIEW",
  "REVIEW_APPROVED",
  "REVIEW_REJECTED",
]);
export const shopFundsConfirmationStatus = pgEnum("shop_funds_confirmation_status", [
  "UNCONFIRMED",
  "CONFIRMED",
]);
export const shopFulfillmentStatus = pgEnum("shop_fulfillment_status", [
  "NOT_STARTED",
  "QUALITY_CHECK",
  "READY_FOR_HANDOFF",
  "IN_TRANSIT",
  "DELIVERED",
]);
export const shopEventVisibility = pgEnum("shop_event_visibility", ["CUSTOMER", "OPERATOR"]);
export const shopPaymentEvidenceStatus = pgEnum("shop_payment_evidence_status", [
  "AUTHORIZED",
  "RECEIVED",
  "SUPERSEDED",
]);
export const shopNotificationOutboxStatus = pgEnum("shop_notification_outbox_status", [
  "PENDING",
  "DELIVERED",
  "FAILED",
]);
export const shopReturnStatus = pgEnum("shop_return_status", [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "RESOLVED",
]);
export const shopReturnReason = pgEnum("shop_return_reason", [
  "WRONG_SIZE",
  "NOT_AS_DESCRIBED",
  "DAMAGED",
  "CHANGED_MIND",
  "OTHER",
]);
export const shopRefundStatus = pgEnum("shop_refund_status", [
  "NOT_STARTED",
  "PENDING",
  "COMPLETED",
  "FAILED",
]);
export const shopReturnDisposition = pgEnum("shop_return_disposition", ["RESTOCK", "WRITE_OFF"]);

export const shopCustomers = pgTable("shop_customers", {
  id: uuid("id").defaultRandom().primaryKey(),
  authSubject: text("auth_subject").notNull(),
  email: text("email"),
  phone: text("phone"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_customers_auth_subject_unique").on(table.authSubject),
  uniqueIndex("shop_customers_email_unique").on(table.email),
]);

export const shopSaves = pgTable("shop_saves", {
  customerId: uuid("customer_id")
    .notNull()
    .references(() => shopCustomers.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.customerId, table.productSlug] }),
  index("shop_saves_product_idx").on(table.productSlug),
]);

export const shopFollows = pgTable("shop_follows", {
  customerId: uuid("customer_id")
    .notNull()
    .references(() => shopCustomers.id, { onDelete: "cascade" }),
  merchantHandle: text("merchant_handle").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.customerId, table.merchantHandle] }),
]);

export const shopCarts = pgTable("shop_carts", {
  id: uuid("id").defaultRandom().primaryKey(),
  customerId: uuid("customer_id").references(() => shopCustomers.id, { onDelete: "set null" }),
  status: shopCartStatus("status").default("ACTIVE").notNull(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("shop_carts_customer_status_idx").on(table.customerId, table.status),
]);

export const shopCartItems = pgTable("shop_cart_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  cartId: uuid("cart_id")
    .notNull()
    .references(() => shopCarts.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  taggedSize: text("tagged_size").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_cart_items_piece_unique").on(table.cartId, table.productSlug),
  check("shop_cart_items_quantity_one", sql`${table.quantity} = 1`),
  check("shop_cart_items_price_nonnegative", sql`${table.unitPrice} >= 0`),
]);

export const shopOrders = pgTable("shop_orders", {
  id: uuid("id").defaultRandom().primaryKey(),
  reference: varchar("reference", { length: 40 }).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  customerId: uuid("customer_id")
    .notNull()
    .references(() => shopCustomers.id, { onDelete: "restrict" }),
  sourceCartId: uuid("source_cart_id").references(() => shopCarts.id, { onDelete: "set null" }),
  status: shopOrderStatus("status").default("PAYMENT_REQUIRED").notNull(),
  lifecycleStatus: shopOrderLifecycleStatus("lifecycle_status").default("ACTIVE").notNull(),
  paymentReviewStatus: shopPaymentReviewStatus("payment_review_status")
    .default("AWAITING_EVIDENCE")
    .notNull(),
  fundsConfirmationStatus: shopFundsConfirmationStatus("funds_confirmation_status")
    .default("UNCONFIRMED")
    .notNull(),
  fulfillmentStatus: shopFulfillmentStatus("fulfillment_status").default("NOT_STARTED").notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 })
    .default("0000000000000000000000000000000000000000000000000000000000000000")
    .notNull(),
  version: integer("version").default(0).notNull(),
  transmission: shopOrderTransmission("transmission").default("SUBMITTED").notNull(),
  contactName: text("contact_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  contactPhone: text("contact_phone").notNull(),
  fulfillmentKind: shopFulfillmentKind("fulfillment_kind").notNull(),
  deliveryOptionId: text("delivery_option_id").notNull(),
  deliveryAddress: jsonb("delivery_address").$type<{
    street: string;
    area: string;
    state: string;
    country: "Nigeria";
  } | null>(),
  currency: varchar("currency", { length: 3 }).default("NGN").notNull(),
  subtotal: integer("subtotal").notNull(),
  deliveryFee: integer("delivery_fee").notNull(),
  total: integer("total").notNull(),
  deliveryLabel: text("delivery_label").notNull(),
  deliveryEstimate: text("delivery_estimate").notNull(),
  fundsTransferReference: text("funds_transfer_reference"),
  fundsReceivingAccountLabel: text("funds_receiving_account_label"),
  fundsConfirmedAt: timestamp("funds_confirmed_at", { withTimezone: true }),
  fundsVerifierSubject: text("funds_verifier_subject"),
  fundsVerifierDisplayName: text("funds_verifier_display_name"),
  carrierName: text("carrier_name"),
  trackingReference: text("tracking_reference"),
  pickupAppointment: timestamp("pickup_appointment", { withTimezone: true }),
  recipientName: text("recipient_name"),
  dispatchReference: text("dispatch_reference"),
  dispatchedAt: timestamp("dispatched_at", { withTimezone: true }),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deliveryProofReference: text("delivery_proof_reference"),
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
  reservationExpiresAt: timestamp("reservation_expires_at", { withTimezone: true }),
  returnEligibleUntil: timestamp("return_eligible_until", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  cancelledAt: timestamp("cancelled_at", { withTimezone: true }),
  expiredAt: timestamp("expired_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_orders_reference_unique").on(table.reference),
  uniqueIndex("shop_orders_customer_idempotency_unique").on(
    table.customerId,
    table.idempotencyKey,
  ),
  index("shop_orders_customer_saved_idx").on(table.customerId, table.savedAt),
  check("shop_orders_fulfillment_address_matches", sql`
    (${table.fulfillmentKind} = 'PICKUP' and ${table.deliveryAddress} is null)
    or (${table.fulfillmentKind} = 'DELIVERY' and ${table.deliveryAddress} is not null)
  `),
  check("shop_orders_amounts_nonnegative", sql`
    ${table.subtotal} >= 0
    and ${table.deliveryFee} >= 0
    and ${table.total} = ${table.subtotal} + ${table.deliveryFee}
  `),
  check("shop_orders_request_fingerprint_sha256", sql`
    ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'
  `),
  check("shop_orders_version_nonnegative", sql`${table.version} >= 0`),
  check("shop_orders_lifecycle_timestamps", sql`
    (${table.lifecycleStatus} = 'ACTIVE'
      and ${table.completedAt} is null
      and ${table.cancelledAt} is null
      and ${table.expiredAt} is null)
    or (${table.lifecycleStatus} = 'COMPLETED'
      and ${table.completedAt} is not null
      and ${table.cancelledAt} is null
      and ${table.expiredAt} is null)
    or (${table.lifecycleStatus} = 'CANCELLED'
      and ${table.completedAt} is null
      and ${table.cancelledAt} is not null
      and ${table.expiredAt} is null)
    or (${table.lifecycleStatus} = 'EXPIRED'
      and ${table.completedAt} is null
      and ${table.cancelledAt} is null
      and ${table.expiredAt} is not null)
  `),
  check("shop_orders_funds_audit_complete", sql`
    (${table.fundsConfirmationStatus} = 'UNCONFIRMED'
      and ${table.fundsTransferReference} is null
      and ${table.fundsReceivingAccountLabel} is null
      and ${table.fundsConfirmedAt} is null
      and ${table.fundsVerifierSubject} is null
      and ${table.fundsVerifierDisplayName} is null)
    or (${table.fundsConfirmationStatus} = 'CONFIRMED'
      and ${table.fundsTransferReference} is not null
      and ${table.fundsReceivingAccountLabel} is not null
      and ${table.fundsConfirmedAt} is not null
      and ${table.fundsVerifierSubject} is not null
      and ${table.fundsVerifierDisplayName} is not null)
  `),
  check("shop_orders_fulfillment_facts_complete", sql`
    (${table.fulfillmentStatus} in ('NOT_STARTED', 'QUALITY_CHECK', 'READY_FOR_HANDOFF')
      and ${table.dispatchedAt} is null and ${table.deliveredAt} is null)
    or (${table.fulfillmentStatus} = 'IN_TRANSIT'
      and ${table.fulfillmentKind} = 'DELIVERY'
      and ${table.carrierName} is not null
      and ${table.trackingReference} is not null
      and ${table.dispatchReference} is not null
      and ${table.dispatchedAt} is not null
      and ${table.deliveredAt} is null)
    or (${table.fulfillmentStatus} = 'DELIVERED'
      and ${table.recipientName} is not null
      and ${table.deliveredAt} is not null
      and ${table.deliveryProofReference} is not null
      and (
        (${table.fulfillmentKind} = 'DELIVERY'
          and ${table.carrierName} is not null
          and ${table.trackingReference} is not null
          and ${table.dispatchReference} is not null
          and ${table.dispatchedAt} is not null)
        or (${table.fulfillmentKind} = 'PICKUP'
          and ${table.pickupAppointment} is not null
          and ${table.dispatchedAt} is null)
      ))
  `),
]);

export const shopOrderItems = pgTable("shop_order_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => shopOrders.id, { onDelete: "cascade" }),
  productSlug: text("product_slug").notNull(),
  sku: text("sku").notNull(),
  productName: text("product_name").notNull(),
  taggedSize: text("tagged_size").notNull(),
  unitPrice: integer("unit_price").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  lineTotal: integer("line_total").notNull(),
}, (table) => [
  uniqueIndex("shop_order_items_piece_unique").on(table.orderId, table.productSlug),
  check("shop_order_items_quantity_one", sql`${table.quantity} = 1`),
  check("shop_order_items_price_nonnegative", sql`${table.unitPrice} >= 0`),
  check("shop_order_items_total_matches", sql`${table.lineTotal} = ${table.unitPrice}`),
]);

export const shopOrderEvents = pgTable("shop_order_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => shopOrders.id, { onDelete: "cascade" }),
  status: shopOrderStatus("status"),
  eventType: varchar("event_type", { length: 80 }).default("LEGACY_STATUS").notNull(),
  actorKind: shopActorKind("actor_kind").default("SYSTEM").notNull(),
  actorSubject: text("actor_subject").default("migration:legacy").notNull(),
  visibility: shopEventVisibility("visibility").default("OPERATOR").notNull(),
  lifecycleStatus: shopOrderLifecycleStatus("lifecycle_status"),
  paymentReviewStatus: shopPaymentReviewStatus("payment_review_status"),
  fundsConfirmationStatus: shopFundsConfirmationStatus("funds_confirmation_status"),
  fulfillmentStatus: shopFulfillmentStatus("fulfillment_status"),
  note: text("note"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("shop_order_events_order_time_idx").on(table.orderId, table.occurredAt),
  check("shop_order_events_type_nonempty", sql`length(trim(${table.eventType})) > 0`),
  check("shop_order_events_actor_subject_nonempty", sql`length(trim(${table.actorSubject})) > 0`),
]);

export const shopPaymentEvidence = pgTable("shop_payment_evidence", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => shopCustomers.id, { onDelete: "restrict" }),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  status: shopPaymentEvidenceStatus("status").default("AUTHORIZED").notNull(),
  originalFileName: varchar("original_file_name", { length: 180 }).notNull(),
  contentType: varchar("content_type", { length: 80 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  blobPathname: text("blob_pathname"),
  blobUrl: text("blob_url"),
  authorizedAt: timestamp("authorized_at", { withTimezone: true }).defaultNow().notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("shop_payment_evidence_order_idempotency_unique").on(table.orderId, table.idempotencyKey),
  index("shop_payment_evidence_order_status_idx").on(table.orderId, table.status),
  check("shop_payment_evidence_fingerprints_sha256", sql`
    ${table.requestFingerprint} ~ '^[0-9a-f]{64}$' and ${table.sha256} ~ '^[0-9a-f]{64}$'
  `),
  check("shop_payment_evidence_size", sql`${table.byteSize} > 0 and ${table.byteSize} <= 5000000`),
  check("shop_payment_evidence_mime", sql`
    ${table.contentType} in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')
  `),
  check("shop_payment_evidence_received_metadata", sql`
    (${table.status} = 'AUTHORIZED'
      and ${table.receivedAt} is null
      and ${table.blobPathname} is null
      and ${table.blobUrl} is null)
    or (${table.status} in ('RECEIVED', 'SUPERSEDED')
      and ${table.receivedAt} is not null
      and ${table.blobPathname} is not null
      and ${table.blobUrl} is not null)
  `),
]);

export const shopOrderReturns = pgTable("shop_order_returns", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => shopCustomers.id, { onDelete: "restrict" }),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  status: shopReturnStatus("status").default("REQUESTED").notNull(),
  reason: shopReturnReason("reason").notNull(),
  detail: text("detail").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  eligibleUntil: timestamp("eligible_until", { withTimezone: true }).notNull(),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  receivedAt: timestamp("received_at", { withTimezone: true }),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
  resolutionNote: text("resolution_note"),
  refundStatus: shopRefundStatus("refund_status").default("NOT_STARTED").notNull(),
  refundReference: text("refund_reference"),
  refundAmount: integer("refund_amount"),
  refundCurrency: varchar("refund_currency", { length: 3 }),
  refundUpdatedAt: timestamp("refund_updated_at", { withTimezone: true }),
  disposition: shopReturnDisposition("disposition"),
}, (table) => [
  uniqueIndex("shop_order_returns_order_unique").on(table.orderId),
  uniqueIndex("shop_order_returns_customer_idempotency_unique").on(table.customerId, table.idempotencyKey),
  index("shop_order_returns_status_requested_idx").on(table.status, table.requestedAt),
  check("shop_order_returns_request_fingerprint_sha256", sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check("shop_order_returns_detail_length", sql`length(trim(${table.detail})) between 10 and 500`),
  check("shop_order_returns_refund_reference", sql`
    (${table.refundStatus} = 'COMPLETED'
      and ${table.refundReference} is not null
      and ${table.refundAmount} > 0
      and ${table.refundCurrency} = 'NGN')
    or (${table.refundStatus} <> 'COMPLETED'
      and ${table.refundAmount} is null
      and ${table.refundCurrency} is null)
  `),
  check("shop_order_returns_resolution", sql`
    (${table.status} = 'RESOLVED'
      and ${table.resolvedAt} is not null
      and ${table.disposition} is not null
      and ${table.refundStatus} = 'COMPLETED')
    or (${table.status} <> 'RESOLVED'
      and ${table.resolvedAt} is null
      and ${table.disposition} is null)
  `),
]);

export const shopNotificationOutbox = pgTable("shop_notification_outbox", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id").notNull().references(() => shopOrders.id, { onDelete: "cascade" }),
  customerId: uuid("customer_id").notNull().references(() => shopCustomers.id, { onDelete: "restrict" }),
  topic: varchar("topic", { length: 80 }).notNull(),
  dedupeKey: varchar("dedupe_key", { length: 240 }).notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().notNull(),
  status: shopNotificationOutboxStatus("status").default("PENDING").notNull(),
  attempts: integer("attempts").default(0).notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }).defaultNow().notNull(),
  lockedAt: timestamp("locked_at", { withTimezone: true }),
  lockedBy: text("locked_by"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  lastError: text("last_error"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_notification_outbox_dedupe_unique").on(table.dedupeKey),
  index("shop_notification_outbox_delivery_idx").on(table.status, table.availableAt),
  check("shop_notification_outbox_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
  check("shop_notification_outbox_attempts_nonnegative", sql`${table.attempts} >= 0`),
  check("shop_notification_outbox_lock_pair", sql`
    (${table.lockedAt} is null and ${table.lockedBy} is null)
    or (${table.lockedAt} is not null and ${table.lockedBy} is not null)
  `),
]);

export const studioOperatorMembership = pgTable("studio_operator_membership", {
  authSubject: text("auth_subject").primaryKey(),
  email: text("email").notNull(),
  role: varchar("role", { length: 24 }).default("operator").notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_operator_membership_email_unique").on(sql`lower(${table.email})`),
  check("studio_operator_membership_role", sql`${table.role} in ('operator', 'admin')`),
]);

// Private Studio AI intake. These records are deliberately separate from the
// public catalogue: committing an intake creates a Wardrobe draft, never a
// Shop listing.
export const studioIntakeKind = pgEnum("studio_intake_kind", ["GARMENT", "MODEL"]);
export const studioSourceMode = pgEnum("studio_source_mode", [
  "CAMERA",
  "UPLOAD",
  "DESCRIBE",
]);
export const studioIntakeState = pgEnum("studio_intake_state", [
  "DRAFT",
  "ANALYZING",
  "REVIEW",
  "GENERATING",
  "DECISION",
  "COMMITTED",
  "FAILED",
  "ARCHIVED",
]);
export const studioAssetRole = pgEnum("studio_asset_role", [
  "SOURCE",
  "GARMENT_FRONT",
  "MANNEQUIN_FRONT",
  "MODEL_TRY_ON",
  "EDITORIAL_MODEL",
]);
export const studioGenerationState = pgEnum("studio_generation_state", [
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "APPROVED",
  "REJECTED",
  "FAILED",
]);
export const studioDecisionKind = pgEnum("studio_decision_kind", [
  "KEEP",
  "EDIT",
  "REJECT",
  "RETRY",
]);

export const studioIntakes = pgTable("studio_intakes", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  operatorEmail: text("operator_email").notNull(),
  kind: studioIntakeKind("kind").notNull(),
  sourceMode: studioSourceMode("source_mode").notNull(),
  description: text("description"),
  facts: jsonb("facts").$type<Record<string, string | number | null>>().default({}).notNull(),
  state: studioIntakeState("state").default("DRAFT").notNull(),
  version: integer("version").default(1).notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  errorCode: varchar("error_code", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_intakes_operator_idempotency_unique").on(
    table.operatorSubject,
    table.idempotencyKey,
  ),
  index("studio_intakes_operator_updated_idx").on(table.operatorSubject, table.updatedAt),
  check("studio_intakes_version_positive", sql`${table.version} > 0`),
  check("studio_intakes_facts_object", sql`jsonb_typeof(${table.facts}) = 'object'`),
]);

export const studioAssets = pgTable("studio_assets", {
  id: uuid("id").defaultRandom().primaryKey(),
  intakeId: uuid("intake_id")
    .notNull()
    .references(() => studioIntakes.id, { onDelete: "cascade" }),
  role: studioAssetRole("role").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  blobUrl: text("blob_url").notNull(),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  privacy: varchar("privacy", { length: 24 }).default("PRIVATE").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("studio_assets_intake_role_idx").on(table.intakeId, table.role),
  uniqueIndex("studio_assets_intake_sha_role_unique").on(table.intakeId, table.sha256, table.role),
  check("studio_assets_bytes_positive", sql`${table.byteSize} > 0`),
  check("studio_assets_sha256", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  check("studio_assets_private_only", sql`${table.privacy} = 'PRIVATE'`),
]);

export const studioModelProfiles = pgTable("studio_model_profiles", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject"),
  name: text("name").notNull(),
  authorityId: varchar("authority_id", { length: 120 }).notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  state: varchar("state", { length: 24 }).default("READY").notNull(),
  sourceBlobPathname: text("source_blob_pathname").notNull(),
  sourceMimeType: varchar("source_mime_type", { length: 80 }).notNull(),
  sourceByteSize: integer("source_byte_size").notNull(),
  sourceWidth: integer("source_width"),
  sourceHeight: integer("source_height"),
  sourceSha256: varchar("source_sha256", { length: 64 }).notNull(),
  licenseUrl: text("license_url"),
  authority: jsonb("authority").$type<Record<string, unknown>>().notNull(),
  authorityConfirmedAt: timestamp("authority_confirmed_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_model_profiles_operator_authority_unique").on(table.operatorSubject, table.authorityId),
  uniqueIndex("studio_model_profiles_lulu_authority_unique").on(table.authorityId).where(sql`${table.kind} = 'LULU_V3'`),
  index("studio_model_profiles_operator_updated_idx").on(table.operatorSubject, table.updatedAt),
  check("studio_model_profiles_kind_known", sql`${table.kind} in ('LULU_V3', 'AUTHORIZED_STOCK')`),
  check("studio_model_profiles_state_private", sql`${table.state} in ('READY', 'ARCHIVED')`),
  check("studio_model_profiles_source_bytes_positive", sql`${table.sourceByteSize} > 0`),
  check("studio_model_profiles_source_sha256", sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`),
  check("studio_model_profiles_authority_object", sql`jsonb_typeof(${table.authority}) = 'object'`),
]);

export const studioGenerations = pgTable("studio_generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  intakeId: uuid("intake_id")
    .notNull()
    .references(() => studioIntakes.id, { onDelete: "cascade" }),
  modelProfileId: uuid("model_profile_id").references(() => studioModelProfiles.id, { onDelete: "restrict" }),
  operation: varchar("operation", { length: 40 }).notNull(),
  state: studioGenerationState("state").default("PENDING").notNull(),
  model: text("model").notNull(),
  promptVersion: varchar("prompt_version", { length: 40 }).notNull(),
  promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  sourceAssetIds: jsonb("source_asset_ids").$type<string[]>().notNull(),
  sourceHashes: jsonb("source_hashes").$type<string[]>().notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
  outputAssetId: uuid("output_asset_id").references(() => studioAssets.id, { onDelete: "set null" }),
  usage: jsonb("usage").$type<Record<string, unknown>>(),
  costUsd: text("cost_usd"),
  errorCode: varchar("error_code", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_generations_intake_fingerprint_unique").on(table.intakeId, table.fingerprint),
  index("studio_generations_intake_created_idx").on(table.intakeId, table.createdAt),
  check("studio_generations_prompt_hash", sql`${table.promptHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_generations_fingerprint", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
  check("studio_generations_source_ids_array", sql`jsonb_typeof(${table.sourceAssetIds}) = 'array'`),
  check("studio_generations_source_hashes_array", sql`jsonb_typeof(${table.sourceHashes}) = 'array'`),
  check("studio_generations_parameters_object", sql`jsonb_typeof(${table.parameters}) = 'object'`),
]);

export const studioDecisions = pgTable("studio_decisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  intakeId: uuid("intake_id")
    .notNull()
    .references(() => studioIntakes.id, { onDelete: "cascade" }),
  generationId: uuid("generation_id").references(() => studioGenerations.id, { onDelete: "set null" }),
  actorSubject: text("actor_subject").notNull(),
  decision: studioDecisionKind("decision").notNull(),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index("studio_decisions_intake_created_idx").on(table.intakeId, table.createdAt)]);

export const studioWardrobeItems = pgTable("studio_wardrobe_items", {
  id: uuid("id").defaultRandom().primaryKey(),
  intakeId: uuid("intake_id")
    .notNull()
    .references(() => studioIntakes.id, { onDelete: "restrict" }),
  operatorSubject: text("operator_subject").notNull(),
  title: text("title").notNull(),
  category: text("category").notNull(),
  colour: text("colour").notNull(),
  sizeLabel: text("size_label").notNull(),
  condition: text("condition").notNull(),
  price: integer("price").notNull(),
  quantity: integer("quantity").default(1).notNull(),
  state: varchar("state", { length: 24 }).default("DRAFT").notNull(),
  version: integer("version").default(1).notNull(),
  approvedAssetId: uuid("approved_asset_id").references(() => studioAssets.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_wardrobe_items_intake_unique").on(table.intakeId),
  index("studio_wardrobe_items_operator_updated_idx").on(table.operatorSubject, table.updatedAt),
  check("studio_wardrobe_items_price_nonnegative", sql`${table.price} >= 0`),
  check("studio_wardrobe_items_quantity_one", sql`${table.quantity} = 1`),
  check("studio_wardrobe_items_version_positive", sql`${table.version} > 0`),
  check("studio_wardrobe_items_state_private", sql`${table.state} in ('DRAFT', 'READY', 'ARCHIVED')`),
]);

// Operator-approved direct captures for the static Studio pending-product
// contracts. They remain private and never become catalogue media implicitly.
export const studioPendingProductCaptures = pgTable("studio_pending_product_captures", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  sku: varchar("sku", { length: 40 }).notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  blobPathname: text("blob_pathname").notNull(),
  mimeType: varchar("mime_type", { length: 80 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  privacy: varchar("privacy", { length: 24 }).default("PRIVATE").notNull(),
  operatorApprovedAt: timestamp("operator_approved_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_pending_product_captures_operator_sku_role_unique").on(
    table.operatorSubject,
    table.sku,
    table.role,
  ),
  index("studio_pending_product_captures_operator_sku_idx").on(table.operatorSubject, table.sku),
  check("studio_pending_product_captures_role_known", sql`${table.role} in ('GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL')`),
  check("studio_pending_product_captures_bytes_positive", sql`${table.byteSize} > 0`),
  check("studio_pending_product_captures_sha256", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  check("studio_pending_product_captures_private_only", sql`${table.privacy} = 'PRIVATE'`),
]);

// Durable, append-only bridge from a private Studio piece to its first public
// catalogue row. The checked-in release ledger remains authoritative for the
// seeded catalogue; this ledger is the authority for operator publications.
export const studioCataloguePublications = pgTable("studio_catalogue_publications", {
  id: uuid("id").defaultRandom().primaryKey(),
  wardrobeItemId: uuid("wardrobe_item_id")
    .notNull()
    .references(() => studioWardrobeItems.id, { onDelete: "restrict" }),
  operatorSubject: text("operator_subject").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  sourceRevision: varchar("source_revision", { length: 64 }).notNull(),
  sku: varchar("sku", { length: 40 })
    .notNull()
    .references(() => shopCatalogueItems.sku, { onDelete: "restrict", onUpdate: "cascade" }),
  slug: text("slug").notNull(),
  state: varchar("state", { length: 24 }).default("PUBLISHED").notNull(),
  facts: jsonb("facts").$type<Record<string, unknown>>().notNull(),
  media: jsonb("media").$type<Array<{
    slot: "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL";
    src: string;
    pathname: string;
    sourceSha256: string;
    sha256: string;
    mimeType: string;
    width: number;
    height: number;
  }>>().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }).defaultNow().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_catalogue_publications_wardrobe_unique").on(table.wardrobeItemId),
  uniqueIndex("studio_catalogue_publications_sku_unique").on(table.sku),
  uniqueIndex("studio_catalogue_publications_slug_unique").on(table.slug),
  uniqueIndex("studio_catalogue_publications_operator_idempotency_unique").on(
    table.operatorSubject,
    table.idempotencyKey,
  ),
  index("studio_catalogue_publications_operator_published_idx").on(
    table.operatorSubject,
    table.publishedAt,
  ),
  check("studio_catalogue_publications_source_revision_sha256", sql`${table.sourceRevision} ~ '^[0-9a-f]{64}$'`),
  check("studio_catalogue_publications_state_known", sql`${table.state} = 'PUBLISHED'`),
  check("studio_catalogue_publications_facts_object", sql`jsonb_typeof(${table.facts}) = 'object'`),
  check("studio_catalogue_publications_media_array", sql`jsonb_typeof(${table.media}) = 'array'`),
]);
