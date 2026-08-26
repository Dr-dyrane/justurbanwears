import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  STUDIO_GPT_IMAGE_2_MODEL,
  studioGptImage2Capabilities,
} from "../lib/ai/studio-gpt-image-2-gateway";
import { studioGptImage2TransparentSubjectCapabilities } from "../lib/ai/studio-gpt-image-2-subject-layer";
import { StudioGatewayError } from "../lib/ai/studio-gateway";
import {
  createStudioAtelierExecutionService,
  deriveStudioAtelierConsentReceiptHash,
  type StudioAtelierExecutionContext,
} from "../lib/server/studio-atelier-execution-service";
import {
  STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
} from "../lib/server/studio-atelier-g004-provider-visual-denial";
import {
  createStudioAtelierDirectGarmentEvidencePack,
  type StudioAtelierDirectGarmentEvidenceSource,
} from "../lib/server/studio-atelier-direct-garment-evidence-pack";
import {
  deriveOperationId,
  semanticOperationHash,
} from "../lib/studio/atelier/canonical";
import {
  atelierOperationSchema,
  type AtelierOperation,
} from "../lib/studio/atelier/contracts";
import { STUDIO_ATELIER_G004_CALIBRATION_MANIFEST } from "../lib/studio/atelier/g004-calibration";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATION_ROW_ID = "00000000-0000-4000-8000-000000000024";
const EXECUTION_ID = "00000000-0000-4000-8000-000000000025";
const GARMENT_BYTES = new Uint8Array(Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
));
const FACE_BYTES = new Uint8Array([9, 10, 11, 12]);
const PACK_BYTES = new Uint8Array([13, 14, 15, 16]);
const V4_TRANSLATION_BYTES = new Uint8Array([17, 18, 19, 20]);
const BODY_FRONT_BYTES = new Uint8Array([21, 22, 23, 24]);
const ANGLE_CONTACT_BYTES = new Uint8Array([25, 26, 27, 28]);
const ROOM_BYTES = new Uint8Array([29, 30, 31, 32]);
const SUBJECT_LOCK_BYTES = new Uint8Array([33, 34, 35, 36]);
const SUBJECT_A_DONOR_BYTES = new Uint8Array([37, 38, 39, 40]);

const DIRECT_GARMENT_SOURCE_MANIFEST = Object.freeze({
  revision: "garment-024-source-manifest-v1",
  sha256: digest("garment-024-source-manifest-v1"),
  attestationId: "garment-024-source-manifest-attestation-v1",
  verificationStatus: "VERIFIED" as const,
});

const DIRECT_GARMENT_SOURCES = Object.freeze(["a", "b", "c"].map((suffix) =>
  Object.freeze({
    constituent: Object.freeze({
      assetId: `garment/024/source-${suffix}`,
      sha256: digest(GARMENT_BYTES),
      mimeType: "image/png" as const,
      byteSize: GARMENT_BYTES.byteLength,
      width: 1,
      height: 1,
    }),
    bytes: GARMENT_BYTES,
  }) satisfies StudioAtelierDirectGarmentEvidenceSource
));

let directGarmentPackPromise: ReturnType<
  typeof createStudioAtelierDirectGarmentEvidencePack
> | undefined;

function directGarmentPackFixture() {
  directGarmentPackPromise ??= createStudioAtelierDirectGarmentEvidencePack({
    sourceManifest: DIRECT_GARMENT_SOURCE_MANIFEST,
    sources: DIRECT_GARMENT_SOURCES,
  });
  return directGarmentPackPromise;
}

const GARMENT_STAGE_CASES = Object.freeze([
  Object.freeze({
    stage: "GARMENT_01_FRONT" as const,
    view: "01" as const,
    artifactKind: "GARMENT_VIEW" as const,
    fullBody: true,
  }),
  Object.freeze({
    stage: "GARMENT_02_BACK" as const,
    view: "02" as const,
    artifactKind: "GARMENT_VIEW" as const,
    fullBody: true,
  }),
  Object.freeze({
    stage: "GARMENT_03_MANNEQUIN" as const,
    view: "03" as const,
    artifactKind: "MANNEQUIN_VIEW" as const,
    fullBody: true,
  }),
  Object.freeze({
    stage: "GARMENT_04_DETAIL" as const,
    view: "04" as const,
    artifactKind: "DETAIL_VIEW" as const,
    fullBody: false,
  }),
]);

type GarmentStageCase = (typeof GARMENT_STAGE_CASES)[number];

function digest(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

function subjectAOperation(): AtelierOperation {
  const garmentParents = [{
    role: "GARMENT_FRONT_LOCK" as const,
    sourceStage: "GARMENT_01_FRONT" as const,
    sourceView: "01" as const,
  }, {
    role: "GARMENT_BACK_LOCK" as const,
    sourceStage: "GARMENT_02_BACK" as const,
    sourceView: "02" as const,
  }, {
    role: "MANNEQUIN_FRONT_LOCK" as const,
    sourceStage: "GARMENT_03_MANNEQUIN" as const,
    sourceView: "03" as const,
  }, {
    role: "FABRIC_DETAIL_LOCK" as const,
    sourceStage: "GARMENT_04_DETAIL" as const,
    sourceView: "04" as const,
  }].map((parent) => ({
    ...parent,
    assetId: `garment/024/${parent.sourceView}`,
    sha256: digest(GARMENT_BYTES),
    garmentId: "024",
    reviewState: "LOCKED" as const,
    lockedLayer: "GARMENT" as const,
    privacyClass: "PRIVATE_OPERATOR" as const,
  }));
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "2026-08-26.90",
    garmentId: "024",
    stage: "SUBJECT_A",
    view: "SUBJECT",
    parentLocks: garmentParents,
    authorityStack: [{
      role: "REAL_FACE_OPERATION_BOARD",
      assetId: "lulu.face.operation-board.full.v1",
      sha256: digest(FACE_BYTES),
      garmentId: null,
      sourceStage: null,
      reviewState: "LOCKED",
      provenanceClass: "REAL_DIRECT",
      required: true,
      permittedScope: ["IDENTITY", "BODY"],
      dominance: 100,
      privacyClass: "PRIVATE_IDENTITY",
    }, {
      role: "BODY_FRONT_CANON",
      assetId: "lulu.body.canon.v4.front",
      sha256: digest(BODY_FRONT_BYTES),
      garmentId: null,
      sourceStage: null,
      reviewState: "LOCKED",
      provenanceClass: "APPROVED_CANON",
      required: true,
      permittedScope: ["IDENTITY", "BODY"],
      dominance: 100,
      privacyClass: "PRIVATE_IDENTITY",
    }, {
      role: "REAL_LULU_ANGLE_CONTACT",
      assetId: "lulu.body.real.angle-contact.v4",
      sha256: digest(ANGLE_CONTACT_BYTES),
      garmentId: null,
      sourceStage: null,
      reviewState: "LOCKED",
      provenanceClass: "REAL_DIRECT",
      required: true,
      permittedScope: ["IDENTITY", "BODY"],
      dominance: 100,
      privacyClass: "PRIVATE_IDENTITY",
    }, {
      role: "V4_TRANSLATION_LOCK",
      assetId: "lulu.face.v4.front.lock.v1",
      sha256: digest(V4_TRANSLATION_BYTES),
      garmentId: null,
      sourceStage: null,
      reviewState: "LOCKED",
      provenanceClass: "APPROVED_CANON",
      required: true,
      permittedScope: ["IDENTITY", "BODY", "HAIR"],
      dominance: 100,
      privacyClass: "PRIVATE_IDENTITY",
    }],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "declared whole-frame subject stage",
      intendedDelta: "Create the first subject candidate without reopening garment construction.",
    }],
    immutableSet: [...garmentParents.map((parent) => ({
      layer: "GARMENT" as const,
      assetId: parent.assetId,
      sha256: parent.sha256,
    })), {
      layer: "HAIR",
      assetId: "lulu.face.v4.front.lock.v1",
      sha256: digest(V4_TRANSLATION_BYTES),
    }],
    garmentFacts: ["black asymmetric sculpted-shoulder mini dress"],
    unknownFacts: ["unseen rear fastening"],
    prohibitedInferences: ["do not invent rear ornament"],
    sceneSpec: { room: "locked-light-atelier" },
    cameraSpec: { family: "natural-catalogue" },
    poseSpec: { view: "05" },
    stylingSpec: { source: "fashion-nova-advisory-check" },
    renderQualityContract: {
      photographicRealism: "one coherent natural catalogue photograph",
      skinTexture: "natural pores and restrained tonal variation",
      garmentTexture: "source-supported folds and material response only",
      lightingIntegration: "one shared plausible light field",
      opticsPerspective: "level natural perspective with preserved stature",
      artifactRejection: ["no cutout halo", "no synthetic HDR"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: true,
      renderedText: false,
      labels: false,
      targetView: "SUBJECT",
      canvas: { width: 1024, height: 1536 },
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
    failureGates: ["identity drift", "garment redesign", "wrong room"],
    correctionBudget: 1,
  });
}

