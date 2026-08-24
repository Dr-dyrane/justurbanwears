"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export interface StudioStackDescriptor {
  backHref: string;
  backLabel: string;
  title: string;
}

type RegisteredDescriptor = {
  descriptor: StudioStackDescriptor;
  routeKey: string;
};

const StudioStackRegistrationContext = createContext<((descriptor: StudioStackDescriptor) => () => void) | null>(null);
const StudioStackValueContext = createContext<StudioStackDescriptor | null>(null);

export function studioStackFallback(pathname: string, view: string | null): StudioStackDescriptor {
  if (pathname.startsWith("/studio/ask")) return { backHref: "/studio", backLabel: "Studio Home", title: "Ask Studio" };
  if (pathname.startsWith("/studio/wardrobe/")) return { backHref: "/studio/wardrobe", backLabel: "Wardrobe", title: "Piece" };
  if (pathname.startsWith("/studio/wardrobe") && view === "publishing") return { backHref: "/studio", backLabel: "Studio Home", title: "Shop" };
  if (pathname.startsWith("/studio/wardrobe")) return { backHref: "/studio", backLabel: "Studio Home", title: "Wardrobe" };
  if (pathname === "/studio/media/new") return { backHref: "/studio/media", backLabel: "Atelier", title: "Create media" };
  if (pathname.startsWith("/studio/media/")) return { backHref: "/studio/media", backLabel: "Atelier", title: "Atelier media" };
  if (pathname.startsWith("/studio/media")) return { backHref: "/studio", backLabel: "Studio Home", title: "Atelier" };
  if (pathname.startsWith("/studio/models")) return { backHref: "/studio", backLabel: "Studio Home", title: "Models" };
  if (pathname.startsWith("/studio/orders/")) return { backHref: "/studio/orders", backLabel: "Orders", title: "Order" };
  if (pathname.startsWith("/studio/orders")) return { backHref: "/studio", backLabel: "Studio Home", title: "Orders" };
  if (pathname.startsWith("/studio/scan")) return { backHref: "/studio/stocktake", backLabel: "Stocktake", title: "Scan" };
  if (pathname.startsWith("/studio/stocktake")) return { backHref: "/studio", backLabel: "Studio Home", title: "Stocktake" };
  if (pathname.startsWith("/studio/operations") && view === "inventory") return { backHref: "/studio", backLabel: "Studio Home", title: "Inventory" };
  if (pathname.startsWith("/studio/operations") && view === "orders") return { backHref: "/studio", backLabel: "Studio Home", title: "Orders" };
  if (pathname.startsWith("/studio/operations") && view === "returns") return { backHref: "/studio", backLabel: "Studio Home", title: "Returns" };
  if (pathname.startsWith("/studio/operations") && view === "holds") return { backHref: "/studio", backLabel: "Studio Home", title: "Holds" };
  if (pathname.startsWith("/studio/operations")) return { backHref: "/studio", backLabel: "Studio Home", title: "Operations" };
  return { backHref: "/studio", backLabel: "Studio Home", title: "Studio" };
}

export function StudioStackContextProvider({
  children,
  routeKey,
}: {
  children: React.ReactNode;
  routeKey: string;
}) {
  const [registered, setRegistered] = useState<RegisteredDescriptor | null>(null);
  const register = useCallback((descriptor: StudioStackDescriptor) => {
    setRegistered({ descriptor, routeKey });
    return () => setRegistered((current) => (
      current?.routeKey === routeKey
      && current.descriptor.backHref === descriptor.backHref
      && current.descriptor.backLabel === descriptor.backLabel
      && current.descriptor.title === descriptor.title
        ? null
        : current
    ));
  }, [routeKey]);
  const value = registered?.routeKey === routeKey ? registered.descriptor : null;

  return (
    <StudioStackRegistrationContext.Provider value={register}>
      <StudioStackValueContext.Provider value={value}>{children}</StudioStackValueContext.Provider>
    </StudioStackRegistrationContext.Provider>
  );
}

export function useStudioStackDescriptor() {
  return useContext(StudioStackValueContext);
}

export function useStudioStackRegistration(descriptor: StudioStackDescriptor) {
  const register = useContext(StudioStackRegistrationContext);
  const { backHref, backLabel, title } = descriptor;

  useEffect(() => {
    if (!register) return;
    return register({ backHref, backLabel, title });
  }, [backHref, backLabel, register, title]);
}
