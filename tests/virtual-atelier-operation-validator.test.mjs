import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import {
  deriveManualSemanticIdentity,
  validateOperationRecord,
} from "../scripts/virtual-atelier/validate-operation.mjs";

function makeOperation(view) {
  const garmentId = "009";
  const promptVerbatimLines = ["One exact recorded catalogue prompt."];
  const bodyAssetId = view === "06" ? "lulu.body.canon.v4.side" : "lulu.body.canon.v4.back";
  return {
    operationId: `g009-v${view}-test`,
    workflowRevision: "2026-08-26.107",
    garmentId,
    view,
    stage: view === "05" ? "ROOM_FINAL_05" : view === "06" ? "SIBLING_06" : "SIBLING_07_CORE",
    operationType: "INDEPENDENT_SIBLING_BODY_CANON_REBASE",
    status: "PREPARED_NOT_INVOKED",
    correctionOrdinal: 0,
    correctionBudget: 1,
    parentAssets: [`garment.${garmentId}.view.05.accepted`],
    referenceStack: [
      { slot: 1, assetId: `garment.${garmentId}.view.05.accepted`, path: "05.png", sha256: "a".repeat(64) },
      { slot: 2, assetId: "lulu.face.operation-board.full.v1", path: "face.png", sha256: "b".repeat(64) },
      { slot: 3, assetId: bodyAssetId, path: "body.png", sha256: "c".repeat(64) },
      { slot: 4, assetId: "lulu.body.real.angle-contact.v4", path: "real-body.jpg", sha256: "d".repeat(64) },
      { slot: 5, assetId: "juw.atelier.empty-plate.v1", path: "room.png", sha256: "e".repeat(64) },
    ],
    authorityStack: {
      parent: [`garment.${garmentId}.view.05.accepted`],
      identity: ["lulu.face.operation-board.full.v1"],
      body: [bodyAssetId, "lulu.body.real.angle-contact.v4"],
      atelier: ["juw.atelier.empty-plate.v1"],
    },
    changeSet: ["create an independent sibling"],
    immutableSet: ["identity", "body", "garment", "room"],
    outputContract: ["one full-body catalogue image"],
    renderQualityContract: {
      photographicRealism: "one coherent photograph",
      skinTexture: "natural skin microtexture",
      garmentTexture: "source-supported material response",
      lightingIntegration: "one shared light field",
      opticsPerspective: "level natural perspective",
      artifactRejection: ["plastic skin", "cutout halos"],
    },
    failureGates: ["identity drift", "body drift", "synthetic texture"],
    promptVerbatimLines,
    promptSha256: createHash("sha256").update(promptVerbatimLines.join("\n")).digest("hex"),
  };
}

function markGatePass(operation) {
  operation.status = "INDEPENDENT_GATE_PASS_USER_APPROVAL_PENDING";
  operation.output = {
    path: "candidate.png",
    sha256: "f".repeat(64),
  };
  operation.renderQualityReview = {
    photographicRealism: "PASS",
    skinTexture: "PASS",
    garmentTexture: "PASS",
    lightingIntegration: "PASS",
    opticsPerspective: "PASS",
    artifactRejection: "PASS",
    reviewedAt: "2026-08-21T20:00:00Z",
  };
  return operation;
}

function makeFrontOperation() {
  const operation = makeOperation("05");
  operation.operationId = "g009-v05-test";
  operation.parentAssets = ["garment.009.subject.core.lock.v1"];
  operation.referenceStack = [
    { slot: 1, assetId: "garment.009.subject.core.lock.v1", path: "subject.png", sha256: "1".repeat(64) },
    { slot: 2, assetId: "garment.009.view.01.accepted", path: "01.png", sha256: "2".repeat(64) },
    { slot: 3, assetId: "juw.atelier.empty-plate.v1", path: "room.png", sha256: "5".repeat(64) },
  ];
  operation.authorityStack = {
    parent: ["garment.009.subject.core.lock.v1"],
    garment: ["garment.009.view.01.accepted"],
    atelier: ["juw.atelier.empty-plate.v1"],
  };
  operation.fashionNovaCheck = {
    operationId: "g009-fashion-nova-styling-check-test",
    publisher: "Fashion Nova",
    officialUrl: "https://www.fashionnova.com/products/example",
    resolvedOfficialUrl: "https://www.fashionnova.com/products/example?color=black",
    pageTitle: "Example Denim Shorts - Black",
    accessedOn: "2026-08-21",
    matchedGarmentFacts: ["short black-wash cut-off denim silhouette"],
    decision: "REFINE",
    selectedStylingDirection: "retain a tall black heel with cleaner JUW proportions",
    authority: "ADVISORY_STYLING_ONLY",
    passedAsImageReference: false,
  };
  return operation;
}