async function garmentOperation(stageCase: GarmentStageCase): Promise<AtelierOperation> {
  const directPack = await directGarmentPackFixture();
  const authority = {
    role: "DIRECT_GARMENT_EVIDENCE" as const,
    assetId: directPack.receipt.output.assetId,
    sha256: directPack.receipt.output.sha256,
    garmentId: "024",
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true as const,
    permittedScope: ["GARMENT"] as const,
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "2026-08-26.91",
    garmentId: "024",
    stage: stageCase.stage,
    view: stageCase.view,
    parentLocks: [],
    authorityStack: [authority],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "neutral product frame",
      intendedDelta: `Create one clean source-faithful garment ${stageCase.view} view.`,
    }],
    immutableSet: [{
      layer: "GARMENT",
      assetId: authority.assetId,
      sha256: authority.sha256,
    }],
    garmentFacts: ["black asymmetric sculpted-shoulder mini dress"],
    unknownFacts: ["unseen rear fastening"],
    prohibitedInferences: ["do not invent hidden construction"],
    sceneSpec: { room: "neutral-product-stage" },
    cameraSpec: { family: "garment-catalogue-front" },
    poseSpec: { view: stageCase.view },
    stylingSpec: { source: "none" },
    renderQualityContract: {
      photographicRealism: "one coherent natural product photograph",
      skinTexture: "not applicable to a garment-only view",
      garmentTexture: "source-supported material response only",
      lightingIntegration: "one plausible neutral light field",
      opticsPerspective: "level product perspective",
      artifactRejection: ["no source-room reconstruction"],
    },
    outputContract: {
      imageCount: 1,
      layout: "SINGLE_CLEAN_FULL_IMAGE",
      fullBody: stageCase.fullBody,
      renderedText: false,
      labels: false,
      targetView: stageCase.view,
      canvas: { width: 1024, height: 1536 },
      mode: "GENERATIVE_GARMENT_MEDIA",
      generatedArtifact: {
        kind: stageCase.artifactKind,
        format: "JPEG",
        alpha: "OPAQUE",
        background: "NEUTRAL_PRODUCT_STAGE",
      },
      deterministicComposite: null,
      finalFormat: "JPEG",
    },
    failureGates: ["garment construction drift", "source-room reconstruction"],
    rearInference: stageCase.stage === "GARMENT_02_BACK" ? {
      inferred: true,
      basis: "NO_DIRECT_GARMENT_BACK",
      mayBecomeDirectEvidence: false,
    } : undefined,
    correctionBudget: 1,
    directGarmentEvidence: directPack.receipt,
  });
}

function subjectBOperation(): AtelierOperation {
  const subjectA = subjectAOperation();
  const donor = {
    role: "SUBJECT_A_TRANSLATION_DONOR" as const,
    assetId: "garment/024/subject-a-private-pass",
    sha256: digest(SUBJECT_A_DONOR_BYTES),
    garmentId: "024",
    sourceStage: "SUBJECT_A" as const,
    reviewState: "GATE_PASS_PRIVATE" as const,
    provenanceClass: "ACCEPTED_GENERATED" as const,
    required: true,
    permittedScope: ["IDENTITY", "BODY", "HAIR"] as const,
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  };
  return atelierOperationSchema.parse({
    ...subjectA,
    stage: "SUBJECT_B",
    authorityStack: [
      donor,
      subjectA.authorityStack.find((item) => item.role === "REAL_FACE_OPERATION_BOARD"),
      subjectA.authorityStack.find((item) => item.role === "BODY_FRONT_CANON"),
      subjectA.authorityStack.find((item) => item.role === "REAL_LULU_ANGLE_CONTACT"),
    ],
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "declared whole-frame subject refinement",
      intendedDelta: "Refine the private Subject A translation without reopening garment truth.",
    }],
    immutableSet: [
      ...subjectA.parentLocks.map((parent) => ({
        layer: parent.lockedLayer,
        assetId: parent.assetId,
        sha256: parent.sha256,
      })),
      {
        layer: "HAIR",
        assetId: donor.assetId,
        sha256: donor.sha256,
      },
    ],
  });
}

