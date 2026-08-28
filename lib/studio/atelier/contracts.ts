import { z } from "zod";
import { STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION } from "./canvas-policy";
import { studioAtelierG004ProviderDenial } from "./g004-provider-denial";

const safeIdPattern = /^[a-zA-Z0-9._:/-]+$/;
const sha256Pattern = /^[a-f0-9]{64}$/;

export const atelierContractVersionSchema = z.literal("juw.atelier-operation.v1");
export const atelierStageSchema = z.enum([
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
]);
export const atelierViewSchema = z.enum(["01", "02", "03", "04", "SUBJECT", "05", "06", "07"]);
export const garmentIdSchema = z.string().trim().min(1).max(80).regex(safeIdPattern);
export const assetIdSchema = z.string().trim().min(1).max(240).regex(safeIdPattern);
export const sha256Schema = z.string().regex(sha256Pattern);
export const assetReviewStateSchema = z.enum([
  "LOCKED",
  "GATE_PASS_PRIVATE",
  "CANDIDATE",
  "REJECTED",
  "SUPERSEDED",
]);
export const privacyClassSchema = z.enum([
  "PUBLIC",
  "PRIVATE_OPERATOR",
  "PRIVATE_IDENTITY",
]);

export const DIRECT_GARMENT_EVIDENCE_RECEIPT_VERSION =
  "juw.direct-garment-evidence-receipt.v1" as const;
export const DIRECT_GARMENT_EVIDENCE_PACK_RECIPE_VERSION =
  "direct-garment-evidence-pack-v1" as const;
export const DIRECT_GARMENT_EVIDENCE_PACK_COMPILER_VERSION =
  "direct-garment-evidence-pack-compiler-v1" as const;
export const DIRECT_GARMENT_EVIDENCE_PACK_SIZE = 1536 as const;

export type AtelierStage = z.infer<typeof atelierStageSchema>;
export type AtelierView = z.infer<typeof atelierViewSchema>;

export const authorityRoleSchema = z.enum([
  "DIRECT_GARMENT_EVIDENCE",
  "REAL_FACE_OPERATION_BOARD",
  "V4_TRANSLATION_LOCK",
  "SUBJECT_A_TRANSLATION_DONOR",
  "LOCKED_ATELIER_ROOM",
  "GARMENT_FRONT_SAFEGUARD",
  "BODY_FRONT_CANON",
  "BODY_SIDE_CANON",
  "BODY_BACK_CANON",
  "REAL_LULU_ANGLE_CONTACT",
  "REAL_LULU_GYM_REAR_PROFILE",
]);

export const parentRoleSchema = z.enum([
  "GARMENT_FRONT_LOCK",
  "GARMENT_BACK_LOCK",
  "MANNEQUIN_FRONT_LOCK",
  "FABRIC_DETAIL_LOCK",
  "ACCEPTED_SUBJECT_LOCK",
  "ACCEPTED_05",
]);

export const sourceStageSchema = z.enum([
  "GARMENT_01",
  ...atelierStageSchema.options,
]);

export const layerSchema = z.enum([
  "IDENTITY",
  "BODY",
  "GARMENT",
  "HAIR",
  "POSE",
  "HANDS",
  "FOOTWEAR",
  "STYLING",
  "ATELIER",
  "BRAND_ICON",
  "CAMERA",
  "LIGHTING",
  "COMPOSITION",
  "OUTPUT_GEOMETRY",
]);

export type AuthorityRole = z.infer<typeof authorityRoleSchema>;
export type ParentRole = z.infer<typeof parentRoleSchema>;
export type AtelierLayer = z.infer<typeof layerSchema>;

export type AtelierStageRecipe = Readonly<{
  view: AtelierView;
  parentRoles: readonly ParentRole[];
  authorityRoles: readonly AuthorityRole[];
}>;

/**
 * Logical authority membership is fixed here. Physical packing is an adapter
 * concern and is deliberately absent from this semantic recipe.
 */
