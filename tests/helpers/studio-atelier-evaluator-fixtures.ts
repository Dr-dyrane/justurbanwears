import { createHash } from "node:crypto";
import {
  ATELIER_STAGE_LAYER_POLICIES,
  ATELIER_STAGE_RECIPES,
  atelierOperationSchema,
  directGarmentEvidenceReceiptSchema,
  type AtelierLayer,
  type AtelierOperation,
  type AtelierStage,
  type AuthorityAsset,
  type AuthorityRole,
  type ParentLock,
} from "../../lib/studio/atelier/contracts";
import type { StudioAtelierTransportConstituent } from "../../lib/server/studio-atelier-structural-semantic-evaluator";

export function evaluatorFixtureDigest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function directEvidenceReceipt(garmentId = "900") {
  const outputSha256 = evaluatorFixtureDigest(`direct-evidence-pack:${garmentId}`);
  return directGarmentEvidenceReceiptSchema.parse({
    schemaVersion: "juw.direct-garment-evidence-receipt.v1",
    sourceManifest: {
      revision: `garment-${garmentId}-source-manifest-v1`,
      sha256: evaluatorFixtureDigest(`source-manifest:${garmentId}`),
      attestationId: `garment-${garmentId}-source-manifest-attestation-v1`,
      verificationStatus: "VERIFIED",
    },
    recipeVersion: "direct-garment-evidence-pack-v1",
    compilerVersion: "direct-garment-evidence-pack-compiler-v1",
    constituents: ["a", "b", "c"].map((suffix, index) => ({
      assetId: `garment/${garmentId}/source-${suffix}`,
      sha256: evaluatorFixtureDigest(`garment:${garmentId}:source:${suffix}`),
      mimeType: "image/jpeg",
      byteSize: 1_000 + index,
      width: 600 + index,
      height: 900 + index,
    })),
    output: {
      assetId: `atelier.pack.direct-garment-evidence.${outputSha256}`,
      sha256: outputSha256,
      mimeType: "image/png",
      byteSize: 12_345,
      width: 1536,
      height: 1536,
    },
  });
}

function authority(role: AuthorityRole, garmentId = "900"): AuthorityAsset {
  const garmentScoped = role === "DIRECT_GARMENT_EVIDENCE"
    || role === "SUBJECT_A_TRANSLATION_DONOR"
    || role === "GARMENT_FRONT_SAFEGUARD";
  const directReceipt = role === "DIRECT_GARMENT_EVIDENCE"
    ? directEvidenceReceipt(garmentId)
    : null;
  return {
    role,
    assetId: directReceipt?.output.assetId ?? `authority/${role.toLowerCase()}`,
    sha256: directReceipt?.output.sha256 ?? evaluatorFixtureDigest(`authority:${role}`),
    garmentId: garmentScoped ? garmentId : null,
    sourceStage: role === "SUBJECT_A_TRANSLATION_DONOR" ? "SUBJECT_A" : null,
    reviewState: role === "SUBJECT_A_TRANSLATION_DONOR" ? "GATE_PASS_PRIVATE" : "LOCKED",
    provenanceClass: role === "SUBJECT_A_TRANSLATION_DONOR"
      ? "ACCEPTED_GENERATED"
      : role === "GARMENT_FRONT_SAFEGUARD" || role === "DIRECT_GARMENT_EVIDENCE"
        ? "GARMENT_DIRECT"
        : role === "LOCKED_ATELIER_ROOM"
          ? "LOCKED_ENVIRONMENT"
          : role.startsWith("REAL_")
            ? "REAL_DIRECT"
            : "APPROVED_CANON",
    required: true,
    permittedScope: role === "LOCKED_ATELIER_ROOM"
      ? ["ATELIER", "BRAND_ICON", "LIGHTING"]
      : role === "GARMENT_FRONT_SAFEGUARD" || role === "DIRECT_GARMENT_EVIDENCE"
        ? ["GARMENT"]
        : role === "V4_TRANSLATION_LOCK" || role === "SUBJECT_A_TRANSLATION_DONOR"
          ? ["IDENTITY", "BODY", "HAIR"]
          : ["IDENTITY", "BODY"],
    dominance: 100,
    privacyClass: role === "LOCKED_ATELIER_ROOM"
      || role === "GARMENT_FRONT_SAFEGUARD"
      || role === "DIRECT_GARMENT_EVIDENCE"
      ? "PRIVATE_OPERATOR"
      : "PRIVATE_IDENTITY",
  };
}

