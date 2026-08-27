/**
 * Transitional collection membership used until `shop_collections` is the
 * authoritative runtime source. Membership is explicit: never infer a drop
 * from a SKU range, display label, lifecycle state, or availability.
 */
/** Drop 01 members with a completed historical Shop catalogue projection. */
export const DROP_01_COMPLETED_SKUS = Object.freeze([
  "JUW-001", "JUW-002", "JUW-003", "JUW-004", "JUW-005", "JUW-006",
  "JUW-007", "JUW-008", "JUW-009", "JUW-010", "JUW-011", "JUW-012",
  "JUW-013", "JUW-014", "JUW-015", "JUW-016", "JUW-020", "JUW-021",
] as const);

/** Drop 01 members retained as historical archived drafts, never completed listings. */
export const DROP_01_INCOMPLETE_ARCHIVED_DRAFT_SKUS = Object.freeze([
  "JUW-017", "JUW-018", "JUW-019", "JUW-022", "JUW-023", "JUW-024",
] as const);

export const DROP_01_COMPATIBILITY_SKUS = Object.freeze([
  ...DROP_01_COMPLETED_SKUS,
  ...DROP_01_INCOMPLETE_ARCHIVED_DRAFT_SKUS,
] as const);

export const DROP_02_COMPATIBILITY_SKUS = Object.freeze([
  "JUW-025", "JUW-026", "JUW-027", "JUW-028", "JUW-029", "JUW-030",
  "JUW-031", "JUW-032", "JUW-033", "JUW-034", "JUW-035", "JUW-036",
  "JUW-037", "JUW-038", "JUW-039", "JUW-040", "JUW-041", "JUW-042", "JUW-043", "JUW-044", "JUW-045", "JUW-046", "JUW-047", "JUW-048", "JUW-049", "JUW-050", "JUW-051", "JUW-052", "JUW-053", "JUW-054",
] as const);

export const SHOP_COLLECTION_COMPATIBILITY = Object.freeze([
  Object.freeze({
    id: "compat:drop-01",
    key: "drop-01",
    label: "Drop 01",
    ordinal: 1,
    state: "ARCHIVED",
    isCurrent: false,
    skus: DROP_01_COMPATIBILITY_SKUS,
  }),
  Object.freeze({
    id: "compat:drop-02",
    key: "drop-02",
    label: "Drop 02",
    ordinal: 2,
    state: "ACTIVE",
    isCurrent: true,
    skus: DROP_02_COMPATIBILITY_SKUS,
  }),
] as const);

export type ShopCompatibilityCollection = (typeof SHOP_COLLECTION_COMPATIBILITY)[number];

const collectionBySku = new Map<string, ShopCompatibilityCollection>(
  SHOP_COLLECTION_COMPATIBILITY.flatMap((collection) => (
    collection.skus.map((sku) => [sku, collection] as const)
  )),
);

export function compatibilityCollectionForSku(sku: string) {
  return collectionBySku.get(sku.trim().toUpperCase()) ?? null;
}

export function compatibilityCollectionSkus(key: ShopCompatibilityCollection["key"]) {
  return SHOP_COLLECTION_COMPATIBILITY.find((collection) => collection.key === key)?.skus ?? [];
}