export const ATELIER_STAGE_RECIPES = Object.freeze({
  GARMENT_01_FRONT: Object.freeze({
    view: "01",
    parentRoles: Object.freeze([] as const),
    authorityRoles: Object.freeze(["DIRECT_GARMENT_EVIDENCE"] as const),
  }),
  GARMENT_02_BACK: Object.freeze({
    view: "02",
    parentRoles: Object.freeze([] as const),
    authorityRoles: Object.freeze(["DIRECT_GARMENT_EVIDENCE"] as const),
  }),
  GARMENT_03_MANNEQUIN: Object.freeze({
    view: "03",
    parentRoles: Object.freeze([] as const),
    authorityRoles: Object.freeze(["DIRECT_GARMENT_EVIDENCE"] as const),
  }),
  GARMENT_04_DETAIL: Object.freeze({
    view: "04",
    parentRoles: Object.freeze([] as const),
    authorityRoles: Object.freeze(["DIRECT_GARMENT_EVIDENCE"] as const),
  }),
  SUBJECT_A: Object.freeze({
    view: "SUBJECT",
    parentRoles: Object.freeze([
      "GARMENT_FRONT_LOCK",
      "GARMENT_BACK_LOCK",
      "MANNEQUIN_FRONT_LOCK",
      "FABRIC_DETAIL_LOCK",
    ] as const),
    authorityRoles: Object.freeze([
      "REAL_FACE_OPERATION_BOARD",
      "BODY_FRONT_CANON",
      "REAL_LULU_ANGLE_CONTACT",
      "V4_TRANSLATION_LOCK",
    ] as const),
  }),
  SUBJECT_B: Object.freeze({
    view: "SUBJECT",
    parentRoles: Object.freeze([
      "GARMENT_FRONT_LOCK",
      "GARMENT_BACK_LOCK",
      "MANNEQUIN_FRONT_LOCK",
      "FABRIC_DETAIL_LOCK",
    ] as const),
    authorityRoles: Object.freeze([
      "SUBJECT_A_TRANSLATION_DONOR",
      "REAL_FACE_OPERATION_BOARD",
      "BODY_FRONT_CANON",
      "REAL_LULU_ANGLE_CONTACT",
    ] as const),
  }),
  ROOM_FINAL_05: Object.freeze({
    view: "05",
    parentRoles: Object.freeze(["ACCEPTED_SUBJECT_LOCK"] as const),
    authorityRoles: Object.freeze([
      "LOCKED_ATELIER_ROOM",
      "GARMENT_FRONT_SAFEGUARD",
    ] as const),
  }),
  SIBLING_06: Object.freeze({
    view: "06",
    parentRoles: Object.freeze(["ACCEPTED_05"] as const),
    authorityRoles: Object.freeze([
      "REAL_FACE_OPERATION_BOARD",
      "BODY_SIDE_CANON",
      "REAL_LULU_ANGLE_CONTACT",
      "LOCKED_ATELIER_ROOM",
    ] as const),
  }),
  SIBLING_07_CORE: Object.freeze({
    view: "07",
    parentRoles: Object.freeze(["ACCEPTED_05"] as const),
    authorityRoles: Object.freeze([
      "REAL_FACE_OPERATION_BOARD",
      "BODY_BACK_CANON",
      "REAL_LULU_ANGLE_CONTACT",
      "LOCKED_ATELIER_ROOM",
    ] as const),
  }),
  SIBLING_07_RECOVERY: Object.freeze({
    view: "07",
    parentRoles: Object.freeze(["ACCEPTED_05"] as const),
    authorityRoles: Object.freeze([
      "REAL_FACE_OPERATION_BOARD",
      "BODY_BACK_CANON",
      "REAL_LULU_ANGLE_CONTACT",
      "REAL_LULU_GYM_REAR_PROFILE",
      "LOCKED_ATELIER_ROOM",
    ] as const),
  }),
} as const satisfies Record<AtelierStage, AtelierStageRecipe>);

export type AtelierStageLayerPolicy = Readonly<{
  allowedMutableLayers: readonly AtelierLayer[];
  requiredImmutableLayers: readonly AtelierLayer[];
}>;

/**
 * Layer policy is semantic: a stage may synthesize new pixels while the named
 * truth remains immutable. For example, a subject pass may change garment fit
 * pixels, but garment construction stays locked and therefore is not a mutable
 * semantic layer.
 */
export const ATELIER_STAGE_LAYER_POLICIES = Object.freeze({
  GARMENT_01_FRONT: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ] as const),
    requiredImmutableLayers: Object.freeze(["GARMENT"] as const),
  }),
  GARMENT_02_BACK: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ] as const),
    requiredImmutableLayers: Object.freeze(["GARMENT"] as const),
  }),
  GARMENT_03_MANNEQUIN: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ] as const),
    requiredImmutableLayers: Object.freeze(["GARMENT"] as const),
  }),
  GARMENT_04_DETAIL: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ] as const),
    requiredImmutableLayers: Object.freeze(["GARMENT"] as const),
  }),
  SUBJECT_A: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "IDENTITY",
      "BODY",
      "POSE",
      "HANDS",
      "FOOTWEAR",
      "STYLING",
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ] as const),
    requiredImmutableLayers: Object.freeze(["GARMENT", "HAIR"] as const),
  }),
  SUBJECT_B: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "IDENTITY",
      "BODY",
      "POSE",
      "HANDS",
      "FOOTWEAR",
      "STYLING",
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ] as const),
    requiredImmutableLayers: Object.freeze(["GARMENT", "HAIR"] as const),
  }),
  ROOM_FINAL_05: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "FOOTWEAR",
      "STYLING",
      "COMPOSITION",
    ] as const),
    requiredImmutableLayers: Object.freeze([
      "IDENTITY",
      "BODY",
      "GARMENT",
      "HAIR",
      "POSE",
      "HANDS",
      "ATELIER",
      "BRAND_ICON",
      "CAMERA",
      "LIGHTING",
      "OUTPUT_GEOMETRY",
    ] as const),
  }),
  SIBLING_06: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "POSE",
      "HANDS",
      "CAMERA",
      "COMPOSITION",
    ] as const),
    requiredImmutableLayers: Object.freeze([
      "IDENTITY",
      "BODY",
      "GARMENT",
      "HAIR",
      "FOOTWEAR",
      "STYLING",
      "ATELIER",
      "BRAND_ICON",
      "LIGHTING",
      "OUTPUT_GEOMETRY",
    ] as const),
  }),
  SIBLING_07_CORE: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "POSE",
      "HANDS",
      "CAMERA",
      "COMPOSITION",
    ] as const),
    requiredImmutableLayers: Object.freeze([
      "IDENTITY",
      "BODY",
      "GARMENT",
      "HAIR",
      "FOOTWEAR",
      "STYLING",
      "ATELIER",
      "BRAND_ICON",
      "LIGHTING",
      "OUTPUT_GEOMETRY",
    ] as const),
  }),
  SIBLING_07_RECOVERY: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "POSE",
      "HANDS",
      "CAMERA",
      "COMPOSITION",
    ] as const),
    requiredImmutableLayers: Object.freeze([
      "IDENTITY",
      "BODY",
      "GARMENT",
      "HAIR",
      "FOOTWEAR",
      "STYLING",
      "ATELIER",
      "BRAND_ICON",
      "LIGHTING",
      "OUTPUT_GEOMETRY",
    ] as const),
  }),
} as const satisfies Record<AtelierStage, AtelierStageLayerPolicy>);

