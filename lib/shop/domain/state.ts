import type {
  BagItem,
  ShopNotificationPreferences,
  ShopOrder,
  ShopProductSlug,
} from "./entities";

export const SHOP_STATE_SCHEMA_VERSION = 2 as const;

export interface CommerceSnapshot {
  saved: ShopProductSlug[];
  bag: BagItem[];
  orders: ShopOrder[];
  following: boolean;
  notificationPreferences: ShopNotificationPreferences;
}

export interface StoredShopStateV2 {
  version: typeof SHOP_STATE_SCHEMA_VERSION;
  data: CommerceSnapshot;
}

export type HydrationState = "idle" | "restoring" | "ready" | "degraded";
export type ConnectivityState = "online" | "offline";
export type CartState = "empty" | "ready";
export type CheckoutState = "idle" | "reviewing" | "placing" | "blocked";
export type OrderState = "none" | "history" | "received";
export type PersistenceState = "available" | "unavailable";

export type CommerceLifecycle =
  | "cold-start"
  | "hydrating"
  | "offline-local"
  | "browsing"
  | "cart-ready"
  | "checkout-review"
  | "placing-order"
  | "order-received"
  | "memory-only";

export interface CommerceMachineState extends CommerceSnapshot {
  schemaVersion: typeof SHOP_STATE_SCHEMA_VERSION;
  hydration: HydrationState;
  connectivity: ConnectivityState;
  cart: CartState;
  checkout: CheckoutState;
  order: OrderState;
  persistence: PersistenceState;
  persistenceRevision: number;
}

export const defaultNotificationPreferences: ShopNotificationPreferences = {
  delivery: true,
  saved: false,
  drops: false,
};

export function createEmptyCommerceSnapshot(): CommerceSnapshot {
  return {
    saved: [],
    bag: [],
    orders: [],
    following: false,
    notificationPreferences: { ...defaultNotificationPreferences },
  };
}

export function createInitialCommerceState(): CommerceMachineState {
  return {
    ...createEmptyCommerceSnapshot(),
    schemaVersion: SHOP_STATE_SCHEMA_VERSION,
    hydration: "idle",
    connectivity: "online",
    cart: "empty",
    checkout: "idle",
    order: "none",
    persistence: "available",
    persistenceRevision: 0,
  };
}
