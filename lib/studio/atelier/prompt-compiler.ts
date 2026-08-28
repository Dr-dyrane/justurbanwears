import {
  canonicalAtelierOperation,
  canonicalStringify,
  semanticOperationHash,
  sha256Text,
} from "./canonical";
import {
  physicalReferenceBindingSchema,
  type AtelierOperation,
  type LogicalReference,
  type PhysicalReferenceBinding,
  type ReferencePackRole,
} from "./contracts";
import {
  providerSafetyContextPromptLines,
  validateProviderSafetyContextReceipt,
} from "./provider-safety-context";

export const ATELIER_PROMPT_VERSION = "juw-atelier-canonical-prompt-v4" as const;

export type CompiledAtelierPrompt = Readonly<{
  version: typeof ATELIER_PROMPT_VERSION;
  text: string;
  sha256: string;
}>;

export class AtelierPromptCompilationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AtelierPromptCompilationError";
  }
}

const viewInstructions = Object.freeze({
  "01": "GARMENT FRONT: complete visible front construction from direct garment evidence only.",
  "02": "GARMENT BACK: direct visible rear when available; otherwise an explicitly conservative inferred presentation that never becomes direct evidence.",
  "03": "MANNEQUIN FRONT: complete garment on an anonymous neutral mannequin; source environment, Lulu identity/body and the JUW atelier have no authority.",
  "04": "FABRIC DETAIL: one close visible garment detail; never claim fibre composition, material identity or hidden construction.",
  SUBJECT: "Holistic full-body subject lock on neutral staging; this is not a catalogue sibling view.",
  "05": "FRONT MASTER: clean full-body front subject geometry aligned to the locked JUW atelier canvas.",
  "06": "LEFT PROFILE: clean full-body soft left profile / slight three-quarter sibling from accepted 05.",
  "07": "RIGHT REAR 3Q: clean full-body right rear three-quarter sibling from accepted 05; never a complete back view.",
} as const);

const packedReferenceGuidance = Object.freeze({
  GARMENT_SET_01_04_BOARD: "Read 01 garment front, 02 garment back, 03 neutral mannequin front and 04 visible detail as four independently locked same-garment views. The board is transport only: do not render its panels, labels or layout, and never let one constituent become the source of another.",
  SUBJECT_A_TRANSLATION_FACE_BOARD: "Read the translation lock, front body canon and real angle contact as separate scoped evidence. Use the board to coordinate subject geometry; never render its panels or board layout.",
  SUBJECT_B_TRANSLATION_FACE_BOARD: "Read the front body canon and real angle contact as separate scoped evidence while the independent face board remains primary identity truth. Never render the packed panels or board layout.",
  SIDE_BODY_ANGLE_BOARD: "Read the side body canon and direct real-Lulu angle contact together for the left-profile silhouette. The canon controls balanced geometry and the real contact controls lived posture; never render the board layout.",
  BACK_BODY_ANGLE_BOARD: "Read the back body canon and direct real-Lulu angle contact together for right rear three-quarter geometry. Do not convert this evidence into a complete back view or render the board layout.",
  FUSED_IDENTITY_REAR_RECOVERY_BOARD: "The upper section is the complete identity operation board. The lower section is a nested rear-evidence board containing back body canon, direct real-Lulu angle contact and gym rear-profile evidence. Read both sections by their scoped roles, never as one scene, and never render panels, seams or the fused board layout.",
} as const satisfies Record<ReferencePackRole, string>);

function logicalKey(reference: LogicalReference): string {
  return `${reference.kind}:${reference.role}:${reference.assetId}:${reference.sha256}`;
}

function logicalReferences(operation: AtelierOperation): LogicalReference[] {
  return [
    ...operation.parentLocks.map((parent) => ({
      kind: "PARENT" as const,
      role: parent.role,
      assetId: parent.assetId,
      sha256: parent.sha256,
    })),
    ...operation.authorityStack.map((authority) => ({
      kind: "AUTHORITY" as const,
      role: authority.role,
      assetId: authority.assetId,
      sha256: authority.sha256,
    })),
  ];
}