function roomFinalOperation(roomBytes: Uint8Array = ROOM_BYTES): AtelierOperation {
  const parent = {
    role: "ACCEPTED_SUBJECT_LOCK" as const,
    assetId: "garment/024/subject-lock",
    sha256: digest(SUBJECT_LOCK_BYTES),
    garmentId: "024",
    sourceStage: "SUBJECT_B" as const,
    sourceView: "SUBJECT" as const,
    reviewState: "LOCKED" as const,
    lockedLayer: "IDENTITY" as const,
    privacyClass: "PRIVATE_IDENTITY" as const,
  };
  const room = {
    role: "LOCKED_ATELIER_ROOM" as const,
    assetId: "juw.atelier.empty-plate.v1",
    sha256: digest(roomBytes),
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "LOCKED_ENVIRONMENT" as const,
    required: true,
    permittedScope: ["ATELIER", "BRAND_ICON", "LIGHTING"] as const,
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  const garment = {
    role: "GARMENT_FRONT_SAFEGUARD" as const,
    assetId: "garment/024/01",
    sha256: digest(GARMENT_BYTES),
    garmentId: "024",
    sourceStage: "GARMENT_01",
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true,
    permittedScope: ["GARMENT"] as const,
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  };
  const sourceFor = (layer: string) => layer === "GARMENT"
    ? garment
    : ["ATELIER", "BRAND_ICON", "LIGHTING"].includes(layer) ? room : parent;
  return atelierOperationSchema.parse({
    ...subjectAOperation(),
    stage: "ROOM_FINAL_05",
    view: "05",
    parentLocks: [parent],
    authorityStack: [room, garment],
    changeSet: [{ mutableLayer: "COMPOSITION", region: "whole frame", intendedDelta: "Place the accepted subject without repainting the room." }],
    immutableSet: ["IDENTITY", "BODY", "GARMENT", "HAIR", "POSE", "HANDS", "ATELIER", "BRAND_ICON", "CAMERA", "LIGHTING", "OUTPUT_GEOMETRY"].map((layer) => {
      const source = sourceFor(layer);
      return { layer, assetId: source.assetId, sha256: source.sha256 };
    }),
    poseSpec: { view: "05" },
    outputContract: {
      imageCount: 1, layout: "SINGLE_CLEAN_FULL_IMAGE", fullBody: true,
      renderedText: false, labels: false, targetView: "05",
      canvas: { width: 1024, height: 1536 },
      mode: "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE",
      generatedArtifact: { kind: "SUBJECT_LAYER", format: "PNG", alpha: "REQUIRED", background: "TRANSPARENT" },
      deterministicComposite: { method: "APP_OWNED_EXACT_PIXEL_COMPOSITE", lockedRoomRole: "LOCKED_ATELIER_ROOM", preserveLockedRoomPixels: true, outputFormat: "PNG" },
      finalFormat: "PNG",
    },
    fashionNovaCheck: {
      operationId: "g024-fashion-nova-check-v001", publisher: "Fashion Nova",
      officialUrl: "https://www.fashionnova.com/collections/mini-dresses",
      resolvedOfficialUrl: "https://www.fashionnova.com/collections/mini-dresses",
      pageTitle: "Mini Dresses", accessedOn: "2026-08-25",
      matchedGarmentFacts: ["black asymmetric mini dress"], decision: "KEEP",
      selectedStylingDirection: "retain styling", authority: "ADVISORY_STYLING_ONLY",
      passedAsImageReference: false,
    },
  });
}

function resolvedRoomPack(roomHeight = 1536, roomBytes: Uint8Array = ROOM_BYTES) {
  return Object.freeze({
    authorityId: "lulu-v4" as const, revision: "LULU_V4_2026-08-25.6",
    kind: "ROOM_FINAL_05" as const, view: "05" as const,
    privacy: "PRIVATE_PRODUCTION_ONLY" as const, publishable: false as const,
    status: "STATIC_AUTHORITIES_VERIFIED" as const,
    dynamicReferenceSlots: Object.freeze(["ACCEPTED_SUBJECT_LOCK" as const, "GARMENT_FRONT_LOCK" as const]),
    staticReferences: Object.freeze([Object.freeze({
      id: "juw.atelier.empty-plate.v1", role: "LOCKED_ATELIER_ROOM",
      authority: "atelier" as const, sourceKind: "ASSET" as const,
      bytes: roomBytes, mimeType: "image/png" as const, sha256: digest(roomBytes),
      width: 1024, height: roomHeight, packedComponents: Object.freeze([]),
    })]),
    staticPhysicalReferenceCount: 1, physicalReferenceCount: 3,
    maxPhysicalReferences: 4, verifiedSourceAssetCount: 1,
  });
}

function resolvedSubjectPack() {
  return Object.freeze({
    authorityId: "lulu-v4" as const,
    revision: "LULU_V4_2026-08-25.5",
    kind: "SUBJECT_A" as const,
    view: "SUBJECT" as const,
    privacy: "PRIVATE_PRODUCTION_ONLY" as const,
    publishable: false as const,
    status: "STATIC_AUTHORITIES_VERIFIED" as const,
    dynamicReferenceSlots: Object.freeze([
      "GARMENT_FRONT_LOCK" as const,
    ]),
    staticReferences: Object.freeze([
      Object.freeze({
        id: "lulu.face.operation-board.full.v1",
        role: "REAL_FACE_OPERATION_BOARD",
        authority: "face" as const,
        sourceKind: "ASSET" as const,
        bytes: FACE_BYTES,
        mimeType: "image/png" as const,
        sha256: digest(FACE_BYTES),
        width: 1,
        height: 1,
        packedComponents: Object.freeze([]),
      }),
      Object.freeze({
        id: "lulu.pack.subject-a.front-authority.v1",
        role: "SUBJECT_A_TRANSLATION_FACE_BOARD",
        authority: "body" as const,
        sourceKind: "COMPOSITE_BOARD" as const,
        bytes: PACK_BYTES,
        mimeType: "image/png" as const,
        sha256: digest(PACK_BYTES),
        width: 1,
        height: 1,
        packedComponents: Object.freeze([
          Object.freeze({ id: "lulu.face.v4.front.lock.v1", sha256: digest(V4_TRANSLATION_BYTES) }),
          Object.freeze({ id: "lulu.body.canon.v4.front", sha256: digest(BODY_FRONT_BYTES) }),
          Object.freeze({ id: "lulu.body.real.angle-contact.v4", sha256: digest(ANGLE_CONTACT_BYTES) }),
        ]),
      }),
    ]),
    staticPhysicalReferenceCount: 2,
    physicalReferenceCount: 3,
    maxPhysicalReferences: 4,
    verifiedSourceAssetCount: 5,
  });
}

function resolvedSubjectBPack() {
  return Object.freeze({
    authorityId: "lulu-v4" as const,
    revision: "LULU_V4_2026-08-25.5",
    kind: "SUBJECT_B" as const,
    view: "SUBJECT" as const,
    privacy: "PRIVATE_PRODUCTION_ONLY" as const,
    publishable: false as const,
    status: "STATIC_AUTHORITIES_VERIFIED" as const,
    dynamicReferenceSlots: Object.freeze([
      "ELIGIBLE_PASS_A_PARENT" as const,
      "GARMENT_FRONT_LOCK" as const,
    ]),
    staticReferences: Object.freeze([
      Object.freeze({
        id: "lulu.face.operation-board.full.v1",
        role: "REAL_FACE_OPERATION_BOARD",
        authority: "face" as const,
        sourceKind: "ASSET" as const,
        bytes: FACE_BYTES,
        mimeType: "image/png" as const,
        sha256: digest(FACE_BYTES),
        width: 1,
        height: 1,
        packedComponents: Object.freeze([]),
      }),
      Object.freeze({
        id: "lulu.pack.subject-b.front-body.v1",
        role: "SUBJECT_B_TRANSLATION_FACE_BOARD",
        authority: "body" as const,
        sourceKind: "COMPOSITE_BOARD" as const,
        bytes: PACK_BYTES,
        mimeType: "image/png" as const,
        sha256: digest(PACK_BYTES),
        width: 1,
        height: 1,
        packedComponents: Object.freeze([
          Object.freeze({ id: "lulu.body.canon.v4.front", sha256: digest(BODY_FRONT_BYTES) }),
          Object.freeze({ id: "lulu.body.real.angle-contact.v4", sha256: digest(ANGLE_CONTACT_BYTES) }),
        ]),
      }),
    ]),
    staticPhysicalReferenceCount: 2,
    physicalReferenceCount: 4,
    maxPhysicalReferences: 4,
    verifiedSourceAssetCount: 4,
  });
}

function executionInput() {
  return {
    operatorSubject: "operator-test",
    operationId: OPERATION_ROW_ID,
  };
}

function consentReceipt(overrides: Record<string, unknown> = {}) {
  const body = {
    schemaVersion: "juw.atelier-non-zdr-consent.v1" as const,
    receiptId: "consent/operator-test/g024",
    operatorSubject: "operator-test",
    operationId: OPERATION_ROW_ID,
    provider: "openai" as const,
    model: STUDIO_GPT_IMAGE_2_MODEL,
    zeroDataRetention: false as const,
    providerRetentionAcknowledged: true as const,
    recordedAt: "2026-08-26T06:00:00.000Z",
    ...overrides,
  };
  return {
    ...body,
    receiptSha256: deriveStudioAtelierConsentReceiptHash(body as never),
  };
}

async function validProviderJpeg(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: {
      width: 1024,
      height: 1536,
      channels: 3,
      background: "#b5aa9b",
    },
  }).jpeg({ quality: 88 }).toBuffer());
}

function providerResult(
  bytes: Uint8Array,
  costUsd: number,
  usage: Readonly<Record<string, unknown>> = Object.freeze({ inputTokens: 20, outputTokens: 30 }),
  mimeType: "image/jpeg" | "image/png" = "image/jpeg",
) {
  return Object.freeze({
    requestedModel: STUDIO_GPT_IMAGE_2_MODEL,
    servedModels: Object.freeze([STUDIO_GPT_IMAGE_2_MODEL]),
    images: Object.freeze([Object.freeze({
      ordinal: 0,
      bytes,
      mimeType,
    })]),
    usage,
    costUsd,
    warnings: Object.freeze([]),
    responses: Object.freeze([Object.freeze({
      modelId: STUDIO_GPT_IMAGE_2_MODEL,
      timestamp: "2026-08-26T06:00:01.000Z",
      headers: Object.freeze({ "x-request-id": "req-test" }),
    })]),
    gatewayGenerationId: "gen-test",
    requestId: "req-test",
    durationMs: 42,
  });
}

