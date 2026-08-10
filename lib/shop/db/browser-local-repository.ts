import { getShopProduct } from "../catalog";
import type {
  BagItem,
  ShopNotificationPreferences,
  ShopOrder,
} from "../domain/entities";
import {
  SHOP_STATE_SCHEMA_VERSION,
  type CommerceSnapshot,
  type StoredShopStateV2,
  createEmptyCommerceSnapshot,
  defaultNotificationPreferences,
} from "../domain/state";
import type { ShopStateRepository } from "../services/contracts";

const CURRENT_STORAGE_KEY = "justurban-wears:shop:v2";
const LEGACY_STORAGE_KEY = "justurban-wears:shop:v1";
const MAX_LOCAL_ORDERS = 25;

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isSafeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function parseSaved(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((slug): slug is string =>
    typeof slug === "string" && Boolean(getShopProduct(slug)),
  ))];
}

function parseBag(value: unknown): BagItem[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  return value.flatMap((candidate) => {
    if (!isRecord(candidate) || typeof candidate.slug !== "string") return [];
    const product = getShopProduct(candidate.slug);
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

function parsePlacedAt(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const timestamp = Date.parse(value);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function parseOrder(
  value: unknown,
  migrateLegacyReference = false,
): ShopOrder | null {
  if (!isRecord(value) || value.isSample === true) return null;
  if (typeof value.id !== "string" || /sample/i.test(value.id)) return null;
  const placedAt = parsePlacedAt(value.placedAt);
  const itemSlugs = Array.isArray(value.itemSlugs)
    ? [...new Set(value.itemSlugs.filter((slug): slug is string =>
        typeof slug === "string" && Boolean(getShopProduct(slug)),
      ))]
    : [];
  const allowedStatuses = [
    "ORDER_RECEIVED",
    "QUALITY_CHECK",
    "READY_FOR_HANDOFF",
    "IN_TRANSIT",
    "DELIVERED",
  ];
  const status = typeof value.status === "string" && allowedStatuses.includes(value.status)
    ? value.status as ShopOrder["status"]
    : null;
  const safeReference = /^JUW-[A-Z0-9-]+$/.test(value.id)
    ? value.id
    : migrateLegacyReference && /^JW-DEMO-[A-Z0-9-]+$/.test(value.id)
      ? `JUW-LOCAL-${value.id.replace(/^JW-DEMO-/, "")}`
      : null;

  if (
    !safeReference
    || !placedAt
    || !itemSlugs.length
    || !status
    || !isSafeAmount(value.subtotal)
    || !isSafeAmount(value.deliveryFee)
    || !isSafeAmount(value.total)
    || typeof value.deliveryLabel !== "string"
    || typeof value.deliveryEstimate !== "string"
  ) {
    return null;
  }

  return {
    id: safeReference,
    itemSlugs,
    subtotal: value.subtotal,
    deliveryFee: value.deliveryFee,
    total: value.total,
    deliveryLabel: value.deliveryLabel,
    deliveryEstimate: value.deliveryEstimate,
    placedAt,
    status,
  };
}

function parseOrders(value: unknown, migrateLegacyReference = false): ShopOrder[] {
  if (!Array.isArray(value)) return [];
  const orders = value.flatMap((candidate) => {
    const order = parseOrder(candidate, migrateLegacyReference);
    return order ? [order] : [];
  });
  return orders
    .filter((order, index) => orders.findIndex((candidate) => candidate.id === order.id) === index)
    .slice(0, MAX_LOCAL_ORDERS);
}

function parseSnapshot(value: unknown): CommerceSnapshot | null {
  if (!isRecord(value)) return null;
  return {
    saved: parseSaved(value.saved),
    bag: parseBag(value.bag),
    orders: parseOrders(value.orders),
    following: value.following === true,
    notificationPreferences: parseNotificationPreferences(value.notificationPreferences),
  };
}

export function parseStoredShopState(raw: string | null): CommerceSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== SHOP_STATE_SCHEMA_VERSION) return null;
  return parseSnapshot(value.data);
}

export function migrateLegacyShopState(raw: string | null): CommerceSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value)) return null;
  const currentOrder = parseOrder(value.currentOrder, true);
  return {
    saved: parseSaved(value.saved),
    bag: parseBag(value.bag),
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

export function createBrowserLocalShopRepository(): ShopStateRepository {
  return {
    async read() {
      const storage = browserStorage();
      const currentRaw = storage.getItem(CURRENT_STORAGE_KEY);
      if (currentRaw) {
        return parseStoredShopState(currentRaw) ?? createEmptyCommerceSnapshot();
      }

      const migrated = migrateLegacyShopState(storage.getItem(LEGACY_STORAGE_KEY));
      if (!migrated) return createEmptyCommerceSnapshot();
      await this.write(migrated);
      return migrated;
    },
    async write(snapshot) {
      const envelope: StoredShopStateV2 = {
        version: SHOP_STATE_SCHEMA_VERSION,
        data: snapshot,
      };
      browserStorage().setItem(CURRENT_STORAGE_KEY, JSON.stringify(envelope));
    },
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined;
      const receiveStorage = (event: StorageEvent) => {
        if (event.key !== CURRENT_STORAGE_KEY || !event.newValue) return;
        const snapshot = parseStoredShopState(event.newValue);
        if (snapshot) listener(snapshot);
      };
      window.addEventListener("storage", receiveStorage);
      return () => window.removeEventListener("storage", receiveStorage);
    },
  };
}
