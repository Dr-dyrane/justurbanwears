import assert from "node:assert/strict";
import test from "node:test";
import type { StudioAuthoritySnapshot } from "../lib/studio/services/studio-authority-client";
import {
  resolveStudioAssistantWorkflow,
  scoreStudioAssistantDocument,
} from "../lib/studio/assistant/experience";
import { studioAssistantContextFromProjection } from "../lib/studio/assistant/projection";
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
  actorSubject: "actor-private-subject",
  workspaceId: "workspace-juw",
  workspaceSubject: "private-subject",
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
      description: "A teal draped mini set with a softly gathered finish.",
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
      observedLocationKey: "WARDROBE_RAIL",
      observedLocationLabel: "Wardrobe rail",
      observedAt: now,
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
      previewAssetUrl: "/shop/products/lime-one-shoulder-rosette-ruched-mini-dress/04-model-front.webp",
      previewWidth: 1120,
      previewHeight: 1400,
      authorityId: "lulu-v4",
      authorityRevision: "LULU_V4_2026-08-25.7",
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
    storageScope: studioOperatorStorageScope(operator.actorSubject),
  });
  assert.match(projection.operator.storageScope, /^[0-9a-f]{64}$/);
  assert.doesNotMatch(serialized, new RegExp(operator.subject));
});

test("operator browser storage scopes stay actor-specific inside one shared Studio", () => {
  const first = studioOperatorStorageScope(operator.actorSubject);
  const repeated = studioOperatorStorageScope(operator.actorSubject);
  const otherMemberSameWorkspace = studioOperatorStorageScope("different-actor-subject");

  assert.equal(first, repeated);
  assert.notEqual(first, otherMemberSameWorkspace);
  assert.equal(first.includes(operator.actorSubject), false);
});

test("authority failure yields null truth instead of false zeroes", () => {
  const projection = projectConnectedStudioApplication({ operator, now, authority: null });
  assert.equal(projection.summary.attention.value, null);
  assert.equal(projection.summary.available.value, null);
  assert.equal(projection.summary.drafts.value, null);
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
  assert.equal(projection.summary.attention.value, 0);
  assert.equal(projection.summary.drafts.value, 2);
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
  const pieceResult = first.searchDocuments.find((item) => item.id === "piece:sku:JUW-025");
  assert.equal(pieceResult?.route, "/studio/wardrobe/wardrobe-025");
  assert.equal(pieceResult?.primaryLabel, "JUW-025");
  assert.equal(pieceResult?.secondaryLabel, "Teal Draped Mini Set · Sets · Teal · M");
  assert.equal(pieceResult?.description, "A teal draped mini set with a softly gathered finish.");
  assert.deepEqual(pieceResult?.aliases, ["sku:JUW-025", "JUW-025", "Teal Draped Mini Set"]);
  assert.deepEqual(pieceResult?.availableActions, ["CREATE_HOLD", "CREATE_ORDER", "UPDATE_LOCATION"]);
  assert.equal(first.searchDocuments.filter((item) => item.route === "/studio/wardrobe/wardrobe-025").length, 1);
  const assistantPiece = studioAssistantContextFromProjection(first).documents.find((item) => item.id === pieceResult?.id);
  assert.ok(assistantPiece);
  assert.equal(assistantPiece.detail, "A teal draped mini set with a softly gathered finish.");
  assert.equal(scoreStudioAssistantDocument(assistantPiece, "JUW-025"), 180);
  assert.equal(
    resolveStudioAssistantWorkflow("What is the description of JUW025?", studioAssistantContextFromProjection(first))
      .response.blocks.find((block) => block.kind === "answer")?.body,
    "A teal draped mini set with a softly gathered finish.",
  );
  assert.equal(first.summary.orders.value, null);
  assert.ok(first.degradedSources.some((item) => item.source === "ORDERS"));
  assert.equal(first.summary.live.value, null);
  assert.ok(first.degradedSources.some((item) => item.source === "PUBLICATION"));
  assert.equal(first.summary.attention.value, 0);
  assert.equal(first.summary.drafts.value, 0);
  assert.deepEqual(first.continueAction, {
    id: "add-piece",
    label: "Add the next piece",
    href: "/studio/wardrobe?intake=1",
    openCount: 0,
    source: "CONNECTED",
  });
});