function makeGarmentFrontOperation() {
  const operation = makeOperation("06");
  operation.operationId = "g009-v01-test";
  operation.view = "01";
  operation.stage = "GARMENT_01_FRONT";
  operation.operationType = "INDEPENDENT_GARMENT_CATALOGUE_VIEW";
  operation.parentAssets = [];
  operation.referenceStack = [
    { slot: 1, assetId: "garment.009.direct-source-pack.v1", path: "garment-pack.png", sha256: "6".repeat(64) },
  ];
  operation.authorityStack = {
    garment: ["garment.009.direct-source-pack.v1"],
  };
  operation.changeSet = ["create independent garment front catalogue view"];
  operation.immutableSet = ["garment"];
  return operation;
}

function bindSemanticIdentity(operation) {
  const derived = deriveManualSemanticIdentity(operation);
  operation.operationId = derived.operationId;
  operation.semanticIdentity = {
    contractVersion: derived.contractVersion,
    operationId: derived.operationId,
    semanticOperationHash: derived.semanticOperationHash,
  };
  return operation;
}

const ORDERED_GATES = ["GARMENT", "FACE", "BODY", "ROOM", "FINAL_INTEGRATION"];

function addOrderedGateReceipt(operation, decisions = ORDERED_GATES.map(() => "PASS")) {
  const identity = deriveManualSemanticIdentity(operation);
  operation.orderedGateReceipt = {
    contractVersion: "juw.atelier-manual-ordered-gates.v1",
    semanticOperationHash: identity.semanticOperationHash,
    artifactSha256: operation.output.sha256,
    multiEraBaseline: {
      revision: "g001-g024-multi-era-v1",
      anchors: ["G001", "G004", "G005", "G009", "G023", "G024"],
      directRealAuthorityOutranksGenerated: true,
    },
    gates: ORDERED_GATES.map((gate, index) => ({ gate, decision: decisions[index] })),
  };
  return operation;
}

function paidValidation(operation) {
  const semanticPreflight = structuredClone(operation);
  delete semanticPreflight.promptVerbatimLines;
  delete semanticPreflight.promptSha256;
  return validateOperationRecord(semanticPreflight, {
    verifyFiles: false,
    requireCanonicalIdentity: true,
  });
}

function strictValidation(operation) {
  return validateOperationRecord(operation, {
    verifyFiles: false,
    requireCanonicalIdentity: true,
  });
}

function withoutLegacyPrompt(operation) {
  delete operation.promptVerbatimLines;
  delete operation.promptSha256;
  return operation;
}

function historicalValidation(operation) {
  return validateOperationRecord(operation, { verifyFiles: false });
}

function makeBoundedCorrection(sourceSemanticOperationHash) {
  const operation = makeFrontOperation();
  operation.correctionOfSemanticOperationHash = sourceSemanticOperationHash;
  operation.correctionOrdinal = 1;
  operation.correctionBudget = 0;
  operation.changeSet = [{
    failedGate: "FACE",
    mutableLayer: "IDENTITY",
    region: "face translation",
    intendedDelta: "Correct only the failed identity translation.",
  }];
  return operation;
}

test("accepts complete angle-specific sibling operation contracts", () => {
  for (const view of ["06", "07"]) {
    const result = validateOperationRecord(makeOperation(view), { verifyFiles: false });
    assert.equal(result.pass, true, result.errors.join("\n"));
    assert.equal(result.semanticIdentityStatus, "LEGACY_UNBOUND_READ_ONLY");
    assert.equal(result.paidInvocationAllowed, false);
  }
});

test("legacy operation IDs remain readable but cannot authorize a paid invocation", () => {
  const operation = makeOperation("06");
  operation.operationId = "caller-chosen-arbitrary-id";

  const historical = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(historical.pass, true, historical.errors.join("\n"));
  assert.equal(historical.paidInvocationAllowed, false);
  assert.equal(historical.recordId, "caller-chosen-arbitrary-id");
  assert.match(historical.canonicalOperationId, /^atelier:009:model-left-profile:[a-f0-9]{24}$/);

  const paidPreflight = validateOperationRecord(operation, {
    verifyFiles: false,
    requireCanonicalIdentity: true,
  });
  assert.equal(paidPreflight.pass, false);
  assert.equal(paidPreflight.paidInvocationAllowed, false);
  assert.match(paidPreflight.errors.join("\n"), /semanticIdentity is required before a manual operation may pass semantic preflight/);
});

