#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

import { canonicalStringify } from "./operation-identity.mjs";

export const MANUAL_SEMANTIC_IDENTITY_CONTRACT = "juw.atelier-manual-semantic-identity.v1";
export const MANUAL_ORDERED_GATE_RECEIPT_CONTRACT = "juw.atelier-manual-ordered-gates.v1";

const MANUAL_SEMANTIC_OPERATION_CONTRACT = "juw.atelier-manual-semantic-operation.v1";
const MANUAL_MULTI_ERA_BASELINE_REVISION = "g001-g024-multi-era-v1";
const SHA256 = /^[a-f0-9]{64}$/;
const SEMANTIC_IDENTITY_FIELDS = new Set(["contractVersion", "operationId", "semanticOperationHash"]);
const PROVIDER_EXECUTION_FIELDS = new Set([
  "adapter",
  "adapterId",
  "adapterVersion",
  "compiledPrompt",
  "compiledPromptHash",
  "generationTool",
  "model",
  "modelRevision",
  "parameters",
  "prompt",
  "promptHash",
  "promptVersion",
  "provider",
  "providerRequestId",
  "providerPolicyRevision",
  "referencePackingHash",
  "referenceSlots",
  "requestId",
  "sampler",
  "seed",
  "tool",
]);
const MANUAL_SEMANTIC_PREFLIGHT_FIELDS = new Set([
  "authorityStack",
  "cameraSpec",
  "changeSet",
  "correctionBudget",
  "correctionOfSemanticOperationHash",
  "correctionOrdinal",
  "failureGates",
  "fashionNovaCheck",
  "garmentFacts",
  "garmentId",
  "immutableSet",
  "operationId",
  "operationType",
  "outputContract",
  "parentAssets",
  "poseSpec",
  "prohibitedInferences",
  "referenceStack",
  "renderQualityContract",
  "sceneSpec",
  "semanticIdentity",
  "stage",
  "status",
  "stylingSpec",
  "unknownFacts",
  "view",
  "workflowRevision",
]);
const VIEW_ROLE = Object.freeze({
  "01": "GARMENT_FRONT",
  "02": "GARMENT_BACK",
  "03": "MANNEQUIN_FRONT",
  "04": "FABRIC_DETAIL",
  "05": "MODEL_FRONT",
  "06": "MODEL_LEFT_PROFILE",
  "07": "MODEL_REAR_THREE_QUARTER",
  SUBJECT: "GARMENT_SPECIFIC_SUBJECT",
});

const MANUAL_STAGE_VIEW = Object.freeze({
  GARMENT_01_FRONT: "01",
  GARMENT_02_BACK: "02",
  GARMENT_03_MANNEQUIN: "03",
  GARMENT_04_DETAIL: "04",
  SUBJECT_A: "SUBJECT",
  SUBJECT_B: "SUBJECT",
  ROOM_FINAL_05: "05",
  SIBLING_06: "06",
  SIBLING_07_CORE: "07",
  SIBLING_07_RECOVERY: "07",
});

export const REQUIRED_RENDER_QUALITY_FIELDS = Object.freeze([
  "photographicRealism",
  "skinTexture",
  "garmentTexture",
  "lightingIntegration",
  "opticsPerspective",
]);

const SIBLING_CORE = Object.freeze({
  "06": Object.freeze({
    bodyAssetId: "lulu.body.canon.v4.side",
    forbiddenView: "07",
  }),
  "07": Object.freeze({
    bodyAssetId: "lulu.body.canon.v4.back",
    forbiddenView: "06",
  }),
});

const FASHION_NOVA_DECISIONS = new Set(["KEEP", "REFINE", "REPLACE", "NO_CLOSE_MATCH"]);
const MANUAL_ORDERED_GATES = Object.freeze([
  "GARMENT",
  "FACE",
  "BODY",
  "ROOM",
  "FINAL_INTEGRATION",
]);
const MANUAL_MULTI_ERA_ANCHORS = Object.freeze([
  "G001",
  "G004",
  "G005",
  "G009",
  "G023",
  "G024",
]);
const MANUAL_GATE_DECISIONS = new Set(["PASS", "FAIL", "NOT_APPLICABLE", "NOT_EVALUATED"]);
const MANUAL_STAGE_APPLICABLE_GATES = Object.freeze({
  GARMENT_01_FRONT: Object.freeze(["GARMENT", "FINAL_INTEGRATION"]),
  GARMENT_02_BACK: Object.freeze(["GARMENT", "FINAL_INTEGRATION"]),
  GARMENT_03_MANNEQUIN: Object.freeze(["GARMENT", "FINAL_INTEGRATION"]),
  GARMENT_04_DETAIL: Object.freeze(["GARMENT", "FINAL_INTEGRATION"]),
  SUBJECT_A: Object.freeze(["GARMENT", "FACE", "BODY", "FINAL_INTEGRATION"]),
  SUBJECT_B: Object.freeze(["GARMENT", "FACE", "BODY", "FINAL_INTEGRATION"]),
  ROOM_FINAL_05: MANUAL_ORDERED_GATES,
  SIBLING_06: MANUAL_ORDERED_GATES,
  SIBLING_07_CORE: MANUAL_ORDERED_GATES,
  SIBLING_07_RECOVERY: MANUAL_ORDERED_GATES,
});
const MANUAL_CORRECTION_GATE_POLICY = Object.freeze({
  GARMENT: Object.freeze({
    allowedMutableLayers: Object.freeze(["GARMENT"]),
    requiredImmutableLayers: Object.freeze([]),
  }),
  FACE: Object.freeze({
    allowedMutableLayers: Object.freeze(["IDENTITY", "HAIR"]),
    requiredImmutableLayers: Object.freeze(["GARMENT"]),
  }),
  BODY: Object.freeze({
    allowedMutableLayers: Object.freeze(["BODY"]),
    requiredImmutableLayers: Object.freeze(["GARMENT", "IDENTITY", "HAIR"]),
  }),
  ROOM: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "ATELIER",
      "BRAND_ICON",
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
    ]),
    requiredImmutableLayers: Object.freeze(["GARMENT", "IDENTITY", "BODY", "HAIR"]),
  }),
  FINAL_INTEGRATION: Object.freeze({
    allowedMutableLayers: Object.freeze([
      "POSE",
      "HANDS",
      "FOOTWEAR",
      "STYLING",
      "CAMERA",
      "LIGHTING",
      "COMPOSITION",
      "OUTPUT_GEOMETRY",
    ]),
    requiredImmutableLayers: Object.freeze([
      "GARMENT",
      "IDENTITY",
      "BODY",
      "HAIR",
      "ATELIER",
      "BRAND_ICON",
    ]),
  }),
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeView(view) {
  return String(view ?? "").padStart(2, "0");
}