export const authorityAssetSchema = z.object({
  role: authorityRoleSchema,
  assetId: assetIdSchema,
  sha256: sha256Schema,
  garmentId: garmentIdSchema.nullable(),
  sourceStage: sourceStageSchema.nullable().default(null),
  reviewState: assetReviewStateSchema,
  provenanceClass: z.enum([
    "REAL_DIRECT",
    "GARMENT_DIRECT",
    "APPROVED_CANON",
    "ACCEPTED_GENERATED",
    "LOCKED_ENVIRONMENT",
  ]),
  required: z.literal(true),
  permittedScope: z.array(layerSchema).min(1),
  dominance: z.number().int().min(1).max(100),
  privacyClass: privacyClassSchema,
}).strict();

export type AuthorityAsset = z.infer<typeof authorityAssetSchema>;

export const parentLockSchema = z.object({
  role: parentRoleSchema,
  assetId: assetIdSchema,
  sha256: sha256Schema,
  garmentId: garmentIdSchema,
  sourceStage: sourceStageSchema,
  sourceView: z.enum(["01", "02", "03", "04", "SUBJECT", "05", "06", "07"]),
  reviewState: assetReviewStateSchema,
  lockedLayer: layerSchema,
  privacyClass: privacyClassSchema,
}).strict();

export type ParentLock = z.infer<typeof parentLockSchema>;

export const directGarmentEvidenceConstituentSchema = z.object({
  assetId: assetIdSchema,
  sha256: sha256Schema,
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
}).strict();

const directGarmentEvidenceReceiptBaseSchema = z.object({
  schemaVersion: z.literal(DIRECT_GARMENT_EVIDENCE_RECEIPT_VERSION),
  sourceManifest: z.object({
    revision: assetIdSchema,
    sha256: sha256Schema,
    attestationId: assetIdSchema,
    verificationStatus: z.literal("VERIFIED"),
  }).strict(),
  recipeVersion: z.literal(DIRECT_GARMENT_EVIDENCE_PACK_RECIPE_VERSION),
  compilerVersion: z.literal(DIRECT_GARMENT_EVIDENCE_PACK_COMPILER_VERSION),
  constituents: z.array(directGarmentEvidenceConstituentSchema).min(1).max(32),
  output: z.object({
    assetId: assetIdSchema,
    sha256: sha256Schema,
    mimeType: z.literal("image/png"),
    byteSize: z.number().int().positive(),
    width: z.literal(DIRECT_GARMENT_EVIDENCE_PACK_SIZE),
    height: z.literal(DIRECT_GARMENT_EVIDENCE_PACK_SIZE),
  }).strict(),
}).strict().superRefine((receipt, context) => {
  receipt.constituents.forEach((constituent, index) => {
    addG004ProviderDenialIssue(context, ["constituents", index], constituent);
  });
  addG004ProviderDenialIssue(context, ["output"], receipt.output);
  const assetIds = receipt.constituents.map((item) => item.assetId);
  if (new Set(assetIds).size !== assetIds.length) {
    addIssue(context, ["constituents"], "Direct garment evidence asset IDs must be unique.");
  }
  const sourceKeys = receipt.constituents.map((item) => `${item.assetId}:${item.sha256}`);
  if (new Set(sourceKeys).size !== sourceKeys.length) {
    addIssue(context, ["constituents"], "Direct garment evidence constituents must be unique.");
  }
  if (sourceKeys.includes(`${receipt.output.assetId}:${receipt.output.sha256}`)) {
    addIssue(context, ["output"], "The direct garment evidence pack must be independently content-addressed.");
  }
});

/**
 * Canonical source order is semantic: resolver enumeration order cannot change
 * the operation or the deterministic provider pack.
 */
export const directGarmentEvidenceReceiptSchema =
  directGarmentEvidenceReceiptBaseSchema.transform((receipt) => ({
    ...receipt,
    constituents: [...receipt.constituents].sort((left, right) => {
      const assetOrder = left.assetId < right.assetId ? -1 : left.assetId > right.assetId ? 1 : 0;
      if (assetOrder !== 0) return assetOrder;
      return left.sha256 < right.sha256 ? -1 : left.sha256 > right.sha256 ? 1 : 0;
    }),
  }));

export type DirectGarmentEvidenceConstituent = z.infer<
  typeof directGarmentEvidenceConstituentSchema
>;
export type DirectGarmentEvidenceReceipt = z.infer<
  typeof directGarmentEvidenceReceiptSchema
>;

export const changeSchema = z.object({
  mutableLayer: layerSchema,
  region: z.string().trim().min(1).max(500),
  intendedDelta: z.string().trim().min(1).max(2_000),
}).strict();

export const immutableLayerSchema = z.object({
  layer: layerSchema,
  assetId: assetIdSchema,
  sha256: sha256Schema,
}).strict();

export const renderQualityContractSchema = z.object({
  photographicRealism: z.string().trim().min(1).max(1_000),
  skinTexture: z.string().trim().min(1).max(1_000),
  garmentTexture: z.string().trim().min(1).max(1_000),
  lightingIntegration: z.string().trim().min(1).max(1_000),
  opticsPerspective: z.string().trim().min(1).max(1_000),
  artifactRejection: z.array(z.string().trim().min(1).max(500)).min(1),
}).strict();

const outputContractBaseShape = {
  imageCount: z.literal(1),
  layout: z.literal("SINGLE_CLEAN_FULL_IMAGE"),
  renderedText: z.literal(false),
  labels: z.literal(false),
  targetView: atelierViewSchema,
  canvas: z.object({
    width: z.literal(1024),
    height: z.literal(1536),
  }).strict(),
} as const;

