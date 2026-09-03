import type { AtelierStage } from "../studio/atelier/contracts";

const FINAL_SCENE_STAGES = new Set<AtelierStage>([
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
]);

export type StudioAtelierProductionScope = "ROOT_SUBJECT" | "FINAL_SCENE";

type StudioAtelierStageReadiness = Readonly<{
  rootSubject: "READY" | "BLOCKED";
  finalScene: "READY" | "BLOCKED";
}>;

export function studioAtelierProductionScopeForStage(
  stage: AtelierStage,
): StudioAtelierProductionScope {
  return FINAL_SCENE_STAGES.has(stage) ? "FINAL_SCENE" : "ROOT_SUBJECT";
}

export function isStudioAtelierStageDispatchReady(
  report: StudioAtelierStageReadiness,
  stage: AtelierStage,
): boolean {
  return studioAtelierProductionScopeForStage(stage) === "FINAL_SCENE"
    ? report.finalScene === "READY"
    : report.rootSubject === "READY";
}
