import assert from "node:assert/strict";
import test from "node:test";
import {
  WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
  type WardrobePublicProduct,
} from "../lib/wardrobe-public-view/domain/entities";
import { parseStoredWardrobePublicView } from "../lib/wardrobe-public-view/db/browser-repository";
import {
  WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS,
  createWardrobePublicViewMigrationSnapshot,
} from "../lib/wardrobe-public-view/seeds";
import {
  createShopProductMigrationSeeds,
  mergeWardrobePublicView,
  wardrobePublicProductToShopProduct,
} from "../lib/shop/wardrobe-public-view";
import { createInitialCommerceState } from "../lib/shop/domain/state";
import { commerceReducer } from "../lib/shop/machines/commerce-machine";
import { createEmptyStudioSnapshot } from "../lib/studio/domain/state";
import { createStudioService } from "../lib/studio/services/studio-service";
import {
  WARDROBE_AUTHORITY_MANAGED_SLUGS,
  mergeWardrobeAuthoritySeeds,
} from "../lib/studio/seeds/wardrobe-authority";

const coral = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS[0];

function stored(product: unknown, version: number = WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION) {
  return JSON.stringify({
    version,
    data: [product],
    managedSlugs: [coral.slug],
  });
}

test("the wardrobe public view strips private fields and admits only approved anchored model views", () => {
  const parsed = parseStoredWardrobePublicView(stored({
    ...coral,
    privateNote: "never public",
    source: "/storage/private-source.jpg",
    modelId: "private-model-record",
    references: ["private-frame-hash"],
  }));
  assert.equal(parsed.products.length, 1);
  assert.deepEqual(parsed.managedSlugs, [coral.slug]);
  assert.equal("privateNote" in parsed.products[0], false);
  assert.equal("source" in parsed.products[0], false);
  assert.equal(JSON.stringify(parsed).includes("never public"), false);
  assert.deepEqual(
    parsed.products[0].media.map((item) => item.slot),
    [
      "GARMENT_FRONT",
      "GARMENT_BACK",
      "MANNEQUIN_FRONT",
      "MODEL_FRONT",
      "FABRIC_DETAIL",
      "MODEL_LEFT_PROFILE",
      "MODEL_REAR_THREE_QUARTER",
    ],
  );

  const modelBack = {
    slot: "MODEL_BACK",
    src: `/shop/products/${coral.slug}/05-model-back.webp`,
  };
  assert.deepEqual(parseStoredWardrobePublicView(stored({
    ...coral,
    media: [...coral.media, modelBack],
  })).products, []);

  const migrated = parseStoredWardrobePublicView(stored({
    ...coral,
    media: [...coral.media, modelBack],
  }, 2));
  assert.equal(migrated.products.length, 1);
  assert.doesNotMatch(JSON.stringify(migrated), /05-model-back/);

  const wrongAnchor = parseStoredWardrobePublicView(stored({
    ...coral,
    modelAnchor: { id: "another-model", src: "/shop/model/another.png" },
  }));
  assert.deepEqual(wrongAnchor.products, []);
});

