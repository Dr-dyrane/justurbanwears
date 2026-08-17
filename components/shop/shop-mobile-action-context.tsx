"use client";

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export interface ShopMobileAction {
  eyebrow: string;
  href: string;
  label: string;
}

const ShopMobileActionContext = createContext<{
  action: ShopMobileAction | null;
  setAction(action: ShopMobileAction | null): void;
} | null>(null);

export function ShopMobileActionProvider({ children }: { children: ReactNode }) {
  const [action, setAction] = useState<ShopMobileAction | null>(null);
  const value = useMemo(() => ({ action, setAction }), [action]);

  return (
    <ShopMobileActionContext.Provider value={value}>
      {children}
    </ShopMobileActionContext.Provider>
  );
}

export function useRegisteredShopMobileAction() {
  return useContext(ShopMobileActionContext)?.action ?? null;
}

export function useShopMobileAction(action: ShopMobileAction | null) {
  const context = useContext(ShopMobileActionContext);
  const setAction = context?.setAction;
  const eyebrow = action?.eyebrow ?? null;
  const href = action?.href ?? null;
  const label = action?.label ?? null;

  useEffect(() => {
    if (!setAction) return;
    setAction(eyebrow && href && label ? { eyebrow, href, label } : null);
    return () => setAction(null);
  }, [setAction, eyebrow, href, label]);
}
