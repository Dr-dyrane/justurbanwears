"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  Camera,
  ClipboardList,
  ExternalLink,
  House,
  PackageCheck,
  Plus,
  RotateCcw,
  ScanLine,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import {
  STUDIO_SCENARIO_LABELS,
  studioScenarioRouteSupported,
} from "../../lib/studio/simulator";
import { BrandIcon } from "../brand/brand-icon";
import { BrandWordmark } from "../brand/brand-wordmark";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioNotificationCenter } from "./notifications/studio-notification-center";
import { StudioSettingsCenter } from "./settings/studio-settings-center";
import {
  StudioMobileActionProvider,
  useRegisteredStudioMobileAction,
} from "./mobile-action-context";
import { StudioProvider, useStudio } from "./studio-provider";
import type { StudioOperator } from "../../lib/server/studio-operator";

interface NavigationItem {
  href: string;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
}

interface MediaViewTab {
  current: boolean;
  href: string;
  label: string;
}

const primaryNavigation: NavigationItem[] = [
  { href: "/studio", label: "Business home", mobileLabel: "Home", icon: House },
  { href: "/studio/models", label: "Model atelier", mobileLabel: "Models", icon: Users },
  { href: "/studio/wardrobe", label: "Wardrobe", mobileLabel: "Wardrobe", icon: Shirt },
  { href: "/studio/orders", label: "Orders", mobileLabel: "Orders", icon: PackageCheck },
  { href: "/studio/operations", label: "Operations", mobileLabel: "Ops", icon: ClipboardList },
  { href: "/studio/stocktake", label: "Stocktake", mobileLabel: "Stocktake", icon: ScanLine },
];

const mobileNavigation: NavigationItem[] = [
  { href: "/studio", label: "Business home", mobileLabel: "Home", icon: House },
  { href: "/studio/wardrobe", label: "Wardrobe", mobileLabel: "Wardrobe", icon: Shirt },
  { href: "/studio/orders", label: "Orders", mobileLabel: "Orders", icon: PackageCheck },
  { href: "/studio/operations", label: "Operations", mobileLabel: "Ops", icon: ClipboardList },
];

function isActive(pathname: string, href: string) {
  return href === "/studio" ? pathname === href : pathname.startsWith(href);
}

function mediaViewTabs(pathname: string): MediaViewTab[] {
  const tabs = [{ current: pathname === "/studio/media", href: "/studio/media", label: "Media archive" }];
  if (pathname === "/studio/media/new") tabs.push({ current: true, href: pathname, label: "Composer" });
  else if (pathname.startsWith("/studio/media/")) tabs.push({ current: true, href: pathname, label: "Media record" });
  return tabs;
}

function NavigationLink({ item, pathname }: {
  item: NavigationItem;
  pathname: string;
}) {
  const active = isActive(pathname, item.href);
  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={active ? "is-active" : undefined}
      href={item.href}
    >
      {item.label}
    </Link>
  );
}

function registeredActionIcon(label: string, pathname: string): LucideIcon {
  const signature = `${pathname} ${label}`.toLowerCase();
  if (signature.includes("scan") || signature.includes("stocktake")) return ScanLine;
  if (signature.includes("model")) return Users;
  if (signature.includes("shop")) return ExternalLink;
  if (signature.includes("return")) return RotateCcw;
  if (
    signature.includes("order")
    || signature.includes("receipt")
    || signature.includes("payment")
    || signature.includes("handoff")
  ) return PackageCheck;
  if (
    signature.includes("garment")
    || signature.includes("photo")
    || signature.includes("media")
    || signature.includes("shoot")
  ) return Camera;
  return Plus;
}

