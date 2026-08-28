import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
  STUDIO_GPT_IMAGE_2_QUALITY,
  STUDIO_GPT_IMAGE_2_SIZE,
  studioGptImage2Adapter,
  studioGptImage2Capabilities,
  type StudioGptImage2Reference,
} from "../ai/studio-gpt-image-2-gateway";
import {
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
  studioGptImage2TransparentSubjectAdapter,
  studioGptImage2TransparentSubjectCapabilities,
} from "../ai/studio-gpt-image-2-subject-layer";
import {
  canonicalAtelierOperation,
  canonicalStringify,
  executionHash,
} from "../studio/atelier/canonical";
import {
  ATELIER_STAGE_RECIPES,
  type AtelierOperation,
  type AtelierStage,
  type AttestedReferencePack,
  type AuthorityAsset,
  type DirectGarmentEvidenceReceipt,
  type ParentLock,
  type PhysicalReferenceBinding,
  type ReferencePackRole,
} from "../studio/atelier/contracts";
import { planAtelierOperation } from "../studio/atelier/planner";
import {
  ATELIER_PROMPT_VERSION,
  compileAtelierPrompt,
} from "../studio/atelier/prompt-compiler";
import { STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION } from "../studio/atelier/canvas-policy";
import {
  validateProviderSafetyContextReceipt,
  type ProviderSafetyContextReceipt,
} from "../studio/atelier/provider-safety-context";
import {
  isStudioAtelierG004ProviderPixelDenied,
  studioAtelierG004ProviderDenial,
} from "../studio/atelier/g004-provider-denial";
import {
  STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
  studioAtelierG004VisualDuplicate,
  verifyStudioAtelierG004VisualDenialTargets,
  type StudioAtelierG004VisualDenialTarget,
} from "./studio-atelier-g004-provider-visual-denial";
import {
  resolveStudioAtelierG004Calibration,
  verifyStudioAtelierG004Calibration,
  type StudioAtelierG004CalibrationResolver,
} from "./studio-atelier-g004-calibration";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";
import { StudioGatewayError } from "../ai/studio-gateway";
import {
  checkpointAtelierProviderInvocationStarted,
  checkpointAtelierProviderResult,
  claimAtelierExecution,
  createAtelierExecutionIntent,
  createAtelierProviderFailureManifest,
  finalizeAtelierExecution,
  getAtelierOperation,
  getAtelierExecution,
  listAtelierArtifacts,
  recordAtelierArtifact,
  recoverExpiredAtelierExecutions,
  type AtelierArtifactRow,
  type AtelierExecutionRow,
  type AtelierExecutionLease,
  type AtelierParentLockRequest,
  type AtelierProviderModerationCategory,
  type AtelierProviderResultManifest,
  ATELIER_PROVIDER_MODERATION_ERROR_MESSAGE,
} from "./studio-atelier-repository";
import {
  putVerifiedPrivateContentAddressedBlob,
  type VerifiedPrivateBlob,
} from "./private-content-addressed-blob";
import {
  createStudioAtelierGarmentSetBoard,
  type StudioAtelierGarmentSetBoard,
  type StudioAtelierGarmentSetBoardInput,
} from "./studio-atelier-garment-reference-board";
import {
  createStudioAtelierDirectGarmentEvidencePack,
  type StudioAtelierDirectGarmentEvidenceManifestAttestation,
  type StudioAtelierDirectGarmentEvidencePack,
  type StudioAtelierDirectGarmentEvidenceSource,
} from "./studio-atelier-direct-garment-evidence-pack";
import { getShopBlob } from "./vercel-blob";
import {
  resolveLuluV4OperationPack,
  type LuluV4DynamicReferenceSlot,
  type LuluV4OperationKind,
  type LuluV4StaticPhysicalReference,
} from "./studio-lulu-v4-operation-packs";
import {
  STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION,
  STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
  STUDIO_ATELIER_SUBJECT_NORMALIZATION_REVISION,
  compositeStudioAtelierSubject,
  normalizeStudioAtelierSubjectLayer,
  preflightStudioAtelierSubjectComposite,
} from "./studio-atelier-subject-compositor";

const ATELIER_PREPROCESSING_VERSION = "atelier-operation-pack-v2";
const GPT_IMAGE_2_MODEL_REVISION = "gateway-openai-gpt-image-2-2026-04-21";
const MAXIMUM_PAID_PROVIDER_OUTPUT_BYTES = 128 * 1024 * 1024;
const ATELIER_NON_ZDR_CONSENT_SCHEMA_VERSION =
  "juw.atelier-non-zdr-consent.v1" as const;
const EXECUTION_ATTEMPT = 1 as const;

const GPT_IMAGE_2_PLANNER_CAPABILITIES = Object.freeze({
  adapterId: studioGptImage2Capabilities.adapterId,
  adapterVersion: studioGptImage2Capabilities.adapterVersion,
  maxPhysicalReferences: studioGptImage2Capabilities.maxPhysicalReferences,
  supportedStages: [...studioGptImage2Capabilities.supportedStages],
  acceptedPrivacyClasses: [...studioGptImage2Capabilities.acceptedPrivacyClasses],
  supportedOutputModes: [...studioGptImage2Capabilities.supportedOutputModes],
  supportedGeneratedArtifactFormats: [
    ...studioGptImage2Capabilities.supportedGeneratedArtifactFormats,
  ],
  supportedFinalFormats: [...studioGptImage2Capabilities.supportedFinalFormats],
  supportsRequiredAlpha: studioGptImage2Capabilities.supportsRequiredAlpha,
});

const GPT_IMAGE_2_TRANSPARENT_PLANNER_CAPABILITIES = Object.freeze({
  adapterId: studioGptImage2TransparentSubjectCapabilities.adapterId,
  adapterVersion: studioGptImage2TransparentSubjectCapabilities.adapterVersion,
  maxPhysicalReferences:
    studioGptImage2TransparentSubjectCapabilities.maxPhysicalReferences,
  supportedStages: [
    ...studioGptImage2TransparentSubjectCapabilities.supportedStages,
  ],
  acceptedPrivacyClasses: [
    ...studioGptImage2TransparentSubjectCapabilities.acceptedPrivacyClasses,
  ],
  supportedOutputModes: [
    ...studioGptImage2TransparentSubjectCapabilities.supportedOutputModes,
  ],
  supportedGeneratedArtifactFormats: [
    ...studioGptImage2TransparentSubjectCapabilities
      .supportedGeneratedArtifactFormats,
  ],
  supportedFinalFormats: [
    ...studioGptImage2TransparentSubjectCapabilities.supportedFinalFormats,
  ],
  supportsRequiredAlpha:
    studioGptImage2TransparentSubjectCapabilities.supportsRequiredAlpha,
});

type AtelierImagePipeline = {
  rotate(): AtelierImagePipeline;
  toColourspace(colourspace: "srgb"): AtelierImagePipeline;
  jpeg(options: {
    quality: number;
    chromaSubsampling: "4:4:4";
    mozjpeg: boolean;
  }): AtelierImagePipeline;
  toBuffer(): Promise<Uint8Array>;
};

const createAtelierImagePipeline = sharp as unknown as (
  input: Uint8Array,
) => AtelierImagePipeline;

type ProviderPixelPipeline = {
  toColorspace(space: "srgb"): ProviderPixelPipeline;
  ensureAlpha(): ProviderPixelPipeline;
  raw(): ProviderPixelPipeline;
  toBuffer(options: Readonly<{ resolveWithObject: true }>): Promise<Readonly<{
    data: Uint8Array;
    info: Readonly<{ channels: number }>;
  }>>;
};

const createProviderPixelPipeline = sharp as unknown as (
  input: Uint8Array,
  options: Readonly<{ failOn: "error" }>,
) => ProviderPixelPipeline;

type AtelierDynamicReferenceInput = Readonly<{
  slot: StudioAtelierDynamicReferenceSlot;
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}>;

type GarmentEvidenceStage = Extract<
  AtelierStage,
  | "GARMENT_01_FRONT"
  | "GARMENT_02_BACK"
  | "GARMENT_03_MANNEQUIN"
  | "GARMENT_04_DETAIL"
>;

type StudioAtelierDynamicReferenceSlot =
  | LuluV4DynamicReferenceSlot
  | "GARMENT_BACK_LOCK"
  | "MANNEQUIN_FRONT_LOCK"
  | "FABRIC_DETAIL_LOCK"
  | "DIRECT_GARMENT_EVIDENCE";

const GARMENT_SET_DYNAMIC_SLOTS = Object.freeze([
  "GARMENT_FRONT_LOCK",
  "GARMENT_BACK_LOCK",
  "MANNEQUIN_FRONT_LOCK",
  "FABRIC_DETAIL_LOCK",
] as const);

const GARMENT_EVIDENCE_STAGES = new Set<AtelierStage>([
  "GARMENT_01_FRONT",
  "GARMENT_02_BACK",
  "GARMENT_03_MANNEQUIN",
  "GARMENT_04_DETAIL",
]);

function isGarmentEvidenceStage(stage: AtelierStage): stage is GarmentEvidenceStage {
  return GARMENT_EVIDENCE_STAGES.has(stage);
}

export type ExecuteStudioAtelierInput = Readonly<{
  operatorSubject: string;
  operationId: string;
}>;

export type StudioAtelierNonZdrConsentReceipt = Readonly<{
  schemaVersion: typeof ATELIER_NON_ZDR_CONSENT_SCHEMA_VERSION;
  receiptId: string;
  receiptSha256: string;
  operatorSubject: string;
  operationId: string;
  provider: "openai";
  model: typeof STUDIO_GPT_IMAGE_2_MODEL;
  zeroDataRetention: false;
  providerRetentionAcknowledged: true;
  recordedAt: string;
}>;

