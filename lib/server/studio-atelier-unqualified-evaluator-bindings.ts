import { canonicalStringify } from "../studio/atelier/canonical";
import {
  STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION,
  STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
  deriveStudioAtelierEvaluationContractDigest,
  deriveStudioAtelierEvaluatorDependencyDigest,
  deriveStudioAtelierEvaluatorImplementationDigest,
  deriveStudioAtelierEvaluatorModelDigest,
  type StudioAtelierEvidenceFileReference,
} from "../studio/atelier/qualification-contracts";
import {
  STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_ID,
  STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_VERSION,
  STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_POLICY_REVISION,
} from "./studio-atelier-deterministic-technical-evaluator";
import {
  STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_ID,
  STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_VERSION,
  STUDIO_ATELIER_STRUCTURAL_SEMANTIC_POLICY_REVISION,
} from "./studio-atelier-structural-semantic-evaluator";

export const STUDIO_ATELIER_RELEASE_2_BINDING_SCHEMA_VERSION =
  "juw.atelier-unqualified-evaluator-release-binding.v1" as const;

export const STUDIO_ATELIER_RELEASE_2_MISSING_QUALIFICATION = Object.freeze([
  "SIX_CASE_REAL_EVIDENCE_PACKET",
  "EIGHT_NATIVE_ROOM_PROFILE_STAGE_EVIDENCE_CELLS",
  "PRIVACY_APPROVED_VERSION_LOCKED_VISUAL_EVALUATOR",
  "AUTHORIZED_INDEPENDENT_HUMAN_REVIEW_RECEIPT",
  "CANONICAL_QUALIFICATION_RECEIPT",
] as const);

export const STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS = Object.freeze({
  technical: Object.freeze([
    "lib/server/studio-atelier-deterministic-technical-evaluator.ts",
    "lib/server/studio-atelier-subject-compositor.ts",
    "lib/studio/atelier/canonical.ts",
    "lib/studio/atelier/canvas-policy.ts",
    "lib/studio/atelier/contracts.ts",
  ] as const),
  semantic: Object.freeze([
    "lib/server/studio-atelier-structural-semantic-evaluator.ts",
    "lib/studio/atelier/canonical.ts",
    "lib/studio/atelier/contracts.ts",
    "lib/studio/atelier/g004-provider-denial.ts",
  ] as const),
  contract: Object.freeze([
    "lib/studio/atelier/qualification-contracts.ts",
    "lib/studio/atelier/quality-contracts.ts",
  ] as const),
} as const);

export type StudioAtelierReleaseDependencyBinding = Readonly<{
  packageName: string;
  version: string;
  integritySha256: string;
  evidenceFile: StudioAtelierEvidenceFileReference;
}>;

export type StudioAtelierRelease2BindingInput = Readonly<{
  technicalSourceFiles: readonly StudioAtelierEvidenceFileReference[];
  semanticSourceFiles: readonly StudioAtelierEvidenceFileReference[];
  contractFiles: readonly StudioAtelierEvidenceFileReference[];
  technicalDependencies: readonly StudioAtelierReleaseDependencyBinding[];
  semanticDependencies: readonly StudioAtelierReleaseDependencyBinding[];
}>;

type UnqualifiedEvaluatorBinding = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION;
  evaluatorKind: "TECHNICAL" | "SEMANTIC";
  evaluatorId: string;
  evaluatorVersion: string;
  policyRevision: string;
  qualificationSuiteVersion: typeof STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION;
  entryPointExport: string;
  sourceFiles: readonly StudioAtelierEvidenceFileReference[];
  implementationDigestSha256: string;
  dependencies: readonly StudioAtelierReleaseDependencyBinding[];
  dependencySetDigestSha256: string;
  visualModels: readonly [];
  modelSetDigestSha256: string;
  contractFiles: readonly StudioAtelierEvidenceFileReference[];
  evaluationContractDigestSha256: string;
}>;

export type StudioAtelierRelease2UnqualifiedBindings = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_RELEASE_2_BINDING_SCHEMA_VERSION;
  status: "UNQUALIFIED_IMPLEMENTATION_ONLY";
  productionInstallable: false;
  missingQualification: typeof STUDIO_ATELIER_RELEASE_2_MISSING_QUALIFICATION;
  technical: UnqualifiedEvaluatorBinding;
  semantic: UnqualifiedEvaluatorBinding;
}>;

function exactOrderedPaths(
  files: readonly StudioAtelierEvidenceFileReference[],
  expected: readonly string[],
): boolean {
  return canonicalStringify(files.map((file) => file.relativePath))
    === canonicalStringify(expected);
}