async function validTransparentSubjectPng(): Promise<Uint8Array> {
  const subject = await sharp({
    create: { width: 320, height: 1100, channels: 4, background: "#6b3549ff" },
  }).png().toBuffer();
  return new Uint8Array(await sharp({
    create: { width: 1024, height: 1536, channels: 4, background: "#00000000" },
  }).composite([{ input: subject, left: 352, top: 250 }]).png().toBuffer());
}

async function validLockedRoomPng(): Promise<Uint8Array> {
  return new Uint8Array(await sharp({
    create: {
      width: 1024,
      height: 1536,
      channels: 3,
      background: "#ded5ca",
    },
  }).png().toBuffer());
}

type HarnessOptions = Readonly<{
  result?: ReturnType<typeof providerResult>;
  operation?: AtelierOperation;
  pack?: ReturnType<typeof resolvedSubjectPack>
    | ReturnType<typeof resolvedSubjectBPack>
    | ReturnType<typeof resolvedRoomPack>;
  dynamicReferences?: readonly Record<string, unknown>[];
  directGarmentEvidence?: StudioAtelierExecutionContext["directGarmentEvidence"] | null;
  consent?: Record<string, unknown>;
  providerError?: StudioGatewayError;
  resumeFromRaw?: boolean;
  claimDenied?: boolean;
  invocationCheckpointFails?: boolean;
  resultCheckpointFails?: boolean;
  expiredRecovery?: "SAFE_PRE_DISPATCH_REQUEUE"
    | "COMPLETE_RAW_RESUME"
    | "UNCERTAIN_PROVIDER_INVOCATION"
    | "INCOMPLETE_MATERIALIZATION";
}>;

function createHarness(options: HarnessOptions) {
  const preparedOperation = options.operation ?? subjectAOperation();
  const resolvedPack = options.pack ?? resolvedSubjectPack();
  const events: string[] = [];
  const putInputs: Array<Record<string, unknown>> = [];
  const recordInputs: Array<Record<string, unknown>> = [];
  const finalizeInputs: Array<Record<string, unknown>> = [];
  const intentInputs: Array<Record<string, unknown>> = [];
  const invokeInputs: Array<Record<string, unknown>> = [];
  const contextInputs: Array<Record<string, unknown>> = [];
  const artifacts: Array<Record<string, unknown>> = [];
  let executionState = "INTENT";
  let invokeCount = 0;
  let providerInvocationStartedAt: Date | null = null;
  let providerResultReceivedAt: Date | null = null;
  let providerResultManifest: Record<string, unknown> | null = null;
  let executionUsage: Record<string, unknown> | null = null;
  let executionCostUsd: string | null = null;
  let executionWarnings: Array<Record<string, unknown>> = [];
  let executionResponses: Array<Record<string, unknown>> = [];
  let executionRequestIds: string[] = [];
  let executionDurationMs: number | null = null;

  const executionRow = () => ({
    id: EXECUTION_ID,
    operationId: OPERATION_ROW_ID,
    state: executionState,
    attempt: 1,
    providerInvocationStartedAt,
    providerResultReceivedAt,
    providerResultManifest,
    usage: executionUsage,
    costUsd: executionCostUsd,
    warnings: executionWarnings,
    sanitizedResponses: executionResponses,
    requestIds: executionRequestIds,
    durationMs: executionDurationMs,
  });
  const operationRow = {
    id: OPERATION_ROW_ID,
    operationKey: deriveOperationId(preparedOperation),
    semanticHash: semanticOperationHash(preparedOperation),
    canonicalOperation: preparedOperation,
    state: "PLANNED",
  };
  const lease = {
    executionId: EXECUTION_ID,
    executionToken: "00000000-0000-4000-8000-000000000026",
    leaseFence: 1,
    leaseExpiresAt: new Date("2026-08-26T06:10:00.000Z"),
  };

  if (options.resumeFromRaw) {
    if (!options.result) throw new Error("A durable raw resume requires a provider result fixture.");
    providerInvocationStartedAt = new Date("2026-08-26T06:00:00.000Z");
    providerResultReceivedAt = new Date("2026-08-26T06:00:01.000Z");
    const staged = options.result.images.map((image) => {
      const sha256 = digest(image.bytes);
      return {
        image,
        blob: {
          pathname: `studio/atelier/executions/${EXECUTION_ID}/raw/${sha256}.jpg`,
          blobUrl: `https://private.invalid/${sha256}`,
          mimeType: image.mimeType,
          byteSize: image.bytes.byteLength,
          sha256,
          bytes: image.bytes,
        },
      };
    });
    providerResultManifest = {
      schemaVersion: "juw.atelier-provider-result.v1",
      requestedModel: options.result.requestedModel,
      servedModels: [...options.result.servedModels],
      images: staged.map(({ image, blob }) => ({
        ordinal: image.ordinal,
        mimeType: image.mimeType,
        byteSize: image.bytes.byteLength,
        sha256: digest(image.bytes),
        blob,
      })),
      gatewayGenerationId: options.result.gatewayGenerationId,
      requestId: options.result.requestId,
    };
    executionUsage = options.result.usage;
    executionCostUsd = String(options.result.costUsd);
    executionWarnings = [...options.result.warnings];
    executionResponses = [...options.result.responses];
    executionRequestIds = [options.result.gatewayGenerationId, options.result.requestId]
      .filter((value): value is string => Boolean(value));
    executionDurationMs = options.result.durationMs;
  }

  const dependencies = {
    recoverExpiredExecutions: async () => ({
      total: 0,
      safePreDispatchRequeue: 0,
      uncertainProviderInvocation: 0,
      completeRawResume: 0,
      incompleteMaterialization: 0,
    }),
    resolvePack: async () => {
      events.push("resolvePack");
      return resolvedPack;
    },
    fullFrameAdapter: {
      capabilities: studioGptImage2Capabilities,
      invoke: async (input: Record<string, unknown>) => {
        events.push("invoke");
        invokeInputs.push(input);
        invokeCount += 1;
        if (options.providerError) throw options.providerError;
        assert.ok(options.result);
        return options.result;
      },
    },
    getOperation: async () => {
      events.push("getOperation");
      return operationRow;
    },
    recoverExpiredExecutions: async () => {
      events.push("recoverExpiredExecutions");
      if (
        options.expiredRecovery === "UNCERTAIN_PROVIDER_INVOCATION"
        || options.expiredRecovery === "INCOMPLETE_MATERIALIZATION"
      ) {
        executionState = "INDETERMINATE";
      }
      return {
        total: options.expiredRecovery ? 1 : 0,
        safePreDispatchRequeue:
          options.expiredRecovery === "SAFE_PRE_DISPATCH_REQUEUE" ? 1 : 0,
        completeRawResume:
          options.expiredRecovery === "COMPLETE_RAW_RESUME" ? 1 : 0,
        uncertainProviderInvocation:
          options.expiredRecovery === "UNCERTAIN_PROVIDER_INVOCATION" ? 1 : 0,
        incompleteMaterialization:
          options.expiredRecovery === "INCOMPLETE_MATERIALIZATION" ? 1 : 0,
      };
    },
    transparentSubjectAdapter: {
      capabilities: studioGptImage2TransparentSubjectCapabilities,
      outputProfile: {},
      invoke: async (input: Record<string, unknown>) => {
        events.push("invoke");
        invokeInputs.push(input);
        invokeCount += 1;
        if (options.providerError) throw options.providerError;
        assert.ok(options.result);
        return options.result;
      },
    },
    resolveExecutionContext: async (contextInput: Record<string, unknown>) => {
      events.push("resolveExecutionContext");
      contextInputs.push(contextInput);
      const requestedSlots = contextInput.dynamicReferenceSlots as string[];
      const directGarmentEvidence = Object.hasOwn(options, "directGarmentEvidence")
        ? options.directGarmentEvidence ?? undefined
        : preparedOperation.directGarmentEvidence
          ? {
              sourceManifest: DIRECT_GARMENT_SOURCE_MANIFEST,
              sources: DIRECT_GARMENT_SOURCES,
            }
          : undefined;
      return {
        dynamicReferences: options.dynamicReferences ?? requestedSlots.map((slot) => ({
          slot,
          bytes: GARMENT_BYTES,
          mimeType: "image/png" as const,
        })),
        parentLocks: preparedOperation.parentLocks,
        consentReceipt: options.consent ?? consentReceipt(),
        ...(directGarmentEvidence ? { directGarmentEvidence } : {}),
      };
    },
    createExecutionIntent: async (input: Record<string, unknown>) => {
      events.push("createExecutionIntent");
      intentInputs.push(input);
      return executionRow();
    },
    claimExecution: async () => {
      events.push("claimExecution");
      if (options.claimDenied) return null;
      executionState = providerResultReceivedAt ? "PERSISTING" : "RUNNING";
      return lease;
    },
    checkpointInvocationStarted: async () => {
      events.push("checkpointInvocationStarted");
      if (options.invocationCheckpointFails) return false;
      providerInvocationStartedAt = new Date("2026-08-26T06:00:00.000Z");
      return true;
    },
    checkpointProviderResult: async (input: Record<string, unknown>) => {
      events.push("checkpointProviderResult");
      if (options.resultCheckpointFails) return false;
      providerResultReceivedAt = new Date("2026-08-26T06:00:01.000Z");
      providerResultManifest = input.manifest as Record<string, unknown>;
      executionUsage = input.usage as Record<string, unknown>;
      executionCostUsd = String(input.costUsd);
      executionWarnings = (input.warnings ?? []) as Array<Record<string, unknown>>;
      executionResponses = (input.responses ?? []) as Array<Record<string, unknown>>;
      executionRequestIds = (input.requestIds ?? []) as string[];
      executionDurationMs = Number(input.durationMs);
      executionState = "PERSISTING";
      return true;
    },
    putArtifact: async (input: Record<string, unknown>) => {
      const namespace = String(input.namespace);
      const kind = namespace.endsWith("/raw") ? "raw" : "normalized";
      events.push(`put:${kind}`);
      putInputs.push(input);
      const bytes = input.bytes as Uint8Array;
      const sha256 = digest(bytes);
      return {
        pathname: `${namespace}/${sha256}.jpg`,
        blobUrl: `https://private.invalid/${sha256}`,
        mimeType: String(input.mimeType),
        byteSize: bytes.byteLength,
        sha256,
        bytes,
      };
    },
    recordArtifact: async (input: Record<string, unknown>) => {
      const kind = String(input.kind);
      events.push(`record:${kind}`);
      recordInputs.push(input);
      const artifact = {
        id: `artifact-${artifacts.length}`,
        executionId: EXECUTION_ID,
        ordinal: Number(input.ordinal),
        kind,
        role: String(input.role),
        state: "STORED",
        blobPathname: (input.blob as Record<string, unknown>).pathname,
        blobUrl: (input.blob as Record<string, unknown>).blobUrl,
        mimeType: (input.blob as Record<string, unknown>).mimeType,
        byteSize: (input.blob as Record<string, unknown>).byteSize,
        sha256: (input.blob as Record<string, unknown>).sha256,
        metadata: input.metadata ?? {},
      };
      artifacts.push(artifact);
      return artifact;
    },
    finalizeExecution: async (input: Record<string, unknown>) => {
      const state = String(input.state);
      events.push(`finalize:${state}`);
      finalizeInputs.push(input);
      executionState = state;
      return { ...executionRow(), ...input };
    },
    getExecution: async () => executionRow(),
    listArtifacts: async () => artifacts,
    readArtifact: async (artifact: Record<string, unknown>) => {
      events.push(`read:${String(artifact.kind)}`);
      const recorded = recordInputs.find((input) =>
        String(input.kind) === String(artifact.kind)
        && Number(input.ordinal) === Number(artifact.ordinal)
      );
      if (!recorded?.blob) throw new Error("The test artifact bytes were not retained.");
      return (recorded?.blob as Record<string, unknown>).bytes as Uint8Array;
    },
  };

  const execute = createStudioAtelierExecutionService(dependencies as never);
  return {
    execute: () => execute(executionInput()),
    executeWithCallerPrompt: () => execute({
      ...executionInput(),
      compiledPrompt: "CALLER_PROSE_MUST_NOT_ENTER_THE_PROVIDER_PROMPT",
    } as never),
    events,
    putInputs,
    recordInputs,
    finalizeInputs,
    intentInputs,
    invokeInputs,
    contextInputs,
    invokeCount: () => invokeCount,
  };
}

