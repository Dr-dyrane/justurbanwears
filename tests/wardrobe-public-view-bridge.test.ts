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

test("the wardrobe public view migrates the retired synthetic SKU namespace", () => {
  const parsed = parseStoredWardrobePublicView(stored({
    ...coral,
    sku: "DYN-081",
  }));

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].sku, "JUW-001");
  assert.doesNotMatch(JSON.stringify(parsed), /DYN-081/);
});

test("v7 migrates Moss to a V3 front while retaining V2 supplemental views", () => {
  const moss = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "moss-square-knit",
  );
  assert.ok(moss);
  const legacy = {
    ...moss,
    name: "Operator Moss title",
    price: 13900,
    note: "Operator Moss note.",
    modelAnchor: { id: "lulu-v2", src: "/shop/model/lulu-v2-approved.png" },
    media: moss.media.map(({ slot, src }) => ({ slot, src })),
  };
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 7,
    data: [legacy],
    managedSlugs: [moss.slug],
  }));

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].name, "Operator Moss title");
  assert.equal(parsed.products[0].price, 13900);
  assert.equal(parsed.products[0].note, "Operator Moss note.");
  assert.deepEqual(parsed.products[0].modelAnchor, { id: "lulu-v3" });
  assert.deepEqual(
    parsed.products[0].media
      .filter((frame) => frame.slot.startsWith("MODEL_"))
      .map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [
      { slot: "MODEL_FRONT", modelAnchorId: "lulu-v3" },
      { slot: "MODEL_LEFT_PROFILE", modelAnchorId: "lulu-v2" },
      { slot: "MODEL_REAR_THREE_QUARTER", modelAnchorId: "lulu-v2" },
    ],
  );

  const wrongCurrent = parseStoredWardrobePublicView(JSON.stringify({
    version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
    data: [{
      ...moss,
      media: moss.media.map((frame) => frame.slot === "MODEL_FRONT"
        ? { ...frame, modelAnchorId: "lulu-v2" }
        : frame),
    }],
    managedSlugs: [moss.slug],
  }));
  assert.deepEqual(wrongCurrent.products, []);
});

test("v8 migrates Cocoa to JUW and a V3 front while retaining V2 supplemental views", () => {
  const cocoa = WARDROBE_PUBLIC_VIEW_MIGRATION_SEEDS.find(
    (product) => product.slug === "cocoa-pleat-trouser",
  );
  assert.ok(cocoa);
  const legacy = {
    ...cocoa,
    sku: "DYN-085",
    modelAnchor: { id: "lulu-v2", src: "/shop/model/lulu-v2-approved.png" },
    media: cocoa.media.map(({ slot, src }) => ({
      slot,
      src,
      ...(slot.startsWith("MODEL_") ? { modelAnchorId: "lulu-v2" } : {}),
    })),
  };
  const parsed = parseStoredWardrobePublicView(JSON.stringify({
    version: 8,
    data: [legacy],
    managedSlugs: [cocoa.slug],
  }));

  assert.equal(parsed.products.length, 1);
  assert.equal(parsed.products[0].sku, "JUW-005");
  assert.deepEqual(parsed.products[0].modelAnchor, { id: "lulu-v3" });
  assert.deepEqual(
    parsed.products[0].media
      .filter((frame) => frame.slot.startsWith("MODEL_"))
      .map(({ slot, modelAnchorId }) => ({ slot, modelAnchorId })),
    [
      { slot: "MODEL_FRONT", modelAnchorId: "lulu-v3" },
      { slot: "MODEL_LEFT_PROFILE", modelAnchorId: "lulu-v2" },
      { slot: "MODEL_REAR_THREE_QUARTER", modelAnchorId: "lulu-v2" },
    ],
  );
});

