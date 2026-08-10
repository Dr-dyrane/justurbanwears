"use client";

import { createContext, useContext, useMemo } from "react";
import { useCommerceMachine } from "../../hooks/shop/use-commerce-machine";
import type {
  BagItem,
  ShopDeliveryId,
  ShopNotificationPreference,
  ShopNotificationPreferences,
  ShopOrder,
  ShopProduct,
} from "../../lib/shop/domain/entities";
import type {
  CommerceLifecycle,
  HydrationState,
  PersistenceState,
} from "../../lib/shop/domain/state";
import type { CommerceService } from "../../lib/shop/services/contracts";

export type {
  BagItem,
  ShopDeliveryId,
  ShopNotificationPreference,
  ShopNotificationPreferences,
  ShopOrder,
} from "../../lib/shop/domain/entities";

interface ShopContextValue {
  products: readonly ShopProduct[];
  getProduct(slug: string): ShopProduct | undefined;
  saved: string[];
  bag: BagItem[];
  orders: ShopOrder[];
  following: boolean;
  notificationPreferences: ShopNotificationPreferences;
  isOnline: boolean;
  hydration: HydrationState;
  persistence: PersistenceState;
  lifecycle: CommerceLifecycle;
  toggleSaved(slug: string): void;
  toggleFollowing(): void;
  toggleNotificationPreference(preference: ShopNotificationPreference): void;
  addToBag(item: BagItem): boolean;
  prepareCheckout(item: BagItem): Promise<boolean>;
  removeFromBag(slug: string): void;
  beginCheckout(): void;
  closeCheckout(): void;
  placeOrder(deliveryId: ShopDeliveryId): Promise<string>;
  viewOrder(id: string): void;
}

const ShopContext = createContext<ShopContextValue | null>(null);

export function ShopProvider({
  children,
  service,
}: {
  children: React.ReactNode;
  service: CommerceService;
}) {
  const { state, lifecycle, actions } = useCommerceMachine(service);
  const value = useMemo<ShopContextValue>(() => ({
    products: state.catalog,
    getProduct: (slug) => state.catalog.find((product) => product.slug === slug),
    saved: state.saved,
    bag: state.bag,
    orders: state.orders,
    following: state.following,
    notificationPreferences: state.notificationPreferences,
    isOnline: state.connectivity === "online",
    hydration: state.hydration,
    persistence: state.persistence,
    lifecycle,
    ...actions,
  }), [actions, lifecycle, state]);

  return <ShopContext.Provider value={value}>{children}</ShopContext.Provider>;
}

export function useShop() {
  const context = useContext(ShopContext);
  if (!context) throw new Error("useShop must be used within ShopProvider");
  return context;
}
