import { createHash } from "node:crypto";
import { z } from "zod";
import {
  STUDIO_GPT_IMAGE_2_MODEL,
} from "../ai/studio-image-policy";
import {
  ATELIER_STAGE_RECIPES,
  atelierOperationSchema,
  fashionNovaCheckSchema,
  type AtelierLayer,
  type AtelierOperation,
  type AtelierStage,
  type AuthorityAsset,
  type AuthorityRole,
  type DirectGarmentEvidenceReceipt,
  type ParentLock,
} from "../studio/atelier/contracts";
import {
  canonicalStringify,
  sha256Text,
} from "../studio/atelier/canonical";
import {
  TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION,
  trustedAtelierTruthBundleSchema,
  type StudioAtelierFileVerificationEvidence,
  type TrustedAtelierTruthBundleInput,
} from "../studio/atelier/declaration-compiler";
import {
  createProviderSafetyContextReceipt,
  type ProviderSafetyContextReceipt,
} from "../studio/atelier/provider-safety-context";
import {
  createStudioAtelierDirectGarmentEvidencePack,
  type StudioAtelierDirectGarmentEvidenceManifestAttestation,
  type StudioAtelierDirectGarmentEvidenceSource,
} from "./studio-atelier-direct-garment-evidence-pack";
import {
  deriveStudioAtelierConsentReceiptHash,
  type StudioAtelierExecutionContext,
  type StudioAtelierNonZdrConsentReceipt,
} from "./studio-atelier-execution-service";
import {
  studioAtelierReviewDecisionSchema,
  type StudioAtelierReviewDecision,
} from "./studio-atelier-engine-facade";
import type {
  StudioAtelierLockedRoomAuthority,
} from "./studio-atelier-lock-service";
import {
  STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
  type StudioAtelierProductionPorts,
} from "./studio-atelier-production-runtime";
import {
  buildStudioAtelierCorrectionDeclaration,
  studioAtelierProductionDeclarationService,
  type StudioAtelierCanonicalStageDeclaration,
  type StudioAtelierProductionDeclarationService,
} from "./studio-atelier-production-declarations";
import {
  createStudioAtelierProductionSourceRepository,
  resolveExactLockedArtifact,
  resolveExactReviewableSubjectA,
  type StudioAtelierLockedProductionArtifact,
  type StudioAtelierOwnedGarmentSource,
  type StudioAtelierProductionImageRecord,
  type StudioAtelierProductionOperationBundle,
  type StudioAtelierProductionSourceRepository,
} from "./studio-atelier-production-source-repository";
import {
  LULU_V4_AUTHORITY_REVISION,
  resolveLuluV4AuthorityAssets,
  type LuluV4ResolvedAuthorityAsset,
} from "./studio-lulu-v4-authority";

export const STUDIO_ATELIER_PRODUCTION_PORTS_REVISION =
  "juw.studio-atelier-production-ports.v1" as const;
export const STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION =
  "juw.atelier-adult-likeness-authority.v1" as const;

const ISO_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const GARMENT_STAGES = new Set<AtelierStage>([
  "GARMENT_01_FRONT",
  "GARMENT_02_BACK",
  "GARMENT_03_MANNEQUIN",
  "GARMENT_04_DETAIL",
]);

export type StudioAtelierProductionPortBlockerCode =
  | "CANONICAL_DECLARATION_MISMATCH"
  | "WARDROBE_SOURCE_BINDING_MISMATCH"
  | "DIRECT_GARMENT_EVIDENCE_UNAVAILABLE"
  | "STATIC_AUTHORITY_UNAVAILABLE"
  | "LOCKED_PARENT_UNAVAILABLE"
  | "REVIEWABLE_DONOR_UNAVAILABLE"
  | "OPERATION_UNAVAILABLE"
  | "PROVIDER_RETENTION_CONSENT_MISSING"
  | "PROVIDER_RETENTION_CONSENT_INVALID"
  | "ADULT_LIKENESS_AUTHORITY_MISSING"
  | "ADULT_LIKENESS_AUTHORITY_INVALID"
  | "FASHION_NOVA_ADVISORY_MISSING"
  | "CORRECTION_AUTHORITY_MISMATCH"
  | "CORRECTION_PREPARER_NOT_INSTALLED"
  | "LOCKED_ROOM_MISMATCH";

const blockerMessage = Object.freeze({
  CANONICAL_DECLARATION_MISMATCH:
    "The server-derived Atelier declaration changed and must be reloaded.",
  WARDROBE_SOURCE_BINDING_MISMATCH:
    "The authenticated garment no longer matches its immutable source binding.",
  DIRECT_GARMENT_EVIDENCE_UNAVAILABLE:
    "The exact direct garment evidence is unavailable or failed readback.",
  STATIC_AUTHORITY_UNAVAILABLE:
    "The exact private Atelier authority is unavailable or failed readback.",
  LOCKED_PARENT_UNAVAILABLE:
    "An exact operator-owned locked parent is unavailable.",
  REVIEWABLE_DONOR_UNAVAILABLE:
    "The exact semantic-pass Subject A donor is unavailable.",
  OPERATION_UNAVAILABLE:
    "The durable Atelier operation is unavailable in this operator scope.",
  PROVIDER_RETENTION_CONSENT_MISSING:
    "Provider-retention consent has not been recorded for this operation.",
  PROVIDER_RETENTION_CONSENT_INVALID:
    "The provider-retention consent receipt does not bind this operation.",
  ADULT_LIKENESS_AUTHORITY_MISSING:
    "Verified-adult and likeness-use authority has not been recorded for this operation.",
  ADULT_LIKENESS_AUTHORITY_INVALID:
    "The verified-adult and likeness-use authority does not bind this operation.",
  FASHION_NOVA_ADVISORY_MISSING:
    "The exact server-owned styling advisory is unavailable for final 05.",
  CORRECTION_AUTHORITY_MISMATCH:
    "The bounded correction no longer matches the durable review authorization.",
  CORRECTION_PREPARER_NOT_INSTALLED:
    "The server-owned correction preparation boundary is not installed.",
  LOCKED_ROOM_MISMATCH:
    "The exact locked Atelier room does not match the canonical operation.",
} as const satisfies Record<StudioAtelierProductionPortBlockerCode, string>);

/** Sanitized, typed failure. It intentionally carries no locators, bytes or identities. */
export class StudioAtelierProductionPortBlockedError extends Error {
  readonly statusCode = 503;

  constructor(readonly code: StudioAtelierProductionPortBlockerCode) {
    super(blockerMessage[code]);
    this.name = "StudioAtelierProductionPortBlockedError";
  }
}

function blocked(code: StudioAtelierProductionPortBlockerCode): never {
  throw new StudioAtelierProductionPortBlockedError(code);
}

export function isStudioAtelierProductionPortBlockedError(
  error: unknown,
): error is StudioAtelierProductionPortBlockedError {
  return error instanceof StudioAtelierProductionPortBlockedError;
}

