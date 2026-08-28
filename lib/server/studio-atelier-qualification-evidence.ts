import { createHash, createPublicKey, verify as verifySignature } from "node:crypto";
import { readFile, realpath } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve } from "node:path";
import { canonicalStringify } from "../studio/atelier/canonical";
import {
  STUDIO_ATELIER_QUALIFICATION_CASE_IDS,
  STUDIO_ATELIER_QUALIFICATION_READINESS_REPORT_SCHEMA_VERSION,
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
} from "../studio/atelier/qualification-contracts";

export const STUDIO_ATELIER_QUALIFICATION_BLOCKER_CATEGORIES = Object.freeze([
  "PACKET_MISSING",
  "PACKET_UNREADABLE",
  "PACKET_JSON_INVALID",
  "PACKET_JSON_NON_CANONICAL",
  "PACKET_SCHEMA_INVALID",
  "CASE_ORDER_INVALID",
  "ROOM_STAGE_ORDER_INVALID",
  "EVIDENCE_CONTENT_HASH_MISMATCH",
  "CASE_ASSERTION_NOT_SATISFIED",
  "ROOM_ASSERTION_NOT_SATISFIED",
  "EVIDENCE_PATH_OUTSIDE_PACKET_ROOT",
  "EVIDENCE_FILE_MISSING",
  "EVIDENCE_FILE_UNREADABLE",
  "EVIDENCE_FILE_SIZE_MISMATCH",
  "EVIDENCE_FILE_HASH_MISMATCH",
  "EVIDENCE_JSON_INVALID",
  "EVIDENCE_JSON_NON_CANONICAL",
  "EVALUATOR_IMPLEMENTATION_DIGEST_MISMATCH",
  "EVALUATOR_DEPENDENCY_DIGEST_MISMATCH",
  "EVALUATOR_MODEL_DIGEST_MISMATCH",
  "EVALUATOR_CONTRACT_DIGEST_MISMATCH",
  "TRUST_POLICY_MISSING",
  "TRUST_POLICY_UNREADABLE",
  "TRUST_POLICY_JSON_INVALID",
  "TRUST_POLICY_JSON_NON_CANONICAL",
  "TRUST_POLICY_SCHEMA_INVALID",
  "TRUST_POLICY_CONTENT_HASH_MISMATCH",
  "REVIEW_RECEIPT_MISSING",
  "REVIEW_RECEIPT_INVALID",
  "REVIEW_RECEIPT_NON_CANONICAL",
  "REVIEW_CONTENT_HASH_MISMATCH",
  "REVIEW_EVIDENCE_BINDING_MISMATCH",
  "REVIEW_CASE_BINDING_MISMATCH",
  "REVIEW_ROOM_STAGE_BINDING_MISMATCH",
  "REVIEW_EVALUATOR_BINDING_MISMATCH",
  "REVIEW_CONCLUSION_INSUFFICIENT",
  "REVIEWER_UNAUTHORIZED",
  "REVIEWER_NOT_INDEPENDENT",
  "REVIEWER_AUTHORIZATION_OUTSIDE_VALIDITY",
  "REVIEWER_PUBLIC_KEY_INVALID",
  "REVIEWER_PUBLIC_KEY_HASH_MISMATCH",
  "REVIEW_SIGNATURE_INVALID",
  "INTERNAL_VERIFICATION_ERROR",
] as const);

export type StudioAtelierQualificationBlockerCategory =
  typeof STUDIO_ATELIER_QUALIFICATION_BLOCKER_CATEGORIES[number];

export type StudioAtelierQualificationBlocker = Readonly<{
  category: StudioAtelierQualificationBlockerCategory;
  location: string;
  message: string;
}>;

