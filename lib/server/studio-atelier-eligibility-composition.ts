import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { getStudioDb } from "../../db/shop-postgres";
import {
  studioAtelierOperationProjections,
  studioAtelierOperations,
} from "../../db/shop-postgres-schema";
import {
  ATELIER_STAGE_RECIPES,
  atelierStageSchema,
  type AtelierStage,
  type ParentLock,
} from "../studio/atelier/contracts";
import type { StudioAtelierEligibilityEvidence } from "./studio-atelier-eligibility-service";
import {
  createStudioAtelierEligibilityService,
  STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER,
} from "./studio-atelier-eligibility-service";
import { readDurableStudioAtelierProjection } from "./studio-atelier-durable-engine";
import type { StudioAtelierCommandResult } from "./studio-atelier-engine-facade";
import { StudioEngineError } from "../studio/engine/errors";
import {
  createStudioAtelierProductionSourceRepository,
  type StudioAtelierProductionSourceRepository,
} from "./studio-atelier-production-source-repository";
import {
  isStudioAtelierStageDispatchReady,
  type StudioAtelierProductionRuntime,
} from "./studio-atelier-production-runtime";
import { resolveStudioAtelierQualifiedEvaluatorBundle } from "./studio-atelier-qualified-evaluator";
import { loadStudioAtelierRouteRuntime } from "./studio-atelier-route-runtime";
import {
  createStudioAtelierStageDeclarationFactory,
  readPersistedStudioAtelierWardrobeTruth,
  type StudioAtelierPersistedWardrobeTruth,
} from "./studio-atelier-stage-declaration-factory";
import {
  atelierStageFamily,
} from "./studio-engine-work-ownership-service";
import {
  readStudioEngineWorkOwnership,
  type StudioEngineWorkOwnershipRead,
} from "./studio-engine-work-ownership-reader";
import { getOwnedWardrobeItem } from "./studio-intake-repository";

type StageEvidence = StudioAtelierEligibilityEvidence["stages"][number];
type RuntimeEvidence = StageEvidence["runtime"];

const wardrobeSummarySchema = z.object({
  id: z.string().uuid(),
  title: z.string().trim().min(1).max(240),
  state: z.enum(["DRAFT", "READY", "ARCHIVED"]),
  version: z.number().int().positive(),
  approvedAssetId: z.string().uuid().nullable(),
}).passthrough();

const currentOperationRowSchema = z.object({
  operationId: z.string().uuid(),
  stage: atelierStageSchema,
  rootSemanticHash: z.string().regex(/^[0-9a-f]{64}$/),
  correctionOrdinal: z.number().int().min(0).max(1),
  state: z.enum([
    "DRAFT",
    "MATERIALIZED",
    "TECHNICAL_PASS",
    "TECHNICAL_FAIL",
    "SEMANTIC_PASS",
    "SEMANTIC_FAIL",
    "USER_APPROVED",
    "USER_REJECTED",
    "LOCKED",
    "SUPERSEDED",
    "BLOCKED_USER_DIRECTION",
  ]),
});

export type StudioAtelierCurrentAuthorizedOperation = Readonly<{
  operationId: string;
  stage: AtelierStage;
  correctionUsed: boolean;
}>;

type SourceContext = Readonly<{
  status: "VERIFIED" | "MISSING" | "UNAVAILABLE";
  garmentId: string | null;
  truth: StudioAtelierPersistedWardrobeTruth | null;
  lockedParents: readonly ParentLock[];
}>;

type WardrobeSummary = z.infer<typeof wardrobeSummarySchema>;

