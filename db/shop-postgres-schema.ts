// Server-only Postgres contract for a future Neon or Supabase adapter.
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
  email: text("email"),
  phone: text("phone"),
  displayName: text("display_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
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
  customerId: uuid("customer_id").references(() => shopCustomers.id, { onDelete: "set null" }),
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
  index("shop_orders_customer_saved_idx").on(table.customerId, table.savedAt),
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