export type StudioAtelierQualificationReadinessReport = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_QUALIFICATION_READINESS_REPORT_SCHEMA_VERSION;
  status: "BLOCKED" | "EVIDENCE_COMPLETE_NOT_INSTALLED";
  productionQualificationInstalled: false;
  providerCallsMade: 0;
  packetPath: string;
  reviewerTrustPolicyPath: string;
  evidenceContentSha256: string | null;
  verified: Readonly<{
    caseRecords: number;
    roomStageRecords: number;
    evaluatorBindings: number;
    exactFileBindings: number;
  }>;
  blockers: readonly StudioAtelierQualificationBlocker[];
}>;

type MutableVerificationState = {
  blockers: StudioAtelierQualificationBlocker[];
  exactFileBindings: number;
};

function sha256Bytes(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}
function addBlocker(
  state: MutableVerificationState,
  category: StudioAtelierQualificationBlockerCategory,
  location: string,
  message: string,
): void {
  state.blockers.push({ category, location, message });
}

function parseCanonicalJson(
  bytes: Uint8Array,
  state: MutableVerificationState,
  location: string,
  invalidCategory: StudioAtelierQualificationBlockerCategory,
  nonCanonicalCategory: StudioAtelierQualificationBlockerCategory,
): unknown | null {
  const text = Buffer.from(bytes).toString("utf8");
  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    addBlocker(state, invalidCategory, location, "The file is not valid JSON.");
    return null;
  }
  let canonical: string;
  try {
    canonical = `${canonicalStringify(parsed)}\n`;
  } catch {
    addBlocker(state, invalidCategory, location, "The JSON value cannot be canonically hashed.");
    return null;
  }
  if (text !== canonical) {
    addBlocker(
      state,
      nonCanonicalCategory,
      location,
      "The JSON bytes are not the exact canonical UTF-8 representation with one trailing newline.",
    );
  }
  return parsed;
}

async function readDirectFile(
  filePath: string,
  state: MutableVerificationState,
  location: string,
  missingCategory: StudioAtelierQualificationBlockerCategory,
  unreadableCategory: StudioAtelierQualificationBlockerCategory,
): Promise<Buffer | null> {
  try {
    return await readFile(filePath);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    addBlocker(
      state,
      code === "ENOENT" ? missingCategory : unreadableCategory,
      location,
      code === "ENOENT" ? "The required file is missing." : "The required file could not be read.",
    );
    return null;
  }
}

