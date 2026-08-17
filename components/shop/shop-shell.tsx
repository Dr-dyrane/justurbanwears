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
import { useEffect, useMemo, useState } from "react";
import { useMobileChrome } from "../../hooks/use-mobile-chrome";
import { createBrowserCommerceService } from "../../lib/shop/services/commerce-service";
import type { ShopProduct } from "../../lib/shop/domain/entities";
import { isBagCheckoutAvailable } from "../../lib/shop/domain/state";
import { BrandWordmark } from "../brand/brand-wordmark";
import { ShopLink as Link } from "./atoms/shop-link";
import {
  ShopMobileActionProvider,
  useRegisteredShopMobileAction,
} from "./shop-mobile-action-context";
import { ShopProvider, useShop } from "./shop-provider";

const nav: Array<{ href: string; label: string; icon: LucideIcon }> = [
  { href: "/shop", label: "Home", icon: House },
  { href: "/shop/search", label: "Search", icon: Search },
  { href: "/shop/saved", label: "Saved", icon: Heart },
  { href: "/shop/orders", label: "Orders", icon: ReceiptText },
  { href: "/shop/bag", label: "Bag", icon: ShoppingBag },
];

function destinationState(href: string, pathname: string) {
  const exact = pathname === href;
  const nested = href === "/shop"
    ? pathname.startsWith("/shop/products/")
    : href === "/shop/bag"
      ? pathname === "/shop/checkout"
      : pathname.startsWith(`${href}/`);
  return {
    active: exact || nested,
    current: exact ? "page" as const : nested ? "location" as const : undefined,
  };
}

function useTargetVisibility(targetId?: string) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!targetId) {
      setVisible(false);
      return;
    }
    const target = document.getElementById(targetId);
    if (!target) {
      setVisible(false);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      setVisible(entry.isIntersecting && entry.intersectionRatio >= 0.55);
    }, { threshold: [0, 0.55, 1] });
    observer.observe(target);
    return () => observer.disconnect();
  }, [targetId]);

  return visible;
}

function ShopChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { bag, isOnline, products, saved } = useShop();
  const {
    chromeHidden,
    chromeScrolled,
    mode: mobileChromeMode,
    suspended: mobileChromeSuspended,
  } = useMobileChrome(pathname);
  const registeredMobileAction = useRegisteredShopMobileAction();
  const targetVisible = useTargetVisibility(registeredMobileAction?.invokeTargetId);
  const checkoutAvailable = isBagCheckoutAvailable(bag, products);
  const routeAction = pathname === "/shop/bag"
    ? bag.length
      ? checkoutAvailable
        ? { eyebrow: "Bag ready", label: "Continue to checkout", href: "/shop/checkout" }
        : { eyebrow: "Bag needs review", label: "Check availability", href: "#shop-content" }
      : null
    : pathname === "/shop/checkout"
      ? { eyebrow: "Your bag", label: "Review bag", href: "/shop/bag" }
      : pathname.startsWith("/shop/orders/")
        ? { eyebrow: "Order", label: "Review status", href: "#shop-content" }
        : null;
  const contextAction = !isOnline
    ? { eyebrow: "Offline", label: "Review connection", href: "/shop/account" }
    : registeredMobileAction ?? routeAction;
  const accessoryVisible = Boolean(contextAction && !targetVisible && !mobileChromeSuspended);

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
      className="shop-shell"
      data-experience-surface="shop"
      data-experience-tempo="focus"
      data-mobile-chrome-hidden={chromeHidden || undefined}
      data-mobile-chrome-scrolled={chromeScrolled || undefined}
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
            {nav.filter((item) => item.href !== "/shop/bag").map((item) => {
              const destination = destinationState(item.href, pathname);
              return (
                <Link
                  aria-current={destination.current}
                  className={destination.active ? "is-active" : undefined}
                  href={item.href}
                  key={item.href}
                >
                  {item.label}
                  {item.href === "/shop/saved" && saved.length ? <span className="nav-count">{saved.length}</span> : null}
                </Link>
              );
            })}
          </div>
          <div className="shop-header-actions">
            <Link
              aria-current={pathname === "/shop/account" ? "page" : undefined}
              aria-label="Account and preferences"
              className={`shop-account-link${pathname === "/shop/account" ? " is-active" : ""}`}
              href="/shop/account"
            >
              <CircleUserRound aria-hidden="true" size={20} strokeWidth={1.75} />
              <span>Account</span>
            </Link>
            <Link
              aria-current={destinationState("/shop/bag", pathname).current}
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
      {!isOnline ? <div className="shop-offline-banner" role="status">You’re offline. Shopping actions resume when you reconnect.</div> : null}
      <main id="shop-content">{children}</main>
      <footer className="shop-footer">
        <Link className="shop-footer-mark" href="/shop" aria-label="justurban wears shop home"><BrandWordmark className="shop-footer-wordmark" /></Link>
        <p>Urban ladies’ wear, clearly described.</p>
        <span>Curated in Lagos · 2026</span>
      </footer>
      <aside
        aria-hidden={mobileChromeMode === "suspended" || undefined}
        aria-label="Mobile shop controls"
        className="shop-mobile-shell"
        data-accessory-visible={accessoryVisible || undefined}
        data-experience-layer="island"
        data-mobile-chrome-mode={mobileChromeMode}
        inert={mobileChromeMode === "suspended" || undefined}
      >
        <div className="shop-mobile-composition">
          {contextAction ? (
            <Link
              aria-hidden={!accessoryVisible || undefined}
              className="shop-mobile-context shop-dock-lens"
              data-experience-action="primary"
              href={contextAction.href}
              onClick={invokeContextAction}
              tabIndex={accessoryVisible ? undefined : -1}
            >
              <span><small>{contextAction.eyebrow}</small><strong>{contextAction.label}</strong></span>
              <ArrowRight aria-hidden="true" size={17} strokeWidth={1.9} />
            </Link>
          ) : null}
          <nav aria-label="Shop tabs" className="shop-mobile-dock shop-dock-lens">
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
                >
                  <Icon aria-hidden="true" size={21} strokeWidth={destination.active ? 2.2 : 1.65} />
                  <span>{item.label}{item.href === "/shop/saved" && saved.length ? ` · ${saved.length}` : item.href === "/shop/bag" && bag.length ? ` · ${bag.length}` : ""}</span>
                </Link>
              );
            })}
          </nav>
        </div>
      </aside>
    </div>
  );
}

export function ShopShell({ children, initialProducts }: { children: React.ReactNode; initialProducts: readonly ShopProduct[] }) {
  const service = useMemo(() => createBrowserCommerceService(initialProducts), [initialProducts]);
  return <ShopMobileActionProvider><ShopProvider service={service}><ShopChrome>{children}</ShopChrome></ShopProvider></ShopMobileActionProvider>;
}
