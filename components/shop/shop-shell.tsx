"use client";

import {
  ArrowRight,
  CircleUserRound,
  Heart,
  House,
  ReceiptText,
  Search,
  ShoppingBag,
  type LucideIcon,
} from "lucide-react";
import { usePathname } from "next/navigation";
import { useMemo } from "react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import { createBrowserCommerceService } from "../../lib/shop/services/commerce-service";
import type { ShopProduct } from "../../lib/shop/domain/entities";
import { BrandWordmark } from "../brand/brand-wordmark";
import { ThemeToggle } from "../theme/theme-toggle";
import { ShopLink as Link } from "./atoms/shop-link";
import { ShopProvider, useShop } from "./shop-provider";
import chromeStyles from "./shop-mobile-chrome.module.css";

const nav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/shop", label: "Home", icon: House },
  { href: "/shop/search", label: "Search", icon: Search },
  { href: "/shop/saved", label: "Saved", icon: Heart },
  { href: "/shop/orders", label: "Checkouts", icon: ReceiptText },
];

function destinationState(href: string, pathname: string) {
  const exact = pathname === href;
  const nested = href === "/shop"
    ? pathname.startsWith("/shop/products/")
    : pathname.startsWith(`${href}/`);
  return {
    active: exact || nested,
    current: exact ? "page" as const : nested ? "location" as const : undefined,
  };
}

function ShopChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bag, getProduct, isOnline, saved } = useShop();
  const {
    chromeHidden,
    closeNavigation,
    mode: mobileChromeMode,
    navigationRef,
    revealNavigation,
    suspended: mobileChromeSuspended,
  } = useMobileChrome(pathname);
  const activeMobileDestination = nav.find((item) => destinationState(item.href, pathname).active);
  const mobileDestination = activeMobileDestination
    ?? (pathname === "/shop/bag" || pathname === "/shop/checkout"
      ? { label: "Bag", icon: ShoppingBag }
      : pathname === "/shop/account"
        ? { label: "Account", icon: CircleUserRound }
        : { label: "Shop", icon: House });
  const MobileDestinationIcon = mobileDestination.icon;
  const currentProduct = pathname.startsWith("/shop/products/")
    ? getProduct(pathname.slice("/shop/products/".length))
    : undefined;
  const productAction = currentProduct && (!currentProduct.availabilityConfirmed || currentProduct.availability === "AVAILABLE")
    ? { eyebrow: "This piece", label: "Choose size and buy", href: "#shop-purchase" }
    : currentProduct
      ? { eyebrow: currentProduct.availability === "SOLD" ? "Archive" : "Unavailable", label: "See similar pieces", href: "/shop/search" }
      : undefined;
  const contextAction = !isOnline
    ? { eyebrow: "Offline", label: "Review app connection and local state", href: "/shop/account" }
    : pathname === "/shop/bag"
      ? bag.length
        ? { eyebrow: "Ready to continue", label: "Continue to checkout", href: "/shop/checkout" }
        : { eyebrow: "Drop 01", label: "Find a piece", href: "/shop/search" }
    : pathname === "/shop/checkout"
      ? { eyebrow: "Your bag", label: `${bag.length} ${bag.length === 1 ? "piece" : "pieces"} selected`, href: "/shop/bag" }
    : pathname === "/shop/orders"
      ? { eyebrow: "The wardrobe", label: "Find another piece", href: "/shop/search" }
    : pathname.startsWith("/shop/orders/")
      ? { eyebrow: "Checkout drafts", label: "View all drafts", href: "/shop/orders" }
    : pathname.startsWith("/shop/products/")
      ? productAction ?? { eyebrow: "The wardrobe", label: "Find a piece", href: "/shop/search" }
    : bag.length
    ? {
        eyebrow: "Bag ready",
        label: `${bag.length} one-off ${bag.length === 1 ? "piece" : "pieces"} to review`,
        href: "/shop/bag",
      }
    : pathname === "/shop/search"
        ? { eyebrow: "Drop 01", label: "Browse available pieces", href: "/shop#discover" }
      : { eyebrow: "Drop 01", label: "Search the wardrobe", href: "/shop/search" };

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
            <BrandWordmark className="shop-wordmark-lockup" />
          </Link>
          <div className="shop-nav-links">
            {nav.map((item) => {
              const destination = destinationState(item.href, pathname);
              return (
                <Link
                  aria-current={destination.current}
                  className={destination.active ? "is-active" : undefined}
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
              aria-label="Account and orders"
              className={`shop-account-link${pathname === "/shop/account" ? " is-active" : ""}`}
              href="/shop/account"
            >
              <CircleUserRound aria-hidden="true" size={19} strokeWidth={1.75} />
              <span>Account</span>
            </Link>
            <Link
              aria-current={pathname === "/shop/bag" ? "page" : pathname === "/shop/checkout" ? "location" : undefined}
              aria-label={`Bag, ${bag.length} items`}
              className="shop-bag-link"
              href="/shop/bag"
            >
              <ShoppingBag aria-hidden="true" size={16} strokeWidth={1.9} />
              <span>Bag</span>
              <b key={bag.length}>{bag.length}</b>
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
          <BrandWordmark className="shop-footer-wordmark" />
        </Link>
        <p>Urban ladies’ wear, clearly described.</p>
        <span>Curated in Lagos · 2026</span>
      </footer>
      <aside
        aria-hidden={mobileChromeMode === "suspended" || undefined}
        aria-label="Mobile shop controls"
        className="shop-mobile-shell"
        data-mobile-chrome-mode={mobileChromeMode}
        inert={mobileChromeMode === "suspended" || undefined}
      >
        <div className={`shop-mobile-composition ${chromeStyles.composition}`}>
          <button
            aria-controls="shop-mobile-navigation"
            aria-expanded={mobileChromeMode === "navigation"}
            aria-hidden={mobileChromeMode !== "compact" || undefined}
            aria-label={`Show navigation. ${mobileDestination.label} selected`}
            className={`shop-mobile-nav-reveal shop-dock-lens ${chromeStyles.edgeAction}`}
            onClick={revealNavigation}
            tabIndex={mobileChromeMode === "compact" ? 0 : -1}
            type="button"
          >
            <span><MobileDestinationIcon aria-hidden="true" size={25} strokeWidth={2.2} /></span>
          </button>
          <Link
            aria-hidden={mobileChromeMode === "navigation" || mobileChromeMode === "suspended" || undefined}
            className={`shop-mobile-context shop-dock-lens ${chromeStyles.contextAction}`}
            href={contextAction.href}
            tabIndex={mobileChromeMode === "navigation" || mobileChromeMode === "suspended" ? -1 : undefined}
          >
            <span>
              <small>{contextAction.eyebrow}</small>
              <strong>{contextAction.label}</strong>
            </span>
            <ArrowRight aria-hidden="true" size={17} strokeWidth={1.9} />
          </Link>
          <div className={`shop-mobile-row ${chromeStyles.row}`}>
            <nav
              aria-hidden={mobileChromeMode === "compact" || mobileChromeMode === "suspended" || undefined}
              aria-label="Mobile shop navigation"
              className="shop-mobile-dock shop-dock-lens"
              id="shop-mobile-navigation"
              inert={mobileChromeMode === "compact" || mobileChromeMode === "suspended" || undefined}
              ref={navigationRef}
            >
              {nav.map((item) => {
                const destination = destinationState(item.href, pathname);
                const Icon = item.icon;
                return (
                  <Link
                    aria-current={destination.current}
                    aria-label={item.label}
                    className={destination.active ? "is-active" : undefined}
                    href={item.href}
                    key={item.href}
                    onClick={closeNavigation}
                  >
                    <Icon aria-hidden="true" size={22} strokeWidth={destination.active ? 2.2 : 1.65} />
                    <span>{item.label}{item.href === "/shop/saved" && saved.length ? ` · ${saved.length}` : ""}</span>
                  </Link>
                );
              })}
            </nav>
            <Link
              aria-current={pathname === "/shop/bag" ? "page" : pathname === "/shop/checkout" ? "location" : undefined}
              aria-label={`Bag, ${bag.length} items`}
              className={`shop-mobile-fab shop-dock-lens ${chromeStyles.edgeAction}${pathname === "/shop/bag" || pathname === "/shop/checkout" ? " is-active" : ""}`}
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

export function ShopShell({
  children,
  initialProducts,
}: {
  children: React.ReactNode;
  initialProducts: readonly ShopProduct[];
}) {
  const service = useMemo(
    () => createBrowserCommerceService(initialProducts),
    [initialProducts],
  );
  return (
    <ShopProvider service={service}>
      <ShopChrome>{children}</ShopChrome>
    </ShopProvider>
  );
}
