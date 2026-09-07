import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { access, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import test from "node:test";
import {
  STUDIO_ATELIER_QUALIFICATION_ASSEMBLER_PATH,
  STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_INPUT_SCHEMA_VERSION,
  STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_REPORT_SCHEMA_VERSION,
  assembleStudioAtelierQualificationEvidence,
} from "../scripts/virtual-atelier/assemble-qualification-evidence.mts";
import { canonicalStringify } from "../lib/studio/atelier/canonical";
import {
  STUDIO_ATELIER_QUALIFICATION_CASE_SPECS,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  STUDIO_ATELIER_ROOM_STAGE_MATRIX,
} from "../lib/studio/atelier/qualification-contracts";

const RECORDED_AT = "2026-09-04T18:00:00.000Z";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeSource(root: string, relativePath: string, bytes: Buffer): Promise<void> {
  const path = join(root, ...relativePath.split("/"));
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, bytes);
}

function minimalManifest(source: Readonly<{
  sourcePath: string;
  destinationPath: string;
  bytes: Buffer;
  expectedSourceSha256?: string;
}>) {
  const firstCase = STUDIO_ATELIER_QUALIFICATION_CASE_SPECS[0];
  return {
    schemaVersion: STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_INPUT_SCHEMA_VERSION,
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    packetRevision: "assembler-test-draft.1",
    createdAt: RECORDED_AT,
    sources: [{
      sourcePath: source.sourcePath,
      destinationPath: source.destinationPath,
      expectedSourceSha256: source.expectedSourceSha256 ?? sha256(source.bytes),
      expectedSourceByteSize: source.bytes.byteLength,
      mediaType: "application/json",
    }],
    cases: [{
      caseId: firstCase.caseId,
      evidenceRevision: "retained-test-evidence.1",
      recordedAt: RECORDED_AT,
      provenance: "RETAINED_OPERATION",
      artifacts: [{
        artifactId: "RETAINED_CASE_EVIDENCE",
        role: "OTHER_SUPPORTING_EVIDENCE",
        evidencePath: source.destinationPath,
      }],
      assertions: firstCase.requiredAssertionIds.map((assertionId, index) => ({
        assertionId,
        result: index === 0 ? "SATISFIED" : "INDETERMINATE",
        evidenceArtifactIds: ["RETAINED_CASE_EVIDENCE"],
      })),
    }],
    roomStageEvidence: [],
    evaluators: [],
  };
}