export type StudioAtelierAdultLikenessAuthorityReceipt = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION;
  receiptId: string;
  receiptSha256: string;
  operatorSubjectSha256: string;
  operationId: string;
  semanticOperationHash: string;
  stage: AtelierStage;
  authorityRevision: typeof LULU_V4_AUTHORITY_REVISION;
  subjectAuthorityId: "lulu-v4";
  subjectAge: "VERIFIED_ADULT_18_PLUS";
  subjectConsent: "VERIFIED_FOR_THIS_OPERATION";
  likenessUse: "AUTHORIZED_FOR_THIS_OPERATION";
  purpose: "NON_SEXUAL_RETAIL_FASHION_CATALOGUE";
  recordedAt: string;
}>;

type AdultLikenessAuthorityBody = Omit<
  StudioAtelierAdultLikenessAuthorityReceipt,
  "receiptId" | "receiptSha256"
>;

const adultLikenessAuthorityBodySchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION),
  operatorSubjectSha256: z.string().regex(SHA256_PATTERN),
  operationId: z.string().uuid(),
  semanticOperationHash: z.string().regex(SHA256_PATTERN),
  stage: z.enum([
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
    "SUBJECT_A",
    "SUBJECT_B",
    "ROOM_FINAL_05",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ]),
  authorityRevision: z.literal(LULU_V4_AUTHORITY_REVISION),
  subjectAuthorityId: z.literal("lulu-v4"),
  subjectAge: z.literal("VERIFIED_ADULT_18_PLUS"),
  subjectConsent: z.literal("VERIFIED_FOR_THIS_OPERATION"),
  likenessUse: z.literal("AUTHORIZED_FOR_THIS_OPERATION"),
  purpose: z.literal("NON_SEXUAL_RETAIL_FASHION_CATALOGUE"),
  recordedAt: z.string().regex(ISO_TIMESTAMP_PATTERN),
}).strict();

const adultLikenessAuthorityReceiptSchema = adultLikenessAuthorityBodySchema.extend({
  receiptId: z.string().regex(/^atelier-adult-likeness:[a-f0-9]{64}$/),
  receiptSha256: z.string().regex(SHA256_PATTERN),
}).strict();

export function deriveStudioAtelierAdultLikenessAuthorityReceiptHash(
  body: AdultLikenessAuthorityBody,
): string {
  return sha256Text(canonicalStringify(adultLikenessAuthorityBodySchema.parse(body)));
}

export type ResolveStudioAtelierProviderRetentionConsent = (input: Readonly<{
  operatorSubject: string;
  operationId: string;
  semanticOperationHash: string;
  stage: AtelierStage;
  provider: "openai";
  model: typeof STUDIO_GPT_IMAGE_2_MODEL;
  zeroDataRetention: false;
}>) => Promise<StudioAtelierNonZdrConsentReceipt | null>;

export type ResolveStudioAtelierAdultLikenessAuthority = (input: Readonly<{
  operatorSubject: string;
  operationId: string;
  semanticOperationHash: string;
  stage: AtelierStage;
}>) => Promise<StudioAtelierAdultLikenessAuthorityReceipt | null>;

export type PrepareStudioAtelierCanonicalDeclaration = (input: Readonly<{
  operatorSubject: string;
  declaration: StudioAtelierCanonicalStageDeclaration["declaration"];
}>) => Promise<Readonly<{ operationId: string }>>;

type ResolvePrivateAuthorityAssets = (
  assetIds: readonly string[],
) => Promise<readonly LuluV4ResolvedAuthorityAsset[]>;

export type CreateStudioAtelierProductionPortsInput = Readonly<{
  sourceRepository?: StudioAtelierProductionSourceRepository;
  declarations?: StudioAtelierProductionDeclarationService;
  resolvePrivateAuthorityAssets?: ResolvePrivateAuthorityAssets;
  resolveProviderRetentionConsent?: ResolveStudioAtelierProviderRetentionConsent;
  resolveAdultLikenessAuthority?: ResolveStudioAtelierAdultLikenessAuthority;
  prepareDeclaration?: PrepareStudioAtelierCanonicalDeclaration;
  now?: () => Date;
}>;

type CanonicalContext = Readonly<{
  canonical: StudioAtelierCanonicalStageDeclaration;
  garment: StudioAtelierOwnedGarmentSource;
}>;

const staticAuthorityAssetId = Object.freeze({
  REAL_FACE_OPERATION_BOARD: "lulu.face.operation-board.full.v1",
  V4_TRANSLATION_LOCK: "lulu.face.v4.front.lock.v1",
  LOCKED_ATELIER_ROOM: "juw.atelier.empty-plate.v1",
  BODY_FRONT_CANON: "lulu.body.canon.v4.front",
  BODY_SIDE_CANON: "lulu.body.canon.v4.side",
  BODY_BACK_CANON: "lulu.body.canon.v4.back",
  REAL_LULU_ANGLE_CONTACT: "lulu.body.real.angle-contact.v4",
  REAL_LULU_GYM_REAR_PROFILE: "lulu.body.real.gym-rear-profile.v4",
} as const satisfies Partial<Record<AuthorityRole, string>>);

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function isGarmentStage(stage: AtelierStage): boolean {
  return GARMENT_STAGES.has(stage);
}

function exactImageTuple(
  left: Readonly<{
    assetId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  }>,
  right: StudioAtelierProductionImageRecord,
): boolean {
  return left.assetId === right.assetId
    && left.sha256 === right.sha256
    && left.mimeType === right.mimeType
    && left.byteSize === right.byteSize
    && left.width === right.width
    && left.height === right.height;
}

function verifySourceBinding(input: Readonly<{
  operatorSubject: string;
  canonical: StudioAtelierCanonicalStageDeclaration;
  garment: StudioAtelierOwnedGarmentSource;
}>): void {
  const { sourceBinding } = input.canonical;
  const { garment } = input;
  const { bindingSha256, ...bindingBody } = sourceBinding;
  const semanticLine = (label: string, value: string) =>
    `${label}: ${value.replace(/\s+/g, " ").trim()}.`;
  const currentFacts = [
    semanticLine("Garment title", garment.facts.title),
    semanticLine("Category", garment.facts.category),
    semanticLine("Colour", garment.facts.colour),
    semanticLine("Tagged size", garment.facts.sizeLabel),
    semanticLine("Condition", garment.facts.condition),
  ];
  if (
    sourceBinding.operatorSubjectSha256 !== sha256Text(input.operatorSubject)
    || sourceBinding.wardrobeItemId !== garment.wardrobeItemId
    || sourceBinding.intakeId !== garment.intakeId
    || sourceBinding.garmentId !== garment.garmentId
    || sourceBinding.wardrobeVersion !== garment.wardrobeVersion
    || !exactImageTuple(sourceBinding.source, garment.source)
    || !exactImageTuple(sourceBinding.approvedFront, garment.approvedFront)
    || canonicalStringify(sourceBinding.garmentTruth.facts)
      !== canonicalStringify(currentFacts)
    || canonicalStringify(input.canonical.declaration.garmentIntent.facts)
      !== canonicalStringify(sourceBinding.garmentTruth.facts)
    || canonicalStringify(input.canonical.declaration.garmentIntent.unknownFacts)
      !== canonicalStringify(sourceBinding.garmentTruth.unknownFacts)
    || canonicalStringify(input.canonical.declaration.garmentIntent.prohibitedInferences)
      !== canonicalStringify(sourceBinding.garmentTruth.prohibitedInferences)
    || bindingSha256 !== sha256Text(canonicalStringify(bindingBody))
  ) {
    blocked("WARDROBE_SOURCE_BINDING_MISMATCH");
  }
}

