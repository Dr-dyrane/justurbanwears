export interface AskOrderHandoffPiece {
  slug: string;
  sku: string;
}

function normalizeRequestedPiece(value: string) {
  return value.trim().toLocaleLowerCase("en-NG");
}

/**
 * Resolves an Ask Studio piece handoff without guessing or substituting.
 * An alias collision is treated as unavailable so the owning order workflow
 * never selects an arbitrary product.
 */
export function resolveExactOrderHandoffPiece<TPiece extends AskOrderHandoffPiece>(
  products: readonly TPiece[],
  requestedPiece: string | null | undefined,
): TPiece | null {
  const requested = normalizeRequestedPiece(requestedPiece ?? "");
  if (!requested) return null;

  const matches = products.filter((product) => (
    normalizeRequestedPiece(product.slug) === requested
    || normalizeRequestedPiece(product.sku) === requested
  ));

  return matches.length === 1 ? matches[0] : null;
}