export const atelierOutputModeSchema = z.enum([
  "GENERATIVE_FULL_FRAME",
  "GENERATIVE_GARMENT_MEDIA",
  "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE",
]);

export const atelierImageFormatSchema = z.enum(["JPEG", "PNG"]);

/**
 * Provider-neutral materialization contract. Subject stages may synthesize a
 * complete neutral frame. Catalogue stages must first return a transparent
 * subject layer and then use app-owned deterministic composition over the
 * byte-exact locked room.
 */
export const outputContractSchema = z.discriminatedUnion("mode", [
  z.object({
    ...outputContractBaseShape,
    mode: z.literal("GENERATIVE_FULL_FRAME"),
    fullBody: z.literal(true),
    generatedArtifact: z.object({
      kind: z.literal("FULL_FRAME"),
      format: z.literal("JPEG"),
      alpha: z.literal("OPAQUE"),
      background: z.literal("NEUTRAL_STAGE"),
    }).strict(),
    deterministicComposite: z.null(),
    finalFormat: z.literal("JPEG"),
  }).strict(),
  z.object({
    ...outputContractBaseShape,
    mode: z.literal("GENERATIVE_GARMENT_MEDIA"),
    fullBody: z.boolean(),
    generatedArtifact: z.object({
      kind: z.enum(["GARMENT_VIEW", "MANNEQUIN_VIEW", "DETAIL_VIEW"]),
      format: z.literal("JPEG"),
      alpha: z.literal("OPAQUE"),
      background: z.literal("NEUTRAL_PRODUCT_STAGE"),
    }).strict(),
    deterministicComposite: z.null(),
    finalFormat: z.literal("JPEG"),
  }).strict(),
  z.object({
    ...outputContractBaseShape,
    mode: z.literal("TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"),
    fullBody: z.literal(true),
    generatedArtifact: z.object({
      kind: z.literal("SUBJECT_LAYER"),
      format: z.literal("PNG"),
      alpha: z.literal("REQUIRED"),
      background: z.literal("TRANSPARENT"),
    }).strict(),
    deterministicComposite: z.union([
      // Parse the original same-canvas contract for durable replay. It may
      // use only a 1024x1536 room at execution time.
      z.object({
        method: z.literal("APP_OWNED_EXACT_PIXEL_COMPOSITE"),
        lockedRoomRole: z.literal("LOCKED_ATELIER_ROOM"),
        preserveLockedRoomPixels: z.literal(true),
        outputFormat: z.literal("PNG"),
      }).strict(),
      z.object({
        method: z.literal("APP_OWNED_EXACT_PIXEL_COMPOSITE"),
        lockedRoomRole: z.literal("LOCKED_ATELIER_ROOM"),
        preserveLockedRoomPixels: z.literal(true),
        outputFormat: z.literal("PNG"),
        canvasPolicyRevision: z.literal(STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION),
        pixelMapping: z.literal("EXACT_1_TO_1_WINDOW_COPY"),
        roomPixelsGenerated: z.literal(0),
        supportedRoomProfiles: z.tuple([
          z.object({
            profileId: z.literal("atelier-room-native-2x3-v1"),
            roomCanvas: z.object({ width: z.literal(1024), height: z.literal(1536) }).strict(),
            subjectWindow: z.object({
              left: z.literal(0),
              top: z.literal(0),
              width: z.literal(1024),
              height: z.literal(1536),
            }).strict(),
            transparentGuardPixels: z.literal(0),
          }).strict(),
          z.object({
            profileId: z.literal("atelier-room-native-4x5-center-window-v1"),
            roomCanvas: z.object({ width: z.literal(1024), height: z.literal(1280) }).strict(),
            subjectWindow: z.object({
              left: z.literal(0),
              top: z.literal(128),
              width: z.literal(1024),
              height: z.literal(1280),
            }).strict(),
            transparentGuardPixels: z.literal(16),
          }).strict(),
        ]),
      }).strict(),
    ]),
    finalFormat: z.literal("PNG"),
  }).strict(),
]);

export const rearInferenceSchema = z.object({
  inferred: z.boolean(),
  basis: z.enum(["DIRECT_GARMENT_BACK", "NO_DIRECT_GARMENT_BACK"]),
  mayBecomeDirectEvidence: z.literal(false),
}).strict().superRefine((value, context) => {
  if (value.inferred !== (value.basis === "NO_DIRECT_GARMENT_BACK")) {
    context.addIssue({
      code: "custom",
      path: ["inferred"],
      message: "Rear inference must match the declared garment-back evidence basis.",
    });
  }
});

function isOfficialFashionNovaUrl(value: string): boolean {
  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && (hostname === "fashionnova.com" || hostname.endsWith(".fashionnova.com"));
  } catch {
    return false;
  }
}

function isRealCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

