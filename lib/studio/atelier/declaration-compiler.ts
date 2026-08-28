import { z } from "zod";
import {
  ATELIER_STAGE_LAYER_POLICIES,
  ATELIER_STAGE_RECIPES,
  atelierOperationSchema,
  atelierStageSchema,
  authorityAssetSchema,
  authorityRoleSchema,
  directGarmentEvidenceReceiptSchema,
  fashionNovaCheckSchema,
  garmentIdSchema,
  layerSchema,
  parentLockSchema,
  parentRoleSchema,
  sha256Schema,
  type AtelierLayer,
  type AtelierOperation,
  type AtelierStage,
  type AuthorityAsset,
  type AuthorityRole,
  type DirectGarmentEvidenceReceipt,
  type ParentLock,
  type ParentRole,
} from "./contracts";
import {
  canonicalAtelierOperation,
  canonicalStringify,
  sha256Text,
} from "./canonical";
import {
  STUDIO_ATELIER_NATIVE_ROOM_COMPOSITE_POLICY,
} from "./canvas-policy";

export const STUDIO_ATELIER_DECLARATION_VERSION =
  "juw.studio-atelier-declaration.v1" as const;
export const STUDIO_ATELIER_DECLARATION_VALIDATOR_REVISION =
  "juw.studio-atelier-declaration-validator.v1" as const;
export const TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION =
  "juw.atelier-truth-bundle.v1" as const;

const safeTokenSchema = z.string().trim().min(1).max(240)
  .regex(/^[a-zA-Z0-9._:/-]+$/);
const semanticTextSchema = z.string().trim().min(1).max(1_000)
  .refine((value) => ![...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0;
    return codePoint < 32 || codePoint === 127;
  }), {
    message: "Semantic declaration text must stay on one printable line.",
  });

const declarationVersionSchema = z.literal(STUDIO_ATELIER_DECLARATION_VERSION);
const validatorRevisionSchema = z.literal(STUDIO_ATELIER_DECLARATION_VALIDATOR_REVISION);

export const studioAtelierRegionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("WHOLE_LAYER"),
  }).strict(),
  z.object({
    kind: z.literal("NAMED_REGION"),
    code: z.enum([
      "FACE_TRANSLATION",
      "GARMENT_CONSTRUCTION",
      "GARMENT_SURFACE",
      "HAIR",
      "LEFT_HAND",
      "RIGHT_HAND",
      "FOOTWEAR",
      "ATELIER_SUBJECT_PLACEMENT",
      "CAMERA_ALIGNMENT",
      "POSE_ALIGNMENT",
      "LIGHTING_INTEGRATION",
      "OUTPUT_GEOMETRY",
      "GARMENT_PRESENTATION",
      "MANNEQUIN_PRESENTATION",
      "VISIBLE_DETAIL",
    ]),
  }).strict(),
]);

export type StudioAtelierRegion = z.infer<typeof studioAtelierRegionSchema>;

export const studioAtelierChangeIntentSchema = z.object({
  layer: layerSchema,
  action: z.enum([
    "SYNTHESIZE",
    "REFINE",
    "COMPOSE",
    "REORIENT",
    "CORRECT",
  ]),
  region: studioAtelierRegionSchema,
  deltaCode: z.enum([
    "CREATE_GARMENT_SPECIFIC_SUBJECT",
    "REFINE_IDENTITY_TRANSLATION",
    "COMPOSITE_ACCEPTED_SUBJECT_OVER_LOCKED_ROOM",
    "REORIENT_ACCEPTED_05_TO_LEFT_PROFILE",
    "REORIENT_ACCEPTED_05_TO_RIGHT_REAR_3Q",
    "RECOVER_RIGHT_REAR_3Q_WITH_REAR_PROFILE",
    "CORRECT_AUTHORIZED_GATE_ONLY",
    "PRESENT_DIRECT_GARMENT_FRONT",
    "PRESENT_DIRECT_OR_CONSERVATIVE_GARMENT_BACK",
    "PRESENT_ON_ANONYMOUS_NEUTRAL_MANNEQUIN",
    "PRESENT_VISIBLE_GARMENT_DETAIL",
  ]),
}).strict();

export const studioAtelierImmutableIntentSchema = z.object({
  layer: layerSchema,
  preservation: z.enum(["SEMANTIC_TRUTH", "PIXEL_EXACT"]),
}).strict();

const garmentIntentSchema = z.object({
  constructionPolicy: z.literal("VISIBLE_DIRECT_EVIDENCE_ONLY"),
  surfacePolicy: z.literal("SOURCE_SUPPORTED_ONLY"),
  facts: z.array(semanticTextSchema).min(1),
  unknownFacts: z.array(semanticTextSchema).default([]),
  prohibitedInferences: z.array(semanticTextSchema).default([]),
}).strict();

const subjectSceneIntentSchema = z.object({
  kind: z.literal("SUBJECT_STAGE"),
  backgroundPolicy: z.literal("NEUTRAL_GENERATIVE_STAGE"),
  atelierPolicy: z.literal("EXCLUDED"),
  brandIconPolicy: z.literal("EXCLUDED"),
}).strict();

const garmentProductSceneIntentSchema = z.object({
  kind: z.literal("GARMENT_PRODUCT_STAGE"),
  backgroundPolicy: z.literal("NEUTRAL_SOURCE_SAFE"),
  atelierPolicy: z.literal("EXCLUDED"),
  brandIconPolicy: z.literal("EXCLUDED"),
}).strict();

const lockedAtelierSceneIntentSchema = z.object({
  kind: z.literal("LOCKED_ATELIER_COMPOSITE"),
  backgroundPolicy: z.literal("DETERMINISTIC_EXACT_ROOM_COMPOSITE"),
  atelierPolicy: z.literal("PIXEL_EXACT"),
  brandIconPolicy: z.literal("PIXEL_EXACT"),
}).strict();

const sceneIntentSchema = z.discriminatedUnion("kind", [
  garmentProductSceneIntentSchema,
  subjectSceneIntentSchema,
  lockedAtelierSceneIntentSchema,
]);

const cameraIntentSchema = z.object({
  framing: z.enum([
    "FULL_BODY_HEAD_TO_TOE",
    "FULL_GARMENT",
    "FABRIC_CLOSE_DETAIL",
  ]),
  perspective: z.literal("LEVEL_NATURAL_CATALOGUE"),
  scalePolicy: z.literal("PRESERVE_STATURE"),
  orientation: z.enum([
    "FRONT",
    "BACK",
    "DETAIL",
    "SOFT_LEFT_PROFILE_SLIGHT_3Q",
    "RIGHT_REAR_3Q",
  ]),
}).strict();

const poseAdjustmentSchema = z.enum([
  "STANCE",
  "CHIN_ANGLE",
  "SHOULDER_OPENNESS",
  "HAND_POSITION",
  "WEIGHT_DISTRIBUTION",
]);

const poseIntentSchema = z.object({
  grammar: z.enum([
    "GARMENT_FRONT_PRESENTATION",
    "GARMENT_BACK_PRESENTATION",
    "ANONYMOUS_NEUTRAL_MANNEQUIN",
    "FABRIC_DETAIL_CLOSEUP",
    "SUBJECT_FRONT",
    "FRONT_MASTER",
    "SOFT_LEFT_PROFILE_SLIGHT_3Q",
    "RIGHT_REAR_3Q_LOOK_BACK",
  ]),
  lookBack: z.boolean(),
  adjustments: z.array(poseAdjustmentSchema).default([]),
  anatomyPolicy: z.literal("NATURAL_PLAUSIBLE"),
}).strict();

const hairPolicyShape = {
  hairPolicy: z.literal("PRESERVE_LOCKED"),
} as const;

const stylingIntentSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("GARMENT_ONLY_NO_STYLING"),
  }).strict(),
  z.object({
    mode: z.literal("ANONYMOUS_NEUTRAL_MANNEQUIN"),
  }).strict(),
  z.object({
    mode: z.literal("DETAIL_ONLY_NO_STYLING"),
  }).strict(),
  z.object({
    mode: z.literal("DECLARE_SUBJECT_DIRECTION"),
    ...hairPolicyShape,
    footwearDirectionCode: z.enum([
      "RESTRAINED_BLACK_HEELS",
      "MINIMAL_NEUTRAL_FOOTWEAR",
      "PRESERVE_SOURCE_SUPPORTED_FOOTWEAR",
    ]),
    accessoryDirectionCode: z.enum([
      "MINIMAL_GOLD_ACCESSORIES",
      "MINIMAL_NEUTRAL_ACCESSORIES",
      "NO_ADDED_ACCESSORIES",
    ]),
  }).strict(),
  z.object({
    mode: z.literal("PRESERVE_SUBJECT_A"),
    ...hairPolicyShape,
  }).strict(),
  z.object({
    mode: z.literal("FASHION_NOVA_ADVISORY"),
    ...hairPolicyShape,
    check: fashionNovaCheckSchema,
  }).strict(),
  z.object({
    mode: z.literal("INHERIT_ACCEPTED_05"),
    ...hairPolicyShape,
  }).strict(),
]);

