"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface StudioMobileAction {
  href: string;
  label: string;
}

const StudioMobileActionContext = createContext<{
  action: StudioMobileAction | null;
  setAction(action: StudioMobileAction | null): void;
} | null>(null);

export function StudioMobileActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<StudioMobileAction | null>(null);
  const value = useMemo(() => ({ action, setAction }), [action]);
  return <StudioMobileActionContext.Provider value={value}>{children}</StudioMobileActionContext.Provider>;
}

export function useRegisteredStudioMobileAction() {
  return useContext(StudioMobileActionContext)?.action ?? null;
}

export function useStudioMobileAction(action: StudioMobileAction | null) {
  const context = useContext(StudioMobileActionContext);
  const setAction = context?.setAction;
  const href = action?.href ?? null;
  const label = action?.label ?? null;

  useEffect(() => {
    if (!setAction) return;
    setAction(href && label ? { href, label } : null);
    return () => setAction(null);
  }, [setAction, href, label]);
}