async function canonicalContext(input: Readonly<{
  operatorSubject: string;
  declaration: StudioAtelierCanonicalStageDeclaration["declaration"];
  declarations: StudioAtelierProductionDeclarationService;
  sourceRepository: StudioAtelierProductionSourceRepository;
}>): Promise<CanonicalContext> {
  let canonical: StudioAtelierCanonicalStageDeclaration;
  if (input.declaration.correctionIntent.mode === "NONE") {
    try {
      canonical = await input.declarations.assertExact({
        operatorSubject: input.operatorSubject,
        declaration: input.declaration,
      });
    } catch {
      return blocked("CANONICAL_DECLARATION_MISMATCH");
    }
  } else {
    const intent = input.declaration.correctionIntent;
    const source = exactOperation(await input.sourceRepository.resolveOperationBySemanticHash({
      operatorSubject: input.operatorSubject,
      semanticHash: intent.correctionOf,
    }));
    const decision = correctionDecisionFromEvent(source);
    if (
      !input.declaration.wardrobeItemId
      || !decision
      || source.row.correctionOrdinal !== 0
      || !source.projection.correctionAuthorized
      || source.correction !== null
      || source.operation.wardrobeItemId !== input.declaration.wardrobeItemId
      || source.operation.garmentId !== input.declaration.garmentId
      || source.operation.stage !== input.declaration.stage
    ) return blocked("CORRECTION_AUTHORITY_MISMATCH");
    const base = await input.declarations.derive({
      operatorSubject: input.operatorSubject,
      wardrobeItemId: input.declaration.wardrobeItemId,
      stage: input.declaration.stage,
    });
    const expected = buildStudioAtelierCorrectionDeclaration({
      base: base.declaration,
      sourceSemanticHash: source.row.semanticHash,
      decision,
    });
    if (canonicalStringify(expected) !== canonicalStringify(input.declaration)) {
      return blocked("CORRECTION_AUTHORITY_MISMATCH");
    }
    canonical = Object.freeze({ ...base, declaration: expected });
  }
  const garment = await input.sourceRepository.resolveOwnedGarment({
    operatorSubject: input.operatorSubject,
    wardrobeItemId: canonical.sourceBinding.wardrobeItemId,
  });
  verifySourceBinding({
    operatorSubject: input.operatorSubject,
    canonical,
    garment,
  });
  return Object.freeze({ canonical, garment });
}

function directSourceRecords(
  garment: StudioAtelierOwnedGarmentSource,
): readonly StudioAtelierProductionImageRecord[] {
  const records = [
    garment.source,
    ...garment.directCaptures.map((capture) => capture.image),
  ].sort((left, right) => {
    const byId = left.assetId.localeCompare(right.assetId);
    return byId !== 0 ? byId : left.sha256.localeCompare(right.sha256);
  });
  if (
    records.length === 0
    || new Set(records.map((record) => record.assetId)).size !== records.length
  ) {
    blocked("DIRECT_GARMENT_EVIDENCE_UNAVAILABLE");
  }
  return Object.freeze(records);
}

function directSourceManifest(
  garment: StudioAtelierOwnedGarmentSource,
): StudioAtelierDirectGarmentEvidenceManifestAttestation {
  const constituents = directSourceRecords(garment).map((source) => ({
    assetId: source.assetId,
    sha256: source.sha256,
    mimeType: source.mimeType,
    byteSize: source.byteSize,
    width: source.width,
    height: source.height,
  }));
  const digest = sha256Text(canonicalStringify({
    schemaVersion: "juw.atelier-wardrobe-direct-source-manifest.v1",
    wardrobeItemId: garment.wardrobeItemId,
    intakeId: garment.intakeId,
    constituents,
  }));
  return Object.freeze({
    revision: `wardrobe-source:${garment.wardrobeItemId}:v1`,
    sha256: digest,
    attestationId: `wardrobe-source-attestation:${digest}`,
    verificationStatus: "VERIFIED" as const,
  });
}

async function directEvidenceSources(input: Readonly<{
  garment: StudioAtelierOwnedGarmentSource;
  sourceRepository: StudioAtelierProductionSourceRepository;
}>): Promise<readonly StudioAtelierDirectGarmentEvidenceSource[]> {
  try {
    return Object.freeze(await Promise.all(directSourceRecords(input.garment).map(async (record) => {
      const verified = await input.sourceRepository.readVerifiedImage(record);
      return Object.freeze({
        constituent: Object.freeze({
          assetId: record.assetId,
          sha256: record.sha256,
          mimeType: record.mimeType,
          byteSize: record.byteSize,
          width: record.width,
          height: record.height,
        }),
        bytes: verified.bytes,
      });
    })));
  } catch {
    return blocked("DIRECT_GARMENT_EVIDENCE_UNAVAILABLE");
  }
}

async function directEvidenceReceipt(input: Readonly<{
  garment: StudioAtelierOwnedGarmentSource;
  sourceRepository: StudioAtelierProductionSourceRepository;
}>): Promise<DirectGarmentEvidenceReceipt> {
  const sources = await directEvidenceSources(input);
  try {
    const pack = await createStudioAtelierDirectGarmentEvidencePack({
      sourceManifest: directSourceManifest(input.garment),
      sources,
    });
    return Object.freeze(pack.receipt);
  } catch {
    return blocked("DIRECT_GARMENT_EVIDENCE_UNAVAILABLE");
  }
}

function requiredStaticRoles(stage: AtelierStage): readonly AuthorityRole[] {
  return ATELIER_STAGE_RECIPES[stage].authorityRoles.filter((role) =>
    Object.hasOwn(staticAuthorityAssetId, role)
  );
}