export type StudioAtelierExecutionContext = Readonly<{
  dynamicReferences: readonly AtelierDynamicReferenceInput[];
  parentLocks: readonly ParentLock[];
  consentReceipt: StudioAtelierNonZdrConsentReceipt;
  providerSafetyContext: ProviderSafetyContextReceipt;
  directGarmentEvidence?: Readonly<{
    sourceManifest: StudioAtelierDirectGarmentEvidenceManifestAttestation;
    sources: readonly StudioAtelierDirectGarmentEvidenceSource[];
  }>;
}>;

export type ResolveStudioAtelierExecutionContext = (input: Readonly<{
  operatorSubject: string;
  operationId: string;
  requestedParentLocks: readonly AtelierParentLockRequest[];
  dynamicReferenceSlots: readonly StudioAtelierDynamicReferenceSlot[];
  directGarmentEvidence: DirectGarmentEvidenceReceipt | null;
  provider: "openai";
  model: typeof STUDIO_GPT_IMAGE_2_MODEL;
  zeroDataRetention: false;
}>) => Promise<StudioAtelierExecutionContext>;

type RuntimePhysicalReference = Readonly<{
  assetId: string;
  sha256: string;
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}>;

type AtelierExecutionDependencies = Readonly<{
  resolvePack: typeof resolveLuluV4OperationPack;
  fullFrameAdapter: typeof studioGptImage2Adapter;
  transparentSubjectAdapter: typeof studioGptImage2TransparentSubjectAdapter;
  resolveExecutionContext: ResolveStudioAtelierExecutionContext;
  resolveG004Calibration: StudioAtelierG004CalibrationResolver;
  getOperation: typeof getAtelierOperation;
  recoverExpiredExecutions: typeof recoverExpiredAtelierExecutions;
  createExecutionIntent: typeof createAtelierExecutionIntent;
  claimExecution: typeof claimAtelierExecution;
  checkpointInvocationStarted: typeof checkpointAtelierProviderInvocationStarted;
  checkpointProviderResult: typeof checkpointAtelierProviderResult;
  putArtifact: typeof putVerifiedPrivateContentAddressedBlob;
  readArtifact: (artifact: AtelierArtifactRow) => Promise<Uint8Array>;
  recordArtifact: typeof recordAtelierArtifact;
  finalizeExecution: typeof finalizeAtelierExecution;
  getExecution: typeof getAtelierExecution;
  listArtifacts: typeof listAtelierArtifacts;
}>;

type StudioGptImage2Result = Awaited<ReturnType<typeof studioGptImage2Adapter.invoke>>;

const defaultDependencies = Object.freeze({
  resolvePack: resolveLuluV4OperationPack,
  fullFrameAdapter: studioGptImage2Adapter,
  transparentSubjectAdapter: studioGptImage2TransparentSubjectAdapter,
  resolveG004Calibration: resolveStudioAtelierG004Calibration,
  getOperation: getAtelierOperation,
  recoverExpiredExecutions: recoverExpiredAtelierExecutions,
  createExecutionIntent: createAtelierExecutionIntent,
  claimExecution: claimAtelierExecution,
  checkpointInvocationStarted: checkpointAtelierProviderInvocationStarted,
  checkpointProviderResult: checkpointAtelierProviderResult,
  putArtifact: putVerifiedPrivateContentAddressedBlob,
  readArtifact: readAtelierArtifactBytes,
  recordArtifact: recordAtelierArtifact,
  finalizeExecution: finalizeAtelierExecution,
  getExecution: getAtelierExecution,
  listArtifacts: listAtelierArtifacts,
}) satisfies Omit<AtelierExecutionDependencies, "resolveExecutionContext">;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function invalidRequest(message: string, recovery: string): never {
  throw new StudioEngineError("INVALID_REQUEST", 400, message, recovery);
}

function parseExecutionInput(raw: unknown): ExecuteStudioAtelierInput {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return invalidRequest(
      "The Atelier generation command is invalid.",
      "Send only the prepared operation ID from an authenticated operator session.",
    );
  }
  const record = raw as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  if (
    keys.length !== 2
    || keys[0] !== "operationId"
    || keys[1] !== "operatorSubject"
    || typeof record.operatorSubject !== "string"
    || record.operatorSubject.trim().length === 0
    || record.operatorSubject.length > 500
    || typeof record.operationId !== "string"
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(record.operationId)
  ) {
    return invalidRequest(
      "The Atelier generation command may contain only operatorSubject and operationId.",
      "Remove prompts, models, attempts, references, hashes and review state from the command.",
    );
  }
  return Object.freeze({
    operatorSubject: record.operatorSubject,
    operationId: record.operationId,
  });
}

type StudioAtelierNonZdrConsentReceiptBody = Omit<
  StudioAtelierNonZdrConsentReceipt,
  "receiptSha256"
>;

export function deriveStudioAtelierConsentReceiptHash(
  receipt: StudioAtelierNonZdrConsentReceiptBody,
): string {
  return sha256(new TextEncoder().encode(canonicalStringify(receipt)));
}

function requireExactConsentReceipt(input: {
  value: unknown;
  operatorSubject: string;
  operationId: string;
}): StudioAtelierNonZdrConsentReceipt {
  if (!input.value || typeof input.value !== "object" || Array.isArray(input.value)) {
    return invalidRequest(
      "A durable provider-retention consent receipt is required.",
      "Record non-ZDR consent server-side before generation.",
    );
  }
  const receipt = input.value as Record<string, unknown>;
  const expectedKeys = [
    "model",
    "operationId",
    "operatorSubject",
    "provider",
    "providerRetentionAcknowledged",
    "receiptId",
    "receiptSha256",
    "recordedAt",
    "schemaVersion",
    "zeroDataRetention",
  ];
  const recordedAt = typeof receipt.recordedAt === "string"
    ? new Date(receipt.recordedAt)
    : null;
  if (
    Object.keys(receipt).sort().some((key, index) => key !== expectedKeys[index])
    || Object.keys(receipt).length !== expectedKeys.length
    || receipt.schemaVersion !== ATELIER_NON_ZDR_CONSENT_SCHEMA_VERSION
    || typeof receipt.receiptId !== "string"
    || !/^[a-zA-Z0-9._:/-]{1,180}$/.test(receipt.receiptId)
    || typeof receipt.receiptSha256 !== "string"
    || !/^[a-f0-9]{64}$/.test(receipt.receiptSha256)
    || receipt.operatorSubject !== input.operatorSubject
    || receipt.operationId !== input.operationId
    || receipt.provider !== "openai"
    || receipt.model !== STUDIO_GPT_IMAGE_2_MODEL
    || receipt.zeroDataRetention !== false
    || receipt.providerRetentionAcknowledged !== true
    || !recordedAt
    || Number.isNaN(recordedAt.getTime())
    || recordedAt.toISOString() !== receipt.recordedAt
  ) {
    return invalidRequest(
      "The durable provider-retention consent receipt is malformed or does not bind this operation.",
      "Resolve the exact server-owned consent receipt for this operator, operation, provider and model.",
    );
  }
  const typed = receipt as StudioAtelierNonZdrConsentReceipt;
  const { receiptSha256, ...body } = typed;
  if (deriveStudioAtelierConsentReceiptHash(body) !== receiptSha256) {
    return invalidRequest(
      "The durable provider-retention consent receipt failed its content hash.",
      "Restore the exact immutable consent record before generation.",
    );
  }
  return typed;
}

async function readAtelierArtifactBytes(artifact: AtelierArtifactRow): Promise<Uint8Array> {
  const result = await getShopBlob("private", artifact.blobPathname, { useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new Error(`The private Atelier artifact is unavailable: ${artifact.id}.`);
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (
    bytes.byteLength !== artifact.byteSize
    || result.blob.size !== artifact.byteSize
    || sha256(bytes) !== artifact.sha256
  ) {
    throw new Error(`The private Atelier artifact failed content-addressed verification: ${artifact.id}.`);
  }
  return bytes;
}

function referenceKey(reference: Pick<RuntimePhysicalReference, "assetId" | "sha256">): string {
  return `${reference.assetId}:${reference.sha256}`;
}

function assertNotG004EvaluatorOnlyReference(
  reference: Readonly<{ assetId: string; sha256: string }>,
): void {
  if (!studioAtelierG004ProviderDenial(reference)) return;
  throw new StudioEngineError(
    "INVALID_ASSET",
    503,
    "A G004 positive-target asset was denied before provider transport.",
    "Remove evaluator-only calibration assets from operation authority, parents and provider bindings.",
  );
}

async function assertNotG004EvaluatorOnlyPixels(
  reference: Readonly<{ bytes: Uint8Array }>,
  visualTargets: readonly StudioAtelierG004VisualDenialTarget[],
): Promise<void> {
  let decoded: Awaited<ReturnType<ProviderPixelPipeline["toBuffer"]>>;
  try {
    decoded = await createProviderPixelPipeline(reference.bytes, { failOn: "error" })
      .toColorspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
  } catch {
    // Decodability is enforced by the existing authority-specific verification
    // path. This guard is solely an additional no-laundering comparison.
    return;
  }
  if (
    decoded.info.channels === 4
    && isStudioAtelierG004ProviderPixelDenied(sha256(decoded.data))
  ) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "A byte-renamed G004 positive-target frame was denied before provider transport.",
      "Use G004 only through the evaluator calibration boundary.",
    );
  }
  if (await studioAtelierG004VisualDuplicate(reference.bytes, visualTargets)) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "A visually duplicated G004 positive-target frame was denied before provider transport.",
      "Use G004 only through the evaluator calibration boundary.",
    );
  }
}

