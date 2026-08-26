import assert from "node:assert/strict";
import test from "node:test";
import { CURRENT_SHOP_DROP } from "../lib/shop/current-drop";
import {
  DROP_01_COMPATIBILITY_SKUS,
  DROP_02_COMPATIBILITY_SKUS,
  compatibilityCollectionForSku,
} from "../lib/shop/collection-compatibility";
import { WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS } from "../lib/wardrobe-public-view/seeds";
import type {
  Garment,
  PublicListingProjection,
  StudioListing,
} from "../lib/studio/domain/entities";
import {
  projectStudioDropScopes,
  studioDropScopeForGarment,
} from "../lib/studio/projections/drop-context";

const CREATED_AT = "2026-08-23T00:00:00.000Z";

function garment(id: string, overrides: Partial<Garment> = {}): Garment {
  return {
    id,
    sku: id.toUpperCase(),
    title: id,
    category: "Dress",
    sizeLabel: "M",
    estimatedFit: "True to size",
    color: "Coral",
    price: 10_000,
    condition: "Excellent",
    source: "Drop 99 must not be inferred from this text",
    notes: "",
    privateNote: "",
    publicDescription: "",
    quantity: 1,
    saleEligible: true,
    measurements: [],
    classificationState: "READY",
    mediaState: "READY",
    state: "READY",
    availability: "AVAILABLE",
    canonState: "APPROVED",
    visual: "umber",
    references: [],
    createdAt: CREATED_AT,
    ...overrides,
  };
}

function projection(drop: string): PublicListingProjection {
  return {
    slug: `piece-${drop.toLowerCase().replaceAll(" ", "-")}`,
    sku: "JUW-TEST",
    name: "Test piece",
    category: "Dresses",
    price: 10_000,
    taggedSize: "M",
    fit: "True to size",
    condition: "Excellent",
    colour: "Coral",
    availability: "AVAILABLE",
    drop,
    tone: "coral",
    silhouette: "dress",
    note: "",
    story: "",
    details: [],
    measurements: [],
    modelAnchor: { id: "lulu-v3" },
    media: [],
  };
}

function listing(
  id: string,
  garmentId: string,
  drop?: string,
  publishedAt?: string,
): StudioListing {
  return {
    id,
    garmentId,
    modelId: "model-lulu",
    slug: id,
    title: id,
    description: "",
    price: 10_000,
    state: "PUBLISHED",
    createdAt: CREATED_AT,
    ...(publishedAt ? { publishedAt } : {}),
    ...(drop === undefined ? {} : { publicProjection: projection(drop) }),
  };
}

test("projects every garment into a stable current, past, studio, or private scope", () => {
  const current = garment("garment-current");
  const past = garment("garment-past");
  const studio = garment("garment-studio", {
    dynamicPublication: {
      publicationId: "publication-studio",
      wardrobeItemId: "wardrobe-studio",
      sku: "STUDIO-001",
      slug: "studio-piece",
      origin: "STUDIO_NATIVE",
      state: "UNPUBLISHED",
      publishedAt: CREATED_AT,
      shopUrl: "/shop/products/studio-piece",
    },
  });
  const privateGarment = garment("garment-private");

  const context = projectStudioDropScopes(
    [privateGarment, studio, past, current],
    [
      listing("listing-past", past.id, "Drop 01"),
      listing("listing-current", current.id, CURRENT_SHOP_DROP),
    ],
  );

  assert.equal(context.currentDrop, CURRENT_SHOP_DROP);
  assert.equal(context.totalCount, 4);
  assert.deepEqual(context.scopes.map(({ key }) => key), ["current", "past", "studio", "private"]);
  assert.deepEqual(context.scopes.map(({ count }) => count), [1, 1, 1, 1]);
  assert.deepEqual(context.scopes[0], {
    key: "current",
    label: "Drop 02",
    count: 1,
    garmentIds: [current.id],
    labels: ["Drop 02"],
  });
  assert.deepEqual(context.scopes[1].labels, ["Drop 01"]);
  assert.deepEqual(context.scopes[2].labels, ["Studio wardrobe"]);
  assert.deepEqual(context.scopes[3].labels, ["Private"]);
});

