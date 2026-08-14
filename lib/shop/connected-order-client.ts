import type {
  BagItem,
  ShopCheckoutRequest,
  ShopCheckoutSubmissionIntent,
  ShopProduct,
} from "./domain/entities";

export type ConnectedOrderFailureKind =
  | "AUTH_REQUIRED"
  | "STOCK_CHANGED"
  | "VALIDATION"
  | "IDEMPOTENCY"
  | "VERSION_CONFLICT"
  | "RETRYABLE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "UNKNOWN";

export interface ConnectedOrderFailure {
  kind: ConnectedOrderFailureKind;
  message: string;
  retryable: boolean;
}
export function checkoutPayloadFingerprint(
  bag: readonly BagItem[],
  request: ShopCheckoutRequest,
): string {
  return JSON.stringify({
    lines: bag.map(({ slug, size }) => ({ slug, taggedSize: size, quantity: 1 })),
    contact: request.contact,
    fulfillment: request.fulfillment,
  });
}

export function createConnectedCheckoutIntent(
  bag: readonly BagItem[],
  products: readonly ShopProduct[],
  request: ShopCheckoutRequest,
  idempotencyKey: string,
): ShopCheckoutSubmissionIntent | null {
  if (!bag.length || !idempotencyKey) return null;
  const productsBySlug = new Map(products.map((product) => [product.slug, product]));
  const seen = new Set<string>();
  const lines = bag.flatMap((item) => {
    const product = productsBySlug.get(item.slug);
    if (
      !product
      || !product.availabilityConfirmed
      || product.availability !== "AVAILABLE"
      || product.taggedSize !== item.size
      || seen.has(item.slug)
    ) return [];
    seen.add(item.slug);
    return [{ slug: item.slug, taggedSize: item.size, quantity: 1 as const }];
  });
  if (lines.length !== bag.length) return null;
  return { version: 1, idempotencyKey, lines, contact: request.contact, fulfillment: request.fulfillment };
}

export function mapConnectedOrderFailure(status: number, code?: string): ConnectedOrderFailure {
  if (status === 401 || code === "UNAUTHENTICATED") {
    return {
      kind: "AUTH_REQUIRED",
      message: "Confirm your email to place this order. Your bag will stay here.",
      retryable: true,
    };
  }
  if (status === 403 || code === "FORBIDDEN") {
    return { kind: "FORBIDDEN", message: "This account cannot complete that action.", retryable: false };
  }
  if (status === 404 || code === "NOT_FOUND") {
    return { kind: "NOT_FOUND", message: "That order could not be found.", retryable: false };
  }
  if (code === "INVENTORY_UNAVAILABLE") {
    return {
      kind: "STOCK_CHANGED",
      message: "A piece is no longer available. Your bag and details are unchanged.",
      retryable: false,
    };
  }
  if (code === "IDEMPOTENCY_MISMATCH") {
    return {
      kind: "IDEMPOTENCY",
      message: "Your checkout changed. Review it once more, then place the order again.",
      retryable: true,
    };
  }
  if (code === "VERSION_CONFLICT") {
    return {
      kind: "VERSION_CONFLICT",
      message: "This order changed moments ago. Refresh before trying that action again.",
      retryable: true,
    };
  }
  if (status === 400 || status === 413 || code === "INVALID_REQUEST" || code === "PAYLOAD_TOO_LARGE") {
    return {
      kind: "VALIDATION",
      message: "Check the details and try again. Nothing in your bag was removed.",
      retryable: false,
    };
  }
  if (status === 503 || code === "PERSISTENCE_UNAVAILABLE") {
    return {
      kind: "RETRYABLE",
      message: "Orders are briefly unavailable. Your bag is safe; try again shortly.",
      retryable: true,
    };
  }
  return {
    kind: "UNKNOWN",
    message: "We could not complete that action. Your bag and details are unchanged.",
    retryable: true,
  };
}

export function retainUncommittedBagLines(
  bag: readonly BagItem[],
  committedSlugs: readonly string[],
): BagItem[] {
  const committed = new Set(committedSlugs);
  return bag.filter((item) => !committed.has(item.slug));
}
