#!/usr/bin/env node

import { createHash } from "node:crypto";
import {
  mkdir,
  lstat,
  readFile,
  realpath,
  rename,
  writeFile,
} from "node:fs/promises";
import {
  dirname,
  isAbsolute,
  relative,
  resolve,
} from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";
import { canonicalStringify } from "../../lib/studio/atelier/canonical";
import {
  STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION,
  STUDIO_ATELIER_QUALIFICATION_CASE_SPECS,
  STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  STUDIO_ATELIER_ROOM_ASSERTION_IDS,
  STUDIO_ATELIER_ROOM_STAGE_MATRIX,
  deriveStudioAtelierEvaluationContractDigest,
  deriveStudioAtelierEvaluatorDependencyDigest,
  deriveStudioAtelierEvaluatorImplementationDigest,
  deriveStudioAtelierEvaluatorModelDigest,
  studioAtelierEvaluatorBindingsSchema,
  studioAtelierQualificationCaseEvidenceSchema,
  studioAtelierQualificationEvidencePacketSchema,
  studioAtelierRelativeEvidencePathSchema,
  studioAtelierRoomStageEvidenceSchema,
  studioAtelierQualificationSha256Schema,
  type StudioAtelierEvidenceFileReference,
  type StudioAtelierEvaluatorBinding,
} from "../../lib/studio/atelier/qualification-contracts";

const ASSEMBLY_INPUT_SCHEMA_VERSION =
  "juw.atelier-qualification-assembly-input.v1" as const;
const ASSEMBLY_REPORT_SCHEMA_VERSION =
  "juw.atelier-qualification-assembly-report.v1" as const;
const DRAFT_SCHEMA_VERSION =
  "juw.atelier-qualification-evidence-draft.v1" as const;

const DEFAULT_MANIFEST_PATH =
  "storage/virtual-atelier/qualification/staging/assembly-input.json";
const DEFAULT_OUTPUT_ROOT =
  "storage/virtual-atelier/qualification/staging/current-draft";
const PRIVATE_STAGING_ROOT =
  "storage/virtual-atelier/qualification/staging";

const RESERVED_DESTINATIONS = new Set([
  "assembly-report.json",
  "qualification-evidence.candidate.json",
  "qualification-evidence.draft.json",
  "qualification-evidence.json",
  "review-request.json",
]);

const artifactRoleSchema = z.enum([
  "INPUT_AUTHORITY",
  "PROVIDER_RAW_RESULT",
  "NORMALIZED_ARTIFACT",
  "REVIEW_ARTIFACT",
  "TECHNICAL_EVALUATION",
  "SEMANTIC_EVALUATION",
  "OPERATION_RECEIPT",
  "DECISION_RECEIPT",
  "MODERATION_RECEIPT",
  "OTHER_SUPPORTING_EVIDENCE",
]);

const assertionResultSchema = z.enum([
  "SATISFIED",
  "NOT_SATISFIED",
  "INDETERMINATE",
]);

const canonicalInstantSchema = z.string().refine((value) => {
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}, "Expected a canonical UTC ISO-8601 instant.");

const sourceFileSchema = z.object({
  sourcePath: studioAtelierRelativeEvidencePathSchema,
  destinationPath: studioAtelierRelativeEvidencePathSchema,
  expectedSourceSha256: studioAtelierQualificationSha256Schema,
  expectedSourceByteSize: z.number().int().nonnegative(),
  mediaType: z.string().min(1).max(127),
}).strict();

const satisfiedBySchema = z.object({
  kind: z.enum([
    "MACHINE_VERIFIABLE_JSON",
    "SUPPLIED_REVIEWED_JSON",
  ]),
  evidencePath: studioAtelierRelativeEvidencePathSchema,
  resultJsonPointer: z.string().startsWith("/").max(512),
  actorIdJsonPointer: z.string().startsWith("/").max(512),
  expectedActorId: z.string().min(2).max(191),
}).strict();

const caseAssertionInputSchema = z.object({
  assertionId: z.string().min(2).max(127),
  result: assertionResultSchema,
  evidenceArtifactIds: z.array(z.string().min(2).max(127)).min(1),
  satisfiedBy: satisfiedBySchema.optional(),
}).strict();

const caseInputSchema = z.object({
  caseId: z.string().min(2).max(127),
  evidenceRevision: z.string().min(2).max(191),
  recordedAt: canonicalInstantSchema,
  provenance: z.enum([
    "RETAINED_OPERATION",
    "CONTROLLED_QUALIFICATION_RUN",
    "VERSION_LOCKED_PUBLIC_DERIVATIVE",
  ]),
  artifacts: z.array(z.object({
    artifactId: z.string().min(2).max(127),
    role: artifactRoleSchema,
    evidencePath: studioAtelierRelativeEvidencePathSchema,
  }).strict()).min(1),
  assertions: z.array(caseAssertionInputSchema),
}).strict();

const roomAssertionInputSchema = z.object({
  assertionId: z.string().min(2).max(127),
  result: assertionResultSchema,
  satisfiedBy: satisfiedBySchema.optional(),
}).strict();

const roomStageInputSchema = z.object({
  profileId: z.string().min(2).max(127),
  stage: z.string().min(2).max(127),
  evidenceRevision: z.string().min(2).max(191),
  recordedAt: canonicalInstantSchema,
  files: z.object({
    roomAuthority: studioAtelierRelativeEvidencePathSchema,
    transparentSubject: studioAtelierRelativeEvidencePathSchema,
    finalComposite: studioAtelierRelativeEvidencePathSchema,
    technicalEvaluation: studioAtelierRelativeEvidencePathSchema,
    semanticEvaluation: studioAtelierRelativeEvidencePathSchema,
  }).strict(),
  assertions: z.array(roomAssertionInputSchema),
}).strict();

const evaluatorInputSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION),
  evaluatorKind: z.enum(["TECHNICAL", "SEMANTIC"]),
  evaluatorId: z.string().min(2).max(191),
  evaluatorVersion: z.string().min(1).max(191),
  policyRevision: z.string().min(1).max(191),
  entryPointExport: z.string().min(3).max(512),
  sourceFilePaths: z.array(studioAtelierRelativeEvidencePathSchema).min(1),
  dependencies: z.array(z.object({
    packageName: z.string().min(2).max(191),
    version: z.string().min(1).max(127),
    integritySha256: studioAtelierQualificationSha256Schema,
    evidencePath: studioAtelierRelativeEvidencePathSchema,
  }).strict()).min(1),
  visualModels: z.array(z.object({
    provider: z.string().min(2).max(191),
    modelId: z.string().min(2).max(191),
    modelVersion: z.string().min(1).max(191),
    policyRevision: z.string().min(1).max(191),
    modelDigestSha256: studioAtelierQualificationSha256Schema,
    attestationPath: studioAtelierRelativeEvidencePathSchema,
  }).strict()),
  contractFilePaths: z.array(studioAtelierRelativeEvidencePathSchema).min(1),
}).strict();

const assemblyInputSchema = z.object({
  schemaVersion: z.literal(ASSEMBLY_INPUT_SCHEMA_VERSION),
  suiteVersion: z.literal(STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION),
  packetRevision: z.string().min(2).max(191),
  createdAt: canonicalInstantSchema,
  adapterBinding: z.unknown().optional(),
  actors: z.unknown().optional(),
  sources: z.array(sourceFileSchema),
  cases: z.array(caseInputSchema).default([]),
  roomStageEvidence: z.array(roomStageInputSchema).default([]),
  evaluators: z.array(evaluatorInputSchema).default([]),
  independentReviewReceiptPath: studioAtelierRelativeEvidencePathSchema.optional(),
  reviewerTrustPolicyPath: studioAtelierRelativeEvidencePathSchema.optional(),
}).strict().superRefine((value, context) => {
  const sourceDestinations = value.sources.map((item) => item.destinationPath);
  if (new Set(sourceDestinations).size !== sourceDestinations.length) {
    context.addIssue({
      code: "custom",
      path: ["sources"],
      message: "Source destination paths must be unique.",
    });
  }
  const caseIds = value.cases.map((item) => item.caseId);
  if (new Set(caseIds).size !== caseIds.length) {
    context.addIssue({
      code: "custom",
      path: ["cases"],
      message: "Case IDs must be unique.",
    });
  }
  const roomCells = value.roomStageEvidence.map((item) => `${item.profileId}:${item.stage}`);
  if (new Set(roomCells).size !== roomCells.length) {
    context.addIssue({
      code: "custom",
      path: ["roomStageEvidence"],
      message: "Room-stage cells must be unique.",
    });
  }
  const evaluatorKinds = value.evaluators.map((item) => item.evaluatorKind);
  if (new Set(evaluatorKinds).size !== evaluatorKinds.length) {
    context.addIssue({
      code: "custom",
      path: ["evaluators"],
      message: "Evaluator kinds must be unique.",
    });
  }
});

type AssemblyInput = z.infer<typeof assemblyInputSchema>;
type SourceFileInput = z.infer<typeof sourceFileSchema>;
type CaseInput = z.infer<typeof caseInputSchema>;
type RoomStageInput = z.infer<typeof roomStageInputSchema>;
type EvaluatorInput = z.infer<typeof evaluatorInputSchema>;

export type StudioAtelierQualificationAssemblyBlocker = Readonly<{
  code: string;
  location: string;
  message: string;
}>;

export type StudioAtelierQualificationAssemblyReport = Readonly<{
  schemaVersion: typeof ASSEMBLY_REPORT_SCHEMA_VERSION;
  suiteVersion: typeof STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION;
  packetState: "DRAFT";
  status: "BLOCKED";
  productionQualificationInstalled: false;
  providerCallsMade: 0;
  packetRoot: string;
  manifestPath: string;
  expected: Readonly<{
    caseIds: readonly string[];
    roomStageCells: readonly Readonly<{ profileId: string; stage: string }>[];
    evaluatorKinds: readonly ["TECHNICAL", "SEMANTIC"];
  }>;
  assembled: Readonly<{
    copiedEvidenceFiles: number;
    caseRecords: number;
    roomStageRecords: number;
    evaluatorBindings: number;
    evidenceContentSha256: string | null;
    reviewRequest: StudioAtelierEvidenceFileReference | null;
    qualificationPacket: StudioAtelierEvidenceFileReference | null;
  }>;
  copiedFiles: readonly Readonly<{
    sourcePath: string;
    destinationPath: string;
    mediaType: string;
    sourceSha256: string;
    sourceByteSize: number;
    outputSha256: string;
    outputByteSize: number;
    canonicalizedJson: boolean;
  }>[];
  warnings: readonly string[];
  blockers: readonly StudioAtelierQualificationAssemblyBlocker[];
}>;

type MutableAssemblyState = {
  blockers: StudioAtelierQualificationAssemblyBlocker[];
  warnings: string[];
};

type CopiedFile = StudioAtelierQualificationAssemblyReport["copiedFiles"][number] & {
  reference: StudioAtelierEvidenceFileReference;
  parsedJson: unknown | null;
};