function parseOrderedBindings(
  rawBindings: readonly unknown[],
  operation: AtelierOperation,
): PhysicalReferenceBinding[] {
  const bindings = rawBindings.map((binding) => physicalReferenceBindingSchema.parse(binding));
  if (bindings.length === 0) {
    throw new AtelierPromptCompilationError("The canonical prompt requires at least one physical reference.");
  }
  bindings.forEach((binding, index) => {
    if (binding.slot !== index + 1) {
      throw new AtelierPromptCompilationError("Physical reference slots must be contiguous and ordered from one.");
    }
  });

  const expected = logicalReferences(operation).map(logicalKey);
  const actual = bindings.flatMap((binding) => binding.constituents).map(logicalKey);
  if (
    expected.length !== actual.length
    || new Set(expected).size !== expected.length
    || new Set(actual).size !== actual.length
    || expected.some((key) => !actual.includes(key))
  ) {
    throw new AtelierPromptCompilationError(
      "Ordered physical bindings must carry every exact parent and authority exactly once.",
    );
  }
  return bindings;
}

function bulletLines(values: readonly string[], empty: string): string[] {
  return values.length > 0 ? values.map((value) => `- ${value}`) : [`- ${empty}`];
}

function authorityLines(operation: AtelierOperation): string[] {
  return operation.authorityStack.map((authority) =>
    `- ${authority.role}: asset=${authority.assetId}; sha256=${authority.sha256}; `
    + `provenance=${authority.provenanceClass}; review=${authority.reviewState}; `
    + `dominance=${authority.dominance}; scope=${authority.permittedScope.join(",")}.`
  );
}

function parentLines(operation: AtelierOperation): string[] {
  return operation.parentLocks.map((parent) =>
    `- ${parent.role}: asset=${parent.assetId}; sha256=${parent.sha256}; `
    + `source=${parent.sourceStage}/${parent.sourceView}; lockedLayer=${parent.lockedLayer}.`
  );
}

function bindingLines(bindings: readonly PhysicalReferenceBinding[]): string[] {
  return bindings.map((binding) => {
    const logical = binding.constituents
      .map((item) => `${item.kind}:${item.role}:${item.assetId}:${item.sha256}`)
      .join(" | ");
    const packing = binding.packing
      ? `${binding.packing.method}:${binding.packing.packRole}:${binding.packing.attestationId}`
      : "NONE";
    const guidance = binding.packing
      ? ` guidance=${packedReferenceGuidance[binding.packing.packRole]}`
      : "";
    return `- IMAGE_${binding.slot}: physicalRole=${binding.physicalRole}; asset=${binding.assetId}; `
      + `sha256=${binding.sha256}; privacy=${binding.privacyClass}; packing=${packing}; logical=${logical};${guidance}`;
  });
}

function changeLines(operation: AtelierOperation): string[] {
  return operation.changeSet.map((change) =>
    `- ${change.mutableLayer}: region=${change.region}; intendedDelta=${change.intendedDelta}.`
  );
}

function immutableLines(operation: AtelierOperation): string[] {
  return operation.immutableSet.map((immutable) =>
    `- ${immutable.layer}: asset=${immutable.assetId}; sha256=${immutable.sha256}; preserve this truth.`
  );
}

