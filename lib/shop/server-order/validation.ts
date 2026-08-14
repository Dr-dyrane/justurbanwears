import { createHash } from "node:crypto";
import type {
  ShopCheckoutFulfillment,
  ShopCheckoutSubmissionIntent,
} from "../domain/entities";
import {
  SHOP_PAYMENT_EVIDENCE_MAX_BYTES,
  ShopOrderError,
  shopPaymentEvidenceContentTypes,
  type ShopOrderTransitionDetails,
  type ShopOperatorTransition,
  type ShopOperatorReturnTransition,
  type ShopPaymentEvidenceContentType,
  type ShopReturnReason,
} from "./types";

type JsonObject = Record<string, unknown>;

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOnlyKeys(value: JsonObject, keys: readonly string[]): boolean {
  const allowed = new Set(keys);
  return Object.keys(value).every((key) => allowed.has(key));
}

export function cleanText(value: unknown, maximum: number, minimum = 1): string {
  if (typeof value !== "string") {
    throw new ShopOrderError("INVALID_REQUEST", "A required text field is invalid.");
  }
  const cleaned = value.trim().replace(/\s+/g, " ");
  const hasControlCharacter = [...cleaned].some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
  if (cleaned.length < minimum || cleaned.length > maximum || hasControlCharacter) {
    throw new ShopOrderError("INVALID_REQUEST", "A required text field is invalid.");
  }
  return cleaned;
}

export function parseOptionalNote(value: unknown): string | null {
  if (value === undefined || value === null || value === "") return null;
  return cleanText(value, 500);
}

export function parseIdempotencyKey(value: unknown): string {
  if (
    typeof value !== "string"
    || value.length < 8
    || value.length > 160
    || !/^[A-Za-z0-9][A-Za-z0-9:._-]+$/.test(value)
  ) {
    throw new ShopOrderError("INVALID_REQUEST", "The idempotency key is invalid.");
  }
  return value;
}

export function parseOrderReference(value: unknown): string {
  if (typeof value !== "string" || !/^JUW-[A-Z0-9-]{6,36}$/.test(value)) {
    throw new ShopOrderError("INVALID_REQUEST", "The order reference is invalid.");
  }
  return value;
}

export function parseUuid(value: unknown, field = "identifier"): string {
  if (
    typeof value !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  ) {
    throw new ShopOrderError("INVALID_REQUEST", `The ${field} is invalid.`);
  }
  return value.toLowerCase();
}

export function parseExpectedVersion(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) > 2_147_483_647) {
    throw new ShopOrderError("INVALID_REQUEST", "The expected order version is invalid.");
  }
  return value as number;
}

function parseContact(value: unknown) {
  if (!isObject(value) || !hasOnlyKeys(value, ["name", "email", "phone"])) {
    throw new ShopOrderError("INVALID_REQUEST", "The checkout contact is invalid.");
  }
  const name = cleanText(value.name, 100, 2);
  const email = typeof value.email === "string" ? value.email.trim().toLowerCase() : "";
  const phone = cleanText(value.phone, 30, 7);
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new ShopOrderError("INVALID_REQUEST", "The checkout email is invalid.");
  }
  if (phone.replace(/\D/g, "").length < 7) {
    throw new ShopOrderError("INVALID_REQUEST", "The checkout phone is invalid.");
  }
  return { name, email, phone };
}

function parseFulfillment(value: unknown): ShopCheckoutFulfillment {
  if (!isObject(value) || typeof value.kind !== "string") {
    throw new ShopOrderError("INVALID_REQUEST", "The fulfillment selection is invalid.");
  }
  if (value.kind === "PICKUP") {
    if (!hasOnlyKeys(value, ["kind", "optionId"]) || value.optionId !== "pickup") {
      throw new ShopOrderError("INVALID_REQUEST", "The pickup selection is invalid.");
    }
    return { kind: "PICKUP", optionId: "pickup" };
  }
  if (
    value.kind !== "DELIVERY"
    || !hasOnlyKeys(value, ["kind", "optionId", "address"])
    || (value.optionId !== "lagos" && value.optionId !== "nationwide")
    || !isObject(value.address)
    || !hasOnlyKeys(value.address, ["street", "area", "state", "country"])
    || value.address.country !== "Nigeria"
  ) {
    throw new ShopOrderError("INVALID_REQUEST", "The delivery selection is invalid.");
  }
  return {
    kind: "DELIVERY",
    optionId: value.optionId,
    address: {
      street: cleanText(value.address.street, 180),
      area: cleanText(value.address.area, 100),
      state: cleanText(value.address.state, 100),
      country: "Nigeria",
    },
  };
}