const rearEvidenceIntentSchema = z.object({
  basis: z.enum(["DIRECT_GARMENT_BACK", "NO_DIRECT_GARMENT_BACK"]),
  constructionTreatment: z.enum([
    "DIRECT_SUPPORTED_ONLY",
    "CONSERVATIVE_INFERRED_PRESENTATION",
  ]),
  recoveryEvidence: z.enum(["CORE_ONLY", "GYM_REAR_PROFILE_REQUIRED"]),
  mayBecomeDirectEvidence: z.literal(false),
}).strict().superRefine((value, context) => {
  const expected = value.basis === "DIRECT_GARMENT_BACK"
    ? "DIRECT_SUPPORTED_ONLY"
    : "CONSERVATIVE_INFERRED_PRESENTATION";
  if (value.constructionTreatment !== expected) {
    context.addIssue({
      code: "custom",
      path: ["constructionTreatment"],
      message: "Rear construction treatment must match the evidence basis.",
    });
  }
});

const correctionIntentSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("NONE"),
  }).strict(),
  z.object({
    mode: z.literal("BOUNDED_ONE_THING"),
    correctionOf: sha256Schema,
    failedGate: z.enum([
      "IDENTITY_DRIFT",
      "BODY_DRIFT",
      "GARMENT_TRUTH_DRIFT",
      "FULL_BODY_GEOMETRY_FAILURE",
      "PHOTOREALISM_FAILURE",
      "IMMUTABLE_TRUTH_DRIFT",
      "ATELIER_PIXEL_DRIFT",
      "WRONG_STAGE_VIEW",
      "SUBJECT_REFINEMENT_FAILURE",
    ]),
    targetLayer: layerSchema,
    targetRegion: studioAtelierRegionSchema,
    ordinal: z.literal(1),
  }).strict(),
]);

const studioAtelierDeclarationBaseSchema = z.object({
  declarationVersion: declarationVersionSchema,
  wardrobeItemId: z.string().uuid().optional(),
  garmentId: garmentIdSchema,
  stage: atelierStageSchema,
  changes: z.array(studioAtelierChangeIntentSchema).min(1),
  immutables: z.array(studioAtelierImmutableIntentSchema).min(1),
  garmentIntent: garmentIntentSchema,
  sceneIntent: sceneIntentSchema,
  cameraIntent: cameraIntentSchema,
  poseIntent: poseIntentSchema,
  stylingIntent: stylingIntentSchema,
  rearEvidenceIntent: rearEvidenceIntentSchema.optional(),
  correctionIntent: correctionIntentSchema,
  qualityProfile: z.literal("JUW_PHOTOREALISM_V1"),
}).strict();

const stageIntentPolicy = Object.freeze({
  GARMENT_01_FRONT: Object.freeze({
    sceneKind: "GARMENT_PRODUCT_STAGE",
    cameraFraming: "FULL_GARMENT",
    cameraOrientation: "FRONT",
    poseGrammar: "GARMENT_FRONT_PRESENTATION",
    lookBack: false,
    stylingMode: "GARMENT_ONLY_NO_STYLING",
    action: "SYNTHESIZE",
    deltaCode: "PRESENT_DIRECT_GARMENT_FRONT",
  }),
  GARMENT_02_BACK: Object.freeze({
    sceneKind: "GARMENT_PRODUCT_STAGE",
    cameraFraming: "FULL_GARMENT",
    cameraOrientation: "BACK",
    poseGrammar: "GARMENT_BACK_PRESENTATION",
    lookBack: false,
    stylingMode: "GARMENT_ONLY_NO_STYLING",
    action: "SYNTHESIZE",
    deltaCode: "PRESENT_DIRECT_OR_CONSERVATIVE_GARMENT_BACK",
  }),
  GARMENT_03_MANNEQUIN: Object.freeze({
    sceneKind: "GARMENT_PRODUCT_STAGE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "FRONT",
    poseGrammar: "ANONYMOUS_NEUTRAL_MANNEQUIN",
    lookBack: false,
    stylingMode: "ANONYMOUS_NEUTRAL_MANNEQUIN",
    action: "SYNTHESIZE",
    deltaCode: "PRESENT_ON_ANONYMOUS_NEUTRAL_MANNEQUIN",
  }),
  GARMENT_04_DETAIL: Object.freeze({
    sceneKind: "GARMENT_PRODUCT_STAGE",
    cameraFraming: "FABRIC_CLOSE_DETAIL",
    cameraOrientation: "DETAIL",
    poseGrammar: "FABRIC_DETAIL_CLOSEUP",
    lookBack: false,
    stylingMode: "DETAIL_ONLY_NO_STYLING",
    action: "SYNTHESIZE",
    deltaCode: "PRESENT_VISIBLE_GARMENT_DETAIL",
  }),
  SUBJECT_A: Object.freeze({
    sceneKind: "SUBJECT_STAGE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "FRONT",
    poseGrammar: "SUBJECT_FRONT",
    lookBack: false,
    stylingMode: "DECLARE_SUBJECT_DIRECTION",
    action: "SYNTHESIZE",
    deltaCode: "CREATE_GARMENT_SPECIFIC_SUBJECT",
  }),
  SUBJECT_B: Object.freeze({
    sceneKind: "SUBJECT_STAGE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "FRONT",
    poseGrammar: "SUBJECT_FRONT",
    lookBack: false,
    stylingMode: "PRESERVE_SUBJECT_A",
    action: "REFINE",
    deltaCode: "REFINE_IDENTITY_TRANSLATION",
  }),
  ROOM_FINAL_05: Object.freeze({
    sceneKind: "LOCKED_ATELIER_COMPOSITE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "FRONT",
    poseGrammar: "FRONT_MASTER",
    lookBack: false,
    stylingMode: "FASHION_NOVA_ADVISORY",
    action: "COMPOSE",
    deltaCode: "COMPOSITE_ACCEPTED_SUBJECT_OVER_LOCKED_ROOM",
  }),
  SIBLING_06: Object.freeze({
    sceneKind: "LOCKED_ATELIER_COMPOSITE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "SOFT_LEFT_PROFILE_SLIGHT_3Q",
    poseGrammar: "SOFT_LEFT_PROFILE_SLIGHT_3Q",
    lookBack: false,
    stylingMode: "INHERIT_ACCEPTED_05",
    action: "REORIENT",
    deltaCode: "REORIENT_ACCEPTED_05_TO_LEFT_PROFILE",
  }),
  SIBLING_07_CORE: Object.freeze({
    sceneKind: "LOCKED_ATELIER_COMPOSITE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "RIGHT_REAR_3Q",
    poseGrammar: "RIGHT_REAR_3Q_LOOK_BACK",
    lookBack: true,
    stylingMode: "INHERIT_ACCEPTED_05",
    action: "REORIENT",
    deltaCode: "REORIENT_ACCEPTED_05_TO_RIGHT_REAR_3Q",
  }),
  SIBLING_07_RECOVERY: Object.freeze({
    sceneKind: "LOCKED_ATELIER_COMPOSITE",
    cameraFraming: "FULL_BODY_HEAD_TO_TOE",
    cameraOrientation: "RIGHT_REAR_3Q",
    poseGrammar: "RIGHT_REAR_3Q_LOOK_BACK",
    lookBack: true,
    stylingMode: "INHERIT_ACCEPTED_05",
    action: "REORIENT",
    deltaCode: "RECOVER_RIGHT_REAR_3Q_WITH_REAR_PROFILE",
  }),
} as const satisfies Record<AtelierStage, Readonly<{
  sceneKind: z.infer<typeof sceneIntentSchema>["kind"];
  cameraFraming: z.infer<typeof cameraIntentSchema>["framing"];
  cameraOrientation: z.infer<typeof cameraIntentSchema>["orientation"];
  poseGrammar: z.infer<typeof poseIntentSchema>["grammar"];
  lookBack: boolean;
  stylingMode: z.infer<typeof stylingIntentSchema>["mode"];
  action: z.infer<typeof studioAtelierChangeIntentSchema>["action"];
  deltaCode: z.infer<typeof studioAtelierChangeIntentSchema>["deltaCode"];
}>>);

function addIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", path, message });
}

function duplicates(values: readonly string[]): string[] {
  const seen = new Set<string>();
  const duplicatesFound = new Set<string>();
  for (const value of values) {
    if (seen.has(value)) duplicatesFound.add(value);
    seen.add(value);
  }
  return [...duplicatesFound];
}

function regionsEqual(left: StudioAtelierRegion, right: StudioAtelierRegion): boolean {
  return canonicalStringify(left) === canonicalStringify(right);
}