function assertPrecedes(events: readonly string[], first: string, second: string): void {
  const firstIndex = events.indexOf(first);
  const secondIndex = events.indexOf(second);
  assert.notEqual(firstIndex, -1, `${first} was not observed`);
  assert.notEqual(secondIndex, -1, `${second} was not observed`);
  assert.ok(firstIndex < secondIndex, `${first} must precede ${second}: ${events.join(" -> ")}`);
}

test("execution entry demand-recovers expired safe work before intent and dispatch", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155),
    expiredRecovery: "SAFE_PRE_DISPATCH_REQUEUE",
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 1);
  assertPrecedes(harness.events, "recoverExpiredExecutions", "getOperation");
  assertPrecedes(harness.events, "recoverExpiredExecutions", "createExecutionIntent");
  assertPrecedes(harness.events, "recoverExpiredExecutions", "claimExecution");
  assertPrecedes(harness.events, "recoverExpiredExecutions", "invoke");
});

test("execution entry terminalizes an expired uncertain dispatch without re-spend", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155),
    expiredRecovery: "UNCERTAIN_PROVIDER_INVOCATION",
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "INDETERMINATE");
  assert.equal(output.reused, true);
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.events.includes("claimExecution"), false);
  assert.equal(harness.events.includes("checkpointInvocationStarted"), false);
  assertPrecedes(harness.events, "recoverExpiredExecutions", "createExecutionIntent");
});

test("paid raw bytes and their artifact row are durable before cost quarantine", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({ result: providerResult(paidBytes, 0.101) });

  const output = await harness.execute();

  assert.equal(output.execution.state, "QUARANTINED");
  assert.equal(harness.invokeCount(), 1);
  assert.equal(harness.putInputs.length, 1);
  assert.deepEqual(harness.putInputs[0]?.bytes, paidBytes);
  assert.equal(harness.putInputs[0]?.allowOpaqueFallback, true);
  assert.equal(harness.putInputs[0]?.maximumBytes, 128 * 1024 * 1024);
  assert.equal(harness.recordInputs.length, 1);
  assert.equal(harness.recordInputs[0]?.kind, "PROVIDER_RAW");
  assert.equal(harness.finalizeInputs[0]?.state, "QUARANTINED");
  assert.equal(harness.finalizeInputs[0]?.errorCode, "COST_CAP_EXCEEDED");
  assert.equal(harness.intentInputs[0]?.compiledPrompt, harness.invokeInputs[0]?.prompt);
  assert.match(String(harness.invokeInputs[0]?.prompt), /JUW VIRTUAL ATELIER — CANONICAL EXECUTION INSTRUCTION/);
  assert.match(String(harness.invokeInputs[0]?.prompt), /ONLY DECLARED MUTATIONS/);
  assert.match(String(harness.invokeInputs[0]?.prompt), /IMMUTABLE TRUTH/);
  assert.doesNotMatch(
    String(harness.invokeInputs[0]?.prompt),
    /CALLER_PROSE_MUST_NOT_ENTER_THE_PROVIDER_PROMPT/,
  );
  assertPrecedes(harness.events, "createExecutionIntent", "invoke");
  assertPrecedes(harness.events, "createExecutionIntent", "checkpointInvocationStarted");
  assertPrecedes(harness.events, "checkpointInvocationStarted", "invoke");
  assertPrecedes(harness.events, "invoke", "put:raw");
  assertPrecedes(harness.events, "put:raw", "checkpointProviderResult");
  assertPrecedes(harness.events, "checkpointProviderResult", "record:PROVIDER_RAW");
  assertPrecedes(harness.events, "put:raw", "record:PROVIDER_RAW");
  assertPrecedes(harness.events, "record:PROVIDER_RAW", "finalize:QUARANTINED");
});

