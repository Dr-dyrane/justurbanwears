import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  createStudioAtelierLockService,
  type StudioAtelierLockedRoomAuthority,
} from "../lib/server/studio-atelier-lock-service";
import {
  STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION,
  compositeStudioAtelierSubject,
} from "../lib/server/studio-atelier-subject-compositor";
import type {
  AtelierArtifactRow,
  AtelierExecutionRow,
  AtelierLifecycleEventRow,
  AtelierOperationProjectionRow,
  AtelierOperationRow,
} from "../lib/server/studio-atelier-repository";
import {
  ATELIER_STAGE_LAYER_POLICIES,
  atelierOperationSchema,
  directGarmentEvidenceReceiptSchema,
  type AtelierLayer,
  type AtelierOperation,
} from "../lib/studio/atelier/contracts";
import { STUDIO_ATELIER_NATIVE_ROOM_COMPOSITE_POLICY } from "../lib/studio/atelier/canvas-policy";
import { StudioEngineError } from "../lib/studio/engine/errors";

const WIDTH = 1024;
const HEIGHT = 1536;
const OPERATOR = "operator-lock-service-test";
const OPERATION_ID = "00000000-0000-4000-8000-000000000301";
const EXECUTION_ID = "00000000-0000-4000-8000-000000000302";
const SUBJECT_ARTIFACT_ID = "00000000-0000-4000-8000-000000000303";
const COMPOSITE_ARTIFACT_ID = "00000000-0000-4000-8000-000000000304";

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function roomFinalOperation(roomSha256: string, legacySameCanvas = false): AtelierOperation {
  const parent = {
    role: "ACCEPTED_SUBJECT_LOCK" as const,
    assetId: "garment/900/subject-lock",
    sha256: digest("subject-lock"),
    garmentId: "900",
    sourceStage: "SUBJECT_B" as const,
    sourceView: "SUBJECT" as const,
    reviewState: "LOCKED" as const,
    lockedLayer: "IDENTITY" as const,
    privacyClass: "PRIVATE_IDENTITY" as const,
  };
  const room = {
    role: "LOCKED_ATELIER_ROOM" as const,
    assetId: "authority/atelier-room-1024x1536",
    sha256: roomSha256,
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "LOCKED_ENVIRONMENT" as const,
    required: true as const,
    permittedScope: ["ATELIER", "BRAND_ICON", "LIGHTING"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  const garment = {
    role: "GARMENT_FRONT_SAFEGUARD" as const,
    assetId: "garment/900/front-safeguard",
    sha256: digest("front-safeguard"),
    garmentId: "900",
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true as const,
    permittedScope: ["GARMENT"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  const immutableSet = ATELIER_STAGE_LAYER_POLICIES.ROOM_FINAL_05.requiredImmutableLayers.map(
    (layer) => {
      const source = layer === "GARMENT"
        ? garment
        : ["ATELIER", "BRAND_ICON", "LIGHTING"].includes(layer)
          ? room
          : parent;
      return { layer, assetId: source.assetId, sha256: source.sha256 };
    },
  );
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "lock-service-test-v1",
    garmentId: "900",
    stage: "ROOM_FINAL_05",
    view: "05",
    parentLocks: [parent],
    authorityStack: [room, garment],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "same-canvas subject placement",
      intendedDelta: "Composite the approved subject over exact locked room bytes.",
    }],
    immutableSet,
    garmentFacts: ["A test garment with locked construction."],
    unknownFacts: ["Unseen construction remains unknown."],
    prohibitedInferences: ["Do not invent unseen construction."],
    sceneSpec: { room: "locked" },
    cameraSpec: { family: "catalogue" },
    poseSpec: { view: "05" },
    stylingSpec: { source: "server-owned" },
    renderQualityContract: {
      photographicRealism: "one coherent catalogue photograph",
      skinTexture: "natural subject texture",
      garmentTexture: "source-supported material response",
      lightingIntegration: "one plausible light field",
      opticsPerspective: "level natural catalogue perspective",
      artifactRejection: ["no cutout halo"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: true,
      renderedText: false,
      labels: false,
      targetView: "05",
      canvas: { width: WIDTH, height: HEIGHT },
      mode: "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE",
      generatedArtifact: {
        kind: "SUBJECT_LAYER",
        format: "PNG",
        alpha: "REQUIRED",
        background: "TRANSPARENT",
      },
      deterministicComposite: {
        method: "APP_OWNED_EXACT_PIXEL_COMPOSITE",
        lockedRoomRole: "LOCKED_ATELIER_ROOM",
        preserveLockedRoomPixels: true,
        outputFormat: "PNG",
        ...(legacySameCanvas ? {} : STUDIO_ATELIER_NATIVE_ROOM_COMPOSITE_POLICY),
      },
      finalFormat: "PNG",
    },
    failureGates: ["room pixel drift"],
    fashionNovaCheck: {
      operationId: "fashion-check-900",
      publisher: "Fashion Nova",
      officialUrl: "https://www.fashionnova.com/collections/mini-dresses",
      resolvedOfficialUrl: "https://www.fashionnova.com/collections/mini-dresses",
      pageTitle: "Mini Dresses",
      accessedOn: "2026-08-26",
      matchedGarmentFacts: ["test dress"],
      decision: "KEEP",
      selectedStylingDirection: "retain accepted styling",
      authority: "ADVISORY_STYLING_ONLY",
      passedAsImageReference: false,
    },
    correctionBudget: 1,
  });
}

function opaqueSubjectOperation(): AtelierOperation {
  const garmentSha256 = digest("opaque-garment");
  const hairSha256 = digest("opaque-hair");
  const garmentParents = [{
    role: "GARMENT_FRONT_LOCK",
    assetId: "garment/900/front",
    sha256: garmentSha256,
    garmentId: "900",
    sourceStage: "GARMENT_01_FRONT",
    sourceView: "01",
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }, {
    role: "GARMENT_BACK_LOCK",
    assetId: "garment/900/back",
    sha256: digest("opaque-garment-back"),
    garmentId: "900",
    sourceStage: "GARMENT_02_BACK",
    sourceView: "02",
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }, {
    role: "MANNEQUIN_FRONT_LOCK",
    assetId: "garment/900/mannequin",
    sha256: digest("opaque-garment-mannequin"),
    garmentId: "900",
    sourceStage: "GARMENT_03_MANNEQUIN",
    sourceView: "03",
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }, {
    role: "FABRIC_DETAIL_LOCK",
    assetId: "garment/900/detail",
    sha256: digest("opaque-garment-detail"),
    garmentId: "900",
    sourceStage: "GARMENT_04_DETAIL",
    sourceView: "04",
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }] as const;
  const authority = (
    role: "REAL_FACE_OPERATION_BOARD" | "BODY_FRONT_CANON" | "REAL_LULU_ANGLE_CONTACT" | "V4_TRANSLATION_LOCK",
    permittedScope: AtelierLayer[],
  ) => ({
    role,
    assetId: `authority/${role.toLowerCase()}`,
    sha256: role === "V4_TRANSLATION_LOCK" ? hairSha256 : digest(role),
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: role === "REAL_FACE_OPERATION_BOARD" || role === "REAL_LULU_ANGLE_CONTACT"
      ? "REAL_DIRECT" as const
      : "APPROVED_CANON" as const,
    required: true as const,
    permittedScope,
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  });
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "lock-service-opaque-test-v1",
    garmentId: "900",
    stage: "SUBJECT_A",
    view: "SUBJECT",
    parentLocks: garmentParents,
    authorityStack: [
      authority("REAL_FACE_OPERATION_BOARD", ["IDENTITY", "BODY"]),
      authority("BODY_FRONT_CANON", ["BODY"]),
      authority("REAL_LULU_ANGLE_CONTACT", ["BODY"]),
      authority("V4_TRANSLATION_LOCK", ["IDENTITY", "HAIR"]),
    ],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "full subject frame",
      intendedDelta: "Create the declared subject candidate.",
    }],
    immutableSet: [...garmentParents.map((parent) => ({
      layer: parent.lockedLayer,
      assetId: parent.assetId,
      sha256: parent.sha256,
    })), {
      layer: "HAIR",
      assetId: "authority/v4_translation_lock",
      sha256: hairSha256,
    }],
    garmentFacts: ["Locked test garment."],
    unknownFacts: ["Unseen construction remains unknown."],
    prohibitedInferences: ["Do not invent unseen construction."],
    sceneSpec: { room: "neutral subject stage" },
    cameraSpec: { family: "catalogue" },
    poseSpec: { view: "SUBJECT" },
    stylingSpec: { source: "server-owned" },
    renderQualityContract: {
      photographicRealism: "one coherent catalogue photograph",
      skinTexture: "natural subject texture",
      garmentTexture: "source-supported material response",
      lightingIntegration: "one plausible light field",
      opticsPerspective: "level natural catalogue perspective",
      artifactRejection: ["no synthetic artifact"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: true,
      renderedText: false,
      labels: false,
      targetView: "SUBJECT",
      canvas: { width: WIDTH, height: HEIGHT },
      mode: "GENERATIVE_FULL_FRAME",
      generatedArtifact: {
        kind: "FULL_FRAME",
        format: "JPEG",
        alpha: "OPAQUE",
        background: "NEUTRAL_STAGE",
      },
      deterministicComposite: null,
      finalFormat: "JPEG",
    },
    failureGates: ["identity drift"],
    correctionBudget: 1,
  });
}