test("verified canonical identity passes semantic preflight without authorizing dispatch", () => {
  const operation = bindSemanticIdentity(withoutLegacyPrompt(makeFrontOperation()));
  const result = validateOperationRecord(operation, {
    verifyFiles: false,
    requireCanonicalIdentity: true,
  });

  assert.equal(result.pass, true, result.errors.join("\n"));
  assert.equal(result.semanticPreflightPass, true);
  assert.equal(result.paidInvocationAllowed, false);
  assert.equal(result.dispatchBoundary, "DURABLE_ENGINE_CLAIM_REQUIRED");
  assert.equal(result.semanticIdentityStatus, "VERIFIED");
  assert.equal(result.canonicalOperationId, operation.semanticIdentity.operationId);
  assert.equal(result.semanticOperationHash, operation.semanticIdentity.semanticOperationHash);
  assert.equal(result.executionIdentity, null);
  assert.equal(Object.hasOwn(result, "executionHash"), false);
});

test("05 semantic preflight requires subject, garment, and room while inheriting identity and body", () => {
  const operation = makeFrontOperation();
  operation.referenceStack = [operation.referenceStack[0]];
  operation.authorityStack = { parent: [...operation.parentAssets] };
  bindSemanticIdentity(operation);

  const result = paidValidation(operation);
  assert.equal(result.paidInvocationAllowed, false);
  const errors = result.errors.join("\n");
  assert.match(errors, /authorityStack\.garment/);
  assert.match(errors, /authorityStack\.atelier/);

  const reopened = makeFrontOperation();
  reopened.referenceStack.push(
    { slot: 4, assetId: "lulu.face.operation-board.full.v1", path: "face.png", sha256: "3".repeat(64) },
    { slot: 5, assetId: "lulu.body.canon.v4", path: "body.png", sha256: "4".repeat(64) },
  );
  reopened.authorityStack.identity = ["lulu.face.operation-board.full.v1"];
  reopened.authorityStack.body = ["lulu.body.canon.v4"];
  bindSemanticIdentity(reopened);
  const reopenedResult = paidValidation(reopened);
  assert.equal(reopenedResult.paidInvocationAllowed, false);
  assert.match(reopenedResult.errors.join("\n"), /must inherit identity from the exact accepted subject lock/);
  assert.match(reopenedResult.errors.join("\n"), /must inherit body from the exact accepted subject lock/);
});

test("05 semantic preflight rejects authority aliases, extra inputs, and parent mismatch", () => {
  const cases = [
    {
      name: "alias role",
      mutate(operation) {
        operation.referenceStack.push({
          slot: 4,
          assetId: "lulu.face.operation-board.full.v1",
          path: "face.png",
          sha256: "3".repeat(64),
        });
        operation.authorityStack.context = ["lulu.face.operation-board.full.v1"];
      },
      expected: /ROOM_FINAL_05 authorityStack must contain exactly/,
    },
    {
      name: "extra parent input",
      mutate(operation) {
        operation.referenceStack.push({
          slot: 4,
          assetId: "garment.009.subject.other.lock.v1",
          path: "other-subject.png",
          sha256: "4".repeat(64),
        });
        operation.authorityStack.parent.push("garment.009.subject.other.lock.v1");
      },
      expected: /requires exactly one authorityStack\.parent asset/,
    },
    {
      name: "parent classification mismatch",
      mutate(operation) {
        operation.parentAssets = ["garment.009.view.01.accepted"];
      },
      expected: /parentAssets must exactly equal authorityStack\.parent/,
    },
  ];

  for (const { name, mutate, expected } of cases) {
    const operation = makeFrontOperation();
    mutate(operation);
    bindSemanticIdentity(operation);
    const result = paidValidation(operation);
    assert.equal(result.semanticPreflightPass, false, name);
    assert.match(result.errors.join("\n"), expected, name);
  }
});

test("a reviewed 05 receipt is auditable but cannot pass manual semantic preflight", () => {
  const operation = markGatePass(makeFrontOperation());
  bindSemanticIdentity(operation);
  addOrderedGateReceipt(operation);

  const result = historicalValidation(operation);
  assert.equal(result.pass, true, result.errors.join("\n"));
  assert.equal(result.semanticPreflightPass, false);
  assert.equal(result.paidInvocationAllowed, false);

  const strict = paidValidation(operation);
  assert.equal(strict.pass, false);
  assert.match(strict.errors.join("\n"), /reviewed\/materialized states require the durable engine receipt verifier/);
});