function sha256Bytes(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function containedByRoot(root: string, candidate: string): boolean {
  const relation = relative(root, candidate);
  return relation === "" || (!relation.startsWith("..") && !isAbsolute(relation));
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function addBlocker(
  state: MutableAssemblyState,
  code: string,
  location: string,
  message: string,
): void {
  state.blockers.push({ code, location, message });
}

async function writeCanonicalJsonReplacing(filePath: string, value: unknown): Promise<Buffer> {
  const bytes = Buffer.from(`${canonicalStringify(value)}\n`, "utf8");
  await mkdir(dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}`;
  await writeFile(temporaryPath, bytes, { flag: "wx", mode: 0o600 });
  await rename(temporaryPath, filePath);
  return bytes;
}

async function writeEvidenceWithoutReplacement(
  filePath: string,
  bytes: Buffer,
): Promise<"CREATED" | "REUSED" | "CONFLICT"> {
  await mkdir(dirname(filePath), { recursive: true });
  try {
    await writeFile(filePath, bytes, { flag: "wx", mode: 0o600 });
    return "CREATED";
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "EEXIST") throw error;
  }
  const existing = await readFile(filePath);
  return existing.equals(bytes) ? "REUSED" : "CONFLICT";
}

function referencedEvidencePaths(input: AssemblyInput): Set<string> {
  const paths = new Set<string>();
  input.cases.forEach((item) => {
    item.artifacts.forEach((artifact) => paths.add(artifact.evidencePath));
    item.assertions.forEach((assertion) => {
      if (assertion.satisfiedBy) paths.add(assertion.satisfiedBy.evidencePath);
    });
  });
  input.roomStageEvidence.forEach((item) => {
    Object.values(item.files).forEach((filePath) => paths.add(filePath));
    item.assertions.forEach((assertion) => {
      if (assertion.satisfiedBy) paths.add(assertion.satisfiedBy.evidencePath);
    });
  });
  input.evaluators.forEach((item) => {
    item.sourceFilePaths.forEach((filePath) => paths.add(filePath));
    item.dependencies.forEach((dependency) => paths.add(dependency.evidencePath));
    item.visualModels.forEach((model) => paths.add(model.attestationPath));
    item.contractFilePaths.forEach((filePath) => paths.add(filePath));
  });
  if (input.independentReviewReceiptPath) paths.add(input.independentReviewReceiptPath);
  if (input.reviewerTrustPolicyPath) paths.add(input.reviewerTrustPolicyPath);
  return paths;
}

async function copyDeclaredFile(input: Readonly<{
  declaration: SourceFileInput;
  sourceRoot: string;
  outputRoot: string;
  state: MutableAssemblyState;
}>): Promise<CopiedFile | null> {
  const { declaration, sourceRoot, outputRoot, state } = input;
  const location = `sources.${declaration.destinationPath}`;
  if (RESERVED_DESTINATIONS.has(declaration.destinationPath)) {
    addBlocker(
      state,
      "RESERVED_DESTINATION",
      location,
      "Evidence cannot replace an assembler-owned metadata file.",
    );
    return null;
  }
  const unresolvedSource = resolve(sourceRoot, ...declaration.sourcePath.split("/"));
  let resolvedSource: string;
  try {
    resolvedSource = await realpath(unresolvedSource);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    addBlocker(
      state,
      code === "ENOENT" ? "SOURCE_FILE_MISSING" : "SOURCE_FILE_UNREADABLE",
      location,
      code === "ENOENT" ? "The declared source file is missing." : "The declared source file cannot be read.",
    );
    return null;
  }
  if (!containedByRoot(sourceRoot, resolvedSource)) {
    addBlocker(
      state,
      "SOURCE_PATH_OUTSIDE_ROOT",
      location,
      "The declared source path or symlink escapes the source root.",
    );
    return null;
  }

  let sourceBytes: Buffer;
  try {
    sourceBytes = await readFile(resolvedSource);
  } catch {
    addBlocker(
      state,
      "SOURCE_FILE_UNREADABLE",
      location,
      "The declared source path does not resolve to a readable regular file.",
    );
    return null;
  }
  const sourceSha256 = sha256Bytes(sourceBytes);
  if (sourceBytes.byteLength !== declaration.expectedSourceByteSize) {
    addBlocker(
      state,
      "SOURCE_SIZE_MISMATCH",
      location,
      `Expected ${declaration.expectedSourceByteSize} source bytes but read ${sourceBytes.byteLength}.`,
    );
    return null;
  }
  if (sourceSha256 !== declaration.expectedSourceSha256) {
    addBlocker(
      state,
      "SOURCE_HASH_MISMATCH",
      location,
      "The declared source SHA-256 does not match the bytes read.",
    );
    return null;
  }

  let outputBytes = sourceBytes;
  let parsedJson: unknown | null = null;
  const canonicalizedJson = declaration.mediaType === "application/json";
  if (canonicalizedJson) {
    try {
      parsedJson = JSON.parse(sourceBytes.toString("utf8")) as unknown;
      outputBytes = Buffer.from(`${canonicalStringify(parsedJson)}\n`, "utf8");
    } catch {
      addBlocker(
        state,
        "SOURCE_JSON_INVALID",
        location,
        "The declared JSON evidence cannot be parsed and canonicalized.",
      );
      return null;
    }
  }

  const destination = resolve(outputRoot, ...declaration.destinationPath.split("/"));
  if (!containedByRoot(outputRoot, destination)) {
    addBlocker(
      state,
      "DESTINATION_OUTSIDE_PACKET_ROOT",
      location,
      "The evidence destination escapes the packet root.",
    );
    return null;
  }
  await mkdir(dirname(destination), { recursive: true, mode: 0o700 });
  const [resolvedPacketRoot, resolvedDestinationParent] = await Promise.all([
    realpath(outputRoot),
    realpath(dirname(destination)),
  ]);
  if (!containedByRoot(resolvedPacketRoot, resolvedDestinationParent)) {
    addBlocker(
      state,
      "DESTINATION_PATH_SYMLINK_ESCAPE",
      location,
      "An existing destination directory symlink escapes the packet root.",
    );
    return null;
  }
  try {
    if ((await lstat(destination)).isSymbolicLink()) {
      addBlocker(
        state,
        "DESTINATION_FILE_SYMLINKED",
        location,
        "An evidence destination may not be an existing symlink.",
      );
      return null;
    }
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    if (code !== "ENOENT") {
      addBlocker(
        state,
        "DESTINATION_UNREADABLE",
        location,
        "The evidence destination could not be inspected safely.",
      );
      return null;
    }
  }
  const disposition = await writeEvidenceWithoutReplacement(destination, outputBytes);
  if (disposition === "CONFLICT") {
    addBlocker(
      state,
      "DESTINATION_CONFLICT",
      location,
      "A different file already occupies this evidence destination; use a fresh packet root.",
    );
    return null;
  }

  const outputSha256 = sha256Bytes(outputBytes);
  const reference: StudioAtelierEvidenceFileReference = {
    relativePath: declaration.destinationPath,
    sha256: outputSha256,
    byteSize: outputBytes.byteLength,
    mediaType: declaration.mediaType,
  };
  return {
    sourcePath: declaration.sourcePath,
    destinationPath: declaration.destinationPath,
    mediaType: declaration.mediaType,
    sourceSha256,
    sourceByteSize: sourceBytes.byteLength,
    outputSha256,
    outputByteSize: outputBytes.byteLength,
    canonicalizedJson,
    reference,
    parsedJson,
  };
}

function verifySatisfiedAssertion(input: Readonly<{
  assertionId: string;
  result: "SATISFIED" | "NOT_SATISFIED" | "INDETERMINATE";
  state: MutableAssemblyState;
  location: string;
}>): "NOT_SATISFIED" | "INDETERMINATE" {
  // Hashes authenticate supplied bytes, not the truth of claims inside JSON.
  // This preparatory assembler has no assertion-specific semantic verifier.
  if (input.result === "SATISFIED") {
    addBlocker(
      input.state,
      "ASSERTION_SATISFACTION_UNVERIFIED",
      input.location,
      `Assertion ${input.assertionId} needs an assertion-specific verifier or an independently trusted review; supplied JSON cannot establish SATISFIED.`,
    );
  }
  return input.result === "NOT_SATISFIED" ? "NOT_SATISFIED" : "INDETERMINATE";
}

function buildCaseRecords(input: Readonly<{
  cases: readonly CaseInput[];
  files: ReadonlyMap<string, CopiedFile>;
  state: MutableAssemblyState;
}>): unknown[] {
  const records: unknown[] = [];
  const actualOrder = input.cases.map((item) => item.caseId);
  const expectedOrder = STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((item) => item.caseId);
  if (canonicalStringify(actualOrder) !== canonicalStringify(expectedOrder)) {
    addBlocker(
      input.state,
      "CASE_SET_INCOMPLETE",
      "cases",
      "Cases must match the current canonical case set and order exactly.",
    );
  }

  for (const spec of STUDIO_ATELIER_QUALIFICATION_CASE_SPECS) {
    const source = input.cases.find((item) => item.caseId === spec.caseId);
    if (!source) continue;
    const artifacts = source.artifacts.flatMap((artifact) => {
      const file = input.files.get(artifact.evidencePath);
      if (!file) {
        addBlocker(
          input.state,
          "CASE_ARTIFACT_MISSING",
          `cases.${spec.caseId}.artifacts.${artifact.artifactId}`,
          "The exact artifact was not copied into the packet root.",
        );
        return [];
      }
      return [{ artifactId: artifact.artifactId, role: artifact.role, file: file.reference }];
    });
    if (artifacts.length !== source.artifacts.length || artifacts.length === 0) continue;

    const artifactPathById = new Map(
      source.artifacts.map((artifact) => [artifact.artifactId, artifact.evidencePath]),
    );
    const sourceAssertionById = new Map(
      source.assertions.map((assertion) => [assertion.assertionId, assertion]),
    );
    const actualAssertionOrder = source.assertions.map((assertion) => assertion.assertionId);
    if (canonicalStringify(actualAssertionOrder) !== canonicalStringify(spec.requiredAssertionIds)) {
      addBlocker(
        input.state,
        "CASE_ASSERTION_SET_INCOMPLETE",
        `cases.${spec.caseId}.assertions`,
        "Assertions must match the current canonical case assertion set and order exactly.",
      );
    }
    const fallbackArtifactId = artifacts[0]?.artifactId;
    const assertions = spec.requiredAssertionIds.map((assertionId) => {
      const assertion = sourceAssertionById.get(assertionId);
      const evidenceArtifactIds = assertion?.evidenceArtifactIds.filter((artifactId) =>
        artifactPathById.has(artifactId)
      ) ?? (fallbackArtifactId ? [fallbackArtifactId] : []);
      if (assertion && evidenceArtifactIds.length !== assertion.evidenceArtifactIds.length) {
        addBlocker(
          input.state,
          "CASE_ASSERTION_EVIDENCE_UNKNOWN",
          `cases.${spec.caseId}.assertions.${assertionId}`,
          "Every assertion evidence artifact ID must resolve in the same case.",
        );
      }
      if (!assertion || evidenceArtifactIds.length === 0) {
        addBlocker(
          input.state,
          "CASE_ASSERTION_EVIDENCE_MISSING",
          `cases.${spec.caseId}.assertions.${assertionId}`,
          "The assertion has no exact artifact binding.",
        );
      }
      return {
        assertionId,
        result: assertion
          ? verifySatisfiedAssertion({
            ...assertion,
            state: input.state,
            location: `cases.${spec.caseId}.assertions.${assertionId}`,
          })
          : "INDETERMINATE",
        evidenceArtifactIds: evidenceArtifactIds.length > 0
          ? evidenceArtifactIds
          : [fallbackArtifactId].filter((value): value is string => Boolean(value)),
      };
    });
    records.push({
      caseId: spec.caseId,
      garmentId: spec.garmentId,
      calibrationKind: spec.calibrationKind,
      evidenceRevision: source.evidenceRevision,
      recordedAt: source.recordedAt,
      provenance: source.provenance,
      artifacts,
      assertions,
    });
  }
  return records;
}

function buildRoomStageRecords(input: Readonly<{
  roomStageEvidence: readonly RoomStageInput[];
  files: ReadonlyMap<string, CopiedFile>;
  state: MutableAssemblyState;
}>): unknown[] {
  const records: unknown[] = [];
  const actualOrder = input.roomStageEvidence.map((item) => ({
    profileId: item.profileId,
    stage: item.stage,
  }));
  if (canonicalStringify(actualOrder) !== canonicalStringify(STUDIO_ATELIER_ROOM_STAGE_MATRIX)) {
    addBlocker(
      input.state,
      "ROOM_STAGE_SET_INCOMPLETE",
      "roomStageEvidence",
      "Room-stage cells must match the current canonical matrix and order exactly.",
    );
  }

  for (const matrixCell of STUDIO_ATELIER_ROOM_STAGE_MATRIX) {
    const source = input.roomStageEvidence.find((item) =>
      item.profileId === matrixCell.profileId && item.stage === matrixCell.stage
    );
    if (!source) continue;
    const profile = STUDIO_ATELIER_QUALIFICATION_ROOM_PROFILES.find((item) =>
      item.profileId === matrixCell.profileId
    );
    if (!profile) {
      addBlocker(
        input.state,
        "ROOM_PROFILE_UNKNOWN",
        `roomStageEvidence.${matrixCell.profileId}.${matrixCell.stage}`,
        "The matrix references a room profile with no current canonical definition.",
      );
      continue;
    }
    const copiedFiles = Object.fromEntries(
      Object.entries(source.files).map(([key, evidencePath]) => [
        key,
        input.files.get(evidencePath)?.reference ?? null,
      ]),
    ) as Record<keyof RoomStageInput["files"], StudioAtelierEvidenceFileReference | null>;
    if (Object.values(copiedFiles).some((file) => file === null)) {
      addBlocker(
        input.state,
        "ROOM_STAGE_FILE_MISSING",
        `roomStageEvidence.${matrixCell.profileId}.${matrixCell.stage}.files`,
        "All five exact room-stage evidence files must be copied.",
      );
      continue;
    }
    const actualAssertionOrder = source.assertions.map((assertion) => assertion.assertionId);
    if (canonicalStringify(actualAssertionOrder) !== canonicalStringify(STUDIO_ATELIER_ROOM_ASSERTION_IDS)) {
      addBlocker(
        input.state,
        "ROOM_ASSERTION_SET_INCOMPLETE",
        `roomStageEvidence.${matrixCell.profileId}.${matrixCell.stage}.assertions`,
        "Assertions must match the current canonical room assertion set and order exactly.",
      );
    }
    const sourceAssertionById = new Map(
      source.assertions.map((assertion) => [assertion.assertionId, assertion]),
    );
    const assertions = STUDIO_ATELIER_ROOM_ASSERTION_IDS.map((assertionId) => {
      const assertion = sourceAssertionById.get(assertionId);
      return {
        assertionId,
        result: assertion
          ? verifySatisfiedAssertion({
            ...assertion,
            state: input.state,
            location: `roomStageEvidence.${matrixCell.profileId}.${matrixCell.stage}.assertions.${assertionId}`,
          })
          : "INDETERMINATE",
      };
    });
    records.push({
      profileId: matrixCell.profileId,
      stage: matrixCell.stage,
      roomCanvas: profile.roomCanvas,
      subjectWindow: profile.subjectWindow,
      transparentGuardPixels: profile.transparentGuardPixels,
      evidenceRevision: source.evidenceRevision,
      recordedAt: source.recordedAt,
      files: copiedFiles,
      assertions,
    });
  }
  return records;
}

function uniqueBy<T>(values: readonly T[], identity: (value: T) => string): boolean {
  const identities = values.map(identity);
  return new Set(identities).size === identities.length;
}

function buildEvaluatorBinding(
  input: EvaluatorInput,
  files: ReadonlyMap<string, CopiedFile>,
  state: MutableAssemblyState,
): StudioAtelierEvaluatorBinding | null {
  const location = `evaluators.${input.evaluatorKind}`;
  const resolveReference = (evidencePath: string) => files.get(evidencePath)?.reference ?? null;
  const sourceFiles = input.sourceFilePaths
    .map(resolveReference)
    .filter((value): value is StudioAtelierEvidenceFileReference => value !== null)
    .sort((left, right) => compareText(left.relativePath, right.relativePath));
  const dependencies = input.dependencies.flatMap((dependency) => {
    const evidenceFile = resolveReference(dependency.evidencePath);
    return evidenceFile ? [{
      packageName: dependency.packageName,
      version: dependency.version,
      integritySha256: dependency.integritySha256,
      evidenceFile,
    }] : [];
  }).sort((left, right) => compareText(left.packageName, right.packageName));
  const visualModels = input.visualModels.flatMap((model) => {
    const attestationFile = resolveReference(model.attestationPath);
    return attestationFile ? [{
      provider: model.provider,
      modelId: model.modelId,
      modelVersion: model.modelVersion,
      policyRevision: model.policyRevision,
      modelDigestSha256: model.modelDigestSha256,
      attestationFile,
    }] : [];
  }).sort((left, right) => compareText(
    `${left.provider}/${left.modelId}`,
    `${right.provider}/${right.modelId}`,
  )
  );
  const contractFiles = input.contractFilePaths
    .map(resolveReference)
    .filter((value): value is StudioAtelierEvidenceFileReference => value !== null)
    .sort((left, right) => compareText(left.relativePath, right.relativePath));

  if (
    sourceFiles.length !== input.sourceFilePaths.length
    || dependencies.length !== input.dependencies.length
    || visualModels.length !== input.visualModels.length
    || contractFiles.length !== input.contractFilePaths.length
  ) {
    addBlocker(
      state,
      "EVALUATOR_FILE_MISSING",
      location,
      "Every evaluator source, dependency, model attestation and contract file must be copied.",
    );
    return null;
  }
  if (
    !uniqueBy(sourceFiles, (item) => item.relativePath)
    || !uniqueBy(dependencies, (item) => item.packageName)
    || !uniqueBy(visualModels, (item) => `${item.provider}/${item.modelId}`)
    || !uniqueBy(contractFiles, (item) => item.relativePath)
  ) {
    addBlocker(
      state,
      "EVALUATOR_IDENTITY_DUPLICATE",
      location,
      "Evaluator file and dependency identities must be unique.",
    );
    return null;
  }

  const draft = {
    schemaVersion: input.schemaVersion,
    evaluatorKind: input.evaluatorKind,
    evaluatorId: input.evaluatorId,
    evaluatorVersion: input.evaluatorVersion,
    policyRevision: input.policyRevision,
    qualificationSuiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    entryPointExport: input.entryPointExport,
    sourceFiles,
    implementationDigestSha256: "0".repeat(64),
    dependencies,
    dependencySetDigestSha256: "0".repeat(64),
    visualModels,
    modelSetDigestSha256: "0".repeat(64),
    contractFiles,
    evaluationContractDigestSha256: "0".repeat(64),
  } as StudioAtelierEvaluatorBinding;
  draft.implementationDigestSha256 = deriveStudioAtelierEvaluatorImplementationDigest(draft);
  draft.dependencySetDigestSha256 = deriveStudioAtelierEvaluatorDependencyDigest(draft);
  draft.modelSetDigestSha256 = deriveStudioAtelierEvaluatorModelDigest(draft);
  draft.evaluationContractDigestSha256 = deriveStudioAtelierEvaluationContractDigest(draft);
  return draft;
}

function buildEvaluatorBindings(input: Readonly<{
  evaluators: readonly EvaluatorInput[];
  files: ReadonlyMap<string, CopiedFile>;
  state: MutableAssemblyState;
}>): StudioAtelierEvaluatorBinding[] {
  const expectedKinds = ["TECHNICAL", "SEMANTIC"] as const;
  const actualKinds = input.evaluators.map((item) => item.evaluatorKind);
  if (canonicalStringify(actualKinds) !== canonicalStringify(expectedKinds)) {
    addBlocker(
      input.state,
      "EVALUATOR_SET_INCOMPLETE",
      "evaluators",
      "Evaluator inputs must contain TECHNICAL then SEMANTIC exactly.",
    );
  }
  return expectedKinds.flatMap((kind) => {
    const source = input.evaluators.find((item) => item.evaluatorKind === kind);
    if (!source) return [];
    const binding = buildEvaluatorBinding(source, input.files, input.state);
    return binding ? [binding] : [];
  });
}


function emptyReport(input: Readonly<{
  packetRoot: string;
  manifestPath: string;
  blockers: readonly StudioAtelierQualificationAssemblyBlocker[];
}>): StudioAtelierQualificationAssemblyReport {
  return {
    schemaVersion: ASSEMBLY_REPORT_SCHEMA_VERSION,
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    packetState: "DRAFT",
    status: "BLOCKED",
    productionQualificationInstalled: false,
    providerCallsMade: 0,
    packetRoot: input.packetRoot,
    manifestPath: input.manifestPath,
    expected: {
      caseIds: STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((item) => item.caseId),
      roomStageCells: STUDIO_ATELIER_ROOM_STAGE_MATRIX.map((item) => ({ ...item })),
      evaluatorKinds: ["TECHNICAL", "SEMANTIC"],
    },
    assembled: {
      copiedEvidenceFiles: 0,
      caseRecords: 0,
      roomStageRecords: 0,
      evaluatorBindings: 0,
      evidenceContentSha256: null,
      reviewRequest: null,
      qualificationPacket: null,
    },
    copiedFiles: [],
    warnings: [],
    blockers: input.blockers,
  };
}

export async function assembleStudioAtelierQualificationEvidence(options: Readonly<{
  repositoryRoot: string;
  sourceRoot: string;
  manifestPath: string;
  outputRoot: string;
  allowOutputOutsidePrivateStagingForTests?: boolean;
}>): Promise<StudioAtelierQualificationAssemblyReport> {
  const repositoryRoot = resolve(options.repositoryRoot);
  const sourceRoot = resolve(options.sourceRoot);
  const manifestPath = resolve(options.manifestPath);
  const outputRoot = resolve(options.outputRoot);
  const state: MutableAssemblyState = { blockers: [], warnings: [] };

  let canonicalSourceRoot: string;
  try {
    canonicalSourceRoot = await realpath(sourceRoot);
  } catch {
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: [{
        code: "SOURCE_ROOT_UNREADABLE",
        location: "sourceRoot",
        message: "The declared source root is missing or unreadable.",
      }],
    });
  }
  const privateStagingRoot = resolve(repositoryRoot, PRIVATE_STAGING_ROOT);
  if (
    !options.allowOutputOutsidePrivateStagingForTests
    && !containedByRoot(privateStagingRoot, outputRoot)
  ) {
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: [{
        code: "OUTPUT_ROOT_NOT_PRIVATE_STAGING",
        location: "outputRoot",
        message: `The packet root must remain inside ${PRIVATE_STAGING_ROOT}.`,
      }],
    });
  }

  let canonicalManifestPath: string;
  try {
    canonicalManifestPath = await realpath(manifestPath);
  } catch (error) {
    const code = typeof error === "object" && error && "code" in error
      ? String((error as { code?: unknown }).code)
      : "";
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: [{
        code: code === "ENOENT" ? "MANIFEST_MISSING" : "MANIFEST_UNREADABLE",
        location: "manifestPath",
        message: code === "ENOENT"
          ? "The explicit hash-bound assembly manifest is missing."
          : "The assembly manifest cannot be read.",
      }],
    });
  }
  if (!containedByRoot(canonicalSourceRoot, canonicalManifestPath)) {
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: [{
        code: "MANIFEST_PATH_OUTSIDE_SOURCE_ROOT",
        location: "manifestPath",
        message: "The assembly manifest path or symlink escapes the declared source root.",
      }],
    });
  }
  const manifestBytes = await readFile(canonicalManifestPath);

  let rawManifest: unknown;
  try {
    rawManifest = JSON.parse(manifestBytes.toString("utf8")) as unknown;
  } catch {
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: [{
        code: "MANIFEST_JSON_INVALID",
        location: "manifestPath",
        message: "The assembly manifest is not valid JSON.",
      }],
    });
  }
  const parsedManifest = assemblyInputSchema.safeParse(rawManifest);
  if (!parsedManifest.success) {
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: parsedManifest.error.issues.map((issue) => ({
        code: "MANIFEST_SCHEMA_INVALID",
        location: issue.path.join(".") || "manifest",
        message: issue.message,
      })),
    });
  }
  const manifest = parsedManifest.data;
  await mkdir(outputRoot, { recursive: true, mode: 0o700 });
  if ((await lstat(outputRoot)).isSymbolicLink()) {
    return emptyReport({
      packetRoot: outputRoot,
      manifestPath,
      blockers: [{
        code: "OUTPUT_ROOT_SYMLINKED",
        location: "outputRoot",
        message: "The packet root must not resolve through a symlink.",
      }],
    });
  }
  if (!options.allowOutputOutsidePrivateStagingForTests) {
    const [canonicalPrivateStagingRoot, canonicalOutputRoot] = await Promise.all([
      realpath(privateStagingRoot),
      realpath(outputRoot),
    ]);
    if (!containedByRoot(canonicalPrivateStagingRoot, canonicalOutputRoot)) {
      return emptyReport({
        packetRoot: outputRoot,
        manifestPath,
        blockers: [{
          code: "OUTPUT_ROOT_SYMLINK_ESCAPE",
          location: "outputRoot",
          message: "The packet root escapes private staging through an ancestor symlink.",
        }],
      });
    }
  }

  const referencedPaths = referencedEvidencePaths(manifest);
  const declarationByDestination = new Map(
    manifest.sources.map((item) => [item.destinationPath, item]),
  );
  for (const evidencePath of referencedPaths) {
    if (!declarationByDestination.has(evidencePath)) {
      addBlocker(
        state,
        "SOURCE_DECLARATION_MISSING",
        `sources.${evidencePath}`,
        "Every referenced evidence path requires an exact hash-bound source declaration.",
      );
    }
  }
  for (const declaration of manifest.sources) {
    if (!referencedPaths.has(declaration.destinationPath)) {
      state.warnings.push(`Skipped unreferenced source declaration: ${declaration.destinationPath}`);
    }
  }

  const copied = new Map<string, CopiedFile>();
  for (const evidencePath of [...referencedPaths].sort()) {
    const declaration = declarationByDestination.get(evidencePath);
    if (!declaration) continue;
    const result = await copyDeclaredFile({
      declaration,
      sourceRoot: canonicalSourceRoot,
      outputRoot,
      state,
    });
    if (result) copied.set(evidencePath, result);
  }

  const adapterResult = manifest.adapterBinding === undefined
    ? null
    : studioAtelierQualificationEvidencePacketSchema.shape.adapterBinding.safeParse(
      manifest.adapterBinding,
    );
  const adapterBinding = adapterResult?.success ? adapterResult.data : null;
  if (!adapterBinding) {
    addBlocker(
      state,
      "ADAPTER_BINDING_MISSING_OR_INVALID",
      "adapterBinding",
      adapterResult && !adapterResult.success
        ? adapterResult.error.issues.map((issue) => issue.message).join(" ")
        : "The exact current adapter binding is required.",
    );
  }
  const actorsResult = manifest.actors === undefined
    ? null
    : studioAtelierQualificationEvidencePacketSchema.shape.actors.safeParse(manifest.actors);
  const actors = actorsResult?.success ? actorsResult.data : null;
  if (!actors) {
    addBlocker(
      state,
      "ACTORS_MISSING_OR_INVALID",
      "actors",
      actorsResult && !actorsResult.success
        ? actorsResult.error.issues.map((issue) => issue.message).join(" ")
        : "Evidence authors and qualification operators are required.",
    );
  }

  const rawCases = buildCaseRecords({ cases: manifest.cases, files: copied, state });
  const caseTupleResult = studioAtelierQualificationCaseEvidenceSchema.safeParse(rawCases);
  const cases = caseTupleResult.success ? caseTupleResult.data : null;
  if (!cases) {
    addBlocker(
      state,
      "CASE_RECORDS_INVALID",
      "cases",
      caseTupleResult.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const rawRoomStageEvidence = buildRoomStageRecords({
    roomStageEvidence: manifest.roomStageEvidence,
    files: copied,
    state,
  });
  const roomTupleResult = studioAtelierRoomStageEvidenceSchema.safeParse(rawRoomStageEvidence);
  const roomStageEvidence = roomTupleResult.success ? roomTupleResult.data : null;
  if (!roomStageEvidence) {
    addBlocker(
      state,
      "ROOM_STAGE_RECORDS_INVALID",
      "roomStageEvidence",
      roomTupleResult.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const rawEvaluators = buildEvaluatorBindings({
    evaluators: manifest.evaluators,
    files: copied,
    state,
  });
  const evaluatorTupleResult = studioAtelierEvaluatorBindingsSchema.safeParse(rawEvaluators);
  const evaluators = evaluatorTupleResult.success ? evaluatorTupleResult.data : null;
  if (!evaluators) {
    addBlocker(
      state,
      "EVALUATOR_BINDINGS_INVALID",
      "evaluators",
      evaluatorTupleResult.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const assertionsSatisfied = Boolean(
    cases
    && cases.every((item) => item.assertions.every((assertion) => assertion.result === "SATISFIED"))
    && roomStageEvidence
    && roomStageEvidence.every((item) =>
      item.assertions.every((assertion) => assertion.result === "SATISFIED")
    ),
  );
  if (!assertionsSatisfied) {
    addBlocker(
      state,
      "QUALIFICATION_ASSERTIONS_INCOMPLETE",
      "assertions",
      "Every exact case and room-stage assertion must be explicitly evidenced as SATISFIED.",
    );
  }

  const evidenceContentSha256 = null;
  const reviewRequest = null;
  const qualificationPacket = null;
  addBlocker(
    state,
    "DRAFT_REQUIRES_ASSERTION_VERIFIERS",
    "assertions",
    "This command inventories supplied evidence only. The exact case and room assertions require independent verification before qualification or human approval.",
  );
  const reviewFile = manifest.independentReviewReceiptPath
    ? copied.get(manifest.independentReviewReceiptPath) ?? null
    : null;
  if (!reviewFile) addBlocker(
    state, "REVIEW_RECEIPT_MISSING", "independentReviewReceiptPath",
    "The exact completed evidence requires a separately signed independent review.",
  );
  const trustPolicyFile = manifest.reviewerTrustPolicyPath
    ? copied.get(manifest.reviewerTrustPolicyPath) ?? null
    : null;
  if (!trustPolicyFile) addBlocker(
    state, "TRUST_POLICY_MISSING", "reviewerTrustPolicyPath",
    "An independently pinned reviewer trust policy is required by the offline verifier.",
  );
  const copiedFiles = [...copied.values()].map((item) => ({
    sourcePath: item.sourcePath,
    destinationPath: item.destinationPath,
    mediaType: item.mediaType,
    sourceSha256: item.sourceSha256,
    sourceByteSize: item.sourceByteSize,
    outputSha256: item.outputSha256,
    outputByteSize: item.outputByteSize,
    canonicalizedJson: item.canonicalizedJson,
  }));
  const report: StudioAtelierQualificationAssemblyReport = {
    schemaVersion: ASSEMBLY_REPORT_SCHEMA_VERSION,
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    packetState: "DRAFT",
    status: "BLOCKED",
    productionQualificationInstalled: false,
    providerCallsMade: 0,
    packetRoot: outputRoot,
    manifestPath,
    expected: {
      caseIds: STUDIO_ATELIER_QUALIFICATION_CASE_SPECS.map((item) => item.caseId),
      roomStageCells: STUDIO_ATELIER_ROOM_STAGE_MATRIX.map((item) => ({ ...item })),
      evaluatorKinds: ["TECHNICAL", "SEMANTIC"],
    },
    assembled: {
      copiedEvidenceFiles: copiedFiles.length,
      caseRecords: rawCases.length,
      roomStageRecords: rawRoomStageEvidence.length,
      evaluatorBindings: rawEvaluators.length,
      evidenceContentSha256,
      reviewRequest,
      qualificationPacket,
    },
    copiedFiles,
    warnings: state.warnings,
    blockers: state.blockers,
  };
  const draft = {
    schemaVersion: DRAFT_SCHEMA_VERSION,
    suiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    packetRevision: manifest.packetRevision,
    createdAt: manifest.createdAt,
    packetState: report.packetState,
    status: report.status,
    productionQualificationInstalled: false,
    providerCallsMade: 0,
    adapterBinding,
    actors,
    cases: rawCases,
    roomStageEvidence: rawRoomStageEvidence,
    evaluators: rawEvaluators,
    evidenceContentSha256,
    independentReviewReceipt: reviewFile?.reference ?? null,
    reviewerTrustPolicy: trustPolicyFile?.reference ?? null,
    blockers: report.blockers,
  };
  await writeCanonicalJsonReplacing(
    resolve(outputRoot, "qualification-evidence.draft.json"),
    draft,
  );
  await writeCanonicalJsonReplacing(resolve(outputRoot, "assembly-report.json"), report);
  return report;
}

function argumentValue(name: string): string | null {
  const inlinePrefix = `${name}=`;
  const inline = process.argv.slice(2).find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}

async function runCli(): Promise<void> {
  if (process.argv.includes("--help")) {
    process.stdout.write([
      "Zero-spend private Atelier qualification evidence assembler.",
      "",
      "Usage:",
      "  npx tsx scripts/virtual-atelier/assemble-qualification-evidence.mts [options]",
      "",
      "Options:",
      "  --repository-root <path>  Default: current working directory",
      "  --source-root <path>      Default: repository root",
      `  --manifest <path>         Default: ${DEFAULT_MANIFEST_PATH}`,
      `  --output-root <path>      Default: ${DEFAULT_OUTPUT_ROOT}`,
      "  --compact                 Emit compact JSON",
      "",
      `Output must remain under ${PRIVATE_STAGING_ROOT}.`,
      "The command never calls a provider, never creates keys, never installs qualification,",
      "and never converts an unverified assertion into SATISFIED.",
      "",
    ].join("\n"));
    return;
  }
  const repositoryRoot = resolve(argumentValue("--repository-root") ?? process.cwd());
  const sourceRoot = resolve(repositoryRoot, argumentValue("--source-root") ?? ".");
  const manifestPath = resolve(sourceRoot, argumentValue("--manifest") ?? DEFAULT_MANIFEST_PATH);
  const outputRoot = resolve(repositoryRoot, argumentValue("--output-root") ?? DEFAULT_OUTPUT_ROOT);
  const report = await assembleStudioAtelierQualificationEvidence({
    repositoryRoot,
    sourceRoot,
    manifestPath,
    outputRoot,
  });
  process.stdout.write(`${JSON.stringify(report, null, process.argv.includes("--compact") ? 0 : 2)}\n`);
  process.exitCode = report.status === "BLOCKED" ? 1 : 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : null;
if (invokedPath && pathToFileURL(invokedPath).href === import.meta.url) {
  await runCli();
}

export const STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_INPUT_SCHEMA_VERSION =
  ASSEMBLY_INPUT_SCHEMA_VERSION;
export const STUDIO_ATELIER_QUALIFICATION_ASSEMBLY_REPORT_SCHEMA_VERSION =
  ASSEMBLY_REPORT_SCHEMA_VERSION;
export const STUDIO_ATELIER_QUALIFICATION_PRIVATE_STAGING_ROOT = PRIVATE_STAGING_ROOT;
export const STUDIO_ATELIER_QUALIFICATION_ASSEMBLER_PATH = fileURLToPath(import.meta.url);
