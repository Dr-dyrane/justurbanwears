import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  evaluateStudioAtelierStructuralSemanticPreflight,
  type StudioAtelierTransportConstituent,
} from "../lib/server/studio-atelier-structural-semantic-evaluator";
import {
  STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS,
  bindStudioAtelierRelease2Implementations,
  type StudioAtelierReleaseDependencyBinding,
} from "../lib/server/studio-atelier-unqualified-evaluator-bindings";
import { resolveStudioAtelierQualifiedEvaluatorBundle } from "../lib/server/studio-atelier-qualified-evaluator";
import {
  deriveStudioAtelierEvaluationContractDigest,
  deriveStudioAtelierEvaluatorDependencyDigest,
  deriveStudioAtelierEvaluatorImplementationDigest,
  deriveStudioAtelierEvaluatorModelDigest,
  studioAtelierEvaluatorBindingsSchema,
  type StudioAtelierEvidenceFileReference,
} from "../lib/studio/atelier/qualification-contracts";
import {
  STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256,
} from "../lib/studio/atelier/g004-provider-denial";
import {
  evaluatorFixtureDigest,
  evaluatorFixtureOperation,
  evaluatorFixtureTransportConstituents,
} from "./helpers/studio-atelier-evaluator-fixtures";

const EVALUATED_AT = "2026-08-27T19:00:00.000Z";
const ARTIFACT_SHA256 = evaluatorFixtureDigest("structural-semantic-artifact");

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function evaluate(
  operation: unknown,
  transportConstituents: readonly StudioAtelierTransportConstituent[],
  overrides: Readonly<{
    evaluatedAt?: string;
    artifactSha256?: string;
  }> = {},
) {
  return evaluateStudioAtelierStructuralSemanticPreflight({
    evaluatedAt: overrides.evaluatedAt ?? EVALUATED_AT,
    operation,
    artifactSha256: overrides.artifactSha256 ?? ARTIFACT_SHA256,
    transportConstituents,
  });
}

function evidenceReference(relativePath: string): StudioAtelierEvidenceFileReference {
  const bytes = readFileSync(relativePath);
  return Object.freeze({
    relativePath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    byteSize: bytes.byteLength,
    mediaType: relativePath.endsWith(".ts") ? "text/typescript" : "application/json",
  });
}

function releaseBindingsInput() {
  const lockEvidence = evidenceReference("package-lock.json");
  const dependency = (
    packageName: string,
    version: string,
  ): StudioAtelierReleaseDependencyBinding => Object.freeze({
    packageName,
    version,
    integritySha256: evaluatorFixtureDigest(
      `${packageName}@${version}:${lockEvidence.sha256}`,
    ),
    evidenceFile: lockEvidence,
  });
  return Object.freeze({
    technicalSourceFiles: STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS.technical
      .map(evidenceReference),
    semanticSourceFiles: STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS.semantic
      .map(evidenceReference),
    contractFiles: STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS.contract
      .map(evidenceReference),
    technicalDependencies: [dependency("sharp", "0.34.5"), dependency("zod", "4.4.3")],
    semanticDependencies: [dependency("zod", "4.4.3")],
  });
}

test("structural preflight proves garment invariants but keeps every visual claim indeterminate", () => {
  const operation = evaluatorFixtureOperation("GARMENT_01_FRONT");
  const first = evaluate(operation, evaluatorFixtureTransportConstituents(operation));
  const second = evaluate(operation, evaluatorFixtureTransportConstituents(operation));
  assert.equal(first.status, "INDETERMINATE");
  assert.equal(first.productionPass, false);
  assert.deepEqual(first.blockerCodes, []);
  assert.equal(first.checks.canonicalOperation.decision, "SATISFIED");
  assert.equal(first.checks.authorityLineage.decision, "SATISFIED");
  assert.equal(first.checks.stageView.decision, "SATISFIED");
  assert.equal(first.checks.parentLineage.decision, "SATISFIED");
  assert.equal(first.checks.transportConstituentBinding.decision, "SATISFIED");
  assert.equal(first.checks.g004ExactBindingDenial.decision, "SATISFIED");
  assert.equal(first.checks.g004LossyVisualDenial.decision, "INDETERMINATE");
  assert.equal(first.visualJudgments.IDENTITY_FIDELITY.decision, "NOT_APPLICABLE");
  assert.equal(first.visualJudgments.BODY_FIDELITY.decision, "NOT_APPLICABLE");
  for (const judgment of [
    "GARMENT_FIDELITY",
    "PHOTOGRAPHIC_REALISM",
    "GARMENT_TEXTURE",
    "OPTICS_PERSPECTIVE",
    "LIGHTING_INTEGRATION",
    "RENDERED_TEXT",
    "WATERMARK",
  ] as const) {
    assert.equal(first.visualJudgments[judgment].decision, "INDETERMINATE");
  }
  assert.deepEqual(first.orderedGateSequence, [
    { gate: "GARMENT", decision: "INDETERMINATE" },
    { gate: "FACE", decision: "NOT_APPLICABLE" },
    { gate: "BODY", decision: "NOT_APPLICABLE" },
    { gate: "ROOM", decision: "NOT_APPLICABLE" },
    { gate: "FINAL_INTEGRATION", decision: "NOT_EVALUATED" },
  ]);
  assert.equal(first.evaluationHash, second.evaluationHash);
});

