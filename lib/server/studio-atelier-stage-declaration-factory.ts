import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import {
  studioAtelierOperationProjections,
  studioAtelierOperations,
} from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import {
  ATELIER_STAGE_LAYER_POLICIES,
  ATELIER_STAGE_RECIPES,
  fashionNovaCheckSchema,
  parentLockSchema,
  type AtelierLayer,
  type AtelierStage,
  type ParentLock,
  type ParentRole,
} from "../studio/atelier/contracts";
import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import {
  STUDIO_ATELIER_DECLARATION_VERSION,
  studioAtelierDeclarationSchema,
  type StudioAtelierDeclaration,
} from "../studio/atelier/declaration-compiler";
import { intakeFactsSchema, type IntakeFacts } from "../studio/engine/contracts";
import { StudioEngineError } from "../studio/engine/errors";

export const STUDIO_ATELIER_WARDROBE_SOURCE_BINDING_VERSION =
  "juw.atelier-wardrobe-source-binding.v1" as const;

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/);
const operatorSubjectSchema = z.string().trim().min(1).max(512);
const createStageInputSchema = z.object({
  operatorSubject: operatorSubjectSchema,
  wardrobeItemId: z.string().uuid(),
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
}).strict();

export type CreateStudioAtelierStageDeclarationInput = z.infer<
  typeof createStageInputSchema
>;

export type StudioAtelierPersistedImageTruth = Readonly<{
  id: string;
  intakeId: string;
  role: "SOURCE" | "GARMENT_FRONT";
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  privacy: string;
}>;

/**
 * This is an internal read model, not a browser DTO. Keeping both fact copies
 * and both foreign-key values lets the factory prove the complete persisted
 * relationship instead of trusting an adapter to summarize it as "verified".
 */
export type StudioAtelierPersistedWardrobeTruth = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  intakeId: string;
  intakeOperatorSubject: string;
  intakeKind: string;
  intakeState: string;
  sourceMode: string;
  sourceAssetId: string | null;
  sourceSha256: string | null;
  wardrobeState: string;
  wardrobeQuantity: number;
  wardrobeVersion: number;
  approvedAssetId: string | null;
  wardrobeFacts: IntakeFacts;
  intakeFacts: IntakeFacts;
  source: StudioAtelierPersistedImageTruth;
  approvedFront: StudioAtelierPersistedImageTruth;
}>;

export type StudioAtelierWardrobeSourceBindingReceipt = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_WARDROBE_SOURCE_BINDING_VERSION;
  operatorSubjectSha256: string;
  wardrobeItemId: string;
  intakeId: string;
  garmentId: string;
  wardrobeVersion: number;
  source: Readonly<{
    assetId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  }>;
  approvedFront: Readonly<{
    assetId: string;
    sha256: string;
    mimeType: string;
    byteSize: number;
    width: number;
    height: number;
  }>;
  garmentTruth: Readonly<{
    facts: readonly string[];
    unknownFacts: readonly string[];
    prohibitedInferences: readonly string[];
    rearEvidenceBasis: "NO_DIRECT_GARMENT_BACK";
  }>;
  bindingSha256: string;
}>;

export type StudioAtelierStageDeclarationResult = Readonly<{
  declaration: StudioAtelierDeclaration;
  sourceBinding: StudioAtelierWardrobeSourceBindingReceipt;
  lockedParents: readonly ParentLock[];
}>;

export type StudioAtelierStageDeclarationFactoryPorts = Readonly<{
  readWardrobeTruth(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierPersistedWardrobeTruth | null>;
  readLockedParents(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
    garmentId: string;
    stage: AtelierStage;
  }>): Promise<readonly ParentLock[]>;
  readFashionNovaAdvisory(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
    garmentId: string;
  }>): Promise<unknown | null>;
}>;

