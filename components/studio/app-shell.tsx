"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Camera,
  ClipboardList,
  ExternalLink,
  House,
  Shirt,
  Users,
  type LucideIcon,
} from "lucide-react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import { BrandIcon } from "../brand/brand-icon";
import { BrandWordmark } from "../brand/brand-wordmark";
import { ThemeToggle } from "../theme/theme-toggle";
import { StudioProvider } from "./studio-provider";

interface NavigationItem {
  href: string;
  label: string;
  mobileLabel: string;
  icon: LucideIcon;
}

interface ViewTab {
  href: string;
  key: string;
  label: string;
  targetId?: string;
}

interface ViewNavigation {
  label: string;
  tabs: ViewTab[];
}

const primaryNavigation: NavigationItem[] = [
  { href: "/studio", label: "Business home", mobileLabel: "Home", icon: House },
  { href: "/studio/models", label: "Model atelier", mobileLabel: "Models", icon: Users },
  { href: "/studio/wardrobe", label: "Wardrobe", mobileLabel: "Wardrobe", icon: Shirt },
  { href: "/studio/operations", label: "Operations", mobileLabel: "Operations", icon: ClipboardList },
];

function isActive(pathname: string, href: string) {
  return href === "/studio" ? pathname === href : pathname.startsWith(href);
}