test("a passing paid result stores separate raw and normalized artifacts before completion", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({ result: providerResult(paidBytes, 0.062155) });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 1);
  assert.deepEqual(harness.recordInputs.map((input) => input.kind), [
    "PROVIDER_RAW",
    "NORMALIZED",
  ]);
  assert.equal(harness.putInputs.length, 2);
  assert.match(String(harness.putInputs[0]?.namespace), /\/raw$/);
  assert.match(String(harness.putInputs[1]?.namespace), /\/normalized$/);
  assert.notEqual(
    digest(harness.putInputs[0]?.bytes as Uint8Array),
    digest(harness.putInputs[1]?.bytes as Uint8Array),
  );
  assert.equal(harness.finalizeInputs[0]?.state, "COMPLETE");
  const references = harness.invokeInputs[0]?.references as Array<Record<string, unknown>>;
  assert.deepEqual(references.map((reference) => reference.role), [
    "GARMENT_SET_01_04_BOARD",
    "REAL_FACE_OPERATION_BOARD",
    "SUBJECT_A_TRANSLATION_FACE_BOARD",
  ]);
  assert.match(
    String(harness.invokeInputs[0]?.prompt),
    /GARMENT_SET_01_04_BOARD[\s\S]*transport only/i,
  );
  assertPrecedes(harness.events, "record:PROVIDER_RAW", "put:normalized");
  assertPrecedes(harness.events, "put:normalized", "record:NORMALIZED");
  assertPrecedes(harness.events, "record:NORMALIZED", "finalize:COMPLETE");
});