test("a canonical reviewed output cannot omit its ordered gate receipt", () => {
  const operation = bindSemanticIdentity(markGatePass(makeFrontOperation()));
  const result = paidValidation(operation);
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /orderedGateReceipt is required/);

  const unhashedOutput = makeFrontOperation();
  unhashedOutput.status = "PRIVATE_SEMANTIC_FAIL";
  unhashedOutput.output = { path: "candidate.png" };
  bindSemanticIdentity(unhashedOutput);
  const unhashedResult = paidValidation(unhashedOutput);
  assert.equal(unhashedResult.pass, false);
  assert.match(unhashedResult.errors.join("\n"), /orderedGateReceipt is required/);
});

test("garment-stage receipts keep excluded face, body, and room gates not applicable", () => {
  const passed = markGatePass(makeGarmentFrontOperation());
  bindSemanticIdentity(passed);
  addOrderedGateReceipt(passed, [
    "PASS",
    "NOT_APPLICABLE",
    "NOT_APPLICABLE",
    "NOT_APPLICABLE",
    "PASS",
  ]);
  const passResult = historicalValidation(passed);
  assert.equal(passResult.pass, true, passResult.errors.join("\n"));
  assert.equal(passResult.semanticPreflightPass, false);

  const failed = makeGarmentFrontOperation();
  failed.status = "PRIVATE_SEMANTIC_FAIL";
  failed.output = { path: "candidate.png", sha256: "f".repeat(64) };
  bindSemanticIdentity(failed);
  addOrderedGateReceipt(failed, [
    "FAIL",
    "NOT_APPLICABLE",
    "NOT_APPLICABLE",
    "NOT_APPLICABLE",
    "NOT_EVALUATED",
  ]);
  const failResult = historicalValidation(failed);
  assert.equal(failResult.pass, true, failResult.errors.join("\n"));
});

test("ordered gate receipts short-circuit every later gate after the first failure", () => {
  const operation = makeFrontOperation();
  operation.status = "PRIVATE_SEMANTIC_FAIL";
  operation.output = { path: "candidate.png", sha256: "f".repeat(64) };
  bindSemanticIdentity(operation);
  addOrderedGateReceipt(operation, ["PASS", "FAIL", "PASS", "PASS", "PASS"]);

  const result = historicalValidation(operation);
  assert.equal(result.pass, false);
  const errors = result.errors.join("\n");
  assert.match(errors, /BODY must be NOT_EVALUATED after the first failed gate/);
  assert.match(errors, /ROOM must be NOT_EVALUATED after the first failed gate/);
  assert.match(errors, /FINAL_INTEGRATION must be NOT_EVALUATED after the first failed gate/);

  addOrderedGateReceipt(operation, [
    "PASS",
    "FAIL",
    "NOT_EVALUATED",
    "NOT_EVALUATED",
    "NOT_EVALUATED",
  ]);
  const stopped = historicalValidation(operation);
  assert.equal(stopped.pass, true, stopped.errors.join("\n"));
});

test("gate-pass, accepted, and locked claims require every applicable ordered gate to pass", () => {
  for (const status of ["GATE_PASS", "ACCEPTED", "LOCKED"]) {
    const operation = markGatePass(makeFrontOperation());
    operation.status = status;
    bindSemanticIdentity(operation);
    addOrderedGateReceipt(operation, [
      "PASS",
      "PASS",
      "FAIL",
      "NOT_EVALUATED",
      "NOT_EVALUATED",
    ]);
    const result = historicalValidation(operation);
    assert.equal(result.pass, false, status);
    assert.match(result.errors.join("\n"), /every applicable orderedGateReceipt gate must equal PASS/);
  }
});

test("ordered gate receipt rejects output, semantic identity, and baseline substitution", () => {
  const cases = [
    (operation) => { operation.orderedGateReceipt.artifactSha256 = "0".repeat(64); },
    (operation) => { operation.orderedGateReceipt.semanticOperationHash = "0".repeat(64); },
    (operation) => { operation.orderedGateReceipt.multiEraBaseline.revision = "latest-garment-only"; },
    (operation) => { operation.orderedGateReceipt.multiEraBaseline.anchors.reverse(); },
    (operation) => { delete operation.orderedGateReceipt.multiEraBaseline.anchors; },
    (operation) => { operation.orderedGateReceipt.gates.reverse(); },
  ];
  for (const mutate of cases) {
    const operation = markGatePass(makeFrontOperation());
    bindSemanticIdentity(operation);
    addOrderedGateReceipt(operation);
    mutate(operation);
    const result = historicalValidation(operation);
    assert.equal(result.pass, false);
  }
});

