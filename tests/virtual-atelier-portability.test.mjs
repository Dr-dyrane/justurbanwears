import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  appendAtelierEvent,
  deriveArtifactHash,
  deriveEvaluationHash,
  deriveExecutionIdentity,
  deriveSemanticOperationIdentity,
  preflightProviderCapabilities,
  resolveSemanticRequest,
} from "../scripts/virtual-atelier/operation-identity.mjs";

function authority(role, assetId, hash, privacyClass = "PRIVATE_PRODUCTION_ONLY") {
  return {
    role,
    assetId,
    sha256: hash,
    provenanceClass: role === "garment" ? "DIRECT_CAPTURE" : "APPROVED_AUTHORITY",
    required: true,
    permittedScope: role,
    dominance: role === "identity" ? "PRIMARY" : "SCOPED",
    privacyClass,
  };
}

function operation() {
  return {
    contractVersion: "atelier-operation.v1",
    workflowRevision: "2026-08-26.90",
    garmentId: "024",
    viewRole: "MODEL_FRONT",
    operationType: "FRESH_FRONT_MASTER",
    authorityStack: [
      authority("identity", "lulu.face.operation-board.full.v1", "a".repeat(64)),
      authority("garment", "garment.024.view.01.accepted", "b".repeat(64)),
      authority("atelier", "juw.atelier.empty-plate.v1", "c".repeat(64)),
    ],
    parentLocks: [{ assetId: "garment.024.view.01.accepted", sha256: "b".repeat(64), lockedLayer: "garment" }],
    changeSet: ["create front master"],
    immutableSet: ["identity", "garment", "atelier"],
    garmentFacts: [{ fact: "colour", value: "black" }],
    unknownFacts: ["rear closure"],
    prohibitedInferences: ["invented pockets"],
    sceneSpec: { authority: "juw.atelier.empty-plate.v1" },
    cameraSpec: { orientation: "portrait", level: true },
    poseSpec: { role: "front master" },
    stylingSpec: { jewellery: "restrained" },
    renderQualityContract: { photographicRealism: "required" },
    outputContract: { format: "image/png", width: 1024, height: 1535 },
    failureGates: ["identity drift", "room drift"],
    correctionBudget: 1,
  };
}

test("semantic identity is canonical and independent of authority ordering", () => {
  const first = deriveSemanticOperationIdentity(operation());
  const reordered = operation();
  reordered.authorityStack.reverse();
  reordered.immutableSet.reverse();
  const second = deriveSemanticOperationIdentity(reordered);
  assert.equal(first.semanticOperationHash, second.semanticOperationHash);
  assert.equal(first.operationId, second.operationId);
  assert.match(first.semanticOperationHash, /^[a-f0-9]{64}$/);
});

test("provider syntax cannot enter semantic operation identity", () => {
  const invalid = { ...operation(), provider: "provider-a", model: "model-a", prompt: "provider prompt" };
  assert.throws(() => deriveSemanticOperationIdentity(invalid), /may not enter AtelierOperation/);
});

test("authority bytes change semantic identity while provider changes only execution identity", () => {
  const semantic = deriveSemanticOperationIdentity(operation());
  const changedAuthority = operation();
  changedAuthority.authorityStack[0].sha256 = "d".repeat(64);
  assert.notEqual(semantic.semanticOperationHash, deriveSemanticOperationIdentity(changedAuthority).semanticOperationHash);

  const execution = {
    semanticOperationHash: semantic.semanticOperationHash,
    adapterId: "gateway",
    adapterVersion: "1",
    provider: "provider-a",
    model: "model-a",
    modelRevision: "2026-08",
    compiledPromptHash: "e".repeat(64),
    referencePackingHash: "f".repeat(64),
    preprocessingVersion: "1",
    parameters: { aspectRatio: "4:5" },
    providerPolicyRevision: "1",
  };
  const first = deriveExecutionIdentity(execution);
  const second = deriveExecutionIdentity({ ...execution, provider: "provider-b", model: "model-b" });
  assert.notEqual(first.executionHash, second.executionHash);
  assert.equal(first.executionRecord.semanticOperationHash, second.executionRecord.semanticOperationHash);
});