export const fashionNovaCheckSchema = z.object({
  operationId: assetIdSchema,
  publisher: z.literal("Fashion Nova"),
  officialUrl: z.string().url().max(1_000),
  resolvedOfficialUrl: z.string().url().max(1_000),
  pageTitle: z.string().trim().min(1).max(500),
  accessedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  matchedGarmentFacts: z.array(z.string().trim().min(1).max(500)),
  decision: z.enum(["KEEP", "REFINE", "REPLACE", "NO_CLOSE_MATCH"]),
  noCloseMatchReason: z.string().trim().min(1).max(1_000).optional(),
  selectedStylingDirection: z.string().trim().min(1).max(1_000),
  authority: z.literal("ADVISORY_STYLING_ONLY"),
  passedAsImageReference: z.literal(false),
}).strict().superRefine((value, context) => {
  if (!isOfficialFashionNovaUrl(value.officialUrl)) {
    addIssue(context, ["officialUrl"], "Fashion Nova evidence must use an official HTTPS fashionnova.com URL.");
  }
  if (!isOfficialFashionNovaUrl(value.resolvedOfficialUrl)) {
    addIssue(context, ["resolvedOfficialUrl"], "The resolved styling URL must remain on official fashionnova.com.");
  }
  if (!isRealCalendarDate(value.accessedOn)) {
    addIssue(context, ["accessedOn"], "The styling access date must be a real YYYY-MM-DD calendar date.");
  }
  if (value.decision === "NO_CLOSE_MATCH") {
    if (value.matchedGarmentFacts.length !== 0) {
      context.addIssue({
        code: "custom",
        path: ["matchedGarmentFacts"],
        message: "NO_CLOSE_MATCH must keep the match list empty.",
      });
    }
    if (!value.noCloseMatchReason) {
      context.addIssue({
        code: "custom",
        path: ["noCloseMatchReason"],
        message: "NO_CLOSE_MATCH requires the search and no-match reason.",
      });
    }
  } else if (value.matchedGarmentFacts.length === 0) {
    context.addIssue({
      code: "custom",
      path: ["matchedGarmentFacts"],
      message: "A styling match decision requires evidence-backed garment facts.",
    });
  }
});

function addIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  message: string,
): void {
  context.addIssue({ code: "custom", path, message });
}

const G004_EVALUATOR_ONLY_MESSAGE =
  "A G004 positive-target asset is evaluator-only and cannot be an authority, parent, transport constituent or provider reference.";

function addG004ProviderDenialIssue(
  context: z.RefinementCtx,
  path: PropertyKey[],
  binding: Readonly<{ assetId: string; sha256: string }>,
): void {
  if (studioAtelierG004ProviderDenial(binding)) {
    addIssue(context, path, G004_EVALUATOR_ONLY_MESSAGE);
  }
}

function sameMembers(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length
    && new Set(actual).size === actual.length
    && expected.every((item) => actual.includes(item));
}

const garmentScopedAuthorityRoles = new Set<AuthorityRole>([
  "DIRECT_GARMENT_EVIDENCE",
  "SUBJECT_A_TRANSLATION_DONOR",
  "GARMENT_FRONT_SAFEGUARD",
]);

const parentImmutableCoverage = Object.freeze({
  GARMENT_FRONT_LOCK: new Set<AtelierLayer>(["GARMENT"]),
  GARMENT_BACK_LOCK: new Set<AtelierLayer>(["GARMENT"]),
  MANNEQUIN_FRONT_LOCK: new Set<AtelierLayer>(["GARMENT"]),
  FABRIC_DETAIL_LOCK: new Set<AtelierLayer>(["GARMENT"]),
  ACCEPTED_SUBJECT_LOCK: new Set<AtelierLayer>([
    "IDENTITY",
    "BODY",
    "GARMENT",
    "HAIR",
    "POSE",
    "HANDS",
    "FOOTWEAR",
    "STYLING",
    "CAMERA",
    "LIGHTING",
    "COMPOSITION",
    "OUTPUT_GEOMETRY",
  ]),
  ACCEPTED_05: new Set<AtelierLayer>([
    "IDENTITY",
    "BODY",
    "GARMENT",
    "HAIR",
    "POSE",
    "HANDS",
    "FOOTWEAR",
    "STYLING",
    "ATELIER",
    "BRAND_ICON",
    "CAMERA",
    "LIGHTING",
    "COMPOSITION",
    "OUTPUT_GEOMETRY",
  ]),
} as const satisfies Record<ParentRole, ReadonlySet<AtelierLayer>>);