function staticAuthorityDescriptor(
  role: AuthorityRole,
  resolved: LuluV4ResolvedAuthorityAsset,
): AuthorityAsset {
  const room = role === "LOCKED_ATELIER_ROOM";
  const real = role === "REAL_FACE_OPERATION_BOARD"
    || role === "REAL_LULU_ANGLE_CONTACT"
    || role === "REAL_LULU_GYM_REAR_PROFILE";
  return Object.freeze({
    role,
    assetId: resolved.id,
    sha256: resolved.sha256,
    garmentId: null,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: room
      ? "LOCKED_ENVIRONMENT" as const
      : real ? "REAL_DIRECT" as const : "APPROVED_CANON" as const,
    required: true as const,
    permittedScope: room
      ? ["ATELIER", "BRAND_ICON", "LIGHTING"] as AtelierLayer[]
      : role === "V4_TRANSLATION_LOCK"
        ? ["IDENTITY", "BODY", "HAIR"] as AtelierLayer[]
        : role === "REAL_FACE_OPERATION_BOARD"
          ? ["IDENTITY", "HAIR"] as AtelierLayer[]
          : ["BODY"] as AtelierLayer[],
    dominance: 100,
    privacyClass: room ? "PRIVATE_OPERATOR" as const : "PRIVATE_IDENTITY" as const,
  });
}

async function resolveStaticAuthorities(input: Readonly<{
  stage: AtelierStage;
  resolvePrivateAuthorityAssets: ResolvePrivateAuthorityAssets;
}>): Promise<Readonly<{
  descriptors: readonly AuthorityAsset[];
  resolved: readonly LuluV4ResolvedAuthorityAsset[];
}>> {
  const roles = requiredStaticRoles(input.stage);
  if (roles.length === 0) {
    return Object.freeze({ descriptors: Object.freeze([]), resolved: Object.freeze([]) });
  }
  const ids = roles.map((role) => staticAuthorityAssetId[role as keyof typeof staticAuthorityAssetId]);
  try {
    const resolved = await input.resolvePrivateAuthorityAssets(ids);
    if (
      resolved.length !== roles.length
      || resolved.some((asset, index) => asset.id !== ids[index])
    ) {
      return blocked("STATIC_AUTHORITY_UNAVAILABLE");
    }
    return Object.freeze({
      descriptors: Object.freeze(roles.map((role, index) =>
        staticAuthorityDescriptor(role, resolved[index]!)
      )),
      resolved: Object.freeze([...resolved]),
    });
  } catch (error) {
    if (isStudioAtelierProductionPortBlockedError(error)) throw error;
    return blocked("STATIC_AUTHORITY_UNAVAILABLE");
  }
}

function exactParentSet(
  canonical: StudioAtelierCanonicalStageDeclaration,
  locked: readonly StudioAtelierLockedProductionArtifact[],
): readonly StudioAtelierLockedProductionArtifact[] {
  try {
    return Object.freeze(canonical.lockedParents.map((expected) => {
      const match = resolveExactLockedArtifact(locked, expected);
      if (
        canonical.sourceBinding.garmentId !== match.parent.garmentId
        || canonicalStringify(match.parent) !== canonicalStringify(expected)
      ) {
        return blocked("LOCKED_PARENT_UNAVAILABLE");
      }
      return match;
    }));
  } catch (error) {
    if (isStudioAtelierProductionPortBlockedError(error)) throw error;
    return blocked("LOCKED_PARENT_UNAVAILABLE");
  }
}

async function verifyLockedImages(input: Readonly<{
  sourceRepository: StudioAtelierProductionSourceRepository;
  locked: readonly StudioAtelierLockedProductionArtifact[];
}>): Promise<void> {
  try {
    await Promise.all(input.locked.map((candidate) =>
      input.sourceRepository.readVerifiedImage(candidate.image)
    ));
  } catch {
    blocked("LOCKED_PARENT_UNAVAILABLE");
  }
}