function AppShellContent({ children, operator }: { children: React.ReactNode; operator: StudioOperator | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studio = useStudio();
  const scenarioRouteSupported = !studio.scenario || studioScenarioRouteSupported(pathname);
  const mediaTabs = pathname.startsWith("/studio/media") ? mediaViewTabs(pathname) : [];
  const {
    chromeHidden,
    mode: mobileChromeMode,
    suspended: mobileChromeSuspended,
  } = useMobileChrome(pathname);
  const activeMobileDestination = primaryNavigation.find((item) => isActive(pathname, item.href));
  const mobileTitle = activeMobileDestination?.mobileLabel
    ?? (pathname.startsWith("/studio/scan")
      ? "Scan"
      : pathname.startsWith("/studio/media")
        ? "Media"
        : "Studio");
  const registeredMobileAction = useRegisteredStudioMobileAction();
  const operationsView = searchParams.get("view") ?? "inventory";
  const reservedOrders = studio.orders.filter((order) => order.state === "RESERVED").length;
  const openReturns = studio.returns.filter((returnCase) => returnCase.state === "DRAFT").length;
  const operationsAction = openReturns > 0 && operationsView !== "returns"
    ? { label: "Review returns", href: "/studio/operations?view=returns", icon: RotateCcw }
    : reservedOrders > 0 && operationsView !== "orders"
      ? { label: "Review orders", href: "/studio/operations?view=orders", icon: ClipboardList }
      : operationsView !== "inventory"
        ? { label: "Open inventory", href: "/studio/operations?view=inventory", icon: ClipboardList }
        : { label: "Add garment", href: "/studio/wardrobe?intake=1", icon: Camera };
  const routeAction = pathname.startsWith("/studio/models")
    ? { label: "Add model", href: "/studio/models?intake=model", icon: Plus }
    : pathname.startsWith("/studio/wardrobe")
      ? { label: "Add garment", href: "/studio/wardrobe?intake=1", icon: Camera }
      : pathname.startsWith("/studio/orders")
        ? pathname === "/studio/orders"
          ? { label: "Add garment", href: "/studio/wardrobe?intake=1", icon: Camera }
          : { label: "All orders", href: "/studio/orders", icon: PackageCheck }
        : pathname.startsWith("/studio/operations")
          ? operationsAction
          : pathname.startsWith("/studio/scan")
            ? { label: "Open stocktake", href: "/studio/stocktake", icon: ScanLine }
            : pathname.startsWith("/studio/stocktake")
              ? { label: "Scan piece", href: "#stocktake-scan", icon: ScanLine }
              : pathname === "/studio/media/new"
                ? { label: "Media archive", href: "/studio/media", icon: Camera }
                : pathname.startsWith("/studio/media")
                  ? { label: "New shoot", href: "/studio/media/new", icon: Camera }
                  : { label: "Add garment", href: "/studio/wardrobe?intake=1", icon: Camera };
  const contextAction = registeredMobileAction
    ? {
        ...registeredMobileAction,
        icon: registeredActionIcon(registeredMobileAction.label, pathname),
      }
    : routeAction;
  const ContextActionIcon = contextAction.icon;

  function invokeContextAction(event: React.MouseEvent<HTMLAnchorElement>) {
    const targetId = registeredMobileAction?.invokeTargetId;
    if (!targetId) return;
    const target = document.getElementById(targetId);
    if (!(target instanceof HTMLButtonElement)) return;
    event.preventDefault();
    target.focus({ preventScroll: true });
    if (!target.disabled) target.click();
  }

  return (
    <div
      className="app-shell studio-shell"
      data-experience-surface="studio"
      data-experience-tempo="resolve"
      data-mobile-chrome-hidden={chromeHidden || undefined}
      data-mobile-chrome-suspended={mobileChromeSuspended || undefined}
      data-studio-scenario={studio.scenario ?? undefined}
    >
      <a className="shop-skip-link studio-skip-link" href="#studio-content">Skip to Studio content</a>
      <header
        aria-hidden={chromeHidden || mobileChromeSuspended || undefined}
        className="shop-header studio-header"
        inert={chromeHidden || mobileChromeSuspended || undefined}
      >
        <nav className="shop-floating-nav studio-floating-nav glass-surface" aria-label="Studio navigation">
          <div className="studio-nav-identity">
            <StudioSettingsCenter operator={operator} />
            <Link className="shop-wordmark studio-wordmark" href="/studio" aria-label="justurban wears Studio home">
              <span className="studio-brand-mark" aria-hidden="true">
                <BrandIcon className="studio-brand-icon" size={38} />
              </span>
              <BrandWordmark className="shop-wordmark-lockup" />
              <small>Studio · Lulu</small>
            </Link>
          </div>
          <span className="studio-mobile-nav-title">{mobileTitle}</span>
          <div className="shop-nav-links studio-nav-links">
            {mobileNavigation.map((item) => (
              <NavigationLink item={item} pathname={pathname} key={item.href} />
            ))}
          </div>
          <div className="shop-header-actions studio-header-actions">
            <StudioNotificationCenter />
          </div>
        </nav>
      </header>
      <div className="workspace">
        {studio.scenario ? (
          <div className="demo-ribbon" role="status">
            <span>Simulator</span>
            <span>{STUDIO_SCENARIO_LABELS[studio.scenario]} · In memory only · Reload resets this scenario</span>
          </div>
        ) : null}
        {mediaTabs.length ? (
          <div className="studio-view-nav-wrap">
            <nav className="studio-view-navigation glass-surface" aria-label="Media views">
              <span className="studio-view-context"><small>View</small><strong>Media</strong></span>
              <span className="studio-view-tabs">
                {mediaTabs.map((tab) => (
                  <Link
                    aria-current={tab.current ? "page" : undefined}
                    className={tab.current ? "is-active" : undefined}
                    href={tab.href}
                    key={tab.href}
                  >
                    {tab.label}
                  </Link>
                ))}
              </span>
              <Link
                className="studio-view-action"
                data-experience-action="primary"
                href={contextAction.href}
                onClick={invokeContextAction}
              >
                <span>{contextAction.label}</span>
                <ContextActionIcon aria-hidden="true" size={15} strokeWidth={1.9} />
              </Link>
            </nav>
          </div>
        ) : null}
        <main className="page-canvas" id="studio-content">
          {scenarioRouteSupported ? children : (
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
      <aside
        aria-hidden={mobileChromeSuspended || undefined}
        aria-label="Mobile Studio controls"
        className="shop-mobile-shell studio-mobile-shell"
        data-experience-layer="island"
        data-mobile-chrome-mode={mobileChromeMode}
        inert={mobileChromeSuspended || undefined}
      >
        <div className="studio-mobile-bar">
          <nav aria-label="Studio tabs" className="studio-mobile-tabs shop-dock-lens">
            {mobileNavigation.map((item) => {
              const active = isActive(pathname, item.href);
              const Icon = item.icon;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={active ? "is-active" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  <Icon aria-hidden="true" size={21} strokeWidth={active ? 2.2 : 1.65} />
                  <span>{item.mobileLabel}</span>
                </Link>
              );
            })}
          </nav>
          <Link
            aria-label={contextAction.label}
            className="shop-mobile-fab shop-dock-lens studio-mobile-fab"
            data-experience-action="primary"
            href={contextAction.href}
            onClick={invokeContextAction}
            title={contextAction.label}
          >
            <ContextActionIcon aria-hidden="true" size={24} strokeWidth={2.05} />
          </Link>
        </div>
      </aside>
    </div>
  );
}

export function AppShell({ children, operator, scenariosEnabled }: {
  children: React.ReactNode;
  operator: StudioOperator | null;
  scenariosEnabled: boolean;
}) {
  return (
    <StudioMobileActionProvider>
      <StudioProvider scenariosEnabled={scenariosEnabled}>
        <AppShellContent operator={operator}>{children}</AppShellContent>
      </StudioProvider>
    </StudioMobileActionProvider>
  );
}