function providerOutputPhaseLines(operation: AtelierOperation): string[] {
  if (operation.outputContract.mode === "GENERATIVE_GARMENT_MEDIA") {
    return [
      "PROVIDER OUTPUT PHASE: Create only the declared garment semantic view on neutral source-safe product staging.",
      "- Direct garment evidence controls visible garment truth only; it grants no identity, body, source-room, atelier, brand, pose or styling authority.",
      "- Do not reproduce a source environment or introduce Lulu, a recognizable person, the JUW atelier or a brand mark.",
    ];
  }
  if (operation.outputContract.mode === "GENERATIVE_FULL_FRAME") {
    return [
      "PROVIDER OUTPUT PHASE: Create the declared complete subject-stage frame on neutral staging.",
    ];
  }
  const composite = operation.outputContract.deterministicComposite;
  const nativeRoomPolicy = "canvasPolicyRevision" in composite;
  return [
    "PROVIDER OUTPUT PHASE: Return only the full-body subject pixels on the declared transparent PNG provider canvas.",
    "- The locked room reference controls placement, scale, perspective, camera and lighting alignment only; it is not provider-rendered output.",
    "- Render no wall, JUW icon, rail, props, floor, room pixels, replacement background, checkerboard or transparency preview.",
    "- Keep the untouched canvas genuinely transparent. App-owned deterministic code composites the approved layer over the exact room bytes later.",
    ...(nativeRoomPolicy
      ? [
          "- SAFE WINDOW: Keep every visible subject, hair, garment, heel and shadow pixel inside x=16..1007 and y=144..1391 on the 1024x1536 provider canvas.",
          "- Every pixel outside that guarded central window must have alpha exactly zero. The app copies x=0,y=128,width=1024,height=1280 one-to-one onto the native 1024x1280 room; it never rescales or silently crops visible pixels.",
        ]
      : []),
  ];
}

/**
 * Compiles provider prose from semantic truth only. No caller prose, provider,
 * model, UI state, clock or environment variable can enter this prompt.
 */