function uniqueSortedStrings(values = []) {
  return [...new Set(values.map((value) => value.trim()))].sort();
}

function sortCanonical(values = []) {
  return [...values].sort((left, right) => canonicalStringify(left).localeCompare(canonicalStringify(right)));
}

function normalizeSemanticArray(value) {
  if (!Array.isArray(value)) return [];
  if (value.every((item) => typeof item === "string")) return uniqueSortedStrings(value);
  return sortCanonical(value);
}

function normalizeOutputContract(value) {
  if (Array.isArray(value)) return { requirements: normalizeSemanticArray(value) };
  return value && typeof value === "object" ? value : {};
}

function normalizeRenderQualityContract(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return {
    ...value,
    artifactRejection: normalizeSemanticArray(value.artifactRejection),
  };
}

function normalizeFashionNovaDecision(operation) {
  const check = operation.fashionNovaCheck ?? operation.fashion_nova_check;
  if (!check || typeof check !== "object" || Array.isArray(check)) return null;
  return {
    decision: check.decision ?? null,
    selectedStylingDirection: check.selectedStylingDirection ?? null,
    authority: check.authority ?? null,
  };
}

function collectProviderExecutionFields(value, path = "semanticOperation", output = []) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectProviderExecutionFields(item, `${path}[${index}]`, output));
  } else if (value && typeof value === "object") {
    for (const [key, item] of Object.entries(value)) {
      if (PROVIDER_EXECUTION_FIELDS.has(key)) output.push(`${path}.${key}`);
      collectProviderExecutionFields(item, `${path}.${key}`, output);
    }
  }
  return output;
}