function containedByRoot(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

async function readBoundEvidenceFile(
  packetRoot: string,
  reference: StudioAtelierEvidenceFileReference,
  state: MutableVerificationState,
  location: string,
): Promise<Buffer | null> {
  const candidate = resolve(packetRoot, ...reference.relativePath.split("/"));
  if (!containedByRoot(packetRoot, candidate)) {
    addBlocker(
      state,
      "EVIDENCE_PATH_OUTSIDE_PACKET_ROOT",
      location,
      "The evidence reference resolves outside the packet root.",
    );
    return null;
  }

  let resolvedFile: string;
  try {
    resolvedFile = await realpath(candidate);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    addBlocker(
      state,
      code === "ENOENT" ? "EVIDENCE_FILE_MISSING" : "EVIDENCE_FILE_UNREADABLE",
      location,
      code === "ENOENT" ? "The bound evidence file is missing." : "The bound evidence file is unreadable.",
    );
    return null;
  }
  if (!containedByRoot(packetRoot, resolvedFile)) {
    addBlocker(
      state,
      "EVIDENCE_PATH_OUTSIDE_PACKET_ROOT",
      location,
      "The evidence path or symlink escapes the packet root.",
    );
    return null;
  }

  const bytes = await readDirectFile(
    resolvedFile,
    state,
    location,
    "EVIDENCE_FILE_MISSING",
    "EVIDENCE_FILE_UNREADABLE",
  );
  if (!bytes) return null;

  let exact = true;
  if (bytes.byteLength !== reference.byteSize) {
    exact = false;
    addBlocker(
      state,
      "EVIDENCE_FILE_SIZE_MISMATCH",
      location,
      `Expected ${reference.byteSize} bytes but read ${bytes.byteLength}.`,
    );
  }
  if (sha256Bytes(bytes) !== reference.sha256) {
    exact = false;
    addBlocker(
      state,
      "EVIDENCE_FILE_HASH_MISMATCH",
      location,
      "The reread file SHA-256 does not match its immutable binding.",
    );
  }
  if (exact) state.exactFileBindings += 1;
  return bytes;
}

function inspectDeclaredOrder(raw: unknown, state: MutableVerificationState): void {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return;
  const value = raw as Record<string, unknown>;
  if (Array.isArray(value.cases)) {
    const actual = value.cases.map((entry) =>
      entry && typeof entry === "object" && !Array.isArray(entry)
        ? (entry as Record<string, unknown>).caseId
        : null
    );
    if (canonicalStringify(actual) !== canonicalStringify(STUDIO_ATELIER_QUALIFICATION_CASE_IDS)) {
      addBlocker(
        state,
        "CASE_ORDER_INVALID",
        "packet.cases",
        "The six cases are missing, extra, or not in canonical order.",
      );
    }
  }
  if (Array.isArray(value.roomStageEvidence)) {
    const actual = value.roomStageEvidence.map((entry) => {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
      const record = entry as Record<string, unknown>;
      return { profileId: record.profileId, stage: record.stage };
    });
    if (canonicalStringify(actual) !== canonicalStringify(STUDIO_ATELIER_ROOM_STAGE_MATRIX)) {
      addBlocker(
        state,
        "ROOM_STAGE_ORDER_INVALID",
        "packet.roomStageEvidence",
        "The eight profile/stage cells are missing, extra, or not in canonical order.",
      );
    }
  }
}

async function loadTrustPolicy(
  policyPath: string,
  state: MutableVerificationState,
): Promise<StudioAtelierReviewerTrustPolicy | null> {
  const bytes = await readDirectFile(
    policyPath,
    state,
    "reviewerTrustPolicy",
    "TRUST_POLICY_MISSING",
    "TRUST_POLICY_UNREADABLE",
  );
  if (!bytes) return null;
  const raw = parseCanonicalJson(
    bytes,
    state,
    "reviewerTrustPolicy",
    "TRUST_POLICY_JSON_INVALID",
    "TRUST_POLICY_JSON_NON_CANONICAL",
  );
  const parsed = studioAtelierReviewerTrustPolicySchema.safeParse(raw);
  if (!parsed.success) {
    addBlocker(
      state,
      "TRUST_POLICY_SCHEMA_INVALID",
      "reviewerTrustPolicy",
      "The reviewer trust policy does not satisfy the strict schema.",
    );
    return null;
  }
  const expectedHash = deriveStudioAtelierReviewerTrustPolicyContentSha256(parsed.data);
  if (expectedHash !== parsed.data.policyContentSha256) {
    addBlocker(
      state,
      "TRUST_POLICY_CONTENT_HASH_MISMATCH",
      "reviewerTrustPolicy.policyContentSha256",
      "The trust policy content hash does not match its canonical body.",
    );
  }
  return parsed.data;
}

function expectedReviewCaseBindings(packet: StudioAtelierQualificationEvidencePacket) {
  return packet.cases.map((item) => ({
    caseId: item.caseId,
    evidenceDigestSha256: deriveStudioAtelierCaseEvidenceDigest(item),
  }));
}

function expectedReviewRoomBindings(packet: StudioAtelierQualificationEvidencePacket) {
  return packet.roomStageEvidence.map((item) => ({
    profileId: item.profileId,
    stage: item.stage,
    evidenceDigestSha256: deriveStudioAtelierRoomStageEvidenceDigest(item),
  }));
}

function expectedReviewEvaluatorBindings(packet: StudioAtelierQualificationEvidencePacket) {
  return packet.evaluators.map((item) => ({
    evaluatorKind: item.evaluatorKind,
    implementationDigestSha256: item.implementationDigestSha256,
    dependencySetDigestSha256: item.dependencySetDigestSha256,
    modelSetDigestSha256: item.modelSetDigestSha256,
    evaluationContractDigestSha256: item.evaluationContractDigestSha256,
  }));
}

function verifyReviewReceipt(
  receipt: StudioAtelierIndependentReviewReceipt,
  packet: StudioAtelierQualificationEvidencePacket,
  policy: StudioAtelierReviewerTrustPolicy | null,
  state: MutableVerificationState,
): void {
  const reviewContentSha256 = deriveStudioAtelierIndependentReviewContentSha256(receipt);
  if (reviewContentSha256 !== receipt.reviewContentSha256) {
    addBlocker(
      state,
      "REVIEW_CONTENT_HASH_MISMATCH",
      "independentReviewReceipt.reviewContentSha256",
      "The review content hash does not match its canonical signed body.",
    );
  }
  if (receipt.evidenceContentSha256 !== packet.evidenceContentSha256) {
    addBlocker(
      state,
      "REVIEW_EVIDENCE_BINDING_MISMATCH",
      "independentReviewReceipt.evidenceContentSha256",
      "The review does not bind the exact qualification evidence content hash.",
    );
  }
  if (
    canonicalStringify(receipt.reviewedCases)
    !== canonicalStringify(expectedReviewCaseBindings(packet))
  ) {
    addBlocker(
      state,
      "REVIEW_CASE_BINDING_MISMATCH",
      "independentReviewReceipt.reviewedCases",
      "The review does not bind all six exact case records in canonical order.",
    );
  }
  if (
    canonicalStringify(receipt.reviewedRoomStageEvidence)
    !== canonicalStringify(expectedReviewRoomBindings(packet))
  ) {
    addBlocker(
      state,
      "REVIEW_ROOM_STAGE_BINDING_MISMATCH",
      "independentReviewReceipt.reviewedRoomStageEvidence",
      "The review does not bind all eight exact native-room profile/stage cells.",
    );
  }
  if (
    canonicalStringify(receipt.reviewedEvaluators)
    !== canonicalStringify(expectedReviewEvaluatorBindings(packet))
  ) {
    addBlocker(
      state,
      "REVIEW_EVALUATOR_BINDING_MISMATCH",
      "independentReviewReceipt.reviewedEvaluators",
      "The review does not bind both exact evaluator implementations and dependency/model contracts.",
    );
  }
  if (receipt.conclusion !== "EVIDENCE_SUFFICIENT_FOR_INSTALLATION_REVIEW") {
    addBlocker(
      state,
      "REVIEW_CONCLUSION_INSUFFICIENT",
      "independentReviewReceipt.conclusion",
      "The independent human review did not find the evidence sufficient.",
    );
  }
  if (
    packet.actors.evidenceAuthors.some((actor) => actor.actorId === receipt.reviewer.reviewerId)
    || packet.actors.qualificationOperators.some(
      (actor) => actor.actorId === receipt.reviewer.reviewerId,
    )
  ) {
    addBlocker(
      state,
      "REVIEWER_NOT_INDEPENDENT",
      "independentReviewReceipt.reviewer.reviewerId",
      "The reviewer is also recorded as an evidence author or qualification operator.",
    );
  }

  if (!policy) {
    addBlocker(
      state,
      "REVIEWER_UNAUTHORIZED",
      "independentReviewReceipt.reviewer",
      "No valid separately supplied trust policy authorizes this reviewer.",
    );
    return;
  }
  const authorization = policy.authorizedHumanReviewers.find((item) =>
    item.reviewerId === receipt.reviewer.reviewerId
    && item.keyId === receipt.reviewer.keyId
  );
  if (!authorization) {
    addBlocker(
      state,
      "REVIEWER_UNAUTHORIZED",
      "independentReviewReceipt.reviewer",
      "The separately supplied trust policy does not authorize this reviewer/key.",
    );
    return;
  }
  const reviewedAt = new Date(receipt.reviewedAt).getTime();
  if (
    reviewedAt < new Date(authorization.validFrom).getTime()
    || reviewedAt > new Date(authorization.validUntil).getTime()
  ) {
    addBlocker(
      state,
      "REVIEWER_AUTHORIZATION_OUTSIDE_VALIDITY",
      "independentReviewReceipt.reviewedAt",
      "The review instant is outside the reviewer key's authorized validity window.",
    );
  }

  let publicKey: ReturnType<typeof createPublicKey>;
  try {
    publicKey = createPublicKey(authorization.publicKeySpkiPem);
    if (publicKey.asymmetricKeyType !== "ed25519") throw new TypeError("Expected Ed25519.");
  } catch {
    addBlocker(
      state,
      "REVIEWER_PUBLIC_KEY_INVALID",
      "reviewerTrustPolicy.authorizedHumanReviewers.publicKeySpkiPem",
      "The authorized reviewer key is not a valid Ed25519 SPKI public key.",
    );
    return;
  }
  const publicKeyDer = publicKey.export({ type: "spki", format: "der" });
  if (sha256Bytes(publicKeyDer) !== authorization.publicKeySpkiSha256) {
    addBlocker(
      state,
      "REVIEWER_PUBLIC_KEY_HASH_MISMATCH",
      "reviewerTrustPolicy.authorizedHumanReviewers.publicKeySpkiSha256",
      "The authorized reviewer public-key fingerprint does not match the supplied SPKI key.",
    );
  }

  const signature = Buffer.from(receipt.signature.valueBase64, "base64");
  const canonicalBase64 = signature.toString("base64");
  const signatureValid = signature.byteLength === 64
    && canonicalBase64 === receipt.signature.valueBase64
    && verifySignature(
      null,
      Buffer.from(studioAtelierIndependentReviewSignaturePayload(receipt.reviewContentSha256), "utf8"),
      publicKey,
      signature,
    );
  if (!signatureValid) {
    addBlocker(
      state,
      "REVIEW_SIGNATURE_INVALID",
      "independentReviewReceipt.signature",
      "The Ed25519 signature does not authenticate the exact review content hash.",
    );
  }
}

async function verifyPacketFiles(
  packet: StudioAtelierQualificationEvidencePacket,
  packetRoot: string,
  state: MutableVerificationState,
): Promise<void> {
  for (const [caseIndex, caseEvidence] of packet.cases.entries()) {
    for (const [assertionIndex, assertion] of caseEvidence.assertions.entries()) {
      if (assertion.result !== "SATISFIED") {
        addBlocker(
          state,
          "CASE_ASSERTION_NOT_SATISFIED",
          `packet.cases[${caseIndex}].assertions[${assertionIndex}]`,
          `${assertion.assertionId} is ${assertion.result}.`,
        );
      }
    }
    for (const [artifactIndex, artifact] of caseEvidence.artifacts.entries()) {
      await readBoundEvidenceFile(
        packetRoot,
        artifact.file,
        state,
        `packet.cases[${caseIndex}].artifacts[${artifactIndex}](${artifact.artifactId})`,
      );
    }
  }

  for (const [cellIndex, cell] of packet.roomStageEvidence.entries()) {
    for (const [assertionIndex, assertion] of cell.assertions.entries()) {
      if (assertion.result !== "SATISFIED") {
        addBlocker(
          state,
          "ROOM_ASSERTION_NOT_SATISFIED",
          `packet.roomStageEvidence[${cellIndex}].assertions[${assertionIndex}]`,
          `${assertion.assertionId} is ${assertion.result}.`,
        );
      }
    }
    for (const [fileRole, reference] of Object.entries(cell.files)) {
      await readBoundEvidenceFile(
        packetRoot,
        reference,
        state,
        `packet.roomStageEvidence[${cellIndex}].files.${fileRole}`,
      );
    }
  }

  for (const [evaluatorIndex, evaluator] of packet.evaluators.entries()) {
    if (
      deriveStudioAtelierEvaluatorImplementationDigest(evaluator)
      !== evaluator.implementationDigestSha256
    ) {
      addBlocker(
        state,
        "EVALUATOR_IMPLEMENTATION_DIGEST_MISMATCH",
        `packet.evaluators[${evaluatorIndex}].implementationDigestSha256`,
        "The implementation digest does not bind the declared entry point and source files.",
      );
    }
    if (
      deriveStudioAtelierEvaluatorDependencyDigest(evaluator)
      !== evaluator.dependencySetDigestSha256
    ) {
      addBlocker(
        state,
        "EVALUATOR_DEPENDENCY_DIGEST_MISMATCH",
        `packet.evaluators[${evaluatorIndex}].dependencySetDigestSha256`,
        "The dependency-set digest does not bind the declared dependency evidence.",
      );
    }
    if (deriveStudioAtelierEvaluatorModelDigest(evaluator) !== evaluator.modelSetDigestSha256) {
      addBlocker(
        state,
        "EVALUATOR_MODEL_DIGEST_MISMATCH",
        `packet.evaluators[${evaluatorIndex}].modelSetDigestSha256`,
        "The model-set digest does not bind the declared visual models and attestations.",
      );
    }
    if (
      deriveStudioAtelierEvaluationContractDigest(evaluator)
      !== evaluator.evaluationContractDigestSha256
    ) {
      addBlocker(
        state,
        "EVALUATOR_CONTRACT_DIGEST_MISMATCH",
        `packet.evaluators[${evaluatorIndex}].evaluationContractDigestSha256`,
        "The evaluation-contract digest does not bind the declared contract files.",
      );
    }

    for (const [sourceIndex, reference] of evaluator.sourceFiles.entries()) {
      await readBoundEvidenceFile(
        packetRoot,
        reference,
        state,
        `packet.evaluators[${evaluatorIndex}].sourceFiles[${sourceIndex}]`,
      );
    }
    for (const [dependencyIndex, dependency] of evaluator.dependencies.entries()) {
      await readBoundEvidenceFile(
        packetRoot,
        dependency.evidenceFile,
        state,
        `packet.evaluators[${evaluatorIndex}].dependencies[${dependencyIndex}]`,
      );
    }
    for (const [modelIndex, model] of evaluator.visualModels.entries()) {
      await readBoundEvidenceFile(
        packetRoot,
        model.attestationFile,
        state,
        `packet.evaluators[${evaluatorIndex}].visualModels[${modelIndex}]`,
      );
    }
    for (const [contractIndex, reference] of evaluator.contractFiles.entries()) {
      await readBoundEvidenceFile(
        packetRoot,
        reference,
        state,
        `packet.evaluators[${evaluatorIndex}].contractFiles[${contractIndex}]`,
      );
    }
  }
}

function deduplicateBlockers(
  blockers: readonly StudioAtelierQualificationBlocker[],
): StudioAtelierQualificationBlocker[] {
  const seen = new Set<string>();
  return blockers.filter((blocker) => {
    const key = `${blocker.category}\n${blocker.location}\n${blocker.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/**
 * Performs a local, read-only, zero-network evidence audit. Even a complete
 * packet is reported only as EVIDENCE_COMPLETE_NOT_INSTALLED; this function
 * cannot construct evaluator functions or install production qualification.
 */
export async function inspectStudioAtelierQualificationEvidence(input: Readonly<{
  packetPath: string;
  reviewerTrustPolicyPath: string;
}>): Promise<StudioAtelierQualificationReadinessReport> {
  const state: MutableVerificationState = { blockers: [], exactFileBindings: 0 };
  const packetPath = resolve(input.packetPath);
  const reviewerTrustPolicyPath = resolve(input.reviewerTrustPolicyPath);
  let packet: StudioAtelierQualificationEvidencePacket | null = null;
  let packetRoot = dirname(packetPath);

  try {
    packetRoot = await realpath(packetRoot);
  } catch {
    // The packet read below reports the categorical missing/unreadable result.
  }

  const [packetBytes, trustPolicy] = await Promise.all([
    readDirectFile(
      packetPath,
      state,
      "packet",
      "PACKET_MISSING",
      "PACKET_UNREADABLE",
    ),
    loadTrustPolicy(reviewerTrustPolicyPath, state),
  ]);

  if (packetBytes) {
    const rawPacket = parseCanonicalJson(
      packetBytes,
      state,
      "packet",
      "PACKET_JSON_INVALID",
      "PACKET_JSON_NON_CANONICAL",
    );
    inspectDeclaredOrder(rawPacket, state);
    const parsed = studioAtelierQualificationEvidencePacketSchema.safeParse(rawPacket);
    if (!parsed.success) {
      addBlocker(
        state,
        "PACKET_SCHEMA_INVALID",
        "packet",
        "The packet does not satisfy the strict qualification evidence schema.",
      );
    } else {
      packet = parsed.data;
    }
  }

  if (packet) {
    const derivedEvidenceHash = deriveStudioAtelierQualificationEvidenceContentSha256(packet);
    if (derivedEvidenceHash !== packet.evidenceContentSha256) {
      addBlocker(
        state,
        "EVIDENCE_CONTENT_HASH_MISMATCH",
        "packet.evidenceContentSha256",
        "The packet evidence content hash does not match its canonical body.",
      );
    }

    try {
      await verifyPacketFiles(packet, packetRoot, state);
    } catch {
      addBlocker(
        state,
        "INTERNAL_VERIFICATION_ERROR",
        "packet.evidenceFiles",
        "An unexpected local verification error blocked readiness.",
      );
    }

    const reviewBytes = await readBoundEvidenceFile(
      packetRoot,
      packet.independentReviewReceipt,
      state,
      "packet.independentReviewReceipt",
    );
    if (!reviewBytes) {
      addBlocker(
        state,
        "REVIEW_RECEIPT_MISSING",
        "packet.independentReviewReceipt",
        "The exact independent human-review receipt is unavailable.",
      );
    } else {
      const rawReview = parseCanonicalJson(
        reviewBytes,
        state,
        "packet.independentReviewReceipt",
        "REVIEW_RECEIPT_INVALID",
        "REVIEW_RECEIPT_NON_CANONICAL",
      );
      const parsedReview = studioAtelierIndependentReviewReceiptSchema.safeParse(rawReview);
      if (!parsedReview.success) {
        addBlocker(
          state,
          "REVIEW_RECEIPT_INVALID",
          "packet.independentReviewReceipt",
          "The independent review receipt does not satisfy the strict schema.",
        );
      } else {
        verifyReviewReceipt(parsedReview.data, packet, trustPolicy, state);
      }
    }
  }

  const blockers = deduplicateBlockers(state.blockers);
  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_QUALIFICATION_READINESS_REPORT_SCHEMA_VERSION,
    status: blockers.length === 0 ? "EVIDENCE_COMPLETE_NOT_INSTALLED" : "BLOCKED",
    productionQualificationInstalled: false,
    providerCallsMade: 0,
    packetPath: input.packetPath,
    reviewerTrustPolicyPath: input.reviewerTrustPolicyPath,
    evidenceContentSha256: packet?.evidenceContentSha256 ?? null,
    verified: Object.freeze({
      caseRecords: packet?.cases.length ?? 0,
      roomStageRecords: packet?.roomStageEvidence.length ?? 0,
      evaluatorBindings: packet?.evaluators.length ?? 0,
      exactFileBindings: state.exactFileBindings,
    }),
    blockers: Object.freeze(blockers),
  });
}
