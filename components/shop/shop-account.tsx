"use client";

import {
  ChevronRight,
  Heart,
  LogIn,
  LogOut,
  ReceiptText,
  ShieldCheck,
  Store,
  SunMoon,
  UserRound,
} from "lucide-react";
import { createAuthClient } from "@neondatabase/auth/next";
import { useState } from "react";
import type { ShopCustomerSession } from "../../lib/auth/customer";
import { PwaInstallControl } from "../pwa/pwa-install-control";
import { ThemeSettings } from "../theme/theme-settings";
import { ShopLink as Link } from "./atoms/shop-link";
import styles from "./shop-account.module.css";
import { useShop } from "./shop-provider";

const authClient = createAuthClient();

export function ShopAccount({ customer }: { customer: ShopCustomerSession | null }) {
  const {
    saved,
  } = useShop();
  const [signingOut, setSigningOut] = useState(false);

  return (
    <div className="shop-list-page shop-account-page">
      <header className="shop-list-heading">
        <p className="shop-kicker">Account</p>
        <h1>{customer ? `Hello, ${customer.name}.` : "Your space, when you want it."}</h1>
      </header>

      <div className="shop-account-grid">
        <section className={`shop-account-section ${styles.identity}${customer ? ` ${styles.signedIn}` : ""}`} aria-labelledby="customer-identity-title">
          <div className="shop-account-section-heading">
            <span aria-hidden="true">{customer ? <UserRound size={19} strokeWidth={1.75} /> : <ShieldCheck size={19} strokeWidth={1.75} />}</span>
            <div>
              <p className="shop-kicker">{customer ? "Signed in" : "Optional account"}</p>
              <h2 className={styles.identityTitle} id="customer-identity-title">{customer ? customer.email : "Browse first. Sign in when it helps."}</h2>
            </div>
          </div>
          {customer ? (
            <button
              className={`shop-action shop-action-secondary ${styles.sessionAction}`}
              disabled={signingOut}
              onClick={async () => {
                setSigningOut(true);
                await authClient.signOut();
                window.location.assign("/shop");
              }}
              type="button"
            >
              <LogOut aria-hidden="true" size={16} /> {signingOut ? "Signing out…" : "Sign out"}
            </button>
          ) : (
            <Link className={`shop-action shop-action-primary ${styles.sessionAction}`} href="/auth/sign-in?returnTo=/shop/account">
              <LogIn aria-hidden="true" size={16} /> Sign in
            </Link>
          )}
          <p className={styles.sessionNote}>
            {customer ? "Signed in securely. Accepted orders and returns stay with your account; saved pieces and your bag stay on this device." : "Saved pieces and your bag stay on this device. Sign in when you are ready to place or track an order."}
          </p>
        </section>

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
              <span><ReceiptText aria-hidden="true" size={18} strokeWidth={1.7} /><span><strong>Your orders</strong><small>{customer ? "Live order, delivery, and return updates" : "Sign in to open server-backed orders"}</small></span></span>
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
