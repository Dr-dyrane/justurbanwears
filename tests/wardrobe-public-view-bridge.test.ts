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
import { selectWardrobePublicView } from "../lib/studio/projections/public-listing";

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

test("Studio holds the twelve saleable wardrobe rows and promotes the six former drafts in place", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  assert.equal(seeded.garments.length, 12);
  assert.equal(seeded.listings.length, 12);
  assert.equal(seeded.inventory.length, 12);
  assert.equal(WARDROBE_AUTHORITY_MANAGED_SLUGS.length, 12);

  const drop = seeded.garments.filter((garment) => /^DYN-0(?:87|88|89|90|91|92)$/.test(garment.sku));
  assert.equal(drop.length, 6);
  for (const garment of drop) {
    assert.equal(garment.state, "PUBLISHED");
    assert.equal(garment.saleEligible, true);
    assert.equal(garment.sizeLabel, "Size on request");
    assert.equal(garment.mediaState, "READY");
    assert.equal(garment.canonState, "APPROVED");
    assert.equal(seeded.listings.some((listing) => listing.garmentId === garment.id), true);
    const stock = seeded.inventory.find((record) => record.garmentId === garment.id);
    assert.equal(stock?.state, "PUBLISHED");
    assert.ok(stock?.listingId);
  }

  const reseeded = mergeWardrobeAuthoritySeeds(seeded);
  assert.deepEqual(reseeded, seeded);

  const blush = drop.find((garment) => garment.sku === "DYN-087")!;
  const legacy = createEmptyStudioSnapshot();
  legacy.garments.push({
    ...blush,
    sku: "REVIEW-BLUSH-MINI-001",
    title: "Operator blush title",
    sizeLabel: "Pending",
    estimatedFit: "Pending",
    price: 21000,
    condition: "Pending inspection",
    notes: "Front study ready. Back and measurements remain pending.",
    privateNote: "Keep operator note",
    publicDescription: "",
    saleEligible: false,
    classificationState: "DRAFT",
    mediaState: "DRAFT",
    state: "DRAFT",
    availability: "ARCHIVED",
    canonState: "DRAFT",
  });
  legacy.inventory.push({
    id: "wardrobe-stock-reviewed-nude-ruched-sundress",
    garmentId: blush.id,
    onHand: 1,
    reserved: 0,
    sold: 0,
    returned: 0,
    writeOff: 0,
    state: "DRAFT",
    updatedAt: "2026-08-10T00:00:00.000Z",
  });
  const upgraded = mergeWardrobeAuthoritySeeds(legacy);
  const promoted = upgraded.garments.find((garment) => garment.id === blush.id)!;
  assert.equal(promoted.sku, "DYN-087");
  assert.equal(promoted.title, "Operator blush title");
  assert.equal(promoted.price, 21000);
  assert.equal(promoted.privateNote, "Keep operator note");
  assert.equal(promoted.state, "PUBLISHED");
  assert.equal(promoted.saleEligible, true);
  assert.equal(upgraded.listings.filter((listing) => listing.garmentId === blush.id).length, 1);
  const promotedStock = upgraded.inventory.find((record) => record.garmentId === blush.id);
  assert.equal(promotedStock?.state, "PUBLISHED");
  assert.ok(promotedStock?.listingId);
});

test("Studio preserves the authored Drop 01 product study when materializing the public wardrobe view", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const blushListing = seeded.listings.find((listing) => listing.slug === "blush-scoop-mini-dress")!;
  blushListing.publicProjection = {
    ...blushListing.publicProjection!,
    drop: "Studio release",
    story: "Curated by justurban wears.",
    details: ["Excellent", "Blush pink", "Size on request"],
  };

  const blush = selectWardrobePublicView(seeded).find(
    (product) => product.slug === "blush-scoop-mini-dress",
  );
  assert.ok(blush);
  assert.equal(blush.drop, "Drop 01");
  assert.match(blush.story, /open neckline/);
  assert.deepEqual(blush.details, [
    "Scoop neckline",
    "Fitted mini length",
    "Soft stretch hand",
    "Real-worn wardrobe piece",
  ]);
  assert.doesNotMatch(JSON.stringify(blush), /Curated by justurban wears|Studio release/);
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