function buildManualSemanticOperation(operation) {
  const errors = [];
  const workflowRevision = operation.workflowRevision ?? operation.workflow_revision;
  if (!nonEmptyString(workflowRevision)) errors.push("workflowRevision is required for canonical semantic identity");

  const garmentId = String(operation.garmentId ?? operation.garment_id ?? "").padStart(3, "0");
  if (!/^\d{3}$/.test(garmentId)) errors.push("garmentId must resolve to exactly three digits for canonical semantic identity");

  const view = normalizeView(operation.view);
  const viewRole = VIEW_ROLE[view];
  if (!viewRole) errors.push("view must resolve to semantic view 01 through 07 or SUBJECT for canonical semantic identity");

  const stage = operation.stage;
  const expectedView = MANUAL_STAGE_VIEW[stage];
  if (!expectedView) {
    errors.push(`stage must be one of ${Object.keys(MANUAL_STAGE_VIEW).join(", ")} for canonical semantic identity`);
  } else if (view !== expectedView) {
    errors.push(`stage ${stage} requires view ${expectedView}, not ${view}`);
  }

  const referenceStack = operation.referenceStack ?? operation.reference_stack;
  const referencesById = new Map();
  if (!Array.isArray(referenceStack) || referenceStack.length === 0) {
    errors.push("referenceStack must contain exact resolved authority bindings for canonical semantic identity");
  } else {
    for (const [index, reference] of referenceStack.entries()) {
      const assetId = reference?.assetId ?? reference?.asset_id;
      if (!nonEmptyString(assetId)) {
        errors.push(`referenceStack[${index}].assetId is required for canonical semantic identity`);
        continue;
      }
      if (referencesById.has(assetId)) {
        errors.push(`referenceStack contains duplicate semantic asset ${assetId}`);
        continue;
      }
      if (!SHA256.test(String(reference.sha256 ?? ""))) {
        errors.push(`${assetId} must have an exact lowercase SHA-256 for canonical semantic identity`);
        continue;
      }
      referencesById.set(assetId, { assetId, sha256: reference.sha256 });
    }
  }

  const authorityStack = operation.authorityStack ?? operation.authority_stack;
  const authorityBindings = [];
  const classifiedAssets = new Set();
  if (!authorityStack || typeof authorityStack !== "object" || Array.isArray(authorityStack)) {
    errors.push("authorityStack must classify every resolved reference by semantic role for canonical semantic identity");
  } else {
    for (const [role, assetIds] of Object.entries(authorityStack)) {
      if (!nonEmptyString(role) || !Array.isArray(assetIds) || assetIds.length === 0) {
        errors.push(`authorityStack.${role || "unknown"} must be a non-empty array of asset IDs`);
        continue;
      }
      for (const assetId of assetIds) {
        if (!nonEmptyString(assetId)) {
          errors.push(`authorityStack.${role} may contain only non-empty asset IDs`);
          continue;
        }
        const reference = referencesById.get(assetId);
        if (!reference) {
          errors.push(`authorityStack.${role} asset ${assetId} has no exact referenceStack hash`);
          continue;
        }
        authorityBindings.push({ role, ...reference });
        classifiedAssets.add(assetId);
      }
    }
  }
  for (const assetId of referencesById.keys()) {
    if (!classifiedAssets.has(assetId)) {
      errors.push(`referenceStack asset ${assetId} has no semantic authorityStack role`);
    }
  }

  const parentAssets = operation.parentAssets ?? operation.parent_assets;
  const parentLocks = [];
  if (!Array.isArray(parentAssets)) {
    errors.push("parentAssets must be an array for canonical semantic identity");
  } else {
    for (const assetId of parentAssets) {
      if (!nonEmptyString(assetId)) {
        errors.push("parentAssets may contain only non-empty asset IDs");
        continue;
      }
      const reference = referencesById.get(assetId);
      if (!reference) {
        errors.push(`parent asset ${assetId} has no exact referenceStack hash`);
        continue;
      }
      parentLocks.push(reference);
    }
  }

  if (errors.length > 0) return { errors, operation: null };

  const correctionOf = operation.correctionOfSemanticOperationHash ?? operation.correctionOf ?? null;
  const semanticOperation = {
    contractVersion: MANUAL_SEMANTIC_OPERATION_CONTRACT,
    workflowRevision,
    garmentId,
    stage,
    viewRole,
    operationType: operation.operationType,
    authorityStack: sortCanonical(authorityBindings),
    parentLocks: sortCanonical(parentLocks),
    changeSet: normalizeSemanticArray(operation.changeSet),
    immutableSet: normalizeSemanticArray(operation.immutableSet),
    garmentFacts: normalizeSemanticArray(operation.garmentFacts ?? operation.garment_facts),
    unknownFacts: normalizeSemanticArray(operation.unknownFacts ?? operation.unknown_facts),
    prohibitedInferences: normalizeSemanticArray(operation.prohibitedInferences ?? operation.prohibited_inferences),
    sceneSpec: operation.sceneSpec ?? operation.scene_spec ?? {},
    cameraSpec: operation.cameraSpec ?? operation.camera_spec ?? {},
    poseSpec: operation.poseSpec ?? operation.pose_spec ?? {},
    stylingSpec: {
      ...(operation.stylingSpec ?? operation.styling_spec ?? {}),
      fashionNovaDecision: normalizeFashionNovaDecision(operation),
    },
    renderQualityContract: normalizeRenderQualityContract(operation.renderQualityContract),
    outputContract: normalizeOutputContract(operation.outputContract),
    failureGates: normalizeSemanticArray(operation.failureGates),
    correctionOf,
    correctionOrdinal: operation.correctionOrdinal ?? (correctionOf ? 1 : 0),
    correctionBudget: operation.correctionBudget ?? 1,
  };

  const providerFields = collectProviderExecutionFields(semanticOperation);
  if (providerFields.length > 0) {
    return {
      errors: providerFields.map((field) => `${field} is provider execution data and may not enter manual semantic identity`),
      operation: null,
    };
  }

  return { errors: [], operation: semanticOperation };
}

export function deriveManualSemanticIdentity(operation) {
  const built = buildManualSemanticOperation(operation);
  if (built.errors.length > 0) throw new Error(built.errors.join("\n"));
  const canonicalOperation = canonicalStringify(built.operation);
  const semanticOperationHash = sha256(canonicalOperation);
  const view = built.operation.viewRole.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return Object.freeze({
    contractVersion: MANUAL_SEMANTIC_IDENTITY_CONTRACT,
    operationId: `atelier:${built.operation.garmentId}:${view}:${semanticOperationHash.slice(0, 24)}`,
    semanticOperationHash,
    canonicalOperation,
  });
}

