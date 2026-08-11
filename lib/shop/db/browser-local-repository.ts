import { getShopProduct } from "../catalog";
import { shopDeliveryOptions } from "../commerce";
import type {
  BagItem,
  ShopCheckoutContact,
  ShopNotificationPreferences,
  ShopOrder,
  ShopOrderFulfillment,
  ShopOrderLine,
  ShopProduct,
} from "../domain/entities";
import {
  MAX_LOCAL_ORDERS,
  SHOP_STATE_SCHEMA_VERSION,
  type CommerceSnapshot,
  type StoredShopStateV3,
  createEmptyCommerceSnapshot,
  defaultNotificationPreferences,
} from "../domain/state";
import type { ShopStateRepository } from "../services/contracts";
import { canonicalCatalogueSku } from "../../wardrobe-public-view/sku";

const CURRENT_STORAGE_KEY = "justurban-wears:shop:v3";
const PREVIOUS_STORAGE_KEY = "justurban-wears:shop:v2";
const LEGACY_STORAGE_KEY = "justurban-wears:shop:v1";

type ProductResolver = (slug: string) => ShopProduct | undefined;
type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function safeText(value: unknown, maximum: number, minimum = 1): string | null {
  if (typeof value !== "string") return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length >= minimum && cleaned.length <= maximum ? cleaned : null;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseSaved(value: unknown, resolveProduct: ProductResolver): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((slug): slug is string =>
    typeof slug === "string" && Boolean(resolveProduct(slug)),
  ))];
}

function parseBag(value: unknown, resolveProduct: ProductResolver): BagItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.slug !== "string") return [];
    const product = resolveProduct(candidate.slug);
    if (!product || product.availability !== "AVAILABLE" || seen.has(product.slug)) return [];
    seen.add(product.slug);
    return [{ slug: product.slug, size: product.taggedSize }];
  });
}

function parseNotificationPreferences(value: unknown): ShopNotificationPreferences {
  if (!isRecord(value)) return { ...defaultNotificationPreferences };
  return {
    delivery: value.delivery === true,
    saved: value.saved === true,
    drops: value.drops === true,
  };
}

function parseTimestamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function isSafeProductSlug(value: unknown): value is string {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value);
}