test("manual correction identity is bounded but cannot authorize a paid engine retry", () => {
  const root = bindSemanticIdentity(makeFrontOperation());
  const correction = bindSemanticIdentity(makeBoundedCorrection(root.semanticIdentity.semanticOperationHash));
  const valid = paidValidation(correction);
  assert.equal(valid.pass, false);
  assert.equal(valid.paidInvocationAllowed, false);
  assert.match(valid.errors.join("\n"), /manual correction record cannot authorize semantic preflight/);

  const malformed = [
    Object.assign(makeBoundedCorrection(root.semanticIdentity.semanticOperationHash), { correctionOrdinal: 2 }),
    Object.assign(makeBoundedCorrection(root.semanticIdentity.semanticOperationHash), { correctionBudget: 1 }),
    Object.assign(makeBoundedCorrection(root.semanticIdentity.semanticOperationHash), {
      correctionOfSemanticOperationHash: "not-a-semantic-hash",
    }),
    Object.assign(makeBoundedCorrection(root.semanticIdentity.semanticOperationHash), {
      changeSet: [
        makeBoundedCorrection(root.semanticIdentity.semanticOperationHash).changeSet[0],
        {
          failedGate: "BODY",
          mutableLayer: "BODY",
          region: "body geometry",
          intendedDelta: "A forbidden second change.",
        },
      ],
    }),
    {
      ...makeBoundedCorrection(root.semanticIdentity.semanticOperationHash),
      changeSet: [{
        ...makeBoundedCorrection(root.semanticIdentity.semanticOperationHash).changeSet[0],
        failedGate: "__proto__",
      }],
    },
  ];
  for (const operation of malformed) {
    bindSemanticIdentity(operation);
    const result = paidValidation(operation);
    assert.equal(result.pass, false);
  }
});

test("a FACE failure cannot authorize BODY or ROOM mutation", () => {
  const root = bindSemanticIdentity(makeFrontOperation());
  for (const mutableLayer of ["BODY", "ATELIER"]) {
    const correction = makeBoundedCorrection(root.semanticIdentity.semanticOperationHash);
    correction.changeSet[0].mutableLayer = mutableLayer;
    bindSemanticIdentity(correction);

    const result = paidValidation(correction);
    assert.equal(result.pass, false, mutableLayer);
    assert.match(result.errors.join("\n"), /FACE correction mutableLayer must be one of IDENTITY, HAIR/);
  }
});

test("a BODY correction preserves the earlier garment, identity, and hair layers", () => {
  const root = bindSemanticIdentity(makeFrontOperation());
  const makeBodyCorrection = () => {
    const correction = makeBoundedCorrection(root.semanticIdentity.semanticOperationHash);
    correction.changeSet[0] = {
      failedGate: "BODY",
      mutableLayer: "BODY",
      region: "body geometry",
      intendedDelta: "Correct only the failed body geometry.",
    };
    correction.immutableSet = ["garment", "identity", "hair"];
    return correction;
  };

  const valid = bindSemanticIdentity(makeBodyCorrection());
  const validResult = paidValidation(valid);
  assert.equal(validResult.pass, false);
  assert.equal(validResult.paidInvocationAllowed, false);
  assert.match(validResult.errors.join("\n"), /manual correction record cannot authorize semantic preflight/);

  const missingIdentity = makeBodyCorrection();
  missingIdentity.immutableSet = ["garment", "hair"];
  bindSemanticIdentity(missingIdentity);
  const missingIdentityResult = paidValidation(missingIdentity);
  assert.equal(missingIdentityResult.pass, false);
  assert.match(
    missingIdentityResult.errors.join("\n"),
    /BODY correction immutableSet must preserve earlier passing layer IDENTITY/,
  );
});

test("manual semantic identity is canonical, provider-neutral and independent of the record label", () => {
  const firstOperation = makeOperation("07");
  const first = deriveManualSemanticIdentity(firstOperation);

  const reordered = makeOperation("07");
  reordered.operationId = "another-arbitrary-record-label";
  reordered.referenceStack.reverse();
  reordered.authorityStack = Object.fromEntries(
    Object.entries(reordered.authorityStack).reverse().map(([role, assetIds]) => [role, [...assetIds].reverse()]),
  );
  reordered.changeSet.reverse();
  reordered.immutableSet.reverse();
  reordered.failureGates.reverse();
  reordered.promptVerbatimLines = ["Different provider prompt syntax is execution evidence, not semantic identity."];
  reordered.provider = "another-provider";
  reordered.model = "another-model";

  const second = deriveManualSemanticIdentity(reordered);
  assert.equal(second.semanticOperationHash, first.semanticOperationHash);
  assert.equal(second.operationId, first.operationId);
});