export const studioAtelierDeclarationSchema = studioAtelierDeclarationBaseSchema
  .superRefine((declaration, context) => {
    const stagePolicy = stageIntentPolicy[declaration.stage];
    const layerPolicy = ATELIER_STAGE_LAYER_POLICIES[declaration.stage];
    const mutableLayers = declaration.changes.map((change) => change.layer);
    const immutableLayers = declaration.immutables.map((immutable) => immutable.layer);

    for (const duplicate of duplicates(mutableLayers)) {
      addIssue(context, ["changes"], `Mutable layer ${duplicate} may be declared only once.`);
    }
    for (const duplicate of duplicates(immutableLayers)) {
      addIssue(context, ["immutables"], `Immutable layer ${duplicate} may be declared only once.`);
    }
    for (const [field, values] of Object.entries({
      facts: declaration.garmentIntent.facts,
      unknownFacts: declaration.garmentIntent.unknownFacts,
      prohibitedInferences: declaration.garmentIntent.prohibitedInferences,
    })) {
      for (const duplicate of duplicates(values)) {
        addIssue(context, ["garmentIntent", field], `Garment intent duplicates: ${duplicate}`);
      }
    }

    const allowedMutableLayers = new Set<AtelierLayer>(layerPolicy.allowedMutableLayers);
    declaration.changes.forEach((change, index) => {
      if (!allowedMutableLayers.has(change.layer)) {
        addIssue(
          context,
          ["changes", index, "layer"],
          `${declaration.stage} may not mutate ${change.layer}.`,
        );
      }
      const expectedAction = declaration.correctionIntent.mode === "NONE"
        ? stagePolicy.action
        : "CORRECT";
      if (change.action !== expectedAction) {
        addIssue(
          context,
          ["changes", index, "action"],
          `${declaration.stage} requires ${expectedAction} change intent.`,
        );
      }
      const expectedDeltaCode = declaration.correctionIntent.mode === "NONE"
        ? stagePolicy.deltaCode
        : "CORRECT_AUTHORIZED_GATE_ONLY";
      if (change.deltaCode !== expectedDeltaCode) {
        addIssue(
          context,
          ["changes", index, "deltaCode"],
          `${declaration.stage} requires semantic delta ${expectedDeltaCode}.`,
        );
      }
    });

    for (const requiredLayer of layerPolicy.requiredImmutableLayers) {
      if (!immutableLayers.includes(requiredLayer)) {
        addIssue(
          context,
          ["immutables"],
          `${declaration.stage} must declare immutable ${requiredLayer} truth.`,
        );
      }
    }
    for (const layer of mutableLayers) {
      if (immutableLayers.includes(layer)) {
        addIssue(context, ["immutables"], `${layer} cannot be mutable and immutable.`);
      }
    }

    if (declaration.sceneIntent.kind !== stagePolicy.sceneKind) {
      addIssue(context, ["sceneIntent", "kind"], `${declaration.stage} requires ${stagePolicy.sceneKind}.`);
    }
    if (declaration.cameraIntent.framing !== stagePolicy.cameraFraming) {
      addIssue(
        context,
        ["cameraIntent", "framing"],
        `${declaration.stage} requires camera framing ${stagePolicy.cameraFraming}.`,
      );
    }
    if (declaration.cameraIntent.orientation !== stagePolicy.cameraOrientation) {
      addIssue(
        context,
        ["cameraIntent", "orientation"],
        `${declaration.stage} requires camera orientation ${stagePolicy.cameraOrientation}.`,
      );
    }
    if (declaration.poseIntent.grammar !== stagePolicy.poseGrammar) {
      addIssue(
        context,
        ["poseIntent", "grammar"],
        `${declaration.stage} requires pose grammar ${stagePolicy.poseGrammar}.`,
      );
    }
    if (declaration.poseIntent.lookBack !== stagePolicy.lookBack) {
      addIssue(
        context,
        ["poseIntent", "lookBack"],
        `${declaration.stage} look-back intent is fixed by its view grammar.`,
      );
    }
    if (declaration.stylingIntent.mode !== stagePolicy.stylingMode) {
      addIssue(
        context,
        ["stylingIntent", "mode"],
        `${declaration.stage} requires styling mode ${stagePolicy.stylingMode}.`,
      );
    }

    for (const duplicate of duplicates(declaration.poseIntent.adjustments)) {
      addIssue(context, ["poseIntent", "adjustments"], `Pose adjustment ${duplicate} is duplicated.`);
    }
    const poseIsMutable = mutableLayers.includes("POSE");
    if (poseIsMutable !== (declaration.poseIntent.adjustments.length > 0)) {
      addIssue(
        context,
        ["poseIntent", "adjustments"],
        "Pose adjustments must be present exactly when POSE is mutable.",
      );
    }

    if (declaration.sceneIntent.kind === "LOCKED_ATELIER_COMPOSITE") {
      for (const pixelLayer of ["ATELIER", "BRAND_ICON"] as const) {
        const immutable = declaration.immutables.find((item) => item.layer === pixelLayer);
        if (!immutable || immutable.preservation !== "PIXEL_EXACT") {
          addIssue(
            context,
            ["immutables"],
            `${pixelLayer} must be PIXEL_EXACT for deterministic room compositing.`,
          );
        }
      }
    }

    const rearStage = declaration.stage === "GARMENT_02_BACK"
      || declaration.stage === "SIBLING_07_CORE"
      || declaration.stage === "SIBLING_07_RECOVERY";
    if (rearStage && !declaration.rearEvidenceIntent) {
      addIssue(context, ["rearEvidenceIntent"], "Every rear-view declaration requires structured rear evidence intent.");
    }
    if (!rearStage && declaration.rearEvidenceIntent) {
      addIssue(context, ["rearEvidenceIntent"], "Rear evidence intent belongs only to garment 02 or a model 07 stage.");
    }
    if (declaration.rearEvidenceIntent) {
      const expectedRecovery = declaration.stage === "SIBLING_07_RECOVERY"
        ? "GYM_REAR_PROFILE_REQUIRED"
        : "CORE_ONLY";
      if (declaration.rearEvidenceIntent.recoveryEvidence !== expectedRecovery) {
        addIssue(
          context,
          ["rearEvidenceIntent", "recoveryEvidence"],
          `${declaration.stage} requires ${expectedRecovery}.`,
        );
      }
    }

    if (declaration.correctionIntent.mode === "BOUNDED_ONE_THING") {
      if (declaration.changes.length !== 1) {
        addIssue(context, ["changes"], "A bounded correction must change exactly one declared layer.");
      }
      const [change] = declaration.changes;
      if (change && (
        change.layer !== declaration.correctionIntent.targetLayer
        || !regionsEqual(change.region, declaration.correctionIntent.targetRegion)
      )) {
        addIssue(
          context,
          ["correctionIntent"],
          "The correction target must exactly match the single typed change.",
        );
      }
    }
  });

export type StudioAtelierDeclaration = z.infer<typeof studioAtelierDeclarationSchema>;

export const studioAtelierFileVerificationEvidenceSchema = z.object({
  status: z.literal("PASS"),
  verifiedAssetCount: z.number().int().positive(),
  verifiedAt: z.string().datetime({ offset: true }),
  manifestHash: sha256Schema,
  directGarmentEvidence: directGarmentEvidenceReceiptSchema.optional(),
}).strict();

export type StudioAtelierFileVerificationEvidence = z.infer<
  typeof studioAtelierFileVerificationEvidenceSchema
>;

/**
 * Server-owned resolver invoked after declaration canonicalization. A route may
 * submit declaration data, but it must never accept this executable dependency
 * or its returned evidence from a request body.
 */
export type StudioAtelierFileVerificationResolver = (
  declaration: Readonly<StudioAtelierDeclaration>,
) => z.input<typeof studioAtelierFileVerificationEvidenceSchema>;

const fileVerificationReceiptSchema = studioAtelierFileVerificationEvidenceSchema.extend({
  receiptHash: sha256Schema,
}).strict();

export const studioAtelierValidationReceiptSchema = z.object({
  sourceHash: sha256Schema,
  schemaVersion: declarationVersionSchema,
  validatorRevision: validatorRevisionSchema,
  fileVerification: fileVerificationReceiptSchema,
}).strict();

export type StudioAtelierValidationReceipt = z.infer<
  typeof studioAtelierValidationReceiptSchema
>;

const validatedStudioAtelierDeclarationSchema = z.object({
  declaration: studioAtelierDeclarationSchema,
  receipt: studioAtelierValidationReceiptSchema,
}).strict();

declare const validatedStudioAtelierDeclarationBrand: unique symbol;

/** Server-owned result of declaration validation and file verification. */
export type ValidatedStudioAtelierDeclaration = Readonly<z.infer<
  typeof validatedStudioAtelierDeclarationSchema
>> & Readonly<{ [validatedStudioAtelierDeclarationBrand]: true }>;

const trustedTruthSourceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PARENT"),
    role: parentRoleSchema,
  }).strict(),
  z.object({
    kind: z.literal("AUTHORITY"),
    role: authorityRoleSchema,
  }).strict(),
]);

const trustedImmutableBindingSchema = z.object({
  stage: atelierStageSchema,
  layer: layerSchema,
  source: trustedTruthSourceSchema,
}).strict();

const trustedCorrectionAuthorizationSchema = z.object({
  correctionOf: sha256Schema,
  failedGate: z.enum([
    "IDENTITY_DRIFT",
    "BODY_DRIFT",
    "GARMENT_TRUTH_DRIFT",
    "FULL_BODY_GEOMETRY_FAILURE",
    "PHOTOREALISM_FAILURE",
    "IMMUTABLE_TRUTH_DRIFT",
    "ATELIER_PIXEL_DRIFT",
    "WRONG_STAGE_VIEW",
    "SUBJECT_REFINEMENT_FAILURE",
  ]),
  targetLayer: layerSchema,
  targetRegion: studioAtelierRegionSchema,
  ordinal: z.literal(1),
  remainingBudget: z.literal(0),
}).strict();

const trustedStateProjectionSchema = z.object({
  schemaVersion: safeTokenSchema,
  workflowRevision: safeTokenSchema,
  garmentId: garmentIdSchema,
  sourceFileSha256: sha256Schema,
  allowedStages: z.array(atelierStageSchema).min(1),
  authorityManifest: z.object({
    revision: safeTokenSchema,
    fileSha256: sha256Schema,
  }).strict(),
}).strict();

const trustedStaticAuthorityManifestSchema = z.object({
  revision: safeTokenSchema,
  fileSha256: sha256Schema,
  authorities: z.array(authorityAssetSchema),
}).strict();

const trustedDynamicTruthSchema = z.object({
  sourceStateFileSha256: sha256Schema,
  authorities: z.array(authorityAssetSchema),
  parents: z.array(parentLockSchema),
  correctionAuthorization: trustedCorrectionAuthorizationSchema.optional(),
}).strict();

const trustedGarmentTruthSchema = z.object({
  revision: safeTokenSchema,
  sourceHash: sha256Schema,
  facts: z.array(semanticTextSchema).min(1),
  unknownFacts: z.array(semanticTextSchema),
  prohibitedInferences: z.array(semanticTextSchema),
  rearEvidenceBasis: z.enum(["DIRECT_GARMENT_BACK", "NO_DIRECT_GARMENT_BACK"]),
  directGarmentEvidence: directGarmentEvidenceReceiptSchema.optional(),
}).strict();

const staticAuthorityRoles = new Set<AuthorityRole>([
  "REAL_FACE_OPERATION_BOARD",
  "V4_TRANSLATION_LOCK",
  "LOCKED_ATELIER_ROOM",
  "BODY_FRONT_CANON",
  "BODY_SIDE_CANON",
  "BODY_BACK_CANON",
  "REAL_LULU_ANGLE_CONTACT",
  "REAL_LULU_GYM_REAR_PROFILE",
]);

const dynamicAuthorityRoles = new Set<AuthorityRole>([
  "DIRECT_GARMENT_EVIDENCE",
  "SUBJECT_A_TRANSLATION_DONOR",
  "GARMENT_FRONT_SAFEGUARD",
]);

export const trustedAtelierTruthBundleSchema = z.object({
  truthBundleVersion: z.literal(TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION),
  state: trustedStateProjectionSchema,
  staticAuthorityManifest: trustedStaticAuthorityManifestSchema,
  dynamicLockedTruth: trustedDynamicTruthSchema,
  garmentTruth: trustedGarmentTruthSchema,
  stylingAdvisory: fashionNovaCheckSchema.optional(),
  immutableBindings: z.array(trustedImmutableBindingSchema).min(1),
}).strict().superRefine((truth, context) => {
  if (
    truth.staticAuthorityManifest.revision !== truth.state.authorityManifest.revision
    || truth.staticAuthorityManifest.fileSha256 !== truth.state.authorityManifest.fileSha256
  ) {
    addIssue(
      context,
      ["staticAuthorityManifest"],
      "The resolved static authority manifest must exactly match the trusted state projection.",
    );
  }
  if (truth.dynamicLockedTruth.sourceStateFileSha256 !== truth.state.sourceFileSha256) {
    addIssue(
      context,
      ["dynamicLockedTruth", "sourceStateFileSha256"],
      "Dynamic locks must be resolved from the exact trusted state bytes.",
    );
  }
  for (const duplicate of duplicates(truth.state.allowedStages)) {
    addIssue(context, ["state", "allowedStages"], `Allowed stage ${duplicate} is duplicated.`);
  }
  for (const duplicate of duplicates(truth.staticAuthorityManifest.authorities.map((item) => item.role))) {
    addIssue(context, ["staticAuthorityManifest", "authorities"], `Static authority role ${duplicate} is duplicated.`);
  }
  for (const duplicate of duplicates(truth.dynamicLockedTruth.authorities.map((item) => item.role))) {
    addIssue(context, ["dynamicLockedTruth", "authorities"], `Dynamic authority role ${duplicate} is duplicated.`);
  }
  for (const duplicate of duplicates(truth.dynamicLockedTruth.parents.map((item) => item.role))) {
    addIssue(context, ["dynamicLockedTruth", "parents"], `Dynamic parent role ${duplicate} is duplicated.`);
  }
  const allAuthorityRoles = [
    ...truth.staticAuthorityManifest.authorities.map((item) => item.role),
    ...truth.dynamicLockedTruth.authorities.map((item) => item.role),
  ];
  for (const duplicate of duplicates(allAuthorityRoles)) {
    addIssue(context, ["dynamicLockedTruth", "authorities"], `Authority role ${duplicate} is ambiguous across truth sources.`);
  }

  truth.staticAuthorityManifest.authorities.forEach((authority, index) => {
    if (!staticAuthorityRoles.has(authority.role)) {
      addIssue(
        context,
        ["staticAuthorityManifest", "authorities", index, "role"],
        `${authority.role} must resolve from dynamic locked truth, not the static authority manifest.`,
      );
    }
  });
  truth.dynamicLockedTruth.authorities.forEach((authority, index) => {
    if (!dynamicAuthorityRoles.has(authority.role)) {
      addIssue(
        context,
        ["dynamicLockedTruth", "authorities", index, "role"],
        `${authority.role} must resolve from the exact static authority manifest.`,
      );
    }
    if (authority.garmentId !== truth.state.garmentId) {
      addIssue(
        context,
        ["dynamicLockedTruth", "authorities", index, "garmentId"],
        "Dynamic garment authority must match trusted state garment identity.",
      );
    }
  });
  const directAuthority = truth.dynamicLockedTruth.authorities.find((authority) =>
    authority.role === "DIRECT_GARMENT_EVIDENCE"
  );
  const directReceipt = truth.garmentTruth.directGarmentEvidence;
  if (directReceipt && (
    !directAuthority
    || directAuthority.assetId !== directReceipt.output.assetId
    || directAuthority.sha256 !== directReceipt.output.sha256
  )) {
    addIssue(
      context,
      ["garmentTruth", "directGarmentEvidence", "output"],
      "Trusted direct garment authority must equal the exact attested pack output.",
    );
  }
  truth.dynamicLockedTruth.parents.forEach((parent, index) => {
    if (parent.garmentId !== truth.state.garmentId) {
      addIssue(
        context,
        ["dynamicLockedTruth", "parents", index, "garmentId"],
        "Every dynamic parent must match trusted state garment identity.",
      );
    }
  });
  const bindingKeys = truth.immutableBindings.map((binding) => `${binding.stage}:${binding.layer}`);
  for (const duplicate of duplicates(bindingKeys)) {
    addIssue(context, ["immutableBindings"], `Immutable resolver binding ${duplicate} is duplicated.`);
  }
  for (const [field, values] of Object.entries({
    facts: truth.garmentTruth.facts,
    unknownFacts: truth.garmentTruth.unknownFacts,
    prohibitedInferences: truth.garmentTruth.prohibitedInferences,
  })) {
    for (const duplicate of duplicates(values)) {
      addIssue(context, ["garmentTruth", field], `Trusted garment truth duplicates: ${duplicate}`);
    }
  }
});

export type TrustedAtelierTruthBundleInput = z.input<
  typeof trustedAtelierTruthBundleSchema
>;

/**
 * Executable server dependency that resolves the exact state, authority
 * manifest, garment truth and dynamic locks. JSON request bodies cannot
 * satisfy this boundary.
 */
export type TrustedAtelierTruthResolver = () => TrustedAtelierTruthBundleInput;

declare const trustedAtelierTruthBundleBrand: unique symbol;

/**
 * Server-owned truth resolved from exact state bytes, the private authority
 * manifest and the dynamic lock projection. Route/UI payloads are never this
 * type and must not be passed to the compiler as truth.
 */