test("right-rear structural proof cannot stand in for identity, body, room or visual rear fidelity", () => {
  const operation = evaluatorFixtureOperation("SIBLING_07_CORE");
  const evidence = evaluate(operation, evaluatorFixtureTransportConstituents(operation));
  assert.equal(evidence.status, "INDETERMINATE");
  assert.equal(evidence.checks.parentLineage.decision, "SATISFIED");
  assert.equal(evidence.checks.inferredRearQuarantine.decision, "SATISFIED");
  assert.equal(evidence.visualJudgments.IDENTITY_FIDELITY.decision, "INDETERMINATE");
  assert.equal(evidence.visualJudgments.BODY_FIDELITY.decision, "INDETERMINATE");
  assert.equal(evidence.visualJudgments.GARMENT_FIDELITY.decision, "INDETERMINATE");
  assert.equal(evidence.visualJudgments.ROOM_AND_BRAND_FIDELITY.decision, "INDETERMINATE");
  assert.deepEqual(evidence.orderedGateSequence.slice(0, 3), [
    { gate: "GARMENT", decision: "INDETERMINATE" },
    { gate: "FACE", decision: "NOT_EVALUATED" },
    { gate: "BODY", decision: "NOT_EVALUATED" },
  ]);
});

test("stage/view/output-target tampering blocks before visual evaluation", () => {
  const operation = clone(evaluatorFixtureOperation("GARMENT_01_FRONT")) as unknown as {
    view: string;
    outputContract: { targetView: string };
  };
  operation.view = "07";
  operation.outputContract.targetView = "07";
  const evidence = evaluate(operation, []);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.productionPass, false);
  assert.equal(evidence.checks.canonicalOperation.decision, "BLOCKED");
  assert.equal(evidence.checks.stageView.decision, "BLOCKED");
  assert.equal(evidence.orderedGateSequence[0]?.decision, "BLOCKED");
  assert.equal(evidence.orderedGateSequence[1]?.decision, "NOT_EVALUATED");
});

test("rejected or lineage-mismatched parent blocks structural semantic preflight", () => {
  const operation = clone(evaluatorFixtureOperation("ROOM_FINAL_05")) as unknown as {
    parentLocks: Array<{ reviewState: string; garmentId: string }>;
  };
  operation.parentLocks[0]!.reviewState = "REJECTED";
  operation.parentLocks[0]!.garmentId = "other-garment";
  const evidence = evaluate(operation, []);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.parentLineage.decision, "BLOCKED");
  assert.ok(evidence.blockerCodes.includes("PARENT_LINEAGE_INVALID"));
});

test("right-rear inference cannot be promoted to direct evidence", () => {
  const operation = clone(evaluatorFixtureOperation("SIBLING_07_CORE")) as unknown as {
    rearInference: { mayBecomeDirectEvidence: boolean };
  };
  operation.rearInference.mayBecomeDirectEvidence = true;
  const evidence = evaluate(operation, []);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.inferredRearQuarantine.decision, "BLOCKED");
  assert.ok(evidence.blockerCodes.includes("INFERRED_REAR_QUARANTINE_INVALID"));
});

test("exact decoded G004 evaluator pixels are denied even under an otherwise valid binding", () => {
  const operation = evaluatorFixtureOperation("GARMENT_01_FRONT");
  const constituents = evaluatorFixtureTransportConstituents(operation);
  const first = constituents[0]!;
  const tainted = Object.freeze([
    Object.freeze({
      ...first,
      decodedPixelSha256: STUDIO_ATELIER_G004_PROVIDER_DENIED_PIXEL_SHA256[0]!,
    }),
    ...constituents.slice(1),
  ]);
  const evidence = evaluate(operation, tainted);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.transportConstituentBinding.decision, "SATISFIED");
  assert.equal(evidence.checks.g004ExactBindingDenial.decision, "BLOCKED");
  assert.ok(evidence.blockerCodes.includes(
    "G004_EVALUATOR_ONLY_BYTES_DENIED_FROM_OPERATION_OR_TRANSPORT",
  ));
});