export function parseCheckoutIntent(value: unknown): ShopCheckoutSubmissionIntent {
  if (
    !isObject(value)
    || !hasOnlyKeys(value, ["version", "idempotencyKey", "lines", "contact", "fulfillment"])
    || value.version !== 1
    || !Array.isArray(value.lines)
    || value.lines.length < 1
    || value.lines.length > 10
  ) {
    throw new ShopOrderError("INVALID_REQUEST", "The checkout intent is invalid.");
  }
  const seen = new Set<string>();
  const lines = value.lines.map((line) => {
    if (
      !isObject(line)
      || !hasOnlyKeys(line, ["slug", "taggedSize", "quantity"])
      || typeof line.slug !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(line.slug)
      || line.slug.length > 160
      || line.quantity !== 1
      || seen.has(line.slug)
    ) {
      throw new ShopOrderError("INVALID_REQUEST", "A checkout line is invalid or duplicated.");
    }
    seen.add(line.slug);
    return {
      slug: line.slug,
      taggedSize: cleanText(line.taggedSize, 60),
      quantity: 1 as const,
    };
  });
  return {
    version: 1,
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
    lines,
    contact: parseContact(value.contact),
    fulfillment: parseFulfillment(value.fulfillment),
  };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value)) {
    return Object.fromEntries(
      Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]),
    );
  }
  return value;
}

export function sha256Fingerprint(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");
}

export function checkoutRequestFingerprint(intent: ShopCheckoutSubmissionIntent): string {
  return sha256Fingerprint({
    version: intent.version,
    lines: [...intent.lines].sort((left, right) => left.slug.localeCompare(right.slug)),
    contact: intent.contact,
    fulfillment: intent.fulfillment,
  });
}

