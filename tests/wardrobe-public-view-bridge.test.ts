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

test("the wardrobe public view strips private fields and enforces four product frames plus optional approved front", () => {
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
    ["GARMENT_FRONT", "GARMENT_BACK", "MANNEQUIN_FRONT", "MODEL_FRONT", "FABRIC_DETAIL"],
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

test("Studio merges six migration garments and two reviewed drafts by stable identity", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  assert.equal(seeded.garments.length, 8);
  assert.equal(seeded.listings.length, 6);
  assert.equal(seeded.inventory.length, 8);

  const reviewed = seeded.garments.filter((garment) => garment.sku.startsWith("REVIEW-"));
  assert.deepEqual(reviewed.map((garment) => garment.title), [
    "Nude ruched sundress",
    "Purple beaded evening gown",
  ]);
  for (const garment of reviewed) {
    assert.equal(garment.state, "DRAFT");
    assert.equal(garment.saleEligible, false);
    assert.equal(garment.sizeLabel, "Pending");
    assert.equal(garment.condition, "Pending inspection");
    assert.deepEqual(garment.measurements, []);
    assert.deepEqual(garment.references, []);
  }

  const reseeded = mergeWardrobeAuthoritySeeds(seeded);
  assert.equal(reseeded.garments.length, 8);
  assert.equal(reseeded.listings.length, 6);
  assert.equal(reseeded.inventory.length, 8);

  const existing = createEmptyStudioSnapshot();
  existing.garments.push({ ...reviewed[0], id: "user-kept-draft", notes: "Operator note" });
  const merged = mergeWardrobeAuthoritySeeds(existing);
  assert.equal(merged.garments.filter((garment) => garment.sku === reviewed[0].sku).length, 1);
  assert.equal(merged.garments.find((garment) => garment.sku === reviewed[0].sku)?.id, "user-kept-draft");
  assert.equal(merged.garments.find((garment) => garment.sku === reviewed[0].sku)?.notes, "Operator note");
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
        itemSlugs: [coral.slug],
        subtotal: coral.price,
        deliveryFee: 0,
        total: coral.price,
        deliveryLabel: "Studio pickup",
        deliveryEstimate: "Next working day",
        placedAt: "2026-08-10T00:00:00.000Z",
        status: "ORDER_RECEIVED",
      }],
    },
  });
  commerce = commerceReducer(commerce, { type: "CATALOG_RECEIVED", products: unpublished });
  assert.deepEqual(commerce.saved, []);
  assert.deepEqual(commerce.bag, []);
  assert.deepEqual(commerce.orders[0].itemSlugs, [coral.slug]);
});

test("Shop derives model availability only from the sanitized optional Lulu front", () => {
  const withFront = wardrobePublicProductToShopProduct(coral);
  assert.equal(withFront.media?.length, 4);
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