function validateSemanticIdentity(operation, errors, { requireCanonicalIdentity = false } = {}) {
  const initialErrorCount = errors.length;
  let derivedIdentity = null;
  let derivationError = null;
  try {
    derivedIdentity = deriveManualSemanticIdentity(operation);
  } catch (error) {
    derivationError = error instanceof Error ? error.message : String(error);
  }

  const declared = operation.semanticIdentity ?? operation.semantic_identity;
  if (!declared) {
    if (requireCanonicalIdentity) {
      errors.push("semanticIdentity is required before a manual operation may pass semantic preflight");
      if (derivationError) errors.push(...derivationError.split("\n"));
    }
    return {
      status: "LEGACY_UNBOUND_READ_ONLY",
      derivedIdentity,
      semanticPreflightEligible: false,
    };
  }

  if (typeof declared !== "object" || Array.isArray(declared)) {
    errors.push("semanticIdentity must be an object");
    return { status: "INVALID", derivedIdentity, semanticPreflightEligible: false };
  }
  for (const field of Object.keys(declared)) {
    if (!SEMANTIC_IDENTITY_FIELDS.has(field)) {
      errors.push(`semanticIdentity.${field} is not permitted; execution identity stays outside the manual semantic identity`);
    }
  }
  if (declared.contractVersion !== MANUAL_SEMANTIC_IDENTITY_CONTRACT) {
    errors.push(`semanticIdentity.contractVersion must equal ${MANUAL_SEMANTIC_IDENTITY_CONTRACT}`);
  }
  if (derivationError) {
    errors.push(...derivationError.split("\n"));
    return { status: "INVALID", derivedIdentity: null, semanticPreflightEligible: false };
  }
  if (declared.operationId !== derivedIdentity.operationId) {
    errors.push(`semanticIdentity.operationId mismatch expected=${derivedIdentity.operationId} actual=${declared.operationId ?? "missing"}`);
  }
  if (operation.operationId !== derivedIdentity.operationId) {
    errors.push(
      `operationId must equal the derived canonical operation ID for semantic preflight; legacy label ${operation.operationId ?? "missing"} is read-only`,
    );
  }
  if (declared.semanticOperationHash !== derivedIdentity.semanticOperationHash) {
    errors.push(
      `semanticIdentity.semanticOperationHash mismatch expected=${derivedIdentity.semanticOperationHash} actual=${declared.semanticOperationHash ?? "missing"}`,
    );
  }
  const verified = errors.length === initialErrorCount;
  return {
    status: verified ? "VERIFIED" : "INVALID",
    derivedIdentity,
    semanticPreflightEligible: verified,
  };
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateFashionNovaUrl(value, field, errors) {
  if (!nonEmptyString(value)) {
    errors.push(`${field} is required`);
    return;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") {
      errors.push(`${field} must use HTTPS`);
    }
    if (hostname !== "fashionnova.com" && !hostname.endsWith(".fashionnova.com")) {
      errors.push(`${field} must use an official fashionnova.com host`);
    }
    if (!/^\/(products|collections)\/[^/]+/.test(url.pathname)) {
      errors.push(`${field} must resolve to an official Fashion Nova product or collection styling page`);
    }
  } catch {
    errors.push(`${field} must be a valid URL`);
  }
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function validateRenderQualityContract(operation, errors) {
  const view = normalizeView(operation.view);
  if (!["05", "06", "07"].includes(view)) return;

  const contract = operation.renderQualityContract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    errors.push("renderQualityContract is required for model views 05, 06 and 07");
    return;
  }

  for (const field of REQUIRED_RENDER_QUALITY_FIELDS) {
    if (!nonEmptyString(contract[field])) {
      errors.push(`renderQualityContract.${field} must be a non-empty string`);
    }
  }

  if (!Array.isArray(contract.artifactRejection) || contract.artifactRejection.length === 0) {
    errors.push("renderQualityContract.artifactRejection must contain at least one rejection condition");
  } else if (contract.artifactRejection.some((item) => !nonEmptyString(item))) {
    errors.push("renderQualityContract.artifactRejection may contain only non-empty strings");
  }
}