test("missing pixel hash, duplicate or unknown transport bindings fail closed", () => {
  const operation = evaluatorFixtureOperation("GARMENT_01_FRONT");
  const constituents = evaluatorFixtureTransportConstituents(operation);
  const invalid = Object.freeze([
    { ...constituents[0]!, decodedPixelSha256: "missing" },
    constituents[0]!,
    {
      assetId: "unknown/private-authority",
      sha256: evaluatorFixtureDigest("unknown"),
      decodedPixelSha256: evaluatorFixtureDigest("unknown pixels"),
    },
  ]);
  const evidence = evaluate(operation, invalid);
  assert.equal(evidence.status, "BLOCKED");
  assert.equal(evidence.checks.transportConstituentBinding.decision, "BLOCKED");
  assert.equal(evidence.productionPass, false);
});

test("invalid timestamp or artifact hash is a categorical blocker", () => {
  const operation = evaluatorFixtureOperation("GARMENT_01_FRONT");
  const evidence = evaluate(
    operation,
    evaluatorFixtureTransportConstituents(operation),
    { evaluatedAt: "2026-08-27", artifactSha256: "not-a-hash" },
  );
  assert.equal(evidence.status, "BLOCKED");
  assert.deepEqual(evidence.blockerCodes.slice(0, 2), [
    "ARTIFACT_SHA256_INVALID",
    "EVALUATED_AT_INVALID",
  ]);
});

test("release bindings hash exact implementation and dependencies but remain unqualified", () => {
  const input = releaseBindingsInput();
  const bindings = bindStudioAtelierRelease2Implementations(input);
  assert.equal(bindings.status, "UNQUALIFIED_IMPLEMENTATION_ONLY");
  assert.equal(bindings.productionInstallable, false);
  assert.ok(bindings.missingQualification.includes("SIX_CASE_REAL_EVIDENCE_PACKET"));
  assert.ok(bindings.missingQualification.includes(
    "PRIVACY_APPROVED_VERSION_LOCKED_VISUAL_EVALUATOR",
  ));
  assert.deepEqual(bindings.technical.visualModels, []);
  assert.deepEqual(bindings.semantic.visualModels, []);
  assert.equal(
    bindings.technical.implementationDigestSha256,
    deriveStudioAtelierEvaluatorImplementationDigest(bindings.technical),
  );
  assert.equal(
    bindings.technical.dependencySetDigestSha256,
    deriveStudioAtelierEvaluatorDependencyDigest(bindings.technical),
  );
  assert.equal(
    bindings.semantic.modelSetDigestSha256,
    deriveStudioAtelierEvaluatorModelDigest(bindings.semantic),
  );
  assert.equal(
    bindings.semantic.evaluationContractDigestSha256,
    deriveStudioAtelierEvaluationContractDigest(bindings.semantic),
  );
  assert.equal(
    studioAtelierEvaluatorBindingsSchema.safeParse([
      bindings.technical,
      bindings.semantic,
    ]).success,
    false,
    "an unbound semantic visual evaluator must never satisfy the production binding schema",
  );
  assert.equal(resolveStudioAtelierQualifiedEvaluatorBundle(), null);
});

test("release binding rejects path order, dependency version and source digest tampering", () => {
  const input = releaseBindingsInput();
  assert.throws(() => bindStudioAtelierRelease2Implementations({
    ...input,
    technicalSourceFiles: [...input.technicalSourceFiles].reverse(),
  }), /exact ordered implementation/);
  assert.throws(() => bindStudioAtelierRelease2Implementations({
    ...input,
    semanticDependencies: [{ ...input.semanticDependencies[0]!, version: "4.4.2" }],
  }), /exact ordered implementation/);

  const original = bindStudioAtelierRelease2Implementations(input);
  const changedInput = {
    ...input,
    technicalSourceFiles: input.technicalSourceFiles.map((reference, index) =>
      index === 0
        ? { ...reference, sha256: evaluatorFixtureDigest("tampered implementation") }
        : reference
    ),
  };
  const changed = bindStudioAtelierRelease2Implementations(changedInput);
  assert.notEqual(
    changed.technical.implementationDigestSha256,
    original.technical.implementationDigestSha256,
  );
  assert.equal(changed.productionInstallable, false);
});