type PersistedTruthDatabaseRow = Readonly<{
  wardrobe_item_id: string;
  intake_id: string;
  wardrobe_operator_subject: string;
  intake_operator_subject: string;
  intake_kind: string;
  intake_state: string;
  source_mode: string;
  source_asset_id: string | null;
  source_sha256: string | null;
  wardrobe_state: string;
  wardrobe_quantity: number;
  wardrobe_version: number;
  approved_asset_id: string | null;
  wardrobe_title: string;
  wardrobe_category: string;
  wardrobe_colour: string;
  wardrobe_size_label: string;
  wardrobe_condition: string;
  wardrobe_price: number;
  intake_facts: unknown;
  source_id: string;
  source_intake_id: string;
  source_role: string;
  source_asset_sha256: string;
  source_mime_type: string;
  source_byte_size: number;
  source_width: number | null;
  source_height: number | null;
  source_privacy: string;
  approved_id: string;
  approved_intake_id: string;
  approved_role: string;
  approved_sha256: string;
  approved_mime_type: string;
  approved_byte_size: number;
  approved_width: number | null;
  approved_height: number | null;
  approved_privacy: string;
}>;

async function readPersistedTruthRow(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<PersistedTruthDatabaseRow | null> {
  const result = await (await getStudioDb()).execute<PersistedTruthDatabaseRow>(
    // One read snapshot binds the authenticated Wardrobe row to its exact
    // committed Intake, direct source and approved front without Blob locators.
    // Drizzle parameterizes every interpolated identity below.
    sql`
      select
        wardrobe.id::text as wardrobe_item_id,
        wardrobe.intake_id::text as intake_id,
        wardrobe.operator_subject as wardrobe_operator_subject,
        intake.operator_subject as intake_operator_subject,
        intake.kind::text as intake_kind,
        intake.state::text as intake_state,
        intake.source_mode::text as source_mode,
        intake.source_asset_id::text as source_asset_id,
        intake.source_sha256,
        wardrobe.state as wardrobe_state,
        wardrobe.quantity as wardrobe_quantity,
        wardrobe.version as wardrobe_version,
        wardrobe.approved_asset_id::text as approved_asset_id,
        wardrobe.title as wardrobe_title,
        wardrobe.category as wardrobe_category,
        wardrobe.colour as wardrobe_colour,
        wardrobe.size_label as wardrobe_size_label,
        wardrobe.condition as wardrobe_condition,
        wardrobe.price as wardrobe_price,
        intake.facts as intake_facts,
        source.id::text as source_id,
        source.intake_id::text as source_intake_id,
        source.role::text as source_role,
        source.sha256 as source_asset_sha256,
        source.mime_type as source_mime_type,
        source.byte_size as source_byte_size,
        source.width as source_width,
        source.height as source_height,
        source.privacy as source_privacy,
        approved.id::text as approved_id,
        approved.intake_id::text as approved_intake_id,
        approved.role::text as approved_role,
        approved.sha256 as approved_sha256,
        approved.mime_type as approved_mime_type,
        approved.byte_size as approved_byte_size,
        approved.width as approved_width,
        approved.height as approved_height,
        approved.privacy as approved_privacy
      from studio_wardrobe_items wardrobe
      inner join studio_intakes intake
        on intake.id = wardrobe.intake_id
       and intake.operator_subject = wardrobe.operator_subject
      inner join studio_assets source
        on source.id = intake.source_asset_id
       and source.intake_id = intake.id
       and source.role = 'SOURCE'
       and source.sha256 = intake.source_sha256
      inner join studio_assets approved
        on approved.id = wardrobe.approved_asset_id
       and approved.intake_id = intake.id
       and approved.role = 'GARMENT_FRONT'
      where wardrobe.id = ${input.wardrobeItemId}::uuid
        and wardrobe.operator_subject = ${input.operatorSubject}
      limit 1
    `,
  );
  return result.rows[0] ?? null;
}

function invalidSourceTruth(message = "The saved garment source could not be verified."): StudioEngineError {
  return new StudioEngineError(
    "INVALID_ASSET",
    409,
    message,
    "Restore the exact committed garment and source evidence before using Atelier.",
  );
}

function parseImageTruth(input: Readonly<{
  id: string;
  intakeId: string;
  role: string;
  sha256: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  privacy: string;
}>, expectedRole: StudioAtelierPersistedImageTruth["role"]): StudioAtelierPersistedImageTruth {
  const mimeType = input.mimeType.toLowerCase();
  if (
    input.role !== expectedRole
    || !sha256Schema.safeParse(input.sha256).success
    || !["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    || !Number.isSafeInteger(input.byteSize)
    || input.byteSize <= 0
    || !Number.isSafeInteger(input.width)
    || input.width === null
    || input.width <= 0
    || !Number.isSafeInteger(input.height)
    || input.height === null
    || input.height <= 0
    || input.privacy !== "PRIVATE"
  ) {
    throw invalidSourceTruth();
  }
  return Object.freeze({ ...input, role: expectedRole, mimeType, width: input.width, height: input.height });
}

export async function readPersistedStudioAtelierWardrobeTruth(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<StudioAtelierPersistedWardrobeTruth | null> {
  const row = await readPersistedTruthRow(input);
  if (!row) return null;
  const wardrobeFacts = intakeFactsSchema.safeParse({
    title: row.wardrobe_title,
    category: row.wardrobe_category,
    colour: row.wardrobe_colour,
    sizeLabel: row.wardrobe_size_label,
    condition: row.wardrobe_condition,
    price: row.wardrobe_price,
  });
  const intakeFacts = intakeFactsSchema.safeParse(row.intake_facts);
  if (!wardrobeFacts.success || !intakeFacts.success) throw invalidSourceTruth();
  return Object.freeze({
    operatorSubject: row.wardrobe_operator_subject,
    wardrobeItemId: row.wardrobe_item_id,
    intakeId: row.intake_id,
    intakeOperatorSubject: row.intake_operator_subject,
    intakeKind: row.intake_kind,
    intakeState: row.intake_state,
    sourceMode: row.source_mode,
    sourceAssetId: row.source_asset_id,
    sourceSha256: row.source_sha256,
    wardrobeState: row.wardrobe_state,
    wardrobeQuantity: row.wardrobe_quantity,
    wardrobeVersion: row.wardrobe_version,
    approvedAssetId: row.approved_asset_id,
    wardrobeFacts: wardrobeFacts.data,
    intakeFacts: intakeFacts.data,
    source: parseImageTruth({
      id: row.source_id,
      intakeId: row.source_intake_id,
      role: row.source_role,
      sha256: row.source_asset_sha256,
      mimeType: row.source_mime_type,
      byteSize: row.source_byte_size,
      width: row.source_width,
      height: row.source_height,
      privacy: row.source_privacy,
    }, "SOURCE"),
    approvedFront: parseImageTruth({
      id: row.approved_id,
      intakeId: row.approved_intake_id,
      role: row.approved_role,
      sha256: row.approved_sha256,
      mimeType: row.approved_mime_type,
      byteSize: row.approved_byte_size,
      width: row.approved_width,
      height: row.approved_height,
      privacy: row.approved_privacy,
    }, "GARMENT_FRONT"),
  });
}

const parentSourcePolicy = Object.freeze({
  GARMENT_FRONT_LOCK: Object.freeze({
    stages: Object.freeze(["GARMENT_01_FRONT"] as const),
    view: "01",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }),
  GARMENT_BACK_LOCK: Object.freeze({
    stages: Object.freeze(["GARMENT_02_BACK"] as const),
    view: "02",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }),
  MANNEQUIN_FRONT_LOCK: Object.freeze({
    stages: Object.freeze(["GARMENT_03_MANNEQUIN"] as const),
    view: "03",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }),
  FABRIC_DETAIL_LOCK: Object.freeze({
    stages: Object.freeze(["GARMENT_04_DETAIL"] as const),
    view: "04",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  }),
  ACCEPTED_SUBJECT_LOCK: Object.freeze({
    stages: Object.freeze(["SUBJECT_B", "SUBJECT_A"] as const),
    view: "SUBJECT",
    lockedLayer: "IDENTITY",
    privacyClass: "PRIVATE_IDENTITY",
  }),
  ACCEPTED_05: Object.freeze({
    stages: Object.freeze(["ROOM_FINAL_05"] as const),
    view: "05",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_IDENTITY",
  }),
} as const satisfies Record<ParentRole, Readonly<{
  stages: readonly AtelierStage[];
  view: ParentLock["sourceView"];
  lockedLayer: ParentLock["lockedLayer"];
  privacyClass: ParentLock["privacyClass"];
}>>);

export async function readCanonicalStudioAtelierLockedParents(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  garmentId: string;
  stage: AtelierStage;
}>): Promise<readonly ParentLock[]> {
  const requiredRoles = ATELIER_STAGE_RECIPES[input.stage].parentRoles;
  if (requiredRoles.length === 0) return Object.freeze([]);
  const sourceStages = [...new Set(requiredRoles.flatMap((role) => parentSourcePolicy[role].stages))];
  const rows = await (await getStudioDb()).select({
    garmentId: studioAtelierOperations.garmentId,
    stage: studioAtelierOperations.stage,
    view: studioAtelierOperations.view,
    lockedAssetId: studioAtelierOperationProjections.lockedAssetId,
    lockedArtifactSha256: studioAtelierOperationProjections.lockedArtifactSha256,
    lockedParentDescriptor: studioAtelierOperationProjections.lockedParentDescriptor,
  }).from(studioAtelierOperationProjections).innerJoin(
    studioAtelierOperations,
    eq(studioAtelierOperations.id, studioAtelierOperationProjections.operationId),
  ).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.wardrobeItemId, input.wardrobeItemId),
    eq(studioAtelierOperations.garmentId, input.garmentId),
    eq(studioAtelierOperationProjections.state, "LOCKED"),
    inArray(studioAtelierOperations.stage, sourceStages),
  ));

  return Object.freeze(requiredRoles.map((role) => {
    const policy = parentSourcePolicy[role];
    const candidates = rows.filter((row) =>
      policy.stages.includes(row.stage as never)
      && row.view === policy.view
    );
    if (candidates.length !== 1) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "The exact locked Atelier parent could not be resolved.",
        "Keep every required view for this garment before continuing.",
      );
    }
    const row = candidates[0]!;
    const descriptor = row.lockedParentDescriptor;
    const parsed = parentLockSchema.safeParse({
      role,
      assetId: row.lockedAssetId,
      sha256: row.lockedArtifactSha256,
      garmentId: row.garmentId,
      sourceStage: row.stage,
      sourceView: row.view,
      reviewState: "LOCKED",
      lockedLayer: descriptor?.lockedLayer,
      privacyClass: descriptor?.privacyClass,
    });
    if (
      !parsed.success
      || parsed.data.lockedLayer !== policy.lockedLayer
      || parsed.data.privacyClass !== policy.privacyClass
    ) {
      throw invalidSourceTruth("The saved Atelier parent lock could not be verified.");
    }
    return Object.freeze(parsed.data);
  }));
}