test("authority bytes and workflow revision change manual semantic identity", () => {
  const operation = makeOperation("06");
  const original = deriveManualSemanticIdentity(operation);

  const changedAuthority = makeOperation("06");
  changedAuthority.referenceStack[1].sha256 = "9".repeat(64);
  assert.notEqual(deriveManualSemanticIdentity(changedAuthority).semanticOperationHash, original.semanticOperationHash);

  const changedWorkflow = makeOperation("06");
  changedWorkflow.workflowRevision = "2026-08-26.108";
  assert.notEqual(deriveManualSemanticIdentity(changedWorkflow).semanticOperationHash, original.semanticOperationHash);
});

test("canonical semantic identity represents SUBJECT stages and rejects stage-view mismatch", () => {
  const subject = makeOperation("06");
  subject.view = "SUBJECT";
  subject.stage = "SUBJECT_A";
  subject.operationType = "HOLISTIC_SUBJECT_SYNTHESIS";
  bindSemanticIdentity(subject);

  const result = paidValidation(subject);
  assert.equal(result.semanticPreflightPass, true, result.errors.join("\n"));
  assert.match(result.canonicalOperationId, /^atelier:009:garment-specific-subject:/);

  const mismatch = makeOperation("06");
  mismatch.view = "SUBJECT";
  mismatch.stage = "ROOM_FINAL_05";
  assert.throws(
    () => deriveManualSemanticIdentity(mismatch),
    /stage ROOM_FINAL_05 requires view 05, not SUBJECT/,
  );
});

test("semantic identity mismatch fails closed even during legacy read-only validation", () => {
  const operation = bindSemanticIdentity(makeOperation("06"));
  operation.semanticIdentity.semanticOperationHash = "0".repeat(64);

  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.equal(result.paidInvocationAllowed, false);
  assert.equal(result.semanticIdentityStatus, "INVALID");
  assert.match(result.errors.join("\n"), /semanticIdentity\.semanticOperationHash mismatch/);
});

test("a valid semantic receipt cannot authorize a different caller-authored operation ID", () => {
  const operation = bindSemanticIdentity(makeOperation("06"));
  operation.operationId = "caller-overrode-the-canonical-id";

  const result = validateOperationRecord(operation, {
    verifyFiles: false,
    requireCanonicalIdentity: true,
  });
  assert.equal(result.pass, false);
  assert.equal(result.paidInvocationAllowed, false);
  assert.match(result.errors.join("\n"), /operationId must equal the derived canonical operation ID for semantic preflight/);
});

test("execution fields are forbidden inside the semantic identity receipt", () => {
  const operation = bindSemanticIdentity(makeOperation("06"));
  operation.semanticIdentity.executionHash = "f".repeat(64);

  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.equal(result.paidInvocationAllowed, false);
  assert.match(result.errors.join("\n"), /execution identity stays outside the manual semantic identity/);
});

test("provider execution data cannot be smuggled into canonical semantic specs", () => {
  const operation = makeOperation("06");
  operation.poseSpec = { turn: "soft left profile", provider: "provider-a" };

  assert.throws(
    () => deriveManualSemanticIdentity(operation),
    /semanticOperation\.poseSpec\.provider is provider execution data and may not enter manual semantic identity/,
  );
});

test("strict semantic preflight rejects every caller-authored execution field", () => {
  const cases = [
    ["promptVerbatimLines", ["caller-authored prompt"]],
    ["promptSha256", "a".repeat(64)],
    ["provider", "openai"],
    ["model", "gpt-image-2"],
    ["compiledPrompt", "caller-authored compiled prompt"],
    ["compiledPromptHash", "b".repeat(64)],
    ["requestId", "caller-request"],
    ["providerRequestId", "provider-request"],
    ["executionIdentity", { executionHash: "c".repeat(64) }],
    ["executionHash", "c".repeat(64)],
    ["claim", { owner: "caller" }],
    ["dispatchFence", "caller-fence"],
    ["invocationStartedCheckpoint", "2026-08-26T12:00:00.000Z"],
    ["resultReceivedCheckpoint", "2026-08-26T12:01:00.000Z"],
    ["rawResultManifest", { sha256: "d".repeat(64) }],
  ];

  for (const [field, value] of cases) {
    const operation = bindSemanticIdentity(withoutLegacyPrompt(makeFrontOperation()));
    operation[field] = value;
    const result = strictValidation(operation);
    assert.equal(result.semanticPreflightPass, false, field);
    assert.match(
      result.errors.join("\n"),
      new RegExp(`does not allow top-level field ${field}`),
      field,
    );
  }
});