test("independent garment 01 executes from direct evidence without a Lulu pack or stage parent", async () => {
  const paidBytes = await validProviderJpeg();
  const operation = await garmentOperation(GARMENT_STAGE_CASES[0]);
  const harness = createHarness({
    operation,
    result: providerResult(paidBytes, 0.062155),
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 1);
  assert.equal(harness.events.includes("resolvePack"), false);
  assert.equal(harness.invokeInputs[0]?.operationType, "GARMENT_01_FRONT");
  assert.equal(harness.invokeInputs[0]?.view, "01");
  const references = harness.invokeInputs[0]?.references as Array<Record<string, unknown>>;
  assert.deepEqual(references.map((reference) => reference.role), [
    "DIRECT_GARMENT_EVIDENCE",
  ]);
  const expectedPack = await directGarmentPackFixture();
  assert.deepEqual(references[0]?.bytes, expectedPack.bytes);
  assert.deepEqual(
    harness.contextInputs[0]?.directGarmentEvidence,
    operation.directGarmentEvidence,
  );
  assert.deepEqual(harness.contextInputs[0]?.dynamicReferenceSlots, []);
  assert.equal((harness.intentInputs[0]?.parameters as Record<string, unknown>).outputMode,
    "GENERATIVE_GARMENT_MEDIA");
});

test("independent garment 02-04 stages each execute once from their direct evidence root", async (context) => {
  const paidBytes = await validProviderJpeg();
  for (const stageCase of GARMENT_STAGE_CASES.slice(1)) {
    await context.test(stageCase.stage, async () => {
      const harness = createHarness({
        operation: await garmentOperation(stageCase),
        result: providerResult(paidBytes, 0.062155),
      });

      const output = await harness.execute();

      assert.equal(output.execution.state, "COMPLETE");
      assert.equal(harness.invokeCount(), 1);
      assert.equal(harness.events.includes("resolvePack"), false);
      assert.equal(harness.invokeInputs[0]?.operationType, stageCase.stage);
      assert.equal(harness.invokeInputs[0]?.view, stageCase.view);
      const references = harness.invokeInputs[0]?.references as Array<Record<string, unknown>>;
      assert.deepEqual(references.map((reference) => reference.role), [
        "DIRECT_GARMENT_EVIDENCE",
      ]);
      assert.equal(
        references[0]?.assetId,
        (await directGarmentPackFixture()).receipt.output.assetId,
      );
      assert.equal(
        (harness.intentInputs[0]?.parameters as Record<string, unknown>).outputMode,
        "GENERATIVE_GARMENT_MEDIA",
      );
      assert.equal(
        (harness.intentInputs[0]?.parameters as Record<string, unknown>).operationKind,
        stageCase.stage,
      );
    });
  }
});

test("absent, missing, mismatched, or unattested direct sources fail before intent and spend", async (context) => {
  const operation = await garmentOperation(GARMENT_STAGE_CASES[0]);
  const cases = [
    {
      name: "absent source context",
      directGarmentEvidence: null,
    },
    {
      name: "missing constituent",
      directGarmentEvidence: {
        sourceManifest: DIRECT_GARMENT_SOURCE_MANIFEST,
        sources: DIRECT_GARMENT_SOURCES.slice(0, 2),
      },
    },
    {
      name: "mismatched constituent bytes",
      directGarmentEvidence: {
        sourceManifest: DIRECT_GARMENT_SOURCE_MANIFEST,
        sources: [
          {
            ...DIRECT_GARMENT_SOURCES[0]!,
            bytes: new Uint8Array([...GARMENT_BYTES, 0]),
          },
          DIRECT_GARMENT_SOURCES[1]!,
          DIRECT_GARMENT_SOURCES[2]!,
        ],
      },
    },
    {
      name: "unattested extra constituent",
      directGarmentEvidence: {
        sourceManifest: DIRECT_GARMENT_SOURCE_MANIFEST,
        sources: [
          ...DIRECT_GARMENT_SOURCES,
          {
            ...DIRECT_GARMENT_SOURCES[0]!,
            constituent: {
              ...DIRECT_GARMENT_SOURCES[0]!.constituent,
              assetId: "garment/024/unattested-source",
            },
          },
        ],
      },
    },
    {
      name: "mismatched manifest attestation",
      directGarmentEvidence: {
        sourceManifest: {
          ...DIRECT_GARMENT_SOURCE_MANIFEST,
          sha256: digest("wrong-source-manifest"),
        },
        sources: DIRECT_GARMENT_SOURCES,
      },
    },
  ] as const;
  for (const fixture of cases) {
    await context.test(fixture.name, async () => {
      const harness = createHarness({
        operation,
        directGarmentEvidence: fixture.directGarmentEvidence,
      });
      await assert.rejects(
        () => harness.execute(),
        /direct garment (source context is incomplete|evidence pack did not match)/i,
      );
      assert.equal(harness.events.includes("createExecutionIntent"), false);
      assert.equal(harness.events.includes("claimExecution"), false);
      assert.equal(harness.events.includes("checkpointInvocationStarted"), false);
      assert.equal(harness.events.includes("invoke"), false);
      assert.equal(harness.invokeCount(), 0);
    });
  }
});

test("Subject B executes with donor then deterministic garment board and scoped canon boards", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    operation: subjectBOperation(),
    pack: resolvedSubjectBPack(),
    dynamicReferences: [
      { slot: "ELIGIBLE_PASS_A_PARENT", bytes: SUBJECT_A_DONOR_BYTES, mimeType: "image/jpeg" },
      { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
      { slot: "GARMENT_BACK_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
      { slot: "MANNEQUIN_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
      { slot: "FABRIC_DETAIL_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
    ],
    result: providerResult(paidBytes, 0.062155),
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 1);
  assert.equal(harness.invokeInputs[0]?.operationType, "SUBJECT_B");
  assert.equal(harness.invokeInputs[0]?.view, "SUBJECT");
  const references = harness.invokeInputs[0]?.references as Array<Record<string, unknown>>;
  assert.deepEqual(references.map((reference) => reference.role), [
    "SUBJECT_A_TRANSLATION_DONOR",
    "GARMENT_SET_01_04_BOARD",
    "REAL_FACE_OPERATION_BOARD",
    "SUBJECT_B_TRANSLATION_FACE_BOARD",
  ]);
  assert.deepEqual(references[0]?.bytes, SUBJECT_A_DONOR_BYTES);
  assert.match(
    String(harness.invokeInputs[0]?.prompt),
    /GARMENT_SET_01_04_BOARD[\s\S]*transport only/i,
  );
  assert.match(
    String(harness.invokeInputs[0]?.prompt),
    /SUBJECT_B_TRANSLATION_FACE_BOARD[\s\S]*primary identity truth/i,
  );
  const parameters = harness.intentInputs[0]?.parameters as Record<string, unknown>;
  assert.equal(parameters.outputMode, "GENERATIVE_FULL_FRAME");
  assert.equal(parameters.operationKind, "SUBJECT_B");
  assert.equal(
    parameters.g004ProviderVisualDenialRevision,
    STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
  );
  assert.equal(
    parameters.g004ProviderVisualDenialManifestSha256,
    STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
  );
});

test("lossless or lossy G004 copies cannot be laundered into a provider donor", async (t) => {
  const g004Front = STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets[0]!;
  const original = await readFile(new URL(`../public${g004Front.sourcePath}`, import.meta.url));
  const variants = [
    {
      name: "lossless PNG",
      bytes: new Uint8Array(await sharp(original)
        .toColorspace("srgb")
        .ensureAlpha()
        .png()
        .toBuffer()),
      mimeType: "image/png" as const,
    },
    {
      name: "lossy JPEG",
      bytes: new Uint8Array(await sharp(original).jpeg({ quality: 90 }).toBuffer()),
      mimeType: "image/jpeg" as const,
    },
  ];

  for (const variant of variants) {
    await t.test(variant.name, async () => {
      assert.notEqual(digest(variant.bytes), g004Front.sha256);
      const candidate = structuredClone(subjectBOperation());
      const donor = candidate.authorityStack.find(
        (authority) => authority.role === "SUBJECT_A_TRANSLATION_DONOR",
      );
      assert.ok(donor);
      const previous = { assetId: donor.assetId, sha256: donor.sha256 };
      donor.assetId = `garment/024/laundered-g004-front.${
        variant.mimeType === "image/png" ? "png" : "jpg"
      }`;
      donor.sha256 = digest(variant.bytes);
      candidate.immutableSet.forEach((item) => {
        if (item.assetId === previous.assetId && item.sha256 === previous.sha256) {
          item.assetId = donor.assetId;
          item.sha256 = donor.sha256;
        }
      });
      const operation = atelierOperationSchema.parse(candidate);
      const harness = createHarness({
        operation,
        pack: resolvedSubjectBPack(),
        dynamicReferences: [
          {
            slot: "ELIGIBLE_PASS_A_PARENT",
            bytes: variant.bytes,
            mimeType: variant.mimeType,
          },
          { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
          { slot: "GARMENT_BACK_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
          { slot: "MANNEQUIN_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
          { slot: "FABRIC_DETAIL_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
        ],
      });

      await assert.rejects(
        harness.execute(),
        (error: unknown) => error instanceof StudioEngineError
          && error.code === "INVALID_ASSET"
          && /(byte-renamed|visually duplicated) G004/i.test(error.message),
      );
      assert.equal(harness.invokeCount(), 0);
      assert.equal(harness.events.includes("createExecutionIntent"), false);
      assert.equal(harness.events.includes("checkpointInvocationStarted"), false);
    });
  }
});

test("subject preflight requires the exact bytes of all four accepted garment locks", async () => {
  const harness = createHarness({
    dynamicReferences: [
      { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
      { slot: "GARMENT_BACK_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
      { slot: "MANNEQUIN_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" },
    ],
  });

  await assert.rejects(
    harness.execute,
    /exact FABRIC_DETAIL_LOCK bytes are absent/i,
  );
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.intentInputs.length, 0);
  assert.equal(harness.events.includes("claimExecution"), false);
});

test("missing Gateway usage quarantines only after the paid raw artifact is durable", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155, Object.freeze({})),
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "QUARANTINED");
  assert.equal(harness.finalizeInputs[0]?.errorCode, "MISSING_GATEWAY_USAGE");
  assert.deepEqual(harness.recordInputs.map((input) => input.kind), ["PROVIDER_RAW"]);
  assertPrecedes(harness.events, "record:PROVIDER_RAW", "finalize:QUARANTINED");
});

test("an indeterminate provider error is finalized once and never automatically retried", async () => {
  const upstream = new StudioGatewayError(
    "The provider response was lost.",
    "Reconcile the private execution before another invocation.",
    {
      stage: "generation",
      classification: "gateway",
      model: STUDIO_GPT_IMAGE_2_MODEL,
      errorNames: ["GatewayTimeout"],
      statusCode: null,
      gatewayType: null,
      generationId: "gen-failed-test",
      requestId: "req-failed-test",
      retryable: null,
    },
    { usage: { inputTokens: 12 }, costUsd: 0.01875 },
    1_234,
  );
  const harness = createHarness({ providerError: upstream });

  await assert.rejects(harness.execute, (error: unknown) => error === upstream);
  assert.equal(harness.invokeCount(), 1);
  assert.equal(harness.finalizeInputs.length, 1);
  assert.equal(harness.finalizeInputs[0]?.state, "INDETERMINATE");
  assert.equal(harness.finalizeInputs[0]?.errorCode, "INDETERMINATE_PROVIDER_RESULT");
  assert.deepEqual(harness.finalizeInputs[0]?.usage, { inputTokens: 12 });
  assert.equal(harness.finalizeInputs[0]?.costUsd, 0.01875);
  assert.equal(harness.finalizeInputs[0]?.durationMs, 1_234);
  assert.deepEqual(harness.finalizeInputs[0]?.requestIds, [
    "gen-failed-test",
    "req-failed-test",
  ]);
  assert.equal((harness.intentInputs[0]?.parameters as Record<string, unknown>).maxRetries, 0);
  assertPrecedes(harness.events, "invoke", "finalize:INDETERMINATE");

  const second = await harness.execute();
  assert.equal(second.reused, true);
  assert.equal(second.execution.state, "INDETERMINATE");
  assert.equal(harness.invokeCount(), 1);
  assert.equal(harness.finalizeInputs.length, 1);
});

test("a crash after raw persistence resumes materialization without another paid invocation", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155),
    resumeFromRaw: true,
    expiredRecovery: "COMPLETE_RAW_RESUME",
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.events.includes("checkpointInvocationStarted"), false);
  assert.equal(harness.events.includes("checkpointProviderResult"), false);
  assertPrecedes(harness.events, "recoverExpiredExecutions", "createExecutionIntent");
  assert.deepEqual(harness.recordInputs.map((input) => input.kind), [
    "PROVIDER_RAW",
    "NORMALIZED",
  ]);
  assert.deepEqual(harness.putInputs.map((input) => String(input.namespace).split("/").at(-1)), [
    "normalized",
  ]);
  assertPrecedes(harness.events, "read:PROVIDER_RAW", "put:normalized");
  assertPrecedes(harness.events, "record:NORMALIZED", "finalize:COMPLETE");
});

test("a lost result checkpoint retains bytes but fences the execution from re-spend", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155),
    resultCheckpointFails: true,
  });

  await assert.rejects(harness.execute, /provider result checkpoint could not commit/i);

  assert.equal(harness.invokeCount(), 1);
  assert.equal(harness.putInputs.length, 1);
  assert.deepEqual(harness.putInputs[0]?.bytes, paidBytes);
  assert.deepEqual(harness.recordInputs, []);
  assert.equal(harness.finalizeInputs.length, 1);
  assert.equal(harness.finalizeInputs[0]?.state, "INDETERMINATE");
  assert.equal(harness.finalizeInputs[0]?.errorCode, "RESULT_CHECKPOINT_FAILED");
  assertPrecedes(harness.events, "invoke", "put:raw");
  assertPrecedes(harness.events, "put:raw", "checkpointProviderResult");
  assertPrecedes(harness.events, "checkpointProviderResult", "finalize:INDETERMINATE");

  const second = await harness.execute();
  assert.equal(second.reused, true);
  assert.equal(second.execution.state, "INDETERMINATE");
  assert.equal(harness.invokeCount(), 1);
});