export function parseOperatorTransition(value: unknown): ShopOperatorTransition {
  if (!isObject(value) || !hasOnlyKeys(value, ["dimension", "target"])) {
    throw new ShopOrderError("INVALID_REQUEST", "The order transition is invalid.");
  }
  if (
    value.dimension === "PAYMENT_REVIEW"
    && (value.target === "UNDER_REVIEW"
      || value.target === "REVIEW_APPROVED"
      || value.target === "REVIEW_REJECTED")
  ) {
    return { dimension: "PAYMENT_REVIEW", target: value.target };
  }
  if (
    value.dimension === "FULFILLMENT"
    && (value.target === "QUALITY_CHECK"
      || value.target === "READY_FOR_HANDOFF"
      || value.target === "IN_TRANSIT"
      || value.target === "DELIVERED")
  ) {
    return { dimension: "FULFILLMENT", target: value.target };
  }
  if (value.dimension === "FUNDS_CONFIRMATION" && value.target === "CONFIRMED") {
    return { dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" };
  }
  if (
    value.dimension === "LIFECYCLE"
    && (value.target === "CANCELLED" || value.target === "EXPIRED")
  ) {
    return { dimension: "LIFECYCLE", target: value.target };
  }
  throw new ShopOrderError("INVALID_REQUEST", "The order transition target is invalid.");
}

export function parseOrderTransitionDetails(
  transition: ShopOperatorTransition,
  value: unknown,
): ShopOrderTransitionDetails | null {
  if (transition.dimension === "FUNDS_CONFIRMATION") {
    if (
      !isObject(value)
      || !hasOnlyKeys(value, ["kind", "transferReference", "receivingAccountLabel"])
      || value.kind !== "FUNDS_CONFIRMATION"
    ) throw new ShopOrderError("INVALID_REQUEST", "Settlement confirmation details are required.");
    return {
      kind: "FUNDS_CONFIRMATION",
      transferReference: cleanText(value.transferReference, 120, 4),
      receivingAccountLabel: cleanText(value.receivingAccountLabel, 120, 3),
    };
  }
  if (transition.dimension === "FULFILLMENT" && transition.target === "IN_TRANSIT") {
    if (
      !isObject(value)
      || !hasOnlyKeys(value, [
        "kind",
        "carrierName",
        "trackingReference",
        "dispatchReference",
        "dispatchedAt",
      ])
      || value.kind !== "DELIVERY_DISPATCH"
    ) throw new ShopOrderError("INVALID_REQUEST", "Delivery dispatch facts are required.");
    return {
      kind: "DELIVERY_DISPATCH",
      carrierName: cleanText(value.carrierName, 120, 2),
      trackingReference: cleanText(value.trackingReference, 120, 3),
      dispatchReference: cleanText(value.dispatchReference, 120, 3),
      dispatchedAt: parseIsoDate(value.dispatchedAt, "dispatch time"),
    };
  }
  if (transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED") {
    if (!isObject(value)) {
      throw new ShopOrderError("INVALID_REQUEST", "Delivery or pickup completion facts are required.");
    }
    if (
      value.kind === "DELIVERY_COMPLETE"
      && hasOnlyKeys(value, [
        "kind",
        "recipientName",
        "deliveredAt",
        "deliveryProofReference",
      ])
    ) {
      return {
        kind: "DELIVERY_COMPLETE",
        recipientName: cleanText(value.recipientName, 120, 2),
        deliveredAt: parseIsoDate(value.deliveredAt, "delivery time"),
        deliveryProofReference: cleanText(value.deliveryProofReference, 160, 3),
      };
    }
    if (
      value.kind === "PICKUP_COMPLETE"
      && hasOnlyKeys(value, [
        "kind",
        "pickupAppointment",
        "recipientName",
        "deliveredAt",
        "deliveryProofReference",
      ])
    ) {
      return {
        kind: "PICKUP_COMPLETE",
        pickupAppointment: parseIsoDate(value.pickupAppointment, "pickup appointment"),
        recipientName: cleanText(value.recipientName, 120, 2),
        deliveredAt: parseIsoDate(value.deliveredAt, "pickup time"),
        deliveryProofReference: cleanText(value.deliveryProofReference, 160, 3),
      };
    }
    throw new ShopOrderError("INVALID_REQUEST", "Delivery or pickup completion facts are invalid.");
  }
  if (value !== undefined && value !== null) {
    throw new ShopOrderError("INVALID_REQUEST", "This transition does not accept structured details.");
  }
  return null;
}

function parseIsoDate(value: unknown, field: string): string {
  if (typeof value !== "string") {
    throw new ShopOrderError("INVALID_REQUEST", `The ${field} is invalid.`);
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    throw new ShopOrderError("INVALID_REQUEST", `The ${field} is invalid.`);
  }
  return new Date(timestamp).toISOString();
}

const returnReasons = new Set<ShopReturnReason>([
  "WRONG_SIZE",
  "NOT_AS_DESCRIBED",
  "DAMAGED",
  "CHANGED_MIND",
  "OTHER",
]);

export function parseReturnRequest(value: unknown): {
  idempotencyKey: string;
  requestFingerprint: string;
  reason: ShopReturnReason;
  detail: string;
} {
  if (
    !isObject(value)
    || !hasOnlyKeys(value, ["version", "idempotencyKey", "reason", "detail"])
    || value.version !== 1
    || typeof value.reason !== "string"
    || !returnReasons.has(value.reason as ShopReturnReason)
  ) throw new ShopOrderError("INVALID_REQUEST", "The return request is invalid.");
  const request = {
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
    reason: value.reason as ShopReturnReason,
    detail: cleanText(value.detail, 500, 10),
  };
  return { ...request, requestFingerprint: sha256Fingerprint(request) };
}

export function parseReturnTransition(value: unknown): ShopOperatorReturnTransition {
  if (!isObject(value) || !hasOnlyKeys(value, ["dimension", "target"])) {
    throw new ShopOrderError("INVALID_REQUEST", "The return transition is invalid.");
  }
  if (
    value.dimension === "RETURN"
    && (value.target === "APPROVED" || value.target === "REJECTED" || value.target === "RECEIVED")
  ) return { dimension: "RETURN", target: value.target };
  if (
    value.dimension === "REFUND"
    && (value.target === "PENDING" || value.target === "COMPLETED" || value.target === "FAILED")
  ) return { dimension: "REFUND", target: value.target };
  if (
    value.dimension === "RETURN_RESOLUTION"
    && (value.target === "RESTOCK" || value.target === "WRITE_OFF")
  ) return { dimension: "RETURN_RESOLUTION", target: value.target };
  throw new ShopOrderError("INVALID_REQUEST", "The return transition target is invalid.");
}

export function parseRefundReference(value: unknown, required: boolean): string | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ShopOrderError("INVALID_REQUEST", "A refund reference is required.");
    return null;
  }
  return cleanText(value, 160, 4);
}