test("Studio merges six migration garments and six front-only wardrobe drafts by stable identity", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  assert.equal(seeded.garments.length, 12);
  assert.equal(seeded.listings.length, 6);
  assert.equal(seeded.inventory.length, 12);
  assert.equal(WARDROBE_AUTHORITY_MANAGED_SLUGS.length, 6);

  const reviewed = seeded.garments.filter((garment) => garment.sku.startsWith("REVIEW-"));
  assert.deepEqual(reviewed.map((garment) => garment.title), [
    "Blush scoop mini dress",
    "Orchid beaded column gown",
    "Sage asymmetric ruched maxi dress",
    "Magenta plunge ruched mini dress",
    "Silver off-shoulder mermaid dress",
    "Multicolor abstract strapless mini dress",
  ]);
  for (const garment of reviewed) {
    assert.equal(garment.state, "DRAFT");
    assert.equal(garment.saleEligible, false);
    assert.equal(garment.sizeLabel, "Pending");
    assert.equal(garment.condition, "Pending inspection");
    assert.deepEqual(garment.measurements, []);
    assert.equal(garment.mediaState, "DRAFT");
    assert.deepEqual(garment.references.map((reference) => reference.view), ["FRONT"]);
    assert.match(garment.reviewCover?.src ?? "", /^\/studio\/wardrobe\/.+\/01-garment-front\.webp$/);
    assert.doesNotMatch(JSON.stringify(garment.reviewCover), /storage\/models|source\/instagram/);
    assert.equal(seeded.listings.some((listing) => listing.garmentId === garment.id), false);
    const stock = seeded.inventory.find((record) => record.garmentId === garment.id);
    assert.equal(stock?.state, "DRAFT");
    assert.equal(stock?.listingId, undefined);
  }

  const reseeded = mergeWardrobeAuthoritySeeds(seeded);
  assert.deepEqual(reseeded, seeded);

  const existing = createEmptyStudioSnapshot();
  const operatorDraft = {
    ...reviewed[0],
    sku: "operator-sku",
    title: "Operator title",
    color: "Operator colour",
    source: "Operator source",
    notes: "Operator note",
    visual: "studio" as const,
    reviewCover: {
      ...reviewed[0].reviewCover!,
      alt: "Operator cover",
    },
  };
  existing.garments.push(operatorDraft);
  existing.garments.push({ ...reviewed[1], id: "same-sku-user-row" });
  const merged = mergeWardrobeAuthoritySeeds(existing);
  assert.deepEqual(merged.garments.find((garment) => garment.id === reviewed[0].id), operatorDraft);
  assert.equal(merged.garments.filter((garment) => garment.sku === reviewed[1].sku).length, 1);
  assert.deepEqual(
    merged.garments.find((garment) => garment.sku === reviewed[1].sku),
    existing.garments.find((garment) => garment.sku === reviewed[1].sku),
  );

  const legacy = createEmptyStudioSnapshot();
  legacy.garments.push({
    ...reviewed[0],
    sku: "REVIEW-NUDE-RUCHED-001",
    title: "Nude ruched sundress",
    color: "Nude",
    source: "Reviewed candidate",
    notes: "Size, measurements, and condition remain pending.",
    mediaState: "EMPTY",
    references: [],
    reviewCover: undefined,
  });
  const upgraded = mergeWardrobeAuthoritySeeds(legacy);
  const upgradedDraft = upgraded.garments.find((garment) => garment.id === reviewed[0].id);
  assert.equal(upgradedDraft?.sku, "REVIEW-BLUSH-MINI-001");
  assert.equal(upgradedDraft?.title, "Blush scoop mini dress");
  assert.equal(upgradedDraft?.mediaState, "DRAFT");
  assert.equal(upgradedDraft?.references[0]?.view, "FRONT");
  assert.equal(upgradedDraft?.reviewCover?.src, "/studio/wardrobe/blush-scoop-mini-dress/01-garment-front.webp");

  const renamedAfterUpgrade = {
    ...upgraded,
    garments: upgraded.garments.map((garment) => garment.id === reviewed[0].id
      ? { ...garment, title: "Lulu's renamed blush dress" }
      : garment),
  };
  const reseededAfterRename = mergeWardrobeAuthoritySeeds(renamedAfterUpgrade);
  assert.equal(
    reseededAfterRename.garments.find((garment) => garment.id === reviewed[0].id)?.title,
    "Lulu's renamed blush dress",
  );

  const operatorStyledLegacy = createEmptyStudioSnapshot();
  operatorStyledLegacy.garments.push({
    ...legacy.garments[0],
    visual: "studio",
  });
  const preservedLegacy = mergeWardrobeAuthoritySeeds(operatorStyledLegacy);
  const preservedLegacyDraft = preservedLegacy.garments.find((garment) => garment.id === reviewed[0].id);
  assert.equal(preservedLegacyDraft?.visual, "studio");
  assert.equal(preservedLegacyDraft?.sku, "REVIEW-NUDE-RUCHED-001");
  assert.equal(preservedLegacyDraft?.reviewCover, undefined);
});