function garmentParent(
  role: "GARMENT_FRONT_LOCK" | "GARMENT_BACK_LOCK" | "MANNEQUIN_FRONT_LOCK" | "FABRIC_DETAIL_LOCK",
  garmentId = "900",
): ParentLock {
  const source = {
    GARMENT_FRONT_LOCK: { stage: "GARMENT_01_FRONT", view: "01" },
    GARMENT_BACK_LOCK: { stage: "GARMENT_02_BACK", view: "02" },
    MANNEQUIN_FRONT_LOCK: { stage: "GARMENT_03_MANNEQUIN", view: "03" },
    FABRIC_DETAIL_LOCK: { stage: "GARMENT_04_DETAIL", view: "04" },
  } as const;
  const exact = source[role];
  return {
    role,
    assetId: `garment/${garmentId}/${exact.view}`,
    sha256: evaluatorFixtureDigest(`garment:${garmentId}:${exact.view}`),
    garmentId,
    sourceStage: exact.stage,
    sourceView: exact.view,
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  };
}

function parents(stage: AtelierStage, garmentId = "900"): ParentLock[] {
  if (stage.startsWith("GARMENT_")) return [];
  if (stage === "SUBJECT_A" || stage === "SUBJECT_B") {
    return [
      garmentParent("GARMENT_FRONT_LOCK", garmentId),
      garmentParent("GARMENT_BACK_LOCK", garmentId),
      garmentParent("MANNEQUIN_FRONT_LOCK", garmentId),
      garmentParent("FABRIC_DETAIL_LOCK", garmentId),
    ];
  }
  if (stage === "ROOM_FINAL_05") {
    return [{
      role: "ACCEPTED_SUBJECT_LOCK",
      assetId: `garment/${garmentId}/subject-lock`,
      sha256: evaluatorFixtureDigest(`garment:${garmentId}:subject-lock`),
      garmentId,
      sourceStage: "SUBJECT_B",
      sourceView: "SUBJECT",
      reviewState: "LOCKED",
      lockedLayer: "IDENTITY",
      privacyClass: "PRIVATE_IDENTITY",
    }];
  }
  return [{
    role: "ACCEPTED_05",
    assetId: `garment/${garmentId}/05`,
    sha256: evaluatorFixtureDigest(`garment:${garmentId}:05`),
    garmentId,
    sourceStage: "ROOM_FINAL_05",
    sourceView: "05",
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_IDENTITY",
  }];
}