export function parseRefundAmount(value: unknown, required: boolean): number | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ShopOrderError("INVALID_REQUEST", "A refund amount is required.");
    return null;
  }
  if (!Number.isSafeInteger(value) || (value as number) <= 0) {
    throw new ShopOrderError("INVALID_REQUEST", "The refund amount is invalid.");
  }
  return value as number;
}

export function parseRefundCurrency(value: unknown, required: boolean): "NGN" | null {
  if (value === undefined || value === null || value === "") {
    if (required) throw new ShopOrderError("INVALID_REQUEST", "A refund currency is required.");
    return null;
  }
  if (value !== "NGN") throw new ShopOrderError("INVALID_REQUEST", "The refund currency is invalid.");
  return "NGN";
}

const evidenceExtensions: Record<ShopPaymentEvidenceContentType, readonly string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
};

export function parseEvidenceMetadata(value: unknown) {
  if (
    !isObject(value)
    || !hasOnlyKeys(value, [
      "idempotencyKey",
      "originalFileName",
      "contentType",
      "byteSize",
      "sha256",
    ])
    || typeof value.contentType !== "string"
    || !shopPaymentEvidenceContentTypes.includes(value.contentType as ShopPaymentEvidenceContentType)
    || !Number.isSafeInteger(value.byteSize)
    || (value.byteSize as number) < 1
    || (value.byteSize as number) > SHOP_PAYMENT_EVIDENCE_MAX_BYTES
    || typeof value.sha256 !== "string"
    || !/^[0-9a-f]{64}$/.test(value.sha256)
  ) {
    throw new ShopOrderError("INVALID_REQUEST", "The payment-evidence metadata is invalid.");
  }
  const contentType = value.contentType as ShopPaymentEvidenceContentType;
  const originalFileName = cleanText(value.originalFileName, 180);
  if (
    originalFileName.includes("/")
    || originalFileName.includes("\\")
    || !evidenceExtensions[contentType].some((extension) => originalFileName.toLowerCase().endsWith(extension))
  ) {
    throw new ShopOrderError("INVALID_REQUEST", "The evidence filename does not match its MIME type.");
  }
  const metadata = {
    idempotencyKey: parseIdempotencyKey(value.idempotencyKey),
    originalFileName,
    contentType,
    byteSize: value.byteSize as number,
    sha256: value.sha256,
  };
  return {
    ...metadata,
    requestFingerprint: sha256Fingerprint(metadata),
  };
}

export function extensionForEvidenceType(contentType: ShopPaymentEvidenceContentType): string {
  return contentType === "image/jpeg"
    ? ".jpg"
    : contentType === "image/png"
      ? ".png"
      : contentType === "image/webp"
        ? ".webp"
        : ".pdf";
}