async function withFixture(
  run: (fixture: Readonly<{
    root: string;
    sourceRoot: string;
    outputRoot: string;
    manifestPath: string;
  }>) => Promise<void>,
): Promise<void> {
  const root = await mkdtemp(join(tmpdir(), "juw-qualification-assembler-"));
  const sourceRoot = join(root, "source");
  const outputRoot = join(root, "output");
  const manifestPath = join(sourceRoot, "assembly-input.json");
  await mkdir(sourceRoot, { recursive: true });
  try {
    await run({ root, sourceRoot, outputRoot, manifestPath });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("assembler canonicalizes exact JSON but remains a truthful blocked draft", async () => {
  await withFixture(async ({ root, sourceRoot, outputRoot, manifestPath }) => {
    const sourcePath = "retained/G004/receipt.json";
    const destinationPath = "cases/004/receipt.json";
    const sourceBytes = Buffer.from('{"z":2, "a":{"result":"INDETERMINATE"}}', "utf8");
    await writeSource(sourceRoot, sourcePath, sourceBytes);
    await writeFile(
      manifestPath,
      JSON.stringify(minimalManifest({ sourcePath, destinationPath, bytes: sourceBytes })),
    );

    const report = await assembleStudioAtelierQualificationEvidence({
      repositoryRoot: root,
      sourceRoot,
      manifestPath,
      outputRoot,
      allowOutputOutsidePrivateStagingForTests: true,
    });

    assert.equal(report.schemaVersion, STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_REPORT_SCHEMA_VERSION);
    assert.equal(report.packetState, "DRAFT");
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.providerCallsMade, 0);
    assert.equal(report.productionQualificationInstalled, false);
    assert.deepEqual(
      report.expected.caseIds,
      STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((item) => item.caseId),
    );
    assert.deepEqual(report.expected.roomStageCells, STUDIO_ATELIER_ROOM_STAGE_MATRIX);
    assert.equal(report.assembled.copiedEvidenceFiles, 1);
    assert.equal(report.assembled.qualificationPacket, null);
    assert.equal(report.assembled.reviewRequest, null);
    assert.ok(report.blockers.some((item) => item.code === "ROOM_STAGE_SET_INCOMPLETE"));
    assert.ok(report.blockers.some((item) => item.code === "EVALUATOR_SET_INCOMPLETE"));
    assert.ok(report.blockers.some((item) => item.code === "REVIEW_RECEIPT_MISSING"));
    assert.ok(report.blockers.some((item) => item.code === "TRUST_POLICY_MISSING"));
    assert.ok(report.blockers.some((item) => item.code === "ASSERTION_SATISFACTION_UNVERIFIED"));

    const copiedText = await readFile(join(outputRoot, destinationPath), "utf8");
    const expectedCanonical = `${canonicalStringify(JSON.parse(sourceBytes.toString("utf8")))}\n`;
    assert.equal(copiedText, expectedCanonical);
    const copiedEntry = report.copiedFiles[0];
    assert.equal(copiedEntry.sourceSha256, sha256(sourceBytes));
    assert.equal(copiedEntry.sourceByteSize, sourceBytes.byteLength);
    assert.equal(copiedEntry.outputSha256, sha256(Buffer.from(expectedCanonical)));
    assert.equal(copiedEntry.outputByteSize, Buffer.byteLength(expectedCanonical));
    assert.equal(copiedEntry.canonicalizedJson, true);

    const draftPath = join(outputRoot, "qualification-evidence.draft.json");
    const draftText = await readFile(draftPath, "utf8");
    assert.equal(draftText, `${canonicalStringify(JSON.parse(draftText))}\n`);
    const draft = JSON.parse(draftText) as {
      cases: Array<{ assertions: Array<{ assertionId: string; result: string }> }>;
    };
    assert.equal(draft.cases[0]?.assertions[0]?.result, "INDETERMINATE");
    await assert.rejects(access(join(outputRoot, "qualification-evidence.json")));
  });
});

test("assembler refuses a source hash mismatch without copying substituted bytes", async () => {
  await withFixture(async ({ root, sourceRoot, outputRoot, manifestPath }) => {
    const sourcePath = "retained/G004/receipt.json";
    const destinationPath = "cases/004/receipt.json";
    const sourceBytes = Buffer.from('{"result":"INDETERMINATE"}', "utf8");
    await writeSource(sourceRoot, sourcePath, sourceBytes);
    const manifest = minimalManifest({
      sourcePath,
      destinationPath,
      bytes: sourceBytes,
      expectedSourceSha256: "f".repeat(64),
    });
    await writeFile(manifestPath, JSON.stringify(manifest));

    const report = await assembleStudioAtelierQualificationEvidence({
      repositoryRoot: root,
      sourceRoot,
      manifestPath,
      outputRoot,
      allowOutputOutsidePrivateStagingForTests: true,
    });

    assert.equal(report.status, "BLOCKED");
    assert.equal(report.assembled.copiedEvidenceFiles, 0);
    assert.ok(report.blockers.some((item) => item.code === "SOURCE_HASH_MISMATCH"));
    await assert.rejects(access(join(outputRoot, destinationPath)));
    await assert.rejects(access(join(outputRoot, "qualification-evidence.json")));
  });
});

test("self-authored JSON and matching actor pointers never establish an assertion", async () => {
  await withFixture(async ({ root, sourceRoot, outputRoot, manifestPath }) => {
    const sourcePath = "claimed/receipt.json";
    const destinationPath = "cases/004/receipt.json";
    const bytes = Buffer.from(JSON.stringify({ result: "SATISFIED", actorId: "test:human" }));
    await writeSource(sourceRoot, sourcePath, bytes);
    const manifest = minimalManifest({ sourcePath, destinationPath, bytes });
    const claimed = {
      ...manifest,
      cases: manifest.cases.map((item) => ({
        ...item,
        assertions: item.assertions.map((assertion) => ({
          ...assertion,
          result: "SATISFIED",
          satisfiedBy: {
            kind: "MACHINE_VERIFIABLE_JSON",
            evidencePath: destinationPath,
            resultJsonPointer: "/result",
            actorIdJsonPointer: "/actorId",
            expectedActorId: "test:human",
          },
        })),
      })),
    };
    await writeFile(manifestPath, JSON.stringify(claimed));
    const report = await assembleStudioAtelierQualificationEvidence({
      repositoryRoot: root, sourceRoot, outputRoot, manifestPath,
      allowOutputOutsidePrivateStagingForTests: true,
    });
    assert.equal(report.status, "BLOCKED");
    assert.equal(report.assembled.copiedEvidenceFiles, 1);
    assert.equal(report.assembled.reviewRequest, null);
    assert.equal(report.assembled.qualificationPacket, null);
    assert.ok(report.blockers.some((item) => item.code === "DRAFT_REQUIRES_ASSERTION_VERIFIERS"));
    const draft = JSON.parse(await readFile(join(outputRoot, "qualification-evidence.draft.json"), "utf8"));
    assert.ok(draft.cases[0].assertions.every((item: { result: string }) => item.result === "INDETERMINATE"));
    await assert.rejects(access(join(outputRoot, "review-request.json")));
    await assert.rejects(access(join(outputRoot, "qualification-evidence.json")));
  });
});

test("CLI output cannot escape the private gitignored staging root", async () => {
  await withFixture(async ({ root, sourceRoot, outputRoot, manifestPath }) => {
    const manifest = {
      schemaVersion: STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_INPUT_SCHEMA_VERSION,
      suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
      packetRevision: "assembler-output-boundary-test.1",
      createdAt: RECORDED_AT,
      sources: [],
      cases: [],
      roomStageEvidence: [],
      evaluators: [],
    };
    await writeFile(manifestPath, JSON.stringify(manifest));

    const report = await assembleStudioAtelierQualificationEvidence({
      repositoryRoot: root,
      sourceRoot,
      manifestPath,
      outputRoot,
    });

    assert.equal(report.status, "BLOCKED");
    assert.deepEqual(report.blockers.map((item) => item.code), [
      "OUTPUT_ROOT_NOT_PRIVATE_STAGING",
    ]);
    await assert.rejects(access(outputRoot));
  });
});

test("assembler source contains no provider dispatch primitive", async () => {
  const source = await readFile(STUDIO_ATELIER_QUALIFICATION_ASSEMBLER_PATH, "utf8");
  assert.doesNotMatch(source, /\bgenerateImage\b|\bgenerateText\b|\bstreamText\b|\bfetch\s*\(/);
  assert.doesNotMatch(source, /from\s+["']ai["']|@ai-sdk/);
  assert.match(source, /providerCallsMade:\s*0/);
  assert.match(source, /never converts an unverified assertion into SATISFIED/);
});
