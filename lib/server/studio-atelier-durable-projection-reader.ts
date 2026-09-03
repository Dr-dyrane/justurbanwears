import {
  createStudioAtelierProjectionReader,
  studioAtelierReviewDecisionSchema,
  type StudioAtelierEngineFacade,
  type StudioAtelierReviewDecision,
  type StudioAtelierServerSnapshot,
} from "./studio-atelier-engine-facade";
import {
  getAtelierCorrectionOperation,
  getAtelierOperation,
  getAtelierOperationProjection,
  listAtelierOperationEvents,
  type AtelierLifecycleEventRow,
} from "./studio-atelier-repository";

export type StudioAtelierDurableProjectionDependencies = Readonly<{
  getOperation: typeof getAtelierOperation;
  getCorrectionOperation: typeof getAtelierCorrectionOperation;
  getProjection: typeof getAtelierOperationProjection;
  listEvents: typeof listAtelierOperationEvents;
}>;

const defaultDependencies: StudioAtelierDurableProjectionDependencies = Object.freeze({
  getOperation: getAtelierOperation,
  getCorrectionOperation: getAtelierCorrectionOperation,
  getProjection: getAtelierOperationProjection,
  listEvents: listAtelierOperationEvents,
});

export function studioAtelierReviewDecisionFromEvents(
  events: readonly AtelierLifecycleEventRow[],
): StudioAtelierReviewDecision | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (!event || ![
      "USER_APPROVED",
      "USER_REJECTED",
      "CORRECTION_AUTHORIZED",
      "BLOCKED_USER_DIRECTION",
    ].includes(event.eventType)) continue;
    const payload = event.payload;
    if (!payload || typeof payload !== "object" || Array.isArray(payload)) continue;
    const evidence = (payload as Record<string, unknown>).evidence;
    if (!evidence || typeof evidence !== "object" || Array.isArray(evidence)) continue;
    const parsed = studioAtelierReviewDecisionSchema.safeParse(
      (evidence as Record<string, unknown>).reviewDecision,
    );
    if (parsed.success) return parsed.data;
  }
  return null;
}

export async function readDurableStudioAtelierSnapshot(
  dependencies: StudioAtelierDurableProjectionDependencies,
  input: Readonly<{ operatorSubject: string; operationId: string }>,
): Promise<StudioAtelierServerSnapshot | null> {
  const [operation, projection, correction, events] = await Promise.all([
    dependencies.getOperation(input),
    dependencies.getProjection(input),
    dependencies.getCorrectionOperation(input),
    dependencies.listEvents(input),
  ]);
  if (!operation || !projection) return null;
  return {
    operationId: operation.id,
    stage: operation.stage as StudioAtelierServerSnapshot["stage"],
    view: operation.view as StudioAtelierServerSnapshot["view"],
    state: projection.state as StudioAtelierServerSnapshot["state"],
    version: projection.version,
    correctionAuthorized: projection.correctionAuthorized,
    correctionOperationId: correction?.id ?? null,
    reviewDecision: studioAtelierReviewDecisionFromEvents(events),
  };
}

/**
 * Repository-backed projection recovery with no mutation, evaluator, image
 * compositor, or provider port in its import graph. Every lookup remains
 * scoped by the authenticated operator subject supplied by the route layer.
 */
export function createDurableStudioAtelierProjectionReader(
  overrides: Partial<StudioAtelierDurableProjectionDependencies> = {},
): StudioAtelierEngineFacade["readProjection"] {
  const dependencies: StudioAtelierDurableProjectionDependencies = Object.freeze({
    ...defaultDependencies,
    ...overrides,
  });
  return createStudioAtelierProjectionReader({
    readProjection: (command) => readDurableStudioAtelierSnapshot(dependencies, command),
  });
}

export const readDurableStudioAtelierProjection =
  createDurableStudioAtelierProjectionReader();
