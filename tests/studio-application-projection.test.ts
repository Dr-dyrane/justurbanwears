import assert from "node:assert/strict";
import test from "node:test";
import type { StudioAuthoritySnapshot } from "../lib/studio/services/studio-authority-client";
import { shopProducts } from "../lib/shop/catalog";
import {
  DROP_01_INCOMPLETE_ARCHIVED_DRAFT_SKUS,
  SHOP_COLLECTION_COMPATIBILITY,
} from "../lib/shop/collection-compatibility";
import {
  projectConnectedStudioApplication,
  projectScenarioStudioApplication,
  studioOperatorStorageScope,
} from "../lib/server/studio-application-projection";
import type { StudioOperator } from "../lib/server/studio-operator";

const operator: StudioOperator = {
  subject: "private-subject",
  email: "lulu@example.com",
  displayName: "Lulu",
  role: "admin",
};
const now = "2026-08-23T12:00:00.000Z";

function fixture(): StudioAuthoritySnapshot {
  return {
    generatedAt: "2026-08-23T11:59:00.000Z",
    pieces: [{
      pieceKey: "sku:JUW-025",
      wardrobeItemId: "wardrobe-025",
      sku: "JUW-025",
      title: "Teal Draped Mini Set",
      category: "Sets",
      colour: "Teal",
      condition: "Excellent",
      sizeLabel: "M",
      imageSrc: "/private/source.jpg",
      availability: "AVAILABLE",
      expectedLocationKey: "WARDROBE_RAIL",
      expectedLocationLabel: "Wardrobe rail",
      expectedCustody: "STUDIO",
      orderReference: null,
      observedLocationKey: null,
      observedLocationLabel: null,
      observedAt: null,
      hasLocationMismatch: false,
      activeHold: null,
    }],
    orders: [],
    holds: [],
    models: [{
      id: "model-current",
      name: "Lulu",
      kind: "LULU_V3",
      state: "READY",
      sourceAssetUrl: "/api/studio/models/model-current/asset",
      licenseUrl: "https://private.invalid/license",
      authorityConfirmedAt: now,
      authority: { canonVersion: "private", provider: "private-provider" },
      createdAt: now,
      updatedAt: now,
    }],
    media: [{
      id: "media-1",
      wardrobeItemId: "wardrobe-025",
      title: "Teal Draped Mini Set",
      sku: "JUW-025",
      operation: "MODEL_TRY_ON",
      state: "APPROVED",
      outputUrl: "/api/private/output",
      modelName: "Lulu",
      costUsd: "1.00",
      createdAt: now,
      updatedAt: now,
    }],
    notifications: [{
      id: "hold:private-reason",
      kind: "HOLD",
      tone: "attention",
      title: "Hold expires soon · JUW-025",
      detail: "Private Customer · +234 800 000 0000",
      href: "/studio/operations?view=holds",
      actionLabel: "Review hold",
      createdAt: now,
    }],
  };
}

