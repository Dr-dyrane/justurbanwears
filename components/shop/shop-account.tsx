"use client";

import {
  ChevronRight,
  Heart,
  ReceiptText,
  Store,
  SunMoon,
} from "lucide-react";
import { PwaInstallControl } from "../pwa/pwa-install-control";
import { ThemeSettings } from "../theme/theme-settings";
import { ShopLink as Link } from "./atoms/shop-link";
import { useShop } from "./shop-provider";

export function ShopAccount() {
  const {
    orders,
    saved,
  } = useShop();

  return (
    <div className="shop-list-page shop-account-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Account</p>
        <h1>Your space.</h1>
      </header>

      <div className="shop-account-grid">
        <section className="shop-account-section" aria-labelledby="shopping-space-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><Heart size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">Shopping</p><h2 id="shopping-space-title">Keep your finds close</h2></div>
          </div>
          <div className="shop-account-links">
            <Link href="/shop/saved">
              <span><Heart aria-hidden="true" size={18} strokeWidth={1.7} /><span><strong>Saved pieces</strong><small>{saved.length} saved</small></span></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/shop/orders">
              <span><ReceiptText aria-hidden="true" size={18} strokeWidth={1.7} /><span><strong>Saved checkouts</strong><small>{orders.length} {orders.length === 1 ? "checkout" : "checkouts"}</small></span></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
          </div>
        </section>

        <section className="shop-account-section" aria-labelledby="appearance-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><SunMoon size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">Appearance</p><h2 id="appearance-title">Set the atmosphere</h2></div>
          </div>
          <ThemeSettings />
        </section>

        <section className="shop-account-section shop-install-section" aria-labelledby="install-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true"><Store size={19} strokeWidth={1.75} /></span>
            <div><p className="shop-kicker">App</p><h2 id="install-title">Keep the edit close</h2></div>
          </div>
          <PwaInstallControl />
        </section>
      </div>
    </div>
  );
}
