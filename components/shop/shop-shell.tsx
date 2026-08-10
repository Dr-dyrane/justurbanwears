"use client";

import {
  ArrowRight,
  CircleUserRound,
  Heart,
  House,
  Package,
  Search,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import { createBrowserCommerceService } from "../../lib/shop/services/commerce-service";
import { ThemeToggle } from "../theme/theme-toggle";
import { ShopLink as Link } from "./atoms/shop-link";
import { ShopProvider, useShop } from "./shop-provider";

const nav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/shop", label: "Home", icon: House },
  { href: "/shop/search", label: "Search", icon: Search },
  { href: "/shop/saved", label: "Saved", icon: Heart },
  { href: "/shop/orders", label: "Orders", icon: Package },
];

function ShopChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bag, isOnline, saved } = useShop();
  const {
    chromeHidden,
    closeNavigation,
    mode: mobileChromeMode,
    navigationRef,
    revealNavigation,
    suspended: mobileChromeSuspended,
  } = useMobileChrome(pathname);
  const activeMobileDestination = nav.find((item) => (
    item.href === "/shop"
      ? pathname === "/shop"
      : pathname === item.href || pathname.startsWith(`${item.href}/`)
  ));
  const mobileDestination = activeMobileDestination
    ?? (pathname === "/shop/bag" || pathname === "/shop/checkout"
      ? { label: "Bag", icon: ShoppingBag }
      : pathname === "/shop/account"
        ? { label: "Account", icon: CircleUserRound }
        : { label: "Shop", icon: House });
  const MobileDestinationIcon = mobileDestination.icon;
  const contextAction = !isOnline
    ? { eyebrow: "Offline", label: "Review app connection and local state", href: "/shop/account" }
    : bag.length
    ? {
        eyebrow: "Bag ready",
        label: `${bag.length} one-off ${bag.length === 1 ? "piece" : "pieces"} to review`,
        href: "/shop/bag",
      }
    : pathname.startsWith("/shop/products/")
      ? { eyebrow: "Keep looking", label: "Search similar shapes", href: "/shop/search" }
      : pathname === "/shop/search"
        ? { eyebrow: "Editorial rail", label: "Browse the complete edit", href: "/shop#discover" }
      : pathname.startsWith("/shop/orders")
        ? { eyebrow: "After the update", label: "Find another piece", href: "/shop/search" }
        : { eyebrow: "August edit", label: "Search the complete edit", href: "/shop/search" };

  return (
    <div
      className="shop-shell"
      data-mobile-chrome-hidden={chromeHidden || undefined}
      data-mobile-chrome-suspended={mobileChromeSuspended || undefined}
    >
      <a className="shop-skip-link" href="#shop-content">Skip to shop content</a>
      <header
        aria-hidden={chromeHidden || mobileChromeSuspended || undefined}
        className="shop-header"
        inert={chromeHidden || mobileChromeSuspended || undefined}
      >
        <nav className="shop-floating-nav glass-surface" aria-label="Shop navigation">
          <Link className="shop-wordmark" href="/shop" aria-label="justurban wears shop home">
            <span className="shop-wordmark-lockup" aria-hidden="true">
              <span>justurban</span>
              <em>wears</em>
            </span>
          </Link>
          <div className="shop-nav-links">
            {nav.map((item) => {
              const active = item.href === "/shop"
                ? pathname === "/shop"
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={active ? "is-active" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                  {item.href === "/shop/saved" && saved.length ? (
                    <span className="nav-count">{saved.length}</span>
                  ) : null}
                </Link>
              );
            })}
          </div>
          <div className="shop-header-actions">
            <ThemeToggle className="shop-theme-toggle" />
            <Link
              aria-current={pathname === "/shop/account" ? "page" : undefined}
              aria-label="Account and app"
              className={`shop-account-link${pathname === "/shop/account" ? " is-active" : ""}`}
              href="/shop/account"
            >
              <CircleUserRound aria-hidden="true" size={19} strokeWidth={1.75} />
              <span>Account</span>
            </Link>
            <Link
              aria-current={pathname === "/shop/bag" || pathname === "/shop/checkout" ? "page" : undefined}
              aria-label={`Bag, ${bag.length} items`}
              className="shop-bag-link"
              href="/shop/bag"
            >
              <ShoppingBag aria-hidden="true" size={16} strokeWidth={1.9} />
              <span>Bag</span>
              <b>{bag.length}</b>
            </Link>
          </div>
        </nav>
      </header>
      {!isOnline ? (
        <div className="shop-offline-banner" role="status">
          You’re offline. Shopping actions resume when you reconnect.
        </div>
      ) : null}
      <main id="shop-content">{children}</main>
      <footer className="shop-footer">
        <Link className="shop-footer-mark" href="/shop" aria-label="justurban wears shop home">
          <span>justurban</span><em>wears</em>
        </Link>
        <p>Urban ladies’ wear, clearly described. <Link href="/shop/account">App settings</Link></p>
        <span>Curated in Lagos · 2026</span>
      </footer>
      <aside
        aria-hidden={mobileChromeMode === "suspended" || undefined}
        aria-label="Mobile shop controls"
        className="shop-mobile-shell"
        data-mobile-chrome-mode={mobileChromeMode}
        inert={mobileChromeMode === "suspended" || undefined}
      >
        <div className="shop-mobile-composition">
          <button
            aria-controls="shop-mobile-navigation"
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
              aria-label="Mobile shop navigation"
              className="shop-mobile-dock shop-dock-lens"
              id="shop-mobile-navigation"
              inert={mobileChromeMode === "compact" || mobileChromeMode === "suspended" || undefined}
              ref={navigationRef}
            >
              {nav.map((item) => {
                const active = item.href === "/shop"
                  ? pathname === "/shop"
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
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
                    <span>{item.label}{item.href === "/shop/saved" && saved.length ? ` · ${saved.length}` : ""}</span>
                  </Link>
                );
              })}
            </nav>
            <Link
              aria-current={pathname === "/shop/bag" || pathname === "/shop/checkout" ? "page" : undefined}
              aria-label={`Bag, ${bag.length} items`}
              className={`shop-mobile-fab shop-dock-lens${pathname === "/shop/bag" || pathname === "/shop/checkout" ? " is-active" : ""}`}
              href="/shop/bag"
            >
              <ShoppingBag aria-hidden="true" size={25} strokeWidth={2.05} />
              {bag.length ? <span aria-hidden="true">{bag.length}</span> : null}
            </Link>
          </div>
        </div>
      </aside>
    </div>
  );
}

export function ShopShell({ children }: { children: React.ReactNode }) {
  const service = useMemo(() => createBrowserCommerceService(), []);
  return (
    <ShopProvider service={service}>
      <ShopChrome>{children}</ShopChrome>
    </ShopProvider>
  );
}