export const atelierOperationSchema = z.object({
  contractVersion: atelierContractVersionSchema,
  workflowRevision: z.string().trim().min(1).max(120),
  wardrobeItemId: z.string().uuid().optional(),
  garmentId: garmentIdSchema,
  stage: atelierStageSchema,
  view: atelierViewSchema,
  parentLocks: z.array(parentLockSchema),
  authorityStack: z.array(authorityAssetSchema),
  changeSet: z.array(changeSchema).min(1),
  immutableSet: z.array(immutableLayerSchema).min(1),
  garmentFacts: z.array(z.string().trim().min(1).max(1_000)).default([]),
  unknownFacts: z.array(z.string().trim().min(1).max(1_000)).default([]),
  prohibitedInferences: z.array(z.string().trim().min(1).max(1_000)).default([]),
  sceneSpec: z.record(z.string(), z.json()),
  cameraSpec: z.record(z.string(), z.json()),
  poseSpec: z.record(z.string(), z.json()),
  stylingSpec: z.record(z.string(), z.json()),
  renderQualityContract: renderQualityContractSchema,
  outputContract: outputContractSchema,
  failureGates: z.array(z.string().trim().min(1).max(500)).min(1),
  rearInference: rearInferenceSchema.optional(),
  fashionNovaCheck: fashionNovaCheckSchema.optional(),
  correctionOf: sha256Schema.optional(),
  correctionBudget: z.number().int().min(0).max(1).default(1),
  directGarmentEvidence: directGarmentEvidenceReceiptSchema.optional(),
}).strict().superRefine((operation, context) => {
  const recipe = ATELIER_STAGE_RECIPES[operation.stage];
  const layerPolicy = ATELIER_STAGE_LAYER_POLICIES[operation.stage];
  if (operation.view !== recipe.view) {
    addIssue(context, ["view"], `${operation.stage} must render view ${recipe.view}.`);
  }
  if (operation.outputContract.targetView !== operation.view) {
    addIssue(context, ["outputContract", "targetView"], "Output target must equal the operation view.");
  }
  const garmentStage = operation.stage === "GARMENT_01_FRONT"
    || operation.stage === "GARMENT_02_BACK"
    || operation.stage === "GARMENT_03_MANNEQUIN"
    || operation.stage === "GARMENT_04_DETAIL";
  if (garmentStage && !operation.directGarmentEvidence) {
    addIssue(
      context,
      ["directGarmentEvidence"],
      `${operation.stage} requires a constituent-complete direct garment evidence receipt.`,
    );
  }
  if (!garmentStage && operation.directGarmentEvidence) {
    addIssue(
      context,
      ["directGarmentEvidence"],
      "Direct garment evidence receipts belong only to garment 01-04 root operations.",
    );
  }
  if (operation.directGarmentEvidence) {
    const directAuthority = operation.authorityStack.find((authority) =>
      authority.role === "DIRECT_GARMENT_EVIDENCE"
    );
    if (
      !directAuthority
      || directAuthority.assetId !== operation.directGarmentEvidence.output.assetId
      || directAuthority.sha256 !== operation.directGarmentEvidence.output.sha256
    ) {
      addIssue(
        context,
        ["directGarmentEvidence", "output"],
        "The direct garment authority must be the exact content-addressed receipt output.",
      );
    }
  }
  const subjectStage = operation.stage === "SUBJECT_A" || operation.stage === "SUBJECT_B";
  const expectedOutputMode = garmentStage
    ? "GENERATIVE_GARMENT_MEDIA"
    : subjectStage
      ? "GENERATIVE_FULL_FRAME"
      : "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE";
  if (operation.outputContract.mode !== expectedOutputMode) {
    addIssue(
      context,
      ["outputContract", "mode"],
      `${operation.stage} requires output mode ${expectedOutputMode}.`,
    );
  }
  if (garmentStage && operation.outputContract.mode === "GENERATIVE_GARMENT_MEDIA") {
    const expectedArtifactKind = operation.stage === "GARMENT_03_MANNEQUIN"
      ? "MANNEQUIN_VIEW"
      : operation.stage === "GARMENT_04_DETAIL"
        ? "DETAIL_VIEW"
        : "GARMENT_VIEW";
    const expectedFullBody = operation.stage !== "GARMENT_04_DETAIL";
    if (operation.outputContract.generatedArtifact.kind !== expectedArtifactKind) {
      addIssue(
        context,
        ["outputContract", "generatedArtifact", "kind"],
        `${operation.stage} requires ${expectedArtifactKind}.`,
      );
    }
    if (operation.outputContract.fullBody !== expectedFullBody) {
      addIssue(
        context,
        ["outputContract", "fullBody"],
        `${operation.stage} requires fullBody=${expectedFullBody}.`,
      );
    }
  }

  const parentRoles = operation.parentLocks.map((parent) => parent.role);
  if (!sameMembers(parentRoles, recipe.parentRoles)) {
    addIssue(context, ["parentLocks"], `${operation.stage} requires exactly: ${recipe.parentRoles.join(", ")}.`);
  }
  const authorityRoles = operation.authorityStack.map((authority) => authority.role);
  if (!sameMembers(authorityRoles, recipe.authorityRoles)) {
    addIssue(context, ["authorityStack"], `${operation.stage} requires exactly: ${recipe.authorityRoles.join(", ")}.`);
  }

  const mutableLayers = new Set(operation.changeSet.map((change) => change.mutableLayer));
  const immutableLayers = new Set(operation.immutableSet.map((item) => item.layer));
  const allowedMutableLayers = new Set<AtelierLayer>(layerPolicy.allowedMutableLayers);
  operation.changeSet.forEach((change, index) => {
    if (!allowedMutableLayers.has(change.mutableLayer)) {
      addIssue(
        context,
        ["changeSet", index, "mutableLayer"],
        `${operation.stage} may not mutate ${change.mutableLayer}.`,
      );
    }
  });
  layerPolicy.requiredImmutableLayers.forEach((layer) => {
    if (!immutableLayers.has(layer)) {
      addIssue(
        context,
        ["immutableSet"],
        `${operation.stage} must preserve immutable ${layer} truth.`,
      );
    }
  });
  for (const layer of mutableLayers) {
    if (immutableLayers.has(layer)) {
      addIssue(
        context,
        ["changeSet"],
        `${layer} cannot be both mutable and immutable in one operation.`,
      );
    }
  }

  operation.immutableSet.forEach((immutable, index) => {
    const resolvedParent = operation.parentLocks.some((parent) =>
      parent.assetId === immutable.assetId
      && parent.sha256 === immutable.sha256
      && parentImmutableCoverage[parent.role].has(immutable.layer)
    );
    const resolvedAuthority = operation.authorityStack.some((authority) =>
      authority.assetId === immutable.assetId
      && authority.sha256 === immutable.sha256
      && authority.permittedScope.includes(immutable.layer)
    );
    if (!resolvedParent && !resolvedAuthority) {
      addIssue(
        context,
        ["immutableSet", index],
        "Every immutable tuple must resolve to an exact parent or in-scope authority asset and hash.",
      );
    }
  });
  operation.parentLocks.forEach((parent, index) => {
    if (!operation.immutableSet.some((immutable) =>
      immutable.layer === parent.lockedLayer
      && immutable.assetId === parent.assetId
      && immutable.sha256 === parent.sha256
    )) {
      addIssue(
        context,
        ["immutableSet"],
        `Parent ${index + 1} locked layer ${parent.lockedLayer} must be represented by its exact tuple.`,
      );
    }
  });

  operation.parentLocks.forEach((parent, index) => {
    addG004ProviderDenialIssue(context, ["parentLocks", index], parent);
    if (parent.garmentId !== operation.garmentId) {
      addIssue(context, ["parentLocks", index, "garmentId"], "Every parent must belong to this exact garment.");
    }
    if (parent.reviewState !== "LOCKED") {
      addIssue(context, ["parentLocks", index, "reviewState"], "A parent must be accepted and locked.");
    }
    if (parent.sourceView === "06" || parent.sourceView === "07"
      || parent.sourceStage === "SIBLING_06"
      || parent.sourceStage === "SIBLING_07_CORE"
      || parent.sourceStage === "SIBLING_07_RECOVERY") {
      addIssue(context, ["parentLocks", index], "Sibling outputs can never become parents.");
    }
  });

  operation.authorityStack.forEach((authority, index) => {
    addG004ProviderDenialIssue(context, ["authorityStack", index], authority);
    if (authority.reviewState === "REJECTED" || authority.reviewState === "SUPERSEDED") {
      addIssue(context, ["authorityStack", index, "reviewState"], "Rejected or superseded media cannot be authority.");
    }
    if (authority.sourceStage === "SIBLING_06"
      || authority.sourceStage === "SIBLING_07_CORE"
      || authority.sourceStage === "SIBLING_07_RECOVERY") {
      addIssue(context, ["authorityStack", index, "sourceStage"], "Sibling outputs cannot be authority for another view.");
    }
    if (garmentScopedAuthorityRoles.has(authority.role)) {
      if (authority.garmentId !== operation.garmentId) {
        addIssue(context, ["authorityStack", index, "garmentId"], "Garment-scoped authority must match the exact garment.");
      }
    } else if (authority.garmentId !== null) {
      addIssue(context, ["authorityStack", index, "garmentId"], "Shared canon authority must not claim garment lineage.");
    }
    if (authority.role !== "SUBJECT_A_TRANSLATION_DONOR" && authority.reviewState !== "LOCKED") {
      addIssue(context, ["authorityStack", index, "reviewState"], "Canonical authority must be locked before planning.");
    }
    if (authority.role === "SUBJECT_A_TRANSLATION_DONOR") {
      if (authority.sourceStage !== "SUBJECT_A") {
        addIssue(context, ["authorityStack", index, "sourceStage"], "The translation donor must come from current-garment SUBJECT_A.");
      }
      if (authority.reviewState !== "GATE_PASS_PRIVATE") {
        addIssue(context, ["authorityStack", index, "reviewState"], "The SUBJECT_A donor must have a private gate-pass decision.");
      }
    }
    if (authority.role === "DIRECT_GARMENT_EVIDENCE") {
      if (authority.sourceStage !== null) {
        addIssue(
          context,
          ["authorityStack", index, "sourceStage"],
          "Direct garment evidence must resolve from verified source bytes, never a generated stage.",
        );
      }
      if (authority.provenanceClass !== "GARMENT_DIRECT") {
        addIssue(
          context,
          ["authorityStack", index, "provenanceClass"],
          "Direct garment evidence requires GARMENT_DIRECT provenance.",
        );
      }
      if (!authority.permittedScope.includes("GARMENT")) {
        addIssue(
          context,
          ["authorityStack", index, "permittedScope"],
          "Direct garment evidence must control GARMENT truth.",
        );
      }
    }
  });

  const garmentParentSources = Object.freeze({
    GARMENT_FRONT_LOCK: Object.freeze({ stage: "GARMENT_01_FRONT", view: "01" }),
    GARMENT_BACK_LOCK: Object.freeze({ stage: "GARMENT_02_BACK", view: "02" }),
    MANNEQUIN_FRONT_LOCK: Object.freeze({ stage: "GARMENT_03_MANNEQUIN", view: "03" }),
    FABRIC_DETAIL_LOCK: Object.freeze({ stage: "GARMENT_04_DETAIL", view: "04" }),
  } as const);
  operation.parentLocks.forEach((parent, index) => {
    const expected = parent.role in garmentParentSources
      ? garmentParentSources[parent.role as keyof typeof garmentParentSources]
      : undefined;
    if (expected && (
      parent.sourceStage !== expected.stage
      || parent.sourceView !== expected.view
    )) {
      addIssue(
        context,
        ["parentLocks", index],
        `${parent.role} must resolve from ${expected.stage}/${expected.view}.`,
      );
    }
  });
  const parent = operation.parentLocks[0];
  if (parent?.role === "ACCEPTED_SUBJECT_LOCK"
    && (!(["SUBJECT_A", "SUBJECT_B"] as const).includes(parent.sourceStage as "SUBJECT_A" | "SUBJECT_B")
      || parent.sourceView !== "SUBJECT")) {
    addIssue(context, ["parentLocks", 0], "Final 05 must parent an accepted garment-specific subject lock.");
  }
  if (parent?.role === "ACCEPTED_05"
    && (parent.sourceStage !== "ROOM_FINAL_05" || parent.sourceView !== "05")) {
    addIssue(context, ["parentLocks", 0], "06 and 07 must independently parent the accepted room-composited 05.");
  }

  const rearStage = operation.stage === "GARMENT_02_BACK"
    || operation.stage === "SIBLING_07_CORE"
    || operation.stage === "SIBLING_07_RECOVERY";
  if (rearStage && !operation.rearInference) {
    addIssue(context, ["rearInference"], "Every rear-view operation must explicitly declare whether rear construction is inferred.");
  }
  if (!rearStage && operation.rearInference) {
    addIssue(context, ["rearInference"], "Rear inference is valid only for garment-back or model-rear stages.");
  }

  if (operation.stage === "ROOM_FINAL_05" && !operation.fashionNovaCheck) {
    addIssue(context, ["fashionNovaCheck"], "Final 05 requires the advisory Fashion Nova styling check.");
  }
  if (operation.stage !== "ROOM_FINAL_05" && operation.fashionNovaCheck) {
    addIssue(context, ["fashionNovaCheck"], "The styling check belongs only to final 05; sibling views inherit it.");
  }

  const assetKeys = [
    ...operation.parentLocks.map((asset) => `${asset.assetId}:${asset.sha256}`),
    ...operation.authorityStack.map((asset) => `${asset.assetId}:${asset.sha256}`),
  ];
  if (new Set(assetKeys).size !== assetKeys.length) {
    addIssue(context, ["authorityStack"], "One physical asset cannot silently satisfy two logical roles.");
  }
});