const stageDeclarationPolicy = Object.freeze({
  GARMENT_01_FRONT: Object.freeze({
    changeLayer: "COMPOSITION", region: "GARMENT_PRESENTATION", action: "SYNTHESIZE",
    deltaCode: "PRESENT_DIRECT_GARMENT_FRONT", scene: "GARMENT_PRODUCT_STAGE",
    framing: "FULL_GARMENT", orientation: "FRONT", grammar: "GARMENT_FRONT_PRESENTATION",
    lookBack: false, styling: "GARMENT_ONLY_NO_STYLING", adjustments: Object.freeze([]),
  }),
  GARMENT_02_BACK: Object.freeze({
    changeLayer: "COMPOSITION", region: "GARMENT_PRESENTATION", action: "SYNTHESIZE",
    deltaCode: "PRESENT_DIRECT_OR_CONSERVATIVE_GARMENT_BACK", scene: "GARMENT_PRODUCT_STAGE",
    framing: "FULL_GARMENT", orientation: "BACK", grammar: "GARMENT_BACK_PRESENTATION",
    lookBack: false, styling: "GARMENT_ONLY_NO_STYLING", adjustments: Object.freeze([]),
  }),
  GARMENT_03_MANNEQUIN: Object.freeze({
    changeLayer: "COMPOSITION", region: "MANNEQUIN_PRESENTATION", action: "SYNTHESIZE",
    deltaCode: "PRESENT_ON_ANONYMOUS_NEUTRAL_MANNEQUIN", scene: "GARMENT_PRODUCT_STAGE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "FRONT", grammar: "ANONYMOUS_NEUTRAL_MANNEQUIN",
    lookBack: false, styling: "ANONYMOUS_NEUTRAL_MANNEQUIN", adjustments: Object.freeze([]),
  }),
  GARMENT_04_DETAIL: Object.freeze({
    changeLayer: "COMPOSITION", region: "VISIBLE_DETAIL", action: "SYNTHESIZE",
    deltaCode: "PRESENT_VISIBLE_GARMENT_DETAIL", scene: "GARMENT_PRODUCT_STAGE",
    framing: "FABRIC_CLOSE_DETAIL", orientation: "DETAIL", grammar: "FABRIC_DETAIL_CLOSEUP",
    lookBack: false, styling: "DETAIL_ONLY_NO_STYLING", adjustments: Object.freeze([]),
  }),
  SUBJECT_A: Object.freeze({
    changeLayer: "COMPOSITION", region: null, action: "SYNTHESIZE",
    deltaCode: "CREATE_GARMENT_SPECIFIC_SUBJECT", scene: "SUBJECT_STAGE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "FRONT", grammar: "SUBJECT_FRONT",
    lookBack: false, styling: "DECLARE_SUBJECT_DIRECTION", adjustments: Object.freeze([]),
  }),
  SUBJECT_B: Object.freeze({
    changeLayer: "IDENTITY", region: "FACE_TRANSLATION", action: "REFINE",
    deltaCode: "REFINE_IDENTITY_TRANSLATION", scene: "SUBJECT_STAGE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "FRONT", grammar: "SUBJECT_FRONT",
    lookBack: false, styling: "PRESERVE_SUBJECT_A", adjustments: Object.freeze([]),
  }),
  ROOM_FINAL_05: Object.freeze({
    changeLayer: "COMPOSITION", region: null, action: "COMPOSE",
    deltaCode: "COMPOSITE_ACCEPTED_SUBJECT_OVER_LOCKED_ROOM", scene: "LOCKED_ATELIER_COMPOSITE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "FRONT", grammar: "FRONT_MASTER",
    lookBack: false, styling: "FASHION_NOVA_ADVISORY", adjustments: Object.freeze([]),
  }),
  SIBLING_06: Object.freeze({
    changeLayer: "POSE", region: null, action: "REORIENT",
    deltaCode: "REORIENT_ACCEPTED_05_TO_LEFT_PROFILE", scene: "LOCKED_ATELIER_COMPOSITE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "SOFT_LEFT_PROFILE_SLIGHT_3Q",
    grammar: "SOFT_LEFT_PROFILE_SLIGHT_3Q", lookBack: false, styling: "INHERIT_ACCEPTED_05",
    adjustments: Object.freeze(["CHIN_ANGLE", "HAND_POSITION", "SHOULDER_OPENNESS", "WEIGHT_DISTRIBUTION"]),
  }),
  SIBLING_07_CORE: Object.freeze({
    changeLayer: "POSE", region: null, action: "REORIENT",
    deltaCode: "REORIENT_ACCEPTED_05_TO_RIGHT_REAR_3Q", scene: "LOCKED_ATELIER_COMPOSITE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "RIGHT_REAR_3Q", grammar: "RIGHT_REAR_3Q_LOOK_BACK",
    lookBack: true, styling: "INHERIT_ACCEPTED_05",
    adjustments: Object.freeze(["CHIN_ANGLE", "HAND_POSITION", "SHOULDER_OPENNESS", "WEIGHT_DISTRIBUTION"]),
  }),
  SIBLING_07_RECOVERY: Object.freeze({
    changeLayer: "POSE", region: null, action: "REORIENT",
    deltaCode: "RECOVER_RIGHT_REAR_3Q_WITH_REAR_PROFILE", scene: "LOCKED_ATELIER_COMPOSITE",
    framing: "FULL_BODY_HEAD_TO_TOE", orientation: "RIGHT_REAR_3Q", grammar: "RIGHT_REAR_3Q_LOOK_BACK",
    lookBack: true, styling: "INHERIT_ACCEPTED_05",
    adjustments: Object.freeze(["CHIN_ANGLE", "HAND_POSITION", "SHOULDER_OPENNESS", "WEIGHT_DISTRIBUTION"]),
  }),
} as const);

