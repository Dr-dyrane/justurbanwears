import { CURRENT_SHOP_DROP } from "../../shop/current-drop";
import { compatibilityCollectionForSku } from "../../shop/collection-compatibility";
import type { Garment, StudioListing } from "../domain/entities";

export type StudioDropScopeKey = "current" | "past" | "studio" | "private";

export interface ResolvedStudioDropScope {
  key: StudioDropScopeKey;
  /** The exact drop label when one exists; otherwise the operator-safe fallback. */
  label: string;
}

export interface StudioDropScope {
  key: StudioDropScopeKey;
  label: string;
  count: number;
  garmentIds: readonly string[];
  /** Exact source labels represented by this scope, kept for progressive disclosure. */
  labels: readonly string[];
}

export interface StudioDropContext {
  currentDrop: string;
  totalCount: number;
  scopes: readonly StudioDropScope[];
}

const SCOPE_ORDER: readonly StudioDropScopeKey[] = [
  "current",
  "past",
  "studio",
  "private",
];

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function projectedDropForGarment(
  garmentId: string,
  listings: readonly StudioListing[],
  currentDrop: string,
) {
  const candidates = listings
    .filter((listing) => listing.garmentId === garmentId)
    .flatMap((listing) => {
      const drop = listing.publicProjection?.drop.trim();
      return drop ? [{ listing, drop }] : [];
    })
    .sort((left, right) => {
      const leftIsCurrent = left.drop === currentDrop;
      const rightIsCurrent = right.drop === currentDrop;
      if (leftIsCurrent !== rightIsCurrent) return leftIsCurrent ? -1 : 1;

      const leftTimestamp = left.listing.publishedAt ?? left.listing.createdAt;
      const rightTimestamp = right.listing.publishedAt ?? right.listing.createdAt;
      const timestampOrder = compareText(rightTimestamp, leftTimestamp);
      return timestampOrder || compareText(left.listing.id, right.listing.id);
    });

  return candidates[0]?.drop;
}

/**
 * Resolves a garment's operator-facing drop scope without generic SKU parsing
 * or inference from source text, lifecycle state, or availability. During the
 * additive collection migration, exact reviewed SKU membership is allowed via
 * the bounded compatibility fixture.
 */
export function studioDropScopeForGarment(
  garment: Garment,
  listings: readonly StudioListing[],
  currentDrop: string = CURRENT_SHOP_DROP,
): ResolvedStudioDropScope {
  // The compatibility map is an exact, reviewed membership fixture. It keeps
  // collection identity separate from lifecycle labels such as SOLD/Archive
  // until the collection foreign-key path becomes authoritative.
  const compatibilityCollection = compatibilityCollectionForSku(garment.sku);
  if (compatibilityCollection) {
    return compatibilityCollection.label === currentDrop
      ? { key: "current", label: compatibilityCollection.label }
      : { key: "past", label: compatibilityCollection.label };
  }

  const projectedDrop = projectedDropForGarment(garment.id, listings, currentDrop);

  if (projectedDrop) {
    return projectedDrop === currentDrop
      ? { key: "current", label: projectedDrop }
      : { key: "past", label: projectedDrop };
  }

  const publishedDrop = garment.dynamicPublication?.drop?.trim();
  if (publishedDrop) {
    return publishedDrop === currentDrop
      ? { key: "current", label: publishedDrop }
      : { key: "past", label: publishedDrop };
  }

  if (garment.dynamicPublication) {
    return { key: "studio", label: "Studio wardrobe" };
  }

  return { key: "private", label: "Private" };
}

/**
 * Builds the small, stable Studio navigation projection over the richer
 * garment/listing model. All four scopes are returned so the UI does not
 * change shape when a scope becomes empty.
 */
export function projectStudioDropScopes(
  garments: readonly Garment[],
  listings: readonly StudioListing[],
  currentDrop: string = CURRENT_SHOP_DROP,
): StudioDropContext {
  const garmentIdsByScope = new Map<StudioDropScopeKey, Set<string>>(
    SCOPE_ORDER.map((key) => [key, new Set<string>()]),
  );
  const labelsByScope = new Map<StudioDropScopeKey, Set<string>>(
    SCOPE_ORDER.map((key) => [key, new Set<string>()]),
  );

  for (const garment of garments) {
    const resolved = studioDropScopeForGarment(garment, listings, currentDrop);
    garmentIdsByScope.get(resolved.key)?.add(garment.id);
    labelsByScope.get(resolved.key)?.add(resolved.label);
  }

  const surfaceLabels: Record<StudioDropScopeKey, string> = {
    current: currentDrop,
    past: "Past drops",
    studio: "Studio wardrobe",
    private: "Private",
  };

  const scopes = SCOPE_ORDER.map<StudioDropScope>((key) => {
    const garmentIds = [...(garmentIdsByScope.get(key) ?? [])].sort(compareText);
    const labels = [...(labelsByScope.get(key) ?? [])].sort(compareText);
    return {
      key,
      label: surfaceLabels[key],
      count: garmentIds.length,
      garmentIds,
      labels,
    };
  });

  return {
    currentDrop,
    totalCount: new Set(garments.map((garment) => garment.id)).size,
    scopes,
  };
}

// Descriptive aliases retained for projection callers that prefer noun-first names.
export const resolveStudioDropScope = studioDropScopeForGarment;
export const projectStudioDropContext = projectStudioDropScopes;