export type AtelierOperation = z.infer<typeof atelierOperationSchema>;

export const logicalReferenceSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PARENT"),
    role: parentRoleSchema,
    assetId: assetIdSchema,
    sha256: sha256Schema,
  }).strict(),
  z.object({
    kind: z.literal("AUTHORITY"),
    role: authorityRoleSchema,
    assetId: assetIdSchema,
    sha256: sha256Schema,
  }).strict(),
]).superRefine((reference, context) => {
  addG004ProviderDenialIssue(context, [], reference);
});

export type LogicalReference = z.infer<typeof logicalReferenceSchema>;

export const referencePackRoleSchema = z.enum([
  "GARMENT_SET_01_04_BOARD",
  "SUBJECT_A_TRANSLATION_FACE_BOARD",
  "SUBJECT_B_TRANSLATION_FACE_BOARD",
  "SIDE_BODY_ANGLE_BOARD",
  "BACK_BODY_ANGLE_BOARD",
  "FUSED_IDENTITY_REAR_RECOVERY_BOARD",
]);

export type ReferencePackRole = z.infer<typeof referencePackRoleSchema>;

export const referencePackMethodSchema = z.enum([
  "DETERMINISTIC_COMPOSITE_BOARD",
  "MANIFEST_ATTESTED_BOARD",
]);

