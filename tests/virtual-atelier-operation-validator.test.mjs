import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";

import { validateOperationRecord } from "../scripts/virtual-atelier/validate-operation.mjs";

function makeOperation(view) {
  const garmentId = "009";
  const promptVerbatimLines = ["One exact recorded catalogue prompt."];
  const bodyAssetId = view === "06" ? "lulu.body.canon.v4.side" : "lulu.body.canon.v4.back";
  return {
    operationId: `g009-v${view}-test`,
    garmentId,
    view,
    operationType: "INDEPENDENT_SIBLING_BODY_CANON_REBASE",
    status: "PREPARED_NOT_INVOKED",
    parentAssets: [`garment.${garmentId}.view.05.accepted`],
    referenceStack: [
      { slot: 1, assetId: `garment.${garmentId}.view.05.accepted`, path: "05.png", sha256: "a".repeat(64) },
      { slot: 2, assetId: "lulu.face.operation-board.full.v1", path: "face.png", sha256: "b".repeat(64) },
      { slot: 3, assetId: bodyAssetId, path: "body.png", sha256: "c".repeat(64) },
      { slot: 4, assetId: "lulu.body.real.angle-contact.v4", path: "real-body.jpg", sha256: "d".repeat(64) },
      { slot: 5, assetId: "juw.atelier.empty-plate.v1", path: "room.png", sha256: "e".repeat(64) },
    ],
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

test("accepts complete angle-specific sibling operation contracts", () => {
  for (const view of ["06", "07"]) {
    const result = validateOperationRecord(makeOperation(view), { verifyFiles: false });
    assert.equal(result.pass, true, result.errors.join("\n"));
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