export function compileAtelierPrompt(input: {
  operation: unknown;
  orderedReferences: readonly unknown[];
  providerSafetyContext: unknown;
}): CompiledAtelierPrompt {
  const operation = canonicalAtelierOperation(input.operation);
  const bindings = parseOrderedBindings(input.orderedReferences, operation);
  const safetyContext = validateProviderSafetyContextReceipt(
    input.providerSafetyContext,
    {
      semanticOperationHash: semanticOperationHash(operation),
      stage: operation.stage,
    },
  );
  const output = operation.outputContract;
  const quality = operation.renderQualityContract;
  const lines = [
    "JUW VIRTUAL ATELIER — CANONICAL EXECUTION INSTRUCTION",
    `PROMPT_VERSION: ${ATELIER_PROMPT_VERSION}`,
    `OPERATION: garment=${operation.garmentId}; stage=${operation.stage}; targetView=${operation.view}.`,
    `VIEW GRAMMAR: ${viewInstructions[operation.view]}`,
    "AUTHORITY RULE: parent locks and named authorities are binding truth. Higher dominance resolves conflict. A packed board carries every listed constituent; do not treat the board layout as an output layout.",
    "",
    ...providerSafetyContextPromptLines(safetyContext),
    "",
    "PARENT LOCKS",
    ...parentLines(operation),
    "",
    "AUTHORITY STACK",
    ...authorityLines(operation),
    "",
    "ORDERED PHYSICAL REFERENCES",
    ...bindingLines(bindings),
    "",
    "ONLY DECLARED MUTATIONS",
    ...changeLines(operation),
    "",
    "IMMUTABLE TRUTH",
    ...immutableLines(operation),
    "",
    "GARMENT FACTS",
    ...bulletLines(operation.garmentFacts, "No additional garment facts declared."),
    "",
    "UNKNOWN FACTS — KEEP UNKNOWN",
    ...bulletLines(operation.unknownFacts, "No unknown facts declared."),
    "",
    "PROHIBITED INFERENCES",
    ...bulletLines(operation.prohibitedInferences, "No additional prohibited inference declared."),
    "",
    `SCENE SPEC: ${canonicalStringify(operation.sceneSpec)}`,
    `CAMERA SPEC: ${canonicalStringify(operation.cameraSpec)}`,
    `POSE SPEC: ${canonicalStringify(operation.poseSpec)}`,
    `STYLING SPEC: ${canonicalStringify(operation.stylingSpec)}`,
    ...(operation.fashionNovaCheck
      ? [`ADVISORY STYLING RESULT ONLY: ${operation.fashionNovaCheck.decision}; ${operation.fashionNovaCheck.selectedStylingDirection}. It has no image or construction authority.`]
      : []),
    ...(operation.rearInference
      ? [`REAR EVIDENCE: inferred=${operation.rearInference.inferred}; basis=${operation.rearInference.basis}; the output may never become direct rear evidence.`]
      : []),
    "",
    ...providerOutputPhaseLines(operation),
    "",
    "OUTPUT CONTRACT",
    `- imageCount=${output.imageCount}; layout=${output.layout}; fullBody=${output.fullBody}; targetView=${output.targetView}; mode=${output.mode}.`,
    `- canvas=${output.canvas.width}x${output.canvas.height}; generatedKind=${output.generatedArtifact.kind}; generatedFormat=${output.generatedArtifact.format}; generatedAlpha=${output.generatedArtifact.alpha}; generatedBackground=${output.generatedArtifact.background}; finalFormat=${output.finalFormat}.`,
    ...(output.mode === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
      ? [
          `- deterministicComposite=${output.deterministicComposite.method}; lockedRoomRole=${output.deterministicComposite.lockedRoomRole}; preserveLockedRoomPixels=${output.deterministicComposite.preserveLockedRoomPixels}; compositeOutputFormat=${output.deterministicComposite.outputFormat}.`,
          ...("canvasPolicyRevision" in output.deterministicComposite
            ? [`- canvasPolicy=${output.deterministicComposite.canvasPolicyRevision}; pixelMapping=${output.deterministicComposite.pixelMapping}; roomPixelsGenerated=${output.deterministicComposite.roomPixelsGenerated}; supportedNativeRoomCanvases=1024x1536,1024x1280.`]
            : []),
        ]
      : [`- deterministicComposite=NONE; ${output.mode === "GENERATIVE_GARMENT_MEDIA" ? "neutral source-safe garment materialization only" : "neutral full-frame subject materialization only"}.`]),
    ...(output.mode === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
      ? [`- renderedText=${output.renderedText}; labels=${output.labels}. Produce one transparent subject layer only, never a scene, board, crop, label, footer or contact sheet.`]
      : [`- renderedText=${output.renderedText}; labels=${output.labels}. Produce one clean full image only, never a board, crop, label, footer or contact sheet.`]),
    "",
    "RENDER QUALITY CONTRACT",
    `- photographicRealism: ${quality.photographicRealism}`,
    `- skinTexture: ${quality.skinTexture}`,
    `- garmentTexture: ${quality.garmentTexture}`,
    `- lightingIntegration: ${quality.lightingIntegration}`,
    `- opticsPerspective: ${quality.opticsPerspective}`,
    ...quality.artifactRejection.map((item) => `- rejectArtifact: ${item}`),
    "",
    "FAIL CLOSED IF ANY GATE WOULD FAIL",
    ...bulletLines(operation.failureGates, "No failure gates declared."),
    "",
    output.mode === "TRANSPARENT_SUBJECT_THEN_DETERMINISTIC_COMPOSITE"
      ? "FINAL DIRECTIVE: Render only the isolated transparent subject layer. Preserve every immutable and unresolved fact. Do not render or repaint the room, icon, architecture, text, new construction or undeclared styling."
      : "FINAL DIRECTIVE: Render only the declared operation. Preserve every immutable and unresolved fact. Do not add text, branding variants, new construction, new architecture or undeclared styling.",
  ];
  const text = lines.join("\n");
  return Object.freeze({
    version: ATELIER_PROMPT_VERSION,
    text,
    sha256: sha256Text(text),
  });
}