function maxPrivacy(authorities: readonly AuthorityAsset[]): AuthorityAsset["privacyClass"] {
  const rank = { PUBLIC: 0, PRIVATE_OPERATOR: 1, PRIVATE_IDENTITY: 2 } as const;
  return authorities.reduce<AuthorityAsset["privacyClass"]>(
    (current, authority) => rank[authority.privacyClass] > rank[current]
      ? authority.privacyClass
      : current,
    "PUBLIC",
  );
}

function authorityForComponent(
  operation: AtelierOperation,
  component: { id: string; sha256: string },
): AuthorityAsset {
  const authority = operation.authorityStack.find((candidate) =>
    candidate.assetId === component.id && candidate.sha256 === component.sha256
  );
  if (!authority) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "A packed Lulu authority does not match the canonical operation.",
      "Resolve the operation again from the current private authority revision.",
    );
  }
  return authority;
}

function plannerPacks(
  operation: AtelierOperation,
  references: readonly LuluV4StaticPhysicalReference[],
  authorityRevision: string,
): AttestedReferencePack[] {
  return references.flatMap((reference) => {
    if (reference.packedComponents.length === 0) return [];
    const authorities = reference.packedComponents.map((component) =>
      authorityForComponent(operation, component)
    );
    return [{
      packRole: reference.role as ReferencePackRole,
      assetId: reference.id,
      sha256: reference.sha256,
      privacyClass: maxPrivacy(authorities),
      method: reference.sourceKind === "ATTESTED_ASSET"
        ? "MANIFEST_ATTESTED_BOARD" as const
        : "DETERMINISTIC_COMPOSITE_BOARD" as const,
      attestationId: `lulu-v4:${authorityRevision}:${reference.id}`,
      constituents: authorities.map((authority) => ({
        kind: "AUTHORITY" as const,
        role: authority.role,
        assetId: authority.assetId,
        sha256: authority.sha256,
      })),
    }];
  });
}

function dynamicLogicalAsset(
  operation: AtelierOperation,
  slot: StudioAtelierDynamicReferenceSlot,
): ParentLock | AuthorityAsset {
  if (slot === "DIRECT_GARMENT_EVIDENCE") {
    const authorities = operation.authorityStack.filter((item) =>
      item.role === "DIRECT_GARMENT_EVIDENCE"
    );
    if (authorities.length === 1) return authorities[0]!;
  }
  if (slot === "GARMENT_FRONT_LOCK") {
    if (operation.stage === "ROOM_FINAL_05") {
      const authority = operation.authorityStack.find((item) => item.role === "GARMENT_FRONT_SAFEGUARD");
      if (authority) return authority;
    } else {
      const parent = operation.parentLocks.find((item) => item.role === "GARMENT_FRONT_LOCK");
      if (parent) return parent;
    }
  }
  if (
    slot === "GARMENT_BACK_LOCK"
    || slot === "MANNEQUIN_FRONT_LOCK"
    || slot === "FABRIC_DETAIL_LOCK"
  ) {
    const parent = operation.parentLocks.find((item) => item.role === slot);
    if (parent) return parent;
  }
  if (slot === "ELIGIBLE_PASS_A_PARENT") {
    const donor = operation.authorityStack.find((item) => item.role === "SUBJECT_A_TRANSLATION_DONOR");
    if (donor) return donor;
  }
  if (slot === "ACCEPTED_SUBJECT_LOCK") {
    const parent = operation.parentLocks.find((item) => item.role === "ACCEPTED_SUBJECT_LOCK");
    if (parent) return parent;
  }
  if (slot === "ACCEPTED_CURRENT_GARMENT_05") {
    const parent = operation.parentLocks.find((item) => item.role === "ACCEPTED_05");
    if (parent) return parent;
  }
  throw new StudioEngineError(
    "INVALID_ASSET",
    503,
    `The ${slot} binding is absent from the canonical operation.`,
    "Resolve the exact locked parent before generating.",
  );
}

function runtimeReferences(input: {
  operation: AtelierOperation;
  dynamicSlots: readonly StudioAtelierDynamicReferenceSlot[];
  dynamicReferences: readonly AtelierDynamicReferenceInput[];
  staticReferences: readonly LuluV4StaticPhysicalReference[];
  garmentSetBoard: StudioAtelierGarmentSetBoard | null;
  directGarmentEvidencePack: StudioAtelierDirectGarmentEvidencePack | null;
}): RuntimePhysicalReference[] {
  if (
    input.dynamicReferences.length !== input.dynamicSlots.length
    || !input.dynamicSlots.every((slot, index) => input.dynamicReferences[index]?.slot === slot)
  ) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The ordered dynamic authority bindings are incomplete.",
      `Bind exactly: ${input.dynamicSlots.join(", ")}.`,
    );
  }
  const dynamic = input.dynamicReferences.map((reference) => {
    const logical = dynamicLogicalAsset(input.operation, reference.slot);
    if (sha256(reference.bytes) !== logical.sha256) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        `The ${reference.slot} bytes do not match the locked operation.`,
        "Restore the exact accepted parent before generating.",
      );
    }
    return Object.freeze({
      slot: reference.slot,
      assetId: logical.assetId,
      sha256: logical.sha256,
      bytes: reference.bytes,
      mimeType: reference.mimeType,
    });
  });
  const fixed = input.staticReferences.map((reference) => Object.freeze({
    assetId: reference.id,
    sha256: reference.sha256,
    bytes: reference.bytes,
    mimeType: reference.mimeType,
  }));
  const packedSlots = input.garmentSetBoard
    ? new Set<StudioAtelierDynamicReferenceSlot>(GARMENT_SET_DYNAMIC_SLOTS)
    : new Set<StudioAtelierDynamicReferenceSlot>();
  const packed = input.garmentSetBoard
    ? [Object.freeze({
      assetId: input.garmentSetBoard.pack.assetId,
      sha256: input.garmentSetBoard.pack.sha256,
      bytes: input.garmentSetBoard.bytes,
      mimeType: input.garmentSetBoard.mimeType,
    })]
    : [];
  const directGarmentEvidence = input.directGarmentEvidencePack
    ? [Object.freeze({
      assetId: input.directGarmentEvidencePack.receipt.output.assetId,
      sha256: input.directGarmentEvidencePack.receipt.output.sha256,
      bytes: input.directGarmentEvidencePack.bytes,
      mimeType: input.directGarmentEvidencePack.mimeType,
    })]
    : [];
  return [
    ...dynamic
      .filter((reference) => !packedSlots.has(reference.slot))
      .map((reference) => Object.freeze({
        assetId: reference.assetId,
        sha256: reference.sha256,
        bytes: reference.bytes,
        mimeType: reference.mimeType,
      })),
    ...packed,
    ...directGarmentEvidence,
    ...fixed,
  ];
}

async function bindProviderReferences(
  bindings: readonly PhysicalReferenceBinding[],
  runtime: readonly RuntimePhysicalReference[],
  visualTargets: readonly StudioAtelierG004VisualDenialTarget[],
): Promise<StudioGptImage2Reference[]> {
  for (const binding of bindings) {
    assertNotG004EvaluatorOnlyReference(binding);
    binding.constituents.forEach(assertNotG004EvaluatorOnlyReference);
  }
  runtime.forEach(assertNotG004EvaluatorOnlyReference);
  await Promise.all(runtime.map((reference) =>
    assertNotG004EvaluatorOnlyPixels(reference, visualTargets)
  ));
  const byKey = new Map(runtime.map((reference) => [referenceKey(reference), reference]));
  if (byKey.size !== runtime.length) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The resolved authority pack contains duplicate physical bytes.",
      "Recompile the current private authority pack.",
    );
  }
  const ordered = bindings.map((binding) => {
    const reference = byKey.get(referenceKey(binding));
    if (!reference) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        `The ${binding.physicalRole} provider binding is unresolved.`,
        "Resolve every exact packed and dynamic authority before generating.",
      );
    }
    return {
      slot: `IMAGE_${binding.slot}`,
      role: binding.physicalRole,
      assetId: binding.assetId,
      sha256: binding.sha256,
      bytes: Uint8Array.from(reference.bytes),
      mimeType: reference.mimeType,
    };
  });
  if (new Set(ordered.map((reference) => referenceKey(reference))).size !== ordered.length) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "One physical authority was bound more than once.",
      "Recompile the canonical operation.",
    );
  }
  if (ordered.length !== runtime.length) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The resolved authority pack contains an unbound physical reference.",
      "Recompile the operation without dropping any authority.",
    );
  }
  return ordered;
}

function preflightLockedRoomAuthority(
  operation: AtelierOperation,
  staticReferences: readonly LuluV4StaticPhysicalReference[],
): LuluV4StaticPhysicalReference {
  const matchingAuthorities = operation.authorityStack.filter((authority) =>
    authority.role === "LOCKED_ATELIER_ROOM"
  );
  if (matchingAuthorities.length !== 1) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The canonical operation does not resolve exactly one locked room authority.",
      "Prepare the operation again from the current trusted room manifest.",
    );
  }
  const [authority] = matchingAuthorities;
  const matchingReferences = staticReferences.filter((reference) =>
    reference.id === authority.assetId && reference.sha256 === authority.sha256
  );
  if (matchingReferences.length !== 1) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The exact locked room bytes are absent from the server-resolved operation pack.",
      "Restore the room asset by its approved ID and hash; do not substitute or resize it.",
    );
  }
  const [room] = matchingReferences;
  const compositePolicy = operation.outputContract.mode
    === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
    ? operation.outputContract.deterministicComposite
    : null;
  const canvasPolicyRevision = compositePolicy
    && "canvasPolicyRevision" in compositePolicy
    && typeof compositePolicy.canvasPolicyRevision === "string"
    ? compositePolicy.canvasPolicyRevision
    : null;
  preflightStudioAtelierSubjectComposite({
    mimeType: room.mimeType,
    sha256: room.sha256,
    width: room.width,
    height: room.height,
  }, canvasPolicyRevision);
  return room;
}