function exactDependencies(
  dependencies: readonly StudioAtelierReleaseDependencyBinding[],
  expected: readonly Readonly<{ packageName: string; version: string }>[],
): boolean {
  return canonicalStringify(dependencies.map(({ packageName, version }) => ({
    packageName,
    version,
  }))) === canonicalStringify(expected);
}

function bindEvaluator(input: Readonly<{
  evaluatorKind: "TECHNICAL" | "SEMANTIC";
  evaluatorId: string;
  evaluatorVersion: string;
  policyRevision: string;
  entryPointExport: string;
  sourceFiles: readonly StudioAtelierEvidenceFileReference[];
  dependencies: readonly StudioAtelierReleaseDependencyBinding[];
  contractFiles: readonly StudioAtelierEvidenceFileReference[];
}>): UnqualifiedEvaluatorBinding {
  const base = {
    schemaVersion: STUDIO_ATELIER_EVALUATOR_BINDING_SCHEMA_VERSION,
    evaluatorKind: input.evaluatorKind,
    evaluatorId: input.evaluatorId,
    evaluatorVersion: input.evaluatorVersion,
    policyRevision: input.policyRevision,
    qualificationSuiteVersion: STUDIO_ATELIER_QUALIFICATION_SUITE_VERSION,
    entryPointExport: input.entryPointExport,
    sourceFiles: Object.freeze([...input.sourceFiles]),
    implementationDigestSha256: "",
    dependencies: Object.freeze([...input.dependencies]),
    dependencySetDigestSha256: "",
    visualModels: Object.freeze([] as const),
    modelSetDigestSha256: "",
    contractFiles: Object.freeze([...input.contractFiles]),
    evaluationContractDigestSha256: "",
  };
  return Object.freeze({
    ...base,
    implementationDigestSha256: deriveStudioAtelierEvaluatorImplementationDigest(base),
    dependencySetDigestSha256: deriveStudioAtelierEvaluatorDependencyDigest(base),
    modelSetDigestSha256: deriveStudioAtelierEvaluatorModelDigest(base),
    evaluationContractDigestSha256: deriveStudioAtelierEvaluationContractDigest(base),
  });
}

/**
 * Produces exact implementation/dependency digests, but deliberately no visual
 * model or qualification receipt. The semantic binding therefore cannot pass
 * the production qualification schema and cannot be installed as a bundle.
 */
export function bindStudioAtelierRelease2Implementations(
  input: StudioAtelierRelease2BindingInput,
): StudioAtelierRelease2UnqualifiedBindings {
  if (
    !exactOrderedPaths(
      input.technicalSourceFiles,
      STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS.technical,
    )
    || !exactOrderedPaths(
      input.semanticSourceFiles,
      STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS.semantic,
    )
    || !exactOrderedPaths(
      input.contractFiles,
      STUDIO_ATELIER_RELEASE_2_REQUIRED_SOURCE_PATHS.contract,
    )
    || !exactDependencies(input.technicalDependencies, [
      { packageName: "sharp", version: "0.34.5" },
      { packageName: "zod", version: "4.4.3" },
    ])
    || !exactDependencies(input.semanticDependencies, [
      { packageName: "zod", version: "4.4.3" },
    ])
  ) {
    throw new TypeError(
      "Release 2 requires the exact ordered implementation, contract and dependency evidence set.",
    );
  }

  const technical = bindEvaluator({
    evaluatorKind: "TECHNICAL",
    evaluatorId: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_ID,
    evaluatorVersion: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_EVALUATOR_VERSION,
    policyRevision: STUDIO_ATELIER_DETERMINISTIC_TECHNICAL_POLICY_REVISION,
    entryPointExport:
      "lib/server/studio-atelier-deterministic-technical-evaluator.ts#evaluateStudioAtelierDeterministicTechnicalQuality",
    sourceFiles: input.technicalSourceFiles,
    dependencies: input.technicalDependencies,
    contractFiles: input.contractFiles,
  });
  const semantic = bindEvaluator({
    evaluatorKind: "SEMANTIC",
    evaluatorId: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_ID,
    evaluatorVersion: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_EVALUATOR_VERSION,
    policyRevision: STUDIO_ATELIER_STRUCTURAL_SEMANTIC_POLICY_REVISION,
    entryPointExport:
      "lib/server/studio-atelier-structural-semantic-evaluator.ts#evaluateStudioAtelierStructuralSemanticPreflight",
    sourceFiles: input.semanticSourceFiles,
    dependencies: input.semanticDependencies,
    contractFiles: input.contractFiles,
  });
  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_RELEASE_2_BINDING_SCHEMA_VERSION,
    status: "UNQUALIFIED_IMPLEMENTATION_ONLY",
    productionInstallable: false,
    missingQualification: STUDIO_ATELIER_RELEASE_2_MISSING_QUALIFICATION,
    technical,
    semantic,
  });
}