function garmentFrontOperation(): AtelierOperation {
  const directEvidenceSha256 = digest("garment-900-direct-evidence");
  const directGarmentEvidence = directGarmentEvidenceReceiptSchema.parse({
    schemaVersion: "juw.direct-garment-evidence-receipt.v1",
    sourceManifest: {
      revision: "garment-900-source-manifest-v1",
      sha256: digest("garment-900-source-manifest"),
      attestationId: "garment-900-source-manifest-attestation-v1",
      verificationStatus: "VERIFIED",
    },
    recipeVersion: "direct-garment-evidence-pack-v1",
    compilerVersion: "direct-garment-evidence-pack-compiler-v1",
    constituents: ["a", "b", "c"].map((suffix) => ({
      assetId: `garment/900/source-${suffix}`,
      sha256: digest(`garment-900-source-${suffix}`),
      mimeType: "image/jpeg",
      byteSize: 1_000 + suffix.codePointAt(0)!,
      width: 600 + suffix.codePointAt(0)!,
      height: 900 + suffix.codePointAt(0)!,
    })),
    output: {
      assetId: "garment/900/direct-evidence",
      sha256: directEvidenceSha256,
      mimeType: "image/png",
      byteSize: 12_345,
      width: 1536,
      height: 1536,
    },
  });
  const directEvidence = {
    role: "DIRECT_GARMENT_EVIDENCE" as const,
    assetId: "garment/900/direct-evidence",
    sha256: directEvidenceSha256,
    garmentId: "900",
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true as const,
    permittedScope: ["GARMENT"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "lock-service-garment-test-v1",
    garmentId: "900",
    stage: "GARMENT_01_FRONT",
    view: "01",
    parentLocks: [],
    authorityStack: [directEvidence],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "garment presentation",
      intendedDelta: "Present the exact direct garment front.",
    }],
    immutableSet: [{
      layer: "GARMENT",
      assetId: directEvidence.assetId,
      sha256: directEvidence.sha256,
    }],
    garmentFacts: ["Locked test garment front construction."],
    unknownFacts: ["Unseen construction remains unknown."],
    prohibitedInferences: ["Do not invent unseen construction."],
    sceneSpec: { room: "neutral garment stage" },
    cameraSpec: { family: "catalogue", orientation: "front" },
    poseSpec: { view: "01", subject: "garment only" },
    stylingSpec: { source: "none" },
    renderQualityContract: {
      photographicRealism: "one coherent garment photograph",
      skinTexture: "not applicable to garment-only media",
      garmentTexture: "source-supported material response",
      lightingIntegration: "one plausible product light field",
      opticsPerspective: "level natural catalogue perspective",
      artifactRejection: ["no invented construction"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: true,
      renderedText: false,
      labels: false,
      targetView: "01",
      canvas: { width: WIDTH, height: HEIGHT },
      mode: "GENERATIVE_GARMENT_MEDIA",
      generatedArtifact: {
        kind: "GARMENT_VIEW",
        format: "JPEG",
        alpha: "OPAQUE",
        background: "NEUTRAL_PRODUCT_STAGE",
      },
      deterministicComposite: null,
      finalFormat: "JPEG",
    },
    failureGates: ["garment construction drift"],
    correctionBudget: 1,
    directGarmentEvidence,
  });
}