export function evaluatorFixtureOperation(
  stage: AtelierStage = "GARMENT_01_FRONT",
): AtelierOperation {
  const garmentId = "900";
  const recipe = ATELIER_STAGE_RECIPES[stage];
  const garmentStage = stage.startsWith("GARMENT_");
  const subjectStage = stage === "SUBJECT_A" || stage === "SUBJECT_B";
  const rearStage = stage === "GARMENT_02_BACK"
    || stage === "SIBLING_07_CORE"
    || stage === "SIBLING_07_RECOVERY";
  const directReceipt = garmentStage ? directEvidenceReceipt(garmentId) : undefined;
  const stageParents = parents(stage, garmentId);
  const stageParent = stageParents[0];
  const authorities = recipe.authorityRoles.map((role) => authority(role, garmentId));
  const immutableSource = (layer: AtelierLayer) => {
    if (stage.startsWith("SUBJECT") && layer === "HAIR") {
      return authorities.find((item) =>
        item.role === "V4_TRANSLATION_LOCK" || item.role === "SUBJECT_A_TRANSLATION_DONOR"
      ) ?? stageParent ?? authorities[0]!;
    }
    if (layer === "ATELIER" || layer === "BRAND_ICON" || layer === "LIGHTING") {
      return authorities.find((item) => item.role === "LOCKED_ATELIER_ROOM")
        ?? stageParent
        ?? authorities[0]!;
    }
    if (stage === "ROOM_FINAL_05" && layer === "GARMENT") {
      return authorities.find((item) => item.role === "GARMENT_FRONT_SAFEGUARD")
        ?? stageParent
        ?? authorities[0]!;
    }
    return stageParent ?? authorities[0]!;
  };
  const requiredImmutables = ATELIER_STAGE_LAYER_POLICIES[stage]
    .requiredImmutableLayers.map((layer) => {
      const source = immutableSource(layer);
      return { layer, assetId: source.assetId, sha256: source.sha256 };
    });
  const parentImmutables = stageParents.map((item) => ({
    layer: item.lockedLayer,
    assetId: item.assetId,
    sha256: item.sha256,
  })).filter((item) => !requiredImmutables.some((required) =>
    required.layer === item.layer
    && required.assetId === item.assetId
    && required.sha256 === item.sha256
  ));
  return atelierOperationSchema.parse({
    contractVersion: "juw.atelier-operation.v1",
    workflowRevision: "synthetic-evaluator-fixture-v1",
    garmentId,
    stage,
    view: recipe.view,
    parentLocks: stageParents,
    authorityStack: authorities,
    changeSet: [{
      mutableLayer: "COMPOSITION",
      region: "declared whole-frame stage",
      intendedDelta: `Execute ${stage} without reopening locked truth.`,
    }],
    immutableSet: [...requiredImmutables, ...parentImmutables],
    garmentFacts: ["synthetic evaluator fixture garment"],
    unknownFacts: ["unseen construction remains unknown"],
    prohibitedInferences: ["do not invent unsupported construction"],
    sceneSpec: { room: "locked-light-atelier" },
    cameraSpec: { family: "natural-catalogue" },
    poseSpec: { view: recipe.view },
    stylingSpec: { source: stage === "ROOM_FINAL_05" ? "advisory-check" : "inherit" },
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
      targetView: recipe.view,
      canvas: { width: 1024, height: 1536 },
      ...(garmentStage
        ? {
            mode: "GENERATIVE_GARMENT_MEDIA",
            fullBody: stage !== "GARMENT_04_DETAIL",
            generatedArtifact: {
              kind: stage === "GARMENT_03_MANNEQUIN"
                ? "MANNEQUIN_VIEW"
                : stage === "GARMENT_04_DETAIL"
                  ? "DETAIL_VIEW"
                  : "GARMENT_VIEW",
              format: "JPEG",
              alpha: "OPAQUE",
              background: "NEUTRAL_PRODUCT_STAGE",
            },
            deterministicComposite: null,
            finalFormat: "JPEG",
          }
        : subjectStage
          ? {
              mode: "GENERATIVE_FULL_FRAME",
              generatedArtifact: {
                kind: "FULL_FRAME",
                format: "JPEG",
                alpha: "OPAQUE",
                background: "NEUTRAL_STAGE",
              },
              deterministicComposite: null,
              finalFormat: "JPEG",
            }
          : {
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
              },
              finalFormat: "PNG",
            }),
    },
    failureGates: ["identity drift", "garment redesign", "wrong view"],
    rearInference: rearStage
      ? {
          inferred: true,
          basis: "NO_DIRECT_GARMENT_BACK",
          mayBecomeDirectEvidence: false,
        }
      : undefined,
    fashionNovaCheck: stage === "ROOM_FINAL_05"
      ? {
          operationId: "synthetic-evaluator-fashion-check-v1",
          publisher: "Fashion Nova",
          officialUrl: "https://www.fashionnova.com/collections/mini-dresses",
          resolvedOfficialUrl: "https://www.fashionnova.com/collections/mini-dresses",
          pageTitle: "Mini Dresses",
          accessedOn: "2026-08-27",
          matchedGarmentFacts: ["synthetic evaluator fixture garment"],
          decision: "KEEP",
          selectedStylingDirection: "retain restrained styling",
          authority: "ADVISORY_STYLING_ONLY",
          passedAsImageReference: false,
        }
      : undefined,
    correctionBudget: 1,
    ...(directReceipt ? { directGarmentEvidence: directReceipt } : {}),
  });
}

export function evaluatorFixtureTransportConstituents(
  operation: AtelierOperation,
): readonly StudioAtelierTransportConstituent[] {
  const assets = operation.directGarmentEvidence?.constituents
    ?? [...operation.parentLocks, ...operation.authorityStack];
  return Object.freeze(assets.map((asset) => Object.freeze({
    assetId: asset.assetId,
    sha256: asset.sha256,
    decodedPixelSha256: evaluatorFixtureDigest(`pixels:${asset.assetId}:${asset.sha256}`),
  })));
}
