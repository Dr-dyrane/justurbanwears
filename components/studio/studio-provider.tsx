"use client";

import { createContext, useContext, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { useStudioMachine, type StudioActions } from "../../hooks/studio/use-studio-machine";
import type { GarmentIntakeClient } from "./garment-intake/engine-client";
import { studioEngineIntakeClient } from "./garment-intake/engine-client";
import type { StudioModel } from "../../lib/studio/domain/entities";
import type { StudioMachineState } from "../../lib/studio/domain/state";
import {
  createStudioScenarioIntakeClient,
  createStudioScenarioService,
  parseStudioScenario,
  type StudioScenario,
} from "../../lib/studio/simulator";
import { createBrowserStudioService } from "../../lib/studio/services/studio-service";

interface StudioContextValue extends StudioMachineState, StudioActions {
  identity: StudioModel;
  addGarment: StudioActions["createGarment"];
  intakeClient: GarmentIntakeClient;
  scenario: StudioScenario | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

function StudioMachineProvider({ children, scenario }: {
  children: React.ReactNode;
  scenario: StudioScenario | null;
}) {
  const service = useMemo(
    () => scenario ? createStudioScenarioService(scenario) : createBrowserStudioService(),
    [scenario],
  );
  const intakeClient = useMemo(
    () => scenario ? createStudioScenarioIntakeClient(scenario) : studioEngineIntakeClient,
    [scenario],
  );
  const { state, actions } = useStudioMachine(service);
  const identity = state.models.find((model) => model.id === state.defaultModelId) ?? state.models[0];

  const value = useMemo<StudioContextValue>(() => ({
    ...state,
    ...actions,
    identity,
    addGarment: actions.createGarment,
    intakeClient,
    scenario,
  }), [actions, identity, intakeClient, scenario, state]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function StudioProvider({ children, scenariosEnabled }: {
  children: React.ReactNode;
  scenariosEnabled: boolean;
}) {
  const searchParams = useSearchParams();
  const scenario = parseStudioScenario(searchParams.get("scenario"), scenariosEnabled);
  return (
    <StudioMachineProvider key={scenario ?? "production"} scenario={scenario}>
      {children}
    </StudioMachineProvider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
