import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  adapterCapabilitiesSchema,
  ATELIER_STAGE_LAYER_POLICIES,
  ATELIER_STAGE_RECIPES,
  atelierOperationSchema,
  directGarmentEvidenceReceiptSchema,
  physicalReferenceBindingSchema,
  type AtelierLayer,
  type AtelierOperation,
  type AtelierStage,
  type AuthorityAsset,
  type AuthorityRole,
  type ParentLock,
} from "../lib/studio/atelier/contracts";
import {
  STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256,
  STUDIO_ATELIER_G004_PROVIDER_DENIAL_REGISTRY,
  isStudioAtelierG004ProviderPixelDenied,
  studioAtelierG004ProviderDenial,
} from "../lib/studio/atelier/g004-provider-denial";
import { STUDIO_ATELIER_G004_CALIBRATION_MANIFEST } from "../lib/studio/atelier/g004-calibration";
import {
  deriveOperationId,
  executionHash,
  semanticOperationHash,
} from "../lib/studio/atelier/canonical";
import {
  ATELIER_ALLOWED_PACKS,
  ATELIER_LOGICAL_REFERENCE_ORDER,
  AtelierPlanningError,
  compileAtelierReferenceBindings,
  planAtelierOperation,
} from "../lib/studio/atelier/planner";
import {
  ATELIER_PROMPT_VERSION,
  AtelierPromptCompilationError,
  compileAtelierPrompt,
} from "../lib/studio/atelier/prompt-compiler";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