export const attestedReferencePackSchema = z.object({
  packRole: referencePackRoleSchema,
  assetId: assetIdSchema,
  sha256: sha256Schema,
  privacyClass: privacyClassSchema,
  method: referencePackMethodSchema,
  attestationId: assetIdSchema,
  constituents: z.array(logicalReferenceSchema).min(2),
}).strict().superRefine((pack, context) => {
  addG004ProviderDenialIssue(context, [], pack);
});

export type AttestedReferencePack = z.infer<typeof attestedReferencePackSchema>;

export const physicalReferenceRoleSchema = z.union([
  parentRoleSchema,
  authorityRoleSchema,
  referencePackRoleSchema,
]);

export const physicalReferenceBindingSchema = z.object({
  slot: z.number().int().positive(),
  physicalRole: physicalReferenceRoleSchema,
  assetId: assetIdSchema,
  sha256: sha256Schema,
  privacyClass: privacyClassSchema,
  packing: z.object({
    method: referencePackMethodSchema,
    packRole: referencePackRoleSchema,
    attestationId: assetIdSchema,
  }).strict().nullable(),
  constituents: z.array(logicalReferenceSchema).min(1),
}).strict().superRefine((binding, context) => {
  addG004ProviderDenialIssue(context, [], binding);
  if (binding.packing === null) {
    if (binding.constituents.length !== 1) {
      addIssue(context, ["constituents"], "An unpacked input must bind exactly one logical reference.");
      return;
    }
    const [constituent] = binding.constituents;
    if (binding.physicalRole !== constituent.role
      || binding.assetId !== constituent.assetId
      || binding.sha256 !== constituent.sha256) {
      addIssue(context, [], "An unpacked physical input must exactly equal its logical reference.");
    }
  } else if (binding.physicalRole !== binding.packing.packRole) {
    addIssue(context, ["physicalRole"], "A packed input role must match its attested pack role.");
  }
});

export type PhysicalReferenceBinding = z.infer<typeof physicalReferenceBindingSchema>;

export const adapterCapabilitiesSchema = z.object({
  adapterId: assetIdSchema,
  adapterVersion: assetIdSchema,
  maxPhysicalReferences: z.number().int().positive().max(32),
  supportedStages: z.array(atelierStageSchema).min(1),
  acceptedPrivacyClasses: z.array(privacyClassSchema).min(1),
  supportedOutputModes: z.array(atelierOutputModeSchema).min(1),
  supportedGeneratedArtifactFormats: z.array(atelierImageFormatSchema).min(1),
  supportedFinalFormats: z.array(atelierImageFormatSchema).min(1),
  supportsRequiredAlpha: z.boolean(),
}).strict();

export type AtelierAdapterCapabilities = z.infer<typeof adapterCapabilitiesSchema>;

export const executionIdentitySchema = z.object({
  semanticOperationHash: sha256Schema,
  adapterId: assetIdSchema,
  adapterVersion: assetIdSchema,
  provider: assetIdSchema,
  model: assetIdSchema,
  modelRevision: z.string().trim().min(1).max(240),
  compiledPrompt: z.string().min(1).max(50_000),
  orderedReferences: z.array(physicalReferenceBindingSchema).min(1),
  preprocessingVersion: assetIdSchema,
  seed: z.union([z.string().max(200), z.number().finite()]).nullable(),
  sampler: z.string().trim().min(1).max(200).nullable(),
  parameters: z.record(z.string(), z.json()),
  providerPolicyRevision: assetIdSchema,
}).strict().superRefine((execution, context) => {
  execution.orderedReferences.forEach((reference, index) => {
    if (reference.slot !== index + 1) {
      addIssue(context, ["orderedReferences", index, "slot"], "Reference slots must be contiguous and ordered from one.");
    }
  });
});

export type ExecutionIdentity = z.infer<typeof executionIdentitySchema>;
