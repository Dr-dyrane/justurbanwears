"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { ArrowLeft, ClipboardList, RotateCcw } from "lucide-react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import type { StudioOperator } from "../../lib/server/studio-operator";
import {
  STUDIO_SCENARIO_LABELS,
  studioScenarioRouteSupported,
} from "../../lib/studio/simulator";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioCommandCenter } from "./navigation/studio-command-center";
import {
  StudioStackContextProvider,
  studioStackFallback,
  useStudioStackDescriptor,
} from "./navigation/studio-stack-context";
import { StudioSettingsCenter } from "./settings/studio-settings-center";
import { StudioProvider, useStudio } from "./studio-provider";

function AppShellFrame({ children, operator }: { children: React.ReactNode; operator: StudioOperator | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studio = useStudio();
  const scenarioRouteSupported = !studio.scenario || studioScenarioRouteSupported(pathname);
  const { chromeHidden, suspended: mobileChromeSuspended } = useMobileChrome(pathname);
  const isHome = pathname === "/studio";
  const fallback = studioStackFallback(pathname, searchParams.get("view"));
  const registered = useStudioStackDescriptor();
  const stack = registered ?? fallback;
  const hydrationDependsOnWardrobe = pathname.startsWith("/studio/wardrobe");
  const hydrationUnavailable = !studio.scenario
    && hydrationDependsOnWardrobe
    && studio.hydration === "degraded";

  return (
    <div
      className="app-shell studio-shell studio-stack-shell"
      data-experience-surface="studio"
      data-experience-tempo="resolve"
      data-mobile-chrome-hidden={chromeHidden || undefined}
      data-mobile-chrome-suspended={mobileChromeSuspended || undefined}
      data-studio-page={isHome ? "home" : "stack"}
      data-studio-scenario={studio.scenario ?? undefined}
    >
      <a className="shop-skip-link studio-skip-link" href="#studio-content">Skip to Studio content</a>
      <header
        aria-hidden={chromeHidden || mobileChromeSuspended || undefined}
        className="shop-header studio-header studio-command-header"
        data-experience-layer="island"
        inert={chromeHidden || mobileChromeSuspended || undefined}
      >
        <nav className={`studio-command-nav glass-surface ${isHome ? "is-home" : "is-stack"}`} aria-label={isHome ? "Studio Home controls" : `${stack.title} controls`}>
          {isHome ? <StudioSettingsCenter operator={operator} /> : (
            <Link aria-label={`Back to ${stack.backLabel}`} className="studio-command-back" href={stack.backHref}>
              <ArrowLeft aria-hidden="true" size={19} />
            </Link>
          )}
          {isHome ? null : <span className="studio-command-page-title">{stack.title}</span>}
          <StudioCommandCenter showAsk={!pathname.startsWith("/studio/ask")} showSearch={isHome} />
        </nav>
      </header>

      <div className="workspace">
        {studio.scenario ? (
          <div className="demo-ribbon" role="status">
            <span>Simulator · {STUDIO_SCENARIO_LABELS[studio.scenario]} · Resets on reload</span>
          </div>
        ) : null}

        <main className={`page-canvas${isHome ? "" : " studio-native-canvas"}`} id="studio-content">
          {hydrationUnavailable ? (
            <section className="studio-quiet-empty" role="alert">
              <RotateCcw aria-hidden="true" size={24} />
              <div>
                <strong>Studio data could not be verified.</strong>
                <p>{studio.lastError || "Connected Wardrobe is unavailable. Try again."}</p>
              </div>
              <button className="button button-primary" onClick={() => window.location.reload()} type="button">Try again</button>
            </section>
          ) : scenarioRouteSupported ? children : (
            <section className="studio-quiet-empty" role="status">
              <ClipboardList aria-hidden="true" size={24} />
              <div>
                <strong>This route is outside the simulator.</strong>
                <p>Connected services were not opened. Use simulated Operations for order and return states.</p>
              </div>
              <Link className="button button-primary" href="/studio/operations?view=orders">Open simulated orders</Link>
            </section>
          )}
        </main>
      </div>
    </div>
  );
}

function AppShellContent({ children, operator }: { children: React.ReactNode; operator: StudioOperator | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  return (
    <StudioStackContextProvider routeKey={routeKey}>
      <AppShellFrame operator={operator}>{children}</AppShellFrame>
    </StudioStackContextProvider>
  );
}

export function AppShell({ children, operator, scenariosEnabled }: {
  children: React.ReactNode;
  operator: StudioOperator | null;
  scenariosEnabled: boolean;
}) {
  return (
    <StudioProvider scenariosEnabled={scenariosEnabled}>
      <AppShellContent operator={operator}>{children}</AppShellContent>
    </StudioProvider>
  );
}
