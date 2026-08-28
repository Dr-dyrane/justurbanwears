import assert from "node:assert/strict";
import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from "node:crypto";
import {
  mkdir,
  mkdtemp,
  readFile,
  rm,
  unlink,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import test from "node:test";
import { canonicalStringify } from "../lib/studio/atelier/canonical";
import {
  STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION,
  STUDIO_ATELIER_INDEPENDENCE_STATEMENT,
  STUDIO_ATELIER_INDEPENDENT_REVIEW_SCHEMA_VERSION,
  STUDIO_ATELIER_QUALIFICATION_CASE_SPECS,
  STUDIO_ATELIER_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
  STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES,
  STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  STUDIO_ATELIER_REVIEWER_TRUST_POLICY_SCHEMA_VERSION,
  STUDIO_ATELIER_REVIEW_SIGNATURE_CONVENTION,
  STUDIO_ATELIER_ROOM_ASSERTION_IDS,
  STUDIO_ATELIER_ROOM_STAGE_MATRIX,
  deriveStudioAtelierCaseEvidenceDigest,
  deriveStudioAtelierEvaluationContractDigest,
  deriveStudioAtelierEvaluatorDependencyDigest,
  deriveStudioAtelierEvaluatorImplementationDigest,
  deriveStudioAtelierEvaluatorModelDigest,
  deriveStudioAtelierIndependentReviewContentSha256,
  deriveStudioAtelierQualificationEvidenceContentSha256,
  deriveStudioAtelierReviewerTrustPolicyContentSha256,
  deriveStudioAtelierRoomStageEvidenceDigest,
  studioAtelierIndependentReviewReceiptSchema,
  studioAtelierIndependentReviewSignaturePayload,
  studioAtelierQualificationEvidencePacketSchema,
  studioAtelierReviewerTrustPolicySchema,
  type StudioAtelierEvidenceFileReference,
  type StudioAtelierIndependentReviewReceipt,
  type StudioAtelierQualificationEvidencePacket,
  type StudioAtelierReviewerTrustPolicy,
} from "../lib/studio/atelier/qualification-contracts";
import {
  inspectStudioAtelierQualificationEvidence,
  type StudioAtelierQualificationBlockerCategory,
} from "../lib/server/studio-atelier-qualification-evidence";
import {
  STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES as RUNTIME_NATIVE_ROOM_QUALIFICATION_STAGES,
  STUDIO_ATELIER_QUALIFICATION_CASE_IDS as RUNTIME_QUALIFICATION_CASE_IDS,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION as RUNTIME_QUALIFICATION_SUITE_VERSION,
  resolveStudioAtelierQualifiedEvaluatorBundle,
} from "../lib/server/studio-atelier-qualified-evaluator";
import {
  STUDIO_GPT_IMAGE_2_ADAPTER,
  STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_MODEL,
  STUDIO_GPT_IMAGE_2_POLICY_REVISION,
} from "../lib/ai/studio-image-policy";
import {
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE,
  STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
} from "../lib/ai/studio-gpt-image-2-subject-layer";
import {
  STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
  STUDIO_ATELIER_SUPPORTED_ROOM_CANVAS_PROFILES,
} from "../lib/studio/atelier/canvas-policy";
import { STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION } from "../lib/server/studio-atelier-subject-compositor";

const RECORDED_AT = "2026-08-27T12:00:00.000Z";
const REVIEWED_AT = "2026-08-27T13:00:00.000Z";
const REPOSITORY_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

type SyntheticFixture = Readonly<{
  root: string;
  packetPath: string;
  policyPath: string;
  reviewPath: string;
  packet: StudioAtelierQualificationEvidencePacket;
  policy: StudioAtelierReviewerTrustPolicy;
  privateKey: KeyObject;
}>;

function sha256Bytes(value: Uint8Array | string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function writeCanonicalJson(filePath: string, value: unknown): Promise<void> {
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, `${canonicalStringify(value)}\n`, "utf8");
}

async function writeEvidenceFile(
  root: string,
  relativePath: string,
  value: Uint8Array | string,
  mediaType = "application/json",
): Promise<StudioAtelierEvidenceFileReference> {
  const bytes = typeof value === "string" ? Buffer.from(value, "utf8") : Buffer.from(value);
  const filePath = join(root, ...relativePath.split("/"));
  await mkdir(dirname(filePath), { recursive: true });
  await writeFile(filePath, bytes);
  return {
    relativePath,
    sha256: sha256Bytes(bytes),
    byteSize: bytes.byteLength,
    mediaType,
  };
}

function profileFor(profileId: typeof STUDIO_ATELIER_ROOM_STAGE_MATRIX[number]["profileId"]) {
  const profile = STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES.find(
    (item) => item.profileId === profileId,
  );
  assert.ok(profile);
  return profile;
}

async function makeEvaluatorBinding(
  root: string,
  kind: "TECHNICAL" | "SEMANTIC",
) {
  const lowerKind = kind.toLowerCase();
  const source = await writeEvidenceFile(
    root,
    `evaluators/${lowerKind}/evaluator.ts`,
    `export const syntheticTestOnly${kind}Evaluator = true;\n`,
    "text/typescript",
  );
  const dependency = await writeEvidenceFile(
    root,
    `evaluators/${lowerKind}/dependency-lock.json`,
    `${canonicalStringify({ package: `${lowerKind}-test-dependency`, version: "1.0.0" })}\n`,
  );
  const contract = await writeEvidenceFile(
    root,
    `evaluators/${lowerKind}/contract.json`,
    `${canonicalStringify({ contract: `${lowerKind}-test-contract`, revision: "1" })}\n`,
  );
  const visualModelAttestation = kind === "SEMANTIC"
    ? await writeEvidenceFile(
      root,
      "evaluators/semantic/model-attestation.json",
      `${canonicalStringify({ model: "synthetic-test-visual-evaluator", revision: "1" })}\n`,
    )
    : null;

  const binding = {
    schemaVersion: STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION,
    evaluatorKind: kind,
    evaluatorId: `juw.test.${lowerKind}-evaluator`,
    evaluatorVersion: "synthetic-test-only.1",
    policyRevision: "synthetic-test-policy.1",
    qualificationSuiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    entryPointExport: `evaluators/${lowerKind}/evaluator.ts#syntheticTestOnly${kind}Evaluator`,
    sourceFiles: [source],
    implementationDigestSha256: sha256Bytes(`${kind}:pending-implementation-digest`),
    dependencies: [{
      packageName: `${lowerKind}-test-dependency`,
      version: "1.0.0",
      integritySha256: sha256Bytes(`${kind}:synthetic-dependency-integrity`),
      evidenceFile: dependency,
    }],
    dependencySetDigestSha256: sha256Bytes(`${kind}:pending-dependency-digest`),
    visualModels: visualModelAttestation ? [{
      provider: "synthetic-test-provider",
      modelId: "synthetic/test-visual-evaluator",
      modelVersion: "1.0.0",
      policyRevision: "synthetic-test-model-policy.1",
      modelDigestSha256: sha256Bytes("synthetic-test-model-bytes-not-a-production-model"),
      attestationFile: visualModelAttestation,
    }] : [],
    modelSetDigestSha256: sha256Bytes(`${kind}:pending-model-digest`),
    contractFiles: [contract],
    evaluationContractDigestSha256: sha256Bytes(`${kind}:pending-contract-digest`),
  };
  binding.implementationDigestSha256 = deriveStudioAtelierEvaluatorImplementationDigest(binding);
  binding.dependencySetDigestSha256 = deriveStudioAtelierEvaluatorDependencyDigest(binding);
  binding.modelSetDigestSha256 = deriveStudioAtelierEvaluatorModelDigest(binding);
  binding.evaluationContractDigestSha256 = deriveStudioAtelierEvaluationContractDigest(binding);
  return binding;
}

async function makeSyntheticFixture(): Promise<SyntheticFixture> {
  const root = await mkdtemp(join(tmpdir(), "juw-qualification-readiness-"));
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");

  const cases = [];
  for (const [caseIndex, spec] of STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.entries()) {
    const artifactId = `CASE_EVIDENCE_${caseIndex + 1}`;
    const evidence = await writeEvidenceFile(
      root,
      `cases/${spec.garmentId}/evidence.json`,
      `${canonicalStringify({
        notice: "SYNTHETIC_VERIFIER_TEST_ONLY_NOT_QUALIFICATION_EVIDENCE",
        caseId: spec.caseId,
      })}\n`,
    );
    cases.push({
      caseId: spec.caseId,
      garmentId: spec.garmentId,
      calibrationKind: spec.calibrationKind,
      evidenceRevision: `synthetic-verifier-test-${spec.garmentId}.1`,
      recordedAt: RECORDED_AT,
      provenance: "CONTROLLED_QUALIFICATION_RUN",
      artifacts: [{
        artifactId,
        role: "OTHER_SUPPORTING_EVIDENCE",
        file: evidence,
      }],
      assertions: spec.requiredAssertionIds.map((assertionId) => ({
        assertionId,
        result: "SATISFIED",
        evidenceArtifactIds: [artifactId],
      })),
    });
  }

  const roomStageEvidence = [];
  for (const [cellIndex, matrixCell] of STUDIO_ATELIER_ROOM_STAGE_MATRIX.entries()) {
    const profile = profileFor(matrixCell.profileId);
    const cellName = `${String(cellIndex + 1).padStart(2, "0")}-${matrixCell.stage.toLowerCase()}`;
    const files = {
      roomAuthority: await writeEvidenceFile(
        root,
        `room-matrix/${cellName}/room.png`,
        `synthetic-room-${cellName}`,
        "image/png",
      ),
      transparentSubject: await writeEvidenceFile(
        root,
        `room-matrix/${cellName}/subject.png`,
        `synthetic-transparent-subject-${cellName}`,
        "image/png",
      ),
      finalComposite: await writeEvidenceFile(
        root,
        `room-matrix/${cellName}/composite.png`,
        `synthetic-composite-${cellName}`,
        "image/png",
      ),
      technicalEvaluation: await writeEvidenceFile(
        root,
        `room-matrix/${cellName}/technical.json`,
        `${canonicalStringify({ result: "synthetic-technical-evidence", cellName })}\n`,
      ),
      semanticEvaluation: await writeEvidenceFile(
        root,
        `room-matrix/${cellName}/semantic.json`,
        `${canonicalStringify({ result: "synthetic-semantic-evidence", cellName })}\n`,
      ),
    };
    roomStageEvidence.push({
      profileId: matrixCell.profileId,
      stage: matrixCell.stage,
      roomCanvas: profile.roomCanvas,
      subjectWindow: profile.subjectWindow,
      transparentGuardPixels: profile.transparentGuardPixels,
      evidenceRevision: `synthetic-room-cell-${cellIndex + 1}.1`,
      recordedAt: RECORDED_AT,
      files,
      assertions: STUDIO_ATELIER_ROOM_ASSERTION_IDS.map((assertionId) => ({
        assertionId,
        result: "SATISFIED",
      })),
    });
  }

  const evaluators = [
    await makeEvaluatorBinding(root, "TECHNICAL"),
    await makeEvaluatorBinding(root, "SEMANTIC"),
  ];
  const provisionalReview = Buffer.from("synthetic test review is not yet bound", "utf8");
  const packetDraft = {
    schemaVersion: STUDIO_ATELIER_QUALIFICATION_EVIDENCE_SCHEMA_VERSION,
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    packetRevision: "synthetic-verifier-test-packet.1",
    createdAt: RECORDED_AT,
    adapterBinding: {
      baseAdapterId: "vercel-ai-gateway/openai-gpt-image-2",
      baseAdapterVersion: "atelier-gpt-image-2-v2",
      transparentSubjectAdapterId:
        "vercel-ai-gateway/openai-gpt-image-2/transparent-subject",
      transparentSubjectAdapterVersion: "atelier-gpt-image-2-transparent-subject-v1",
      provider: "openai",
      model: "openai/gpt-image-2",
      policyRevision: "2026-08-26.3",
      transparentSubjectProfileId: "atelier-transparent-subject-png-v1",
      transparentSubjectProfileRevision: "2026-08-27.1",
      providerCanvas: { width: 1024, height: 1536 },
      roomCanvasPolicyRevision: "juw.atelier-native-room-canvas.v1",
      compositorRevision: "sharp-native-room-window-v2",
    },
    actors: {
      evidenceAuthors: [{ actorId: "test:evidence-author", identityType: "HUMAN" }],
      qualificationOperators: [{ actorId: "test:qualification-operator", identityType: "HUMAN" }],
    },
    cases,
    roomStageEvidence,
    evaluators,
    evidenceContentSha256: sha256Bytes("synthetic packet content not yet derived"),
    independentReviewReceipt: {
      relativePath: "review/independent-review.json",
      sha256: sha256Bytes(provisionalReview),
      byteSize: provisionalReview.byteLength,
      mediaType: "application/json",
    },
  } as unknown as StudioAtelierQualificationEvidencePacket;
  packetDraft.evidenceContentSha256 =
    deriveStudioAtelierQualificationEvidenceContentSha256(packetDraft);

  const reviewDraft = {
    schemaVersion: STUDIO_ATELIER_INDEPENDENT_REVIEW_SCHEMA_VERSION,
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    reviewId: "synthetic-verifier-test-review.1",
    reviewer: {
      identityType: "HUMAN",
      reviewerId: "test:independent-human-reviewer",
      keyId: "test:reviewer-key.1",
    },
    reviewedAt: REVIEWED_AT,
    evidenceContentSha256: packetDraft.evidenceContentSha256,
    reviewedCases: packetDraft.cases.map((item) => ({
      caseId: item.caseId,
      evidenceDigestSha256: deriveStudioAtelierCaseEvidenceDigest(item),
    })),
    reviewedRoomStageEvidence: packetDraft.roomStageEvidence.map((item) => ({
      profileId: item.profileId,
      stage: item.stage,
      evidenceDigestSha256: deriveStudioAtelierRoomStageEvidenceDigest(item),
    })),
    reviewedEvaluators: packetDraft.evaluators.map((item) => ({
      evaluatorKind: item.evaluatorKind,
      implementationDigestSha256: item.implementationDigestSha256,
      dependencySetDigestSha256: item.dependencySetDigestSha256,
      modelSetDigestSha256: item.modelSetDigestSha256,
      evaluationContractDigestSha256: item.evaluationContractDigestSha256,
    })),
    independenceAttestation: {
      statement: STUDIO_ATELIER_INDEPENDENCE_STATEMENT,
      reviewerWasNotEvidenceAuthor: true,
      reviewerDidNotOperateQualificationProvider: true,
      conflictsOfInterest: [],
    },
    conclusion: "EVIDENCE_SUFFICIENT_FOR_INSTALLATION_REVIEW",
    reviewContentSha256: sha256Bytes("synthetic review content not yet derived"),
    signature: {
      algorithm: "Ed25519",
      signedPayloadConvention: STUDIO_ATELIER_REVIEW_SIGNATURE_CONVENTION,
      valueBase64: sign(null, Buffer.from("synthetic provisional signature"), privateKey)
        .toString("base64"),
    },
  } as unknown as StudioAtelierIndependentReviewReceipt;
  reviewDraft.reviewContentSha256 =
    deriveStudioAtelierIndependentReviewContentSha256(reviewDraft);
  reviewDraft.signature.valueBase64 = sign(
    null,
    Buffer.from(
      studioAtelierIndependentReviewSignaturePayload(reviewDraft.reviewContentSha256),
      "utf8",
    ),
    privateKey,
  ).toString("base64");
  const review = studioAtelierIndependentReviewReceiptSchema.parse(reviewDraft);
  const reviewPath = join(root, "review", "independent-review.json");
  await writeCanonicalJson(reviewPath, review);
  const reviewBytes = await readFile(reviewPath);
  packetDraft.independentReviewReceipt = {
    relativePath: "review/independent-review.json",
    sha256: sha256Bytes(reviewBytes),
    byteSize: reviewBytes.byteLength,
    mediaType: "application/json",
  };
  const packet = studioAtelierQualificationEvidencePacketSchema.parse(packetDraft);
  const packetPath = join(root, "qualification-evidence.json");
  await writeCanonicalJson(packetPath, packet);

  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  const policyDraft = {
    schemaVersion: STUDIO_ATELIER_REVIEWER_TRUST_POLICY_SCHEMA_VERSION,
    policyRevision: "synthetic-verifier-test-trust-policy.1",
    authorizedHumanReviewers: [{
      reviewerId: "test:independent-human-reviewer",
      displayName: "Synthetic verifier test reviewer",
      keyId: "test:reviewer-key.1",
      publicKeySpkiPem: publicKey.export({ type: "spki", format: "pem" }).toString(),
      publicKeySpkiSha256: sha256Bytes(publicKeyDer),
      authorizedSuiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
      validFrom: "2026-08-27T00:00:00.000Z",
      validUntil: "2026-08-28T00:00:00.000Z",
    }],
    policyContentSha256: sha256Bytes("synthetic trust policy content not yet derived"),
  } as unknown as StudioAtelierReviewerTrustPolicy;
  policyDraft.policyContentSha256 =
    deriveStudioAtelierReviewerTrustPolicyContentSha256(policyDraft);
  const policy = studioAtelierReviewerTrustPolicySchema.parse(policyDraft);
  const policyPath = join(root, "qualification-authority", "reviewers.json");
  await writeCanonicalJson(policyPath, policy);

  return { root, packetPath, policyPath, reviewPath, packet, policy, privateKey };
}

async function withSyntheticFixture(
  runFixture: (fixture: SyntheticFixture) => Promise<void>,
): Promise<void> {
  const fixture = await makeSyntheticFixture();
  try {
    await runFixture(fixture);
  } finally {
    await rm(fixture.root, { recursive: true, force: true });
  }
}

function blockerCategories(report: Awaited<ReturnType<
  typeof inspectStudioAtelierQualificationEvidence
>>): Set<StudioAtelierQualificationBlockerCategory> {
  return new Set(report.blockers.map((blocker) => blocker.category));
}

test("qualification evidence contract is pinned to the exact current runtime identities", () => {
  assert.equal(STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION, RUNTIME_QUALIFICATION_SUITE_VERSION);
  assert.deepEqual(
    STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((item) => item.caseId),
    RUNTIME_QUALIFICATION_CASE_IDS,
  );
  assert.deepEqual(
    STUDIO_ATELIER_NATIVE_ROOM_QUALIFICATION_STAGES,
    RUNTIME_NATIVE_ROOM_QUALIFICATION_STAGES,
  );
  assert.deepEqual(
    STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES,
    STUDIO_ATELIER_SUPPORTED_ROOM_CANVAS_PROFILES.map((profile) => ({
      profileId: profile.profileId,
      roomCanvas: profile.roomCanvas,
      subjectWindow: profile.subjectWindow,
      transparentGuardPixels: profile.transparentGuardPixels,
    })),
  );
  const adapterBinding = {
    baseAdapterId: STUDIO_GPT_IMAGE_2_ADAPTER,
    baseAdapterVersion: STUDIO_GPT_IMAGE_2_ADAPTER_VERSION,
    transparentSubjectAdapterId: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER,
    transparentSubjectAdapterVersion: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_ADAPTER_VERSION,
    provider: "openai",
    model: STUDIO_GPT_IMAGE_2_MODEL,
    policyRevision: STUDIO_GPT_IMAGE_2_POLICY_REVISION,
    transparentSubjectProfileId: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.profileId,
    transparentSubjectProfileRevision: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE_REVISION,
    providerCanvas: {
      width: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.width,
      height: STUDIO_GPT_IMAGE_2_TRANSPARENT_SUBJECT_PROFILE.height,
    },
    roomCanvasPolicyRevision: STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
    compositorRevision: STUDIO_ATELIER_SUBJECT_COMPOSITE_REVISION,
  };
  assert.deepEqual(adapterBinding, {
    baseAdapterId: "vercel-ai-gateway/openai-gpt-image-2",
    baseAdapterVersion: "atelier-gpt-image-2-v2",
    transparentSubjectAdapterId:
      "vercel-ai-gateway/openai-gpt-image-2/transparent-subject",
    transparentSubjectAdapterVersion: "atelier-gpt-image-2-transparent-subject-v1",
    provider: "openai",
    model: "openai/gpt-image-2",
    policyRevision: "2026-08-26.3",
    transparentSubjectProfileId: "atelier-transparent-subject-png-v1",
    transparentSubjectProfileRevision: "2026-08-27.1",
    providerCanvas: { width: 1024, height: 1536 },
    roomCanvasPolicyRevision: "juw.atelier-native-room-canvas.v1",
    compositorRevision: "sharp-native-room-window-v2",
  });
});

test("zero-spend qualification readiness is exposed with truthful operator guidance", async () => {
  const [packageSource, runbook, engineGuide, assetIndex] = await Promise.all([
    readFile(join(REPOSITORY_ROOT, "package.json"), "utf8"),
    readFile(join(REPOSITORY_ROOT, "docs/virtual-atelier/RUNBOOK.md"), "utf8"),
    readFile(join(REPOSITORY_ROOT, "docs/virtual-atelier/ENGINE-GUIDE.md"), "utf8"),
    readFile(join(REPOSITORY_ROOT, "docs/virtual-atelier/assets/current.json"), "utf8"),
  ]);
  const scripts = (JSON.parse(packageSource) as { scripts: Record<string, string> }).scripts;

  assert.equal(
    scripts["atelier:check:qualification"],
    "tsx scripts/virtual-atelier/check-qualification-readiness.mts",
  );
  assert.match(runbook, /npm run atelier:check:qualification -- --compact/);
  assert.match(engineGuide, /npm run atelier:check:qualification -- --compact/);
  assert.match(engineGuide, /Concrete server ports and route composition are implemented in this release/);
  assert.match(assetIndex, /native-room-profile-eligible-qualification-runtime-blocked/);
  assert.doesNotMatch(assetIndex, /room-canvas-gate-still-blocked/);
});

test("qualification evidence verifier remains non-installing after complete synthetic contract coverage", async () => {
  await withSyntheticFixture(async (fixture) => {
    const report = await inspectStudioAtelierQualificationEvidence({
      packetPath: fixture.packetPath,
      reviewerTrustPolicyPath: fixture.policyPath,
    });
    assert.equal(report.status, "EVIDENCE_COMPLETE_NOT_INSTALLED");
    assert.equal(report.productionQualificationInstalled, false);
    assert.equal(report.providerCallsMade, 0);
    assert.equal(report.blockers.length, 0);
    assert.equal(report.verified.caseRecords, 6);
    assert.equal(report.verified.roomStageRecords, 8);
    assert.equal(report.verified.evaluatorBindings, 2);
    assert.ok(report.verified.exactFileBindings > 0);
    assert.equal(resolveStudioAtelierQualifiedEvaluatorBundle(), null);
  });
});

test("qualification evidence verifier reports missing and tampered exact evidence", async (t) => {
  await t.test("missing case artifact", async () => {
    await withSyntheticFixture(async (fixture) => {
      const reference = fixture.packet.cases[0].artifacts[0].file;
      await unlink(join(fixture.root, ...reference.relativePath.split("/")));
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.equal(report.status, "BLOCKED");
      assert.ok(blockerCategories(report).has("EVIDENCE_FILE_MISSING"));
    });
  });

  await t.test("changed room composite bytes", async () => {
    await withSyntheticFixture(async (fixture) => {
      const reference = fixture.packet.roomStageEvidence[0].files.finalComposite;
      await writeFile(
        join(fixture.root, ...reference.relativePath.split("/")),
        "tampered synthetic composite",
      );
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      const categories = blockerCategories(report);
      assert.equal(report.status, "BLOCKED");
      assert.ok(categories.has("EVIDENCE_FILE_HASH_MISMATCH"));
      assert.ok(categories.has("EVIDENCE_FILE_SIZE_MISMATCH"));
    });
  });
});

test("qualification evidence verifier rejects case and room matrix reordering", async (t) => {
  await t.test("case order", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet) as unknown as {
        cases: unknown[];
      };
      [changed.cases[0], changed.cases[1]] = [changed.cases[1], changed.cases[0]];
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.ok(blockerCategories(report).has("CASE_ORDER_INVALID"));
      assert.ok(blockerCategories(report).has("PACKET_SCHEMA_INVALID"));
    });
  });

  await t.test("room profile/stage order", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet) as unknown as {
        roomStageEvidence: unknown[];
      };
      [changed.roomStageEvidence[0], changed.roomStageEvidence[1]] = [
        changed.roomStageEvidence[1],
        changed.roomStageEvidence[0],
      ];
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.ok(blockerCategories(report).has("ROOM_STAGE_ORDER_INVALID"));
      assert.ok(blockerCategories(report).has("PACKET_SCHEMA_INVALID"));
    });
  });
});