function semanticLine(label: string, value: string): string {
  const normalized = value.replace(/\s+/g, " ").trim();
  if (!normalized || [...normalized].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  })) throw invalidSourceTruth();
  return `${label}: ${normalized}.`;
}

function garmentTruthFromFacts(facts: IntakeFacts) {
  return Object.freeze({
    facts: Object.freeze([
      semanticLine("Garment title", facts.title),
      semanticLine("Category", facts.category),
      semanticLine("Colour", facts.colour),
      semanticLine("Tagged size", facts.sizeLabel),
      semanticLine("Condition", facts.condition),
    ]),
    unknownFacts: Object.freeze([
      "Unseen garment construction and closures remain unknown.",
      "Fibre composition remains unknown unless visible in direct source evidence.",
    ]),
    prohibitedInferences: Object.freeze([
      "Do not invent hidden construction, closures, labels, trims, or material composition.",
    ]),
    rearEvidenceBasis: "NO_DIRECT_GARMENT_BACK" as const,
  });
}

function verifyWardrobeTruth(
  input: CreateStudioAtelierStageDeclarationInput,
  truth: StudioAtelierPersistedWardrobeTruth | null,
): StudioAtelierWardrobeSourceBindingReceipt {
  if (!truth) {
    throw new StudioEngineError(
      "INTAKE_NOT_FOUND",
      404,
      "That garment is not available in this Studio.",
      "Return to Wardrobe and open the exact garment again.",
    );
  }
  if (
    truth.operatorSubject !== input.operatorSubject
    || truth.intakeOperatorSubject !== input.operatorSubject
    || truth.wardrobeItemId !== input.wardrobeItemId
    || truth.intakeKind !== "GARMENT"
    || truth.intakeState !== "COMMITTED"
    || !["CAMERA", "UPLOAD"].includes(truth.sourceMode)
    || !["DRAFT", "READY"].includes(truth.wardrobeState)
    || truth.wardrobeQuantity !== 1
    || !Number.isSafeInteger(truth.wardrobeVersion)
    || truth.wardrobeVersion < 1
    || truth.sourceAssetId !== truth.source.id
    || truth.sourceSha256 !== truth.source.sha256
    || truth.source.intakeId !== truth.intakeId
    || truth.source.role !== "SOURCE"
    || truth.approvedAssetId !== truth.approvedFront.id
    || truth.approvedFront.intakeId !== truth.intakeId
    || truth.approvedFront.role !== "GARMENT_FRONT"
    || truth.source.privacy !== "PRIVATE"
    || truth.approvedFront.privacy !== "PRIVATE"
  ) throw invalidSourceTruth();

  const source = parseImageTruth(truth.source, "SOURCE");
  const approvedFront = parseImageTruth(truth.approvedFront, "GARMENT_FRONT");
  const garmentId = `wardrobe:${input.wardrobeItemId}`;
  const garmentTruth = garmentTruthFromFacts(truth.wardrobeFacts);
  const receiptWithoutHash = {
    schemaVersion: STUDIO_ATELIER_WARDROBE_SOURCE_BINDING_VERSION,
    operatorSubjectSha256: sha256Text(input.operatorSubject),
    wardrobeItemId: input.wardrobeItemId,
    intakeId: truth.intakeId,
    garmentId,
    wardrobeVersion: truth.wardrobeVersion,
    source: {
      assetId: source.id,
      sha256: source.sha256,
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      width: source.width!,
      height: source.height!,
    },
    approvedFront: {
      assetId: approvedFront.id,
      sha256: approvedFront.sha256,
      mimeType: approvedFront.mimeType,
      byteSize: approvedFront.byteSize,
      width: approvedFront.width!,
      height: approvedFront.height!,
    },
    garmentTruth,
  } as const;
  return Object.freeze({
    ...receiptWithoutHash,
    bindingSha256: sha256Text(canonicalStringify(receiptWithoutHash)),
  });
}