function directAuthority(
  garmentId: string,
  receipt: DirectGarmentEvidenceReceipt,
): AuthorityAsset {
  return Object.freeze({
    role: "DIRECT_GARMENT_EVIDENCE" as const,
    assetId: receipt.output.assetId,
    sha256: receipt.output.sha256,
    garmentId,
    sourceStage: null,
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true as const,
    permittedScope: ["GARMENT"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  });
}

function donorAuthority(
  garmentId: string,
  donor: ReturnType<typeof resolveExactReviewableSubjectA>,
): AuthorityAsset {
  return Object.freeze({
    role: "SUBJECT_A_TRANSLATION_DONOR" as const,
    assetId: donor.image.assetId,
    sha256: donor.image.sha256,
    garmentId,
    sourceStage: "SUBJECT_A" as const,
    reviewState: donor.reviewState,
    provenanceClass: "ACCEPTED_GENERATED" as const,
    required: true as const,
    permittedScope: ["IDENTITY", "BODY", "HAIR"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_IDENTITY" as const,
  });
}

function frontSafeguardAuthority(
  garmentId: string,
  front: StudioAtelierLockedProductionArtifact,
): AuthorityAsset {
  return Object.freeze({
    role: "GARMENT_FRONT_SAFEGUARD" as const,
    assetId: front.image.assetId,
    sha256: front.image.sha256,
    garmentId,
    sourceStage: front.parent.sourceStage,
    reviewState: "LOCKED" as const,
    provenanceClass: "GARMENT_DIRECT" as const,
    required: true as const,
    permittedScope: ["GARMENT"] as AtelierLayer[],
    dominance: 100,
    privacyClass: "PRIVATE_OPERATOR" as const,
  });
}

function sourceForImmutable(stage: AtelierStage, layer: AtelierLayer) {
  if (isGarmentStage(stage)) {
    return { kind: "AUTHORITY" as const, role: "DIRECT_GARMENT_EVIDENCE" as const };
  }
  if (stage === "SUBJECT_A") {
    return layer === "GARMENT"
      ? { kind: "PARENT" as const, role: "GARMENT_FRONT_LOCK" as const }
      : { kind: "AUTHORITY" as const, role: "V4_TRANSLATION_LOCK" as const };
  }
  if (stage === "SUBJECT_B") {
    return layer === "GARMENT"
      ? { kind: "PARENT" as const, role: "GARMENT_FRONT_LOCK" as const }
      : { kind: "AUTHORITY" as const, role: "SUBJECT_A_TRANSLATION_DONOR" as const };
  }
  if (stage === "ROOM_FINAL_05") {
    if (layer === "GARMENT") {
      return { kind: "AUTHORITY" as const, role: "GARMENT_FRONT_SAFEGUARD" as const };
    }
    if (layer === "ATELIER" || layer === "BRAND_ICON" || layer === "LIGHTING") {
      return { kind: "AUTHORITY" as const, role: "LOCKED_ATELIER_ROOM" as const };
    }
    return { kind: "PARENT" as const, role: "ACCEPTED_SUBJECT_LOCK" as const };
  }
  if (layer === "ATELIER" || layer === "BRAND_ICON" || layer === "LIGHTING") {
    return { kind: "AUTHORITY" as const, role: "LOCKED_ATELIER_ROOM" as const };
  }
  return { kind: "PARENT" as const, role: "ACCEPTED_05" as const };
}

const reviewTargetIntent = Object.freeze({
  FACE_TRANSLATION: Object.freeze({
    layer: "IDENTITY",
    region: Object.freeze({ kind: "NAMED_REGION", code: "FACE_TRANSLATION" }),
  }),
  BODY_GEOMETRY: Object.freeze({
    layer: "BODY",
    region: Object.freeze({ kind: "WHOLE_LAYER" }),
  }),
  GARMENT_CONSTRUCTION: Object.freeze({
    layer: "GARMENT",
    region: Object.freeze({ kind: "NAMED_REGION", code: "GARMENT_CONSTRUCTION" }),
  }),
  GARMENT_SURFACE: Object.freeze({
    layer: "GARMENT",
    region: Object.freeze({ kind: "NAMED_REGION", code: "GARMENT_SURFACE" }),
  }),
  HAIR: Object.freeze({
    layer: "HAIR",
    region: Object.freeze({ kind: "NAMED_REGION", code: "HAIR" }),
  }),
  LEFT_HAND: Object.freeze({
    layer: "HANDS",
    region: Object.freeze({ kind: "NAMED_REGION", code: "LEFT_HAND" }),
  }),
  RIGHT_HAND: Object.freeze({
    layer: "HANDS",
    region: Object.freeze({ kind: "NAMED_REGION", code: "RIGHT_HAND" }),
  }),
  FOOTWEAR: Object.freeze({
    layer: "FOOTWEAR",
    region: Object.freeze({ kind: "NAMED_REGION", code: "FOOTWEAR" }),
  }),
  POSE_ALIGNMENT: Object.freeze({
    layer: "POSE",
    region: Object.freeze({ kind: "NAMED_REGION", code: "POSE_ALIGNMENT" }),
  }),
  CAMERA_ALIGNMENT: Object.freeze({
    layer: "CAMERA",
    region: Object.freeze({ kind: "NAMED_REGION", code: "CAMERA_ALIGNMENT" }),
  }),
  LIGHTING_INTEGRATION: Object.freeze({
    layer: "LIGHTING",
    region: Object.freeze({ kind: "NAMED_REGION", code: "LIGHTING_INTEGRATION" }),
  }),
  OUTPUT_GEOMETRY: Object.freeze({
    layer: "OUTPUT_GEOMETRY",
    region: Object.freeze({ kind: "NAMED_REGION", code: "OUTPUT_GEOMETRY" }),
  }),
} as const);

function correctionAuthorization(input: Readonly<{
  declaration: StudioAtelierCanonicalStageDeclaration["declaration"];
  source: StudioAtelierProductionOperationBundle | null;
}>) {
  if (input.declaration.correctionIntent.mode === "NONE") return undefined;
  const intent = input.declaration.correctionIntent;
  const source = input.source;
  if (
    !source
    || source.row.semanticHash !== intent.correctionOf
    || source.row.correctionOrdinal !== 0
    || !source.projection.correctionAuthorized
    || source.correction !== null
  ) {
    return blocked("CORRECTION_AUTHORITY_MISMATCH");
  }
  const authorized = source.events.filter((event) => event.eventType === "CORRECTION_AUTHORIZED");
  if (authorized.length !== 1) return blocked("CORRECTION_AUTHORITY_MISMATCH");
  const payload = authorized[0]!.payload;
  const evidence = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).evidence
    : null;
  const decision = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>).reviewDecision
    : null;
  const parsed = studioAtelierReviewDecisionSchema.safeParse(decision);
  const target = parsed.success && parsed.data.decision === "FIX_ONE_THING"
    ? reviewTargetIntent[parsed.data.target]
    : null;
  if (
    !parsed.success
    || parsed.data.decision !== "FIX_ONE_THING"
    || parsed.data.reason !== intent.failedGate
    || !target
    || target.layer !== intent.targetLayer
    || canonicalStringify(target.region) !== canonicalStringify(intent.targetRegion)
  ) {
    return blocked("CORRECTION_AUTHORITY_MISMATCH");
  }
  return Object.freeze({
    correctionOf: intent.correctionOf,
    failedGate: intent.failedGate,
    targetLayer: intent.targetLayer,
    targetRegion: intent.targetRegion,
    ordinal: 1 as const,
    remainingBudget: 0 as const,
  });
}

function exactOperation(
  bundle: StudioAtelierProductionOperationBundle | null,
): StudioAtelierProductionOperationBundle {
  if (!bundle) return blocked("OPERATION_UNAVAILABLE");
  if (
    bundle.operation
    && typeof bundle.operation === "object"
    && bundle.operation.stage === "ROOM_FINAL_05"
    && !fashionNovaCheckSchema.safeParse(bundle.operation.fashionNovaCheck).success
  ) {
    return blocked("FASHION_NOVA_ADVISORY_MISSING");
  }
  const parsed = atelierOperationSchema.safeParse(bundle.operation);
  if (
    !parsed.success
    || parsed.data.wardrobeItemId !== bundle.row.wardrobeItemId
    || bundle.row.semanticHash.length !== 64
  ) {
    return blocked("OPERATION_UNAVAILABLE");
  }
  return bundle;
}

function parseConsentReceipt(input: Readonly<{
  value: StudioAtelierNonZdrConsentReceipt | null;
  operatorSubject: string;
  operationId: string;
}>): StudioAtelierNonZdrConsentReceipt {
  if (!input.value) return blocked("PROVIDER_RETENTION_CONSENT_MISSING");
  const receipt = input.value;
  const { receiptSha256, ...body } = receipt;
  const recordedAt = new Date(receipt.recordedAt);
  if (
    Object.keys(receipt).sort().join("|") !== [
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
    ].join("|")
    || receipt.schemaVersion !== "juw.atelier-non-zdr-consent.v1"
    || !/^[a-zA-Z0-9._:/-]{1,180}$/.test(receipt.receiptId)
    || !SHA256_PATTERN.test(receiptSha256)
    || receipt.operatorSubject !== input.operatorSubject
    || receipt.operationId !== input.operationId
    || receipt.provider !== "openai"
    || receipt.model !== STUDIO_GPT_IMAGE_2_MODEL
    || receipt.zeroDataRetention !== false
    || receipt.providerRetentionAcknowledged !== true
    || !ISO_TIMESTAMP_PATTERN.test(receipt.recordedAt)
    || Number.isNaN(recordedAt.getTime())
    || recordedAt.toISOString() !== receipt.recordedAt
    || deriveStudioAtelierConsentReceiptHash(body) !== receiptSha256
  ) {
    return blocked("PROVIDER_RETENTION_CONSENT_INVALID");
  }
  return Object.freeze(receipt);
}