test("managed wardrobe slugs tombstone stale migration fallback while orders remain separate", async () => {
  let publicWrite: { products: WardrobePublicProduct[]; managedSlugs: string[] } | null = null;
  const empty = createEmptyStudioSnapshot();
  const service = createStudioService({
    repository: {
      read: async () => empty,
      write: async () => undefined,
      subscribe: () => () => undefined,
    },
    wardrobePublicView: {
      write: async (products, managedSlugs) => {
        publicWrite = { products, managedSlugs };
      },
    },
  });
  await service.hydrate();
  assert.deepEqual(publicWrite, {
    products: [],
    managedSlugs: [...WARDROBE_AUTHORITY_MANAGED_SLUGS],
  });

  const migrationSeeds = createShopProductMigrationSeeds();
  const unpublished = mergeWardrobePublicView(migrationSeeds, {
    products: [],
    managedSlugs: [coral.slug],
  });
  assert.equal(unpublished.some((product) => product.slug === coral.slug), false);
  assert.ok(unpublished.some((product) => product.slug === "moss-square-knit"));

  let commerce = createInitialCommerceState(migrationSeeds);
  commerce = commerceReducer(commerce, {
    type: "HYDRATION_SUCCEEDED",
    snapshot: {
      saved: [coral.slug],
      bag: [{ slug: coral.slug, size: coral.taggedSize }],
      following: false,
      notificationPreferences: { delivery: true, saved: false, drops: false },
      orders: [{
        id: "JUW-20260810-ABC123",
        lines: [{
          snapshot: "PRODUCT",
          slug: coral.slug,
          sku: coral.sku,
          name: coral.name,
          taggedSize: coral.taggedSize,
          unitPrice: coral.price,
          quantity: 1,
        }],
        contact: { name: "Lulu", email: "lulu@example.com", phone: "+2348000000000" },
        fulfillment: { kind: "PICKUP", optionId: "pickup" },
        subtotal: coral.price,
        deliveryFee: 0,
        total: coral.price,
        deliveryLabel: "Studio pickup",
        deliveryEstimate: "After payment",
        savedAt: "2026-08-10T00:00:00.000Z",
        status: "PAYMENT_REQUIRED",
        transmission: "LOCAL_ONLY",
      }],
    },
  });
  commerce = commerceReducer(commerce, { type: "CATALOG_RECEIVED", products: unpublished });
  assert.deepEqual(commerce.saved, []);
  assert.deepEqual(commerce.bag, []);
  assert.deepEqual(commerce.orders[0].lines.map((line) => line.slug), [coral.slug]);
  assert.equal(commerce.orders[0].lines[0].snapshot, "PRODUCT");
});

test("Shop derives model availability only from sanitized approved Lulu views", () => {
  const withFront = wardrobePublicProductToShopProduct(coral);
  assert.equal(withFront.media?.length, 6);
  assert.deepEqual(
    withFront.media
      ?.filter((item) => item.presentation === "model")
      .map((item) => ({ view: item.view, anchor: item.modelAnchorId })),
    [
      { view: "side", anchor: "lulu-v2" },
      { view: "three-quarter", anchor: "lulu-v2" },
    ],
  );
  assert.equal(withFront.modelTryout.modelStatus, "APPROVED");
  if (withFront.modelTryout.modelStatus === "APPROVED") {
    assert.equal(withFront.modelTryout.modelAnchorId, "lulu-v2");
    assert.match(withFront.modelTryout.frame.src, /04-model-front\.webp$/);
  }

  const withoutFront = wardrobePublicProductToShopProduct(
    createWardrobePublicViewMigrationSnapshot().products.find((product) => product.slug === "indigo-workshirt")!,
  );
  assert.equal(withoutFront.media?.length, 4);
  assert.deepEqual(withoutFront.modelTryout, { modelStatus: "PENDING" });
});

test("the sanitizer cannot promote an Indigo model front", () => {
  const indigo = createWardrobePublicViewMigrationSnapshot().products.find(
    (product) => product.slug === "indigo-workshirt",
  )!;
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
    data: [{
      ...indigo,
      media: [
        ...indigo.media,
        {
          slot: "MODEL_FRONT",
          src: "/shop/products/indigo-workshirt/04-model-front.webp",
        },
      ],
    }],
    managedSlugs: [indigo.slug],
  }));

  assert.deepEqual(parsed.products, []);
  assert.deepEqual(parsed.managedSlugs, [indigo.slug]);
});