export type StudioAtelierEligibilityCompositionPorts = Readonly<{
  readWardrobeItem(operatorSubject: string, wardrobeItemId: string): Promise<unknown>;
  readSourceContext(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
    wardrobe: WardrobeSummary;
  }>): Promise<SourceContext>;
  readCurrentOperations(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<readonly StudioAtelierCurrentAuthorizedOperation[]>;
  readProjection(operatorSubject: string, operationId: string): Promise<StudioAtelierCommandResult>;
  readOwnership(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
    stageFamily: ReturnType<typeof atelierStageFamily>;
  }>): Promise<StudioEngineWorkOwnershipRead>;
  readRuntime(): Promise<Readonly<Record<AtelierStage, RuntimeEvidence>>>;
  canDeriveDeclaration?(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
    stage: AtelierStage;
    source: SourceContext;
  }>): Promise<boolean>;
}>;

function unavailableEligibility(): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    "Studio could not verify Atelier eligibility.",
    "Continue with current Intake while the server eligibility projection is restored.",
  );
}

/**
 * The only new repository read in this slice. It returns current operation IDs
 * only after binding both authenticated operator and exact Wardrobe item. One
 * correction may supersede its root inside a lineage; competing live lineages
 * fail closed instead of producing an arbitrary recovery link.
 */
export async function readCurrentAuthorizedStudioAtelierOperations(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<readonly StudioAtelierCurrentAuthorizedOperation[]> {
  const rows = await (await getStudioDb()).select({
    operationId: studioAtelierOperations.id,
    stage: studioAtelierOperations.stage,
    rootSemanticHash: studioAtelierOperations.rootSemanticHash,
    correctionOrdinal: studioAtelierOperations.correctionOrdinal,
    state: studioAtelierOperationProjections.state,
  }).from(studioAtelierOperations).innerJoin(
    studioAtelierOperationProjections,
    eq(studioAtelierOperationProjections.operationId, studioAtelierOperations.id),
  ).where(and(
    eq(studioAtelierOperations.operatorSubject, input.operatorSubject),
    eq(studioAtelierOperations.wardrobeItemId, input.wardrobeItemId),
  )).orderBy(
    desc(studioAtelierOperationProjections.updatedAt),
    desc(studioAtelierOperations.correctionOrdinal),
    desc(studioAtelierOperations.createdAt),
  );

  const parsedRows = rows.map((row) => currentOperationRowSchema.parse(row));
  const selected: StudioAtelierCurrentAuthorizedOperation[] = [];
  for (const stage of STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER) {
    const stageRows = parsedRows.filter((row) => row.stage === stage);
    const liveRows = stageRows.filter((row) => row.state !== "SUPERSEDED");
    const liveRoots = [...new Set(liveRows.map((row) => row.rootSemanticHash))];
    if (liveRoots.length > 1) throw unavailableEligibility();
    if (liveRoots.length === 0) continue;

    const lineage = liveRows.filter((row) => row.rootSemanticHash === liveRoots[0]);
    const highestOrdinal = Math.max(...lineage.map((row) => row.correctionOrdinal));
    const current = lineage.filter((row) => row.correctionOrdinal === highestOrdinal);
    if (current.length !== 1) throw unavailableEligibility();
    selected.push(Object.freeze({
      operationId: current[0]!.operationId,
      stage,
      correctionUsed: stageRows.some((row) =>
        row.rootSemanticHash === liveRoots[0] && row.correctionOrdinal === 1
      ),
    }));
  }
  return Object.freeze(selected);
}

async function defaultSourceContext(
  input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
    wardrobe: WardrobeSummary;
  }>,
  sourceRepository: StudioAtelierProductionSourceRepository,
): Promise<SourceContext> {
  const [truthResult, sourceResult] = await Promise.allSettled([
    readPersistedStudioAtelierWardrobeTruth(input),
    sourceRepository.resolveOwnedGarment(input),
  ]);
  const truth = truthResult.status === "fulfilled" ? truthResult.value : null;
  const source = sourceResult.status === "fulfilled" ? sourceResult.value : null;
  if (
    !truth
    || !source
    || truth.operatorSubject !== input.operatorSubject
    || truth.wardrobeItemId !== input.wardrobeItemId
    || source.operatorSubject !== input.operatorSubject
    || source.wardrobeItemId !== input.wardrobeItemId
    || source.wardrobeVersion !== input.wardrobe.version
  ) {
    return Object.freeze({
      status: input.wardrobe.approvedAssetId ? "UNAVAILABLE" : "MISSING",
      garmentId: null,
      truth: null,
      lockedParents: Object.freeze([]),
    });
  }

  let lockedParents: readonly ParentLock[] = Object.freeze([]);
  try {
    const locked = await sourceRepository.listLockedArtifacts(input);
    lockedParents = Object.freeze(locked
      .filter((item) => item.parent.garmentId === source.garmentId)
      .map((item) => item.parent));
  } catch {
    // Missing or unreadable locks become zero verified parents. Commands remain
    // blocked, while an independently authorized existing operation may still
    // be recovered read-only.
  }
  return Object.freeze({
    status: "VERIFIED",
    garmentId: source.garmentId,
    truth,
    lockedParents,
  });
}