test("qualification evidence verifier rejects digest, reviewer, and signature substitution", async (t) => {
  await t.test("evaluator implementation binding", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet);
      changed.evaluators[0].entryPointExport = "evaluators/technical/evaluator.ts#substituted";
      changed.evidenceContentSha256 =
        deriveStudioAtelierQualificationEvidenceContentSha256(changed);
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      const categories = blockerCategories(report);
      assert.ok(categories.has("EVALUATOR_IMPLEMENTATION_DIGEST_MISMATCH"));
      assert.ok(categories.has("REVIEW_EVIDENCE_BINDING_MISMATCH"));
    });
  });

  await t.test("evaluator dependency binding", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet);
      changed.evaluators[0].dependencies[0].version = "2.0.0-substituted";
      changed.evidenceContentSha256 =
        deriveStudioAtelierQualificationEvidenceContentSha256(changed);
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.ok(blockerCategories(report).has("EVALUATOR_DEPENDENCY_DIGEST_MISMATCH"));
    });
  });

  await t.test("semantic visual-model binding", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet);
      const model = changed.evaluators[1].visualModels[0];
      assert.ok(model);
      model.modelVersion = "2.0.0-substituted";
      changed.evidenceContentSha256 =
        deriveStudioAtelierQualificationEvidenceContentSha256(changed);
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.ok(blockerCategories(report).has("EVALUATOR_MODEL_DIGEST_MISMATCH"));
    });
  });

  await t.test("evaluator contract binding", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet);
      changed.evaluators[0].contractFiles[0].sha256 =
        sha256Bytes("substituted evaluation contract");
      changed.evidenceContentSha256 =
        deriveStudioAtelierQualificationEvidenceContentSha256(changed);
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      const categories = blockerCategories(report);
      assert.ok(categories.has("EVALUATOR_CONTRACT_DIGEST_MISMATCH"));
      assert.ok(categories.has("EVIDENCE_FILE_HASH_MISMATCH"));
    });
  });

  await t.test("unauthorized reviewer key", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.policy);
      changed.authorizedHumanReviewers[0].reviewerId = "test:different-reviewer";
      changed.policyContentSha256 =
        deriveStudioAtelierReviewerTrustPolicyContentSha256(changed);
      await writeCanonicalJson(fixture.policyPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.ok(blockerCategories(report).has("REVIEWER_UNAUTHORIZED"));
    });
  });

  await t.test("reviewer is also an evidence author", async () => {
    await withSyntheticFixture(async (fixture) => {
      const changed = structuredClone(fixture.packet);
      changed.actors.evidenceAuthors[0].actorId = "test:independent-human-reviewer";
      changed.evidenceContentSha256 =
        deriveStudioAtelierQualificationEvidenceContentSha256(changed);
      await writeCanonicalJson(fixture.packetPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      assert.ok(blockerCategories(report).has("REVIEWER_NOT_INDEPENDENT"));
    });
  });

  await t.test("review signature", async () => {
    await withSyntheticFixture(async (fixture) => {
      const review = studioAtelierIndependentReviewReceiptSchema.parse(
        JSON.parse(await readFile(fixture.reviewPath, "utf8")) as unknown,
      );
      const changed = structuredClone(review);
      const signature = Buffer.from(changed.signature.valueBase64, "base64");
      signature[0] ^= 1;
      changed.signature.valueBase64 = signature.toString("base64");
      await writeCanonicalJson(fixture.reviewPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      const categories = blockerCategories(report);
      assert.ok(categories.has("EVIDENCE_FILE_HASH_MISMATCH"));
      assert.ok(categories.has("REVIEW_SIGNATURE_INVALID"));
    });
  });

  await t.test("signed review evidence binding", async () => {
    await withSyntheticFixture(async (fixture) => {
      const review = studioAtelierIndependentReviewReceiptSchema.parse(
        JSON.parse(await readFile(fixture.reviewPath, "utf8")) as unknown,
      );
      const changed = structuredClone(review);
      changed.evidenceContentSha256 = sha256Bytes("different exact evidence packet");
      changed.reviewContentSha256 = deriveStudioAtelierIndependentReviewContentSha256(changed);
      changed.signature.valueBase64 = sign(
        null,
        Buffer.from(
          studioAtelierIndependentReviewSignaturePayload(changed.reviewContentSha256),
          "utf8",
        ),
        fixture.privateKey,
      ).toString("base64");
      await writeCanonicalJson(fixture.reviewPath, changed);
      const report = await inspectStudioAtelierQualificationEvidence({
        packetPath: fixture.packetPath,
        reviewerTrustPolicyPath: fixture.policyPath,
      });
      const categories = blockerCategories(report);
      assert.ok(categories.has("EVIDENCE_FILE_HASH_MISMATCH"));
      assert.ok(categories.has("REVIEW_EVIDENCE_BINDING_MISMATCH"));
      assert.ok(!categories.has("REVIEW_SIGNATURE_INVALID"));
    });
  });
});