test("location or custody mismatches suppress reservation actions", () => {
  const authority = fixture();
  authority.pieces = [{
    ...authority.pieces[0],
    hasLocationMismatch: true,
    observedLocationKey: "POPUP_RAIL",
    observedLocationLabel: "Pop-up rail",
    observedAt: now,
  }];
  const projection = projectConnectedStudioApplication({
    operator,
    now,
    authority,
    holdWriteReady: true,
    orderWriteReady: true,
  });
  assert.deepEqual(projection.searchDocuments.find((item) => item.id === "piece:sku:JUW-025")?.availableActions, ["UPDATE_LOCATION"]);
  assert.equal(projection.searchDocuments.some((item) => item.id === "sku:JUW-025"), false);
});

test("reservation actions require a positive exact Wardrobe observation", () => {
  const actionsFor = (piece: StudioAuthoritySnapshot["pieces"][number]) => {
    const authority = fixture();
    authority.pieces = [piece];
    return projectConnectedStudioApplication({ operator, now, authority })
      .searchDocuments.find((item) => item.id === `piece:${piece.pieceKey}`)
      ?.availableActions ?? [];
  };
  const availablePiece = fixture().pieces[0];

  assert.deepEqual(actionsFor(availablePiece), ["CREATE_HOLD", "CREATE_ORDER", "UPDATE_LOCATION"]);
  assert.deepEqual(actionsFor({
    ...availablePiece,
    observedAt: null,
  }), ["UPDATE_LOCATION"]);
  assert.deepEqual(actionsFor({
    ...availablePiece,
    observedLocationKey: "PACKING_SHELF",
    observedLocationLabel: "Packing shelf",
  }), ["UPDATE_LOCATION"]);
  assert.deepEqual(actionsFor({
    ...availablePiece,
    expectedLocationKey: "PACKING_SHELF",
    expectedLocationLabel: "Packing shelf",
  }), ["UPDATE_LOCATION"]);
});

test("unresolved custody also suppresses active-hold release", () => {
  const authority = fixture();
  authority.pieces = [{
    ...authority.pieces[0],
    availability: "RESERVED",
    activeHold: {
      id: "hold-1",
      sku: "JUW-025",
      customerName: "Private customer",
      contact: "private",
      reason: "Fitting",
      status: "ACTIVE",
      expiresAt: "2026-08-24T12:00:00.000Z",
      createdAt: now,
      releasedAt: null,
    },
    expectedCustody: "COURIER",
    hasLocationMismatch: true,
  }];
  const projection = projectConnectedStudioApplication({ operator, now, authority });
  const actions = projection.searchDocuments.find((item) => item.id === "piece:sku:JUW-025")?.availableActions ?? [];
  assert.equal(actions.includes("RELEASE_HOLD"), false);
  assert.equal(actions.includes("CREATE_ORDER"), false);
});