function executionParameters(input: {
  operationKind: AtelierStage;
  authorityRevision: string;
  outputMode: AtelierOperation["outputContract"]["mode"];
  consentReceipt: StudioAtelierNonZdrConsentReceipt;
  providerSafetyContext: ProviderSafetyContextReceipt;
  canvasPolicyRevision: string | null;
  semanticOperationHash: string;
}) {
  const transparent = input.outputMode
    === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE";
  return {
    semanticOperationHash: input.semanticOperationHash,
    adapterId: transparent
      ? STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER
      : STUDIO_GPT_IMAGE_2_ADAPTER,
    adapterVersion: transparent
      ? STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION
      : STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
    provider: "openai",
    model: STUDIO_GPT_IMAGE_2_MODEL,
    modelRevision: GPT_IMAGE_2_MODEL_REVISION,
    preprocessingVersion: ATELIER_PREPROCESSING_VERSION,
    seed: null,
    sampler: null,
    providerPolicyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
    size: STUDIO_GPT_IMAGE_2_SIZE,
    n: 1,
    quality: STUDIO_GPT_IMAGE_2_QUALITY,
    outputMode: input.outputMode,
    outputFormat: transparent ? "png" : "jpeg",
    background: transparent ? "transparent" : "opaque",
    maxRetries: 0,
    authorityRevision: input.authorityRevision,
    operationKind: input.operationKind,
    zeroDataRetention: false,
    providerRetentionAcknowledged: true,
    consentReceiptId: input.consentReceipt.receiptId,
    consentReceiptSha256: input.consentReceipt.receiptSha256,
    consentRecordedAt: input.consentReceipt.recordedAt,
    providerSafetyReceiptId: input.providerSafetyContext.receiptId,
    providerSafetyReceiptSha256: input.providerSafetyContext.receiptSha256,
    transparentSubjectProfileId: transparent
      ? STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.profileId
      : null,
    transparentSubjectProfileRevision: transparent
      ? STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION
      : null,
    subjectNormalizationRevision: transparent
      ? STUDIO_ATELIER_SUBJECT_NORMALIZATION_REVISION
      : null,
    deterministicCompositeRevision: transparent
      ? STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION
      : null,
    nativeRoomCanvasPolicyRevision: transparent
      ? input.canvasPolicyRevision
      : null,
    g004ProviderVisualDenialRevision:
      STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
    g004ProviderVisualDenialManifestSha256:
      STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
  };
}

function technicalQuarantineReason(
  result: StudioGptImage2Result,
  outputMode: AtelierOperation["outputContract"]["mode"],
): string | null {
  if (result.images.length !== 1) return "IMAGE_COUNT_MISMATCH";
  if (result.costUsd === null) return "MISSING_GATEWAY_COST";
  if (result.costUsd > STUDIO_GPT_IMAGE_2_COST_CAP_USD) return "COST_CAP_EXCEEDED";
  if (
    !result.usage
    || typeof result.usage !== "object"
    || Array.isArray(result.usage)
    || Object.keys(result.usage).length === 0
  ) {
    return "MISSING_GATEWAY_USAGE";
  }
  if (result.warnings.length > 0) return "PROVIDER_WARNING";
  if (result.servedModels.length === 0) return "SERVED_MODEL_MISSING";
  if (result.servedModels.some((model) => model !== STUDIO_GPT_IMAGE_2_MODEL)) {
    return "SERVED_MODEL_MISMATCH";
  }
  try {
    const image = verifyStudioImage(result.images[0].bytes, result.images[0].mimeType);
    const expectedMimeType = outputMode
      === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
      ? "image/png"
      : "image/jpeg";
    if (
      image.width !== 1024
      || image.height !== 1536
      || image.mimeType !== expectedMimeType
    ) {
      return "OUTPUT_CONTRACT_MISMATCH";
    }
  } catch {
    return "INVALID_PROVIDER_IMAGE";
  }
  return null;
}

async function normalizeAtelierImage(bytes: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await createAtelierImagePipeline(bytes)
    .rotate()
    .toColourspace("srgb")
    .jpeg({ quality: 95, chromaSubsampling: "4:4:4", mozjpeg: true })
    .toBuffer());
}

type StagedRawImage = Readonly<{
  image: StudioGptImage2Result["images"][number];
  blob: VerifiedPrivateBlob;
  width: number | null;
  height: number | null;
}>;

function providerResultManifest(
  result: StudioGptImage2Result,
  staged: readonly StagedRawImage[],
): AtelierProviderResultManifest {
  const stagedByOrdinal = new Map(staged.map((item) => [item.image.ordinal, item]));
  return {
    schemaVersion: "juw.atelier-provider-result.v1",
    requestedModel: result.requestedModel,
    servedModels: [...result.servedModels],
    images: result.images.map((image) => {
      const persisted = stagedByOrdinal.get(image.ordinal);
      if (!persisted) throw new Error("A provider output was not staged in private storage.");
      return {
        ordinal: image.ordinal,
        mimeType: image.mimeType,
        byteSize: image.bytes.byteLength,
        sha256: sha256(image.bytes),
        blob: persisted.blob,
      };
    }),
    ...(typeof result.gatewayGenerationId === "string"
      ? { gatewayGenerationId: result.gatewayGenerationId }
      : {}),
    ...(typeof result.requestId === "string" ? { requestId: result.requestId } : {}),
  };
}

function parseProviderResultManifest(value: unknown): AtelierProviderResultManifest {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("The durable Atelier provider-result manifest is missing.");
  }
  const manifest = value as Partial<AtelierProviderResultManifest>;
  if (
    manifest.schemaVersion !== "juw.atelier-provider-result.v1"
    || typeof manifest.requestedModel !== "string"
    || !Array.isArray(manifest.servedModels)
    || !Array.isArray(manifest.images)
    || manifest.images.length === 0
    || manifest.images.some((image) =>
      !image
      || !Number.isSafeInteger(image.ordinal)
      || typeof image.mimeType !== "string"
      || !Number.isSafeInteger(image.byteSize)
      || typeof image.sha256 !== "string"
      || !image.blob
      || typeof image.blob.pathname !== "string"
      || typeof image.blob.blobUrl !== "string"
      || typeof image.blob.mimeType !== "string"
      || image.blob.byteSize !== image.byteSize
      || image.blob.sha256 !== image.sha256
    )
  ) {
    throw new Error("The durable Atelier provider-result manifest is malformed.");
  }
  return manifest as AtelierProviderResultManifest;
}

async function resultFromDurableRaw(input: {
  dependencies: AtelierExecutionDependencies;
  lease: AtelierExecutionLease;
  execution: AtelierExecutionRow;
  artifacts: readonly AtelierArtifactRow[];
}): Promise<{ result: StudioGptImage2Result; artifacts: AtelierArtifactRow[] }> {
  const manifest = parseProviderResultManifest(input.execution.providerResultManifest);
  const rawByOrdinal = new Map(input.artifacts
    .filter((artifact) => artifact.kind === "PROVIDER_RAW" && artifact.state === "STORED")
    .map((artifact) => [artifact.ordinal, artifact]));
  const images = await Promise.all(manifest.images.map(async (expected) => {
    let artifact = rawByOrdinal.get(expected.ordinal);
    if (!artifact) {
      artifact = await input.dependencies.recordArtifact({
        lease: input.lease,
        ordinal: expected.ordinal,
        kind: "PROVIDER_RAW",
        role: "ATELIER_CANDIDATE",
        blob: expected.blob,
        width: null,
        height: null,
        metadata: {
          requestedModel: manifest.requestedModel,
          servedModels: [...manifest.servedModels],
          usage: input.execution.usage,
          costUsd: input.execution.costUsd,
          warnings: input.execution.warnings,
          responses: input.execution.sanitizedResponses,
          requestIds: input.execution.requestIds,
          durationMs: input.execution.durationMs,
          providerMimeType: expected.mimeType,
          storedMimeType: expected.blob.mimeType,
          recoveredFromProviderResultCheckpoint: true,
          accountingRecordedBeforePolicyGates: true,
        },
      });
      rawByOrdinal.set(expected.ordinal, artifact);
    }
    if (
      artifact.sha256 !== expected.sha256
      || artifact.byteSize !== expected.byteSize
      || artifact.blobPathname !== expected.blob.pathname
    ) {
      throw new Error("The durable raw artifact set does not match the provider-result manifest.");
    }
    const bytes = await input.dependencies.readArtifact(artifact);
    if (bytes.byteLength !== expected.byteSize || sha256(bytes) !== expected.sha256) {
      throw new Error("A durable raw artifact failed its provider-result manifest check.");
    }
    return Object.freeze({
      ordinal: expected.ordinal,
      bytes,
      mimeType: expected.mimeType,
    });
  }));
  const costUsd = input.execution.costUsd === null ? null : Number(input.execution.costUsd);
  const result = Object.freeze({
    requestedModel: STUDIO_GPT_IMAGE_2_MODEL,
    servedModels: Object.freeze([...manifest.servedModels]),
    images: Object.freeze(images),
    usage: Object.freeze(input.execution.usage ?? {}),
    costUsd: Number.isFinite(costUsd) ? costUsd : null,
    warnings: Object.freeze(input.execution.warnings.map((warning) => Object.freeze({
      type: typeof warning.type === "string" ? warning.type : "provider-warning",
      setting: typeof warning.setting === "string" ? warning.setting : null,
      message: typeof warning.message === "string" ? warning.message : null,
    }))),
    responses: Object.freeze(input.execution.sanitizedResponses.map((response) => Object.freeze({
      modelId: typeof response.modelId === "string" ? response.modelId : undefined,
      timestamp: typeof response.timestamp === "string" ? response.timestamp : undefined,
      headers: response.headers && typeof response.headers === "object" && !Array.isArray(response.headers)
        ? response.headers as Record<string, string>
        : {},
    }))),
    gatewayGenerationId: manifest.gatewayGenerationId,
    requestId: manifest.requestId,
    durationMs: input.execution.durationMs ?? 0,
  }) as unknown as StudioGptImage2Result;
  return {
    result,
    artifacts: manifest.images.map((image) => rawByOrdinal.get(image.ordinal)!),
  };
}