async function exactRoomBytes(height = HEIGHT): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height,
      channels: 3,
      background: { r: 225, g: 214, b: 198 },
    },
  }).png().toBuffer());
}

async function subjectLayerBytes(): Promise<Uint8Array> {
  const subject = await sharp({
    create: {
      width: 260,
      height: 720,
      channels: 4,
      background: { r: 45, g: 35, b: 30, alpha: 1 },
    },
  }).png().toBuffer();
  return new Uint8Array(await sharp({
    create: {
      width: WIDTH,
      height: HEIGHT,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    },
  }).composite([{ input: subject, left: 382, top: 360 }]).png().toBuffer());
}

function operationRow(operation: AtelierOperation): AtelierOperationRow {
  return {
    id: OPERATION_ID,
    semanticHash: digest("semantic-operation"),
    canonicalOperation: operation,
    stage: operation.stage,
  } as unknown as AtelierOperationRow;
}

function executionRow(): AtelierExecutionRow {
  return {
    id: EXECUTION_ID,
    operationId: OPERATION_ID,
    state: "COMPLETE",
  } as unknown as AtelierExecutionRow;
}

function subjectArtifact(bytes: Uint8Array): AtelierArtifactRow {
  return {
    id: SUBJECT_ARTIFACT_ID,
    executionId: EXECUTION_ID,
    ordinal: 0,
    kind: "SUBJECT_LAYER",
    role: "ATELIER_SUBJECT_LAYER",
    state: "STORED",
    blobPathname: "private/subject.png",
    blobUrl: "https://private.example/subject.png",
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    width: WIDTH,
    height: HEIGHT,
    sha256: digest(bytes),
  } as unknown as AtelierArtifactRow;
}