function parseContact(value: unknown): ShopCheckoutContact | null | undefined {
  if (value === null) return null;
  if (!isRecord(value)) return undefined;
  const name = safeText(value.name, 100, 2);
  const email = safeText(value.email, 160)?.toLowerCase() ?? null;
  const phone = safeText(value.phone, 30);
  if (!name || !email || !phone || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return undefined;
  if (phone.replace(/\D/g, "").length < 7) return undefined;
  return { name, email, phone };
}

function parseFulfillment(value: unknown): ShopOrderFulfillment | null {
  if (!isRecord(value)) return null;
  if (value.kind === "LEGACY" && value.optionId === null) {
    return { kind: "LEGACY", optionId: null };
  }
  if (value.kind === "PICKUP" && value.optionId === "pickup") {
    return { kind: "PICKUP", optionId: "pickup" };
  }
  if (
    value.kind !== "DELIVERY"
    || (value.optionId !== "lagos" && value.optionId !== "nationwide")
    || !isRecord(value.address)
  ) return null;
  const street = safeText(value.address.street, 180);
  const area = safeText(value.address.area, 100);
  const state = safeText(value.address.state, 100);
  if (!street || !area || !state || value.address.country !== "Nigeria") return null;
  return {
    kind: "DELIVERY",
    optionId: value.optionId,
    address: { street, area, state, country: "Nigeria" },
  };
}

function isSafeProductImage(value: string, slug: string) {
  return new RegExp(`^/shop/products/${slug}/[a-z0-9-]+\\.webp$`).test(value);
}

function parseOrderLine(value: unknown): ShopOrderLine | null {
  if (!isRecord(value) || !isSafeProductSlug(value.slug) || value.quantity !== 1) return null;
  if (value.snapshot === "LEGACY") {
    return { snapshot: "LEGACY", slug: value.slug, quantity: 1 };
  }
  if (value.snapshot !== "PRODUCT") return null;
  const rawSku = safeText(value.sku, 80);
  const sku = rawSku ? canonicalCatalogueSku(rawSku) : null;
  const name = safeText(value.name, 140);
  const taggedSize = safeText(value.taggedSize, 60);
  if (!sku || !name || !taggedSize || !isSafeAmount(value.unitPrice)) return null;
  const imageSrc = value.imageSrc === undefined
    ? undefined
    : typeof value.imageSrc === "string" && isSafeProductImage(value.imageSrc, value.slug)
      ? value.imageSrc
      : null;
  const imageAlt = value.imageAlt === undefined ? undefined : safeText(value.imageAlt, 240);
  if (imageSrc === null || imageAlt === null || Boolean(imageSrc) !== Boolean(imageAlt)) return null;
  return {
    snapshot: "PRODUCT",
    slug: value.slug,
    sku,
    name,
    taggedSize,
    unitPrice: value.unitPrice,
    quantity: 1,
    ...(imageSrc && imageAlt ? { imageSrc, imageAlt } : {}),
  };
}

function parseOrder(value: unknown): ShopOrder | null {
  if (!isRecord(value) || value.isSample === true) return null;
  if (typeof value.id !== "string" || !/^JUW-[A-Z0-9-]+$/.test(value.id)) return null;
  const savedAt = parseTimestamp(value.savedAt);
  const rawLines = Array.isArray(value.lines) ? value.lines : null;
  const lines = rawLines
    ? rawLines.flatMap((candidate) => {
        const line = parseOrderLine(candidate);
        return line ? [line] : [];
      })
    : [];
  if (!savedAt || !rawLines || !lines.length || lines.length !== rawLines.length) return null;
  if (new Set(lines.map((line) => line.slug)).size !== lines.length) return null;

  const contact = parseContact(value.contact);
  const fulfillment = parseFulfillment(value.fulfillment);
  const deliveryLabel = safeText(value.deliveryLabel, 100);
  const deliveryEstimate = safeText(value.deliveryEstimate, 100);
  const status = value.status === "PAYMENT_REQUIRED" ? value.status : null;
  const transmission = value.transmission === "LOCAL_ONLY" ? value.transmission : null;

  if (
    contact === undefined
    || !fulfillment
    || !deliveryLabel
    || !deliveryEstimate
    || !status
    || !transmission
    || !isSafeAmount(value.subtotal)
    || !isSafeAmount(value.deliveryFee)
    || !isSafeAmount(value.total)
    || value.total !== value.subtotal + value.deliveryFee
  ) return null;

  const legacyRecord = fulfillment.kind === "LEGACY";
  if (legacyRecord !== (contact === null)) return null;
  if (legacyRecord && lines.some((line) => line.snapshot !== "LEGACY")) return null;
  if (!legacyRecord && lines.some((line) => line.snapshot !== "PRODUCT")) return null;
  if (fulfillment.kind !== "LEGACY") {
    const option = shopDeliveryOptions.find((candidate) => candidate.id === fulfillment.optionId);
    if (
      !option
      || option.fee !== value.deliveryFee
      || option.label !== deliveryLabel
      || option.estimate !== deliveryEstimate
    ) return null;
  }
  const productLines = lines.filter((line) => line.snapshot === "PRODUCT");
  if (!legacyRecord && productLines.reduce((sum, line) => sum + line.unitPrice, 0) !== value.subtotal) {
    return null;
  }

  return {
    id: value.id,
    lines,
    contact,
    fulfillment,
    subtotal: value.subtotal,
    deliveryFee: value.deliveryFee,
    total: value.total,
    deliveryLabel,
    deliveryEstimate,
    savedAt,
    status,
    transmission,
  };
}

function parseLegacyOrder(value: unknown, migrateLegacyReference = false): ShopOrder | null {
  if (!isRecord(value) || value.isSample === true) return null;
  const safeReference = typeof value.id === "string" && /^JUW-[A-Z0-9-]+$/.test(value.id)
    ? value.id
    : migrateLegacyReference && typeof value.id === "string" && /^JW-DEMO-[A-Z0-9-]+$/.test(value.id)
      ? `JUW-LOCAL-${value.id.replace(/^JW-DEMO-/, "")}`
      : null;
  const savedAt = parseTimestamp(value.placedAt);
  const slugs = Array.isArray(value.itemSlugs)
    ? [...new Set(value.itemSlugs.filter(isSafeProductSlug))]
    : [];
  const deliveryLabel = safeText(value.deliveryLabel, 100);
  const deliveryEstimate = safeText(value.deliveryEstimate, 100);
  if (
    !safeReference
    || !savedAt
    || !slugs.length
    || !deliveryLabel
    || !deliveryEstimate
    || !isSafeAmount(value.subtotal)
    || !isSafeAmount(value.deliveryFee)
    || !isSafeAmount(value.total)
    || value.total !== value.subtotal + value.deliveryFee
  ) return null;
  return {
    id: safeReference,
    lines: slugs.map((slug) => ({ snapshot: "LEGACY", slug, quantity: 1 })),
    contact: null,
    fulfillment: { kind: "LEGACY", optionId: null },
    subtotal: value.subtotal,
    deliveryFee: value.deliveryFee,
    total: value.total,
    deliveryLabel,
    deliveryEstimate,
    savedAt,
    status: "PAYMENT_REQUIRED",
    transmission: "LOCAL_ONLY",
  };
}

function parseOrders(value: unknown): ShopOrder[] {
  if (!Array.isArray(value)) return [];
  const orders = value.flatMap((candidate) => {
    const order = parseOrder(candidate);
    return order ? [order] : [];
  });
  return orders
    .filter((order, index) => orders.findIndex((candidate) => candidate.id === order.id) === index)
    .slice(0, MAX_LOCAL_ORDERS);
}

function parseLegacyOrders(value: unknown, migrateLegacyReference = false): ShopOrder[] {
  if (!Array.isArray(value)) return [];
  const orders = value.flatMap((candidate) => {
    const order = parseLegacyOrder(candidate, migrateLegacyReference);
    return order ? [order] : [];
  });
  return orders
    .filter((order, index) => orders.findIndex((candidate) => candidate.id === order.id) === index)
    .slice(0, MAX_LOCAL_ORDERS);
}

function parseSnapshot(value: unknown, resolveProduct: ProductResolver): CommerceSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    saved: parseSaved(value.saved, resolveProduct),
    bag: parseBag(value.bag, resolveProduct),
    orders: parseOrders(value.orders),
    following: value.following === true,
    notificationPreferences: parseNotificationPreferences(value.notificationPreferences),
  };
}

