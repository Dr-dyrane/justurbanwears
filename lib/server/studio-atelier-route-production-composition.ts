import {
  canonicalStringify,
  sha256Text,
} from "../studio/atelier/canonical";
import { StudioEngineError } from "../studio/engine/errors";
import type {
  CreateStudioAtelierProductionRuntimeInput,
  StudioAtelierProductionPorts,
  StudioAtelierProductionReadinessDeclarations,
  StudioAtelierProductionRuntime,
} from "./studio-atelier-production-runtime";
import type { StudioAtelierProductionReadinessProbeReport } from "./studio-atelier-production-readiness";
import type { StudioAtelierQualifiedEvaluatorBundle } from "./studio-atelier-qualified-evaluator";
import type {
  StudioAtelierProductionDeclarationService,
} from "./studio-atelier-production-declarations";
import type {
  StudioAtelierWardrobeSourceBindingReceipt,
} from "./studio-atelier-stage-declaration-factory";

export type StudioAtelierRouteProductionCompositionDependencies = Readonly<{
  resolveQualifiedEvaluatorBundle(): StudioAtelierQualifiedEvaluatorBundle | null;
  verifyQualifiedEvaluatorBundle(
    value: StudioAtelierQualifiedEvaluatorBundle | null,
  ): StudioAtelierQualifiedEvaluatorBundle | null;
  probeReadiness(): Promise<StudioAtelierProductionReadinessProbeReport>;
  createPorts(): Promise<StudioAtelierProductionPorts> | StudioAtelierProductionPorts;
  createRuntime(
    input: CreateStudioAtelierProductionRuntimeInput,
  ): Promise<StudioAtelierProductionRuntime>;
}>;

type RouteDeclarationDependencies = Readonly<{
  createStageDeclarationFactory:
    typeof import("./studio-atelier-stage-declaration-factory").createStudioAtelierStageDeclarationFactory;
  createProductionDeclarationService:
    typeof import("./studio-atelier-production-declarations").createStudioAtelierProductionDeclarationService;
  readWardrobeTruth:
    typeof import("./studio-atelier-stage-declaration-factory").readPersistedStudioAtelierWardrobeTruth;
  readLockedParents:
    typeof import("./studio-atelier-stage-declaration-factory").readCanonicalStudioAtelierLockedParents;
  resolveFashionNovaCheck:
    typeof import("./studio-atelier-fashion-nova-advisory-repository").resolveStudioAtelierFashionNovaCheck;
}>;

const QUALIFICATION_RECOVERY =
  "QUALIFICATION_NOT_PASSED: install the canonical receipt-bound evaluator bundle, then verify the server-owned ports, ledger migration, private store, authority, policy, and room readiness as one release atom.";
const PREFLIGHT_RECOVERY =
  "Restore and verify the server-owned ledger migration, private store, authority, OpenAI-only policy, G004 readback, and approved room as one release atom. No paid work was started.";

function disabled(recovery: string): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_DISABLED",
    503,
    "The durable Atelier production runtime is not enabled on this host.",
    recovery,
  );
}

function exactPrequalificationDeclarations(
  report: StudioAtelierProductionReadinessProbeReport,
): StudioAtelierProductionReadinessDeclarations {
  const evidence = report.evidence;
  const onlyQualificationRemains = report.blockers.length === 1
    && report.blockers[0]?.code === "QUALIFICATION_NOT_PASSED";
  if (
    report.prequalificationStatus !== "VERIFIED"
    || report.qualificationStatus !== "NOT_VERIFIED"
    || report.productionStatus !== "BLOCKED"
    || report.readyForQualification !== true
    || report.constructionAllowed !== false
    || !onlyQualificationRemains
    || !evidence.database
    || !evidence.privateStore
    || !evidence.aiPolicy
    || !evidence.privateAuthority
    || !evidence.g004Calibration
    || !evidence.approvedRoom
  ) {
    throw disabled(PREFLIGHT_RECOVERY);
  }
  return Object.freeze({
    database: evidence.database,
    privateStore: evidence.privateStore,
    aiPolicy: evidence.aiPolicy,
    privateAuthority: evidence.privateAuthority,
    approvedRoom: evidence.approvedRoom,
  });
}

/**
 * Converts the exact source binding into the same trusted-truth hash used by
 * the production ports for non-garment stages. The Fashion Nova record must
 * bind this value before it can enter the final-05 declaration.
 */
export function deriveStudioAtelierRouteGarmentTruthSourceHash(
  sourceBinding: StudioAtelierWardrobeSourceBindingReceipt,
): string {
  return sha256Text(canonicalStringify({
    facts: [...sourceBinding.garmentTruth.facts],
    unknownFacts: [...sourceBinding.garmentTruth.unknownFacts],
    prohibitedInferences: [...sourceBinding.garmentTruth.prohibitedInferences],
    rearEvidenceBasis: sourceBinding.garmentTruth.rearEvidenceBasis,
  }));
}

/**
 * Installs the exact advisory resolver without weakening the shared stage
 * factory port. A fresh factory is created per call, so concurrent garments
 * cannot share captured truth. The binding helper reuses the factory's own
 * persisted-truth verification; no current-row-only advisory lookup exists.
 */