async function stageRawImages(input: {
  dependencies: AtelierExecutionDependencies;
  lease: AtelierExecutionLease;
  result: StudioGptImage2Result;
}): Promise<StagedRawImage[]> {
  const uploadAttempts = await Promise.allSettled(input.result.images.map(async (image) => {
    const blob = await input.dependencies.putArtifact({
      bytes: image.bytes,
      mimeType: image.mimeType,
      namespace: `studio/atelier/executions/${input.lease.executionId}/raw`,
      maximumBytes: MAXIMUM_PAID_PROVIDER_OUTPUT_BYTES,
      allowOpaqueFallback: true,
    });
    let width: number | null = null;
    let height: number | null = null;
    try {
      const verified = verifyStudioImage(image.bytes, image.mimeType);
      width = verified.width;
      height = verified.height;
    } catch {
      // Raw paid bytes remain durable even when decode/technical QA fails.
    }
    return { image, blob, width, height };
  }));
  const firstFailure = uploadAttempts.find((attempt) => attempt.status === "rejected");
  if (firstFailure?.status === "rejected") throw firstFailure.reason;
  const staged = uploadAttempts.flatMap((attempt) =>
    attempt.status === "fulfilled" ? [attempt.value] : []
  );
  if (staged.length !== input.result.images.length) {
    throw new Error("Not every paid Atelier output was staged in private storage.");
  }
  return staged;
}

async function recordStagedRawArtifacts(input: {
  dependencies: AtelierExecutionDependencies;
  lease: AtelierExecutionLease;
  result: StudioGptImage2Result;
  staged: readonly StagedRawImage[];
}) {
  const requestIds = [input.result.gatewayGenerationId, input.result.requestId]
    .filter((value): value is string => Boolean(value));
  const recordAttempts = await Promise.allSettled(input.staged.map(({ image, blob, width, height }) =>
    input.dependencies.recordArtifact({
      lease: input.lease,
      ordinal: image.ordinal,
      kind: "PROVIDER_RAW",
      role: "ATELIER_CANDIDATE",
      blob,
      width,
      height,
      metadata: {
        requestedModel: STUDIO_GPT_IMAGE_2_MODEL,
        servedModels: [...input.result.servedModels],
        usage: input.result.usage,
        costUsd: input.result.costUsd,
        warnings: [...input.result.warnings],
        responses: [...input.result.responses],
        requestIds,
        durationMs: input.result.durationMs,
        providerMimeType: image.mimeType,
        storedMimeType: blob.mimeType,
        accountingRecordedBeforePolicyGates: true,
      },
    })
  ));

  const firstFailure = recordAttempts.find((attempt) => attempt.status === "rejected");
  if (firstFailure?.status === "rejected") throw firstFailure.reason;

  const artifacts = recordAttempts.flatMap((attempt) =>
    attempt.status === "fulfilled" ? [attempt.value] : []
  );
  if (artifacts.length !== input.result.images.length) {
    throw new Error("Not every paid Atelier output has a durable raw artifact row.");
  }
  return artifacts;
}

async function finalizeInvocationFailure(input: {
  dependencies: AtelierExecutionDependencies;
  lease: AtelierExecutionLease;
  error: unknown;
}) {
  const gatewayError = input.error instanceof StudioGatewayError ? input.error : null;
  if (gatewayError?.upstream.providerCode === "moderation_blocked") {
    const moderation = gatewayError.upstream.moderation;
    const moderationStage = moderation?.stage === "input" || moderation?.stage === "output"
      ? moderation.stage
      : "unknown";
    const categoryOrder = [
      "sexual",
      "violence",
      "self_harm",
      "hate",
      "harassment",
      "illicit",
    ] as const satisfies readonly AtelierProviderModerationCategory[];
    const reportedCategories = new Set(moderation?.categories ?? []);
    const categories = categoryOrder.filter((category) => reportedCategories.has(category));
    const providerFailureManifest = createAtelierProviderFailureManifest({
      requestedModel: gatewayError.upstream.model,
      moderationStage,
      categories,
      gatewayGenerationId: gatewayError.upstream.generationId,
      requestId: gatewayError.upstream.requestId,
    });
    return input.dependencies.finalizeExecution({
      lease: input.lease,
      state: "FAILED",
      providerFailureManifest,
      usage: gatewayError.accounting.usage,
      costUsd: gatewayError.accounting.costUsd,
      requestIds: [gatewayError.upstream.generationId, gatewayError.upstream.requestId]
        .filter((value): value is string => Boolean(value)),
      durationMs: gatewayError.durationMs,
      errorCode: `PROVIDER_MODERATION_BLOCKED_${moderationStage.toUpperCase()}`,
      errorMessage: ATELIER_PROVIDER_MODERATION_ERROR_MESSAGE,
    });
  }
  return input.dependencies.finalizeExecution({
    lease: input.lease,
    state: "INDETERMINATE",
    usage: gatewayError?.accounting.usage ?? null,
    costUsd: gatewayError?.accounting.costUsd ?? null,
    requestIds: gatewayError
      ? [gatewayError.upstream.generationId, gatewayError.upstream.requestId]
        .filter((value): value is string => Boolean(value))
      : [],
    durationMs: gatewayError?.durationMs ?? null,
    errorCode: "INDETERMINATE_PROVIDER_RESULT",
    errorMessage: "Dispatch was checkpointed but the provider outcome could not be reconciled; do not retry automatically.",
  });
}

function parentLockRequests(rawOperation: unknown) {
  if (!rawOperation || typeof rawOperation !== "object" || Array.isArray(rawOperation)) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "The stored Atelier operation is not an object.",
      "Prepare the operation again from a validated declaration.",
    );
  }
  const parents = (rawOperation as Record<string, unknown>).parentLocks;
  if (!Array.isArray(parents)) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "The stored Atelier operation has no parent-lock list.",
      "Prepare the operation again from a validated declaration.",
    );
  }
  return parents.map((parent) => {
    if (!parent || typeof parent !== "object" || Array.isArray(parent)) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "A stored Atelier parent declaration is malformed.",
        "Prepare the operation again from a validated declaration.",
      );
    }
    const record = parent as Record<string, unknown>;
    if (
      typeof record.role !== "string"
      || typeof record.assetId !== "string"
      || typeof record.sha256 !== "string"
    ) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "A stored Atelier parent identity is incomplete.",
        "Prepare the operation again from a validated declaration.",
      );
    }
    return {
      role: record.role as ParentLock["role"],
      assetId: record.assetId,
      sha256: record.sha256,
    };
  });
}

function requireExactTrustedParents(
  requested: readonly AtelierParentLockRequest[],
  resolved: unknown,
): readonly ParentLock[] {
  if (!Array.isArray(resolved) || resolved.length !== requested.length) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The current trusted parent-lock set is incomplete.",
      "Resolve every requested parent from the durable LOCKED projection.",
    );
  }
  return resolved.map((candidate, index) => {
    const expected = requested[index];
    if (
      !candidate
      || typeof candidate !== "object"
      || Array.isArray(candidate)
    ) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        "A current trusted parent lock is malformed.",
        "Resolve parent locks from the durable LOCKED projection.",
      );
    }
    const parent = candidate as ParentLock;
    if (
      parent.role !== expected.role
      || parent.assetId !== expected.assetId
      || parent.sha256 !== expected.sha256
      || parent.reviewState !== "LOCKED"
    ) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        "A requested parent is not the exact currently locked artifact.",
        "Prepare a new operation against the current locked parent projection.",
      );
    }
    return parent;
  });
}

function operationWithTrustedParents(rawOperation: unknown, parents: readonly ParentLock[]) {
  return {
    ...(rawOperation as Record<string, unknown>),
    parentLocks: parents,
  };
}

function parseCanonicalOperation(rawOperation: unknown): AtelierOperation {
  try {
    return canonicalAtelierOperation(rawOperation);
  } catch {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "The Atelier operation declaration is invalid.",
      "Rebuild the operation from the current canonical garment state.",
    );
  }
}

function directGarmentEvidencePack(operation: AtelierOperation & {
  stage: GarmentEvidenceStage;
}) {
  const receipt = operation.directGarmentEvidence;
  if (!receipt) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The direct garment evidence receipt is absent from the canonical operation.",
      "Prepare the garment root again from the verified source manifest.",
    );
  }
  return Object.freeze({
    authorityId: "garment-truth" as const,
    revision: `${receipt.recipeVersion}:${receipt.compilerVersion}:${receipt.sourceManifest.revision}`,
    kind: operation.stage,
    view: ATELIER_STAGE_RECIPES[operation.stage].view,
    privacy: "PRIVATE_PRODUCTION_ONLY" as const,
    publishable: false as const,
    status: "DIRECT_GARMENT_EVIDENCE_REQUIRED" as const,
    dynamicReferenceSlots: Object.freeze([] as StudioAtelierDynamicReferenceSlot[]),
    staticReferences: Object.freeze([] as LuluV4StaticPhysicalReference[]),
    staticPhysicalReferenceCount: 0,
    physicalReferenceCount: 1,
    maxPhysicalReferences: STUDIO_GPT_IMAGE_2_MAX_REFERENCES,
    verifiedSourceAssetCount: receipt.constituents.length,
  });
}

