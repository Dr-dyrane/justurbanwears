import type { GarmentReference, ModelReference } from "../data/types";

export function identityCoverage(references: ModelReference[]) {
  const required = ["front", "smile", "left 3/4", "right 3/4", "left profile", "right profile", "full body", "back"];
  return required.map((view) => ({
    view,
    covered: references.some((reference) => reference.view.toLowerCase().includes(view)),
  }));
}

export function garmentWarnings(references: GarmentReference[]) {
  const views = new Set(references.map((reference) => reference.view));
  return [
    !views.has("FRONT") && "Front image missing",
    !views.has("BACK") && "Back image missing",
    !views.has("DETAIL") && "Detail image missing",
  ].filter(Boolean) as string[];
}
