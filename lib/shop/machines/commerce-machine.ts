import type {
  BagItem,
  ShopAvailability,
  ShopNotificationPreference,
  ShopOrder,
  ShopProductSlug,
} from "../domain/entities";
import {
  type CommerceLifecycle,
  type CommerceMachineState,
  type CommerceSnapshot,
  createInitialCommerceState,
} from "../domain/state";

export type CommerceCommand =
  | { type: "HYDRATION_REQUESTED" }
  | { type: "HYDRATION_SUCCEEDED"; snapshot: CommerceSnapshot }
  | { type: "HYDRATION_FAILED" }
  | { type: "EXTERNAL_STATE_RECEIVED"; snapshot: CommerceSnapshot }
  | { type: "CONNECTIVITY_CHANGED"; connectivity: "online" | "offline" }
  | { type: "SAVED_TOGGLED"; slug: ShopProductSlug }
  | { type: "FOLLOWING_TOGGLED" }
  | { type: "NOTIFICATION_TOGGLED"; preference: ShopNotificationPreference }
  | { type: "BAG_ITEM_ADDED"; item: BagItem; availability: ShopAvailability | null }
  | { type: "BAG_ITEM_REMOVED"; slug: ShopProductSlug }
  | { type: "CHECKOUT_OPENED" }
  | { type: "CHECKOUT_CLOSED" }
  | { type: "ORDER_PLACEMENT_REQUESTED" }
  | { type: "ORDER_PLACEMENT_SUCCEEDED"; order: ShopOrder }
  | { type: "ORDER_PLACEMENT_FAILED" }
  | { type: "ORDER_VIEWED"; id: string }
  | { type: "PERSISTENCE_FAILED" };

function cartState(bag: BagItem[]) {
  return bag.length ? "ready" as const : "empty" as const;
}

function applySnapshot(
  state: CommerceMachineState,
  snapshot: CommerceSnapshot,
): CommerceMachineState {
  return {
    ...state,
    ...snapshot,
    cart: cartState(snapshot.bag),
    checkout: "idle",
    order: snapshot.orders.length ? "history" : "none",
  };
}

function persistentUpdate(
  state: CommerceMachineState,
  update: Partial<CommerceSnapshot>,
): CommerceMachineState {
  const next = { ...state, ...update };
  return {
    ...next,
    cart: cartState(next.bag),
    persistenceRevision: state.persistenceRevision + 1,
  };
}

export function commerceReducer(
  state: CommerceMachineState,
  command: CommerceCommand,
): CommerceMachineState {
  switch (command.type) {
    case "HYDRATION_REQUESTED":
      return { ...state, hydration: "restoring" };
    case "HYDRATION_SUCCEEDED":
      return {
        ...applySnapshot(state, command.snapshot),
        hydration: "ready",
        persistence: "available",
      };
    case "HYDRATION_FAILED":
      return {
        ...state,
        hydration: "degraded",
        persistence: "unavailable",
      };
    case "EXTERNAL_STATE_RECEIVED":
      return {
        ...applySnapshot(state, command.snapshot),
        hydration: "ready",
      };
    case "CONNECTIVITY_CHANGED": {
      const offline = command.connectivity === "offline";
      return {
        ...state,
        connectivity: command.connectivity,
        checkout: offline && state.checkout !== "idle"
          ? "blocked"
          : !offline && state.checkout === "blocked" && state.bag.length
            ? "reviewing"
            : state.checkout,
      };
    }
    case "SAVED_TOGGLED":
      return persistentUpdate(state, {
        saved: state.saved.includes(command.slug)
          ? state.saved.filter((slug) => slug !== command.slug)
          : [...state.saved, command.slug],
      });
    case "FOLLOWING_TOGGLED":
      return persistentUpdate(state, { following: !state.following });
    case "NOTIFICATION_TOGGLED":
      return persistentUpdate(state, {
        notificationPreferences: {
          ...state.notificationPreferences,
          [command.preference]: !state.notificationPreferences[command.preference],
        },
      });
    case "BAG_ITEM_ADDED":
      if (
        state.connectivity === "offline"
        || command.availability !== "AVAILABLE"
        || state.bag.some((item) => item.slug === command.item.slug)
      ) {
        return state;
      }
      return {
        ...persistentUpdate(state, { bag: [...state.bag, command.item] }),
        checkout: "idle",
        order: state.orders.length ? "history" : "none",
      };
    case "BAG_ITEM_REMOVED": {
      const bag = state.bag.filter((item) => item.slug !== command.slug);
      if (bag.length === state.bag.length) return state;
      return {
        ...persistentUpdate(state, { bag }),
        checkout: bag.length ? state.checkout : "idle",
      };
    }
    case "CHECKOUT_OPENED":
      return {
        ...state,
        checkout: !state.bag.length
          ? "idle"
          : state.connectivity === "offline"
            ? "blocked"
            : "reviewing",
      };
    case "CHECKOUT_CLOSED":
      return { ...state, checkout: "idle" };
    case "ORDER_PLACEMENT_REQUESTED":
      return {
        ...state,
        checkout: !state.bag.length
          ? "idle"
          : state.connectivity === "offline"
            ? "blocked"
            : "placing",
      };
    case "ORDER_PLACEMENT_SUCCEEDED":
      if (state.checkout !== "placing") return state;
      return {
        ...persistentUpdate(state, {
          bag: [],
          orders: [
            command.order,
            ...state.orders.filter((order) => order.id !== command.order.id),
          ],
        }),
        checkout: "idle",
        order: "received",
      };
    case "ORDER_PLACEMENT_FAILED":
      return {
        ...state,
        checkout: state.connectivity === "offline" ? "blocked" : "reviewing",
      };
    case "ORDER_VIEWED":
      return state.orders.some((order) => order.id === command.id)
        ? { ...state, order: "history" }
        : state;
    case "PERSISTENCE_FAILED":
      return {
        ...state,
        hydration: state.hydration === "restoring" ? "degraded" : state.hydration,
        persistence: "unavailable",
      };
    default:
      return state;
  }
}

export function selectCommerceSnapshot(state: CommerceMachineState): CommerceSnapshot {
  return {
    saved: state.saved,
    bag: state.bag,
    orders: state.orders,
    following: state.following,
    notificationPreferences: state.notificationPreferences,
  };
}

export function selectCommerceLifecycle(state: CommerceMachineState): CommerceLifecycle {
  if (state.hydration === "idle") return "cold-start";
  if (state.hydration === "restoring") return "hydrating";
  if (state.connectivity === "offline") return "offline-local";
  if (state.checkout === "placing") return "placing-order";
  if (state.checkout === "reviewing" || state.checkout === "blocked") return "checkout-review";
  if (state.order === "received") return "order-received";
  if (state.cart === "ready") return "cart-ready";
  if (state.persistence === "unavailable") return "memory-only";
  return "browsing";
}

export const initialCommerceState = createInitialCommerceState();