export function createStudioAtelierRouteProductionDeclarationService(
  dependencies: RouteDeclarationDependencies,
): StudioAtelierProductionDeclarationService {
  return dependencies.createProductionDeclarationService({
    resolveCanonicalDeclaration: async (request) => {
      let exactSourceBinding: StudioAtelierWardrobeSourceBindingReceipt | null = null;
      const factory = dependencies.createStageDeclarationFactory({
        readWardrobeTruth: async (lookup) => {
          const truth = await dependencies.readWardrobeTruth(lookup);
          if (!truth || request.stage !== "ROOM_FINAL_05") return truth;

          const bindingFactory = dependencies.createStageDeclarationFactory({
            readWardrobeTruth: async (bindingLookup) =>
              bindingLookup.operatorSubject === lookup.operatorSubject
                && bindingLookup.wardrobeItemId === lookup.wardrobeItemId
                ? truth
                : null,
            readLockedParents: async () => Object.freeze([]),
            readFashionNovaAdvisory: async () => null,
          });
          const binding = await bindingFactory.create({
            operatorSubject: lookup.operatorSubject,
            wardrobeItemId: lookup.wardrobeItemId,
            stage: "GARMENT_01_FRONT",
          });
          exactSourceBinding = binding.sourceBinding;
          return truth;
        },
        readLockedParents: dependencies.readLockedParents,
        readFashionNovaAdvisory: async (lookup) => {
          const binding = exactSourceBinding;
          if (
            !binding
            || binding.wardrobeItemId !== lookup.wardrobeItemId
            || binding.garmentId !== lookup.garmentId
          ) return null;
          return dependencies.resolveFashionNovaCheck({
            operatorSubject: lookup.operatorSubject,
            wardrobeItemId: lookup.wardrobeItemId,
            wardrobeVersion: binding.wardrobeVersion,
            sourceBindingSha256: binding.bindingSha256,
            garmentTruthRevision:
              `wardrobe-truth:${binding.wardrobeItemId}:v${binding.wardrobeVersion}`,
            garmentTruthSourceHash:
              deriveStudioAtelierRouteGarmentTruthSourceHash(binding),
          });
        },
      });
      return factory.create(request);
    },
  });
}

/**
 * Qualification is checked before the readiness probe or any production port
 * is constructed. The production constructor independently resolves and
 * verifies the same bundle again, so this seam cannot turn an injected or
 * caller-authored PASS object into dispatch authority.
 */
export function createStudioAtelierRouteProductionRuntimeComposer(
  dependencies: StudioAtelierRouteProductionCompositionDependencies,
): () => Promise<StudioAtelierProductionRuntime> {
  return async () => {
    const qualification = dependencies.verifyQualifiedEvaluatorBundle(
      dependencies.resolveQualifiedEvaluatorBundle(),
    );
    if (!qualification) throw disabled(QUALIFICATION_RECOVERY);

    let report: StudioAtelierProductionReadinessProbeReport;
    try {
      report = await dependencies.probeReadiness();
    } catch {
      throw disabled(PREFLIGHT_RECOVERY);
    }
    const readiness = exactPrequalificationDeclarations(report);
    const ports = await dependencies.createPorts();
    return dependencies.createRuntime({ ports, readiness });
  };
}

/** Default server composition. Every I/O-bearing module is loaded only after
 * the checked-in qualification resolver returns a verified canonical bundle. */
export async function loadStudioAtelierRouteProductionRuntime(): Promise<
  StudioAtelierProductionRuntime
> {
  const qualificationModule = await import("./studio-atelier-qualified-evaluator");
  const compose = createStudioAtelierRouteProductionRuntimeComposer({
    resolveQualifiedEvaluatorBundle:
      qualificationModule.resolveStudioAtelierQualifiedEvaluatorBundle,
    verifyQualifiedEvaluatorBundle:
      qualificationModule.verifyStudioAtelierQualifiedEvaluatorBundle,
    probeReadiness: async () =>
      (await import("./studio-atelier-production-readiness"))
        .probeStudioAtelierProductionReadiness(),
    createPorts: async () => {
      const [
        portsModule,
        declarationsModule,
        stageFactoryModule,
        consentModule,
        advisoryModule,
      ] = await Promise.all([
        import("./studio-atelier-production-ports"),
        import("./studio-atelier-production-declarations"),
        import("./studio-atelier-stage-declaration-factory"),
        import("./studio-atelier-consent-repository"),
        import("./studio-atelier-fashion-nova-advisory-repository"),
      ]);
      const declarations = createStudioAtelierRouteProductionDeclarationService({
        createStageDeclarationFactory:
          stageFactoryModule.createStudioAtelierStageDeclarationFactory,
        createProductionDeclarationService:
          declarationsModule.createStudioAtelierProductionDeclarationService,
        readWardrobeTruth:
          stageFactoryModule.readPersistedStudioAtelierWardrobeTruth,
        readLockedParents:
          stageFactoryModule.readCanonicalStudioAtelierLockedParents,
        resolveFashionNovaCheck:
          advisoryModule.resolveStudioAtelierFashionNovaCheck,
      });
      return portsModule.createStudioAtelierProductionPorts({
        declarations,
        resolveProviderRetentionConsent:
          consentModule.resolveStudioAtelierProviderRetentionConsent,
        resolveAdultLikenessAuthority:
          consentModule.resolveStudioAtelierAdultLikenessAuthority,
      });
    },
    createRuntime: async (input) =>
      (await import("./studio-atelier-production-runtime"))
        .createStudioAtelierProductionRuntime(input),
  });
  return compose();
}