function parseAdultLikenessAuthority(input: Readonly<{
  value: StudioAtelierAdultLikenessAuthorityReceipt | null;
  operatorSubject: string;
  operation: StudioAtelierProductionOperationBundle;
}>): StudioAtelierAdultLikenessAuthorityReceipt {
  if (!input.value) return blocked("ADULT_LIKENESS_AUTHORITY_MISSING");
  const parsed = adultLikenessAuthorityReceiptSchema.safeParse(input.value);
  if (!parsed.success) return blocked("ADULT_LIKENESS_AUTHORITY_INVALID");
  const receipt = parsed.data;
  const { receiptId, receiptSha256, ...body } = receipt;
  const expectedHash = deriveStudioAtelierAdultLikenessAuthorityReceiptHash(body);
  const recordedAt = new Date(receipt.recordedAt);
  if (
    receiptId !== `atelier-adult-likeness:${expectedHash}`
    || receiptSha256 !== expectedHash
    || receipt.operatorSubjectSha256 !== sha256Text(input.operatorSubject)
    || receipt.operationId !== input.operation.row.id
    || receipt.semanticOperationHash !== input.operation.row.semanticHash
    || receipt.stage !== input.operation.operation.stage
    || Number.isNaN(recordedAt.getTime())
    || recordedAt.toISOString() !== receipt.recordedAt
  ) {
    return blocked("ADULT_LIKENESS_AUTHORITY_INVALID");
  }
  return Object.freeze(receipt);
}

function providerSafetyContext(input: Readonly<{
  operatorSubject: string;
  operation: StudioAtelierProductionOperationBundle;
  adultAuthority: StudioAtelierAdultLikenessAuthorityReceipt | null;
}>): ProviderSafetyContextReceipt {
  const stage = input.operation.operation.stage;
  if (!isGarmentStage(stage)) {
    parseAdultLikenessAuthority({
      value: input.adultAuthority,
      operatorSubject: input.operatorSubject,
      operation: input.operation,
    });
  }
  return createProviderSafetyContextReceipt({
    semanticOperationHash: input.operation.row.semanticHash,
    stage,
    mode: isGarmentStage(stage)
      ? "NO_REAL_PERSON_OUTPUT"
      : "VERIFIED_ADULT_AUTHORIZED_LIKENESS",
  });
}

function requireFashionNovaAdvisory(operation: AtelierOperation): void {
  if (
    operation.stage === "ROOM_FINAL_05"
    && !fashionNovaCheckSchema.safeParse(operation.fashionNovaCheck).success
  ) {
    blocked("FASHION_NOVA_ADVISORY_MISSING");
  }
}

function exactRequestedParents(input: Readonly<{
  operation: AtelierOperation;
  requested: readonly Readonly<{ role: ParentLock["role"]; assetId: string; sha256: string }>[];
  locked: readonly StudioAtelierLockedProductionArtifact[];
}>): readonly ParentLock[] {
  if (
    input.requested.length !== input.operation.parentLocks.length
    || input.requested.some((requested, index) => {
      const expected = input.operation.parentLocks[index];
      return !expected
        || requested.role !== expected.role
        || requested.assetId !== expected.assetId
        || requested.sha256 !== expected.sha256;
    })
  ) return blocked("LOCKED_PARENT_UNAVAILABLE");
  try {
    return Object.freeze(input.requested.map((requested) => {
      const candidate = resolveExactLockedArtifact(input.locked, requested);
      if (candidate.parent.role !== requested.role) {
        return blocked("LOCKED_PARENT_UNAVAILABLE");
      }
      return candidate.parent;
    }));
  } catch (error) {
    if (isStudioAtelierProductionPortBlockedError(error)) throw error;
    return blocked("LOCKED_PARENT_UNAVAILABLE");
  }
}

async function dynamicReference(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  operation: AtelierOperation;
  slot: Parameters<StudioAtelierProductionPorts["resolveExecutionContext"]>[0]["dynamicReferenceSlots"][number];
  locked: readonly StudioAtelierLockedProductionArtifact[];
  sourceRepository: StudioAtelierProductionSourceRepository;
}>) {
  let image: StudioAtelierProductionImageRecord;
  if (input.slot === "DIRECT_GARMENT_EVIDENCE") {
    return blocked("DIRECT_GARMENT_EVIDENCE_UNAVAILABLE");
  }
  if (input.slot === "ELIGIBLE_PASS_A_PARENT") {
    const expected = input.operation.authorityStack.find((authority) =>
      authority.role === "SUBJECT_A_TRANSLATION_DONOR"
    );
    if (!expected) return blocked("REVIEWABLE_DONOR_UNAVAILABLE");
    try {
      const donor = resolveExactReviewableSubjectA(
        await input.sourceRepository.resolveReviewableSubjectA({
          operatorSubject: input.operatorSubject,
          wardrobeItemId: input.wardrobeItemId,
        }),
        expected,
      );
      image = donor.image;
    } catch {
      return blocked("REVIEWABLE_DONOR_UNAVAILABLE");
    }
  } else {
    const role = input.slot === "ACCEPTED_CURRENT_GARMENT_05"
      ? "ACCEPTED_05"
      : input.slot === "GARMENT_FRONT_LOCK" && input.operation.stage === "ROOM_FINAL_05"
        ? null
        : input.slot;
    const expected = role
      ? input.operation.parentLocks.find((parent) => parent.role === role)
      : input.operation.authorityStack.find((authority) =>
          authority.role === "GARMENT_FRONT_SAFEGUARD"
        );
    if (!expected) return blocked("LOCKED_PARENT_UNAVAILABLE");
    try {
      image = resolveExactLockedArtifact(input.locked, expected).image;
    } catch {
      return blocked("LOCKED_PARENT_UNAVAILABLE");
    }
  }
  try {
    const verified = await input.sourceRepository.readVerifiedImage(image);
    return Object.freeze({
      slot: input.slot,
      bytes: verified.bytes,
      mimeType: verified.mimeType,
    });
  } catch {
    return blocked("LOCKED_PARENT_UNAVAILABLE");
  }
}

function correctionDecisionFromEvent(
  source: StudioAtelierProductionOperationBundle,
): Extract<StudioAtelierReviewDecision, { decision: "FIX_ONE_THING" }> | null {
  const events = source.events.filter((event) => event.eventType === "CORRECTION_AUTHORIZED");
  if (events.length !== 1) return null;
  const payload = events[0]!.payload;
  const evidence = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>).evidence
    : null;
  const rawDecision = evidence && typeof evidence === "object" && !Array.isArray(evidence)
    ? (evidence as Record<string, unknown>).reviewDecision
    : null;
  const parsed = studioAtelierReviewDecisionSchema.safeParse(rawDecision);
  return parsed.success && parsed.data.decision === "FIX_ONE_THING"
    ? parsed.data
    : null;
}

/**
 * Builds only server-owned ports. Construction performs no database, Blob,
 * provider, migration or environment work; every external read is demand-driven.
 */