test("a concurrent claimant that loses the lease cannot dispatch", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155),
    claimDenied: true,
  });

  const output = await harness.execute();

  assert.equal(output.reused, true);
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.events.includes("checkpointInvocationStarted"), false);
  assert.equal(harness.events.includes("checkpointProviderResult"), false);
  assert.equal(harness.putInputs.length, 0);
});

test("a failed dispatch checkpoint prevents provider invocation", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({
    result: providerResult(paidBytes, 0.062155),
    invocationCheckpointFails: true,
  });

  await assert.rejects(harness.execute, /dispatch checkpoint could not acquire/i);
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.events.includes("checkpointProviderResult"), false);
  assert.equal(harness.putInputs.length, 0);
});

test("transparent catalogue execution materializes SUBJECT_LAYER plus the exact review COMPOSITE", async () => {
  const paidBytes = await validTransparentSubjectPng();
  const roomBytes = await validLockedRoomPng();
  const operation = roomFinalOperation(roomBytes);
  const harness = createHarness({
    operation,
    pack: resolvedRoomPack(1536, roomBytes),
    dynamicReferences: [{ slot: "ACCEPTED_SUBJECT_LOCK", bytes: SUBJECT_LOCK_BYTES, mimeType: "image/png" }, { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" }],
    result: providerResult(paidBytes, 0.062155, Object.freeze({ inputTokens: 20, outputTokens: 30 }), "image/png"),
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 1);
  assert.deepEqual(harness.recordInputs.map((input) => input.kind), [
    "PROVIDER_RAW",
    "SUBJECT_LAYER",
    "COMPOSITE",
  ]);
  assert.match(String(harness.putInputs[1]?.namespace), /\/subject-layer$/);
  assert.match(String(harness.putInputs[2]?.namespace), /\/composite$/);
  assert.deepEqual(
    (harness.recordInputs[2]?.metadata as Record<string, unknown>).sourceArtifactIds,
    ["artifact-1"],
  );
  const parameters = harness.intentInputs[0]?.parameters as Record<string, unknown>;
  assert.equal(parameters.outputFormat, "png");
  assert.equal(parameters.background, "transparent");
  assert.equal(parameters.transparentSubjectProfileRevision, "2026-08-26.1");
  assert.equal(parameters.subjectNormalizationRevision, "transparent-rgb-zero-png-v1");
  assert.equal(parameters.deterministicCompositeRevision, "sharp-alpha-over-room-v1");
  assertPrecedes(harness.events, "record:PROVIDER_RAW", "record:SUBJECT_LAYER");
  assertPrecedes(harness.events, "record:SUBJECT_LAYER", "record:COMPOSITE");
  assertPrecedes(harness.events, "record:COMPOSITE", "finalize:COMPLETE");
});

test("a transparent raw checkpoint resumes exact COMPOSITE materialization without re-spend", async () => {
  const paidBytes = await validTransparentSubjectPng();
  const roomBytes = await validLockedRoomPng();
  const harness = createHarness({
    operation: roomFinalOperation(roomBytes),
    pack: resolvedRoomPack(1536, roomBytes),
    dynamicReferences: [{ slot: "ACCEPTED_SUBJECT_LOCK", bytes: SUBJECT_LOCK_BYTES, mimeType: "image/png" }, { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" }],
    result: providerResult(paidBytes, 0.062155, Object.freeze({ inputTokens: 20, outputTokens: 30 }), "image/png"),
    resumeFromRaw: true,
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 0);
  assert.deepEqual(harness.recordInputs.map((input) => input.kind), [
    "PROVIDER_RAW",
    "SUBJECT_LAYER",
    "COMPOSITE",
  ]);
  assert.equal(harness.events.includes("checkpointInvocationStarted"), false);
  assertPrecedes(harness.events, "record:SUBJECT_LAYER", "record:COMPOSITE");
});

test("an opaque PNG returned for transparent mode is retained then quarantined", async () => {
  const opaquePng = new Uint8Array(await sharp({
    create: { width: 1024, height: 1536, channels: 4, background: "#6b3549ff" },
  }).png().toBuffer());
  const roomBytes = await validLockedRoomPng();
  const harness = createHarness({
    operation: roomFinalOperation(roomBytes),
    pack: resolvedRoomPack(1536, roomBytes),
    dynamicReferences: [{ slot: "ACCEPTED_SUBJECT_LOCK", bytes: SUBJECT_LOCK_BYTES, mimeType: "image/png" }, { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" }],
    result: providerResult(opaquePng, 0.062155, Object.freeze({ inputTokens: 20, outputTokens: 30 }), "image/png"),
  });

  const output = await harness.execute();

  assert.equal(output.execution.state, "QUARANTINED");
  assert.deepEqual(harness.recordInputs.map((input) => input.kind), ["PROVIDER_RAW"]);
  assert.equal(harness.finalizeInputs[0]?.errorCode, "SUBJECT_LAYER_TECHNICAL_GATE_FAILED");
  assertPrecedes(harness.events, "record:PROVIDER_RAW", "finalize:QUARANTINED");
});

test("an incompatible locked room fails preflight before intent, claim or paid invocation", async () => {
  const harness = createHarness({
    operation: roomFinalOperation(),
    pack: resolvedRoomPack(1280),
    dynamicReferences: [{ slot: "ACCEPTED_SUBJECT_LOCK", bytes: SUBJECT_LOCK_BYTES, mimeType: "image/png" }, { slot: "GARMENT_FRONT_LOCK", bytes: GARMENT_BYTES, mimeType: "image/png" }],
  });

  await assert.rejects(harness.execute, /not an exact 1024x1536 compositing authority/i);
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.intentInputs.length, 0);
  assert.equal(harness.events.includes("claimExecution"), false);
});

test("malformed or forged durable non-ZDR consent is rejected without spend", async () => {
  const malformed = createHarness({ consent: consentReceipt({ provider: "other" }) });
  await assert.rejects(malformed.execute, /consent receipt is malformed/i);
  assert.equal(malformed.invokeCount(), 0);
  assert.equal(malformed.intentInputs.length, 0);

  const forgedReceipt = { ...consentReceipt(), receiptSha256: "0".repeat(64) };
  const forged = createHarness({ consent: forgedReceipt });
  await assert.rejects(forged.execute, /failed its content hash/i);
  assert.equal(forged.invokeCount(), 0);
  assert.equal(forged.intentInputs.length, 0);
});

test("repeating a complete execution returns the durable result without another invocation", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({ result: providerResult(paidBytes, 0.062155) });

  const first = await harness.execute();
  const second = await harness.execute();

  assert.equal(first.execution.state, "COMPLETE");
  assert.equal(second.reused, true);
  assert.equal(second.execution.state, "COMPLETE");
  assert.equal(harness.invokeCount(), 1);
});

test("the public execution command rejects caller prompts and provider controls", async () => {
  const paidBytes = await validProviderJpeg();
  const harness = createHarness({ result: providerResult(paidBytes, 0.062155) });

  await assert.rejects(harness.executeWithCallerPrompt, /may contain only operatorSubject and operationId/i);
  assert.equal(harness.invokeCount(), 0);
  assert.equal(harness.intentInputs.length, 0);
});