function operationDynamicReferenceSlots(
  operation: AtelierOperation,
  resolvedSlots: readonly StudioAtelierDynamicReferenceSlot[],
): readonly StudioAtelierDynamicReferenceSlot[] {
  if (operation.stage !== "SUBJECT_A" && operation.stage !== "SUBJECT_B") {
    return Object.freeze([...resolvedSlots]);
  }
  if (
    resolvedSlots.filter((slot) => slot === "GARMENT_FRONT_LOCK").length !== 1
    || resolvedSlots.some((slot) => (
      slot === "GARMENT_BACK_LOCK"
      || slot === "MANNEQUIN_FRONT_LOCK"
      || slot === "FABRIC_DETAIL_LOCK"
    ))
  ) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The subject operation pack cannot bind the complete garment 01-04 set.",
      "Restore the canonical model-stage operation pack before generation.",
    );
  }
  return Object.freeze(resolvedSlots.flatMap((slot) =>
    slot === "GARMENT_FRONT_LOCK" ? [...GARMENT_SET_DYNAMIC_SLOTS] : [slot]
  ));
}

async function buildGarmentSetBoard(input: Readonly<{
  operation: AtelierOperation;
  dynamicSlots: readonly StudioAtelierDynamicReferenceSlot[];
  dynamicReferences: readonly AtelierDynamicReferenceInput[];
}>): Promise<StudioAtelierGarmentSetBoard | null> {
  if (input.operation.stage !== "SUBJECT_A" && input.operation.stage !== "SUBJECT_B") {
    return null;
  }
  const sources = GARMENT_SET_DYNAMIC_SLOTS.map((role) => {
    const index = input.dynamicSlots.indexOf(role);
    const reference = index >= 0 ? input.dynamicReferences[index] : undefined;
    const parent = input.operation.parentLocks.find((candidate) =>
      candidate.role === role
    );
    if (!reference || reference.slot !== role || !parent || parent.role !== role) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        `The exact ${role} bytes are absent from the subject operation context.`,
        "Restore all four independently accepted garment locks before subject generation.",
      );
    }
    return {
      parent,
      bytes: reference.bytes,
      mimeType: reference.mimeType,
    } as StudioAtelierGarmentSetBoardInput;
  });
  try {
    return await createStudioAtelierGarmentSetBoard(sources);
  } catch {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The exact garment 01-04 locks could not form their deterministic subject reference board.",
      "Verify all four same-garment locks and their content hashes before generation.",
    );
  }
}

async function buildDirectGarmentEvidencePack(input: Readonly<{
  operation: AtelierOperation;
  executionContext: StudioAtelierExecutionContext;
}>): Promise<StudioAtelierDirectGarmentEvidencePack | null> {
  if (!isGarmentEvidenceStage(input.operation.stage)) return null;
  const expectedReceipt = input.operation.directGarmentEvidence;
  const resolved = input.executionContext.directGarmentEvidence;
  if (!expectedReceipt || !resolved) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The server-owned direct garment source context is incomplete.",
      "Resolve every source-manifest constituent before creating paid intent.",
    );
  }
  try {
    return await createStudioAtelierDirectGarmentEvidencePack({
      sourceManifest: resolved.sourceManifest,
      sources: resolved.sources,
      expectedReceipt,
    });
  } catch {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The direct garment evidence pack did not match its constituent-complete receipt.",
      "Restore every exact manifest-attested source capture before generation.",
    );
  }
}