export function parseStoredShopState(
  raw: string | null,
  resolveProduct: ProductResolver = getShopProduct,
): CommerceSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== SHOP_STATE_SCHEMA_VERSION) return null;
  return parseSnapshot(value.data, resolveProduct);
}

export function migrateStoredShopStateV2(
  raw: string | null,
  resolveProduct: ProductResolver = getShopProduct,
): CommerceSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== 2 || !isRecord(value.data)) return null;
  return {
    saved: parseSaved(value.data.saved, resolveProduct),
    bag: parseBag(value.data.bag, resolveProduct),
    orders: parseLegacyOrders(value.data.orders),
    following: value.data.following === true,
    notificationPreferences: parseNotificationPreferences(value.data.notificationPreferences),
  };
}

export function migrateLegacyShopState(
  raw: string | null,
  resolveProduct: ProductResolver = getShopProduct,
): CommerceSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const currentOrder = parseLegacyOrder(value.currentOrder, true);
  return {
    saved: parseSaved(value.saved, resolveProduct),
    bag: parseBag(value.bag, resolveProduct),
    orders: currentOrder ? [currentOrder] : [],
    following: value.following === true,
    notificationPreferences: parseNotificationPreferences(value.notificationPreferences),
  };
}

function browserStorage() {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is available only after the shop mounts.");
  }
  return window.localStorage;
}

export function createBrowserLocalShopRepository(
  resolveProduct: ProductResolver = getShopProduct,
): ShopStateRepository {
  return {
    async read() {
      const storage = browserStorage();
      const currentRaw = storage.getItem(CURRENT_STORAGE_KEY);
      if (currentRaw) {
        return parseStoredShopState(currentRaw, resolveProduct) ?? createEmptyCommerceSnapshot();
      }

      const migrated = migrateStoredShopStateV2(
        storage.getItem(PREVIOUS_STORAGE_KEY),
        resolveProduct,
      ) ?? migrateLegacyShopState(storage.getItem(LEGACY_STORAGE_KEY), resolveProduct);
      if (!migrated) return createEmptyCommerceSnapshot();
      await this.write(migrated);
      return migrated;
    },
    async write(snapshot) {
      const envelope: StoredShopStateV3 = {
        version: SHOP_STATE_SCHEMA_VERSION,
        data: snapshot,
      };
      browserStorage().setItem(CURRENT_STORAGE_KEY, JSON.stringify(envelope));
    },
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined;
      const receiveStorage = (event: StorageEvent) => {
        if (event.key !== CURRENT_STORAGE_KEY || !event.newValue) return;
        const snapshot = parseStoredShopState(event.newValue, resolveProduct);
        if (snapshot) listener(snapshot);
      };
      window.addEventListener("storage", receiveStorage);
      return () => window.removeEventListener("storage", receiveStorage);
    },
  };
}