export type TrustedAtelierTruthBundle = z.infer<
  typeof trustedAtelierTruthBundleSchema
> & Readonly<{ [trustedAtelierTruthBundleBrand]: true }>;

export const trustedAtelierTruthReceiptSchema = z.object({
  bundleVersion: z.literal(TRUSTED_ATELIER_TRUTH_BUNDLE_VERSION),
  stateFileHash: sha256Schema,
  manifestRevision: safeTokenSchema,
  manifestHash: sha256Schema,
  garmentTruthRevision: safeTokenSchema,
  garmentTruthSourceHash: sha256Schema,
  directGarmentEvidence: directGarmentEvidenceReceiptSchema.optional(),
}).strict();

export type TrustedAtelierTruthReceipt = z.infer<
  typeof trustedAtelierTruthReceiptSchema
>;

export type AtelierDeclarationCompilationErrorCode =
  | "INVALID_DECLARATION"
  | "INVALID_VALIDATION_RECEIPT"
  | "INVALID_TRUST_BUNDLE"
  | "TRUTH_SOURCE_MISMATCH"
  | "STAGE_NOT_AUTHORIZED"
  | "MISSING_AUTHORITY"
  | "MISSING_PARENT"
  | "INVALID_IMMUTABLE_BINDING"
  | "INVALID_CORRECTION_AUTHORIZATION"
  | "COMPILED_OPERATION_INVALID";

export class AtelierDeclarationCompilationError extends Error {
  constructor(
    readonly code: AtelierDeclarationCompilationErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = Object.freeze({}),
  ) {
    super(message);
    this.name = "AtelierDeclarationCompilationError";
  }
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function isGarmentEvidenceStage(stage: AtelierStage): boolean {
  return stage === "GARMENT_01_FRONT"
    || stage === "GARMENT_02_BACK"
    || stage === "GARMENT_03_MANNEQUIN"
    || stage === "GARMENT_04_DETAIL";
}

function sortCanonical<T>(values: readonly T[]): T[] {
  return [...values].sort((left, right) => compareText(
    canonicalStringify(left),
    canonicalStringify(right),
  ));
}

function canonicalStudioAtelierDeclaration(raw: unknown): StudioAtelierDeclaration {
  const declaration = studioAtelierDeclarationSchema.parse(raw);
  const normalized: StudioAtelierDeclaration = {
    ...declaration,
    changes: sortCanonical(declaration.changes),
    immutables: [...declaration.immutables]
      .sort((left, right) => compareText(left.layer, right.layer)),
    garmentIntent: {
      ...declaration.garmentIntent,
      facts: [...declaration.garmentIntent.facts].sort(compareText),
      unknownFacts: [...declaration.garmentIntent.unknownFacts].sort(compareText),
      prohibitedInferences: [...declaration.garmentIntent.prohibitedInferences].sort(compareText),
    },
    poseIntent: {
      ...declaration.poseIntent,
      adjustments: [...declaration.poseIntent.adjustments].sort(compareText),
    },
  };
  if (declaration.stylingIntent.mode === "FASHION_NOVA_ADVISORY") {
    normalized.stylingIntent = {
      ...declaration.stylingIntent,
      check: {
        ...declaration.stylingIntent.check,
        matchedGarmentFacts: [
          ...declaration.stylingIntent.check.matchedGarmentFacts,
        ].sort(compareText),
      },
    };
  }
  return normalized;
}

function declarationSourceHash(declaration: StudioAtelierDeclaration): string {
  return sha256Text(canonicalStringify(declaration));
}

function sortedText(values: readonly string[]): string[] {
  return [...values].sort(compareText);
}

function assertGarmentIntentMatchesTruth(
  declaration: StudioAtelierDeclaration,
  truth: TrustedAtelierTruthBundle,
): void {
  const declaredGarmentTruth = {
    facts: sortedText(declaration.garmentIntent.facts),
    unknownFacts: sortedText(declaration.garmentIntent.unknownFacts),
    prohibitedInferences: sortedText(declaration.garmentIntent.prohibitedInferences),
  };
  const resolvedGarmentTruth = {
    facts: sortedText(truth.garmentTruth.facts),
    unknownFacts: sortedText(truth.garmentTruth.unknownFacts),
    prohibitedInferences: sortedText(truth.garmentTruth.prohibitedInferences),
  };
  if (canonicalStringify(declaredGarmentTruth) !== canonicalStringify(resolvedGarmentTruth)) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "Declaration garment intent does not exactly match trusted garment truth.",
    );
  }
  if (
    declaration.rearEvidenceIntent
    && declaration.rearEvidenceIntent.basis !== truth.garmentTruth.rearEvidenceBasis
  ) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "Declaration rear-evidence basis does not match trusted garment truth.",
      Object.freeze({
        declaredBasis: declaration.rearEvidenceIntent.basis,
        trustedBasis: truth.garmentTruth.rearEvidenceBasis,
      }),
    );
  }
}

function trustedFashionNovaCheck(
  declaration: StudioAtelierDeclaration,
  truth: TrustedAtelierTruthBundle,
): z.infer<typeof fashionNovaCheckSchema> | undefined {
  if (declaration.stylingIntent.mode !== "FASHION_NOVA_ADVISORY") {
    return undefined;
  }
  const trusted = truth.stylingAdvisory;
  if (!trusted) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "The final-05 declaration requires a trusted styling advisory result.",
    );
  }
  if (canonicalStringify(declaration.stylingIntent.check) !== canonicalStringify(trusted)) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "Declaration styling evidence does not exactly match trusted styling truth.",
    );
  }
  return trusted;
}

function trustedDirectGarmentEvidence(input: Readonly<{
  declaration: StudioAtelierDeclaration;
  validationReceipt: StudioAtelierValidationReceipt;
  truth: TrustedAtelierTruthBundle;
}>): DirectGarmentEvidenceReceipt | undefined {
  if (!isGarmentEvidenceStage(input.declaration.stage)) return undefined;
  const verified = input.validationReceipt.fileVerification.directGarmentEvidence;
  const trusted = input.truth.garmentTruth.directGarmentEvidence;
  if (
    !verified
    || !trusted
    || canonicalStringify(verified) !== canonicalStringify(trusted)
  ) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "The validated direct garment source receipt must exactly match trusted garment truth.",
      Object.freeze({ stage: input.declaration.stage }),
    );
  }
  return trusted;
}

function fileVerificationReceiptHash(input: Readonly<{
  sourceHash: string;
  schemaVersion: typeof STUDIO_ATELIER_DECLARATION_VERSION;
  validatorRevision: typeof STUDIO_ATELIER_DECLARATION_VALIDATOR_REVISION;
  fileVerification: StudioAtelierFileVerificationEvidence;
}>): string {
  return sha256Text(canonicalStringify(input));
}

function assertDirectGarmentFileVerification(input: Readonly<{
  declaration: StudioAtelierDeclaration;
  fileVerification: StudioAtelierFileVerificationEvidence;
}>): void {
  if (!isGarmentEvidenceStage(input.declaration.stage)) return;
  const receipt = input.fileVerification.directGarmentEvidence;
  if (!receipt || input.fileVerification.verifiedAssetCount < receipt.constituents.length) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_VALIDATION_RECEIPT",
      "Garment 01-04 requires file verification for every attested direct source constituent.",
      Object.freeze({
        stage: input.declaration.stage,
        verifiedAssetCount: input.fileVerification.verifiedAssetCount,
        requiredSourceAssetCount: receipt?.constituents.length ?? null,
      }),
    );
  }
}

/**
 * Server-owned declaration/file-verification boundary. Callers may submit a
 * declaration, but routes and UI must never author or forward a receipt.
 */
export function validateStudioAtelierDeclaration(
  rawDeclaration: unknown,
  server: Readonly<{
    resolveFileVerification: StudioAtelierFileVerificationResolver;
  }>,
): ValidatedStudioAtelierDeclaration {
  let declaration: StudioAtelierDeclaration;
  try {
    declaration = canonicalStudioAtelierDeclaration(rawDeclaration);
  } catch (error) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_DECLARATION",
      "The Studio Atelier declaration is invalid.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
  let fileVerification: StudioAtelierFileVerificationEvidence;
  try {
    fileVerification = studioAtelierFileVerificationEvidenceSchema.parse(
      server.resolveFileVerification(Object.freeze(declaration)),
    );
    assertDirectGarmentFileVerification({ declaration, fileVerification });
  } catch (error) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_VALIDATION_RECEIPT",
      "A declaration requires complete passing file-verification evidence.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
  const sourceHash = declarationSourceHash(declaration);
  const receiptHash = fileVerificationReceiptHash({
    sourceHash,
    schemaVersion: declaration.declarationVersion,
    validatorRevision: STUDIO_ATELIER_DECLARATION_VALIDATOR_REVISION,
    fileVerification,
  });
  const receipt = studioAtelierValidationReceiptSchema.parse({
    sourceHash,
    schemaVersion: declaration.declarationVersion,
    validatorRevision: STUDIO_ATELIER_DECLARATION_VALIDATOR_REVISION,
    fileVerification: {
      ...fileVerification,
      receiptHash,
    },
  });
  return Object.freeze({
    declaration: Object.freeze(declaration),
    receipt: Object.freeze(receipt),
  }) as ValidatedStudioAtelierDeclaration;
}

