import { ShopOrderError, type ShopOrderErrorCode } from "./types";

const responseHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
  "x-content-type-options": "nosniff",
} as const;

const statusByCode: Record<ShopOrderErrorCode, number> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  INVALID_REQUEST: 400,
  NOT_FOUND: 404,
  IDEMPOTENCY_MISMATCH: 409,
  INVENTORY_UNAVAILABLE: 409,
  VERSION_CONFLICT: 409,
  INVALID_TRANSITION: 409,
  RETURN_WINDOW_CLOSED: 409,
  EVIDENCE_AUTHORIZATION_EXPIRED: 409,
  EVIDENCE_MISMATCH: 409,
  PAYLOAD_TOO_LARGE: 413,
  PAYMENT_CONFIGURATION_UNAVAILABLE: 503,
  PERSISTENCE_UNAVAILABLE: 503,
};

export function shopJson(value: unknown, init: ResponseInit = {}): Response {
  return Response.json(value, {
    ...init,
    headers: { ...responseHeaders, ...init.headers },
  });
}

export async function readShopJson(request: Request, maximumBytes = 16_384): Promise<unknown> {
  const contentType = request.headers.get("content-type")?.split(";", 1)[0].trim();
  if (contentType !== "application/json") {
    throw new ShopOrderError("INVALID_REQUEST", "A JSON request body is required.");
  }
  const contentLength = request.headers.get("content-length");
  if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > maximumBytes)) {
    throw new ShopOrderError("PAYLOAD_TOO_LARGE", "The JSON request body is too large.");
  }
  const text = await request.text();
  if (new TextEncoder().encode(text).byteLength > maximumBytes) {
    throw new ShopOrderError("PAYLOAD_TOO_LARGE", "The JSON request body is too large.");
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new ShopOrderError("INVALID_REQUEST", "The JSON request body is malformed.");
  }
}

export async function shopRoute(operation: () => Promise<Response>): Promise<Response> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ShopOrderError) {
      return shopJson(
        { ok: false, error: { code: error.code, message: error.message } },
        { status: statusByCode[error.code] },
      );
    }
    console.error("Shop order route failed.", error);
    return shopJson(
      {
        ok: false,
        error: {
          code: "PERSISTENCE_UNAVAILABLE",
          message: "The order service is temporarily unavailable.",
        },
      },
      { status: 503 },
    );
  }
}

export type ShopRouteContext = {
  params: Promise<Record<string, string>> | Record<string, string>;
};

export async function routeParam(context: ShopRouteContext, name: string): Promise<string> {
  const params = await context.params;
  return params[name] ?? "";
}
