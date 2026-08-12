// Server-only Postgres contract for the Neon-backed shop adapter.
// Keep this module out of public shop imports; it does not initialize a client or read credentials.
import { sql } from "drizzle-orm";
import {
  check,
  index,
  integer,
  jsonb,
  pgEnum,
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
  savedAt: timestamp("saved_at", { withTimezone: true }).defaultNow().notNull(),
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
  status: shopOrderStatus("status").notNull(),
  note: text("note"),
  metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  occurredAt: timestamp("occurred_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  index("shop_order_events_order_time_idx").on(table.orderId, table.occurredAt),
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

export const studioGenerations = pgTable("studio_generations", {
  id: uuid("id").defaultRandom().primaryKey(),
  intakeId: uuid("intake_id")
    .notNull()
    .references(() => studioIntakes.id, { onDelete: "cascade" }),
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
  approvedAssetId: uuid("approved_asset_id").references(() => studioAssets.id, { onDelete: "restrict" }),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex("studio_wardrobe_items_intake_unique").on(table.intakeId),
  index("studio_wardrobe_items_operator_updated_idx").on(table.operatorSubject, table.updatedAt),
  check("studio_wardrobe_items_price_nonnegative", sql`${table.price} >= 0`),
  check("studio_wardrobe_items_quantity_one", sql`${table.quantity} = 1`),
  check("studio_wardrobe_items_state_private", sql`${table.state} in ('DRAFT', 'READY', 'ARCHIVED')`),
]);