function parseValidatedDeclaration(raw: unknown): ValidatedStudioAtelierDeclaration {
  let validated: z.infer<typeof validatedStudioAtelierDeclarationSchema>;
  try {
    validated = validatedStudioAtelierDeclarationSchema.parse(raw);
  } catch (error) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_VALIDATION_RECEIPT",
      "The declaration validation receipt is malformed.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
  const declaration = canonicalStudioAtelierDeclaration(validated.declaration);
  const expectedHash = declarationSourceHash(declaration);
  if (validated.receipt.sourceHash !== expectedHash) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_VALIDATION_RECEIPT",
      "The validation receipt does not bind the canonical declaration bytes.",
      Object.freeze({
        expectedSourceHash: expectedHash,
        receivedSourceHash: validated.receipt.sourceHash,
      }),
    );
  }
  const { receiptHash, ...fileVerification } = validated.receipt.fileVerification;
  const expectedReceiptHash = fileVerificationReceiptHash({
    sourceHash: validated.receipt.sourceHash,
    schemaVersion: validated.receipt.schemaVersion,
    validatorRevision: validated.receipt.validatorRevision,
    fileVerification,
  });
  if (receiptHash !== expectedReceiptHash) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_VALIDATION_RECEIPT",
      "The file-verification receipt hash does not bind its exact evidence.",
      Object.freeze({ expectedReceiptHash, receivedReceiptHash: receiptHash }),
    );
  }
  assertDirectGarmentFileVerification({ declaration, fileVerification });
  return Object.freeze({
    declaration,
    receipt: validated.receipt,
  }) as ValidatedStudioAtelierDeclaration;
}

function parseTrustedTruth(raw: unknown): TrustedAtelierTruthBundle {
  try {
    return trustedAtelierTruthBundleSchema.parse(raw) as TrustedAtelierTruthBundle;
  } catch (error) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_TRUST_BUNDLE",
      "The trusted Atelier truth bundle is invalid.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
}

/**
 * Server-owned trust-construction boundary. The injected resolver must read
 * and verify the exact state/manifest/garment/lock sources; routes and UI must
 * never accept the resolver or its raw return value from a request.
 */
export function resolveTrustedAtelierTruthBundle(
  server: Readonly<{ resolveTrustedTruth: TrustedAtelierTruthResolver }>,
): TrustedAtelierTruthBundle {
  try {
    return parseTrustedTruth(server.resolveTrustedTruth());
  } catch (error) {
    if (error instanceof AtelierDeclarationCompilationError) throw error;
    throw new AtelierDeclarationCompilationError(
      "INVALID_TRUST_BUNDLE",
      "The trusted Atelier truth resolver failed.",
      Object.freeze({ reason: error instanceof Error ? error.message : "resolver failure" }),
    );
  }
}

/** Exact non-path provenance persisted beside the declaration receipt. */
export function deriveTrustedAtelierTruthReceipt(
  rawTruth: TrustedAtelierTruthBundle,
): TrustedAtelierTruthReceipt {
  const truth = parseTrustedTruth(rawTruth);
  return Object.freeze(trustedAtelierTruthReceiptSchema.parse({
    bundleVersion: truth.truthBundleVersion,
    stateFileHash: truth.state.sourceFileSha256,
    manifestRevision: truth.staticAuthorityManifest.revision,
    manifestHash: truth.staticAuthorityManifest.fileSha256,
    garmentTruthRevision: truth.garmentTruth.revision,
    garmentTruthSourceHash: truth.garmentTruth.sourceHash,
    ...(truth.garmentTruth.directGarmentEvidence
      ? { directGarmentEvidence: truth.garmentTruth.directGarmentEvidence }
      : {}),
  }));
}

const namedRegionText = Object.freeze({
  FACE_TRANSLATION: "face identity translation",
  GARMENT_CONSTRUCTION: "garment construction",
  GARMENT_SURFACE: "garment surface",
  HAIR: "hair",
  LEFT_HAND: "left hand",
  RIGHT_HAND: "right hand",
  FOOTWEAR: "footwear",
  ATELIER_SUBJECT_PLACEMENT: "subject placement within the locked atelier canvas",
  CAMERA_ALIGNMENT: "camera alignment",
  POSE_ALIGNMENT: "pose alignment",
  LIGHTING_INTEGRATION: "subject lighting integration",
  OUTPUT_GEOMETRY: "output geometry",
  GARMENT_PRESENTATION: "complete garment presentation",
  MANNEQUIN_PRESENTATION: "anonymous neutral mannequin presentation",
  VISIBLE_DETAIL: "visible garment detail",
} as const);

const changeDeltaText = Object.freeze({
  PRESENT_DIRECT_GARMENT_FRONT:
    "Present the complete visible garment front from direct garment evidence only.",
  PRESENT_DIRECT_OR_CONSERVATIVE_GARMENT_BACK:
    "Present direct visible rear truth when available; otherwise use an explicitly conservative inferred rear presentation.",
  PRESENT_ON_ANONYMOUS_NEUTRAL_MANNEQUIN:
    "Present the garment on an anonymous neutral mannequin without importing source environment, identity or body authority.",
  PRESENT_VISIBLE_GARMENT_DETAIL:
    "Present one close visible garment detail without fibre, composition or hidden-construction claims.",
  CREATE_GARMENT_SPECIFIC_SUBJECT:
    "Create the first coherent garment-specific subject translation.",
  REFINE_IDENTITY_TRANSLATION:
    "Refine identity translation without reopening garment or hair truth.",
  COMPOSITE_ACCEPTED_SUBJECT_OVER_LOCKED_ROOM:
    "Place the accepted subject over the exact native locked atelier room without repainting or transforming room pixels.",
  REORIENT_ACCEPTED_05_TO_LEFT_PROFILE:
    "Create the independent soft-left-profile sibling from accepted 05.",
  REORIENT_ACCEPTED_05_TO_RIGHT_REAR_3Q:
    "Create the independent right-rear-three-quarter sibling from accepted 05.",
  RECOVER_RIGHT_REAR_3Q_WITH_REAR_PROFILE:
    "Recover the right-rear-three-quarter sibling using the authorized rear-profile evidence.",
  CORRECT_AUTHORIZED_GATE_ONLY:
    "Correct only the exact authorized failed gate and preserve every other accepted truth.",
} as const);

const footwearDirectionText = Object.freeze({
  RESTRAINED_BLACK_HEELS: "restrained black heels",
  MINIMAL_NEUTRAL_FOOTWEAR: "minimal neutral footwear",
  PRESERVE_SOURCE_SUPPORTED_FOOTWEAR: "preserve source-supported footwear",
} as const);

const accessoryDirectionText = Object.freeze({
  MINIMAL_GOLD_ACCESSORIES: "minimal gold accessories",
  MINIMAL_NEUTRAL_ACCESSORIES: "minimal neutral accessories",
  NO_ADDED_ACCESSORIES: "no added accessories",
} as const);

function regionText(region: StudioAtelierRegion): string {
  return region.kind === "WHOLE_LAYER"
    ? "whole declared layer"
    : namedRegionText[region.code];
}

function resolveAuthorities(
  stage: AtelierStage,
  truth: TrustedAtelierTruthBundle,
): AuthorityAsset[] {
  const byRole = new Map<AuthorityRole, AuthorityAsset>([
    ...truth.staticAuthorityManifest.authorities,
    ...truth.dynamicLockedTruth.authorities,
  ].map((authority) => [authority.role, authority]));
  return ATELIER_STAGE_RECIPES[stage].authorityRoles.map((role) => {
    const authority = byRole.get(role);
    if (!authority) {
      throw new AtelierDeclarationCompilationError(
        "MISSING_AUTHORITY",
        `Trusted truth did not resolve required authority ${role}.`,
        Object.freeze({ stage, role }),
      );
    }
    return authority;
  });
}

function resolveParents(
  stage: AtelierStage,
  truth: TrustedAtelierTruthBundle,
): ParentLock[] {
  const byRole = new Map<ParentRole, ParentLock>(
    truth.dynamicLockedTruth.parents.map((parent) => [parent.role, parent]),
  );
  return ATELIER_STAGE_RECIPES[stage].parentRoles.map((role) => {
    const parent = byRole.get(role);
    if (!parent) {
      throw new AtelierDeclarationCompilationError(
        "MISSING_PARENT",
        `Trusted state did not resolve required parent ${role}.`,
        Object.freeze({ stage, role }),
      );
    }
    return parent;
  });
}