function verifyLockedParents(input: Readonly<{
  stage: AtelierStage;
  garmentId: string;
  parents: readonly ParentLock[];
}>): readonly ParentLock[] {
  const requiredRoles = ATELIER_STAGE_RECIPES[input.stage].parentRoles;
  if (input.parents.length !== requiredRoles.length) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "The exact locked Atelier parents are not ready.",
      "Keep every required earlier view for this garment before continuing.",
    );
  }
  return Object.freeze(requiredRoles.map((role) => {
    const matches = input.parents.filter((parent) => parent.role === role);
    const parsed = matches.length === 1 ? parentLockSchema.safeParse(matches[0]) : null;
    const policy = parentSourcePolicy[role];
    if (
      !parsed?.success
      || parsed.data.garmentId !== input.garmentId
      || !policy.stages.includes(parsed.data.sourceStage as never)
      || parsed.data.sourceView !== policy.view
      || parsed.data.reviewState !== "LOCKED"
      || parsed.data.lockedLayer !== policy.lockedLayer
      || parsed.data.privacyClass !== policy.privacyClass
    ) throw invalidSourceTruth("The saved Atelier parent lock could not be verified.");
    return Object.freeze(parsed.data);
  }));
}

function immutableIntents(stage: AtelierStage) {
  return ATELIER_STAGE_LAYER_POLICIES[stage].requiredImmutableLayers.map((layer: AtelierLayer) => ({
    layer,
    preservation: layer === "ATELIER" || layer === "BRAND_ICON"
      ? "PIXEL_EXACT" as const
      : "SEMANTIC_TRUTH" as const,
  }));
}