test("the checked-in CLI defaults to semantic preflight and requires an explicit legacy read-only mode", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "juw-atelier-operation-"));
  const operationPath = join(temporaryRoot, "operation.json");
  try {
    writeFileSync(operationPath, JSON.stringify(makeOperation("06")));
    const strict = spawnSync(
      process.execPath,
      ["scripts/virtual-atelier/validate-operation.mjs", operationPath, "--no-file-check", "--json"],
      { encoding: "utf8" },
    );
    assert.equal(strict.status, 1, strict.stderr);
    assert.equal(JSON.parse(strict.stdout).paidInvocationAllowed, false);

    const readOnly = spawnSync(
      process.execPath,
      [
        "scripts/virtual-atelier/validate-operation.mjs",
        operationPath,
        "--no-file-check",
        "--legacy-read-only",
        "--json",
      ],
      { encoding: "utf8" },
    );
    assert.equal(readOnly.status, 0, readOnly.stderr);
    assert.equal(JSON.parse(readOnly.stdout).semanticIdentityStatus, "LEGACY_UNBOUND_READ_ONLY");

    writeFileSync(
      operationPath,
      JSON.stringify(bindSemanticIdentity(withoutLegacyPrompt(makeOperation("06")))),
    );
    const bound = spawnSync(
      process.execPath,
      ["scripts/virtual-atelier/validate-operation.mjs", operationPath, "--no-file-check", "--json"],
      { encoding: "utf8" },
    );
    assert.equal(bound.status, 0, bound.stderr);
    assert.equal(JSON.parse(bound.stdout).semanticPreflightPass, true);
    assert.equal(JSON.parse(bound.stdout).paidInvocationAllowed, false);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("the checked-in manual operation example is a real semantic-preflight record", () => {
  const example = JSON.parse(readFileSync(
    new URL("../docs/virtual-atelier/MANUAL-OPERATION-EXAMPLE.json", import.meta.url),
    "utf8",
  ));
  const result = validateOperationRecord(example, {
    verifyFiles: false,
    requireCanonicalIdentity: true,
  });

  assert.equal(result.pass, true, result.errors.join("\n"));
  assert.equal(result.semanticPreflightPass, true);
  assert.equal(result.paidInvocationAllowed, false);
  assert.equal(result.executionIdentity, null);
  assert.equal(Object.hasOwn(example, "promptVerbatimLines"), false);

  const requiredOperationFields = [
    "operationId",
    "garmentId",
    "view",
    "parentAssets",
    "authorityStack",
    "changeSet",
    "immutableSet",
    "outputContract",
    "failureGates",
  ];
  const agents = readFileSync(new URL("../AGENTS.md", import.meta.url), "utf8");
  const contractSection = agents.match(
    /Every governing operation record contains:\r?\n\r?\n((?:- `[^`]+`\r?\n)+)/,
  );
  assert.ok(contractSection, "AGENTS.md must retain the required operation field list");
  const documentedFields = [...contractSection[1].matchAll(/- `([^`]+)`/g)]
    .map((match) => match[1]);
  assert.deepEqual(documentedFields, requiredOperationFields);
  for (const field of requiredOperationFields) {
    assert.equal(Object.hasOwn(example, field), true, `manual example is missing ${field}`);
  }
});

test("explicit legacy read-only mode preserves historical reviewed records without new gate or correction fields", () => {
  const temporaryRoot = mkdtempSync(join(tmpdir(), "juw-atelier-legacy-operation-"));
  const operationPath = join(temporaryRoot, "operation.json");
  try {
    const historical = markGatePass(makeFrontOperation());
    delete historical.correctionOrdinal;
    delete historical.correctionBudget;
    writeFileSync(operationPath, JSON.stringify(historical));

    const readOnly = spawnSync(
      process.execPath,
      [
        "scripts/virtual-atelier/validate-operation.mjs",
        operationPath,
        "--no-file-check",
        "--legacy-read-only",
        "--json",
      ],
      { encoding: "utf8" },
    );
    assert.equal(readOnly.status, 0, readOnly.stderr);
    assert.equal(JSON.parse(readOnly.stdout).paidInvocationAllowed, false);

    const strict = spawnSync(
      process.execPath,
      ["scripts/virtual-atelier/validate-operation.mjs", operationPath, "--no-file-check", "--json"],
      { encoding: "utf8" },
    );
    assert.equal(strict.status, 1, strict.stderr);
  } finally {
    rmSync(temporaryRoot, { recursive: true, force: true });
  }
});

test("allows adaptive reference ordering while preserving required authority membership", () => {
  const operation = makeOperation("06");
  operation.referenceStack.reverse();
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, true, result.errors.join("\n"));
});

test("accepts a 05 operation with a bounded official Fashion Nova styling check", () => {
  const result = validateOperationRecord(makeFrontOperation(), { verifyFiles: false });
  assert.equal(result.pass, true, result.errors.join("\n"));
});

test("rejects a 05 operation without the Fashion Nova styling check", () => {
  const operation = makeFrontOperation();
  delete operation.fashionNovaCheck;
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /fashionNovaCheck is required before every 05 operation/);
});

test("rejects a non-official Fashion Nova styling source", () => {
  const operation = makeFrontOperation();
  operation.fashionNovaCheck.officialUrl = "https://example.com/fashion-nova-look";
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /must use an official fashionnova\.com host/);
});

