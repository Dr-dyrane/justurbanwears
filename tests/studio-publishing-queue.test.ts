import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { Garment, StudioListing } from "../lib/studio/domain/entities";
import {
  projectStudioNativeShopReadiness,
  selectStudioPublishingQueue,
} from "../lib/studio/projections/publishing-queue";

function garment(id: string, readiness: Garment["nativeShopReadiness"]): Garment {
  return {
    id,
    sku: `INTAKE-${id.toUpperCase()}`,
    title: `${id} dress`,
    category: "Dress",
    sizeLabel: "Size on request",
    estimatedFit: "Measurements confirmed before payment",
    color: "Coral",
    price: 24_500,
    condition: "Excellent",
    source: "Studio intake",
    notes: "",
    privateNote: "",
    publicDescription: "",
    quantity: 1,
    saleEligible: false,
    measurements: [],
    classificationState: "READY",
    mediaState: "READY",
    state: "READY",
    availability: "AVAILABLE",
    canonState: "REVIEW",
    visual: "studio",
    references: [],
    createdAt: "2026-08-26T00:00:00.000Z",
    privateWardrobeItemId: id,
    ...(readiness ? { nativeShopReadiness: readiness } : {}),
  };
}

function listing(garmentId: string, state: StudioListing["state"] = "PUBLISHED"): StudioListing {
  return {
    id: `listing-${garmentId}`,
    garmentId,
    modelId: "model-lulu",
    slug: `${garmentId}-dress`,
    title: `${garmentId} listing`,
    description: "Approved catalogue listing",
    price: 24_500,
    state,
    createdAt: "2026-08-26T00:00:00.000Z",
  };
}

test("Publishing includes server-ready native pieces without fabricating a listing", () => {
  const ready = garment("ready", { path: "STUDIO_NATIVE_THREE_PHOTO", state: "READY" });
  const blocked = garment("blocked", {
    path: "STUDIO_NATIVE_THREE_PHOTO",
    state: "BLOCKED",
    blockers: ["Fabric detail"],
  });

  const queue = selectStudioPublishingQueue([ready, blocked], []);
  assert.deepEqual(queue.map((entry) => ({ kind: entry.kind, state: entry.state, title: entry.title })), [{
    kind: "STUDIO_NATIVE_THREE_PHOTO",
    state: "READY",
    title: "ready dress",
  }]);
  assert.equal("listing" in queue[0], false);
});

test("only the ordinary unpublished review becomes native Shop readiness", () => {
  assert.deepEqual(projectStudioNativeShopReadiness({
    state: "READY",
    wardrobeItemId: "ready",
    expectedRevision: "a".repeat(64),
    title: "Ready dress",
    category: "Dresses",
    colour: "Coral",
    sizeLabel: "Size on request",
    condition: "Excellent",
    price: 24_500,
    quantity: 1,
    media: [],
  }), { path: "STUDIO_NATIVE_THREE_PHOTO", state: "READY" });
  assert.deepEqual(projectStudioNativeShopReadiness({
    state: "BLOCKED",
    wardrobeItemId: "blocked",
    blockers: ["Fabric detail"],
  }), {
    path: "STUDIO_NATIVE_THREE_PHOTO",
    state: "BLOCKED",
    blockers: ["Fabric detail"],
  });
  assert.equal(projectStudioNativeShopReadiness(null), undefined);
  assert.equal(projectStudioNativeShopReadiness({
    state: "PUBLISHED",
    receipt: {
      publicationId: "publication",
      wardrobeItemId: "published",
      sku: "JUW-100",
      slug: "published-dress",
      origin: "STUDIO_NATIVE",
      state: "PUBLISHED",
      publishedAt: "2026-08-26T00:00:00.000Z",
      shopUrl: "/shop/products/published-dress",
    },
  }), undefined);
});

test("only actionable listings enter Publishing", () => {
  const draftGarment = garment("draft", undefined);
  const readyGarment = garment("listing-ready", undefined);
  const publishedGarment = garment("published", undefined);
  const reservedGarment = garment("reserved", undefined);
  const soldGarment = garment("sold", undefined);

  const queue = selectStudioPublishingQueue(
    [draftGarment, readyGarment, publishedGarment, reservedGarment, soldGarment],
    [
      listing(draftGarment.id, "DRAFT"),
      listing(readyGarment.id, "READY"),
      listing(publishedGarment.id, "PUBLISHED"),
      listing(reservedGarment.id, "RESERVED"),
      listing(soldGarment.id, "SOLD"),
    ],
  );

  assert.deepEqual(queue.map((entry) => entry.state), ["DRAFT", "READY"]);
});

test("a published listing suppresses duplicate native readiness without entering the queue", () => {
  const ready = garment("ready", { path: "STUDIO_NATIVE_THREE_PHOTO", state: "READY" });
  const published = listing(ready.id);

  const queue = selectStudioPublishingQueue([ready], [published]);
  assert.equal(queue.length, 0);
});

test("the Wardrobe route and queue keep three-photo readiness explicit and separate from Atelier authority", async () => {
  const [route, workbench, projection] = await Promise.all([
    readFile(new URL("../app/api/studio/wardrobe/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/studio/wardrobe-workbench.tsx", import.meta.url), "utf8"),
    readFile(new URL("../lib/studio/projections/publishing-queue.ts", import.meta.url), "utf8"),
  ]);

  assert.match(route, /getStudioPublicationReview/u);
  assert.match(route, /projectStudioNativeShopReadiness/u);
  assert.match(projection, /STUDIO_NATIVE_THREE_PHOTO/u);
  assert.match(workbench, /selectStudioPublishingQueue/u);
  assert.match(workbench, /selectStudioPublishingQueue\(activeScopedGarments, scopedListings\)/u);
  assert.match(workbench, /All listings are live/u);
  assert.match(workbench, /"NEEDS_PUBLISHING"/u);
  assert.match(workbench, /publishingQueue\.length > 0/u);
  assert.doesNotMatch(workbench, /<StudioSegmentedView active=\{activeView\}/u);
  assert.doesNotMatch(workbench, /collectionIds\.has\(garment\.id\) \|\| garment\.nativeShopReadiness\?\.state === "READY"/u);
  assert.doesNotMatch(workbench, /nativeShopReadiness[^\n]*(?:Atelier|01.?07)/u);
});