function sceneIntent(kind: (typeof stageDeclarationPolicy)[AtelierStage]["scene"]) {
  if (kind === "GARMENT_PRODUCT_STAGE") return {
    kind,
    backgroundPolicy: "NEUTRAL_SOURCE_SAFE",
    atelierPolicy: "EXCLUDED",
    brandIconPolicy: "EXCLUDED",
  } as const;
  if (kind === "SUBJECT_STAGE") return {
    kind,
    backgroundPolicy: "NEUTRAL_GENERATIVE_STAGE",
    atelierPolicy: "EXCLUDED",
    brandIconPolicy: "EXCLUDED",
  } as const;
  return {
    kind,
    backgroundPolicy: "DETERMINISTIC_EXACT_ROOM_COMPOSITE",
    atelierPolicy: "PIXEL_EXACT",
    brandIconPolicy: "PIXEL_EXACT",
  } as const;
}

function stylingIntent(
  mode: (typeof stageDeclarationPolicy)[AtelierStage]["styling"],
  advisory: z.infer<typeof fashionNovaCheckSchema> | null,
) {
  if (mode === "GARMENT_ONLY_NO_STYLING" || mode === "ANONYMOUS_NEUTRAL_MANNEQUIN"
    || mode === "DETAIL_ONLY_NO_STYLING") return { mode } as const;
  if (mode === "DECLARE_SUBJECT_DIRECTION") return {
    mode,
    hairPolicy: "PRESERVE_LOCKED",
    footwearDirectionCode: "RESTRAINED_BLACK_HEELS",
    accessoryDirectionCode: "MINIMAL_GOLD_ACCESSORIES",
  } as const;
  if (mode === "PRESERVE_SUBJECT_A" || mode === "INHERIT_ACCEPTED_05") return {
    mode,
    hairPolicy: "PRESERVE_LOCKED",
  } as const;
  if (!advisory) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The saved styling advisory for final 05 is unavailable.",
      "Restore the exact server-owned advisory receipt before preparing final 05.",
    );
  }
  return { mode, hairPolicy: "PRESERVE_LOCKED", check: advisory } as const;
}