function resolveImmutableSet(input: {
  declaration: StudioAtelierDeclaration;
  truth: TrustedAtelierTruthBundle;
  authorities: readonly AuthorityAsset[];
  parents: readonly ParentLock[];
}): AtelierOperation["immutableSet"] {
  const { declaration, truth, authorities, parents } = input;
  const bindings = truth.immutableBindings.filter((binding) =>
    binding.stage === declaration.stage
  );
  const declaredLayers = declaration.immutables.map((item) => item.layer);
  const boundLayers = bindings.map((item) => item.layer);
  if (
    declaredLayers.length !== boundLayers.length
    || declaredLayers.some((layer) => !boundLayers.includes(layer))
  ) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_IMMUTABLE_BINDING",
      "Trusted truth must bind every declared immutable layer exactly once and no others.",
      Object.freeze({
        stage: declaration.stage,
        declaredLayers: [...declaredLayers].sort(compareText),
        boundLayers: [...boundLayers].sort(compareText),
      }),
    );
  }
  const authorityByRole = new Map(authorities.map((authority) => [authority.role, authority]));
  const parentByRole = new Map(parents.map((parent) => [parent.role, parent]));
  const declaredImmutableSet = declaration.immutables.map((immutable) => {
    const binding = bindings.find((candidate) => candidate.layer === immutable.layer);
    if (!binding) {
      throw new AtelierDeclarationCompilationError(
        "INVALID_IMMUTABLE_BINDING",
        `Trusted truth did not bind immutable ${immutable.layer}.`,
      );
    }
    const source = binding.source.kind === "PARENT"
      ? parentByRole.get(binding.source.role)
      : authorityByRole.get(binding.source.role);
    if (!source) {
      throw new AtelierDeclarationCompilationError(
        "INVALID_IMMUTABLE_BINDING",
        `Immutable ${immutable.layer} points to unavailable trusted ${binding.source.kind.toLowerCase()} ${binding.source.role}.`,
      );
    }
    return {
      layer: immutable.layer,
      assetId: source.assetId,
      sha256: source.sha256,
    };
  });
  // Every parent is immutable by definition. Inject its exact tuple even when
  // several independently locked garment views protect the same semantic
  // GARMENT layer; the caller cannot choose or omit these server-owned locks.
  const immutableSet = [...declaredImmutableSet];
  for (const parent of parents) {
    const present = immutableSet.some((immutable) =>
      immutable.layer === parent.lockedLayer
      && immutable.assetId === parent.assetId
      && immutable.sha256 === parent.sha256
    );
    if (!present) {
      immutableSet.push({
        layer: parent.lockedLayer,
        assetId: parent.assetId,
        sha256: parent.sha256,
      });
    }
  }
  return immutableSet;
}

const renderQualityContract: AtelierOperation["renderQualityContract"] = {
  photographicRealism: "one coherent natural catalogue photograph",
  skinTexture: "natural pores, restrained tonal variation and believable highlight rolloff",
  garmentTexture: "source-supported texture, folds, tension, drape and sheen only",
  lightingIntegration: "one shared plausible light field, colour temperature and contact shadow",
  opticsPerspective: "level natural catalogue perspective with preserved stature and uniform scale",
  artifactRejection: [
    "no plastic, poreless or beauty-filtered skin",
    "no pasted texture, uniform noise or cutout halo",
    "no synthetic HDR, CGI sheen or wide-angle body distortion",
  ],
};

const commonFailureGates = Object.freeze([
  "identity drift",
  "body drift",
  "garment redesign or unsupported construction",
  "cropped or malformed full body",
  "photographic realism or texture failure",
  "immutable truth drift",
]);

const garmentFailureGates = Object.freeze([
  "direct garment evidence missing or misbound",
  "garment redesign or unsupported construction",
  "invented surface, fibre or hidden-construction claim",
  "wrong garment semantic view",
  "presentation board, labels, watermark or multi-frame output",
  "photographic realism or texture failure",
  "immutable garment truth drift",
]);

const stageFailureGates = Object.freeze({
  GARMENT_01_FRONT: Object.freeze(["front view does not preserve direct visible front truth"]),
  GARMENT_02_BACK: Object.freeze(["rear inference represented as direct evidence"]),
  GARMENT_03_MANNEQUIN: Object.freeze([
    "mannequin is identifiable or non-neutral",
    "source room, Lulu identity, body canon or atelier leaked into presentation",
  ]),
  GARMENT_04_DETAIL: Object.freeze([
    "detail claims fibre composition or hidden construction",
    "detail is not visibly supported by direct garment evidence",
  ]),
  SUBJECT_A: Object.freeze(["subject staging rendered as a presentation board"]),
  SUBJECT_B: Object.freeze(["failed bounded subject refinement"]),
  ROOM_FINAL_05: Object.freeze(["atelier or wall-icon pixel mutation", "wrong front-master view"]),
  SIBLING_06: Object.freeze(["atelier or wall-icon pixel mutation", "wrong left-profile view"]),
  SIBLING_07_CORE: Object.freeze(["atelier or wall-icon pixel mutation", "wrong right-rear-three-quarter view"]),
  SIBLING_07_RECOVERY: Object.freeze(["atelier or wall-icon pixel mutation", "wrong right-rear-three-quarter recovery view"]),
} as const satisfies Record<AtelierStage, readonly string[]>);

function compileStylingSpec(
  intent: StudioAtelierDeclaration["stylingIntent"],
  advisory: z.infer<typeof fashionNovaCheckSchema> | undefined,
): Record<string, z.infer<typeof z.json>> {
  if (intent.mode === "DECLARE_SUBJECT_DIRECTION") {
    return {
      mode: intent.mode,
      hairPolicy: intent.hairPolicy,
      footwearDirection: footwearDirectionText[intent.footwearDirectionCode],
      accessoryDirection: accessoryDirectionText[intent.accessoryDirectionCode],
    };
  }
  if (intent.mode === "FASHION_NOVA_ADVISORY") {
    if (!advisory) {
      throw new AtelierDeclarationCompilationError(
        "TRUTH_SOURCE_MISMATCH",
        "The trusted styling advisory was not resolved.",
      );
    }
    return {
      mode: intent.mode,
      hairPolicy: intent.hairPolicy,
      decision: advisory.decision,
      selectedStylingDirection: advisory.selectedStylingDirection,
    };
  }
  if (intent.mode === "GARMENT_ONLY_NO_STYLING"
    || intent.mode === "ANONYMOUS_NEUTRAL_MANNEQUIN"
    || intent.mode === "DETAIL_ONLY_NO_STYLING") {
    return { mode: intent.mode };
  }
  return {
    mode: intent.mode,
    hairPolicy: intent.hairPolicy,
  };
}

function compileCorrection(input: {
  declaration: StudioAtelierDeclaration;
  truth: TrustedAtelierTruthBundle;
}): Pick<AtelierOperation, "correctionBudget" | "correctionOf"> {
  const { declaration, truth } = input;
  if (declaration.correctionIntent.mode === "NONE") {
    if (truth.dynamicLockedTruth.correctionAuthorization) {
      throw new AtelierDeclarationCompilationError(
        "INVALID_CORRECTION_AUTHORIZATION",
        "Trusted correction authorization was supplied for a non-correction declaration.",
      );
    }
    return { correctionBudget: 1, correctionOf: undefined };
  }
  const authorization = truth.dynamicLockedTruth.correctionAuthorization;
  if (!authorization) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_CORRECTION_AUTHORIZATION",
      "A bounded correction requires trusted stored-lineage authorization.",
    );
  }
  const requested = {
    correctionOf: declaration.correctionIntent.correctionOf,
    failedGate: declaration.correctionIntent.failedGate,
    targetLayer: declaration.correctionIntent.targetLayer,
    targetRegion: declaration.correctionIntent.targetRegion,
    ordinal: declaration.correctionIntent.ordinal,
    remainingBudget: 0,
  };
  if (canonicalStringify(requested) !== canonicalStringify(authorization)) {
    throw new AtelierDeclarationCompilationError(
      "INVALID_CORRECTION_AUTHORIZATION",
      "The declaration correction intent does not exactly match trusted stored-lineage authorization.",
    );
  }
  return {
    correctionOf: authorization.correctionOf,
    correctionBudget: authorization.remainingBudget,
  };
}

/**
 * Compile a validated simple Studio declaration into the strict semantic
 * operation. All asset identity, hashes, roles, review state and lineage come
 * exclusively from the server-owned trusted state/manifest/lock bundle. Never
 * accept either branded input from a route or UI payload.
 */