test("qualification evidence verifier cannot treat indeterminate assertions as complete", async () => {
  await withSyntheticFixture(async (fixture) => {
    const changed = structuredClone(fixture.packet);
    changed.cases[0].assertions[0].result = "INDETERMINATE";
    changed.evidenceContentSha256 =
      deriveStudioAtelierQualificationEvidenceContentSha256(changed);
    await writeCanonicalJson(fixture.packetPath, changed);
    const report = await inspectStudioAtelierQualificationEvidence({
      packetPath: fixture.packetPath,
      reviewerTrustPolicyPath: fixture.policyPath,
    });
    assert.equal(report.status, "BLOCKED");
    assert.ok(blockerCategories(report).has("CASE_ASSERTION_NOT_SATISFIED"));
  });
});

test("zero-spend readiness CLI reports categorical blockers without a packet", () => {
  const tsx = fileURLToPath(import.meta.resolve("tsx/cli"));
  const missingRoot = resolve(tmpdir(), `juw-qualification-missing-${process.pid}`);
  let output = "";
  try {
    output = execFileSync(process.execPath, [
      tsx,
      "scripts/virtual-atelier/check-qualification-readiness.mts",
      "--packet",
      join(missingRoot, "packet.json"),
      "--trust-policy",
      join(missingRoot, "reviewers.json"),
      "--compact",
    ], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    assert.fail("Blocked readiness CLI unexpectedly exited successfully.");
  } catch (error) {
    assert.ok(error && typeof error === "object" && "stdout" in error);
    output = String((error as { stdout: unknown }).stdout);
  }
  const report = JSON.parse(output) as {
    status: string;
    productionQualificationInstalled: boolean;
    providerCallsMade: number;
    blockers: Array<{ category: string }>;
  };
  assert.equal(report.status, "BLOCKED");
  assert.equal(report.productionQualificationInstalled, false);
  assert.equal(report.providerCallsMade, 0);
  assert.deepEqual(
    new Set(report.blockers.map((blocker) => blocker.category)),
    new Set(["PACKET_MISSING", "TRUST_POLICY_MISSING"]),
  );
});