test("an active hold must be reconciled to the wardrobe rail before release", () => {
  const authority = fixture();
  const activeHold = {
    id: "hold-1",
    sku: "JUW-025",
    customerName: "Private customer",
    contact: "private",
    reason: "Fitting",
    status: "ACTIVE" as const,
    expiresAt: "2026-08-24T12:00:00.000Z",
    createdAt: now,
    releasedAt: null,
  };
  authority.pieces = [{
    ...authority.pieces[0],
    activeHold,
    availability: "RESERVED",
    expectedLocationKey: "PACKING_SHELF",
    expectedLocationLabel: "Packing shelf",
  }];
  let projection = projectConnectedStudioApplication({ operator, now, authority });
  let actions = projection.searchDocuments.find((item) => item.id === "piece:sku:JUW-025")?.availableActions ?? [];
  assert.equal(actions.includes("RELEASE_HOLD"), false);
  assert.equal(actions.includes("UPDATE_LOCATION"), true);

  authority.pieces = [{
    ...authority.pieces[0],
    expectedLocationKey: "WARDROBE_RAIL",
    expectedLocationLabel: "Wardrobe rail",
    observedLocationKey: "WARDROBE_RAIL",
    observedLocationLabel: "Wardrobe rail",
    observedAt: now,
  }];
  projection = projectConnectedStudioApplication({ operator, now, authority });
  actions = projection.searchDocuments.find((item) => item.id === "piece:sku:JUW-025")?.availableActions ?? [];
  assert.equal(actions.includes("RELEASE_HOLD"), true);

  authority.pieces = [{
    ...authority.pieces[0],
    activeHold: { ...activeHold, status: "RELEASED", releasedAt: now },
  }];
  projection = projectConnectedStudioApplication({ operator, now, authority });
  actions = projection.searchDocuments.find((item) => item.id === "piece:sku:JUW-025")?.availableActions ?? [];
  assert.equal(actions.includes("RELEASE_HOLD"), false);
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
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTIONS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTION_MEMBERSHIP_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "WARDROBE_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "ORDERS_CREATE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "ORDERS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "MEDIA_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "HOLDS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "LOCATIONS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "OPERATIONS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "MODELS_READ")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "MODELS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.degradedSources.some((item) => item.source === "COLLECTIONS"), false);
  assert.deepEqual(projection.continueAction, {
    id: "returns",
    label: "Review 1 return",
    href: "/studio/operations?view=orders&scenario=lifecycle",
    openCount: 1,
    source: "SCENARIO",
  });
  assert.equal(projection.summary.attention.value, 1);
  assert.equal(projection.summary.drafts.value, 1);
  assert.equal(projection.summary.available.value, 37);
  assert.equal(projection.summary.live.value, 36);
  assert.ok(projection.searchDocuments.some((document) => document.kind === "ORDER" && document.route.includes("order=scenario-order-reserved")));
  const scenarioPiece = projection.searchDocuments.find((document) => document.kind === "PIECE");
  assert.ok(scenarioPiece);
  assert.match(scenarioPiece.primaryLabel, /^(?:JUW|SIM)-/);
  assert.ok(scenarioPiece.aliases.some((alias) => alias !== scenarioPiece.primaryLabel));
  assert.equal(projection.searchDocuments.filter((document) => document.route === scenarioPiece.route).length, 1);
  assert.equal(projection.searchDocuments.some((document) => document.kind === "SKU"), false);
  assert.equal(projection.searchDocuments.some((document) => document.kind === "MODEL"), false);
  assert.ok(projection.searchDocuments.every((document) => document.route.includes("scenario=lifecycle")));
});

test("connected projection keeps first-class reads separate from proven write capability", () => {
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
        memberSkus: [],
        counts: { pieces: 0, private: 0, ready: 0, published: 0, available: 0 },
        nextAction: "/studio/wardrobe?collection=drop-03",
        updatedAt: now,
      }],
    },
    holdWriteReady: true,
    locationWriteReady: true,
    orderWriteReady: true,
  });
  assert.deepEqual(projection.collectionScopes.map((scope) => scope.key), ["drop-03"]);
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTIONS_READ")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTIONS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "COLLECTION_MEMBERSHIP_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "WARDROBE_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "ORDERS_CREATE")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "ORDERS_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "MEDIA_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "HOLDS_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "LOCATIONS_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "MODELS_WRITE")?.state, "UNAVAILABLE");
  assert.equal(projection.capabilities.find((item) => item.id === "OPERATIONS_WRITE")?.state, "AVAILABLE");
  assert.equal(projection.degradedSources.some((item) => item.source === "COLLECTIONS"), false);
  assert.equal(projection.searchDocuments.find((item) => item.id.startsWith("collection:"))?.primaryLabel, "Drop 03");

  const assistantContext = studioAssistantContextFromProjection(projection);
  for (const query of [
    "Create a new drop",
    "Rename Drop 03",
    "Activate Drop 03",
    "Archive Drop 03",
    "Generate media for JUW-025",
    "Update Lulu model",
  ]) {
    const workflow = resolveStudioAssistantWorkflow(query, assistantContext);
    assert.equal(workflow.response.blocks.some((item) => item.kind === "handoff"), false, query);
    assert.equal(workflow.taskDraft, null, query);
  }
});