test("Studio holds the twelve saleable wardrobe rows and promotes the six former drafts in place", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  assert.equal(seeded.garments.length, 12);
  assert.equal(seeded.listings.length, 12);
  assert.equal(seeded.inventory.length, 12);
  assert.equal(WARDROBE_AUTHORITY_MANAGED_SLUGS.length, 12);

  const drop = seeded.garments.filter((garment) => /^JUW-0(?:07|08|09|10|11|12)$/.test(garment.sku));
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

  const blush = drop.find((garment) => garment.sku === "JUW-007")!;
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
  assert.equal(promoted.sku, "JUW-007");
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

test("Studio renames legacy catalogue SKUs in place without resetting inventory", () => {
  const seeded = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  const coralGarment = seeded.garments.find((garment) => garment.sku === "JUW-001")!;
  const coralListing = seeded.listings.find((listing) => listing.garmentId === coralGarment.id)!;
  const coralInventory = seeded.inventory.find((record) => record.garmentId === coralGarment.id)!;
  const legacyGarmentId = "wardrobe-seed-dyn-081";
  const legacy = {
    ...seeded,
    garments: seeded.garments.map((garment) => garment.id === coralGarment.id
      ? { ...garment, id: legacyGarmentId, sku: "DYN-081" }
      : garment),
    listings: seeded.listings.map((listing) => listing.id === coralListing.id
      ? {
          ...listing,
          id: "wardrobe-listing-dyn-081",
          garmentId: legacyGarmentId,
          publicProjection: { ...listing.publicProjection!, sku: "DYN-081" },
        }
      : listing),
    inventory: seeded.inventory.map((record) => record.id === coralInventory.id
      ? {
          ...record,
          id: "wardrobe-stock-dyn-081",
          garmentId: legacyGarmentId,
          listingId: "wardrobe-listing-dyn-081",
          reserved: 1,
          state: "RESERVED" as const,
        }
      : record),
  };

  const migrated = mergeWardrobeAuthoritySeeds(legacy);
  const garment = migrated.garments.find((candidate) => candidate.id === legacyGarmentId)!;
  const listing = migrated.listings.find((candidate) => candidate.id === "wardrobe-listing-dyn-081")!;
  const inventory = migrated.inventory.find((candidate) => candidate.id === "wardrobe-stock-dyn-081")!;
  assert.equal(migrated.garments.length, 12);
  assert.equal(garment.sku, "JUW-001");
  assert.equal(listing.garmentId, legacyGarmentId);
  assert.equal(listing.publicProjection?.sku, "JUW-001");
  assert.equal(inventory.reserved, 1);
  assert.equal(inventory.state, "RESERVED");
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

test("revoking model fronts preserves truthful wardrobe rows", () => {
  for (const slug of [
    "sage-asymmetric-ruched-maxi-dress",
    "silver-off-shoulder-mermaid-dress",
  ]) {
    const wardrobeProduct = createWardrobePublicViewMigrationSnapshot().products.find(
      (product) => product.slug === slug,
    )!;
    const legacyMedia = wardrobeProduct.media.filter(
      (item) => item.slot !== "MODEL_REAR_THREE_QUARTER",
    );
    const parsed = parseStoredWardrobePublicView(JSON.stringify({
      version: 6,
      data: [{
        ...wardrobeProduct,
        name: `Operator ${slug}`,
        price: 31900,
        note: `Operator note for ${slug}.`,
        media: [
          ...legacyMedia,
          {
            slot: "MODEL_FRONT",
            src: `/shop/products/${slug}/04-model-front.webp`,
          },
        ],
      }],
      managedSlugs: [slug],
    }));

    assert.equal(parsed.products.length, 1);
    assert.deepEqual(parsed.managedSlugs, [slug]);
    assert.equal(parsed.products[0].name, `Operator ${slug}`);
    assert.equal(parsed.products[0].price, 31900);
    assert.equal(parsed.products[0].note, `Operator note for ${slug}.`);
    const product = wardrobePublicProductToShopProduct(parsed.products[0]);
    assert.deepEqual(product.modelTryout, { modelStatus: "PENDING" });
    if (slug === "silver-off-shoulder-mermaid-dress") {
      const modelMedia = product.media?.filter((item) => item.presentation === "model") ?? [];
      assert.equal(product.media?.length, 5);
      assert.deepEqual(modelMedia.map((item) => item.src), [
        "/shop/products/silver-off-shoulder-mermaid-dress/05-model-rear-three-quarter.webp",
      ]);
    } else {
      assert.equal(product.media?.length, 4);
      assert.equal(product.media?.some((item) => item.presentation === "model"), false);
    }
  }
});