function blockedRuntime(
  blockerCode: "QUALIFICATION_NOT_PASSED" | "RUNTIME_NOT_INSTALLED" | "ROOM_NOT_QUALIFIED",
): RuntimeEvidence {
  return Object.freeze({ state: "BLOCKED", blockerCode });
}

function runtimeMap(
  value: RuntimeEvidence | ((stage: AtelierStage) => RuntimeEvidence),
): Readonly<Record<AtelierStage, RuntimeEvidence>> {
  return Object.freeze(Object.fromEntries(
    STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map((stage) => [
      stage,
      typeof value === "function" ? value(stage) : value,
    ]),
  ) as Record<AtelierStage, RuntimeEvidence>);
}

async function defaultRuntimeEvidence(): Promise<Readonly<Record<AtelierStage, RuntimeEvidence>>> {
  if (!resolveStudioAtelierQualifiedEvaluatorBundle()) {
    return runtimeMap(blockedRuntime("QUALIFICATION_NOT_PASSED"));
  }

  let runtime: StudioAtelierProductionRuntime;
  try {
    runtime = await loadStudioAtelierRouteRuntime();
  } catch {
    return runtimeMap(blockedRuntime("RUNTIME_NOT_INSTALLED"));
  }
  return runtimeMap((stage) => isStudioAtelierStageDispatchReady(runtime.readiness, stage)
    ? Object.freeze({ state: "READY" as const, blockerCode: null })
    : blockedRuntime(stage === "ROOM_FINAL_05"
      || stage === "SIBLING_06"
      || stage === "SIBLING_07_CORE"
      || stage === "SIBLING_07_RECOVERY"
      ? "ROOM_NOT_QUALIFIED"
      : "RUNTIME_NOT_INSTALLED"));
}

async function readOwnershipByStage(
  ports: StudioAtelierEligibilityCompositionPorts,
  input: Readonly<{ operatorSubject: string; wardrobeItemId: string }>,
): Promise<Readonly<Record<AtelierStage, StageEvidence["ownership"]>>> {
  const families = [...new Set(STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map((stage) =>
    atelierStageFamily(stage)
  ))];
  const resolved = await Promise.all(families.map(async (stageFamily) => {
    try {
      const ownership = await ports.readOwnership({ ...input, stageFamily });
      return [stageFamily, ownership.state === "UNCLAIMED" ? "UNCLAIMED" : ownership.owner] as const;
    } catch {
      return [stageFamily, "UNVERIFIED"] as const;
    }
  }));
  const byFamily = new Map(resolved);
  return Object.freeze(Object.fromEntries(STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map((stage) => [
    stage,
    byFamily.get(atelierStageFamily(stage)) ?? "UNVERIFIED",
  ])) as Record<AtelierStage, StageEvidence["ownership"]>);
}

