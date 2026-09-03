import {
  studioOrderHasDueReturnWork,
  studioOrderHasDueWork,
} from "../../shop/order-presentation";
import type { StudioAuthoritySnapshot } from "../services/studio-authority-client";

export type StudioWorkProjection = {
  attentionCount: number;
  drafts: StudioAuthoritySnapshot["pieces"];
  dueOrders: StudioAuthoritySnapshot["orders"];
  dueReturns: StudioAuthoritySnapshot["orders"];
  locationMismatches: StudioAuthoritySnapshot["pieces"];
};

/**
 * The single meaning of actionable Studio attention.
 *
 * Notifications are an operator-specific update feed and can duplicate orders,
 * locations, drafts, holds, and media. Private drafts are resumable work, not an
 * operational exception, so both stay outside the Attention total.
 */
export function selectStudioWorkProjection(
  authority: StudioAuthoritySnapshot,
): StudioWorkProjection {
  const dueReturns = authority.orders.filter(studioOrderHasDueReturnWork);
  const dueOrders = authority.orders.filter((order) => (
    studioOrderHasDueWork(order) && !studioOrderHasDueReturnWork(order)
  ));
  const locationMismatches = authority.pieces.filter((piece) => piece.hasLocationMismatch);
  const drafts = authority.pieces.filter((piece) => piece.availability === "PRIVATE");

  return {
    attentionCount: locationMismatches.length + dueReturns.length + dueOrders.length,
    drafts,
    dueOrders,
    dueReturns,
    locationMismatches,
  };
}