function projection(
  materialized: AtelierArtifactRow,
  state: "SEMANTIC_PASS" | "USER_APPROVED" | "LOCKED" = "USER_APPROVED",
): AtelierOperationProjectionRow {
  return {
    operationId: OPERATION_ID,
    state,
    version: state === "LOCKED" ? 5 : 4,
    materializedExecutionId: EXECUTION_ID,
    materializedArtifactId: materialized.id,
    materializedArtifactSha256: materialized.sha256,
    lockedArtifactId: state === "LOCKED" ? COMPOSITE_ARTIFACT_ID : null,
    lockedArtifactSha256: null,
    correctionAuthorized: false,
  } as unknown as AtelierOperationProjectionRow;
}

function compositeArtifact(input: {
  sha256: string;
  byteSize: number;
  pathname: string;
  blobUrl: string;
  roomSha256: string;
  subjectSha256: string;
  width: number;
  height: number;
  compositionVersion: string;
  canvasPolicyRevision?: string;
  canvasProfile?: unknown;
}): AtelierArtifactRow {
  return {
    id: COMPOSITE_ARTIFACT_ID,
    executionId: EXECUTION_ID,
    ordinal: 0,
    kind: "COMPOSITE",
    role: "ATELIER_FINAL_COMPOSITE",
    state: "STORED",
    blobPathname: input.pathname,
    blobUrl: input.blobUrl,
    mimeType: "image/png",
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
    sha256: input.sha256,
    metadata: {
      sourceArtifactIds: [SUBJECT_ARTIFACT_ID],
      compositionVersion: input.compositionVersion,
      roomAssetId: "authority/atelier-room-1024x1536",
      roomSha256: input.roomSha256,
      authorityRevision: "authority-test-v1",
      subjectSha256: input.subjectSha256,
      ...(input.canvasPolicyRevision
        ? {
            canvasPolicyRevision: input.canvasPolicyRevision,
            canvasProfile: input.canvasProfile,
          }
        : {}),
    },
  } as unknown as AtelierArtifactRow;
}