function deriveDeclaration(input: Readonly<{
  stage: AtelierStage;
  sourceBinding: StudioAtelierWardrobeSourceBindingReceipt;
  advisory: z.infer<typeof fashionNovaCheckSchema> | null;
}>): StudioAtelierDeclaration {
  const policy = stageDeclarationPolicy[input.stage];
  const rearStage = input.stage === "GARMENT_02_BACK"
    || input.stage === "SIBLING_07_CORE"
    || input.stage === "SIBLING_07_RECOVERY";
  const raw = {
    declarationVersion: STUDIO_ATELIER_DECLARATION_VERSION,
    wardrobeItemId: input.sourceBinding.wardrobeItemId,
    garmentId: input.sourceBinding.garmentId,
    stage: input.stage,
    changes: [{
      layer: policy.changeLayer,
      action: policy.action,
      region: policy.region
        ? { kind: "NAMED_REGION", code: policy.region }
        : { kind: "WHOLE_LAYER" },
      deltaCode: policy.deltaCode,
    }],
    immutables: immutableIntents(input.stage),
    garmentIntent: {
      constructionPolicy: "VISIBLE_DIRECT_EVIDENCE_ONLY",
      surfacePolicy: "SOURCE_SUPPORTED_ONLY",
      facts: [...input.sourceBinding.garmentTruth.facts],
      unknownFacts: [...input.sourceBinding.garmentTruth.unknownFacts],
      prohibitedInferences: [...input.sourceBinding.garmentTruth.prohibitedInferences],
    },
    sceneIntent: sceneIntent(policy.scene),
    cameraIntent: {
      framing: policy.framing,
      perspective: "LEVEL_NATURAL_CATALOGUE",
      scalePolicy: "PRESERVE_STATURE",
      orientation: policy.orientation,
    },
    poseIntent: {
      grammar: policy.grammar,
      lookBack: policy.lookBack,
      adjustments: [...policy.adjustments],
      anatomyPolicy: "NATURAL_PLAUSIBLE",
    },
    stylingIntent: stylingIntent(policy.styling, input.advisory),
    ...(rearStage ? {
      rearEvidenceIntent: {
        basis: input.sourceBinding.garmentTruth.rearEvidenceBasis,
        constructionTreatment: "CONSERVATIVE_INFERRED_PRESENTATION",
        recoveryEvidence: input.stage === "SIBLING_07_RECOVERY"
          ? "GYM_REAR_PROFILE_REQUIRED"
          : "CORE_ONLY",
        mayBecomeDirectEvidence: false,
      },
    } : {}),
    correctionIntent: { mode: "NONE" },
    qualityProfile: "JUW_PHOTOREALISM_V1",
  };
  const parsed = studioAtelierDeclarationSchema.safeParse(raw);
  if (!parsed.success) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "Studio could not derive the canonical Atelier stage declaration.",
      "Keep using the saved workflow while the server declaration policy is repaired.",
    );
  }
  return Object.freeze(parsed.data);
}