export function createStudioAtelierExecutionService(
  overrides: Pick<AtelierExecutionDependencies, "resolveExecutionContext">
    & Partial<Omit<AtelierExecutionDependencies, "resolveExecutionContext">>,
) {
  if (typeof overrides.resolveExecutionContext !== "function") {
    throw new Error("A server-owned Atelier execution-context resolver is required.");
  }
  const dependencies = Object.freeze({
    ...defaultDependencies,
    ...overrides,
  }) as AtelierExecutionDependencies;
  return async function execute(rawInput: ExecuteStudioAtelierInput) {
    const input = parseExecutionInput(rawInput);
    // Demand-drive expired work before resolving authority or creating/claiming
    // an intent. Safe pre-dispatch and complete-raw work becomes claimable;
    // uncertain dispatch is terminalized and therefore cannot spend again.
    await dependencies.recoverExpiredExecutions({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
    });
    const operationRow = await dependencies.getOperation({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
    });
    if (!operationRow) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        404,
        "The prepared Atelier operation was not found.",
        "Prepare and persist the validated operation before generation.",
      );
    }
    const declaredOperation = parseCanonicalOperation(operationRow.canonicalOperation);
    let g004VisualDenialTargets: readonly StudioAtelierG004VisualDenialTarget[];
    try {
      const calibration = await verifyStudioAtelierG004Calibration(
        await dependencies.resolveG004Calibration(),
      );
      g004VisualDenialTargets = await verifyStudioAtelierG004VisualDenialTargets(
        calibration.assets,
      );
    } catch {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        "The G004 provider visual-denial calibration failed exact readback.",
        "Restore the version-locked G004 denial calibration before provider transport.",
      );
    }
    const resolved = isGarmentEvidenceStage(declaredOperation.stage)
      ? directGarmentEvidencePack(declaredOperation as AtelierOperation & {
        stage: GarmentEvidenceStage;
      })
      : await dependencies.resolvePack(
        declaredOperation.stage as LuluV4OperationKind,
      );
    const dynamicReferenceSlots = operationDynamicReferenceSlots(
      declaredOperation,
      resolved.dynamicReferenceSlots,
    );
    const requestedParents = parentLockRequests(operationRow.canonicalOperation);
    const executionContext = await dependencies.resolveExecutionContext({
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
      requestedParentLocks: requestedParents,
      dynamicReferenceSlots,
      directGarmentEvidence: declaredOperation.directGarmentEvidence ?? null,
      provider: "openai",
      model: STUDIO_GPT_IMAGE_2_MODEL,
      zeroDataRetention: false,
    });
    if (
      !executionContext
      || typeof executionContext !== "object"
      || !Array.isArray(executionContext.dynamicReferences)
    ) {
      throw new StudioEngineError(
        "INVALID_ASSET",
        503,
        "The server-owned Atelier execution context is incomplete.",
        "Resolve current parent bytes and durable provider consent before generation.",
      );
    }
    await Promise.all([
      ...executionContext.dynamicReferences.map((reference) =>
        assertNotG004EvaluatorOnlyPixels(reference, g004VisualDenialTargets)
      ),
      ...(executionContext.directGarmentEvidence?.sources ?? [])
        .map((reference) =>
          assertNotG004EvaluatorOnlyPixels(reference, g004VisualDenialTargets)
        ),
    ]);
    const trustedParents = requireExactTrustedParents(
      requestedParents,
      executionContext.parentLocks,
    );
    const consentReceipt = requireExactConsentReceipt({
      value: executionContext.consentReceipt,
      operatorSubject: input.operatorSubject,
      operationId: input.operationId,
    });
    const providerSafetyContext = validateProviderSafetyContextReceipt(
      executionContext.providerSafetyContext,
      {
        semanticOperationHash: operationRow.semanticHash,
        stage: declaredOperation.stage,
      },
    );
    const operation = parseCanonicalOperation(operationWithTrustedParents(
      operationRow.canonicalOperation,
      trustedParents,
    ));
    if (operation.stage !== resolved.kind || operation.view !== resolved.view) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        400,
        "The resolved authority pack does not match the canonical stage and view.",
        "Rebuild the canonical operation from the current garment stage.",
      );
    }
    const transparent = operation.outputContract.mode
      === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE";
    const selectedAdapter = transparent
      ? dependencies.transparentSubjectAdapter
      : dependencies.fullFrameAdapter;
    const directEvidencePack = await buildDirectGarmentEvidencePack({
      operation,
      executionContext,
    });
    // This must remain before execution intent/claim: an incompatible locked
    // room is a deterministic authority failure and must spend zero dollars.
    const lockedRoom = transparent
      ? preflightLockedRoomAuthority(operation, resolved.staticReferences)
      : null;
    const garmentSetBoard = await buildGarmentSetBoard({
      operation,
      dynamicSlots: dynamicReferenceSlots,
      dynamicReferences: executionContext.dynamicReferences,
    });
    const packs = [
      ...plannerPacks(operation, resolved.staticReferences, resolved.revision),
      ...(garmentSetBoard ? [garmentSetBoard.pack] : []),
    ];
    const plan = planAtelierOperation({
      operation,
      adapter: transparent
        ? GPT_IMAGE_2_TRANSPARENT_PLANNER_CAPABILITIES
        : GPT_IMAGE_2_PLANNER_CAPABILITIES,
      packs,
    });
    const compiledPrompt = compileAtelierPrompt({
      operation: plan.operation,
      orderedReferences: plan.orderedReferences,
      providerSafetyContext,
    });
    const runtime = runtimeReferences({
      operation: plan.operation,
      dynamicSlots: dynamicReferenceSlots,
      dynamicReferences: executionContext.dynamicReferences,
      staticReferences: resolved.staticReferences,
      garmentSetBoard,
      directGarmentEvidencePack: directEvidencePack,
    });
    const providerReferences = await bindProviderReferences(
      plan.orderedReferences,
      runtime,
      g004VisualDenialTargets,
    );
    const parameters = executionParameters({
      operationKind: operation.stage,
      authorityRevision: resolved.revision,
      outputMode: operation.outputContract.mode,
      consentReceipt,
      providerSafetyContext,
      canvasPolicyRevision: operation.outputContract.mode
        === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
        && "canvasPolicyRevision" in operation.outputContract.deterministicComposite
        ? STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION
        : null,
      semanticOperationHash: plan.semanticOperationHash,
    });
    const executionIdentity = {
      semanticOperationHash: parameters.semanticOperationHash,
      adapterId: parameters.adapterId,
      adapterVersion: parameters.adapterVersion,
      provider: parameters.provider,
      model: parameters.model,
      modelRevision: parameters.modelRevision,
      compiledPrompt: compiledPrompt.text,
      orderedReferences: plan.orderedReferences,
      preprocessingVersion: parameters.preprocessingVersion,
      seed: parameters.seed,
      sampler: parameters.sampler,
      parameters,
      providerPolicyRevision: parameters.providerPolicyRevision,
    };
    const executionDigest = executionHash(executionIdentity);
    if (
      plan.semanticOperationHash !== operationRow.semanticHash
      || plan.operationId !== operationRow.operationKey
    ) {
      throw new StudioEngineError(
        "INVALID_REQUEST",
        409,
        "The prepared Atelier operation no longer matches its canonical hash.",
        "Prepare the validated declaration again before generation.",
      );
    }
    const durableOrderedBindings = JSON.parse(
      canonicalStringify(plan.orderedReferences),
    ) as Array<Record<string, unknown>>;
    const execution = await dependencies.createExecutionIntent({
      operationId: operationRow.id,
      attempt: EXECUTION_ATTEMPT,
      adapter: parameters.adapterId,
      model: parameters.model,
      executionHash: executionDigest,
      promptVersion: ATELIER_PROMPT_VERSION,
      compiledPrompt: compiledPrompt.text,
      promptHash: compiledPrompt.sha256,
      orderedBindings: durableOrderedBindings,
      parameters,
    });
    if (["COMPLETE", "QUARANTINED", "INDETERMINATE", "FAILED"].includes(execution.state)) {
      return {
        operation: operationRow,
        execution,
        artifacts: await dependencies.listArtifacts(execution.id),
        reused: true,
      };
    }
    const lease = await dependencies.claimExecution(execution.id);
    if (!lease) {
      return {
        operation: operationRow,
        execution: await dependencies.getExecution(execution.id),
        artifacts: await dependencies.listArtifacts(execution.id),
        reused: true,
      };
    }

    let result: StudioGptImage2Result;
    let rawArtifacts: AtelierArtifactRow[];
    let resumedFromRaw = false;
    const claimedExecution = await dependencies.getExecution(execution.id);
    if (!claimedExecution) throw new Error("The claimed Atelier execution was not readable.");
    if (claimedExecution.providerResultReceivedAt && claimedExecution.providerResultManifest) {
      try {
        const durableRaw = await resultFromDurableRaw({
          dependencies,
          lease,
          execution: claimedExecution,
          artifacts: await dependencies.listArtifacts(execution.id),
        });
        result = durableRaw.result;
        rawArtifacts = durableRaw.artifacts;
      } catch (error) {
        await dependencies.finalizeExecution({
          lease,
          state: "INDETERMINATE",
          usage: claimedExecution.usage,
          costUsd: claimedExecution.costUsd,
          warnings: claimedExecution.warnings,
          responses: claimedExecution.sanitizedResponses,
          requestIds: claimedExecution.requestIds,
          durationMs: claimedExecution.durationMs,
          errorCode: "DURABLE_RAW_RESUME_FAILED",
          errorMessage: "The checkpointed private provider byte set could not be verified; do not invoke again.",
        }).catch(() => undefined);
        throw error;
      }
      resumedFromRaw = true;
    } else {
      const dispatchCheckpointed = await dependencies.checkpointInvocationStarted(lease);
      if (!dispatchCheckpointed) {
        throw new StudioEngineError(
          "ENGINE_UNAVAILABLE",
          503,
          "The provider dispatch checkpoint could not acquire the execution fence.",
          "Do not invoke the provider; recover or inspect the existing execution.",
        );
      }
      try {
        result = await selectedAdapter.invoke({
          executionId: execution.id,
          garmentId: plan.operation.garmentId,
          view: plan.operation.view,
          operationType: plan.operation.stage,
          prompt: compiledPrompt.text,
          references: providerReferences,
          operatorSubject: input.operatorSubject,
          privacy: {
            containsPrivateIdentity: providerReferences.some((reference, index) =>
              plan.orderedReferences[index]?.privacyClass === "PRIVATE_IDENTITY"
            ),
            providerRetentionAcknowledged: true,
            approvalRecordedAt: consentReceipt.recordedAt,
          },
        });
      } catch (error) {
        await finalizeInvocationFailure({ dependencies, lease, error }).catch(() => undefined);
        throw error;
      }

      let stagedRaw: StagedRawImage[];
      try {
        // The provider has no remote lookup/idempotency contract. Exact paid
        // bytes therefore enter deterministic private storage before the DB
        // result checkpoint declares them recoverable.
        stagedRaw = await stageRawImages({ dependencies, lease, result });
      } catch (error) {
        await dependencies.finalizeExecution({
          lease,
          state: "INDETERMINATE",
          usage: result.usage,
          costUsd: result.costUsd,
          warnings: [...result.warnings],
          responses: [...result.responses],
          requestIds: [result.gatewayGenerationId, result.requestId]
            .filter((value): value is string => Boolean(value)),
          durationMs: result.durationMs,
          errorCode: "RAW_BYTES_PERSISTENCE_FAILED",
          errorMessage: "Provider output returned, but the exact private byte set could not be confirmed.",
        }).catch(() => undefined);
        throw error;
      }

      let resultCheckpointed = false;
      try {
        resultCheckpointed = await dependencies.checkpointProviderResult({
          lease,
          manifest: providerResultManifest(result, stagedRaw),
          usage: result.usage,
          costUsd: result.costUsd,
          warnings: [...result.warnings],
          responses: [...result.responses],
          requestIds: [result.gatewayGenerationId, result.requestId]
            .filter((value): value is string => Boolean(value)),
          durationMs: result.durationMs,
        });
      } catch {
        resultCheckpointed = false;
      }
      if (!resultCheckpointed) {
        await dependencies.finalizeExecution({
          lease,
          state: "INDETERMINATE",
          usage: result.usage,
          costUsd: result.costUsd,
          warnings: [...result.warnings],
          responses: [...result.responses],
          requestIds: [result.gatewayGenerationId, result.requestId]
            .filter((value): value is string => Boolean(value)),
          durationMs: result.durationMs,
          errorCode: "RESULT_CHECKPOINT_FAILED",
          errorMessage: "Provider bytes were retained content-addressed, but the result checkpoint did not commit.",
        }).catch(() => undefined);
        throw new StudioEngineError(
          "ENGINE_UNAVAILABLE",
          503,
          "The provider result checkpoint could not commit.",
          "Do not invoke again; reconcile the retained private bytes.",
        );
      }
      rawArtifacts = await recordStagedRawArtifacts({
        dependencies,
        lease,
        result,
        staged: stagedRaw,
      });
    }
    try {
      // Blob bytes, artifact rows and accounting evidence are durable before
      // any cost, decode, model or output-contract decision is evaluated.
      const quarantineReason = technicalQuarantineReason(
        result,
        operation.outputContract.mode,
      );
      if (quarantineReason) {
        const terminal = await dependencies.finalizeExecution({
          lease,
          state: rawArtifacts.length > 0 ? "QUARANTINED" : "INDETERMINATE",
          usage: result.usage,
          costUsd: result.costUsd,
          warnings: [...result.warnings],
          responses: [...result.responses],
          requestIds: [result.gatewayGenerationId, result.requestId].filter((value): value is string => Boolean(value)),
          durationMs: result.durationMs,
          errorCode: quarantineReason,
          errorMessage: "The paid output was retained privately but failed an accounting or technical gate.",
        });
        return { operation: operationRow, execution: terminal, artifacts: rawArtifacts, reused: false };
      }

      const existingArtifacts = resumedFromRaw
        ? await dependencies.listArtifacts(execution.id)
        : rawArtifacts;
      let materializedArtifact: AtelierArtifactRow;
      let supportingArtifacts: AtelierArtifactRow[] = [];
      if (transparent) {
        if (!lockedRoom) throw new Error("The transparent operation lost its preflighted room.");
        const existingSubject = existingArtifacts.find((artifact) =>
          artifact.kind === "SUBJECT_LAYER" && artifact.state === "STORED"
        );
        const existingComposite = existingArtifacts.find((artifact) =>
          artifact.kind === "COMPOSITE" && artifact.state === "STORED"
        );
        let normalizedSubject: Awaited<
          ReturnType<typeof normalizeStudioAtelierSubjectLayer>
        >;
        try {
          if (existingSubject) {
            if (existingSubject.mimeType !== "image/png") {
              throw new Error("The durable subject-layer MIME type is invalid.");
            }
            const existingBytes = await dependencies.readArtifact(existingSubject);
            normalizedSubject = await normalizeStudioAtelierSubjectLayer({
              bytes: existingBytes,
              mimeType: "image/png",
              sha256: existingSubject.sha256,
            });
            if (normalizedSubject.sha256 !== existingSubject.sha256) {
              throw new Error("The durable subject layer is not canonically normalized.");
            }
          } else {
            const source = result.images[0];
            if (source.mimeType !== "image/png") {
              throw new StudioEngineError(
                "INVALID_ASSET",
                422,
                "The subject candidate is not a PNG.",
                "Keep the paid bytes private and require the transparent subject profile.",
              );
            }
            normalizedSubject = await normalizeStudioAtelierSubjectLayer({
              bytes: source.bytes,
              mimeType: "image/png",
              sha256: sha256(source.bytes),
            });
          }
        } catch (error) {
          if (!existingSubject && error instanceof StudioEngineError) {
            const terminal = await dependencies.finalizeExecution({
              lease,
              state: "QUARANTINED",
              usage: result.usage,
              costUsd: result.costUsd,
              warnings: [...result.warnings],
              responses: [...result.responses],
              requestIds: [result.gatewayGenerationId, result.requestId]
                .filter((value): value is string => Boolean(value)),
              durationMs: result.durationMs,
              errorCode: "SUBJECT_LAYER_TECHNICAL_GATE_FAILED",
              errorMessage:
                "The paid PNG was retained privately but failed transparent subject-layer gates.",
            });
            return {
              operation: operationRow,
              execution: terminal,
              artifacts: rawArtifacts,
              reused: false,
            };
          }
          throw error;
        }
        const subjectArtifact = existingSubject ?? await (async () => {
          const subjectBlob = await dependencies.putArtifact({
            bytes: normalizedSubject.bytes,
            mimeType: normalizedSubject.mimeType,
            namespace: `studio/atelier/executions/${lease.executionId}/subject-layer`,
          });
          return dependencies.recordArtifact({
            lease,
            ordinal: 0,
            kind: "SUBJECT_LAYER",
            role: "ATELIER_SUBJECT_CANDIDATE",
            blob: subjectBlob,
            width: normalizedSubject.width,
            height: normalizedSubject.height,
            metadata: {
              sourceRawOrdinal: 0,
              sourceRawSha256: normalizedSubject.sourceSha256,
              normalizationRevision: normalizedSubject.normalizationRevision,
              transparentSubjectProfileId:
                STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.profileId,
              transparentSubjectProfileRevision:
                STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
              deterministicCompositeRevision:
                STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
              inspection: normalizedSubject.inspection,
            },
          });
        })();
        let composite: Awaited<ReturnType<typeof compositeStudioAtelierSubject>>;
        try {
          composite = await compositeStudioAtelierSubject({
            room: {
              bytes: lockedRoom.bytes,
              mimeType: lockedRoom.mimeType,
              sha256: lockedRoom.sha256,
            },
            subject: {
              bytes: normalizedSubject.bytes,
              mimeType: "image/png",
              sha256: normalizedSubject.sha256,
            },
          });
        } catch (error) {
          if (error instanceof StudioEngineError && error.code === "INVALID_ASSET") {
            const terminal = await dependencies.finalizeExecution({
              lease,
              state: "QUARANTINED",
              usage: result.usage,
              costUsd: result.costUsd,
              warnings: [...result.warnings],
              responses: [...result.responses],
              requestIds: [result.gatewayGenerationId, result.requestId]
                .filter((value): value is string => Boolean(value)),
              durationMs: result.durationMs,
              errorCode: "SUBJECT_LAYER_TECHNICAL_GATE_FAILED",
              errorMessage:
                "The paid PNG was retained privately but failed the native-room subject-window gate.",
            });
            return {
              operation: operationRow,
              execution: terminal,
              artifacts: [...rawArtifacts, subjectArtifact],
              reused: false,
            };
          }
          throw error;
        }
        const compositePolicy = operation.outputContract.mode
          === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
          ? operation.outputContract.deterministicComposite
          : null;
        if (!compositePolicy) {
          throw new Error("A deterministic composite policy is required for transparent-subject output.");
        }
        const legacySameCanvas = !("canvasPolicyRevision" in compositePolicy);
        const artifactCompositeRevision = legacySameCanvas
          ? STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION
          : composite.compositeRevision;
        if (existingComposite) {
          const expectedCompositeRevision = legacySameCanvas
            ? STUDIO_ATELIER_LEGACY_SUBJECT_COMPOSITE_REVISION
            : composite.compositeRevision;
          const metadata = existingComposite.metadata;
          const recorded = metadata && typeof metadata === "object" && !Array.isArray(metadata)
            ? metadata as Record<string, unknown>
            : null;
          if (
            existingComposite.mimeType !== "image/png"
            || existingComposite.width !== composite.width
            || existingComposite.height !== composite.height
            || !recorded
            || canonicalStringify(recorded.sourceArtifactIds)
              !== canonicalStringify([subjectArtifact.id])
            || recorded.compositionVersion !== expectedCompositeRevision
            || recorded.roomAssetId !== lockedRoom.id
            || recorded.roomSha256 !== lockedRoom.sha256
            || recorded.authorityRevision !== resolved.revision
            || recorded.subjectSha256 !== subjectArtifact.sha256
            || canonicalStringify(recorded.preservation)
              !== canonicalStringify(composite.preservation)
            || canonicalStringify(recorded.alpha)
              !== canonicalStringify(composite.alpha)
            || (!legacySameCanvas
              && recorded.canvasPolicyRevision !== composite.canvasPolicyRevision)
            || (!legacySameCanvas
              && canonicalStringify(recorded.canvasProfile)
                !== canonicalStringify(composite.canvasProfile))
          ) {
            throw new Error("The durable composite evidence does not match deterministic recomposition.");
          }
          const existingBytes = await dependencies.readArtifact(existingComposite);
          if (
            existingBytes.byteLength !== existingComposite.byteSize
            || sha256(existingBytes) !== existingComposite.sha256
            || existingComposite.sha256 !== composite.sha256
          ) {
            throw new Error("The durable review composite does not match exact deterministic recomposition.");
          }
          materializedArtifact = existingComposite;
        } else {
          const compositeBlob = await dependencies.putArtifact({
            bytes: composite.bytes,
            mimeType: composite.mimeType,
            namespace: `studio/atelier/executions/${lease.executionId}/composite`,
          });
          materializedArtifact = await dependencies.recordArtifact({
            lease,
            ordinal: 0,
            kind: "COMPOSITE",
            role: "ATELIER_REVIEW_COMPOSITE",
            blob: compositeBlob,
            width: composite.width,
            height: composite.height,
            metadata: {
              sourceArtifactIds: [subjectArtifact.id],
              compositionVersion: artifactCompositeRevision,
              roomAssetId: lockedRoom.id,
              roomSha256: lockedRoom.sha256,
              authorityRevision: resolved.revision,
              subjectSha256: subjectArtifact.sha256,
              preservation: composite.preservation,
              alpha: composite.alpha,
              ...(legacySameCanvas
                ? {}
                : {
                    canvasPolicyRevision: composite.canvasPolicyRevision,
                    canvasProfile: composite.canvasProfile,
                  }),
            },
          });
        }
        supportingArtifacts = [subjectArtifact];
      } else {
        const existingNormalized = existingArtifacts.find((artifact) =>
          artifact.kind === "NORMALIZED" && artifact.state === "STORED"
        );
        const normalizedBytes = existingNormalized
          ? await dependencies.readArtifact(existingNormalized)
          : await normalizeAtelierImage(result.images[0].bytes);
        const normalizedImage = verifyStudioImage(normalizedBytes, "image/jpeg");
        if (normalizedImage.width !== 1024 || normalizedImage.height !== 1536) {
          throw new StudioEngineError(
            "INVALID_ASSET",
            503,
            "The normalized Atelier artifact changed the locked output geometry.",
            "Keep the retained raw artifact private and inspect normalization.",
          );
        }
        materializedArtifact = existingNormalized ?? await (async () => {
          const normalizedBlob = await dependencies.putArtifact({
            bytes: normalizedImage.bytes,
            mimeType: normalizedImage.mimeType,
            namespace: `studio/atelier/executions/${lease.executionId}/normalized`,
          });
          return dependencies.recordArtifact({
            lease,
            ordinal: 0,
            kind: "NORMALIZED",
            role: "ATELIER_CANDIDATE",
            blob: normalizedBlob,
            width: normalizedImage.width,
            height: normalizedImage.height,
            metadata: {
              sourceRawOrdinal: 0,
              sourceRawSha256: sha256(result.images[0].bytes),
              normalization: "srgb-jpeg-95-444-mozjpeg",
            },
          });
        })();
      }
      const terminal = await dependencies.finalizeExecution({
        lease,
        state: "COMPLETE",
        usage: result.usage,
        costUsd: result.costUsd,
        warnings: [...result.warnings],
        responses: [...result.responses],
        requestIds: [result.gatewayGenerationId, result.requestId].filter((value): value is string => Boolean(value)),
        durationMs: result.durationMs,
      });
      return {
        operation: operationRow,
        execution: terminal,
        artifacts: [...rawArtifacts, ...supportingArtifacts, materializedArtifact],
        reused: false,
      };
    } catch (error) {
      await dependencies.finalizeExecution({
        lease,
        state: "INDETERMINATE",
        usage: result.usage,
        costUsd: result.costUsd,
        warnings: [...result.warnings],
        responses: [...result.responses],
        requestIds: [result.gatewayGenerationId, result.requestId].filter((value): value is string => Boolean(value)),
        durationMs: result.durationMs,
        errorCode: "MATERIALIZATION_INCOMPLETE",
        errorMessage: "Provider output existed but complete artifact persistence could not be confirmed.",
      }).catch(() => undefined);
      throw error;
    }
  };
}