function validateRenderQualityReview(operation, errors) {
  const view = normalizeView(operation.view);
  const reviewedStatus = /GATE_PASS|ACCEPTED|LOCKED/.test(String(operation.status ?? ""));
  if (!["05", "06", "07"].includes(view) || !reviewedStatus) return;

  const review = operation.renderQualityReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    errors.push("renderQualityReview is required before a model operation may claim GATE_PASS, ACCEPTED or LOCKED");
    return;
  }

  for (const field of [...REQUIRED_RENDER_QUALITY_FIELDS, "artifactRejection"]) {
    if (review[field] !== "PASS") {
      errors.push(`renderQualityReview.${field} must equal PASS before the operation may claim ${operation.status}`);
    }
  }

  if (!nonEmptyString(review.reviewedAt)) {
    errors.push(`renderQualityReview.reviewedAt is required before the operation may claim ${operation.status}`);
  }

  if (!nonEmptyString(operation.output?.path)) {
    errors.push(`output.path is required before the operation may claim ${operation.status}`);
  }
  if (!nonEmptyString(operation.output?.sha256)) {
    errors.push(`output.sha256 is required before the operation may claim ${operation.status}`);
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validateExactKeys(value, expected, field, errors) {
  if (!isPlainObject(value)) return;
  const actual = Object.keys(value).sort();
  const wanted = [...expected].sort();
  if (canonicalStringify(actual) !== canonicalStringify(wanted)) {
    errors.push(`${field} must contain exactly: ${wanted.join(", ")}`);
  }
}

function validateFrontMasterCore(operation, errors, { requireCanonicalContract = false } = {}) {
  if (!requireCanonicalContract || operation.stage !== "ROOM_FINAL_05") return;
  const authority = operation.authorityStack ?? operation.authority_stack;
  if (!isPlainObject(authority)) return;

  const requiredRoles = ["parent", "garment", "atelier"];
  validateExactKeys(authority, requiredRoles, "ROOM_FINAL_05 authorityStack", errors);
  for (const role of requiredRoles) {
    if (!Array.isArray(authority[role]) || authority[role].length !== 1) {
      errors.push(`ROOM_FINAL_05 semantic preflight requires exactly one authorityStack.${role} asset`);
    }
  }

  for (const forbiddenRole of ["identity", "body", "translation"]) {
    if (Array.isArray(authority[forbiddenRole]) && authority[forbiddenRole].length > 0) {
      errors.push(
        `ROOM_FINAL_05 must inherit ${forbiddenRole} from the exact accepted subject lock; do not reopen it as a provider authority input`,
      );
    }
  }

  const parentAssets = operation.parentAssets ?? operation.parent_assets;
  if (!Array.isArray(parentAssets) || parentAssets.length !== 1) {
    errors.push("ROOM_FINAL_05 semantic preflight requires exactly one accepted subject-lock parent");
  } else if (!Array.isArray(authority.parent) || authority.parent.length !== 1 || parentAssets[0] !== authority.parent[0]) {
    errors.push("ROOM_FINAL_05 parentAssets must exactly equal authorityStack.parent");
  }

  const referenceStack = operation.referenceStack ?? operation.reference_stack;
  const expectedReferenceIds = requiredRoles.flatMap((role) =>
    Array.isArray(authority[role]) ? authority[role] : [],
  );
  const actualReferenceIds = Array.isArray(referenceStack)
    ? referenceStack.map((reference) => reference?.assetId ?? reference?.asset_id)
    : [];
  if (
    expectedReferenceIds.length !== requiredRoles.length
    || actualReferenceIds.length !== requiredRoles.length
    || canonicalStringify([...actualReferenceIds].sort())
      !== canonicalStringify([...expectedReferenceIds].sort())
  ) {
    errors.push(
      "ROOM_FINAL_05 referenceStack must contain exactly the one parent, one garment safeguard, and one atelier authority asset",
    );
  }
}

function validateCorrectionShape(operation, errors, { requireCanonicalContract = false } = {}) {
  if (!requireCanonicalContract) return;
  const canonicalSource = operation.correctionOfSemanticOperationHash;
  const legacySource = operation.correctionOf;
  const isCorrection = canonicalSource !== undefined && canonicalSource !== null
    || legacySource !== undefined && legacySource !== null;

  if (!isCorrection) {
    if (operation.correctionOrdinal !== 0) {
      errors.push("a root paid operation must declare correctionOrdinal 0");
    }
    if (operation.correctionBudget !== 1) {
      errors.push("a root paid operation must declare correctionBudget 1");
    }
    return;
  }

  errors.push(
    "a manual correction record cannot authorize semantic preflight; the durable Atelier engine must derive it from the exact failed receipt and enforce the root correction fence",
  );

  if (!SHA256.test(String(canonicalSource ?? ""))) {
    errors.push("a correction must declare correctionOfSemanticOperationHash as the exact source semantic SHA-256");
  }
  if (legacySource !== undefined && legacySource !== canonicalSource) {
    errors.push("correctionOf may not conflict with correctionOfSemanticOperationHash");
  }
  if (operation.correctionOrdinal !== 1) {
    errors.push("a bounded correction must declare correctionOrdinal 1");
  }
  if (operation.correctionBudget !== 0) {
    errors.push("a bounded correction must declare correctionBudget 0");
  }
  if (!Array.isArray(operation.changeSet) || operation.changeSet.length !== 1) {
    errors.push("a bounded correction must contain exactly one changeSet entry");
    return;
  }

  const [change] = operation.changeSet;
  if (!isPlainObject(change)) {
    errors.push("a bounded correction changeSet entry must be an object");
    return;
  }
  validateExactKeys(
    change,
    ["failedGate", "mutableLayer", "region", "intendedDelta"],
    "bounded correction changeSet[0]",
    errors,
  );
  const gatePolicy = Object.hasOwn(MANUAL_CORRECTION_GATE_POLICY, change.failedGate)
    ? MANUAL_CORRECTION_GATE_POLICY[change.failedGate]
    : null;
  if (!gatePolicy) {
    errors.push(`bounded correction changeSet[0].failedGate must be one of ${MANUAL_ORDERED_GATES.join(", ")}`);
  }
  for (const field of ["mutableLayer", "region", "intendedDelta"]) {
    if (!nonEmptyString(change[field])) {
      errors.push(`bounded correction changeSet[0].${field} must be a non-empty string`);
    }
  }
  if (!gatePolicy) return;

  if (!gatePolicy.allowedMutableLayers.includes(change.mutableLayer)) {
    errors.push(
      `${change.failedGate} correction mutableLayer must be one of ${gatePolicy.allowedMutableLayers.join(", ")}`,
    );
  }

  const immutableLayers = new Set(
    (Array.isArray(operation.immutableSet) ? operation.immutableSet : [])
      .map((entry) => (typeof entry === "string" ? entry : entry?.layer))
      .filter(nonEmptyString)
      .map((layer) => layer.trim().toUpperCase().replace(/[\s-]+/g, "_")),
  );
  for (const requiredLayer of gatePolicy.requiredImmutableLayers) {
    if (!immutableLayers.has(requiredLayer)) {
      errors.push(
        `${change.failedGate} correction immutableSet must preserve earlier passing layer ${requiredLayer}`,
      );
    }
  }
}

function validateOrderedGateReceipt(
  operation,
  errors,
  {
    requireCanonicalContract = false,
    semanticOperationHash = null,
  } = {},
) {
  const receipt = operation.orderedGateReceipt;
  const reviewedStatus = /GATE_PASS|ACCEPTED|LOCKED/.test(String(operation.status ?? ""));
  const outputPresent = operation.output !== undefined && operation.output !== null;
  const required = requireCanonicalContract && (reviewedStatus || outputPresent);

  if (receipt === undefined || receipt === null) {
    if (required) {
      errors.push("orderedGateReceipt is required for a paid operation with materialized or reviewed output");
    }
    return;
  }
  if (!isPlainObject(receipt)) {
    errors.push("orderedGateReceipt must be an object");
    return;
  }
  validateExactKeys(
    receipt,
    ["contractVersion", "semanticOperationHash", "artifactSha256", "multiEraBaseline", "gates"],
    "orderedGateReceipt",
    errors,
  );
  if (receipt.contractVersion !== MANUAL_ORDERED_GATE_RECEIPT_CONTRACT) {
    errors.push(`orderedGateReceipt.contractVersion must equal ${MANUAL_ORDERED_GATE_RECEIPT_CONTRACT}`);
  }
  if (!SHA256.test(String(receipt.semanticOperationHash ?? ""))) {
    errors.push("orderedGateReceipt.semanticOperationHash must be a lowercase SHA-256");
  } else if (semanticOperationHash && receipt.semanticOperationHash !== semanticOperationHash) {
    errors.push("orderedGateReceipt.semanticOperationHash must bind the exact canonical semantic operation");
  }
  if (!SHA256.test(String(receipt.artifactSha256 ?? ""))) {
    errors.push("orderedGateReceipt.artifactSha256 must be a lowercase SHA-256");
  } else if (receipt.artifactSha256 !== operation.output?.sha256) {
    errors.push("orderedGateReceipt.artifactSha256 must equal output.sha256");
  }

  const baseline = receipt.multiEraBaseline;
  if (!isPlainObject(baseline)) {
    errors.push("orderedGateReceipt.multiEraBaseline must be an object");
  } else {
    validateExactKeys(
      baseline,
      ["revision", "anchors", "directRealAuthorityOutranksGenerated"],
      "orderedGateReceipt.multiEraBaseline",
      errors,
    );
    if (baseline.revision !== MANUAL_MULTI_ERA_BASELINE_REVISION) {
      errors.push(`orderedGateReceipt.multiEraBaseline.revision must equal ${MANUAL_MULTI_ERA_BASELINE_REVISION}`);
    }
    if (
      !Array.isArray(baseline.anchors)
      || canonicalStringify(baseline.anchors) !== canonicalStringify(MANUAL_MULTI_ERA_ANCHORS)
    ) {
      errors.push(`orderedGateReceipt.multiEraBaseline.anchors must equal ${MANUAL_MULTI_ERA_ANCHORS.join(", ")} in order`);
    }
    if (baseline.directRealAuthorityOutranksGenerated !== true) {
      errors.push("orderedGateReceipt.multiEraBaseline.directRealAuthorityOutranksGenerated must equal true");
    }
  }

  if (!Array.isArray(receipt.gates) || receipt.gates.length !== MANUAL_ORDERED_GATES.length) {
    errors.push(`orderedGateReceipt.gates must contain exactly ${MANUAL_ORDERED_GATES.length} ordered gates`);
    return;
  }

  const stage = operation.stage;
  const applicableGates = new Set(MANUAL_STAGE_APPLICABLE_GATES[stage] ?? []);
  if (applicableGates.size === 0) {
    errors.push("orderedGateReceipt requires a recognized stage applicability contract");
  }

  let failureSeen = false;
  for (const [index, expectedGate] of MANUAL_ORDERED_GATES.entries()) {
    const gate = receipt.gates[index];
    if (!isPlainObject(gate)) {
      errors.push(`orderedGateReceipt.gates[${index}] must be an object`);
      continue;
    }
    validateExactKeys(gate, ["gate", "decision"], `orderedGateReceipt.gates[${index}]`, errors);
    if (gate.gate !== expectedGate) {
      errors.push(`orderedGateReceipt.gates[${index}].gate must equal ${expectedGate}`);
    }
    if (!MANUAL_GATE_DECISIONS.has(gate.decision)) {
      errors.push(`orderedGateReceipt.gates[${index}].decision is invalid`);
      continue;
    }
    const applicable = applicableGates.has(expectedGate);
    if (failureSeen) {
      const expectedDecision = applicable ? "NOT_EVALUATED" : "NOT_APPLICABLE";
      if (gate.decision !== expectedDecision) {
        errors.push(`orderedGateReceipt ${expectedGate} must be ${expectedDecision} after the first failed gate`);
      }
      continue;
    }
    if (!applicable) {
      if (gate.decision !== "NOT_APPLICABLE") {
        errors.push(`orderedGateReceipt ${expectedGate} is excluded for stage ${stage} and must be NOT_APPLICABLE`);
      }
    } else if (gate.decision === "NOT_EVALUATED") {
      errors.push(`orderedGateReceipt ${expectedGate} cannot be NOT_EVALUATED before a failed gate`);
    } else if (gate.decision === "FAIL") {
      failureSeen = true;
    } else if (gate.decision === "NOT_APPLICABLE") {
      errors.push(`orderedGateReceipt ${expectedGate} is applicable to stage ${stage}`);
    }
  }

  if (reviewedStatus && receipt.gates.some((gate) => {
    const expectedDecision = applicableGates.has(gate?.gate) ? "PASS" : "NOT_APPLICABLE";
    return gate?.decision !== expectedDecision;
  })) {
    errors.push(
      `every applicable orderedGateReceipt gate must equal PASS and every excluded gate must equal NOT_APPLICABLE before the operation may claim ${operation.status}`,
    );
  }
}

function validateFashionNovaCheck(operation, errors) {
  if (normalizeView(operation.view) !== "05") return;

  const check = operation.fashionNovaCheck ?? operation.fashion_nova_check;
  if (!check || typeof check !== "object" || Array.isArray(check)) {
    errors.push("fashionNovaCheck is required before every 05 operation");
    return;
  }

  if (!nonEmptyString(check.operationId)) {
    errors.push("fashionNovaCheck.operationId is required");
  }
  if (check.publisher !== "Fashion Nova") {
    errors.push("fashionNovaCheck.publisher must equal Fashion Nova");
  }

  validateFashionNovaUrl(check.officialUrl, "fashionNovaCheck.officialUrl", errors);
  validateFashionNovaUrl(check.resolvedOfficialUrl, "fashionNovaCheck.resolvedOfficialUrl", errors);
  if (!nonEmptyString(check.pageTitle)) {
    errors.push("fashionNovaCheck.pageTitle is required as live-check evidence");
  }
  if (!isRealIsoDate(check.accessedOn)) {
    errors.push("fashionNovaCheck.accessedOn must be a real calendar date in YYYY-MM-DD format");
  }
  if (!Array.isArray(check.matchedGarmentFacts)) {
    errors.push("fashionNovaCheck.matchedGarmentFacts must be an array");
  } else if (check.matchedGarmentFacts.some((fact) => !nonEmptyString(fact))) {
    errors.push("fashionNovaCheck.matchedGarmentFacts may contain only non-empty strings");
  } else if (check.decision !== "NO_CLOSE_MATCH" && check.matchedGarmentFacts.length === 0) {
    errors.push("fashionNovaCheck.matchedGarmentFacts must contain at least one evidence-backed match");
  }
  if (!FASHION_NOVA_DECISIONS.has(check.decision)) {
    errors.push("fashionNovaCheck.decision must equal KEEP, REFINE, REPLACE or NO_CLOSE_MATCH");
  }
  if (check.decision === "NO_CLOSE_MATCH" && !nonEmptyString(check.noCloseMatchReason)) {
    errors.push("fashionNovaCheck.noCloseMatchReason is required for NO_CLOSE_MATCH");
  }
  if (!nonEmptyString(check.selectedStylingDirection)) {
    errors.push("fashionNovaCheck.selectedStylingDirection is required");
  }
  if (check.authority !== "ADVISORY_STYLING_ONLY") {
    errors.push("fashionNovaCheck.authority must equal ADVISORY_STYLING_ONLY");
  }
  if (check.passedAsImageReference !== false) {
    errors.push("fashionNovaCheck.passedAsImageReference must be false");
  }

  const referenceStack = operation.referenceStack ?? operation.reference_stack ?? [];
  const authorityStack = operation.authorityStack ?? operation.authority_stack ?? {};
  const leakedAuthority = [...collectStrings(referenceStack), ...collectStrings(authorityStack)].filter((value) =>
    /fashion\s*nova|fashionnova/i.test(value),
  );
  if (leakedAuthority.length > 0) {
    errors.push("Fashion Nova page or image evidence may not appear in referenceStack or authorityStack");
  }
}

function validateSiblingCore(operation, errors) {
  const view = normalizeView(operation.view);
  const core = SIBLING_CORE[view];
  if (!core) return;

  const garmentId = String(operation.garmentId ?? operation.garment_id ?? "").padStart(3, "0");
  const accepted05 = `garment.${garmentId}.view.05.accepted`;
  const parentAssets = operation.parentAssets ?? operation.parent_assets ?? [];
  const referenceStack = operation.referenceStack ?? operation.reference_stack ?? [];
  const referenceIds = referenceStack.map((reference) => reference.assetId ?? reference.asset_id);
  const authorityStack = operation.authorityStack ?? operation.authority_stack ?? {};
  const authorityIds = collectStrings(authorityStack);

  if (parentAssets.length !== 1 || parentAssets[0] !== accepted05) {
    errors.push(`${view} must have exactly one parent asset: ${accepted05}`);
  }

  const requiredCore = [
    accepted05,
    "lulu.face.operation-board.full.v1",
    core.bodyAssetId,
    "lulu.body.real.angle-contact.v4",
    "juw.atelier.empty-plate.v1",
  ];

  for (const requiredId of requiredCore) {
    if (!referenceIds.includes(requiredId)) {
      errors.push(`${view} must include ${requiredId} in referenceStack`);
    }
  }

  const siblingToken = `.view.${core.forbiddenView}.`;
  const forbiddenLineage = [...parentAssets, ...referenceIds, ...authorityIds].filter((id) =>
    String(id).includes(siblingToken),
  );
  if (forbiddenLineage.length > 0) {
    errors.push(`${view} may not use sibling view ${core.forbiddenView}: ${forbiddenLineage.join(", ")}`);
  }
}

function validatePrompt(operation, errors, { required = true } = {}) {
  const promptDeclared = operation.promptVerbatimLines !== undefined || operation.promptSha256 !== undefined;
  if (!required && !promptDeclared) return;

  if (!Array.isArray(operation.promptVerbatimLines) || operation.promptVerbatimLines.length === 0) {
    errors.push("promptVerbatimLines must preserve the exact submitted prompt");
    return;
  }

  if (!nonEmptyString(operation.promptSha256)) {
    errors.push("promptSha256 is required");
    return;
  }

  const actual = sha256(operation.promptVerbatimLines.join("\n"));
  if (actual !== operation.promptSha256) {
    errors.push(`promptSha256 mismatch expected=${operation.promptSha256} actual=${actual}`);
  }
}

function validateSemanticPreflightBoundary(operation, errors, { required = false } = {}) {
  if (!required) return;
  for (const field of Object.keys(operation)) {
    if (!MANUAL_SEMANTIC_PREFLIGHT_FIELDS.has(field)) {
      errors.push(
        `canonical manual semantic preflight does not allow top-level field ${field}; execution, provider, prompt, claim, fence, checkpoint, artifact, and evaluator evidence are server-owned`,
      );
    }
  }
  if (operation.status !== "PREPARED_NOT_INVOKED") {
    errors.push(
      "canonical manual validation is semantic preflight only; reviewed/materialized states require the durable engine receipt verifier",
    );
  }
  if (operation.output !== undefined || operation.orderedGateReceipt !== undefined) {
    errors.push(
      "manual semantic preflight cannot attest candidate bytes or ordered gate results; those receipts must be produced and verified server-side",
    );
  }
}

function validateFiles(operation, operationPath, errors) {
  if (!operationPath) return;
  const base = dirname(resolve(operationPath));
  const referenceStack = operation.referenceStack ?? operation.reference_stack ?? [];

  for (const reference of referenceStack) {
    const assetId = reference.assetId ?? reference.asset_id ?? "unknown-reference";
    if (!nonEmptyString(reference.path)) {
      errors.push(`${assetId} is missing a reference path`);
      continue;
    }
    const filePath = resolve(base, reference.path);
    if (!existsSync(filePath)) {
      errors.push(`${assetId} reference is missing: ${filePath}`);
      continue;
    }
    if (!nonEmptyString(reference.sha256)) {
      errors.push(`${assetId} is missing sha256`);
      continue;
    }
    const actual = sha256(readFileSync(filePath));
    if (actual !== reference.sha256) {
      errors.push(`${assetId} sha256 mismatch expected=${reference.sha256} actual=${actual}`);
    }
  }

  if (operation.output?.path && nonEmptyString(operation.output.sha256)) {
    const outputPath = resolve(base, operation.output.path);
    if (!existsSync(outputPath)) {
      errors.push(`output is missing: ${outputPath}`);
    } else if (nonEmptyString(operation.output.sha256)) {
      const actual = sha256(readFileSync(outputPath));
      if (actual !== operation.output.sha256) {
        errors.push(`output sha256 mismatch expected=${operation.output.sha256} actual=${actual}`);
      }
    }
  }
}

export function validateOperationRecord(operation, options = {}) {
  const errors = [];
  const requireCanonicalContract = options.requireCanonicalIdentity === true;

  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    return { pass: false, errors: ["operation record must be an object"] };
  }

  for (const field of ["operationId", "garmentId", "view", "operationType", "status"]) {
    if (!nonEmptyString(operation[field])) errors.push(`${field} is required`);
  }
  if (requireCanonicalContract && !nonEmptyString(operation.stage)) {
    errors.push("stage is required for canonical semantic preflight");
  }

  if (!Array.isArray(operation.changeSet) || operation.changeSet.length === 0) {
    errors.push("changeSet must contain at least one declared change");
  }
  if (!Array.isArray(operation.immutableSet) || operation.immutableSet.length === 0) {
    errors.push("immutableSet must contain at least one locked layer");
  }
  if (!Array.isArray(operation.outputContract) || operation.outputContract.length === 0) {
    errors.push("outputContract must contain at least one condition");
  }
  if (!Array.isArray(operation.failureGates) || operation.failureGates.length === 0) {
    errors.push("failureGates must contain at least one rejection condition");
  }

  validateSiblingCore(operation, errors);
  validateFashionNovaCheck(operation, errors);
  validateRenderQualityContract(operation, errors);
  validateRenderQualityReview(operation, errors);
  validateFrontMasterCore(operation, errors, { requireCanonicalContract });
  validateCorrectionShape(operation, errors, { requireCanonicalContract });
  validatePrompt(operation, errors, { required: !requireCanonicalContract });
  validateSemanticPreflightBoundary(operation, errors, { required: requireCanonicalContract });
  if (options.verifyFiles !== false) validateFiles(operation, options.operationPath, errors);

  const identity = validateSemanticIdentity(operation, errors, {
    requireCanonicalIdentity: requireCanonicalContract,
  });
  validateOrderedGateReceipt(operation, errors, {
    requireCanonicalContract,
    semanticOperationHash: identity.derivedIdentity?.semanticOperationHash ?? null,
  });
  const pass = errors.length === 0;
  const semanticPreflightPass = requireCanonicalContract && pass && identity.semanticPreflightEligible;

  return {
    pass,
    semanticPreflightPass,
    paidInvocationAllowed: false,
    dispatchBoundary: "DURABLE_ENGINE_CLAIM_REQUIRED",
    operationId: operation.operationId ?? null,
    recordId: operation.operationId ?? null,
    view: normalizeView(operation.view),
    semanticIdentityStatus: identity.status,
    canonicalOperationId: identity.derivedIdentity?.operationId ?? null,
    semanticOperationHash: identity.derivedIdentity?.semanticOperationHash ?? null,
    derivedSemanticIdentity: identity.derivedIdentity
      ? {
          contractVersion: identity.derivedIdentity.contractVersion,
          operationId: identity.derivedIdentity.operationId,
          semanticOperationHash: identity.derivedIdentity.semanticOperationHash,
        }
      : null,
    executionIdentity: null,
    errors,
  };
}