async function reviewedCompositeFixture(
  roomBytes: Uint8Array,
  subjectBytes: Uint8Array,
  legacySameCanvas = false,
): Promise<{ subject: AtelierArtifactRow; composite: AtelierArtifactRow; compositeBytes: Uint8Array }> {
  const subject = subjectArtifact(subjectBytes);
  const composed = await compositeStudioAtelierSubject({
    room: { bytes: roomBytes, mimeType: "image/png", sha256: digest(roomBytes) },
    subject: { bytes: subjectBytes, mimeType: "image/png", sha256: subject.sha256 },
  });
  const composite = compositeArtifact({
    sha256: composed.sha256,
    byteSize: composed.bytes.byteLength,
    pathname: `private/composite/${composed.sha256}.png`,
    blobUrl: `https://private.example/composite/${composed.sha256}.png`,
    roomSha256: digest(roomBytes),
    subjectSha256: subject.sha256,
    width: composed.width,
    height: composed.height,
    compositionVersion: legacySameCanvas
      ? STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION
      : composed.compositeRevision,
    ...(legacySameCanvas
      ? {}
      : {
          canvasPolicyRevision: composed.canvasPolicyRevision,
          canvasProfile: composed.canvasProfile,
        }),
  });
  return { subject, composite, compositeBytes: composed.bytes };
}

function lifecycleEvent(): AtelierLifecycleEventRow {
  return { id: "event-lock" } as unknown as AtelierLifecycleEventRow;
}

async function expectStudioError(
  action: () => Promise<unknown>,
  code: StudioEngineError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) =>
    error instanceof StudioEngineError && error.code === code
  );
}

test("route-forged approval and room data cannot bypass the USER_APPROVED projection", async () => {
  const roomBytes = await exactRoomBytes();
  const subjectBytes = await subjectLayerBytes();
  const { subject, composite, compositeBytes } = await reviewedCompositeFixture(
    roomBytes,
    subjectBytes,
  );
  let roomResolutions = 0;
  let artifactReads = 0;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async () => {
      roomResolutions += 1;
      throw new Error("must not resolve");
    },
    overrides: {
      getOperation: async () => operationRow(roomFinalOperation(digest(roomBytes))),
      getProjection: async () => projection(composite, "SEMANTIC_PASS"),
      getExecution: async () => executionRow(),
      listArtifacts: async () => [subject, composite],
      readArtifact: async () => {
        artifactReads += 1;
        return compositeBytes;
      },
    },
  });

  await expectStudioError(
    () => service({
      operatorSubject: OPERATOR,
      operationId: OPERATION_ID,
      approval: { state: "APPROVED", artifactSha256: subject.sha256 },
      room: { bytes: roomBytes, sha256: digest(roomBytes) },
    } as unknown as { operatorSubject: string; operationId: string }),
    "INVALID_TRANSITION",
  );
  assert.equal(roomResolutions, 0);
  assert.equal(artifactReads, 0);
});

test("transparent lock enforces the operation's exact room ID, hash, bytes and canvas", async () => {
  const roomBytes = await exactRoomBytes();
  const subjectBytes = await subjectLayerBytes();
  const { subject, composite, compositeBytes } = await reviewedCompositeFixture(
    roomBytes,
    subjectBytes,
  );
  const expectedRoomHash = digest(roomBytes);
  let expectedSeen: { assetId: string; sha256: string } | null = null;
  let writes = 0;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async ({ expected }) => {
      expectedSeen = expected;
      return {
        assetId: "authority/caller-forged-room",
        sha256: expectedRoomHash,
        bytes: roomBytes,
        mimeType: "image/png",
        width: WIDTH,
        height: HEIGHT,
        manifestRevision: "authority-test-v1",
        manifestHash: digest("authority-manifest"),
      };
    },
    overrides: {
      getOperation: async () => operationRow(roomFinalOperation(expectedRoomHash)),
      getProjection: async () => projection(composite),
      getExecution: async () => executionRow(),
      listArtifacts: async () => [subject, composite],
      readArtifact: async (artifact) => artifact.id === subject.id
        ? subjectBytes
        : compositeBytes,
      recordLifecycleEvent: async () => {
        writes += 1;
        throw new Error("must not write");
      },
    },
  });

  await expectStudioError(
    () => service({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    "INVALID_ASSET",
  );
  assert.deepEqual(expectedSeen, {
    assetId: "authority/atelier-room-1024x1536",
    sha256: expectedRoomHash,
  });
  assert.equal(writes, 0);
});

