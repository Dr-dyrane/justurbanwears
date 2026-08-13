import type { StudioMachineState } from "./domain/state";

export type StudioNotificationKind = "PERSISTENCE" | "MODEL" | "WARDROBE" | "PUBLISHING" | "ORDER" | "RETURN";
export type StudioNotificationTone = "critical" | "attention" | "neutral";

export interface StudioNotification {
  id: string;
  kind: StudioNotificationKind;
  tone: StudioNotificationTone;
  title: string;
  detail: string;
  href: string;
  actionLabel: string;
}

function signature(ids: string[]) {
  return ids.slice().sort().join(".");
}

export function deriveStudioNotifications(
  state: Pick<StudioMachineState, "persistence" | "models" | "garments" | "listings" | "orders" | "returns">,
): StudioNotification[] {
  const notifications: StudioNotification[] = [];
  const modelDrafts = state.models.filter((model) => model.state === "DRAFT");
  const garmentDrafts = state.garments.filter((garment) => garment.state === "DRAFT");
  const listingWork = state.listings.filter((listing) => listing.state === "DRAFT" || listing.state === "READY");
  const reservedOrders = state.orders.filter((order) => order.state === "RESERVED");
  const openReturns = state.returns.filter((returnCase) => returnCase.state === "DRAFT");

  if (state.persistence === "unavailable") {
    notifications.push({
      id: "persistence-unavailable",
      kind: "PERSISTENCE",
      tone: "critical",
      title: "Work is not saving",
      detail: "Keep this page open and restore storage before continuing.",
      href: "/studio",
      actionLabel: "Review Studio",
    });
  }
  if (reservedOrders.length) {
    notifications.push({
      id: `orders:${signature(reservedOrders.map((order) => order.id))}`,
      kind: "ORDER",
      tone: "attention",
      title: `${reservedOrders.length} reserved sale${reservedOrders.length === 1 ? "" : "s"} waiting`,
      detail: "Confirm sold or release the reservation.",
      href: "/studio/operations?view=orders",
      actionLabel: "Open orders",
    });
  }
  if (openReturns.length) {
    notifications.push({
      id: `returns:${signature(openReturns.map((item) => item.id))}`,
      kind: "RETURN",
      tone: "attention",
      title: `${openReturns.length} return${openReturns.length === 1 ? "" : "s"} to inspect`,
      detail: "Restock or write off after inspection.",
      href: "/studio/operations?view=returns",
      actionLabel: "Open returns",
    });
  }
  if (garmentDrafts.length) {
    notifications.push({
      id: `wardrobe:${signature(garmentDrafts.map((garment) => garment.id))}`,
      kind: "WARDROBE",
      tone: "neutral",
      title: `${garmentDrafts.length} garment${garmentDrafts.length === 1 ? "" : "s"} need finishing`,
      detail: "Add the missing views or facts shown on each card.",
      href: `/studio/wardrobe?garment=${encodeURIComponent(garmentDrafts[0].id)}`,
      actionLabel: "Open garment",
    });
  }
  if (listingWork.length) {
    notifications.push({
      id: `publishing:${signature(listingWork.map((listing) => `${listing.id}-${listing.state}`))}`,
      kind: "PUBLISHING",
      tone: "neutral",
      title: `${listingWork.length} listing${listingWork.length === 1 ? "" : "s"} in review`,
      detail: "Review the remaining facts and views before publishing.",
      href: `/studio/wardrobe?view=publishing&garment=${encodeURIComponent(listingWork[0].garmentId)}`,
      actionLabel: "Open listing",
    });
  }
  if (modelDrafts.length) {
    notifications.push({
      id: `models:${signature(modelDrafts.map((model) => model.id))}`,
      kind: "MODEL",
      tone: "neutral",
      title: `${modelDrafts.length} model profile${modelDrafts.length === 1 ? "" : "s"} incomplete`,
      detail: "Finish identity, consent and styling readiness.",
      href: "/studio/models?view=readiness",
      actionLabel: "Open Models",
    });
  }

  return notifications;
}