function parseArgs(argv) {
  const options = { operationPath: null, json: false, verifyFiles: true, legacyReadOnly: false };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--no-file-check") options.verifyFiles = false;
    else if (arg === "--legacy-read-only") options.legacyReadOnly = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(
        "Usage: node scripts/virtual-atelier/validate-operation.mjs <operation.json> [--json] [--no-file-check] [--legacy-read-only]",
      );
      process.exit(0);
    } else if (!options.operationPath) options.operationPath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.operationPath) throw new Error("An operation JSON path is required.");
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const operationPath = resolve(options.operationPath);
  const operation = JSON.parse(readFileSync(operationPath, "utf8"));
  const result = validateOperationRecord(operation, {
    operationPath,
    verifyFiles: options.verifyFiles,
    requireCanonicalIdentity: !options.legacyReadOnly,
  });

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`JUW Virtual Atelier operation preflight: ${result.operationId || "unknown"}`);
    if (result.semanticPreflightPass) {
      console.log(`PASS SEMANTIC_PREFLIGHT_ONLY view ${result.view || "unknown"}`);
      console.log(`- canonical operation: ${result.canonicalOperationId}`);
      console.log(`- semantic hash: ${result.semanticOperationHash}`);
      console.log("- paid dispatch remains blocked until the durable engine acquires and reconciles its execution claim/fence");
    } else if (options.legacyReadOnly && result.pass) {
      console.log(`PASS LEGACY_READ_ONLY view ${result.view || "unknown"}`);
      console.log("- paid invocation is blocked because canonical semantic identity is not verified");
    } else {
      console.log(`FAIL view ${result.view || "unknown"}`);
    }
    for (const error of result.errors) console.log(`- ${error}`);
  }
  process.exitCode = options.legacyReadOnly ? (result.pass ? 0 : 1) : (result.semanticPreflightPass ? 0 : 1);
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
