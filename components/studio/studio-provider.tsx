"use client";

import { createContext, useContext, useMemo } from "react";
import { useStudioMachine, type StudioActions } from "../../hooks/studio/use-studio-machine";
import type { StudioModel } from "../../lib/studio/domain/entities";
import type { StudioMachineState } from "../../lib/studio/domain/state";
import { createBrowserStudioService } from "../../lib/studio/services/studio-service";

interface StudioContextValue extends StudioMachineState, StudioActions {
  identity: StudioModel;
  addGarment: StudioActions["createGarment"];
}

const StudioContext = createContext<StudioContextValue | null>(null);

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const service = useMemo(() => createBrowserStudioService(), []);
  const { state, actions } = useStudioMachine(service);
  const identity = state.models.find((model) => model.id === state.defaultModelId) ?? state.models[0];

  const value = useMemo<StudioContextValue>(() => ({
    ...state,
    ...actions,
    identity,
    addGarment: actions.createGarment,
  }), [actions, identity, state]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
