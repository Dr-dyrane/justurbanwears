"use client";

import { usePathname, useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Camera,
  ClipboardList,
  ExternalLink,
  House,
  PackageCheck,
  Plus,
  RotateCcw,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import { BrandIcon } from "../brand/brand-icon";
import { BrandWordmark } from "../brand/brand-wordmark";
import { ThemeToggle } from "../theme/theme-toggle";
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

interface ShootViewTab {
  current: boolean;
  href: string;
  label: string;
}

const primaryNavigation: NavigationItem[] = [
  { href: "/studio", label: "Business home", mobileLabel: "Home", icon: House },
  { href: "/studio/models", label: "Model atelier", mobileLabel: "Models", icon: Users },
  { href: "/studio/wardrobe", label: "Wardrobe", mobileLabel: "Wardrobe", icon: Shirt },
  { href: "/studio/orders", label: "Orders", mobileLabel: "Orders", icon: PackageCheck },
  { href: "/studio/operations", label: "Operations", mobileLabel: "Operations", icon: ClipboardList },
];

function isActive(pathname: string, href: string) {
  return href === "/studio" ? pathname === href : pathname.startsWith(href);
}

function shootViewTabs(pathname: string): ShootViewTab[] {
  const tabs = [{ current: pathname === "/shoots", href: "/shoots", label: "Shoot gallery" }];
  if (pathname === "/shoots/new") tabs.push({ current: true, href: pathname, label: "Composer" });
  else if (pathname.startsWith("/shoots/")) tabs.push({ current: true, href: pathname, label: "Shoot record" });
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

function AppShellContent({ children, operator }: { children: React.ReactNode; operator: StudioOperator | null }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studio = useStudio();
  const shootTabs = pathname.startsWith("/shoots") ? shootViewTabs(pathname) : [];
  const {
    chromeHidden,
    closeNavigation,
    mode: mobileChromeMode,
    navigationRef,
    revealNavigation,
    suspended: mobileChromeSuspended,
  } = useMobileChrome(pathname);
  const activeMobileDestination = primaryNavigation.find((item) => isActive(pathname, item.href));
  const mobileDestination = activeMobileDestination
    ?? (pathname.startsWith("/shoots")
      ? { label: "Shoots", icon: Camera }
      : { label: "Studio", icon: House });
  const MobileDestinationIcon = mobileDestination.icon;
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
        : { label: "Intake garment", href: "/studio/wardrobe?intake=1", icon: Plus };
  const routeAction = pathname.startsWith("/studio/models")
    ? { label: "Add model", href: "/studio/models?intake=model", icon: Plus }
    : pathname.startsWith("/studio/wardrobe")
      ? { label: "Intake garment", href: "/studio/wardrobe?intake=1", icon: Plus }
      : pathname.startsWith("/studio/orders")
        ? pathname === "/studio/orders"
          ? { label: "Open wardrobe", href: "/studio/wardrobe", icon: Shirt }
          : { label: "All orders", href: "/studio/orders", icon: PackageCheck }
      : pathname.startsWith("/studio/operations")
        ? operationsAction
        : pathname === "/shoots/new"
          ? { label: "Shoot gallery", href: "/shoots", icon: Camera }
          : pathname.startsWith("/shoots")
          ? { label: "New shoot", href: "/shoots/new", icon: Camera }
          : { label: "Intake garment", href: "/studio/wardrobe?intake=1", icon: Plus };
  const contextAction = registeredMobileAction
    ? { ...registeredMobileAction, icon: PackageCheck }
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
      >
        <a className="shop-skip-link studio-skip-link" href="#studio-content">Skip to Studio content</a>
        <header
          aria-hidden={chromeHidden || mobileChromeSuspended || undefined}
          className="shop-header studio-header"
          inert={chromeHidden || mobileChromeSuspended || undefined}
        >
          <nav className="shop-floating-nav studio-floating-nav glass-surface" aria-label="Studio navigation">
            <Link className="shop-wordmark studio-wordmark" href="/studio" aria-label="justurban wears Studio home">
              <span className="studio-brand-mark" aria-hidden="true">
                <BrandIcon className="studio-brand-icon" size={38} />
              </span>
              <BrandWordmark className="shop-wordmark-lockup" />
              <small>Studio · Lulu</small>
            </Link>
            <div className="shop-nav-links studio-nav-links">
              {primaryNavigation.map((item) => (
                <NavigationLink item={item} pathname={pathname} key={item.href} />
              ))}
            </div>
            <div className="shop-header-actions studio-header-actions">
              <StudioNotificationCenter />
              <StudioSettingsCenter operator={operator} />
              <ThemeToggle className="shop-theme-toggle studio-top-theme-toggle" />
              <Link
                aria-current={pathname.startsWith("/shoots") ? "page" : undefined}
                aria-label="Shoot desk"
                className={`shop-account-link studio-shoot-link${pathname.startsWith("/shoots") ? " is-active" : ""}`}
                href="/shoots"
              >
                <Camera aria-hidden="true" size={18} strokeWidth={1.8} />
                <span>Shoots</span>
              </Link>
              <Link className="shop-bag-link studio-public-action" href="/shop">
                <ExternalLink aria-hidden="true" size={16} strokeWidth={1.9} />
                <span>Shop</span>
              </Link>
            </div>
          </nav>
        </header>
        <div className="workspace">
          {shootTabs.length ? (
            <div className="studio-view-nav-wrap">
              <nav className="studio-view-navigation glass-surface" aria-label="Shoots views">
                <span className="studio-view-context"><small>View</small><strong>Shoots</strong></span>
                <span className="studio-view-tabs">
                  {shootTabs.map((tab) => <Link aria-current={tab.current ? "page" : undefined} className={tab.current ? "is-active" : undefined} href={tab.href} key={tab.href}>{tab.label}</Link>)}
                </span>
                <Link className="studio-view-action" data-experience-action="primary" href={contextAction.href} onClick={invokeContextAction}><span>{contextAction.label}</span><ContextActionIcon aria-hidden="true" size={15} strokeWidth={1.9} /></Link>
              </nav>
            </div>
          ) : null}
          <main className="page-canvas" id="studio-content">{children}</main>
        </div>
        <aside
          aria-hidden={mobileChromeMode === "suspended" || undefined}
          aria-label="Mobile Studio controls"
          className="shop-mobile-shell studio-mobile-shell"
          data-experience-layer="island"
          data-mobile-chrome-mode={mobileChromeMode}
          inert={mobileChromeMode === "suspended" || undefined}
        >
          <div className="shop-mobile-composition">
            <button
              aria-controls="studio-mobile-navigation"
              aria-expanded={mobileChromeMode === "navigation"}
              aria-hidden={mobileChromeMode !== "compact" || undefined}
              aria-label={`Show navigation. ${mobileDestination.label} selected`}
              className="shop-mobile-nav-reveal shop-dock-lens"
              onClick={revealNavigation}
              tabIndex={mobileChromeMode === "compact" ? 0 : -1}
              type="button"
            >
              <span><MobileDestinationIcon aria-hidden="true" size={25} strokeWidth={2.2} /></span>
            </button>
            <Link
              aria-hidden={mobileChromeMode === "navigation" || mobileChromeMode === "suspended" || undefined}
              className="shop-mobile-context shop-dock-lens studio-mobile-context"
              data-experience-action="primary"
              href={contextAction.href}
              onClick={invokeContextAction}
              tabIndex={mobileChromeMode === "navigation" || mobileChromeMode === "suspended" ? -1 : undefined}
            >
              <span>
                <small>Action</small>
                <strong>{contextAction.label}</strong>
              </span>
              <ArrowRight aria-hidden="true" size={17} strokeWidth={1.9} />
            </Link>
            <div className="shop-mobile-row">
              <nav
                aria-hidden={mobileChromeMode === "compact" || mobileChromeMode === "suspended" || undefined}
                aria-label="Mobile Studio navigation"
                className="shop-mobile-dock shop-dock-lens"
                id="studio-mobile-navigation"
                inert={mobileChromeMode === "compact" || mobileChromeMode === "suspended" || undefined}
                ref={navigationRef}
              >
                {primaryNavigation.map((item) => {
                  const active = isActive(pathname, item.href);
                  const Icon = item.icon;
                  return (
                    <Link
                      aria-current={active ? "page" : undefined}
                      aria-label={item.label}
                      className={active ? "is-active" : undefined}
                      href={item.href}
                      key={item.href}
                      onClick={closeNavigation}
                    >
                      <Icon aria-hidden="true" size={22} strokeWidth={active ? 2.2 : 1.65} />
                      <span>{item.mobileLabel}</span>
                    </Link>
                  );
                })}
              </nav>
              <Link
                aria-label={contextAction.label}
                className="shop-mobile-fab shop-dock-lens studio-mobile-fab"
                href={contextAction.href}
                onClick={invokeContextAction}
              >
                <ContextActionIcon aria-hidden="true" size={24} strokeWidth={2.1} />
              </Link>
            </div>
          </div>
        </aside>
    </div>
  );
}

export function AppShell({ children, operator }: { children: React.ReactNode; operator: StudioOperator | null }) {
  return (
    <StudioMobileActionProvider>
      <StudioProvider><AppShellContent operator={operator}>{children}</AppShellContent></StudioProvider>
    </StudioMobileActionProvider>
  );
}
