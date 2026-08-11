import type {
  BagItem,
  ShopCheckoutAvailabilityConfirmation,
  ShopProduct,
} from "../../../../../lib/shop/domain/entities";
import { loadServerShopProducts } from "../../../../../lib/shop/server-catalog";

export const dynamic = "force-dynamic";

const responseHeaders = {
  "cache-control": "no-store, max-age=0",
  "content-type": "application/json; charset=utf-8",
} as const;

function parseLines(value: unknown): BagItem[] | null {
  if (!value || typeof value !== "object" || !("lines" in value) || !Array.isArray(value.lines)) {
    return null;
  }
  if (!value.lines.length || value.lines.length > 10) return null;
  const seen = new Set<string>();
  const lines = value.lines.flatMap((line) => {
    if (
      !line
      || typeof line !== "object"
      || !("slug" in line)
      || !("size" in line)
      || typeof line.slug !== "string"
      || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(line.slug)
      || typeof line.size !== "string"
      || !line.size.trim()
      || line.size.length > 60
      || seen.has(line.slug)
    ) return [];
    seen.add(line.slug);
    return [{ slug: line.slug, size: line.size }];
  });
  return lines.length === value.lines.length ? lines : null;
}

export function evaluateCheckoutAvailability(
  products: readonly ShopProduct[],
  lines: readonly BagItem[],
): ShopCheckoutAvailabilityConfirmation {
  const bySlug = new Map(products.map((product) => [product.slug, product]));
  let hasUnconfirmedStock = false;
  for (const line of lines) {
    const product = bySlug.get(line.slug);
    if (!product || product.taggedSize !== line.size) return "CHANGED";
    if (!product.availabilityConfirmed) {
      hasUnconfirmedStock = true;
    } else if (product.availability !== "AVAILABLE") {
      return "CHANGED";
    }
  }
  return hasUnconfirmedStock ? "UNAVAILABLE" : "CONFIRMED";
}

export async function POST(request: Request): Promise<Response> {
  const contentLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(contentLength) && contentLength > 4096) {
    return Response.json({ status: "CHANGED" }, { status: 413, headers: responseHeaders });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ status: "CHANGED" }, { status: 400, headers: responseHeaders });
  }
  const lines = parseLines(body);
  if (!lines) {
    return Response.json({ status: "CHANGED" }, { status: 400, headers: responseHeaders });
  }

  const products = await loadServerShopProducts();
  const status = evaluateCheckoutAvailability(products, lines);
  return Response.json(
    { status },
    { status: status === "UNAVAILABLE" ? 503 : 200, headers: responseHeaders },
  );
}