test("transparent lock promotes the exact reviewed COMPOSITE without writing new bytes", async () => {
  const roomBytes = await exactRoomBytes(1280);
  const subjectBytes = await subjectLayerBytes();
  const { subject, composite, compositeBytes } = await reviewedCompositeFixture(
    roomBytes,
    subjectBytes,
  );
  const roomHash = digest(roomBytes);
  const operation = roomFinalOperation(roomHash);
  const initial = projection(composite);
  const trace: string[] = [];
  let lockedProjection: AtelierOperationProjectionRow | null = null;
  let lifecycleArtifactId: string | null | undefined;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async ({ expected }) => {
      trace.push("resolve-room");
      assert.deepEqual(expected, {
        assetId: "authority/atelier-room-1024x1536",
        sha256: roomHash,
      });
      return {
        assetId: expected.assetId,
        sha256: expected.sha256,
        bytes: roomBytes,
        mimeType: "image/png",
        width: WIDTH,
        height: 1280,
        manifestRevision: "authority-test-v1",
        manifestHash: digest("authority-manifest"),
      } satisfies StudioAtelierLockedRoomAuthority;
    },
    overrides: {
      getOperation: async () => operationRow(operation),
      getProjection: async () => lockedProjection ?? initial,
      getExecution: async () => executionRow(),
      listArtifacts: async () => [subject, composite],
      readArtifact: async (artifact) => {
        trace.push(artifact.id === subject.id ? "read-subject" : "read-reviewed-composite");
        return artifact.id === subject.id ? subjectBytes : compositeBytes;
      },
      recordLifecycleEvent: async (input) => {
        trace.push("record-locked");
        assert.equal(input.eventType, "LOCKED");
        assert.equal(input.expectedVersion, initial.version);
        assert.equal(input.executionId, EXECUTION_ID);
        assert.equal(input.artifactId, COMPOSITE_ARTIFACT_ID);
        assert.equal(input.evidence?.roomPixelsGenerated, 0);
        assert.equal(
          (input.evidence?.canvasProfile as Record<string, unknown>).profileId,
          "atelier-room-native-4x5-center-window-v1",
        );
        lifecycleArtifactId = input.artifactId;
        const compositeSha = input.evidence?.compositeArtifactSha256;
        assert.equal(typeof compositeSha, "string");
        lockedProjection = {
          ...initial,
          state: "LOCKED",
          version: initial.version + 1,
          lockedArtifactId: COMPOSITE_ARTIFACT_ID,
          lockedArtifactSha256: compositeSha as string,
        } as AtelierOperationProjectionRow;
        return { projection: lockedProjection, event: lifecycleEvent() };
      },
    },
  });

  const result = await service({ operatorSubject: OPERATOR, operationId: OPERATION_ID });
  assert.equal(result.state, "LOCKED");
  assert.equal(lifecycleArtifactId, COMPOSITE_ARTIFACT_ID);
  assert.deepEqual(trace, [
    "resolve-room",
    "read-subject",
    "read-reviewed-composite",
    "record-locked",
  ]);
});

test("legacy exact-canvas composites remain lockable only through their recorded v1 revision", async () => {
  const roomBytes = await exactRoomBytes();
  const subjectBytes = await subjectLayerBytes();
  const { subject, composite, compositeBytes } = await reviewedCompositeFixture(
    roomBytes,
    subjectBytes,
    true,
  );
  const roomHash = digest(roomBytes);
  const operation = roomFinalOperation(roomHash, true);
  const initial = projection(composite);
  let recordedEvidence: Record<string, unknown> | null = null;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async ({ expected }) => ({
      assetId: expected.assetId,
      sha256: expected.sha256,
      bytes: roomBytes,
      mimeType: "image/png",
      width: WIDTH,
      height: HEIGHT,
      manifestRevision: "authority-test-v1",
      manifestHash: digest("authority-manifest"),
    }),
    overrides: {
      getOperation: async () => operationRow(operation),
      getProjection: async () => initial,
      getExecution: async () => executionRow(),
      listArtifacts: async () => [subject, composite],
      readArtifact: async (artifact) => artifact.id === subject.id
        ? subjectBytes
        : compositeBytes,
      recordLifecycleEvent: async (input) => {
        recordedEvidence = input.evidence ?? null;
        return {
          projection: {
            ...initial,
            state: "LOCKED",
            version: initial.version + 1,
            lockedArtifactId: composite.id,
            lockedArtifactSha256: composite.sha256,
          } as AtelierOperationProjectionRow,
          event: lifecycleEvent(),
        };
      },
    },
  });

  const result = await service({ operatorSubject: OPERATOR, operationId: OPERATION_ID });

  assert.equal(result.state, "LOCKED");
  assert.equal(
    recordedEvidence?.compositeRevision,
    STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION,
  );
  assert.equal(recordedEvidence?.canvasPolicyRevision, null);
  assert.equal(recordedEvidence?.canvasProfile, null);
});

