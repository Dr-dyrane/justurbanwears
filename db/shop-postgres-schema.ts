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

export const shopCollectionState = pgEnum("shop_collection_state", [
  "DRAFT",
  "ACTIVE",
  "ARCHIVED",
]);

export const shopCollections = pgTable("shop_collections", {
  id: uuid("id").defaultRandom().primaryKey(),
  key: varchar("key", { length: 80 }).notNull(),
  label: varchar("label", { length: 120 }).notNull(),
  ordinal: integer("ordinal").notNull(),
  version: integer("version").default(1).notNull(),
  state: shopCollectionState("state").default("DRAFT").notNull(),
  activatedAt: timestamp("activated_at", { withTimezone: true }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_collections_key_unique").on(table.key),
  uniqueIndex("shop_collections_ordinal_unique").on(table.ordinal),
  uniqueIndex("shop_collections_one_active_unique")
    .on(table.state)
    .where(sql`${table.state} = 'ACTIVE'`),
  check("shop_collections_key_format", sql`${table.key} ~ '^drop-[0-9]{2,}$'`),
  check("shop_collections_label_present", sql`length(trim(${table.label})) > 0`),
  check("shop_collections_ordinal_positive", sql`${table.ordinal} > 0`),
  check("shop_collections_version_positive", sql`${table.version} > 0`),
  check("shop_collections_lifecycle_timestamps", sql`
    (${table.state} = 'DRAFT' and ${table.activatedAt} is null and ${table.archivedAt} is null)
    or (${table.state} = 'ACTIVE' and ${table.activatedAt} is not null and ${table.archivedAt} is null)
    or (${table.state} = 'ARCHIVED' and ${table.archivedAt} is not null)
  `),
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
  collectionId: uuid("collection_id")
    .references(() => shopCollections.id, { onDelete: "restrict" }),
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
    id: "lulu-v2" | "lulu-v3" | "lulu-v4";
    src?: string;
  }>().notNull(),
  media: jsonb("media").$type<Array<{
    slot: string;
    src: string;
    modelAnchorId?: "lulu-v2" | "lulu-v3" | "lulu-v4";
  }>>().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_catalogue_items_slug_unique").on(table.slug),
  index("shop_catalogue_items_collection_idx").on(table.collectionId),
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

export const shopOrderSource = pgEnum("shop_order_source", [
  "ONLINE",
  "PHONE",
  "DM",
  "IN_PERSON",
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
  uniqueIndex("shop_customers_email_unique")
    .on(sql`lower(${table.email})`)
    .where(sql`${table.email} is not null`),
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
  source: shopOrderSource("source").default("ONLINE").notNull(),
  createdByActorSubject: text("created_by_actor_subject"),
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
  fundsPaidAmount: integer("funds_paid_amount"),
  fundsPaidCurrency: varchar("funds_paid_currency", { length: 3 }),
  fundsAmountUpdatedAt: timestamp("funds_amount_updated_at", { withTimezone: true }),
  fundsRefundedAmount: integer("funds_refunded_amount").default(0).notNull(),
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
  index("shop_orders_lifecycle_saved_idx").on(table.lifecycleStatus, table.savedAt),
  index("shop_orders_fulfillment_saved_idx").on(table.fulfillmentStatus, table.savedAt),
  check("shop_orders_source_actor", sql`
    (${table.source} = 'ONLINE' and ${table.createdByActorSubject} is null)
    or (${table.source} <> 'ONLINE' and length(trim(${table.createdByActorSubject})) > 0)
  `),
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
  check("shop_orders_paid_amount_truth", sql`
    (${table.fundsPaidAmount} is null
      and ${table.fundsPaidCurrency} is null
      and ${table.fundsAmountUpdatedAt} is null)
    or (${table.fundsPaidAmount} > 0
      and ${table.fundsPaidCurrency} = ${table.currency}
      and ${table.fundsAmountUpdatedAt} is not null)
  `),
  check("shop_orders_refund_cap", sql`
    ${table.fundsRefundedAmount} >= 0
    and (${table.fundsPaidAmount} is null or ${table.fundsRefundedAmount} <= ${table.fundsPaidAmount})
  `),
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
  correctionCount: integer("correction_count").default(0).notNull(),
  merchandiseRefundCapAmount: integer("merchandise_refund_cap_amount"),
  deliveryRefundCapAmount: integer("delivery_refund_cap_amount"),
  deliveryRefundAllowance: integer("delivery_refund_allowance").default(0).notNull(),
  refundCapCurrency: varchar("refund_cap_currency", { length: 3 }),
}, (table) => [
  uniqueIndex("shop_order_returns_order_unique").on(table.orderId),
  uniqueIndex("shop_order_returns_customer_idempotency_unique").on(table.customerId, table.idempotencyKey),
  index("shop_order_returns_status_requested_idx").on(table.status, table.requestedAt),
  check("shop_order_returns_request_fingerprint_sha256", sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check("shop_order_returns_detail_length", sql`length(trim(${table.detail})) between 10 and 500`),
  check("shop_order_returns_correction_once", sql`${table.correctionCount} between 0 and 1`),
  check("shop_order_returns_refund_caps", sql`
    (${table.merchandiseRefundCapAmount} is null or ${table.merchandiseRefundCapAmount} >= 0)
    and (${table.deliveryRefundCapAmount} is null or ${table.deliveryRefundCapAmount} >= 0)
    and ${table.deliveryRefundAllowance} >= 0
    and (${table.deliveryRefundCapAmount} is null or ${table.deliveryRefundAllowance} <= ${table.deliveryRefundCapAmount})
    and (${table.refundCapCurrency} is null or ${table.refundCapCurrency} = 'NGN')
  `),
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
      and ${table.refundStatus} = 'COMPLETED')
    or (${table.status} <> 'RESOLVED'
      and ${table.resolvedAt} is null
      and ${table.disposition} is null)
  `),
]);

export const shopOrderReturnItems = pgTable("shop_order_return_items", {
  returnId: uuid("return_id")
    .notNull()
    .references(() => shopOrderReturns.id, { onDelete: "cascade" }),
  orderItemId: uuid("order_item_id")
    .notNull()
    .references(() => shopOrderItems.id, { onDelete: "restrict" }),
  sku: text("sku").notNull(),
  refundCapAmount: integer("refund_cap_amount").notNull(),
  disposition: shopReturnDisposition("disposition"),
  resolvedAt: timestamp("resolved_at", { withTimezone: true }),
}, (table) => [
  primaryKey({ columns: [table.returnId, table.orderItemId] }),
  uniqueIndex("shop_order_return_items_return_sku_unique").on(table.returnId, table.sku),
  index("shop_order_return_items_order_item_idx").on(table.orderItemId),
  check("shop_order_return_items_refund_cap_nonnegative", sql`${table.refundCapAmount} >= 0`),
  check("shop_order_return_items_resolution_pair", sql`
    (${table.disposition} is null and ${table.resolvedAt} is null)
    or (${table.disposition} is not null and ${table.resolvedAt} is not null)
  `),
]);

export const shopOrderRecoveries = pgTable("shop_order_recoveries", {
  id: uuid("id").defaultRandom().primaryKey(),
  orderId: uuid("order_id")
    .notNull()
    .references(() => shopOrders.id, { onDelete: "cascade" }),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  status: shopRefundStatus("status").default("PENDING").notNull(),
  reason: text("reason").notNull(),
  refundCapAmount: integer("refund_cap_amount").notNull(),
  refundCurrency: varchar("refund_currency", { length: 3 }).notNull(),
  refundReference: text("refund_reference"),
  refundAmount: integer("refund_amount"),
  requestedBy: text("requested_by").notNull(),
  requestedAt: timestamp("requested_at", { withTimezone: true }).defaultNow().notNull(),
  failedAt: timestamp("failed_at", { withTimezone: true }),
  failureNote: text("failure_note"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("shop_order_recoveries_order_unique").on(table.orderId),
  uniqueIndex("shop_order_recoveries_order_idempotency_unique").on(table.orderId, table.idempotencyKey),
  index("shop_order_recoveries_status_updated_idx").on(table.status, table.updatedAt),
  check("shop_order_recoveries_request_fingerprint_sha256", sql`
    ${table.requestFingerprint} ~ '^[0-9a-f]{64}$'
  `),
  check("shop_order_recoveries_reason_length", sql`length(trim(${table.reason})) between 4 and 500`),
  check("shop_order_recoveries_status_started", sql`${table.status} <> 'NOT_STARTED'`),
  check("shop_order_recoveries_refund_cap", sql`
    ${table.refundCapAmount} > 0 and ${table.refundCurrency} = 'NGN'
  `),
  check("shop_order_recoveries_state_facts", sql`
    (${table.status} = 'PENDING'
      and ${table.refundReference} is null
      and ${table.refundAmount} is null
      and ${table.failedAt} is null
      and ${table.completedAt} is null)
    or (${table.status} = 'FAILED'
      and ${table.refundReference} is null
      and ${table.refundAmount} is null
      and ${table.failedAt} is not null
      and ${table.completedAt} is null
      and length(trim(${table.failureNote})) > 0)
    or (${table.status} = 'COMPLETED'
      and ${table.refundReference} is not null
      and ${table.refundAmount} = ${table.refundCapAmount}
      and ${table.failedAt} is null
      and ${table.completedAt} is not null)
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
  "INDETERMINATE",
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
  sourceAssetId: uuid("source_asset_id"),
  sourceSha256: varchar("source_sha256", { length: 64 }),
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
  check("studio_intakes_source_binding", sql`
    (${table.sourceAssetId} is null and ${table.sourceSha256} is null)
    or (${table.sourceAssetId} is not null and ${table.sourceSha256} ~ '^[0-9a-f]{64}$')
  `),
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
  requestId: uuid("request_id"),
  paidScopeKey: varchar("paid_scope_key", { length: 160 }),
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
  executionToken: uuid("execution_token"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  providerInvocationStartedAt: timestamp("provider_invocation_started_at", { withTimezone: true }),
  providerResultReceivedAt: timestamp("provider_result_received_at", { withTimezone: true }),
  providerResultBlobPathname: text("provider_result_blob_pathname"),
  providerResultMimeType: varchar("provider_result_mime_type", { length: 80 }),
  providerResultByteSize: integer("provider_result_byte_size"),
  providerResultSha256: varchar("provider_result_sha256", { length: 64 }),
  providerResultMetadata: jsonb("provider_result_metadata").$type<Record<string, unknown>>(),
  finalDecision: studioDecisionKind("final_decision"),
  finalDecisionNoteSha256: varchar("final_decision_note_sha256", { length: 64 }),
  decidedAt: timestamp("decided_at", { withTimezone: true }),
  outputAssetId: uuid("output_asset_id").references(() => studioAssets.id, { onDelete: "set null" }),
  usage: jsonb("usage").$type<Record<string, unknown>>(),
  costUsd: text("cost_usd"),
  errorCode: varchar("error_code", { length: 80 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_generations_intake_fingerprint_unique").on(table.intakeId, table.fingerprint),
  uniqueIndex("studio_generations_intake_request_unique").on(table.intakeId, table.requestId).where(sql`${table.requestId} is not null`),
  uniqueIndex("studio_generations_paid_scope_fence_unique").on(table.paidScopeKey).where(sql`${table.paidScopeKey} is not null`),
  uniqueIndex("studio_generations_active_paid_scope_unique").on(
    table.intakeId,
    table.operation,
    sql`(case
      when ${table.operation} = 'MODEL_TRY_ON'
        then 'model:' || coalesce(${table.parameters}->>'modelProfileId', 'missing')
      when ${table.operation} = 'EDITORIAL_MODEL'
        then 'parent:' || coalesce(${table.parameters}->>'parentGenerationId', 'missing')
      else 'base'
    end)`,
    sql`(coalesce(${table.parameters}->>'attempt', '1'))`,
  ).where(sql`
    ${table.state} in ('PENDING', 'RUNNING')
    and ${table.operation} in (
      'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
      'MODEL_TRY_ON', 'EDITORIAL_MODEL'
    )
  `),
  index("studio_generations_intake_created_idx").on(table.intakeId, table.createdAt),
  index("studio_generations_running_lease_idx").on(table.leaseExpiresAt).where(sql`${table.state} = 'RUNNING'`),
  check("studio_generations_prompt_hash", sql`${table.promptHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_generations_fingerprint", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
  check("studio_generations_source_ids_array", sql`jsonb_typeof(${table.sourceAssetIds}) = 'array'`),
  check("studio_generations_source_hashes_array", sql`jsonb_typeof(${table.sourceHashes}) = 'array'`),
  check("studio_generations_parameters_object", sql`jsonb_typeof(${table.parameters}) = 'object'`),
  check("studio_generations_paid_attempt", sql`
    ${table.operation} not in (
      'GARMENT_ANALYSIS', 'GARMENT_FRONT', 'MANNEQUIN_FRONT',
      'MODEL_TRY_ON', 'EDITORIAL_MODEL'
    ) or (
      jsonb_typeof(${table.parameters}->'attempt') = 'number'
      and (${table.parameters}->>'attempt')::integer between 1 and 2
    )
  `),
  check("studio_generations_execution_lease", sql`
    (${table.state} = 'RUNNING'
      and ${table.executionToken} is not null
      and ${table.startedAt} is not null
      and ${table.leaseExpiresAt} is not null)
    or (${table.state} <> 'RUNNING' and ${table.leaseExpiresAt} is null)
  `),
  check("studio_generations_provider_checkpoints", sql`
    (${table.providerInvocationStartedAt} is null
      and ${table.providerResultReceivedAt} is null
      and ${table.providerResultBlobPathname} is null
      and ${table.providerResultMimeType} is null
      and ${table.providerResultByteSize} is null
      and ${table.providerResultSha256} is null)
    or (${table.providerInvocationStartedAt} is not null
      and ${table.providerResultReceivedAt} is null
      and ${table.providerResultBlobPathname} is null
      and ${table.providerResultMimeType} is null
      and ${table.providerResultByteSize} is null
      and ${table.providerResultSha256} is null)
    or (${table.providerInvocationStartedAt} is not null
      and ${table.providerResultReceivedAt} is not null
      and ${table.providerResultBlobPathname} is not null
      and ${table.providerResultMimeType} is not null
      and ${table.providerResultByteSize} > 0
      and ${table.providerResultSha256} ~ '^[0-9a-f]{64}$')
  `),
  check("studio_generations_provider_result_metadata", sql`
    ${table.providerResultMetadata} is null
    or jsonb_typeof(${table.providerResultMetadata}) = 'object'
  `),
  check("studio_generations_indeterminate_reason", sql`
    ${table.state} <> 'INDETERMINATE' or ${table.errorCode} is not null
  `),
  check("studio_generations_final_decision", sql`
    (${table.finalDecision} is null and ${table.finalDecisionNoteSha256} is null and ${table.decidedAt} is null)
    or (${table.finalDecision} is not null
      and ${table.finalDecisionNoteSha256} ~ '^[0-9a-f]{64}$'
      and ${table.decidedAt} is not null)
  `),
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
  idempotencyKey: varchar("idempotency_key", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("studio_decisions_intake_created_idx").on(table.intakeId, table.createdAt),
  uniqueIndex("studio_decisions_idempotency_unique").on(table.idempotencyKey).where(sql`${table.idempotencyKey} is not null`),
]);

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
  targetCollectionId: uuid("target_collection_id")
    .references(() => shopCollections.id, { onDelete: "restrict" }),
  approvedAssetId: uuid("approved_asset_id").references(() => studioAssets.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_wardrobe_items_intake_unique").on(table.intakeId),
  index("studio_wardrobe_items_operator_updated_idx").on(table.operatorSubject, table.updatedAt),
  index("studio_wardrobe_items_target_collection_idx").on(table.targetCollectionId),
  check("studio_wardrobe_items_price_nonnegative", sql`${table.price} >= 0`),
  check("studio_wardrobe_items_quantity_one", sql`${table.quantity} = 1`),
  check("studio_wardrobe_items_version_positive", sql`${table.version} > 0`),
  check("studio_wardrobe_items_state_private", sql`${table.state} in ('DRAFT', 'READY', 'ARCHIVED')`),
]);

// Append-only AI media jobs keep the authority source, generated candidate,
// actual Gateway accounting, and operator decision separate from a capture
// that can satisfy catalogue publication.
export const studioMediaCompletionJobs = pgTable("studio_media_completion_jobs", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  targetKind: varchar("target_kind", { length: 32 }).notNull(),
  targetKey: varchar("target_key", { length: 80 }).notNull(),
  role: varchar("role", { length: 32 }).notNull(),
  state: varchar("state", { length: 24 }).default("PENDING").notNull(),
  attempt: integer("attempt").notNull(),
  executionToken: uuid("execution_token"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  model: text("model").notNull(),
  promptVersion: varchar("prompt_version", { length: 48 }).notNull(),
  promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  fingerprint: varchar("fingerprint", { length: 64 }).notNull(),
  correction: text("correction"),
  sourceBlobPathname: text("source_blob_pathname").notNull(),
  sourceMimeType: varchar("source_mime_type", { length: 80 }).notNull(),
  sourceByteSize: integer("source_byte_size").notNull(),
  sourceWidth: integer("source_width"),
  sourceHeight: integer("source_height"),
  sourceSha256: varchar("source_sha256", { length: 64 }).notNull(),
  authorityConfirmedAt: timestamp("authority_confirmed_at", { withTimezone: true }).notNull(),
  sourceValidation: jsonb("source_validation").$type<Record<string, unknown>>(),
  validationUsage: jsonb("validation_usage").$type<Record<string, unknown>>(),
  validationCostUsd: text("validation_cost_usd"),
  outputBlobPathname: text("output_blob_pathname"),
  outputMimeType: varchar("output_mime_type", { length: 80 }),
  outputByteSize: integer("output_byte_size"),
  outputWidth: integer("output_width"),
  outputHeight: integer("output_height"),
  outputSha256: varchar("output_sha256", { length: 64 }),
  usage: jsonb("usage").$type<Record<string, unknown>>(),
  costUsd: text("cost_usd"),
  errorCode: varchar("error_code", { length: 80 }),
  approvedAt: timestamp("approved_at", { withTimezone: true }),
  rejectedAt: timestamp("rejected_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_media_completion_jobs_fingerprint_unique").on(
    table.operatorSubject,
    table.fingerprint,
  ),
  uniqueIndex("studio_media_completion_jobs_attempt_slot_unique").on(
    table.operatorSubject,
    table.targetKind,
    table.targetKey,
    table.role,
    table.attempt,
  ),
  index("studio_media_completion_jobs_target_idx").on(
    table.operatorSubject,
    table.targetKind,
    table.targetKey,
    table.role,
    table.createdAt,
  ),
  check("studio_media_completion_jobs_target_known", sql`${table.targetKind} in ('PENDING_PRODUCT', 'WARDROBE_ITEM')`),
  check("studio_media_completion_jobs_role_known", sql`${table.role} in ('GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL')`),
  check("studio_media_completion_jobs_state_known", sql`${table.state} in ('PENDING', 'RUNNING', 'COMPLETE', 'APPROVED', 'REJECTED', 'FAILED')`),
  check("studio_media_completion_jobs_attempt_bounded", sql`${table.attempt} in (1, 2)`),
  check("studio_media_completion_jobs_execution_lease", sql`
    (${table.state} = 'RUNNING'
      and ${table.executionToken} is not null
      and ${table.startedAt} is not null
      and ${table.leaseExpiresAt} is not null)
    or (${table.state} <> 'RUNNING'
      and ${table.executionToken} is null
      and ${table.startedAt} is null
      and ${table.leaseExpiresAt} is null)
  `),
  check("studio_media_completion_jobs_prompt_hash", sql`${table.promptHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_media_completion_jobs_fingerprint", sql`${table.fingerprint} ~ '^[0-9a-f]{64}$'`),
  check("studio_media_completion_jobs_source_sha256", sql`${table.sourceSha256} ~ '^[0-9a-f]{64}$'`),
  check("studio_media_completion_jobs_source_bytes_positive", sql`${table.sourceByteSize} > 0`),
  check("studio_media_completion_jobs_output_complete", sql`
    (${table.state} in ('PENDING', 'RUNNING', 'FAILED')
      and ${table.approvedAt} is null and ${table.rejectedAt} is null)
    or (${table.state} = 'COMPLETE'
      and ${table.sourceValidation} is not null
      and ${table.outputBlobPathname} is not null and ${table.outputMimeType} is not null
      and ${table.outputByteSize} > 0 and ${table.outputSha256} ~ '^[0-9a-f]{64}$'
      and ${table.approvedAt} is null and ${table.rejectedAt} is null)
    or (${table.state} = 'APPROVED'
      and ${table.sourceValidation} is not null
      and ${table.outputBlobPathname} is not null and ${table.outputMimeType} is not null
      and ${table.outputByteSize} > 0 and ${table.outputSha256} ~ '^[0-9a-f]{64}$'
      and ${table.approvedAt} is not null and ${table.rejectedAt} is null)
    or (${table.state} = 'REJECTED'
      and ${table.sourceValidation} is not null
      and ${table.outputBlobPathname} is not null and ${table.outputMimeType} is not null
      and ${table.outputByteSize} > 0 and ${table.outputSha256} ~ '^[0-9a-f]{64}$'
      and ${table.approvedAt} is null and ${table.rejectedAt} is not null)
  `),
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
  origin: varchar("origin", { length: 24 }).default("DIRECT").notNull(),
  completionJobId: uuid("completion_job_id").references(() => studioMediaCompletionJobs.id, { onDelete: "restrict" }),
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
  check("studio_pending_product_captures_origin_known", sql`${table.origin} in ('DIRECT', 'AI_DERIVED')`),
  check("studio_pending_product_captures_lineage", sql`
    (${table.origin} = 'DIRECT' and ${table.completionJobId} is null)
    or (${table.origin} = 'AI_DERIVED' and ${table.completionJobId} is not null)
  `),
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
  origin: varchar("origin", { length: 32 }).default("STUDIO_NATIVE").notNull(),
  state: varchar("state", { length: 24 }).default("PUBLISHED").notNull(),
  facts: jsonb("facts").$type<Record<string, unknown>>().notNull(),
  media: jsonb("media").$type<Array<
    | {
        slot: "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL";
        src: string;
        pathname: string;
        sourceSha256: string;
        sha256: string;
        mimeType: string;
        width: number;
        height: number;
      }
    | {
        origin: "CATALOGUE_BASELINE";
        slot: "GARMENT_FRONT" | "GARMENT_BACK" | "FABRIC_DETAIL";
        src: string;
      }
  >>().notNull(),
  baseline: jsonb("baseline").$type<Record<string, unknown>>(),
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
  check("studio_catalogue_publications_origin_known", sql`${table.origin} in ('STUDIO_NATIVE', 'CATALOGUE_ADOPTED')`),
  check("studio_catalogue_publications_origin_baseline", sql`
    (${table.origin} = 'STUDIO_NATIVE' and ${table.baseline} is null)
    or (${table.origin} = 'CATALOGUE_ADOPTED' and jsonb_typeof(${table.baseline}) = 'object')
  `),
  check("studio_catalogue_publications_state_known", sql`${table.state} in ('PUBLISHED', 'UNPUBLISHED', 'ARCHIVED')`),
  check("studio_catalogue_publications_facts_object", sql`jsonb_typeof(${table.facts}) = 'object'`),
  check("studio_catalogue_publications_media_array", sql`jsonb_typeof(${table.media}) = 'array'`),
]);

export const studioGarmentRevisions = pgTable("studio_garment_revisions", {
  id: uuid("id").defaultRandom().primaryKey(),
  wardrobeItemId: uuid("wardrobe_item_id")
    .notNull()
    .references(() => studioWardrobeItems.id, { onDelete: "restrict" }),
  operatorSubject: text("operator_subject").notNull(),
  revisionNumber: integer("revision_number").notNull(),
  version: integer("version").default(1).notNull(),
  state: varchar("state", { length: 24 }).notNull(),
  baseSourceRevision: varchar("base_source_revision", { length: 64 }).notNull(),
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
  idempotencyKey: varchar("idempotency_key", { length: 160 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  publishedAt: timestamp("published_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("studio_garment_revisions_number_unique").on(table.wardrobeItemId, table.revisionNumber),
  uniqueIndex("studio_garment_revisions_one_draft_unique")
    .on(table.wardrobeItemId)
    .where(sql`${table.state} = 'DRAFT'`),
  uniqueIndex("studio_garment_revisions_one_published_unique")
    .on(table.wardrobeItemId)
    .where(sql`${table.state} = 'PUBLISHED'`),
  uniqueIndex("studio_garment_revisions_operator_idempotency_unique")
    .on(table.operatorSubject, table.idempotencyKey)
    .where(sql`${table.idempotencyKey} is not null`),
  index("studio_garment_revisions_operator_updated_idx").on(table.operatorSubject, table.updatedAt),
  check("studio_garment_revisions_revision_positive", sql`${table.revisionNumber} > 0 and ${table.version} > 0`),
  check("studio_garment_revisions_state_known", sql`${table.state} in ('DRAFT', 'PUBLISHED', 'SUPERSEDED', 'DISCARDED')`),
  check("studio_garment_revisions_base_sha256", sql`${table.baseSourceRevision} ~ '^[0-9a-f]{64}$'`),
  check("studio_garment_revisions_facts_object", sql`jsonb_typeof(${table.facts}) = 'object'`),
  check("studio_garment_revisions_media_array", sql`jsonb_typeof(${table.media}) = 'array'`),
  check("studio_garment_revisions_publish_pair", sql`
    (${table.state} = 'PUBLISHED' and ${table.publishedAt} is not null)
    or (${table.state} <> 'PUBLISHED')
  `),
]);

export const studioGarmentEvents = pgTable("studio_garment_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  wardrobeItemId: uuid("wardrobe_item_id")
    .notNull()
    .references(() => studioWardrobeItems.id, { onDelete: "restrict" }),
  operatorSubject: text("operator_subject").notNull(),
  eventType: varchar("event_type", { length: 48 }).notNull(),
  summary: text("summary").notNull(),
  details: jsonb("details").$type<Record<string, unknown>>().default({}).notNull(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("studio_garment_events_piece_time_idx").on(table.wardrobeItemId, table.occurredAt),
  check("studio_garment_events_type_known", sql`${table.eventType} in (
    'COMMITTED', 'FACTS_UPDATED', 'REVISION_STARTED', 'REVISION_DISCARDED',
    'REVISION_PUBLISHED', 'PUBLISHED', 'UNPUBLISHED', 'REPUBLISHED',
    'ARCHIVED', 'MEDIA_REPLACED'
  )`),
  check("studio_garment_events_summary_nonempty", sql`length(trim(${table.summary})) > 0`),
  check("studio_garment_events_details_object", sql`jsonb_typeof(${table.details}) = 'object'`),
]);

export const studioManualHolds = pgTable("studio_manual_holds", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  sku: varchar("sku", { length: 40 })
    .notNull()
    .references(() => shopCatalogueItems.sku, { onDelete: "restrict", onUpdate: "cascade" }),
  customerName: text("customer_name").notNull(),
  contact: text("contact").notNull(),
  reason: text("reason").notNull(),
  status: varchar("status", { length: 24 }).default("ACTIVE").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  releasedAt: timestamp("released_at", { withTimezone: true }),
}, (table) => [
  uniqueIndex("studio_manual_holds_operator_idempotency_unique").on(table.operatorSubject, table.idempotencyKey),
  uniqueIndex("studio_manual_holds_active_sku_unique")
    .on(table.sku)
    .where(sql`${table.status} = 'ACTIVE'`),
  index("studio_manual_holds_operator_created_idx").on(table.operatorSubject, table.createdAt),
  check("studio_manual_holds_status_known", sql`${table.status} in ('ACTIVE', 'RELEASED', 'EXPIRED')`),
  check("studio_manual_holds_release_pair", sql`
    (${table.status} = 'ACTIVE' and ${table.releasedAt} is null)
    or (${table.status} <> 'ACTIVE' and ${table.releasedAt} is not null)
  `),
  check("studio_manual_holds_expiry_after_create", sql`${table.expiresAt} > ${table.createdAt}`),
]);

export const studioNotificationReceipts = pgTable("studio_notification_receipts", {
  operatorSubject: text("operator_subject").notNull(),
  notificationId: varchar("notification_id", { length: 240 }).notNull(),
  dismissedAt: timestamp("dismissed_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.operatorSubject, table.notificationId] }),
]);

// Drop changes are durable commands, not implicit label edits. The stored
// before/after snapshots are deliberately operator-safe so every UI surface
// can render the same receipt after a retry or refresh.
export const studioCollectionCommands = pgTable("studio_collection_commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  requestFingerprint: varchar("request_fingerprint", { length: 64 }).notNull(),
  command: varchar("command", { length: 40 }).notNull(),
  collectionId: uuid("collection_id")
    .notNull()
    .references(() => shopCollections.id, { onDelete: "restrict" }),
  collectionKey: varchar("collection_key", { length: 80 }).notNull(),
  beforeState: jsonb("before_state").$type<Record<string, unknown>>().notNull(),
  afterState: jsonb("after_state").$type<Record<string, unknown>>().notNull(),
  consequence: text("consequence").notNull(),
  nextRoute: text("next_route").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_collection_commands_operator_idempotency_unique").on(
    table.operatorSubject,
    table.idempotencyKey,
  ),
  index("studio_collection_commands_collection_created_idx").on(table.collectionId, table.createdAt),
  check("studio_collection_commands_fingerprint", sql`${table.requestFingerprint} ~ '^[0-9a-f]{64}$'`),
  check("studio_collection_commands_known", sql`
    ${table.command} in ('CREATE_COLLECTION', 'RENAME_COLLECTION', 'ACTIVATE_COLLECTION', 'ARCHIVE_COLLECTION')
  `),
  check("studio_collection_commands_before_object", sql`jsonb_typeof(${table.beforeState}) = 'object'`),
  check("studio_collection_commands_after_object", sql`jsonb_typeof(${table.afterState}) = 'object'`),
]);

// A move changes the expected Studio location without rewriting commerce
// custody. The command is append-only; this projection is the current answer.
export const studioPieceCustodyCommands = pgTable("studio_piece_custody_commands", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  pieceKey: varchar("piece_key", { length: 96 }).notNull(),
  command: varchar("command", { length: 24 }).notNull(),
  fromLocationKey: varchar("from_location_key", { length: 40 }).notNull(),
  fromLocationLabel: text("from_location_label").notNull(),
  toLocationKey: varchar("to_location_key", { length: 40 }).notNull(),
  toLocationLabel: text("to_location_label").notNull(),
  custody: varchar("custody", { length: 24 }).notNull(),
  availability: varchar("availability", { length: 24 }).notNull(),
  orderReference: varchar("order_reference", { length: 40 }),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_piece_custody_command_operator_idempotency_unique").on(
    table.operatorSubject,
    table.idempotencyKey,
  ),
  index("studio_piece_custody_commands_piece_idx").on(table.operatorSubject, table.pieceKey, table.createdAt),
  check("studio_piece_custody_command_known", sql`${table.command} = 'MOVE'`),
  check("studio_piece_custody_command_custody_known", sql`${table.custody} = 'STUDIO'`),
  check("studio_piece_custody_command_availability_known", sql`
    ${table.availability} in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')
  `),
  check("studio_piece_custody_command_location_known", sql`
    ${table.toLocationKey} in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  `),
]);

export const studioPieceCustody = pgTable("studio_piece_custody", {
  operatorSubject: text("operator_subject").notNull(),
  pieceKey: varchar("piece_key", { length: 96 }).notNull(),
  locationKey: varchar("location_key", { length: 40 }).notNull(),
  locationLabel: text("location_label").notNull(),
  custody: varchar("custody", { length: 24 }).notNull(),
  availability: varchar("availability", { length: 24 }).notNull(),
  orderReference: varchar("order_reference", { length: 40 }),
  lastCommandId: uuid("last_command_id")
    .notNull()
    .references(() => studioPieceCustodyCommands.id, { onDelete: "restrict" }),
  version: integer("version").default(1).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  primaryKey({ columns: [table.operatorSubject, table.pieceKey] }),
  check("studio_piece_custody_custody_known", sql`${table.custody} = 'STUDIO'`),
  check("studio_piece_custody_availability_known", sql`
    ${table.availability} in ('PRIVATE', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED')
  `),
  check("studio_piece_custody_location_known", sql`
    ${table.locationKey} in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  `),
  check("studio_piece_custody_version_positive", sql`${table.version} > 0`),
]);

// A stocktake freezes the pieces expected at one Studio location. Physical
// observations are stored separately and append-only so a count never rewrites
// commerce availability or erases an earlier mismatch.
export const studioStocktakes = pgTable("studio_stocktakes", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  locationKey: varchar("location_key", { length: 40 }).notNull(),
  locationLabel: text("location_label").notNull(),
  state: varchar("state", { length: 24 }).default("OPEN").notNull(),
  expectedPieces: jsonb("expected_pieces").$type<Array<{
    pieceKey: string;
    wardrobeItemId: string | null;
    sku: string | null;
    title: string;
    expectedLocationKey: string;
    expectedLocationLabel: string;
    expectedCustody: "STUDIO" | "COURIER" | "CUSTOMER" | "UNKNOWN";
    availability: "PRIVATE" | "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
    orderReference: string | null;
  }>>().notNull(),
  version: integer("version").default(1).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).defaultNow().notNull(),
  closedAt: timestamp("closed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_stocktakes_operator_idempotency_unique").on(
    table.operatorSubject,
    table.idempotencyKey,
  ),
  uniqueIndex("studio_stocktakes_operator_open_unique")
    .on(table.operatorSubject)
    .where(sql`${table.state} = 'OPEN'`),
  index("studio_stocktakes_operator_started_idx").on(table.operatorSubject, table.startedAt),
  check("studio_stocktakes_location_known", sql`
    ${table.locationKey} in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  `),
  check("studio_stocktakes_state_known", sql`${table.state} in ('OPEN', 'CLOSED')`),
  check("studio_stocktakes_expected_array", sql`jsonb_typeof(${table.expectedPieces}) = 'array'`),
  check("studio_stocktakes_expected_nonempty", sql`jsonb_array_length(${table.expectedPieces}) > 0`),
  check("studio_stocktakes_version_positive", sql`${table.version} > 0`),
  check("studio_stocktakes_close_pair", sql`
    (${table.state} = 'OPEN' and ${table.closedAt} is null)
    or (${table.state} = 'CLOSED' and ${table.closedAt} is not null)
  `),
]);

export const studioPhysicalObservations = pgTable("studio_physical_observations", {
  id: uuid("id").defaultRandom().primaryKey(),
  stocktakeId: uuid("stocktake_id").references(() => studioStocktakes.id, { onDelete: "restrict" }),
  operatorSubject: text("operator_subject").notNull(),
  idempotencyKey: varchar("idempotency_key", { length: 160 }).notNull(),
  pieceKey: varchar("piece_key", { length: 96 }).notNull(),
  wardrobeItemId: uuid("wardrobe_item_id").references(() => studioWardrobeItems.id, { onDelete: "restrict" }),
  sku: varchar("sku", { length: 40 }).references(() => shopCatalogueItems.sku, {
    onDelete: "restrict",
    onUpdate: "cascade",
  }),
  command: varchar("command", { length: 32 }).default("CONFIRM_IN_HAND").notNull(),
  expectedLocationKey: varchar("expected_location_key", { length: 40 }).notNull(),
  expectedLocationLabel: text("expected_location_label").notNull(),
  expectedCustody: varchar("expected_custody", { length: 24 }).notNull(),
  observedLocationKey: varchar("observed_location_key", { length: 40 }).notNull(),
  observedLocationLabel: text("observed_location_label").notNull(),
  observedCustody: varchar("observed_custody", { length: 24 }).default("STUDIO").notNull(),
  result: varchar("result", { length: 24 }).notNull(),
  orderReference: varchar("order_reference", { length: 40 }),
  note: text("note"),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_physical_observations_operator_idempotency_unique").on(
    table.operatorSubject,
    table.idempotencyKey,
  ),
  index("studio_physical_observations_piece_time_idx").on(table.pieceKey, table.occurredAt),
  index("studio_physical_observations_stocktake_time_idx").on(table.stocktakeId, table.occurredAt),
  check("studio_physical_observations_identity", sql`
    ${table.wardrobeItemId} is not null or ${table.sku} is not null
  `),
  check("studio_physical_observations_piece_key_nonempty", sql`length(trim(${table.pieceKey})) > 0`),
  check("studio_physical_observations_command_known", sql`${table.command} = 'CONFIRM_IN_HAND'`),
  check("studio_physical_observations_expected_location_known", sql`
    ${table.expectedLocationKey} in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION', 'COURIER', 'CUSTOMER', 'RETIRED')
  `),
  check("studio_physical_observations_observed_location_known", sql`
    ${table.observedLocationKey} in ('WARDROBE_RAIL', 'PACKING_SHELF', 'RETURN_INSPECTION')
  `),
  check("studio_physical_observations_expected_custody_known", sql`
    ${table.expectedCustody} in ('STUDIO', 'COURIER', 'CUSTOMER', 'UNKNOWN')
  `),
  check("studio_physical_observations_observed_custody_studio", sql`${table.observedCustody} = 'STUDIO'`),
  check("studio_physical_observations_result_known", sql`${table.result} in ('MATCH', 'MISMATCH')`),
  check("studio_physical_observations_note_length", sql`
    ${table.note} is null or length(${table.note}) <= 240
  `),
]);

// Provider-neutral Atelier operations are durable intent records. They do not
// replace the legacy Studio generation tables: an operation captures the
// approved production declaration, while one or more executions capture paid
// provider attempts against that immutable declaration.
export const studioAtelierOperations = pgTable("studio_atelier_operations", {
  id: uuid("id").defaultRandom().primaryKey(),
  operatorSubject: text("operator_subject").notNull(),
  operationKey: varchar("operation_key", { length: 160 }).notNull(),
  garmentId: varchar("garment_id", { length: 80 }).notNull(),
  view: varchar("view", { length: 24 }).notNull(),
  stage: varchar("stage", { length: 48 }).notNull(),
  contractVersion: varchar("contract_version", { length: 64 }).notNull(),
  workflowRevision: varchar("workflow_revision", { length: 80 }).notNull(),
  semanticHash: varchar("semantic_hash", { length: 64 }).notNull(),
  rootSemanticHash: varchar("root_semantic_hash", { length: 64 }).notNull(),
  correctionOfSemanticHash: varchar("correction_of_semantic_hash", { length: 64 }),
  correctionOrdinal: integer("correction_ordinal").default(0).notNull(),
  declarationReceipt: jsonb("declaration_receipt").$type<Record<string, unknown>>().notNull(),
  truthReceipt: jsonb("truth_receipt").$type<Record<string, unknown>>().notNull(),
  canonicalOperation: jsonb("canonical_operation").$type<Record<string, unknown>>().notNull(),
  parentAssets: jsonb("parent_assets").$type<Array<Record<string, unknown>>>().notNull(),
  authorityStack: jsonb("authority_stack").$type<Array<Record<string, unknown>>>().notNull(),
  changeSet: jsonb("change_set").$type<Array<Record<string, unknown>>>().notNull(),
  immutableSet: jsonb("immutable_set").$type<Array<Record<string, unknown>>>().notNull(),
  outputContract: jsonb("output_contract").$type<Record<string, unknown>>().notNull(),
  failureGates: jsonb("failure_gates").$type<string[]>().notNull(),
  state: varchar("state", { length: 24 }).default("PLANNED").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_atelier_operations_operator_key_unique").on(
    table.operatorSubject,
    table.operationKey,
  ),
  uniqueIndex("studio_atelier_operations_operator_semantic_unique").on(
    table.operatorSubject,
    table.semanticHash,
  ),
  uniqueIndex("studio_atelier_operations_one_correction_per_root_unique")
    .on(table.operatorSubject, table.rootSemanticHash)
    .where(sql`${table.correctionOfSemanticHash} is not null`),
  index("studio_atelier_operations_garment_view_idx").on(
    table.operatorSubject,
    table.garmentId,
    table.view,
    table.createdAt,
  ),
  check("studio_atelier_operations_key_present", sql`length(trim(${table.operationKey})) > 0`),
  check("studio_atelier_operations_garment_present", sql`length(trim(${table.garmentId})) > 0`),
  check("studio_atelier_operations_contract_present", sql`length(trim(${table.contractVersion})) > 0`),
  check("studio_atelier_operations_workflow_present", sql`length(trim(${table.workflowRevision})) > 0`),
  check("studio_atelier_operations_semantic_hash", sql`${table.semanticHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_atelier_operations_root_semantic_hash", sql`${table.rootSemanticHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_atelier_operations_correction_hash", sql`
    ${table.correctionOfSemanticHash} is null
    or ${table.correctionOfSemanticHash} ~ '^[0-9a-f]{64}$'
  `),
  check("studio_atelier_operations_correction_lineage", sql`
    (${table.correctionOfSemanticHash} is null
      and ${table.correctionOrdinal} = 0
      and ${table.rootSemanticHash} = ${table.semanticHash})
    or (${table.correctionOfSemanticHash} is not null
      and ${table.correctionOrdinal} = 1
      and ${table.rootSemanticHash} <> ${table.semanticHash})
  `),
  check("studio_atelier_operations_declaration_receipt", sql`
    jsonb_typeof(${table.declarationReceipt}) = 'object'
    and ${table.declarationReceipt}->>'sourceHash' ~ '^[0-9a-f]{64}$'
    and length(trim(${table.declarationReceipt}->>'schemaVersion')) > 0
    and length(trim(${table.declarationReceipt}->>'validatorRevision')) > 0
    and jsonb_typeof(${table.declarationReceipt}->'fileVerification') = 'object'
    and ${table.declarationReceipt}->'fileVerification'->>'status' = 'PASS'
    and ${table.declarationReceipt}->'fileVerification'->>'receiptHash' ~ '^[0-9a-f]{64}$'
    and ${table.declarationReceipt}->'fileVerification'->>'manifestHash' ~ '^[0-9a-f]{64}$'
  `),
  check("studio_atelier_operations_truth_receipt", sql`
    jsonb_typeof(${table.truthReceipt}) = 'object'
    and length(trim(${table.truthReceipt}->>'bundleVersion')) > 0
    and ${table.truthReceipt}->>'stateFileHash' ~ '^[0-9a-f]{64}$'
    and length(trim(${table.truthReceipt}->>'manifestRevision')) > 0
    and ${table.truthReceipt}->>'manifestHash' ~ '^[0-9a-f]{64}$'
    and ${table.truthReceipt}->>'garmentTruthRevision' ~ '^[a-zA-Z0-9._:/-]{1,240}$'
    and ${table.truthReceipt}->>'garmentTruthSourceHash' ~ '^[0-9a-f]{64}$'
  `),
  check("studio_atelier_operations_canonical_object", sql`jsonb_typeof(${table.canonicalOperation}) = 'object'`),
  check("studio_atelier_operations_parent_array", sql`jsonb_typeof(${table.parentAssets}) = 'array'`),
  check("studio_atelier_operations_authority_array", sql`jsonb_typeof(${table.authorityStack}) = 'array'`),
  check("studio_atelier_operations_change_array", sql`jsonb_typeof(${table.changeSet}) = 'array'`),
  check("studio_atelier_operations_immutable_array", sql`jsonb_typeof(${table.immutableSet}) = 'array'`),
  check("studio_atelier_operations_output_object", sql`jsonb_typeof(${table.outputContract}) = 'object'`),
  check("studio_atelier_operations_failure_array", sql`jsonb_typeof(${table.failureGates}) = 'array'`),
  check("studio_atelier_operations_state_known", sql`
    ${table.state} in ('PLANNED', 'ACTIVE', 'COMPLETE', 'FAILED', 'QUARANTINED', 'INDETERMINATE')
  `),
]);

export const studioAtelierExecutions = pgTable("studio_atelier_executions", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationId: uuid("operation_id")
    .notNull()
    .references(() => studioAtelierOperations.id, { onDelete: "restrict" }),
  attempt: integer("attempt").notNull(),
  state: varchar("state", { length: 24 }).default("INTENT").notNull(),
  adapter: varchar("adapter", { length: 80 }).notNull(),
  model: text("model").notNull(),
  executionHash: varchar("execution_hash", { length: 64 }).notNull(),
  promptVersion: varchar("prompt_version", { length: 64 }).notNull(),
  compiledPrompt: text("compiled_prompt").notNull(),
  promptHash: varchar("prompt_hash", { length: 64 }).notNull(),
  orderedBindings: jsonb("ordered_bindings").$type<Array<Record<string, unknown>>>().notNull(),
  parameters: jsonb("parameters").$type<Record<string, unknown>>().notNull(),
  executionToken: uuid("execution_token"),
  leaseFence: integer("lease_fence").default(0).notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }),
  leaseExpiresAt: timestamp("lease_expires_at", { withTimezone: true }),
  providerInvocationStartedAt: timestamp("provider_invocation_started_at", { withTimezone: true }),
  providerResultReceivedAt: timestamp("provider_result_received_at", { withTimezone: true }),
  providerResultManifest: jsonb("provider_result_manifest").$type<Record<string, unknown>>(),
  usage: jsonb("usage").$type<Record<string, unknown>>(),
  costUsd: text("cost_usd"),
  warnings: jsonb("warnings").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  sanitizedResponses: jsonb("sanitized_responses").$type<Array<Record<string, unknown>>>().default([]).notNull(),
  requestIds: jsonb("request_ids").$type<string[]>().default([]).notNull(),
  durationMs: integer("duration_ms"),
  errorCode: varchar("error_code", { length: 96 }),
  errorMessage: text("error_message"),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_atelier_executions_operation_attempt_unique").on(table.operationId, table.attempt),
  uniqueIndex("studio_atelier_executions_operation_hash_unique").on(table.operationId, table.executionHash),
  uniqueIndex("studio_atelier_executions_active_operation_unique")
    .on(table.operationId)
    .where(sql`${table.state} in ('RUNNING', 'PERSISTING')`),
  index("studio_atelier_executions_operation_created_idx").on(table.operationId, table.createdAt),
  index("studio_atelier_executions_recovery_idx").on(table.state, table.leaseExpiresAt),
  check("studio_atelier_executions_attempt_positive", sql`${table.attempt} > 0`),
  check("studio_atelier_executions_state_known", sql`
    ${table.state} in ('INTENT', 'RUNNING', 'PERSISTING', 'COMPLETE', 'FAILED', 'QUARANTINED', 'INDETERMINATE')
  `),
  check("studio_atelier_executions_execution_hash", sql`${table.executionHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_atelier_executions_prompt_hash", sql`${table.promptHash} ~ '^[0-9a-f]{64}$'`),
  check("studio_atelier_executions_prompt_present", sql`length(trim(${table.compiledPrompt})) > 0`),
  check("studio_atelier_executions_bindings_array", sql`jsonb_typeof(${table.orderedBindings}) = 'array'`),
  check("studio_atelier_executions_parameters_object", sql`jsonb_typeof(${table.parameters}) = 'object'`),
  check("studio_atelier_executions_usage_object", sql`${table.usage} is null or jsonb_typeof(${table.usage}) = 'object'`),
  check("studio_atelier_executions_result_manifest_object", sql`
    ${table.providerResultManifest} is null
    or jsonb_typeof(${table.providerResultManifest}) = 'object'
  `),
  check("studio_atelier_executions_warnings_array", sql`jsonb_typeof(${table.warnings}) = 'array'`),
  check("studio_atelier_executions_responses_array", sql`jsonb_typeof(${table.sanitizedResponses}) = 'array'`),
  check("studio_atelier_executions_request_ids_array", sql`jsonb_typeof(${table.requestIds}) = 'array'`),
  check("studio_atelier_executions_cost", sql`
    ${table.costUsd} is null or ${table.costUsd} ~ '^[0-9]+([.][0-9]+)?$'
  `),
  check("studio_atelier_executions_duration_nonnegative", sql`${table.durationMs} is null or ${table.durationMs} >= 0`),
  check("studio_atelier_executions_fence_nonnegative", sql`${table.leaseFence} >= 0`),
  check("studio_atelier_executions_provider_checkpoints", sql`
    (${table.providerInvocationStartedAt} is null
      and ${table.providerResultReceivedAt} is null
      and ${table.providerResultManifest} is null)
    or (${table.providerInvocationStartedAt} is not null
      and ${table.providerResultReceivedAt} is null
      and ${table.providerResultManifest} is null)
    or (${table.providerInvocationStartedAt} is not null
      and ${table.providerResultReceivedAt} is not null
      and ${table.providerResultManifest} is not null)
  `),
  check("studio_atelier_executions_lease", sql`
    (${table.state} = 'INTENT'
      and ${table.executionToken} is null
      and ${table.startedAt} is null
      and ${table.leaseExpiresAt} is null
      and ${table.completedAt} is null)
    or (${table.state} in ('RUNNING', 'PERSISTING')
      and ${table.executionToken} is not null
      and ${table.leaseFence} > 0
      and ${table.startedAt} is not null
      and ${table.leaseExpiresAt} is not null
      and ${table.completedAt} is null)
    or (${table.state} in ('COMPLETE', 'FAILED', 'QUARANTINED', 'INDETERMINATE')
      and ${table.executionToken} is null
      and ${table.startedAt} is not null
      and ${table.leaseExpiresAt} is null
      and ${table.completedAt} is not null)
  `),
  check("studio_atelier_executions_complete_accounting", sql`
    ${table.state} <> 'COMPLETE'
    or (${table.providerInvocationStartedAt} is not null
      and ${table.providerResultReceivedAt} is not null
      and ${table.providerResultManifest} is not null
      and ${table.usage} is not null
      and ${table.costUsd} is not null
      and ${table.durationMs} is not null)
  `),
  check("studio_atelier_executions_exception_reason", sql`
    ${table.state} not in ('QUARANTINED', 'INDETERMINATE') or ${table.errorCode} is not null
  `),
]);

// Artifacts are append-only, private, content-addressed records. Provider bytes
// are written and read back from Blob before a row is inserted, so cost or QA
// policy can quarantine an output without discarding the paid result.
export const studioAtelierArtifacts = pgTable("studio_atelier_artifacts", {
  id: uuid("id").defaultRandom().primaryKey(),
  executionId: uuid("execution_id")
    .notNull()
    .references(() => studioAtelierExecutions.id, { onDelete: "restrict" }),
  ordinal: integer("ordinal").notNull(),
  kind: varchar("kind", { length: 32 }).notNull(),
  role: varchar("role", { length: 80 }).notNull(),
  state: varchar("state", { length: 24 }).default("STORED").notNull(),
  blobPathname: text("blob_pathname").notNull(),
  blobUrl: text("blob_url").notNull(),
  mimeType: varchar("mime_type", { length: 120 }).notNull(),
  byteSize: integer("byte_size").notNull(),
  width: integer("width"),
  height: integer("height"),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  metadata: jsonb("metadata").$type<Record<string, unknown>>().default({}).notNull(),
  quarantineReason: text("quarantine_reason"),
  privacy: varchar("privacy", { length: 24 }).default("PRIVATE").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_atelier_artifacts_execution_kind_ordinal_unique").on(
    table.executionId,
    table.kind,
    table.ordinal,
  ),
  index("studio_atelier_artifacts_execution_created_idx").on(table.executionId, table.createdAt),
  index("studio_atelier_artifacts_sha_idx").on(table.sha256),
  check("studio_atelier_artifacts_ordinal_bounded", sql`${table.ordinal} >= 0 and ${table.ordinal} < 64`),
  check("studio_atelier_artifacts_kind_known", sql`
    ${table.kind} in ('PROVIDER_RAW', 'NORMALIZED', 'SUBJECT_LAYER', 'COMPOSITE', 'DIAGNOSTIC')
  `),
  check("studio_atelier_artifacts_state_known", sql`${table.state} in ('STORED', 'QUARANTINED')`),
  check("studio_atelier_artifacts_bytes_positive", sql`${table.byteSize} > 0`),
  check("studio_atelier_artifacts_dimensions", sql`
    (${table.width} is null and ${table.height} is null)
    or (${table.width} > 0 and ${table.height} > 0)
  `),
  check("studio_atelier_artifacts_sha256", sql`${table.sha256} ~ '^[0-9a-f]{64}$'`),
  check("studio_atelier_artifacts_content_addressed", sql`position(${table.sha256} in ${table.blobPathname}) > 0`),
  check("studio_atelier_artifacts_metadata_object", sql`jsonb_typeof(${table.metadata}) = 'object'`),
  check("studio_atelier_artifacts_quarantine_pair", sql`
    (${table.state} = 'STORED' and ${table.quarantineReason} is null)
    or (${table.state} = 'QUARANTINED' and length(trim(${table.quarantineReason})) > 0)
  `),
  check("studio_atelier_artifacts_private_only", sql`${table.privacy} = 'PRIVATE'`),
]);

// Review and lock state is intentionally separate from execution state.
// COMPLETE on an execution means bytes were materialized; only this projection
// can say that semantic QA, user approval or a lock exists.
export const studioAtelierOperationProjections = pgTable("studio_atelier_operation_projections", {
  operationId: uuid("operation_id")
    .primaryKey()
    .references(() => studioAtelierOperations.id, { onDelete: "restrict" }),
  version: integer("version").default(0).notNull(),
  state: varchar("state", { length: 40 }).default("DRAFT").notNull(),
  technicalDecision: varchar("technical_decision", { length: 16 }).default("PENDING").notNull(),
  semanticDecision: varchar("semantic_decision", { length: 16 }).default("PENDING").notNull(),
  userDecision: varchar("user_decision", { length: 16 }).default("PENDING").notNull(),
  correctionAuthorized: boolean("correction_authorized").default(false).notNull(),
  materializedExecutionId: uuid("materialized_execution_id")
    .references(() => studioAtelierExecutions.id, { onDelete: "restrict" }),
  materializedArtifactId: uuid("materialized_artifact_id")
    .references(() => studioAtelierArtifacts.id, { onDelete: "restrict" }),
  materializedArtifactSha256: varchar("materialized_artifact_sha256", { length: 64 }),
  lockedArtifactId: uuid("locked_artifact_id")
    .references(() => studioAtelierArtifacts.id, { onDelete: "restrict" }),
  lockedAssetId: varchar("locked_asset_id", { length: 200 }),
  lockedArtifactSha256: varchar("locked_artifact_sha256", { length: 64 }),
  lockedParentDescriptor: jsonb("locked_parent_descriptor").$type<Record<string, unknown>>(),
  supersededByOperationId: uuid("superseded_by_operation_id")
    .references(() => studioAtelierOperations.id, { onDelete: "restrict" }),
  blockedReason: varchar("blocked_reason", { length: 96 }),
  lastEventHash: varchar("last_event_hash", { length: 64 }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_atelier_operation_projections_locked_asset_unique")
    .on(table.lockedAssetId)
    .where(sql`${table.lockedAssetId} is not null and ${table.state} = 'LOCKED'`),
  index("studio_atelier_operation_projections_state_idx").on(table.state, table.updatedAt),
  check("studio_atelier_operation_projections_version_nonnegative", sql`${table.version} >= 0`),
  check("studio_atelier_operation_projections_state_known", sql`
    ${table.state} in (
      'DRAFT', 'MATERIALIZED', 'TECHNICAL_PASS', 'TECHNICAL_FAIL', 'SEMANTIC_PASS', 'SEMANTIC_FAIL',
      'USER_APPROVED', 'USER_REJECTED', 'LOCKED', 'SUPERSEDED',
      'BLOCKED_USER_DIRECTION'
    )
  `),
  check("studio_atelier_operation_projections_technical_known", sql`
    ${table.technicalDecision} in ('PENDING', 'PASS', 'FAIL')
  `),
  check("studio_atelier_operation_projections_semantic_known", sql`
    ${table.semanticDecision} in ('PENDING', 'PASS', 'FAIL')
  `),
  check("studio_atelier_operation_projections_user_known", sql`
    ${table.userDecision} in ('PENDING', 'APPROVED', 'REJECTED')
  `),
  check("studio_atelier_operation_projections_materialized_tuple", sql`
    (${table.materializedExecutionId} is null
      and ${table.materializedArtifactId} is null
      and ${table.materializedArtifactSha256} is null)
    or (${table.materializedExecutionId} is not null
      and ${table.materializedArtifactId} is not null
      and ${table.materializedArtifactSha256} ~ '^[0-9a-f]{64}$')
  `),
  check("studio_atelier_operation_projections_lock_tuple", sql`
    (${table.state} = 'LOCKED'
      and ${table.lockedArtifactId} is not null
      and length(trim(${table.lockedAssetId})) > 0
      and ${table.lockedArtifactSha256} ~ '^[0-9a-f]{64}$'
      and jsonb_typeof(${table.lockedParentDescriptor}) = 'object')
    or (${table.state} <> 'LOCKED')
  `),
  check("studio_atelier_operation_projections_event_hash", sql`
    ${table.lastEventHash} is null or ${table.lastEventHash} ~ '^[0-9a-f]{64}$'
  `),
]);

// The event ledger is append-only. Repository commands update the projection
// and insert one hash-chained event in the same compare-and-swap statement.
export const studioAtelierEvents = pgTable("studio_atelier_events", {
  id: uuid("id").defaultRandom().primaryKey(),
  operationId: uuid("operation_id")
    .notNull()
    .references(() => studioAtelierOperations.id, { onDelete: "restrict" }),
  sequence: integer("sequence").notNull(),
  eventType: varchar("event_type", { length: 48 }).notNull(),
  expectedVersion: integer("expected_version").notNull(),
  resultingVersion: integer("resulting_version").notNull(),
  executionId: uuid("execution_id")
    .references(() => studioAtelierExecutions.id, { onDelete: "restrict" }),
  artifactId: uuid("artifact_id")
    .references(() => studioAtelierArtifacts.id, { onDelete: "restrict" }),
  actorSubject: text("actor_subject").notNull(),
  payload: jsonb("payload").$type<Record<string, unknown>>().default({}).notNull(),
  previousEventHash: varchar("previous_event_hash", { length: 64 }),
  eventHash: varchar("event_hash", { length: 64 }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_atelier_events_operation_sequence_unique").on(table.operationId, table.sequence),
  uniqueIndex("studio_atelier_events_hash_unique").on(table.eventHash),
  index("studio_atelier_events_operation_created_idx").on(table.operationId, table.createdAt),
  check("studio_atelier_events_sequence_positive", sql`${table.sequence} > 0`),
  check("studio_atelier_events_versions", sql`
    ${table.expectedVersion} >= 0
    and ${table.resultingVersion} = ${table.expectedVersion} + 1
    and ${table.sequence} = ${table.resultingVersion}
  `),
  check("studio_atelier_events_type_known", sql`
    ${table.eventType} in (
      'MATERIALIZED', 'TECHNICAL_PASS', 'TECHNICAL_FAIL', 'SEMANTIC_PASS', 'SEMANTIC_FAIL',
      'USER_APPROVED', 'USER_REJECTED', 'LOCKED', 'SUPERSEDED',
      'CORRECTION_AUTHORIZED', 'BLOCKED_USER_DIRECTION'
    )
  `),
  check("studio_atelier_events_actor_present", sql`length(trim(${table.actorSubject})) > 0`),
  check("studio_atelier_events_payload_object", sql`jsonb_typeof(${table.payload}) = 'object'`),
  check("studio_atelier_events_previous_hash", sql`
    ${table.previousEventHash} is null or ${table.previousEventHash} ~ '^[0-9a-f]{64}$'
  `),
  check("studio_atelier_events_hash", sql`${table.eventHash} ~ '^[0-9a-f]{64}$'`),
]);
