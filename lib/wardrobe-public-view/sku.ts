const LEGACY_CATALOGUE_SKU_ENTRIES = [
  ["DYN-081", "JUW-001"],
  ["DYN-082", "JUW-002"],
  ["DYN-083", "JUW-003"],
  ["DYN-084", "JUW-004"],
  ["DYN-085", "JUW-005"],
  ["DYN-086", "JUW-006"],
  ["DYN-087", "JUW-007"],
  ["DYN-088", "JUW-008"],
  ["DYN-089", "JUW-009"],
  ["DYN-090", "JUW-010"],
  ["DYN-091", "JUW-011"],
  ["DYN-092", "JUW-012"],
  ["DYN-093", "JUW-013"],
  ["DYN-094", "JUW-014"],
  ["DYN-096", "JUW-016"],
] as const;

export const LEGACY_CATALOGUE_SKU_RENAMES = Object.freeze(
  Object.fromEntries(LEGACY_CATALOGUE_SKU_ENTRIES) as Record<
    (typeof LEGACY_CATALOGUE_SKU_ENTRIES)[number][0],
    (typeof LEGACY_CATALOGUE_SKU_ENTRIES)[number][1]
  >,
);

const legacySkuByCurrentSku = new Map(
  LEGACY_CATALOGUE_SKU_ENTRIES.map(([legacySku, currentSku]) => [currentSku, legacySku]),
);

/** Normalize the retired synthetic catalogue namespace without changing unknown SKUs. */
export function canonicalCatalogueSku(value: string) {
  const normalized = value.trim().toUpperCase();
  return LEGACY_CATALOGUE_SKU_RENAMES[
    normalized as keyof typeof LEGACY_CATALOGUE_SKU_RENAMES
  ] ?? normalized;
}

export function legacyCatalogueSku(value: string) {
  return legacySkuByCurrentSku.get(canonicalCatalogueSku(value));
}