test("transparent lock rejects a reviewed composite that differs from exact recomposition", async () => {
  const roomBytes = await exactRoomBytes();
  const subjectBytes = await subjectLayerBytes();
  const { subject, composite, compositeBytes } = await reviewedCompositeFixture(
    roomBytes,
    subjectBytes,
  );
  const tamperedBytes = Uint8Array.from(compositeBytes);
  tamperedBytes[tamperedBytes.length - 1] ^= 1;
  const tampered = {
    ...composite,
    sha256: digest(tamperedBytes),
    byteSize: tamperedBytes.byteLength,
  } as AtelierArtifactRow;
  let lifecycleWrites = 0;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async ({ expected }) => ({
      assetId: expected.assetId,
      sha256: expected.sha256,
      bytes: roomBytes,
      mimeType: "image/png",
      width: WIDTH,
      height: HEIGHT,
      manifestRevision: "authority-test-v1",
      manifestHash: digest("authority-manifest"),
    }),
    overrides: {
      getOperation: async () => operationRow(roomFinalOperation(digest(roomBytes))),
      getProjection: async () => projection(tampered),
      getExecution: async () => executionRow(),
      listArtifacts: async () => [subject, tampered],
      readArtifact: async (artifact) => artifact.id === subject.id
        ? subjectBytes
        : tamperedBytes,
      recordLifecycleEvent: async () => {
        lifecycleWrites += 1;
        throw new Error("must not lock");
      },
    },
  });

  await expectStudioError(
    () => service({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    "INVALID_ASSET",
  );
  assert.equal(lifecycleWrites, 0);
});