function getViewNavigation(pathname: string): ViewNavigation | undefined {
  if (pathname === "/studio") {
    return {
      label: "Business home",
      tabs: [
        { href: "/studio#work", key: "work", label: "Work", targetId: "work" },
        { href: "/studio#lifecycle", key: "lifecycle", label: "Lifecycle", targetId: "lifecycle" },
        { href: "/studio#records", key: "records", label: "Records", targetId: "records" },
      ],
    };
  }
  if (pathname.startsWith("/studio/models")) {
    return {
      label: "Model atelier",
      tabs: [
        { href: "/studio/models#models", key: "models", label: "Models", targetId: "models" },
        { href: "/studio/models#model-styling", key: "model-styling", label: "Styling", targetId: "model-styling" },
        { href: "/studio/models#model-readiness", key: "model-readiness", label: "Readiness", targetId: "model-readiness" },
      ],
    };
  }
  if (pathname.startsWith("/studio/wardrobe")) {
    return {
      label: "Wardrobe",
      tabs: [
        { href: "/studio/wardrobe#garments", key: "garments", label: "Garments", targetId: "garments" },
        { href: "/studio/wardrobe#publishing", key: "publishing", label: "Publishing", targetId: "publishing" },
      ],
    };
  }
  if (pathname.startsWith("/studio/operations")) {
    return {
      label: "Operations",
      tabs: [
        { href: "/studio/operations#inventory", key: "inventory", label: "Inventory", targetId: "inventory" },
        { href: "/studio/operations#orders", key: "orders", label: "Orders", targetId: "orders" },
        { href: "/studio/operations#returns", key: "returns", label: "Returns", targetId: "returns" },
      ],
    };
  }
  if (pathname.startsWith("/shoots")) {
    const tabs: ViewTab[] = [{ href: "/shoots", key: "shoots", label: "Shoot gallery", targetId: pathname === "/shoots" ? "shoot-gallery" : undefined }];
    if (pathname === "/shoots/new") {
      tabs.push({ href: pathname, key: "shoot-composer", label: "Composer" });
    } else if (pathname !== "/shoots") {
      tabs.push({ href: pathname, key: "shoot-record", label: "Shoot record" });
    }
    return { label: "Shoots", tabs };
  }
  return undefined;
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

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const viewNavigation = getViewNavigation(pathname);
  const [activeView, setActiveView] = useState("");
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
  const contextAction = pathname.startsWith("/studio/models")
    ? { eyebrow: "Model atelier", label: "Add another model", href: "/studio/models?intake=model" }
    : pathname.startsWith("/studio/wardrobe")
      ? { eyebrow: "Garment intake", label: "Snap and classify the next piece", href: "/studio/wardrobe?intake=1" }
      : pathname.startsWith("/studio/operations")
        ? { eyebrow: "Live operations", label: "Work orders and returns", href: "/studio/operations#orders" }
        : pathname === "/shoots/new"
          ? { eyebrow: "Shoot composer", label: "Return to shoot desk", href: "/shoots" }
          : pathname.startsWith("/shoots")
          ? { eyebrow: "Shoot desk", label: "Open a new private shoot", href: "/shoots/new" }
          : { eyebrow: "Lulu’s next move", label: "Intake a garment", href: "/studio/wardrobe?intake=1" };

  useEffect(() => {
    const navigation = getViewNavigation(pathname);
    if (!navigation) return;

    const navigationTabs = navigation.tabs;
    const routeTab = navigationTabs.find((tab) => !tab.targetId && tab.href === pathname);
    let lastScrolledHash = "";
    let hashLockedView = "";
    function syncActiveSection() {
      const targetTabs = navigationTabs.filter((tab): tab is ViewTab & { targetId: string } => Boolean(tab.targetId));
      if (!targetTabs.length) {
        setActiveView(routeTab?.key ?? navigationTabs[0]?.key ?? "");
        return;
      }

      const currentHash = window.location.hash;
      if (!currentHash) {
        lastScrolledHash = "";
        hashLockedView = "";
      } else if (currentHash !== lastScrolledHash) {
        hashLockedView = "";
        const hashTarget = document.getElementById(currentHash.slice(1));
        if (hashTarget) {
          hashTarget.scrollIntoView({ block: "start" });
          lastScrolledHash = currentHash;
          const hashTab = targetTabs.find((tab) => currentHash === `#${tab.targetId}`);
          if (hashTab) {
            hashLockedView = hashTab.key;
            setActiveView(hashTab.key);
            return;
          }
        }
      }

      if (hashLockedView) {
        setActiveView(hashLockedView);
        return;
      }

      let next = targetTabs[0]?.key ?? "";
      const documentScrollable = document.documentElement.scrollHeight > window.innerHeight + 4;
      if (!documentScrollable) {
        const hashTarget = targetTabs.find((tab) => window.location.hash === `#${tab.targetId}`);
        setActiveView(hashTarget?.key ?? next);
        return;
      }
      const atDocumentEnd = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      if (atDocumentEnd) {
        setActiveView(targetTabs[targetTabs.length - 1]?.key ?? next);
        return;
      }
      for (const tab of targetTabs) {
        const target = document.getElementById(tab.targetId);
        if (target && target.getBoundingClientRect().top <= 220) next = tab.key;
      }
      setActiveView(next);
    }

    let frame = 0;
    function scheduleSync() {
      window.cancelAnimationFrame(frame);
      frame = window.requestAnimationFrame(syncActiveSection);
    }

    function releaseHashLock() {
      hashLockedView = "";
      scheduleSync();
    }

    function releaseHashLockOnKeydown(event: KeyboardEvent) {
      if (["ArrowDown", "ArrowUp", "PageDown", "PageUp", "Home", "End", " "].includes(event.key)) {
        releaseHashLock();
      }
    }

    scheduleSync();
    const contentRoot = document.getElementById("studio-content") ?? document.body;
    const mutationObserver = new MutationObserver(scheduleSync);
    mutationObserver.observe(contentRoot, { childList: true, subtree: true });
    const resizeObserver = new ResizeObserver(scheduleSync);
    resizeObserver.observe(document.documentElement);
    window.addEventListener("hashchange", scheduleSync);
    window.addEventListener("keydown", releaseHashLockOnKeydown);
    window.addEventListener("scroll", scheduleSync, { passive: true });
    window.addEventListener("touchstart", releaseHashLock, { passive: true });
    window.addEventListener("wheel", releaseHashLock, { passive: true });
    return () => {
      window.cancelAnimationFrame(frame);
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      window.removeEventListener("hashchange", scheduleSync);
      window.removeEventListener("keydown", releaseHashLockOnKeydown);
      window.removeEventListener("scroll", scheduleSync);
      window.removeEventListener("touchstart", releaseHashLock);
      window.removeEventListener("wheel", releaseHashLock);
    };
  }, [pathname]);

  const activeViewInCurrentNavigation = viewNavigation?.tabs.some((tab) => tab.key === activeView) ?? false;

  return (
    <StudioProvider>
      <div
        className="app-shell studio-shell"
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
          {viewNavigation ? (
            <div className="studio-view-nav-wrap">
              <nav className="studio-view-navigation glass-surface" aria-label={`${viewNavigation.label} views`}>
                <span className="studio-view-context">
                  <small>View</small>
                  <strong>{viewNavigation.label}</strong>
                </span>
                <span className="studio-view-tabs">
                  {viewNavigation.tabs.map((tab) => {
                    const current = activeViewInCurrentNavigation
                      ? activeView === tab.key
                      : tab.targetId
                        ? viewNavigation.tabs[0]?.key === tab.key
                        : tab.href === pathname;
                    return (
                      <Link
                        aria-current={current ? (tab.targetId ? "location" : "page") : undefined}
                        className={current ? "is-active" : undefined}
                        href={tab.href}
                        key={tab.key}
                        onClick={() => setActiveView(tab.key)}
                      >
                        {tab.label}
                      </Link>
                    );
                  })}
                </span>
                <Link className="studio-view-action" href={contextAction.href}>
                  <span>{contextAction.label}</span>
                  <ArrowRight aria-hidden="true" size={15} strokeWidth={1.9} />
                </Link>
              </nav>
            </div>
          ) : null}
          <main className="page-canvas" id="studio-content">{children}</main>
        </div>
        <aside
          aria-hidden={mobileChromeMode === "suspended" || undefined}
          aria-label="Mobile Studio controls"
          className="shop-mobile-shell studio-mobile-shell"
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
              className="shop-mobile-context shop-dock-lens"
              href={contextAction.href}
              tabIndex={mobileChromeMode === "navigation" || mobileChromeMode === "suspended" ? -1 : undefined}
            >
              <span>
                <small>{contextAction.eyebrow}</small>
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
                aria-label="Open the justurban wears public shop"
                className="shop-mobile-fab shop-dock-lens studio-mobile-fab"
                href="/shop"
              >
                <BrandIcon className="studio-mobile-app-icon" size={44} />
                <ExternalLink className="studio-mobile-exit-mark" aria-hidden="true" size={18} strokeWidth={2.1} />
              </Link>
            </div>
          </div>
        </aside>
      </div>
    </StudioProvider>
  );
}