export function createStudioAtelierProductionPorts(
  input: CreateStudioAtelierProductionPortsInput = {},
): StudioAtelierProductionPorts {
  const sourceRepository = input.sourceRepository
    ?? createStudioAtelierProductionSourceRepository();
  const declarations = input.declarations
    ?? studioAtelierProductionDeclarationService;
  const resolvePrivateAuthorityAssets = input.resolvePrivateAuthorityAssets
    ?? resolveLuluV4AuthorityAssets;
  const resolveProviderRetentionConsent = input.resolveProviderRetentionConsent
    ?? (async () => null);
  const resolveAdultLikenessAuthority = input.resolveAdultLikenessAuthority
    ?? (async () => null);
  const now = input.now ?? (() => new Date());

  const resolveFileVerification: StudioAtelierProductionPorts["resolveFileVerification"] =
    async ({ operatorSubject, declaration }): Promise<StudioAtelierFileVerificationEvidence> => {
      const context = await canonicalContext({
        operatorSubject,
        declaration,
        declarations,
        sourceRepository,
      });
      const locked = exactParentSet(
        context.canonical,
        await sourceRepository.listLockedArtifacts({
          operatorSubject,
          wardrobeItemId: context.garment.wardrobeItemId,
        }),
      );
      await verifyLockedImages({ sourceRepository, locked });
      const staticAuthorities = await resolveStaticAuthorities({
        stage: declaration.stage,
        resolvePrivateAuthorityAssets,
      });
      const direct = isGarmentStage(declaration.stage)
        ? await directEvidenceReceipt({ garment: context.garment, sourceRepository })
        : undefined;
      const verifiedAssetCount = direct
        ? direct.constituents.length
        : new Set([
            ...locked.map((item) => `${item.image.assetId}:${item.image.sha256}`),
            ...staticAuthorities.resolved.map((item) => `${item.id}:${item.sha256}`),
          ]).size;
      if (verifiedAssetCount < 1) return blocked("STATIC_AUTHORITY_UNAVAILABLE");
      return Object.freeze({
        status: "PASS",
        verifiedAssetCount,
        verifiedAt: now().toISOString(),
        manifestHash: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
        ...(direct ? { directGarmentEvidence: direct } : {}),
      });
    };

  const resolveTrustedTruth: StudioAtelierProductionPorts["resolveTrustedTruth"] =
    async ({ operatorSubject, declaration }): Promise<TrustedAtelierTruthBundleInput> => {
      const context = await canonicalContext({
        operatorSubject,
        declaration,
        declarations,
        sourceRepository,
      });
      const allLocked = await sourceRepository.listLockedArtifacts({
        operatorSubject,
        wardrobeItemId: context.garment.wardrobeItemId,
      });
      const locked = exactParentSet(context.canonical, allLocked);
      await verifyLockedImages({ sourceRepository, locked });
      const staticAuthorities = await resolveStaticAuthorities({
        stage: declaration.stage,
        resolvePrivateAuthorityAssets,
      });
      const direct = isGarmentStage(declaration.stage)
        ? await directEvidenceReceipt({ garment: context.garment, sourceRepository })
        : undefined;
      const dynamicAuthorities: AuthorityAsset[] = [];
      if (direct) {
        dynamicAuthorities.push(directAuthority(context.garment.garmentId, direct));
      }
      if (declaration.stage === "SUBJECT_B") {
        // SUBJECT_B refines private semantic-pass SUBJECT_A, not its locked
        // garment parent. The donor identity is a dynamic authority.
        const donor = await sourceRepository.resolveReviewableSubjectA({
          operatorSubject,
          wardrobeItemId: context.garment.wardrobeItemId,
        });
        if (!donor) return blocked("REVIEWABLE_DONOR_UNAVAILABLE");
        try {
          await sourceRepository.readVerifiedImage(donor.image);
        } catch {
          return blocked("REVIEWABLE_DONOR_UNAVAILABLE");
        }
        dynamicAuthorities.push(donorAuthority(context.garment.garmentId, donor));
      }
      if (declaration.stage === "ROOM_FINAL_05") {
        const frontMatches = allLocked.filter((candidate) =>
          candidate.parent.role === "GARMENT_FRONT_LOCK"
          && candidate.parent.garmentId === context.garment.garmentId
        );
        if (frontMatches.length !== 1) return blocked("LOCKED_PARENT_UNAVAILABLE");
        const front = frontMatches[0]!;
        try {
          await sourceRepository.readVerifiedImage(front.image);
        } catch {
          return blocked("LOCKED_PARENT_UNAVAILABLE");
        }
        dynamicAuthorities.push(frontSafeguardAuthority(context.garment.garmentId, front));
      }
      const sourceStateFileSha256 = sha256Text(canonicalStringify({
        revision: STUDIO_ATELIER_PRODUCTION_PORTS_REVISION,
        sourceBindingSha256: context.canonical.sourceBinding.bindingSha256,
        lockedParents: context.canonical.lockedParents,
        dynamicAuthorities,
        stage: declaration.stage,
      }));
      const garmentTruthBody = {
        facts: [...declaration.garmentIntent.facts],
        unknownFacts: [...declaration.garmentIntent.unknownFacts],
        prohibitedInferences: [...declaration.garmentIntent.prohibitedInferences],
        rearEvidenceBasis: context.canonical.sourceBinding.garmentTruth.rearEvidenceBasis,
        ...(direct ? { directGarmentEvidence: direct } : {}),
      };
      const correctionSource = declaration.correctionIntent.mode === "BOUNDED_ONE_THING"
        ? await sourceRepository.resolveOperationBySemanticHash({
            operatorSubject,
            semanticHash: declaration.correctionIntent.correctionOf,
          })
        : null;
      const candidate = {
        truthBundleVersion: TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION,
        state: {
          schemaVersion: "juw.studio-atelier-production-state.v1",
          workflowRevision: STUDIO_ATELIER_PRODUCTION_PORTS_REVISION,
          garmentId: context.garment.garmentId,
          sourceFileSha256: sourceStateFileSha256,
          allowedStages: [...Object.keys(ATELIER_STAGE_RECIPES)] as AtelierStage[],
          authorityManifest: {
            revision: LULU_V4_AUTHORITY_REVISION,
            fileSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
          },
        },
        staticAuthorityManifest: {
          revision: LULU_V4_AUTHORITY_REVISION,
          fileSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
          authorities: [...staticAuthorities.descriptors],
        },
        dynamicLockedTruth: {
          sourceStateFileSha256,
          authorities: dynamicAuthorities,
          parents: [...context.canonical.lockedParents],
          ...(declaration.correctionIntent.mode === "BOUNDED_ONE_THING"
            ? { correctionAuthorization: correctionAuthorization({
                declaration,
                source: correctionSource,
              }) }
            : {}),
        },
        garmentTruth: {
          revision: `wardrobe-truth:${context.garment.wardrobeItemId}:v${context.garment.wardrobeVersion}`,
          sourceHash: sha256Text(canonicalStringify(garmentTruthBody)),
          ...garmentTruthBody,
        },
        ...(declaration.stylingIntent.mode === "FASHION_NOVA_ADVISORY"
          ? { stylingAdvisory: declaration.stylingIntent.check }
          : {}),
        immutableBindings: declaration.immutables.map((immutable) => ({
          stage: declaration.stage,
          layer: immutable.layer,
          source: sourceForImmutable(declaration.stage, immutable.layer),
        })),
      } satisfies TrustedAtelierTruthBundleInput;
      const parsed = trustedAtelierTruthBundleSchema.safeParse(candidate);
      if (!parsed.success) return blocked("CANONICAL_DECLARATION_MISMATCH");
      return Object.freeze(parsed.data);
    };

  const resolveExecutionContext: StudioAtelierProductionPorts["resolveExecutionContext"] =
    async (command): Promise<StudioAtelierExecutionContext> => {
      const bundle = exactOperation(await sourceRepository.resolveOperation({
        operatorSubject: command.operatorSubject,
        operationId: command.operationId,
      }));
      const operation = bundle.operation;
      if (
        !operation.wardrobeItemId
        || command.provider !== "openai"
        || command.model !== STUDIO_GPT_IMAGE_2_MODEL
        || command.zeroDataRetention !== false
      ) return blocked("OPERATION_UNAVAILABLE");
      requireFashionNovaAdvisory(operation);
      const consentReceipt = parseConsentReceipt({
        value: await resolveProviderRetentionConsent({
          operatorSubject: command.operatorSubject,
          operationId: command.operationId,
          semanticOperationHash: bundle.row.semanticHash,
          stage: operation.stage,
          provider: command.provider,
          model: command.model,
          zeroDataRetention: command.zeroDataRetention,
        }),
        operatorSubject: command.operatorSubject,
        operationId: command.operationId,
      });
      const adultAuthority = isGarmentStage(operation.stage)
        ? null
        : await resolveAdultLikenessAuthority({
            operatorSubject: command.operatorSubject,
            operationId: command.operationId,
            semanticOperationHash: bundle.row.semanticHash,
            stage: operation.stage,
          });
      const safety = providerSafetyContext({
        operatorSubject: command.operatorSubject,
        operation: bundle,
        adultAuthority,
      });
      const locked = await sourceRepository.listLockedArtifacts({
        operatorSubject: command.operatorSubject,
        wardrobeItemId: operation.wardrobeItemId,
      });
      const parentLocks = exactRequestedParents({
        operation,
        requested: command.requestedParentLocks,
        locked,
      });
      const dynamicReferences = Object.freeze(await Promise.all(
        command.dynamicReferenceSlots.map((slot) => dynamicReference({
          operatorSubject: command.operatorSubject,
          wardrobeItemId: operation.wardrobeItemId!,
          operation,
          slot,
          locked,
          sourceRepository,
        })),
      ));
      let directGarmentEvidence: StudioAtelierExecutionContext["directGarmentEvidence"];
      if (isGarmentStage(operation.stage)) {
        if (
          !command.directGarmentEvidence
          || canonicalStringify(command.directGarmentEvidence)
            !== canonicalStringify(operation.directGarmentEvidence)
        ) return blocked("DIRECT_GARMENT_EVIDENCE_UNAVAILABLE");
        const garment = await sourceRepository.resolveOwnedGarment({
          operatorSubject: command.operatorSubject,
          wardrobeItemId: operation.wardrobeItemId,
        });
        const sources = await directEvidenceSources({ garment, sourceRepository });
        directGarmentEvidence = Object.freeze({
          sourceManifest: directSourceManifest(garment),
          sources,
        });
      } else if (command.directGarmentEvidence !== null) {
        return blocked("DIRECT_GARMENT_EVIDENCE_UNAVAILABLE");
      }
      return Object.freeze({
        dynamicReferences,
        parentLocks,
        consentReceipt,
        providerSafetyContext: safety,
        ...(directGarmentEvidence ? { directGarmentEvidence } : {}),
      });
    };

  const prepareCorrection: StudioAtelierProductionPorts["prepareCorrection"] =
    async ({ operatorSubject, sourceOperationId, decision }) => {
      if (!input.prepareDeclaration) return blocked("CORRECTION_PREPARER_NOT_INSTALLED");
      const source = exactOperation(await sourceRepository.resolveOperation({
        operatorSubject,
        operationId: sourceOperationId,
      }));
      const exactDecision = correctionDecisionFromEvent(source);
      if (
        !source.operation.wardrobeItemId
        || source.row.correctionOrdinal !== 0
        || !source.projection.correctionAuthorized
        || source.correction !== null
        || !exactDecision
        || canonicalStringify(exactDecision) !== canonicalStringify(decision)
      ) return blocked("CORRECTION_AUTHORITY_MISMATCH");
      const canonical = await declarations.derive({
        operatorSubject,
        wardrobeItemId: source.operation.wardrobeItemId,
        stage: source.operation.stage,
      });
      const correction = buildStudioAtelierCorrectionDeclaration({
        base: canonical.declaration,
        sourceSemanticHash: source.row.semanticHash,
        decision,
      });
      return input.prepareDeclaration({ operatorSubject, declaration: correction });
    };

  const resolveLockedRoom: StudioAtelierProductionPorts["resolveLockedRoom"] =
    async ({ operatorSubject, operationId, expected }): Promise<StudioAtelierLockedRoomAuthority> => {
      const bundle = exactOperation(await sourceRepository.resolveOperation({
        operatorSubject,
        operationId,
      }));
      const room = bundle.operation.authorityStack.find((authority) =>
        authority.role === "LOCKED_ATELIER_ROOM"
      );
      if (
        !room
        || room.assetId !== expected.assetId
        || room.sha256 !== expected.sha256
        || room.assetId !== staticAuthorityAssetId.LOCKED_ATELIER_ROOM
      ) return blocked("LOCKED_ROOM_MISMATCH");
      let resolved: LuluV4ResolvedAuthorityAsset;
      try {
        const assets = await resolvePrivateAuthorityAssets([room.assetId]);
        if (assets.length !== 1) return blocked("LOCKED_ROOM_MISMATCH");
        resolved = assets[0]!;
      } catch (error) {
        if (isStudioAtelierProductionPortBlockedError(error)) throw error;
        return blocked("LOCKED_ROOM_MISMATCH");
      }
      if (
        resolved.id !== room.assetId
        || resolved.sha256 !== room.sha256
        || sha256(resolved.bytes) !== room.sha256
        || resolved.mimeType !== "image/png"
        || resolved.width !== 1024
        || (resolved.height !== 1280 && resolved.height !== 1536)
      ) return blocked("LOCKED_ROOM_MISMATCH");
      return Object.freeze({
        assetId: resolved.id,
        sha256: resolved.sha256,
        bytes: resolved.bytes,
        mimeType: resolved.mimeType,
        width: resolved.width,
        height: resolved.height,
        manifestRevision: LULU_V4_AUTHORITY_REVISION,
        manifestHash: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
      });
    };

  return Object.freeze({
    resolveFileVerification,
    resolveTrustedTruth,
    resolveExecutionContext,
    prepareCorrection,
    resolveLockedRoom,
  });
}