test("concurrent and repeated transparent locks converge on one immutable projection", async () => {
  const roomBytes = await exactRoomBytes();
  const subjectBytes = await subjectLayerBytes();
  const { subject, composite, compositeBytes } = await reviewedCompositeFixture(
    roomBytes,
    subjectBytes,
  );
  const roomHash = digest(roomBytes);
  const initial = projection(composite);
  let current = initial;
  let lifecycleWrites = 0;
  let roomResolutions = 0;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async ({ expected }) => {
      roomResolutions += 1;
      return {
        assetId: expected.assetId,
        sha256: expected.sha256,
        bytes: roomBytes,
        mimeType: "image/png",
        width: WIDTH,
        height: HEIGHT,
        manifestRevision: "authority-test-v1",
        manifestHash: digest("authority-manifest"),
      };
    },
    overrides: {
      getOperation: async () => operationRow(roomFinalOperation(roomHash)),
      getProjection: async () => current,
      getExecution: async () => executionRow(),
      listArtifacts: async () => [subject, composite],
      readArtifact: async (artifact) => artifact.id === subject.id
        ? subjectBytes
        : compositeBytes,
      recordLifecycleEvent: async (input) => {
        if (current.state !== "USER_APPROVED" || input.expectedVersion !== current.version) {
          throw new Error("projection CAS lost");
        }
        lifecycleWrites += 1;
        current = {
          ...current,
          state: "LOCKED",
          version: current.version + 1,
          lockedArtifactId: composite.id,
          lockedArtifactSha256: composite.sha256,
        } as AtelierOperationProjectionRow;
        await Promise.resolve();
        return { projection: current, event: lifecycleEvent() };
      },
    },
  });

  const [first, second] = await Promise.all([
    service({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    service({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
  ]);
  assert.equal(first.state, "LOCKED");
  assert.equal(second.state, "LOCKED");
  assert.equal(first.lockedArtifactSha256, second.lockedArtifactSha256);
  assert.equal(lifecycleWrites, 1);

  const resolutionsBeforeRepeat = roomResolutions;
  const repeated = await service({ operatorSubject: OPERATOR, operationId: OPERATION_ID });
  assert.equal(repeated.state, "LOCKED");
  assert.equal(roomResolutions, resolutionsBeforeRepeat);
  assert.equal(lifecycleWrites, 1);
});

test("garment 01 locks exact normalized bytes as a GARMENT parent with its canonical stage and view", async () => {
  const operation = garmentFrontOperation();
  const reviewedBytes = Uint8Array.from([10, 20, 30, 40]);
  const normalized = {
    id: COMPOSITE_ARTIFACT_ID,
    executionId: EXECUTION_ID,
    ordinal: 0,
    kind: "NORMALIZED",
    role: "ATELIER_NORMALIZED_OUTPUT",
    state: "STORED",
    blobPathname: "private/garment-01-normalized.jpg",
    blobUrl: "https://private.example/garment-01-normalized.jpg",
    mimeType: "image/jpeg",
    byteSize: reviewedBytes.byteLength,
    width: WIDTH,
    height: HEIGHT,
    sha256: digest(reviewedBytes),
    metadata: {},
  } as unknown as AtelierArtifactRow;
  const initial = projection(normalized);
  let roomResolutions = 0;
  let lockWrites = 0;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async () => {
      roomResolutions += 1;
      throw new Error("garment media must not resolve a room");
    },
    overrides: {
      getOperation: async () => {
        assert.equal(operation.stage, "GARMENT_01_FRONT");
        assert.equal(operation.view, "01");
        return operationRow(operation);
      },
      getProjection: async () => initial,
      getExecution: async () => executionRow(),
      listArtifacts: async () => [normalized],
      readArtifact: async () => reviewedBytes,
      recordLifecycleEvent: async (input) => {
        lockWrites += 1;
        assert.equal(input.eventType, "LOCKED");
        assert.equal(input.artifactId, normalized.id);
        assert.equal(input.lockedAssetId, `atelier.lock/${digest("semantic-operation")}`);
        assert.deepEqual(input.lockedParentDescriptor, {
          lockedLayer: "GARMENT",
          privacyClass: "PRIVATE_OPERATOR",
        });
        return {
          projection: {
            ...initial,
            state: "LOCKED",
            version: initial.version + 1,
            lockedArtifactId: normalized.id,
            lockedAssetId: input.lockedAssetId,
            lockedArtifactSha256: normalized.sha256,
            lockedParentDescriptor: input.lockedParentDescriptor,
          } as AtelierOperationProjectionRow,
          event: lifecycleEvent(),
        };
      },
    },
  });

  const locked = await service({ operatorSubject: OPERATOR, operationId: OPERATION_ID });
  assert.equal(locked.state, "LOCKED");
  assert.equal(locked.lockedParentDescriptor?.lockedLayer, "GARMENT");
  assert.equal(roomResolutions, 0);
  assert.equal(lockWrites, 1);
});

test("opaque lock rereads and rejects tampered NORMALIZED bytes before LOCKED", async () => {
  const reviewedBytes = Uint8Array.from([1, 2, 3, 4]);
  const tamperedBytes = Uint8Array.from([1, 2, 3, 5]);
  const normalized = {
    id: COMPOSITE_ARTIFACT_ID,
    executionId: EXECUTION_ID,
    ordinal: 0,
    kind: "NORMALIZED",
    role: "ATELIER_CANDIDATE",
    state: "STORED",
    blobPathname: "private/normalized.jpg",
    blobUrl: "https://private.example/normalized.jpg",
    mimeType: "image/jpeg",
    byteSize: reviewedBytes.byteLength,
    width: WIDTH,
    height: HEIGHT,
    sha256: digest(reviewedBytes),
    metadata: {},
  } as unknown as AtelierArtifactRow;
  let roomResolutions = 0;
  let lifecycleWrites = 0;
  const service = createStudioAtelierLockService({
    resolveLockedRoom: async () => {
      roomResolutions += 1;
      throw new Error("opaque lock must not resolve a room");
    },
    overrides: {
      getOperation: async () => operationRow(opaqueSubjectOperation()),
      getProjection: async () => projection(normalized),
      getExecution: async () => executionRow(),
      listArtifacts: async () => [normalized],
      readArtifact: async () => tamperedBytes,
      recordLifecycleEvent: async () => {
        lifecycleWrites += 1;
        throw new Error("must not lock");
      },
    },
  });

  await expectStudioError(
    () => service({ operatorSubject: OPERATOR, operationId: OPERATION_ID }),
    "INVALID_ASSET",
  );
  assert.equal(roomResolutions, 0);
  assert.equal(lifecycleWrites, 0);
});