test("collection membership correction is available only to Studio admins", () => {
  const collections = {
    generatedAt: now,
    scopes: [{
      id: "4b8b9d7e-37f8-4b2e-86dc-d2d345d35d2c",
      key: "drop-02" as const,
      label: "Drop 02",
      ordinal: 2,
      version: 1,
      state: "ACTIVE" as const,
      isCurrent: true,
      authority: "DATABASE" as const,
      memberSkus: ["JUW-025"],
      counts: { pieces: 1, private: 0, ready: 0, published: 1, available: 1 },
      nextAction: "/studio/wardrobe?collection=drop-02",
      updatedAt: now,
    }],
  };
  const projection = projectConnectedStudioApplication({
    operator: { ...operator, role: "operator" },
    now,
    authority: fixture(),
    collections,
  });
  assert.equal(
    projection.capabilities.find((item) => item.id === "COLLECTION_MEMBERSHIP_WRITE")?.state,
    "UNAVAILABLE",
  );
});

test("database collection membership overrides the legacy Drop 01 lifecycle in search", () => {
  const authority = fixture();
  authority.pieces = [{
    ...authority.pieces[0],
    pieceKey: "sku:JUW-001",
    wardrobeItemId: "wardrobe-001",
    sku: "JUW-001",
  }];

  const compatibilityProjection = projectConnectedStudioApplication({ operator, now, authority });
  assert.equal(
    compatibilityProjection.searchDocuments.find((item) => item.id === "piece:sku:JUW-001")?.lifecycleState,
    "SOLD_OUT",
  );

  const databaseProjection = projectConnectedStudioApplication({
    operator,
    now,
    authority,
    collections: {
      generatedAt: now,
      scopes: [{
        id: "6af83751-4782-4f84-8707-a2ba61a45f36",
        key: "drop-02",
        label: "Drop 02",
        ordinal: 2,
        version: 1,
        state: "ACTIVE",
        isCurrent: true,
        authority: "DATABASE",
        memberSkus: ["JUW-001"],
        counts: { pieces: 1, private: 0, ready: 0, published: 0, available: 1 },
        nextAction: "/studio/wardrobe?collection=drop-02",
        updatedAt: now,
      }],
    },
  });
  assert.equal(
    databaseProjection.searchDocuments.find((item) => item.id === "piece:sku:JUW-001")?.lifecycleState,
    "AVAILABLE",
  );
});

test("database collection truth exposes an unmapped published piece as Unassigned", () => {
  const authority = fixture();
  authority.pieces = [{
    ...authority.pieces[0],
    pieceKey: "sku:JUW-004",
    wardrobeItemId: "wardrobe-004",
    sku: "JUW-004",
  }];

  const projection = projectConnectedStudioApplication({
    operator,
    now,
    authority,
    collections: {
      generatedAt: now,
      scopes: [{
        id: "6af83751-4782-4f84-8707-a2ba61a45f36",
        key: "drop-02",
        label: "Drop 02",
        ordinal: 2,
        version: 1,
        state: "ACTIVE",
        isCurrent: true,
        authority: "DATABASE",
        memberSkus: [],
        counts: { pieces: 0, private: 0, ready: 0, published: 0, available: 0 },
        nextAction: "/studio/wardrobe?collection=drop-02",
        updatedAt: now,
      }],
    },
  });
  const piece = projection.searchDocuments.find((item) => item.id === "piece:sku:JUW-004");
  assert.equal(piece?.lifecycleState, authority.pieces[0]?.availability);
  assert.match(piece?.secondaryLabel ?? "", /Unassigned/);
  assert.doesNotMatch(piece?.secondaryLabel ?? "", /Drop 01/);
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
    projection.collectionScopes.map((scope) => scope.memberSkus),
    SHOP_COLLECTION_COMPATIBILITY.map((scope) => [...scope.skus]),
  );
  assert.deepEqual(
    projection.collectionScopes.map((scope) => scope.counts.published),
    [18, 34],
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