test("allows an honest no-close-match 05 decision with a search reason", () => {
  const operation = makeFrontOperation();
  operation.fashionNovaCheck.matchedGarmentFacts = [];
  operation.fashionNovaCheck.decision = "NO_CLOSE_MATCH";
  operation.fashionNovaCheck.noCloseMatchReason = "The current product and collection pages did not contain the proven garment family.";
  operation.fashionNovaCheck.selectedStylingDirection = "Keep the strongest garment-faithful JUW footwear direction.";
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, true, result.errors.join("\n"));
});

test("rejects a no-close-match decision without its search reason", () => {
  const operation = makeFrontOperation();
  operation.fashionNovaCheck.matchedGarmentFacts = [];
  operation.fashionNovaCheck.decision = "NO_CLOSE_MATCH";
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /noCloseMatchReason is required/);
});

test("rejects Fashion Nova page evidence leaking into generation authority", () => {
  const operation = makeFrontOperation();
  operation.referenceStack.push({
    assetId: "fashionnova.page.capture",
    path: "fashion-nova-look.png",
    sha256: "9".repeat(64),
  });
  operation.authorityStack = {
    styling: ["https://www.fashionnova.com/products/example"],
  };
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /may not appear in referenceStack or authorityStack/);
});

test("rejects malformed live-page evidence and impossible access dates", () => {
  const operation = makeFrontOperation();
  operation.fashionNovaCheck.officialUrl = "https://fashionnova.com/not-a-page";
  operation.fashionNovaCheck.resolvedOfficialUrl = "http://fashionnova.com/not-a-page";
  operation.fashionNovaCheck.accessedOn = "1999-99-99";
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  const errors = result.errors.join("\n");
  assert.match(errors, /product or collection styling page/);
  assert.match(errors, /must use HTTPS/);
  assert.match(errors, /real calendar date/);
});

test("rejects a 06 operation when the dedicated side canon is absent", () => {
  const operation = makeOperation("06");
  operation.referenceStack[2] = { ...operation.referenceStack[2], assetId: "lulu.body.canon.v4.three-view" };
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /06 must include lulu\.body\.canon\.v4\.side/);
});

test("rejects a 07 operation when the dedicated back canon is absent", () => {
  const operation = makeOperation("07");
  operation.referenceStack[2] = { ...operation.referenceStack[2], assetId: "lulu.body.real.angle-contact.v4" };
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /07 must include lulu\.body\.canon\.v4\.back/);
});

test("rejects model operations without a declared realism and texture contract", () => {
  const operation = makeOperation("06");
  delete operation.renderQualityContract;
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /renderQualityContract is required/);
});

test("rejects gate-pass model operations without explicit quality review checks", () => {
  const operation = makeOperation("06");
  operation.status = "INDEPENDENT_GATE_PASS_USER_APPROVAL_PENDING";
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /renderQualityReview is required/);
});

test("rejects gate-pass claims without a hashed output and review timestamp", () => {
  const operation = markGatePass(makeOperation("06"));
  delete operation.output.path;
  delete operation.output.sha256;
  delete operation.renderQualityReview.reviewedAt;
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /output\.path is required/);
  assert.match(result.errors.join("\n"), /output\.sha256 is required/);
  assert.match(result.errors.join("\n"), /renderQualityReview\.reviewedAt is required/);
});

test("rejects cross-sibling lineage", () => {
  const operation = makeOperation("07");
  operation.parentAssets.push("garment.009.view.06.accepted");
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /may not use sibling view 06/);
});

test("rejects cross-sibling lineage hidden in a nested authority stack", () => {
  const operation = makeOperation("06");
  operation.authorityStack = {
    translation: ["garment.009.view.07.accepted"],
  };
  const result = validateOperationRecord(operation, { verifyFiles: false });
  assert.equal(result.pass, false);
  assert.match(result.errors.join("\n"), /may not use sibling view 07/);
});
