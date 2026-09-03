import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { beforeEach, mock, test } from "node:test";
import type { StudioAssistantFocus, StudioAssistantThreadDetail } from "../lib/studio/assistant/threads";
import {
  studioAssistantToolOutputSchema,
  type StudioAssistantOperation,
  type StudioAssistantOperationKind,
  type StudioAssistantOperationPreview,
  type StudioAssistantTarget,
  type StudioAssistantToolName,
} from "../lib/studio/assistant/tool-contracts";
import type { StudioApplicationProjection, StudioCollectionScope } from "../lib/studio/application/contracts";
import type { GarmentLifecycleWorkspace } from "../lib/studio/engine/garment-lifecycle-contracts";
import type { StudioAuthoritySnapshot } from "../lib/studio/services/studio-authority-client";
import type { StudioCollectionPreview, StudioCollectionIntent } from "../lib/studio/collections/contracts";
import type { StudioOperator } from "../lib/server/studio-operator-projection";

const MODULE_MOCK_CHILD = "JUW_STUDIO_TOOL_SERVICE_MOCK_CHILD";
const moduleMockingAvailable = typeof mock.module === "function";

if (!moduleMockingAvailable) {
  test("Studio Assistant tool service behavioral contract", () => {
    assert.notEqual(process.env[MODULE_MOCK_CHILD], "1", "Node module mocks are unavailable in the child process.");
    const result = spawnSync(process.execPath, [
      "--experimental-test-module-mocks",
      "--import",
      "tsx",
      "--test",
      fileURLToPath(import.meta.url),
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: { ...process.env, [MODULE_MOCK_CHILD]: "1" },
    });
    assert.equal(result.status, 0, [result.stdout, result.stderr].filter(Boolean).join("\n"));
  });
} else {
  const NOW = "2026-09-02T12:00:00.000Z";
  const THREAD_ID = "00000000-0000-4000-8000-000000000001";
  const DRAFT_REVISION = "b".repeat(64);
  const COLLECTION_REVISION = "d".repeat(64);

  const operator: StudioOperator = Object.freeze({
    actorSubject: "actor:lulu",
    displayName: "Lulu",
    email: "lulu@example.com",
    role: "admin",
    subject: "juw-studio",
    workspaceId: "juw-studio",
    workspaceSubject: "juw-studio",
  });

  const drop01: StudioCollectionScope = {
    authority: "DATABASE",
    counts: { available: 17, pieces: 17, private: 0, published: 17, ready: 0 },
    id: "collection-drop-01",
    isCurrent: false,
    key: "drop-01",
    label: "Drop 01",
    memberSkus: [],
    nextAction: "/studio/wardrobe?collection=drop-01",
    ordinal: 1,
    state: "ARCHIVED",
    updatedAt: NOW,
    version: 3,
  };

  const drop02: StudioCollectionScope = {
    authority: "DATABASE",
    counts: { available: 16, pieces: 17, private: 0, published: 17, ready: 0 },
    id: "collection-drop-02",
    isCurrent: true,
    key: "drop-02",
    label: "Drop 02",
    memberSkus: ["JUW-026", "JUW-027"],
    nextAction: "/studio/wardrobe?collection=drop-02",
    ordinal: 2,
    state: "ACTIVE",
    updatedAt: NOW,
    version: 4,
  };

  const projection: StudioApplicationProjection = {
    capabilities: [
      { id: "PROJECTION", state: "AVAILABLE" },
      { id: "SEARCH", state: "AVAILABLE" },
      { id: "ASK_READ", state: "AVAILABLE" },
      { id: "WARDROBE_READ", state: "AVAILABLE" },
      { id: "WARDROBE_WRITE", state: "AVAILABLE" },
      { id: "ORDERS_READ", state: "AVAILABLE" },
      { id: "MODELS_READ", state: "AVAILABLE" },
      { id: "MEDIA_READ", state: "AVAILABLE" },
      { id: "OPERATIONS_READ", state: "AVAILABLE" },
      { id: "COLLECTIONS_READ", state: "AVAILABLE" },
      { id: "COLLECTION_MEMBERSHIP_WRITE", state: "AVAILABLE" },
    ],
    collectionScopes: [drop01, drop02],
    continueAction: null,
    degradedSources: [],
    generatedAt: NOW,
    mode: { kind: "CONNECTED" },
    operator: {
      displayName: operator.displayName,
      role: operator.role,
      storageScope: "1".repeat(64),
    },
    projectionVersion: "studio-application/v1",
    searchDocuments: [
      {
        aliases: ["JUW-026", "violet mini"],
        description: "A deep-violet beaded mini dress with soft flounces.",
        id: "piece:item-026",
        kind: "PIECE",
        lifecycleState: "PUBLISHED",
        primaryLabel: "Violet Beaded Mini Dress",
        route: "/studio/wardrobe/item-026",
        secondaryLabel: "Dress · Deep violet · S,M",
      },
      {
        aliases: ["JUW-027", "violet gown"],
        description: "A violet ruched gown.",
        id: "piece:item-027",
        kind: "PIECE",
        lifecycleState: "PUBLISHED",
        primaryLabel: "Violet Ruched Gown",
        route: "/studio/wardrobe/item-027",
        secondaryLabel: "Dress · Violet",
      },
      {
        aliases: ["JUW-099"],
        description: "A disposable archived test garment.",
        id: "piece:item-099",
        kind: "PIECE",
        lifecycleState: "ARCHIVED_DRAFT",
        primaryLabel: "Archived Test Garment",
        route: "/studio/wardrobe/item-099",
        secondaryLabel: "Archived",
      },
      {
        aliases: ["Drop 02", "drop-02"],
        id: "collection:collection-drop-02",
        kind: "COLLECTION",
        lifecycleState: "ACTIVE",
        primaryLabel: "Drop 02",
        route: "/studio/wardrobe?collection=drop-02",
        secondaryLabel: "17 pieces",
      },
      {
        aliases: ["ORD-001"],
        id: "order:order-001",
        kind: "ORDER",
        lifecycleState: "ACTIVE",
        primaryLabel: "ORD-001",
        route: "/studio/orders/ORD-001",
        secondaryLabel: "Violet Beaded Mini Dress",
      },
      {
        aliases: ["media-026-front"],
        id: "media:media-026-front",
        kind: "MEDIA",
        lifecycleState: "APPROVED",
        primaryLabel: "Garment front",
        route: "/studio/media?piece=item-026",
        secondaryLabel: "Approved catalogue media",
      },
      {
        aliases: ["lulu-v4", "Lulu V4"],
        id: "model:model-lulu",
        kind: "MODEL",
        lifecycleState: "READY",
        primaryLabel: "Lulu V4",
        route: "/studio/models?view=authority&model=model-lulu",
        secondaryLabel: "Current authority",
      },
    ],
    sourceRevisions: [],
    summary: {
      attention: { asOf: NOW, source: "CONNECTED", value: 1 },
      available: { asOf: NOW, source: "CONNECTED", value: 16 },
      drafts: { asOf: NOW, source: "CONNECTED", value: 0 },
      live: { asOf: NOW, source: "CONNECTED", value: 17 },
      orders: { asOf: NOW, source: "CONNECTED", value: 1 },
    },
  };

  const publishedFacts = {
    category: "Dress" as const,
    colour: "Deep violet",
    condition: "New",
    description: "A deep-violet beaded mini dress with soft flounces.",
    price: 30_599,
    sizeLabel: "S,M",
    title: "Violet Beaded Mini Dress",
  };

  const publishedWorkspace: GarmentLifecycleWorkspace = {
    allowedActions: ["EDIT", "PUBLISH_REVISION", "ARCHIVE"],
    draft: {
      diff: [{
        after: "Violet Beaded Mini Dress",
        before: "Violet Beaded Ruffle Romper",
        field: "title",
        label: "Name",
      }],
      expectedRevision: DRAFT_REVISION,
      facts: publishedFacts,
      id: "00000000-0000-4000-8000-000000000026",
      media: [],
      revisionNumber: 3,
      updatedAt: NOW,
      version: 8,
    },
    editableFacts: publishedFacts,
    facts: { ...publishedFacts, title: "Violet Beaded Ruffle Romper" },
    history: [],
    itemVersion: 11,
    live: {
      facts: { ...publishedFacts, title: "Violet Beaded Ruffle Romper" },
      media: [{
        label: "Garment front",
        slot: "GARMENT_FRONT",
        src: "/api/studio/wardrobe/item-026/media/front",
      }],
      receipt: {
        origin: "STUDIO_NATIVE",
        publicationId: "publication-026",
        publishedAt: NOW,
        shopUrl: "/shop/products/violet-beaded-mini-dress",
        sku: "JUW-026",
        slug: "violet-beaded-mini-dress",
        state: "PUBLISHED",
        wardrobeItemId: "item-026",
      },
      sourceRevision: "a".repeat(64),
    },
    mediaEditable: false,
    permanentDelete: { blockers: ["The garment is still published."], eligible: false },
    state: "PUBLISHED",
    wardrobeItemId: "item-026",
  };

  const archivedWorkspace: GarmentLifecycleWorkspace = {
    allowedActions: [],
    editableFacts: {
      category: "Other",
      colour: "Test",
      condition: "Test fixture",
      description: "A disposable archived test garment.",
      price: 0,
      sizeLabel: "Test",
      title: "Archived Test Garment",
    },
    facts: {
      category: "Other",
      colour: "Test",
      condition: "Test fixture",
      description: "A disposable archived test garment.",
      price: 0,
      sizeLabel: "Test",
      title: "Archived Test Garment",
    },
    history: [],
    itemVersion: 5,
    mediaEditable: false,
    permanentDelete: { blockers: [], eligible: true },
    state: "ARCHIVED",
    wardrobeItemId: "item-099",
  };

  const authority: StudioAuthoritySnapshot = {
    generatedAt: NOW,
    holds: [],
    media: [{
      costUsd: null,
      createdAt: "2026-09-01T11:00:00.000Z",
      id: "media-026-front",
      modelName: null,
      operation: "GARMENT_FRONT",
      outputUrl: "/api/studio/wardrobe/item-026/media/front",
      sku: "JUW-026",
      state: "APPROVED",
      title: "Violet Beaded Mini Dress",
      updatedAt: "2026-09-02T11:30:00.000Z",
      wardrobeItemId: "item-026",
    }],
    models: [{
      authority: { adultConfirmed: true, allowedUse: "JUW catalogue" },
      authorityConfirmedAt: "2026-08-31T10:00:00.000Z",
      authorityId: "lulu-v4",
      authorityRevision: "c".repeat(64),
      createdAt: "2026-08-31T10:00:00.000Z",
      id: "model-lulu",
      kind: "LULU_V3",
      licenseUrl: null,
      name: "Lulu",
      previewAssetUrl: "/shop/products/lime-dress/04-model-front.webp",
      sourceAssetUrl: "/api/studio/models/model-lulu/source",
      state: "READY",
      updatedAt: "2026-09-02T11:00:00.000Z",
    }],
    notifications: [],
    orders: [{
      allowedReturnTransitions: [],
      allowedTransitions: [],
      canRequestPaidCancellation: false,
      canRequestReturn: false,
      cancellationRecovery: null,
      contact: { email: "customer@example.com", name: "Customer", phone: "+2340000000000" },
      deliveryEstimate: "Tomorrow",
      deliveryFee: 1_500,
      deliveryLabel: "Lagos delivery",
      events: [],
      evidence: [],
      fulfillment: {
        address: {
          area: "Private test area",
          country: "Nigeria",
          state: "Lagos",
          street: "Private test street",
        },
        kind: "DELIVERY",
        optionId: "lagos",
      },
      fulfillmentFacts: {
        carrierName: null,
        deliveredAt: null,
        deliveryProofReference: null,
        dispatchReference: null,
        dispatchedAt: null,
        kind: "DELIVERY",
        pickupAppointment: null,
        recipientName: "Customer",
        trackingReference: null,
        trackingUrl: null,
      },
      fulfillmentStatus: "NOT_STARTED",
      fundsConfirmation: null,
      fundsConfirmationStatus: "UNCONFIRMED",
      id: "order-001",
      lifecycleStatus: "ACTIVE",
      lines: [{
        name: "Violet Beaded Mini Dress",
        quantity: 1,
        sku: "JUW-026",
        slug: "violet-beaded-mini-dress",
        snapshot: "PRODUCT",
        taggedSize: "S,M",
        unitPrice: 30_599,
      }],
      paymentReviewStatus: "AWAITING_EVIDENCE",
      reservationExpiresAt: null,
      return: null,
      returnEligibleUntil: null,
      savedAt: NOW,
      source: "ONLINE",
      status: "PAYMENT_REQUIRED",
      subtotal: 30_599,
      total: 32_099,
      transmission: "SUBMITTED",
      reference: "ORD-001",
      version: 6,
    }],
    pieces: [{
      activeHold: null,
      authorityRevision: "e".repeat(64),
      authorityUpdatedAt: NOW,
      availability: "AVAILABLE",
      category: "Dress",
      colour: "Deep violet",
      condition: "New",
      description: publishedFacts.description,
      expectedCustody: "STUDIO",
      expectedLocationKey: "WARDROBE_RAIL",
      expectedLocationLabel: "Wardrobe rail",
      hasLocationMismatch: false,
      imageSrc: "/api/studio/wardrobe/item-026/media/front",
      locationVersion: 12,
      observedAt: "2026-09-02T11:15:00.000Z",
      observedLocationKey: "WARDROBE_RAIL",
      observedLocationLabel: "Wardrobe rail",
      orderReference: null,
      pieceKey: "piece-026",
      sizeLabel: "S,M",
      sku: "JUW-026",
      title: publishedFacts.title,
      wardrobeItemId: "item-026",
    }],
  };

  const collectionRead = { generatedAt: NOW, scopes: [drop01, drop02] };
  const collectionPreview: StudioCollectionPreview = {
    changes: [
      { after: "Drop 01", before: "Drop 02", label: "Drop" },
      { after: "Past drop", before: "Current Shop", label: "Shop" },
    ],
    collection: drop01,
    consequence: "JUW-026 will move to Drop 01 while its inventory record remains unchanged.",
    expectedRevision: COLLECTION_REVISION,
    intent: {
      collectionId: drop01.id,
      command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP",
      expectedVersion: drop01.version,
      sku: "JUW-026",
    },
    previousActive: drop02,
    title: "Move JUW-026 to Drop 01",
  };

  type FocusUpdate = Readonly<{
    focus: StudioAssistantFocus;
    operator: StudioOperator;
    threadId: string;
  }>;

  type PreparedOperationInput = Readonly<{
    expectedRevision?: string | null;
    expectedVersion?: number | null;
    idempotencyKey: string;
    kind: StudioAssistantOperationKind;
    operator: StudioOperator;
    payload: Record<string, unknown>;
    preview: StudioAssistantOperationPreview;
    requestFingerprint: string;
    target: StudioAssistantTarget;
    threadId: string;
  }>;

  let focusUpdates: FocusUpdate[] = [];
  let preparedOperations: PreparedOperationInput[] = [];
  let previewedCollectionIntents: StudioCollectionIntent[] = [];
  let operationOrdinal = 0;

  const workspaces: Record<string, GarmentLifecycleWorkspace> = {
    "item-026": publishedWorkspace,
    "item-099": archivedWorkspace,
  };

  mock.module("../lib/server/studio-application-projection.ts", {
    namedExports: {
      getStudioApplicationProjection: async () => projection,
    },
  });
  mock.module("../lib/server/studio-authority-repository.ts", {
    namedExports: {
      getStudioAuthority: async () => authority,
    },
  });
  mock.module("../lib/server/studio-collection-repository.ts", {
    namedExports: {
      listStudioCollections: async () => collectionRead,
      previewStudioCollectionCommand: async (requestedOperator: StudioOperator, intent: StudioCollectionIntent) => {
        assert.equal(requestedOperator.workspaceId, operator.workspaceId);
        previewedCollectionIntents.push(intent);
        return collectionPreview;
      },
    },
  });
  mock.module("../lib/studio/engine/garment-lifecycle-service.ts", {
    namedExports: {
      getGarmentLifecycleWorkspace: async (wardrobeItemId: string) => {
        const workspace = workspaces[wardrobeItemId];
        assert.ok(workspace, `Unexpected wardrobe item ${wardrobeItemId}.`);
        return workspace;
      },
    },
  });
  mock.module("../lib/server/studio-assistant-thread-repository.ts", {
    namedExports: {
      updateStudioAssistantThreadFocus: async (input: FocusUpdate) => {
        focusUpdates.push(structuredClone(input));
      },
    },
  });
  mock.module("../lib/server/studio-assistant-operation-repository.ts", {
    namedExports: {
      createOrReuseStudioAssistantOperation: async (input: PreparedOperationInput): Promise<StudioAssistantOperation> => {
        preparedOperations.push(structuredClone(input));
        operationOrdinal += 1;
        const operationId = `00000000-0000-4000-8000-${String(operationOrdinal).padStart(12, "0")}`;
        return {
          createdAt: NOW,
          createdBy: { displayName: input.operator.displayName },
          executedAt: null,
          executedBy: null,
          expectedRevision: input.expectedRevision ?? null,
          expectedVersion: input.expectedVersion ?? null,
          expiresAt: "2026-09-03T12:00:00.000Z",
          id: operationId,
          kind: input.kind,
          lastError: null,
          preview: input.preview,
          receipt: null,
          state: "PREPARED",
          target: input.target,
          threadId: input.threadId,
          updatedAt: NOW,
          version: 1,
        };
      },
    },
  });

  const { createStudioAssistantToolExecutor } = await import("../lib/server/studio-assistant-tool-service.ts");

  function thread(focus: StudioAssistantFocus | null = null): StudioAssistantThreadDetail {
    const actor = { actorSubject: operator.actorSubject, displayName: operator.displayName, email: operator.email };
    return {
      archivedAt: null,
      createdAt: NOW,
      createdBy: actor,
      focus,
      id: THREAD_ID,
      messages: [],
      pendingTaskCount: 0,
      pendingWork: [],
      state: "OPEN",
      title: "Tool service acceptance",
      updatedAt: NOW,
      updatedBy: actor,
      version: 1,
    };
  }

  function executor(focus: StudioAssistantFocus | null = null, requestMessageId = "request-1") {
    return createStudioAssistantToolExecutor({ operator, requestMessageId, thread: thread(focus) });
  }

  async function execute(
    tool: StudioAssistantToolName,
    input: unknown,
    focus: StudioAssistantFocus | null = null,
    requestMessageId?: string,
  ) {
    return studioAssistantToolOutputSchema.parse(await executor(focus, requestMessageId)(tool, input));
  }

  function latestFocus(entityType: StudioAssistantFocus["entityType"]) {
    return focusUpdates.findLast((update) => update.focus.entityType === entityType)?.focus ?? null;
  }

  beforeEach(() => {
    focusUpdates = [];
    preparedOperations = [];
    previewedCollectionIntents = [];
    operationOrdinal = 0;
  });

  test("every typed read tool returns schema-valid fresh truth and records a bounded focus", async () => {
    const search = await execute("searchStudio", { kinds: ["PIECE"], query: "JUW-026" });
    assert.equal(search.outcome, "OK");
    assert.equal(search.records[0]?.reference, "JUW-026");

    const piece = await execute("getPiece", { reference: "JUW-026" });
    assert.equal(piece.records[0]?.fields.find((field) => field.label === "Private revision")?.value, "Revision 3");
    assert.equal(piece.records[0]?.fields.find((field) => field.label === "Drop")?.value, "Drop 02");
    assert.equal(latestFocus("PIECE")?.lastKnownRevision, DRAFT_REVISION);

    const drop = await execute("getDrop", { reference: "drop-02" });
    assert.equal(drop.records[0]?.label, "Drop 02");
    assert.equal(latestFocus("DROP")?.lastKnownRevision, "4");

    const order = await execute("getOrder", { reference: "ORD-001" });
    assert.equal(order.records[0]?.fields.find((field) => field.label === "Total")?.value, "₦32,099");
    assert.equal(latestFocus("ORDER")?.lastKnownRevision, "6");

    const inventory = await execute("getInventory", { reference: "JUW-026" });
    assert.equal(inventory.records[0]?.fields.find((field) => field.label === "Expected")?.value, "Wardrobe rail");
    assert.equal(latestFocus("INVENTORY")?.lastKnownRevision, "12");

    const media = await execute("getMedia", { pieceReference: "JUW-026" });
    assert.equal(media.records[0]?.fields.find((field) => field.label === "Role")?.value, "GARMENT FRONT");
    assert.equal(latestFocus("MEDIA")?.lastKnownRevision, "2026-09-02T11:30:00.000Z");

    const model = await execute("getModel", { reference: "Lulu V4" });
    assert.equal(model.records[0]?.label, "Lulu");
    assert.equal(model.records[0]?.fields.find((field) => field.label === "Authority")?.value, "lulu-v4");
    assert.equal(latestFocus("MODEL")?.lastKnownRevision, "c".repeat(64));

    for (const result of [search, piece, drop, order, inventory, media, model]) {
      assert.equal(studioAssistantToolOutputSchema.safeParse(result).success, true);
      assert.equal(result.operation, null);
    }
  });

  test("ambiguous garment language returns candidates and persists only unresolved focus", async () => {
    const result = await execute("getPiece", { reference: "violet" });
    assert.equal(result.outcome, "NEEDS_CLARIFICATION");
    assert.equal(result.title, "Which piece?");
    assert.deepEqual(result.records.map((record) => record.reference), ["JUW-026", "JUW-027"]);
    assert.deepEqual(
      latestFocus("PIECE")?.unresolvedCandidates.map((candidate) => candidate.reference),
      ["JUW-026", "JUW-027"],
    );
    assert.equal(preparedOperations.length, 0);
  });

  test("piece edit and publication tools prepare exact reviewed diffs without mutating owning truth", async () => {
    const truthBefore = structuredClone({ authority, projection, workspaces });

    const edit = await execute("preparePieceEdit", {
      changes: {
        description: "A refined deep-violet beaded mini dress.",
        name: "Violet Beaded Evening Mini Dress",
        price: 31_500,
      },
      reference: "JUW-026",
    }, null, "request-edit");
    assert.equal(edit.operation?.state, "PREPARED");
    assert.equal(edit.operation?.kind, "PIECE_EDIT");
    assert.equal(edit.operation?.expectedVersion, 8);
    assert.deepEqual(edit.operation?.preview.changes, [
      { after: "Violet Beaded Evening Mini Dress", before: "Violet Beaded Mini Dress", field: "title", label: "Name" },
      { after: "A refined deep-violet beaded mini dress.", before: publishedFacts.description, field: "description", label: "Description" },
      { after: "₦31,500", before: "₦30,599", field: "price", label: "Price" },
    ]);
    assert.equal(edit.operation?.preview.consequence.includes("current Shop listing remains unchanged"), true);
    assert.deepEqual(preparedOperations[0]?.payload, {
      facts: {
        ...publishedFacts,
        description: "A refined deep-violet beaded mini dress.",
        price: 31_500,
        title: "Violet Beaded Evening Mini Dress",
      },
    });

    const publish = await execute("preparePublishRevision", { reference: "JUW-026" }, null, "request-publish");
    assert.equal(publish.operation?.state, "PREPARED");
    assert.equal(publish.operation?.kind, "PUBLISH_REVISION");
    assert.equal(publish.operation?.expectedRevision, DRAFT_REVISION);
    assert.equal(publish.operation?.preview.risk, "R2");
    assert.equal(publish.operation?.preview.media?.[0]?.sourceRevision, "a".repeat(64));
    assert.deepEqual(preparedOperations[1]?.payload, { facts: publishedFacts });

    assert.deepEqual({ authority, projection, workspaces }, truthBefore);
  });

  test("drop move, archive, and permanent delete tools prepare guarded operations only", async () => {
    const truthBefore = structuredClone({ authority, collectionRead, projection, workspaces });

    const move = await execute("prepareDropMove", {
      destination: "drop-01",
      pieceReference: "JUW-026",
    }, null, "request-move");
    assert.equal(move.operation?.state, "PREPARED");
    assert.equal(move.operation?.kind, "DROP_MOVE");
    assert.equal(move.operation?.expectedRevision, COLLECTION_REVISION);
    assert.equal(move.operation?.expectedVersion, drop01.version);
    assert.deepEqual(move.operation?.preview.changes, [
      { after: "Drop 01", before: "Drop 02", field: "drop", label: "Drop" },
      { after: "Past drop", before: "Current Shop", field: "shop", label: "Shop" },
    ]);
    assert.deepEqual(previewedCollectionIntents, [{
      collectionId: drop01.id,
      command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP",
      expectedVersion: drop01.version,
      sku: "JUW-026",
    }]);

    const archive = await execute("prepareArchive", { reference: "JUW-026" }, null, "request-archive");
    assert.equal(archive.operation?.state, "PREPARED");
    assert.equal(archive.operation?.kind, "ARCHIVE");
    assert.equal(archive.operation?.expectedVersion, 11);
    assert.equal(archive.operation?.preview.destructive, true);
    assert.equal(archive.operation?.preview.confirmationLabel, "Archive piece");

    const deletion = await execute("preparePermanentDelete", { reference: "JUW-099" }, null, "request-delete");
    assert.equal(deletion.operation?.state, "PREPARED");
    assert.equal(deletion.operation?.kind, "PERMANENT_DELETE");
    assert.equal(deletion.operation?.expectedVersion, 5);
    assert.equal(deletion.operation?.preview.risk, "R3");
    assert.equal(deletion.operation?.preview.consequence.includes("irreversibly removed"), true);

    assert.deepEqual({ authority, collectionRead, projection, workspaces }, truthBefore);
    assert.equal(preparedOperations.every((prepared) => prepared.threadId === THREAD_ID), true);
    assert.equal(preparedOperations.every((prepared) => prepared.idempotencyKey.startsWith("ask.")), true);
  });
}