test("capability preflight fails closed without dropping mandatory authority", () => {
  const current = operation();
  const bindings = current.authorityStack.map((item) => ({ assetId: item.assetId, bytes: 100 }));
  const capabilities = {
    operationTypes: ["FRESH_FRONT_MASTER"],
    privacyClasses: ["PRIVATE_PRODUCTION_ONLY"],
    maxReferences: 5,
    maxReferenceBytes: 1000,
    outputFormats: ["image/png"],
    localCorrection: false,
    idempotencyKey: true,
    remoteJobLookup: true,
  };
  assert.equal(preflightProviderCapabilities({ operation: current, capabilities, referenceBindings: bindings }).pass, true);
  const blocked = preflightProviderCapabilities({ operation: current, capabilities, referenceBindings: bindings.slice(1) });
  assert.equal(blocked.status, "BLOCKED_CAPABILITY");
  assert.match(blocked.errors.join("\n"), /required authority/);
});

test("ledger reuses locks, joins active work and stops unsafe indeterminate retry", () => {
  const semantic = deriveSemanticOperationIdentity(operation()).semanticOperationHash;
  let events = [];
  events = appendAtelierEvent(events, { type: "CLAIMED", semanticOperationHash: semantic });
  assert.deepEqual(resolveSemanticRequest(events, semantic), { action: "JOIN_ACTIVE" });
  assert.throws(() => appendAtelierEvent(events, { type: "CLAIMED", semanticOperationHash: semantic }), /duplicate or unsafe claim/);

  const artifactHash = deriveArtifactHash(new TextEncoder().encode("accepted pixels"));
  events = appendAtelierEvent(events, { type: "LOCKED", semanticOperationHash: semantic, artifactHash });
  assert.deepEqual(resolveSemanticRequest(events, semantic), { action: "REUSE_LOCKED", artifactHash });

  const another = deriveSemanticOperationIdentity({ ...operation(), garmentId: "025" }).semanticOperationHash;
  events = appendAtelierEvent(events, { type: "CLAIMED", semanticOperationHash: another });
  events = appendAtelierEvent(events, { type: "INDETERMINATE_PROVIDER_RESULT", semanticOperationHash: another });
  assert.deepEqual(resolveSemanticRequest(events, another), { action: "RECONCILE_PROVIDER" });
});

test("artifact and evaluation identities are separate", () => {
  const artifactHash = deriveArtifactHash(new Uint8Array([1, 2, 3]));
  const first = deriveEvaluationHash({ artifactHash, rubricVersion: "1", evaluatorVersion: "1", thresholdVersion: "1" });
  const second = deriveEvaluationHash({ artifactHash, rubricVersion: "2", evaluatorVersion: "1", thresholdVersion: "1" });
  assert.notEqual(first, second);
});

test("portable authority and provider calibration manifests cover the required evidence", () => {
  const authority = JSON.parse(readFileSync("lib/server/private-asset-manifests/lulu-v4.json", "utf8"));
  const portable = JSON.parse(readFileSync("docs/virtual-atelier/portable-authority-kit.v1.json", "utf8"));
  const calibration = JSON.parse(readFileSync("docs/virtual-atelier/provider-calibration.v1.json", "utf8"));
  assert.equal(portable.authorityRevision, authority.authorityRevision);
  assert.deepEqual(portable.assets.map((asset) => asset.id).sort(), authority.assets.map((asset) => asset.id).sort());
  assert.ok(portable.assets.every((asset) => asset.acceptanceStatus === "APPROVED" && asset.lockedStatus === "IMMUTABLE_AUTHORITY"));
  assert.deepEqual(portable.supplementalRestoreAssets.map((asset) => asset.id), [
    "lulu.face.real.primary",
    "lulu.face.real.v4.raw-frontal-closeup-eyes-closed",
    "lulu.face.real.v4.raw-three-quarter-open-eyes",
    "lulu.face.real.v4.front-lock",
  ]);
  assert.ok(portable.supplementalRestoreAssets.every((asset) => asset.acceptanceStatus === "APPROVED" && asset.lockedStatus === "IMMUTABLE_REAL_IDENTITY_AUTHORITY"));
  assert.deepEqual(calibration.cases.map((item) => item.garmentId), ["005", "009", "017", "023", "024"]);
  assert.equal(calibration.humanApprovalRequired, true);
});