test("connected projection redacts private authority and customer details", () => {
  const projection = projectConnectedStudioApplication({ operator, now, authority: fixture() });
  const serialized = JSON.stringify(projection);
  assert.doesNotMatch(serialized, /private-subject|lulu@example\.com|private\/source|private\/output/);
  assert.doesNotMatch(serialized, /canonVersion|private-provider|license|Private Customer|\+234/);
  assert.match(serialized, /Teal Draped Mini Set/);
  assert.deepEqual(projection.operator, {
    displayName: "Lulu",
    role: "admin",
    storageScope: studioOperatorStorageScope(operator.subject),
  });
  assert.match(projection.operator.storageScope, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(serialized, new RegExp(operator.subject));
});

test("operator browser storage scopes are opaque, stable and identity-specific", () => {
  const first = studioOperatorStorageScope(operator.subject);
  const repeated = studioOperatorStorageScope(operator.subject);
  const other = studioOperatorStorageScope("different-private-subject");

  assert.equal(first, repeated);
  assert.notEqual(first, other);
  assert.equal(first.includes(operator.subject), false);
});

test("authority failure yields null truth instead of false zeroes", () => {
  const projection = projectConnectedStudioApplication({ operator, now, authority: null });
  assert.equal(projection.summary.attention.value, null);
  assert.equal(projection.summary.available.value, null);
  assert.equal(projection.summary.live.value, null);
  assert.equal(projection.summary.orders.value, null);
  assert.equal(projection.capabilities.find((item) => item.id === "SEARCH")?.state, "READ_ONLY_COMPATIBILITY");
  assert.equal(projection.capabilities.find((item) => item.id === "ASK_READ")?.state, "READ_ONLY_COMPATIBILITY");
  assert.equal(projection.continueAction, null);
  assert.ok(projection.degradedSources.some((item) => item.source === "AUTHORITY"));
});

test("connected draft continuation opens the exact private garment", () => {
  const authority = fixture();
  authority.notifications = [];
  authority.pieces = [
    { ...authority.pieces[0], availability: "PRIVATE", wardrobeItemId: "wardrobe-private-025" },
    { ...authority.pieces[0], pieceKey: "private-without-record", availability: "PRIVATE", wardrobeItemId: null },
  ];

  const projection = projectConnectedStudioApplication({ operator, now, authority });

  assert.deepEqual(projection.continueAction, {
    id: "drafts",
    label: "Finish 2 drafts",
    href: "/studio/wardrobe/wardrobe-private-025",
    openCount: 2,
    source: "CONNECTED",
  });
});

test("connected draft continuation falls back to the private collection when no dossier exists", () => {
  const authority = fixture();
  authority.notifications = [];
  authority.pieces = [{ ...authority.pieces[0], availability: "PRIVATE", wardrobeItemId: null }];

  const projection = projectConnectedStudioApplication({ operator, now, authority });

  assert.equal(projection.continueAction?.href, "/studio/wardrobe?collection=private");
});

test("search documents are bounded, canonical and deterministic", () => {
  const first = projectConnectedStudioApplication({ operator, now, authority: fixture() });
  const second = projectConnectedStudioApplication({ operator, now, authority: fixture() });
  assert.deepEqual(first.searchDocuments, second.searchDocuments);
  assert.ok(first.searchDocuments.length <= 300);
  assert.equal(first.searchDocuments[0]?.id, "service:atelier");
  assert.equal(first.searchDocuments.find((item) => item.id === "sku:JUW-025")?.route, "/studio/wardrobe/wardrobe-025");
  assert.equal(first.summary.orders.value, null);
  assert.ok(first.degradedSources.some((item) => item.source === "ORDERS"));
  assert.equal(first.summary.live.value, null);
  assert.ok(first.degradedSources.some((item) => item.source === "PUBLICATION"));
  assert.deepEqual(first.continueAction, {
    id: "update:hold:private-reason",
    label: "Review hold",
    href: "/studio/operations?view=holds",
    openCount: 1,
    source: "CONNECTED",
  });
});

test("scenario projection is explicit and uses the sanitized collection compatibility snapshot", () => {
  const projection = projectScenarioStudioApplication({ operator, now, scenario: "lifecycle" });
  assert.deepEqual(projection.mode, {
    kind: "SCENARIO",
    id: "lifecycle",
    label: "Lifecycle",
    notice: "Development simulator · isolated from connected Studio",
  });
  assert.deepEqual(projection.sourceRevisions.map((item) => item.source), ["SCENARIO"]);
  assert.deepEqual(
    projection.collectionScopes.map((scope) => ({ key: scope.key, pieces: scope.counts.pieces })),
    SHOP_COLLECTION_COMPATIBILITY.map((scope) => ({ key: scope.key, pieces: scope.skus.length })),
  );
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTIONS_READ")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTIONS_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.degradedSources.some((item) => item.source === "COLLECTIONS"), false);
  assert.deepEqual(projection.continueAction, {
    id: "returns",
    label: "Review 1 return",
    href: "/studio/operations?view=orders&scenario=lifecycle",
    openCount: 1,
    source: "SCENARIO",
  });
  assert.equal(projection.summary.attention.value, 1);
  assert.equal(projection.summary.available.value, 31);
  assert.equal(projection.summary.live.value, 30);
  assert.ok(projection.searchDocuments.every((document) => document.route.includes("scenario=lifecycle")));
});

test("connected projection prefers first-class collections and exposes write capability", () => {
  const projection = projectConnectedStudioApplication({
    operator,
    now,
    authority: fixture(),
    collections: {
      generatedAt: now,
      scopes: [{
        id: "4b8b9d7e-37f8-4b2e-86dc-d2d345d35d2c",
        key: "drop-03",
        label: "Drop 03",
        ordinal: 3,
        version: 1,
        state: "DRAFT",
        isCurrent: false,
        authority: "DATABASE",
        counts: { pieces: 0, private: 0, ready: 0, published: 0, available: 0 },
        nextAction: "/studio/wardrobe?collection=drop-03",
        updatedAt: now,
      }],
    },
  });
  assert.deepEqual(projection.collectionScopes.map((scope) => scope.key), ["drop-03"]);
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTIONS_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.degradedSources.some((item) => item.source === "COLLECTIONS"), false);
  assert.equal(projection.searchDocuments.find((item) => item.id.startsWith("collection:"))?.primaryLabel, "Drop 03");
});

test("collection compatibility map exposes only exact Drop 01 and Drop 02 scopes", () => {
  const projection = projectConnectedStudioApplication({ operator, now, authority: fixture() });
  assert.deepEqual(projection.collectionScopes.map((scope) => ({
    id: scope.id,
    key: scope.key,
    label: scope.label,
    current: scope.isCurrent,
    authority: scope.authority,
  })), [
    { id: "compat:drop-01", key: "drop-01", label: "Drop 01", current: false, authority: "COMPATIBILITY" },
    { id: "compat:drop-02", key: "drop-02", label: "Drop 02", current: true, authority: "COMPATIBILITY" },
  ]);
  assert.deepEqual(
    projection.collectionScopes.map((scope) => scope.counts.pieces),
    SHOP_COLLECTION_COMPATIBILITY.map((scope) => scope.skus.length),
  );
  assert.deepEqual(
    projection.collectionScopes.map((scope) => scope.counts.published),
    [18, 28],
  );
  assert.deepEqual(
    projection.collectionScopes.map((scope) => scope.counts.private),
    [6, 0],
  );
  assert.equal(
    shopProducts.some((product) => (
      (DROP_01_INCOMPLETE_ARCHIVED_DRAFT_SKUS as readonly string[]).includes(product.sku)
    )),
    false,
  );
  assert.ok(projection.degradedSources.some((item) => (
    item.source === "COLLECTIONS"
    && item.message === "Drop changes are temporarily unavailable."
  )));
  assert.equal(projection.degradedSources.some((item) => (
    item.source === "COLLECTIONS"
    && item.message.includes("transitional drop map")
  )), false);
});