export function compileAtelierOperationV1(input: Readonly<{
  validatedDeclaration: ValidatedStudioAtelierDeclaration;
  truth: TrustedAtelierTruthBundle;
}>): AtelierOperation {
  const validated = parseValidatedDeclaration(input.validatedDeclaration);
  const truth = parseTrustedTruth(input.truth);
  const declaration = validated.declaration;
  if (truth.state.garmentId !== declaration.garmentId) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "The declaration garment does not match the trusted state projection.",
      Object.freeze({
        declarationGarmentId: declaration.garmentId,
        trustedGarmentId: truth.state.garmentId,
      }),
    );
  }
  assertGarmentIntentMatchesTruth(declaration, truth);
  const fashionNovaCheck = trustedFashionNovaCheck(declaration, truth);
  const directGarmentEvidence = trustedDirectGarmentEvidence({
    declaration,
    validationReceipt: validated.receipt,
    truth,
  });
  const verifiedManifestHash = validated.receipt.fileVerification.manifestHash;
  if (
    !verifiedManifestHash
    || verifiedManifestHash !== truth.staticAuthorityManifest.fileSha256
  ) {
    throw new AtelierDeclarationCompilationError(
      "TRUTH_SOURCE_MISMATCH",
      "The validated declaration must bind the exact trusted static authority manifest.",
      Object.freeze({
        verifiedManifestHash: verifiedManifestHash ?? null,
        trustedManifestHash: truth.staticAuthorityManifest.fileSha256,
      }),
    );
  }
  if (!truth.state.allowedStages.includes(declaration.stage)) {
    throw new AtelierDeclarationCompilationError(
      "STAGE_NOT_AUTHORIZED",
      `${declaration.stage} is not authorized by the trusted state projection.`,
    );
  }

  const authorities = resolveAuthorities(declaration.stage, truth);
  const parents = resolveParents(declaration.stage, truth);
  const immutableSet = resolveImmutableSet({ declaration, truth, authorities, parents });
  const correction = compileCorrection({ declaration, truth });
  const rearEvidence = declaration.rearEvidenceIntent;
  const garmentStage = isGarmentEvidenceStage(declaration.stage);
  const subjectStage = declaration.stage === "SUBJECT_A"
    || declaration.stage === "SUBJECT_B";
  const garmentPolicyInferences = [
    "do not infer garment construction beyond visible direct evidence",
    "do not invent garment surface or material facts beyond source-supported evidence",
    ...(declaration.stage === "GARMENT_02_BACK" && rearEvidence?.basis === "NO_DIRECT_GARMENT_BACK"
      ? ["quarantine conservative rear inference; never represent it as direct garment evidence"]
      : []),
    ...(declaration.stage === "GARMENT_03_MANNEQUIN"
      ? [
          "use an anonymous neutral mannequin only",
          "do not import Lulu identity, Lulu body canon, source environment, atelier or brand icon",
        ]
      : []),
    ...(declaration.stage === "GARMENT_04_DETAIL"
      ? [
          "do not claim fibre composition or material identity from appearance",
          "do not invent hidden construction outside visible direct evidence",
        ]
      : []),
  ];

  const rawOperation = {
    contractVersion: "juw.atelier-operation.v1" as const,
    workflowRevision: truth.state.workflowRevision,
    ...(declaration.wardrobeItemId ? { wardrobeItemId: declaration.wardrobeItemId } : {}),
    garmentId: declaration.garmentId,
    stage: declaration.stage,
    view: ATELIER_STAGE_RECIPES[declaration.stage].view,
    parentLocks: parents,
    authorityStack: authorities,
    changeSet: declaration.changes.map((change) => ({
      mutableLayer: change.layer,
      region: regionText(change.region),
      intendedDelta: changeDeltaText[change.deltaCode],
    })),
    immutableSet,
    garmentFacts: truth.garmentTruth.facts,
    unknownFacts: truth.garmentTruth.unknownFacts,
    prohibitedInferences: [
      ...truth.garmentTruth.prohibitedInferences,
      ...garmentPolicyInferences,
    ],
    sceneSpec: {
      kind: declaration.sceneIntent.kind,
      backgroundPolicy: declaration.sceneIntent.backgroundPolicy,
      atelierPolicy: declaration.sceneIntent.atelierPolicy,
      brandIconPolicy: declaration.sceneIntent.brandIconPolicy,
      immutablePixelLayers: declaration.immutables
        .filter((item) => item.preservation === "PIXEL_EXACT")
        .map((item) => item.layer)
        .sort(compareText),
    },
    cameraSpec: declaration.cameraIntent,
    poseSpec: declaration.poseIntent,
    stylingSpec: compileStylingSpec(declaration.stylingIntent, fashionNovaCheck),
    renderQualityContract,
    outputContract: {
      imageCount: 1 as const,
      layout: "SINGLE_CLEAN_FULL_IMAGE" as const,
      renderedText: false as const,
      labels: false as const,
      targetView: ATELIER_STAGE_RECIPES[declaration.stage].view,
      canvas: { width: 1024 as const, height: 1536 as const },
      ...(garmentStage
        ? {
            mode: "GENERATIVE_GARMENT_MEDIA" as const,
            fullBody: declaration.stage !== "GARMENT_04_DETAIL",
            generatedArtifact: {
              kind: declaration.stage === "GARMENT_03_MANNEQUIN"
                ? "MANNEQUIN_VIEW" as const
                : declaration.stage === "GARMENT_04_DETAIL"
                  ? "DETAIL_VIEW" as const
                  : "GARMENT_VIEW" as const,
              format: "JPEG" as const,
              alpha: "OPAQUE" as const,
              background: "NEUTRAL_PRODUCT_STAGE" as const,
            },
            deterministicComposite: null,
            finalFormat: "JPEG" as const,
          }
        : subjectStage
        ? {
            mode: "GENERATIVE_FULL_FRAME" as const,
            fullBody: true as const,
            generatedArtifact: {
              kind: "FULL_FRAME" as const,
              format: "JPEG" as const,
              alpha: "OPAQUE" as const,
              background: "NEUTRAL_STAGE" as const,
            },
            deterministicComposite: null,
            finalFormat: "JPEG" as const,
          }
        : {
            mode: "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE" as const,
            fullBody: true as const,
            generatedArtifact: {
              kind: "SUBJECT_LAYER" as const,
              format: "PNG" as const,
              alpha: "REQUIRED" as const,
              background: "TRANSPARENT" as const,
            },
            deterministicComposite: {
              method: "APP_OWNED_EXACT_PIXEL_COMPOSITE" as const,
              lockedRoomRole: "LOCKED_ATELIER_ROOM" as const,
              preserveLockedRoomPixels: true as const,
              outputFormat: "PNG" as const,
              ...STUDIO_ATELIER_NATIVE_ROOM_COMPOSITE_POLICY,
            },
            finalFormat: "PNG" as const,
          }),
    },
    failureGates: [
      ...(garmentStage ? garmentFailureGates : commonFailureGates),
      ...stageFailureGates[declaration.stage],
    ],
    rearInference: rearEvidence
      ? {
          inferred: rearEvidence.basis === "NO_DIRECT_GARMENT_BACK",
          basis: rearEvidence.basis,
          mayBecomeDirectEvidence: false as const,
        }
      : undefined,
    fashionNovaCheck,
    correctionOf: correction.correctionOf,
    correctionBudget: correction.correctionBudget,
    ...(directGarmentEvidence ? { directGarmentEvidence } : {}),
  };

  try {
    return canonicalAtelierOperation(rawOperation);
  } catch (error) {
    const parsed = atelierOperationSchema.safeParse(rawOperation);
    throw new AtelierDeclarationCompilationError(
      "COMPILED_OPERATION_INVALID",
      "Trusted declaration compilation did not satisfy juw.atelier-operation.v1.",
      Object.freeze({
        reason: error instanceof Error ? error.message : "schema validation failed",
        issues: parsed.success ? [] : parsed.error.issues,
      }),
    );
  }
}

export type CompiledAtelierOperationWithReceiptsV1 = Readonly<{
  operation: AtelierOperation;
  declarationReceipt: StudioAtelierValidationReceipt;
  truthReceipt: TrustedAtelierTruthReceipt;
}>;

/**
 * Persistence-safe compiler envelope. Server façades should use this form so
 * the exact declaration and truth receipts cannot be accidentally dropped
 * between compilation and durable prepare.
 */
export function compileAtelierOperationWithReceiptsV1(input: Readonly<{
  validatedDeclaration: ValidatedStudioAtelierDeclaration;
  truth: TrustedAtelierTruthBundle;
}>): CompiledAtelierOperationWithReceiptsV1 {
  const validated = parseValidatedDeclaration(input.validatedDeclaration);
  const truth = parseTrustedTruth(input.truth);
  return Object.freeze({
    operation: compileAtelierOperationV1({
      validatedDeclaration: validated,
      truth,
    }),
    declarationReceipt: Object.freeze(validated.receipt),
    truthReceipt: deriveTrustedAtelierTruthReceipt(truth),
  });
}