function directEvidenceReceipt(garmentId = "024") {
  const outputSha256 = digest(`direct-evidence-pack:${garmentId}`);
  return directGarmentEvidenceReceiptSchema.parse({
    schemaVersion: "juw.direct-garment-evidence-receipt.v1",
    sourceManifest: {
      revision: `garment-${garmentId}-source-manifest-v1`,
      sha256: digest(`source-manifest:${garmentId}`),
      attestationId: `garment-${garmentId}-source-manifest-attestation-v1`,
      verificationStatus: "VERIFIED",
    },
    recipeVersion: "direct-garment-evidence-pack-v1",
    compilerVersion: "direct-garment-evidence-pack-compiler-v1",
    constituents: ["a", "b", "c"].map((suffix, index) => ({
      assetId: `garment/${garmentId}/source-${suffix}`,
      sha256: digest(`garment:${garmentId}:source:${suffix}`),
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

function authority(role: AuthorityRole, garmentId = "024"): AuthorityAsset {
  const garmentScoped = role === "DIRECT_GARMENT_EVIDENCE"
    || role === "SUBJECT_A_TRANSLATION_DONOR"
    || role === "GARMENT_FRONT_SAFEGUARD";
  const directReceipt = role === "DIRECT_GARMENT_EVIDENCE"
    ? directEvidenceReceipt(garmentId)
    : null;
  return {
    role,
    assetId: directReceipt?.output.assetId ?? `authority/${role.toLowerCase()}`,
    sha256: directReceipt?.output.sha256 ?? digest(`authority:${role}`),
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
  garmentId = "024",
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
    sha256: digest(`garment:${garmentId}:${exact.view}`),
    garmentId,
    sourceStage: exact.stage,
    sourceView: exact.view,
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_OPERATOR",
  };
}

function parents(stage: AtelierStage, garmentId = "024"): ParentLock[] {
  if (stage === "GARMENT_01_FRONT"
    || stage === "GARMENT_02_BACK"
    || stage === "GARMENT_03_MANNEQUIN"
    || stage === "GARMENT_04_DETAIL") return [];
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
      sha256: digest(`garment:${garmentId}:subject-lock`),
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
    sha256: digest(`garment:${garmentId}:05`),
    garmentId,
    sourceStage: "ROOM_FINAL_05",
    sourceView: "05",
    reviewState: "LOCKED",
    lockedLayer: "GARMENT",
    privacyClass: "PRIVATE_IDENTITY",
  }];
}

function operation(stage: AtelierStage): AtelierOperation {
  const recipe = ATELIER_STAGE_RECIPES[stage];
  const rearStage = stage === "GARMENT_02_BACK"
    || stage === "SIBLING_07_CORE"
    || stage === "SIBLING_07_RECOVERY";
  const garmentStage = stage === "GARMENT_01_FRONT"
    || stage === "GARMENT_02_BACK"
    || stage === "GARMENT_03_MANNEQUIN"
    || stage === "GARMENT_04_DETAIL";
  const subjectStage = stage === "SUBJECT_A" || stage === "SUBJECT_B";
  const directReceipt = garmentStage ? directEvidenceReceipt() : undefined;
  const stageParents = parents(stage);
  const stageParent = stageParents[0];
  const authorities = recipe.authorityRoles.map((role) => authority(role));
  const immutableSource = (layer: AtelierLayer) => {
    if (stage.startsWith("SUBJECT") && layer === "HAIR") {
      return authorities.find((item) =>
        item.role === "V4_TRANSLATION_LOCK" || item.role === "SUBJECT_A_TRANSLATION_DONOR"
      ) ?? stageParent ?? authorities[0]!;
    }
    if (layer === "ATELIER" || layer === "BRAND_ICON" || layer === "LIGHTING") {
      return authorities.find((item) => item.role === "LOCKED_ATELIER_ROOM") ?? stageParent ?? authorities[0]!;
    }
    if (stage === "ROOM_FINAL_05" && layer === "GARMENT") {
      return authorities.find((item) => item.role === "GARMENT_FRONT_SAFEGUARD") ?? stageParent ?? authorities[0]!;
    }
    return stageParent ?? authorities[0]!;
  };
  const requiredImmutables = ATELIER_STAGE_LAYER_POLICIES[stage].requiredImmutableLayers.map((layer) => {
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
    workflowRevision: "2026-08-26.90",
    garmentId: "024",
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
    garmentFacts: ["black asymmetric sculpted-shoulder mini dress"],
    unknownFacts: ["unseen rear fastening"],
    prohibitedInferences: ["do not invent rear ornament"],
    sceneSpec: { room: "locked-light-atelier" },
    cameraSpec: { family: "natural-catalogue" },
    poseSpec: { view: recipe.view },
    stylingSpec: { source: stage === "ROOM_FINAL_05" ? "advisory-check" : "inherit-05" },
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
          operationId: "g024-fashion-nova-check-v001",
          publisher: "Fashion Nova",
          officialUrl: "https://www.fashionnova.com/collections/mini-dresses",
          resolvedOfficialUrl: "https://www.fashionnova.com/collections/mini-dresses",
          pageTitle: "Mini Dresses",
          accessedOn: "2026-08-25",
          matchedGarmentFacts: ["black asymmetric mini dress"],
          decision: "KEEP",
          selectedStylingDirection: "retain the accepted restrained footwear",
          authority: "ADVISORY_STYLING_ONLY",
          passedAsImageReference: false,
        }
      : undefined,
    correctionBudget: 1,
    ...(directReceipt ? { directGarmentEvidence: directReceipt } : {}),
  });
}

const opaqueAdapter = adapterCapabilitiesSchema.parse({
  adapterId: "vercel-ai-gateway/openai-gpt-image-2-full-frame",
  adapterVersion: "atelier-gpt-image-2-full-frame-v1",
  maxPhysicalReferences: 4,
  supportedStages: ["SUBJECT_A", "SUBJECT_B"],
  acceptedPrivacyClasses: ["PRIVATE_OPERATOR", "PRIVATE_IDENTITY"],
  supportedOutputModes: ["GENERATIVE_FULL_FRAME"],
  supportedGeneratedArtifactFormats: ["JPEG"],
  supportedFinalFormats: ["JPEG"],
  supportsRequiredAlpha: false,
});

const garmentAdapter = adapterCapabilitiesSchema.parse({
  adapterId: "vercel-ai-gateway/openai-gpt-image-2-garment-media",
  adapterVersion: "atelier-gpt-image-2-garment-media-v1",
  maxPhysicalReferences: 4,
  supportedStages: [
    "GARMENT_01_FRONT",
    "GARMENT_02_BACK",
    "GARMENT_03_MANNEQUIN",
    "GARMENT_04_DETAIL",
  ],
  acceptedPrivacyClasses: ["PRIVATE_OPERATOR"],
  supportedOutputModes: ["GENERATIVE_GARMENT_MEDIA"],
  supportedGeneratedArtifactFormats: ["JPEG"],
  supportedFinalFormats: ["JPEG"],
  supportsRequiredAlpha: false,
});

const transparentAdapter = adapterCapabilitiesSchema.parse({
  adapterId: "vercel-ai-gateway/openai-gpt-image-2-subject-layer",
  adapterVersion: "atelier-gpt-image-2-subject-layer-v1",
  maxPhysicalReferences: 4,
  supportedStages: [
    "ROOM_FINAL_05",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ],
  acceptedPrivacyClasses: ["PRIVATE_OPERATOR", "PRIVATE_IDENTITY"],
  supportedOutputModes: ["TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"],
  supportedGeneratedArtifactFormats: ["PNG"],
  supportedFinalFormats: ["PNG"],
  supportsRequiredAlpha: true,
});

function adapterFor(stage: AtelierStage) {
  return stage === "GARMENT_01_FRONT"
    || stage === "GARMENT_02_BACK"
    || stage === "GARMENT_03_MANNEQUIN"
    || stage === "GARMENT_04_DETAIL"
    ? garmentAdapter
    : stage === "SUBJECT_A" || stage === "SUBJECT_B"
    ? opaqueAdapter
    : transparentAdapter;
}

function approvedPacks(candidate: AtelierOperation) {
  return ATELIER_ALLOWED_PACKS[candidate.stage].map((packRecipe) => ({
    packRole: packRecipe.packRole,
    assetId: `pack/${packRecipe.packRole.toLowerCase()}`,
    sha256: digest(`pack:${packRecipe.packRole}`),
    privacyClass: "PRIVATE_IDENTITY" as const,
    method: packRecipe.method,
    attestationId: `attestation/${packRecipe.packRole.toLowerCase()}`,
    constituents: packRecipe.constituentRoles.map((role) => {
      const parentItem = candidate.parentLocks.find((entry) => entry.role === role);
      const authorityItem = candidate.authorityStack.find((entry) => entry.role === role);
      const item = parentItem ?? authorityItem;
      assert.ok(item);
      return {
        kind: parentItem ? "PARENT" as const : "AUTHORITY" as const,
        role,
        assetId: item.assetId,
        sha256: item.sha256,
      };
    }),
  }));
}

test("the ten canonical stages resolve exact same-garment logical recipes", () => {
  const expectedDirectCounts: Record<AtelierStage, number> = {
    GARMENT_01_FRONT: 1,
    GARMENT_02_BACK: 1,
    GARMENT_03_MANNEQUIN: 1,
    GARMENT_04_DETAIL: 1,
    SUBJECT_A: 8,
    SUBJECT_B: 8,
    ROOM_FINAL_05: 3,
    SIBLING_06: 5,
    SIBLING_07_CORE: 5,
    SIBLING_07_RECOVERY: 6,
  };
  for (const stage of Object.keys(expectedDirectCounts) as AtelierStage[]) {
    const candidate = operation(stage);
    assert.equal(atelierOperationSchema.safeParse(candidate).success, true);
    const bindings = compileAtelierReferenceBindings(candidate);
    assert.equal(bindings.length, expectedDirectCounts[stage]);
    assert.deepEqual(bindings.map((binding) => binding.slot),
      Array.from({ length: bindings.length }, (_, index) => index + 1));
    assert.equal(bindings[0]?.physicalRole, ATELIER_LOGICAL_REFERENCE_ORDER[stage][0].role);
  }
});

test("G004 positive targets are denied by every locked identifier and hash before planning", () => {
  assert.deepEqual(
    STUDIO_ATELIER_G004_PROVIDER_DENIAL_REGISTRY,
    STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.flatMap((asset) => [{
      kind: "VERSION_LOCKED_DERIVATIVE_ID",
      view: asset.view,
      field: "assetId",
      value: asset.id,
    }, {
      kind: "VERSION_LOCKED_DERIVATIVE_CONTAINER_SHA256",
      view: asset.view,
      field: "sha256",
      value: asset.sha256,
    }, {
      kind: "RECORDED_CANONICAL_ID",
      view: asset.view,
      field: "assetId",
      value: asset.recordedCanonicalAssetId,
    }, {
      kind: "RECORDED_CANONICAL_SHA256",
      view: asset.view,
      field: "sha256",
      value: asset.recordedCanonicalSha256,
    }]),
  );
  assert.deepEqual(
    STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256,
    STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.map((asset) => asset.pixelSha256),
  );
  for (const pixelSha256 of STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256) {
    assert.equal(isStudioAtelierG004ProviderPixelDenied(pixelSha256), true);
  }
  assert.equal(isStudioAtelierG004ProviderPixelDenied(digest("normal-provider-pixels")), false);
  assert.equal(atelierOperationSchema.safeParse(operation("SUBJECT_A")).success, true);
  assert.equal(atelierOperationSchema.safeParse(operation("SIBLING_06")).success, true);

  const normalPhysicalBinding = {
    slot: 1,
    physicalRole: "REAL_FACE_OPERATION_BOARD" as const,
    assetId: "authority/normal-face-board",
    sha256: digest("authority:normal-face-board"),
    privacyClass: "PRIVATE_IDENTITY" as const,
    packing: null,
    constituents: [{
      kind: "AUTHORITY" as const,
      role: "REAL_FACE_OPERATION_BOARD" as const,
      assetId: "authority/normal-face-board",
      sha256: digest("authority:normal-face-board"),
    }],
  };
  assert.equal(physicalReferenceBindingSchema.safeParse(normalPhysicalBinding).success, true);
  assert.equal(studioAtelierG004ProviderDenial(normalPhysicalBinding), null);

  const hasEvaluatorOnlyIssue = (result: ReturnType<typeof atelierOperationSchema.safeParse>) =>
    !result.success && result.error.issues.some((issue) => /evaluator-only/.test(issue.message));

  for (const denial of STUDIO_ATELIER_G004_PROVIDER_DENIAL_REGISTRY) {
    const authorityCandidate = clone(operation("SUBJECT_A"));
    const authority = authorityCandidate.authorityStack[0]!;
    const previousAuthority = { assetId: authority.assetId, sha256: authority.sha256 };
    authority[denial.field] = denial.value;
    authorityCandidate.immutableSet.forEach((immutable) => {
      if (
        immutable.assetId === previousAuthority.assetId
        && immutable.sha256 === previousAuthority.sha256
      ) {
        immutable[denial.field] = denial.value;
      }
    });
    const deniedAuthority = atelierOperationSchema.safeParse(authorityCandidate);
    assert.equal(
      hasEvaluatorOnlyIssue(deniedAuthority),
      true,
      `${denial.kind} ${denial.view} must be denied as authority`,
    );
    assert.throws(
      () => planAtelierOperation({
        operation: authorityCandidate,
        adapter: adapterFor(authorityCandidate.stage),
      }),
      (error: unknown) => error instanceof AtelierPlanningError
        && error.code === "INVALID_OPERATION",
      `${denial.kind} ${denial.view} reached planning as authority`,
    );

    const directEvidenceCandidate = clone(operation("GARMENT_01_FRONT"));
    const directConstituent = directEvidenceCandidate.directGarmentEvidence?.constituents[0];
    assert.ok(directConstituent);
    directConstituent[denial.field] = denial.value;
    const deniedDirectConstituent = atelierOperationSchema.safeParse(directEvidenceCandidate);
    assert.equal(
      hasEvaluatorOnlyIssue(deniedDirectConstituent),
      true,
      `${denial.kind} ${denial.view} must be denied as packed garment evidence`,
    );
    assert.throws(
      () => planAtelierOperation({
        operation: directEvidenceCandidate,
        adapter: adapterFor(directEvidenceCandidate.stage),
      }),
      (error: unknown) => error instanceof AtelierPlanningError
        && error.code === "INVALID_OPERATION",
      `${denial.kind} ${denial.view} reached planning inside garment evidence`,
    );

    const parentCandidate = clone(operation("SIBLING_06"));
    const parent = parentCandidate.parentLocks[0]!;
    const previousParent = { assetId: parent.assetId, sha256: parent.sha256 };
    parent[denial.field] = denial.value;
    parentCandidate.immutableSet.forEach((immutable) => {
      if (
        immutable.assetId === previousParent.assetId
        && immutable.sha256 === previousParent.sha256
      ) {
        immutable[denial.field] = denial.value;
      }
    });
    const deniedParent = atelierOperationSchema.safeParse(parentCandidate);
    assert.equal(
      hasEvaluatorOnlyIssue(deniedParent),
      true,
      `${denial.kind} ${denial.view} must be denied as parent`,
    );
    assert.throws(
      () => planAtelierOperation({
        operation: parentCandidate,
        adapter: adapterFor(parentCandidate.stage),
      }),
      (error: unknown) => error instanceof AtelierPlanningError
        && error.code === "INVALID_OPERATION",
      `${denial.kind} ${denial.view} reached planning as parent`,
    );

    const transportCandidate = clone(normalPhysicalBinding);
    transportCandidate[denial.field] = denial.value;
    transportCandidate.constituents[0]![denial.field] = denial.value;
    const deniedTransport = physicalReferenceBindingSchema.safeParse(transportCandidate);
    assert.equal(
      deniedTransport.success,
      false,
      `${denial.kind} ${denial.view} reached physical provider transport`,
    );
    assert.equal(
      studioAtelierG004ProviderDenial(transportCandidate)?.kind,
      denial.kind,
    );
  }
});

test("the provider reference cap receives one pack without omitting direct source truth", () => {
  const candidate = operation("GARMENT_01_FRONT");
  assert.equal(candidate.directGarmentEvidence?.constituents.length, 3);
  const plan = planAtelierOperation({
    operation: candidate,
    adapter: {
      ...garmentAdapter,
      maxPhysicalReferences: 1,
    },
  });
  assert.equal(plan.physicalReferenceCount, 1);
  assert.equal(plan.orderedReferences[0]?.physicalRole, "DIRECT_GARMENT_EVIDENCE");
  assert.equal(
    plan.orderedReferences[0]?.assetId,
    candidate.directGarmentEvidence?.output.assetId,
  );
  assert.deepEqual(
    candidate.directGarmentEvidence?.constituents.map((item) => item.assetId),
    [
      "garment/024/source-a",
      "garment/024/source-b",
      "garment/024/source-c",
    ],
  );
});

test("lineage rejects another garment, unlocked or sibling parents, and failed donors", () => {
  const wrongGarment = clone(operation("SIBLING_06"));
  wrongGarment.parentLocks[0].garmentId = "023";
  assert.equal(atelierOperationSchema.safeParse(wrongGarment).success, false);

  const rejectedParent = clone(operation("SIBLING_07_CORE"));
  rejectedParent.parentLocks[0].reviewState = "REJECTED";
  assert.equal(atelierOperationSchema.safeParse(rejectedParent).success, false);

  const siblingParent = clone(operation("SIBLING_07_CORE"));
  siblingParent.parentLocks[0].sourceStage = "SIBLING_06";
  siblingParent.parentLocks[0].sourceView = "06";
  assert.equal(atelierOperationSchema.safeParse(siblingParent).success, false);

  for (const badState of ["CANDIDATE", "REJECTED", "SUPERSEDED"] as const) {
    const subjectB = clone(operation("SUBJECT_B"));
    const donor = subjectB.authorityStack.find((item) => item.role === "SUBJECT_A_TRANSLATION_DONOR");
    assert.ok(donor);
    donor.reviewState = badState;
    assert.equal(atelierOperationSchema.safeParse(subjectB).success, false);
  }
});

test("07 must declare conservative rear inference and no other view may carry it", () => {
  const missing = clone(operation("SIBLING_07_CORE"));
  delete missing.rearInference;
  assert.equal(atelierOperationSchema.safeParse(missing).success, false);

  const inconsistent = clone(operation("SIBLING_07_RECOVERY"));
  assert.ok(inconsistent.rearInference);
  inconsistent.rearInference.basis = "DIRECT_GARMENT_BACK";
  assert.equal(atelierOperationSchema.safeParse(inconsistent).success, false);

  const leaked = clone(operation("SIBLING_06"));
  leaked.rearInference = {
    inferred: true,
    basis: "NO_DIRECT_GARMENT_BACK",
    mayBecomeDirectEvidence: false,
  };
  assert.equal(atelierOperationSchema.safeParse(leaked).success, false);
});

test("stage layer policy rejects undeclared mutation, overlap, fictional immutables, and missing parent locks", () => {
  const disallowedMutation = clone(operation("SUBJECT_A"));
  disallowedMutation.changeSet[0].mutableLayer = "ATELIER";
  assert.equal(atelierOperationSchema.safeParse(disallowedMutation).success, false);

  const overlap = clone(operation("ROOM_FINAL_05"));
  const roomAuthority = overlap.authorityStack.find((item) => item.role === "LOCKED_ATELIER_ROOM");
  assert.ok(roomAuthority);
  overlap.immutableSet.push({
    layer: "COMPOSITION",
    assetId: roomAuthority.assetId,
    sha256: roomAuthority.sha256,
  });
  assert.equal(atelierOperationSchema.safeParse(overlap).success, false);

  const fictionalImmutable = clone(operation("SIBLING_06"));
  fictionalImmutable.immutableSet[0].assetId = "fictional/immutable";
  fictionalImmutable.immutableSet[0].sha256 = digest("fictional-immutable");
  assert.equal(atelierOperationSchema.safeParse(fictionalImmutable).success, false);

  const missingParentTuple = clone(operation("ROOM_FINAL_05"));
  const identity = missingParentTuple.immutableSet.find((item) => item.layer === "IDENTITY");
  const lockedRoom = missingParentTuple.authorityStack.find((item) => item.role === "LOCKED_ATELIER_ROOM");
  assert.ok(identity);
  assert.ok(lockedRoom);
  identity.assetId = lockedRoom.assetId;
  identity.sha256 = lockedRoom.sha256;
  assert.equal(atelierOperationSchema.safeParse(missingParentTuple).success, false);

  const missingRequiredLayer = clone(operation("SIBLING_07_CORE"));
  missingRequiredLayer.immutableSet = missingRequiredLayer.immutableSet.filter(
    (item) => item.layer !== "STYLING",
  );
  assert.equal(atelierOperationSchema.safeParse(missingRequiredLayer).success, false);
});

test("stage contracts reject output-mode substitution", () => {
  const subjectWithComposite = clone(operation("SUBJECT_A")) as unknown as Record<string, unknown>;
  subjectWithComposite.outputContract = {
    ...operation("ROOM_FINAL_05").outputContract,
    targetView: "SUBJECT",
  };
  assert.equal(atelierOperationSchema.safeParse(subjectWithComposite).success, false);

  const roomWithOpaqueFrame = clone(operation("ROOM_FINAL_05")) as unknown as Record<string, unknown>;
  roomWithOpaqueFrame.outputContract = {
    ...operation("SUBJECT_A").outputContract,
    targetView: "05",
  };
  assert.equal(atelierOperationSchema.safeParse(roomWithOpaqueFrame).success, false);
});

test("Fashion Nova advisory evidence requires official HTTPS URLs and real calendar dates", () => {
  const validLeapDay = clone(operation("ROOM_FINAL_05"));
  assert.ok(validLeapDay.fashionNovaCheck);
  validLeapDay.fashionNovaCheck.accessedOn = "2024-02-29";
  assert.equal(atelierOperationSchema.safeParse(validLeapDay).success, true);

  const lookalike = clone(operation("ROOM_FINAL_05"));
  assert.ok(lookalike.fashionNovaCheck);
  lookalike.fashionNovaCheck.officialUrl = "https://fashionnova.com.example.test/mini-dresses";
  assert.equal(atelierOperationSchema.safeParse(lookalike).success, false);

  const impossibleDate = clone(operation("ROOM_FINAL_05"));
  assert.ok(impossibleDate.fashionNovaCheck);
  impossibleDate.fashionNovaCheck.accessedOn = "2026-02-30";
  assert.equal(atelierOperationSchema.safeParse(impossibleDate).success, false);
});

test("planner blocks over-budget raw stacks and accepts only exact attested packing", () => {
  for (const stage of [
    "SUBJECT_A",
    "SUBJECT_B",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ] as const) {
    const candidate = operation(stage);
    const adapter = adapterFor(stage);
    assert.throws(
      () => planAtelierOperation({ operation: candidate, adapter }),
      (error: unknown) => error instanceof AtelierPlanningError
        && error.code === "BLOCKED_CAPABILITY",
    );
    const plan = planAtelierOperation({
      operation: candidate,
      adapter,
      packs: approvedPacks(candidate),
    });
    assert.ok(plan.physicalReferenceCount <= 4);
    assert.match(plan.operationId, /^atelier:[a-f0-9]{64}$/);
  }

  const room = planAtelierOperation({
    operation: operation("ROOM_FINAL_05"),
    adapter: transparentAdapter,
  });
  assert.equal(room.physicalReferenceCount, 3);

  const subjectB = operation("SUBJECT_B");
  const subjectBPlan = planAtelierOperation({
    operation: subjectB,
    adapter: opaqueAdapter,
    packs: approvedPacks(subjectB),
  });
  assert.equal(subjectBPlan.orderedReferences[0]?.physicalRole, "SUBJECT_A_TRANSLATION_DONOR");
  assert.equal(subjectBPlan.orderedReferences[0]?.packing, null);
  assert.equal(subjectBPlan.orderedReferences[1]?.physicalRole, "GARMENT_SET_01_04_BOARD");

  const recovery = operation("SIBLING_07_RECOVERY");
  const recoveryPlan = planAtelierOperation({
    operation: recovery,
    adapter: transparentAdapter,
    packs: approvedPacks(recovery),
  });
  assert.equal(recoveryPlan.physicalReferenceCount, 3);
  assert.deepEqual(recoveryPlan.orderedReferences.map((reference) => reference.physicalRole), [
    "ACCEPTED_05",
    "FUSED_IDENTITY_REAR_RECOVERY_BOARD",
    "LOCKED_ATELIER_ROOM",
  ]);
  assert.deepEqual(recoveryPlan.orderedReferences[1]?.constituents.map((item) => item.role), [
    "REAL_FACE_OPERATION_BOARD",
    "BODY_BACK_CANON",
    "REAL_LULU_ANGLE_CONTACT",
    "REAL_LULU_GYM_REAR_PROFILE",
  ]);
  assert.equal(
    recoveryPlan.orderedReferences[1]?.packing?.method,
    "DETERMINISTIC_COMPOSITE_BOARD",
  );
  const staleRecoveryPack = approvedPacks(recovery).map((pack) => ({
    ...pack,
    packRole: "REAR_RECOVERY_BOARD",
  }));
  assert.throws(
    () => planAtelierOperation({
      operation: recovery,
      adapter: transparentAdapter,
      packs: staleRecoveryPack,
    }),
    (error: unknown) => error instanceof AtelierPlanningError
      && error.code === "INVALID_REFERENCE_PACK",
  );

  const core = operation("SIBLING_07_CORE");
  const malformed = approvedPacks(core);
  malformed[0].constituents[0].sha256 = digest("wrong-back-canon");
  assert.throws(
    () => planAtelierOperation({
      operation: core,
      adapter: transparentAdapter,
      packs: malformed,
    }),
    (error: unknown) => error instanceof AtelierPlanningError
      && error.code === "INVALID_REFERENCE_PACK",
  );
});

test("semantic identity ignores ordering and provider choice but changes with truth", () => {
  const base = operation("SIBLING_07_CORE");
  const reordered = clone(base);
  reordered.authorityStack.reverse();
  reordered.garmentFacts.reverse();
  reordered.failureGates.reverse();
  assert.equal(semanticOperationHash(base), semanticOperationHash(reordered));
  assert.equal(deriveOperationId(base), `atelier:${semanticOperationHash(base)}`);

  const revised = clone(base);
  revised.workflowRevision = "2026-08-26.91";
  assert.notEqual(semanticOperationHash(base), semanticOperationHash(revised));

  const changedAuthority = clone(base);
  changedAuthority.authorityStack[0].sha256 = digest("changed-authority-bytes");
  assert.notEqual(semanticOperationHash(base), semanticOperationHash(changedAuthority));

  assert.equal(atelierOperationSchema.safeParse({
    ...base,
    provider: "openai",
    model: "openai/gpt-image-2",
  }).success, false);
});

test("planner blocks adapters that cannot satisfy the declared output artifact", () => {
  const room = operation("ROOM_FINAL_05");
  assert.throws(
    () => planAtelierOperation({ operation: room, adapter: opaqueAdapter }),
    (error: unknown) => error instanceof AtelierPlanningError
      && error.code === "BLOCKED_CAPABILITY",
  );

  const subject = operation("SUBJECT_A");
  assert.throws(
    () => planAtelierOperation({
      operation: subject,
      adapter: transparentAdapter,
      packs: approvedPacks(subject),
    }),
    (error: unknown) => error instanceof AtelierPlanningError
      && error.code === "BLOCKED_CAPABILITY",
  );
});

test("execution identity includes adapter, provider, model, prompt, and exact binding order", () => {
  const candidate = operation("SIBLING_07_CORE");
  const plan = planAtelierOperation({
    operation: candidate,
    adapter: transparentAdapter,
    packs: approvedPacks(candidate),
  });
  const execution = {
    semanticOperationHash: plan.semanticOperationHash,
    adapterId: transparentAdapter.adapterId,
    adapterVersion: transparentAdapter.adapterVersion,
    provider: "openai",
    model: "openai/gpt-image-2",
    modelRevision: "2026-08-25",
    compiledPrompt: "Preserve every named authority and create only view 07.",
    orderedReferences: plan.orderedReferences,
    preprocessingVersion: "atelier-packer-v1",
    seed: null,
    sampler: null,
    parameters: { size: "1024x1536", quality: "medium" },
    providerPolicyRevision: "2026-08-26.1",
  };
  const first = executionHash(execution);
  assert.match(first, /^[a-f0-9]{64}$/);
  assert.notEqual(first, executionHash({ ...execution, model: "openai/gpt-image-2-revision-b" }));
  assert.notEqual(first, executionHash({ ...execution, provider: "different-provider" }));
  assert.notEqual(first, executionHash({ ...execution, adapterVersion: "atelier-gpt-image-2-v2" }));
  assert.notEqual(first, executionHash({ ...execution, compiledPrompt: `${execution.compiledPrompt} Keep the icon exact.` }));

  const reversed = [...plan.orderedReferences]
    .reverse()
    .map((reference, index) => ({ ...reference, slot: index + 1 }));
  assert.notEqual(first, executionHash({ ...execution, orderedReferences: reversed }));

  assert.equal(
    plan.semanticOperationHash,
    planAtelierOperation({
      operation: candidate,
      adapter: { ...transparentAdapter, adapterId: "qualified/second-adapter" },
      packs: approvedPacks(candidate),
    }).semanticOperationHash,
  );
});

test("canonical prompt is deterministic, complete, versioned, and exact-binding only", () => {
  const candidate = operation("SIBLING_07_RECOVERY");
  const plan = planAtelierOperation({
    operation: candidate,
    adapter: transparentAdapter,
    packs: approvedPacks(candidate),
  });
  const compiled = compileAtelierPrompt({
    operation: plan.operation,
    orderedReferences: plan.orderedReferences,
  });
  assert.equal(compiled.version, ATELIER_PROMPT_VERSION);
  assert.match(compiled.sha256, /^[a-f0-9]{64}$/);
  assert.match(compiled.text, /targetView=07/);
  assert.match(compiled.text, /RIGHT REAR 3Q/);
  assert.match(compiled.text, /AUTHORITY STACK/);
  assert.match(compiled.text, /ORDERED PHYSICAL REFERENCES/);
  assert.match(compiled.text, /IMAGE_1: physicalRole=ACCEPTED_05/);
  assert.match(compiled.text, /upper section is the complete identity operation board/);
  assert.match(compiled.text, /lower section is a nested rear-evidence board/);
  assert.match(compiled.text, /never render panels, seams or the fused board layout/);
  assert.match(compiled.text, /IMMUTABLE TRUTH/);
  assert.match(compiled.text, /UNKNOWN FACTS — KEEP UNKNOWN/);
  assert.match(compiled.text, /unseen rear fastening/);
  assert.match(compiled.text, /do not invent rear ornament/);
  assert.match(compiled.text, /OUTPUT CONTRACT/);
  assert.match(compiled.text, /mode=TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE/);
  assert.match(compiled.text, /generatedKind=SUBJECT_LAYER/);
  assert.match(compiled.text, /generatedFormat=PNG/);
  assert.match(compiled.text, /generatedAlpha=REQUIRED/);
  assert.match(compiled.text, /lockedRoomRole=LOCKED_ATELIER_ROOM/);
  assert.match(compiled.text, /preserveLockedRoomPixels=true/);
  assert.match(compiled.text, /RENDER QUALITY CONTRACT/);
  assert.match(compiled.text, /Return only the same-canvas full-body subject pixels as a transparent PNG layer/);
  assert.match(compiled.text, /it is not provider-rendered output/);
  assert.match(compiled.text, /Render no wall, JUW icon, rail, props, floor, room pixels/);
  assert.match(compiled.text, /Do not render or repaint the room/);

  const reordered = clone(candidate);
  reordered.authorityStack.reverse();
  reordered.immutableSet.reverse();
  reordered.failureGates.reverse();
  const reorderedPlan = planAtelierOperation({
    operation: reordered,
    adapter: transparentAdapter,
    packs: approvedPacks(reordered),
  });
  assert.deepEqual(
    compileAtelierPrompt({
      operation: reorderedPlan.operation,
      orderedReferences: reorderedPlan.orderedReferences,
    }),
    compiled,
  );

  assert.throws(
    () => compileAtelierPrompt({
      operation: plan.operation,
      orderedReferences: plan.orderedReferences.slice(1),
    }),
    (error: unknown) => error instanceof AtelierPromptCompilationError,
  );
});