const defaultPorts: StudioAtelierStageDeclarationFactoryPorts = Object.freeze({
  readWardrobeTruth: readPersistedStudioAtelierWardrobeTruth,
  readLockedParents: readCanonicalStudioAtelierLockedParents,
  readFashionNovaAdvisory: async () => null,
});

/**
 * The callable boundary accepts no garment ID, facts, hashes, parent IDs,
 * advisory, correction or provider data. Every semantic declaration field is
 * reconstructed from authenticated persisted reads before any ownership claim.
 */
export function createStudioAtelierStageDeclarationFactory(
  overrides: Partial<StudioAtelierStageDeclarationFactoryPorts> = {},
) {
  const ports: StudioAtelierStageDeclarationFactoryPorts = Object.freeze({
    ...defaultPorts,
    ...overrides,
  });
  return Object.freeze({
    async create(rawInput: unknown): Promise<StudioAtelierStageDeclarationResult> {
      const parsedInput = createStageInputSchema.safeParse(rawInput);
      if (!parsedInput.success) {
        throw new StudioEngineError(
          "INVALID_REQUEST",
          400,
          "That Atelier stage request is not valid.",
          "Open the exact Wardrobe garment and choose a supported stage.",
        );
      }
      const input = parsedInput.data;
      const persistedTruth = await ports.readWardrobeTruth(input);
      const sourceBinding = verifyWardrobeTruth(input, persistedTruth);
      const lockedParents = verifyLockedParents({
        stage: input.stage,
        garmentId: sourceBinding.garmentId,
        parents: await ports.readLockedParents({
          ...input,
          garmentId: sourceBinding.garmentId,
        }),
      });
      const rawAdvisory = input.stage === "ROOM_FINAL_05"
        ? await ports.readFashionNovaAdvisory({
            operatorSubject: input.operatorSubject,
            wardrobeItemId: input.wardrobeItemId,
            garmentId: sourceBinding.garmentId,
          })
        : null;
      const parsedAdvisory = rawAdvisory === null
        ? null
        : fashionNovaCheckSchema.safeParse(rawAdvisory);
      if (parsedAdvisory && !parsedAdvisory.success) {
        throw invalidSourceTruth("The saved styling advisory could not be verified.");
      }
      return Object.freeze({
        declaration: deriveDeclaration({
          stage: input.stage,
          sourceBinding,
          advisory: parsedAdvisory?.data ?? null,
        }),
        sourceBinding,
        lockedParents,
      });
    },
  });
}

export const studioAtelierStageDeclarationFactory = createStudioAtelierStageDeclarationFactory();