export function createStudioAtelierEligibilityEvidenceResolver(
  overrides: Partial<StudioAtelierEligibilityCompositionPorts> = {},
) {
  const sourceRepository = createStudioAtelierProductionSourceRepository();
  const ports: StudioAtelierEligibilityCompositionPorts = Object.freeze({
    readWardrobeItem: (operatorSubject, wardrobeItemId) =>
      getOwnedWardrobeItem(wardrobeItemId, operatorSubject),
    readSourceContext: (input) => defaultSourceContext(input, sourceRepository),
    readCurrentOperations: readCurrentAuthorizedStudioAtelierOperations,
    readProjection: readDurableStudioAtelierProjection,
    readOwnership: readStudioEngineWorkOwnership,
    readRuntime: defaultRuntimeEvidence,
    ...overrides,
  });

  return async function readStudioAtelierEligibilityEvidence(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierEligibilityEvidence> {
    const wardrobe = wardrobeSummarySchema.parse(
      await ports.readWardrobeItem(input.operatorSubject, input.wardrobeItemId),
    );
    if (wardrobe.id !== input.wardrobeItemId) throw unavailableEligibility();

    const [source, operations, ownership, runtime] = await Promise.all([
      ports.readSourceContext({ ...input, wardrobe }),
      // Never turn an unavailable operation ledger into "no saved work". A
      // false empty result could make an existing paid lineage look eligible
      // for a fresh prepare once production commands are enabled.
      ports.readCurrentOperations(input),
      readOwnershipByStage(ports, input),
      ports.readRuntime(),
    ]);

    const operationEvidence = await Promise.all(operations.map(async (operation) => {
      const projection = await ports.readProjection(input.operatorSubject, operation.operationId);
      if (projection.operationId !== operation.operationId || projection.stage !== operation.stage) {
        throw unavailableEligibility();
      }
      return [operation.stage, Object.freeze({
        operationId: projection.operationId,
        state: projection.state,
        candidateVisibility: projection.candidateVisibility,
        nextAction: projection.nextAction,
        fixOneThingAvailable: operation.correctionUsed === false,
      })] as const;
    }));
    const operationByStage = new Map(operationEvidence);

    const declarationFactory = source.truth ? createStudioAtelierStageDeclarationFactory({
      readWardrobeTruth: async () => source.truth,
      readLockedParents: async ({ stage }) => {
        const roles = new Set(ATELIER_STAGE_RECIPES[stage].parentRoles);
        return source.lockedParents.filter((parent) => roles.has(parent.role));
      },
      readFashionNovaAdvisory: async () => null,
    }) : null;

    const stages = await Promise.all(STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map(async (stage) => {
      const requiredRoles = ATELIER_STAGE_RECIPES[stage].parentRoles;
      const presentLockedParents = new Set(source.lockedParents
        .filter((parent) => requiredRoles.some((role) => role === parent.role))
        .map((parent) => parent.role)).size;
      let declaration: StageEvidence["declaration"] = "BLOCKED";
      if (source.status === "VERIFIED") {
        try {
          const derived = ports.canDeriveDeclaration
            ? await ports.canDeriveDeclaration({ ...input, stage, source })
            : Boolean(declarationFactory && await declarationFactory.create({ ...input, stage }));
          if (derived) declaration = "SERVER_DERIVED";
        } catch {
          declaration = "BLOCKED";
        }
      }
      return Object.freeze({
        stage,
        source: source.status,
        presentLockedParents,
        ownership: ownership[stage],
        declaration,
        runtime: runtime[stage],
        operation: operationByStage.get(stage) ?? null,
      });
    }));

    return Object.freeze({
      wardrobeItem: Object.freeze({
        title: wardrobe.title,
        state: wardrobe.state,
        version: wardrobe.version,
      }),
      legacyIntakeAvailable: true,
      installedCommands: Object.freeze({ prepare: true, run: true, decision: true }),
      // Zod's evidence input type is a mutable array shape. Keep the public
      // projection immutable at the service boundary; this short-lived local
      // value is never returned directly to a route or browser.
      stages: [...stages],
    });
  };
}

export const readStudioAtelierEligibilityEvidence =
  createStudioAtelierEligibilityEvidenceResolver();

export const studioAtelierEligibilityService = createStudioAtelierEligibilityService({
  readEvidence: readStudioAtelierEligibilityEvidence,
});