test("uses only public projection drops and lets a projection outrank dynamic publication", () => {
  const projectedDynamic = garment("garment-projected-dynamic", {
    dynamicPublication: {
      publicationId: "publication-past",
      wardrobeItemId: "wardrobe-past",
      sku: "STUDIO-002",
      slug: "projected-dynamic",
      origin: "STUDIO_NATIVE",
      state: "PUBLISHED",
      publishedAt: CREATED_AT,
      shopUrl: "/shop/products/projected-dynamic",
    },
  });
  const sourceOnly = garment("garment-source-only");

  assert.deepEqual(
    studioDropScopeForGarment(
      projectedDynamic,
      [listing("listing-projected-dynamic", projectedDynamic.id, "Drop 01")],
    ),
    { key: "past", label: "Drop 01" },
  );
  assert.deepEqual(studioDropScopeForGarment(sourceOnly, []), { key: "private", label: "Private" });
});

test("keeps a Studio-native publication in its exact stored drop", () => {
  const published = garment("dynamic-current", {
    dynamicPublication: {
      publicationId: "publication-current",
      wardrobeItemId: "wardrobe-current",
      sku: "JUW-041",
      slug: "dynamic-current",
      origin: "STUDIO_NATIVE",
      state: "PUBLISHED",
      publishedAt: CREATED_AT,
      shopUrl: "/shop/products/dynamic-current",
      drop: CURRENT_SHOP_DROP,
    },
  });

  assert.deepEqual(studioDropScopeForGarment(published, []), {
    key: "current",
    label: CURRENT_SHOP_DROP,
  });
});

test("is deterministic across input ordering and prioritizes a current projection", () => {
  const shared = garment("garment-shared");
  const alpha = garment("garment-alpha");
  const listings = [
    listing("listing-old", shared.id, "Drop 01", "2026-08-22T00:00:00.000Z"),
    listing("listing-current", shared.id, "Drop 02", "2026-08-21T00:00:00.000Z"),
    listing("listing-alpha", alpha.id, "Drop 00"),
  ];

  const forward = projectStudioDropScopes([shared, alpha], listings);
  const reversed = projectStudioDropScopes([alpha, shared], [...listings].reverse());

  assert.deepEqual(forward, reversed);
  assert.deepEqual(studioDropScopeForGarment(shared, listings), {
    key: "current",
    label: "Drop 02",
  });
  assert.deepEqual(forward.scopes[0].garmentIds, [shared.id]);
  assert.deepEqual(forward.scopes[1].garmentIds, [alpha.id]);
  assert.deepEqual(forward.scopes[1].labels, ["Drop 00"]);
});

test("keeps all four UI scopes present when the wardrobe is empty", () => {
  const context = projectStudioDropScopes([], []);
  assert.deepEqual(context.scopes.map(({ key, count }) => ({ key, count })), [
    { key: "current", count: 0 },
    { key: "past", count: 0 },
    { key: "studio", count: 0 },
    { key: "private", count: 0 },
  ]);
});

test("keeps the canonical Drop 02 boundary at the released twenty-four pieces", () => {
  const currentSkus = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS
    .filter((product) => product.drop === CURRENT_SHOP_DROP)
    .map((product) => product.sku);

  assert.deepEqual(currentSkus, [
    "JUW-025", "JUW-026", "JUW-027", "JUW-028",
    "JUW-029", "JUW-030", "JUW-031", "JUW-032",
    "JUW-033", "JUW-034", "JUW-035", "JUW-036",
    "JUW-037", "JUW-038", "JUW-039", "JUW-040", "JUW-041", "JUW-042", "JUW-043", "JUW-044", "JUW-045", "JUW-046", "JUW-047", "JUW-048",
  ]);
});

test("keeps collection membership explicit and independent from sold or archive lifecycle labels", () => {
  assert.equal(DROP_01_COMPATIBILITY_SKUS.length, 18);
  assert.equal(DROP_02_COMPATIBILITY_SKUS.length, 24);
  assert.equal(new Set([...DROP_01_COMPATIBILITY_SKUS, ...DROP_02_COMPATIBILITY_SKUS]).size, 42);
  assert.equal(compatibilityCollectionForSku("JUW-004")?.label, "Drop 01");
  assert.equal(compatibilityCollectionForSku("JUW-040")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-041")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-042")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-043")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-044")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-045")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-046")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-047")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-048")?.label, "Drop 02");
  assert.equal(compatibilityCollectionForSku("JUW-017"), null);

  const sold = garment("sold-drop-01", {
    sku: "JUW-004",
    state: "SOLD",
    availability: "SOLD",
  });
  assert.deepEqual(
    studioDropScopeForGarment(sold, [listing("sold-archive", sold.id, "Archive")]),
    { key: "past", label: "Drop 01" },
  );
});
