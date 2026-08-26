import type { ShopCheckoutFulfillment } from "./domain/entities";
import type { ShopServerOrder } from "./server-order/types";

export interface AssistedOrderRecoverySignature {
  contact: { email: string; name: string; phone: string };
  fulfillment: ShopCheckoutFulfillment;
  lines: Array<{ quantity: 1; slug: string; taggedSize: string }>;
  sentAfter: number;
  source: Exclude<ShopServerOrder["source"], "ONLINE">;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function sameContact(
  left: ShopServerOrder["contact"],
  right: AssistedOrderRecoverySignature["contact"],
) {
  return normalize(left.name) === normalize(right.name)
    && normalize(left.email).toLowerCase() === normalize(right.email).toLowerCase()
    && normalize(left.phone) === normalize(right.phone);
}

function sameFulfillment(left: ShopCheckoutFulfillment, right: ShopCheckoutFulfillment) {
  if (left.kind !== right.kind || left.optionId !== right.optionId) return false;
  if (left.kind === "PICKUP" || right.kind === "PICKUP") return left.kind === right.kind;
  return normalize(left.address.street) === normalize(right.address.street)
    && normalize(left.address.area) === normalize(right.address.area)
    && normalize(left.address.state) === normalize(right.address.state)
    && normalize(left.address.country).toLowerCase() === normalize(right.address.country).toLowerCase();
}

function lineIdentity(line: { quantity: number; slug: string; taggedSize: string }) {
  return `${line.slug}\n${normalize(line.taggedSize)}\n${line.quantity}`;
}

export function findRecoveredAssistedOrder(
  orders: readonly ShopServerOrder[],
  signature: AssistedOrderRecoverySignature,
): ShopServerOrder | null {
  const expectedLines = signature.lines.map(lineIdentity).sort();
  const candidates = orders.filter((order) => {
    const savedAt = Date.parse(order.savedAt);
    if (!Number.isFinite(savedAt) || savedAt < signature.sentAfter - 5_000) return false;
    if (order.source !== signature.source) return false;
    if (!sameContact(order.contact, signature.contact)) return false;
    if (!sameFulfillment(order.fulfillment, signature.fulfillment)) return false;
    const actualLines = order.lines.map(lineIdentity).sort();
    return actualLines.length === expectedLines.length
      && actualLines.every((line, index) => line === expectedLines[index]);
  });
  return candidates.length === 1 ? candidates[0] : null;
}
