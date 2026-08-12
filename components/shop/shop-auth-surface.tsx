"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { ArrowLeft, Check, PackageCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import { BrandWordmark } from "../brand/brand-wordmark";
import { ShopLink as Link } from "./atoms/shop-link";
import styles from "./shop-auth.module.css";

const authClient = createAuthClient();

export function ShopAuthSurface({ path, returnTo }: { path: string; returnTo: string }) {
  return (
    <main className={styles.shell} id="shop-content">
      <Link className={styles.back} href="/shop">
        <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.8} /> Keep browsing
      </Link>

      <section className={styles.stage} aria-labelledby="shop-auth-title">
        <div className={styles.story}>
          <BrandWordmark className={styles.wordmark} />
          <p className={styles.kicker}>Your wardrobe, remembered</p>
          <h1 id="shop-auth-title">A quiet way back to every order.</h1>
          <div className={styles.promises} aria-label="Account benefits">
            <span><PackageCheck aria-hidden="true" size={17} /><b>Orders in one place</b></span>
            <span><Check aria-hidden="true" size={17} /><b>Your bag stays open</b></span>
            <span><Sparkles aria-hidden="true" size={17} /><b>Guest browsing always available</b></span>
          </div>
        </div>

        <div className={styles.editorial} aria-hidden="true">
          <Image
            alt=""
            fill
            priority
            sizes="(max-width: 760px) 100vw, 42vw"
            src="/shop/products/coral-drift-dress/04-model-front.webp"
          />
          <span>Curated in Lagos</span>
        </div>

        <div className={styles.auth}>
          <div className={styles.authHeading}>
            <p>{path === "sign-up" ? "Create account" : "Welcome back"}</p>
            <span>{path === "sign-up" ? "Save your details for the next handoff." : "Continue to your account and order history."}</span>
          </div>
          <NeonAuthUIProvider
            authClient={authClient}
            basePath="/auth"
            credentials={{ forgotPassword: true, rememberMe: true }}
            redirectTo={returnTo}
            signUp={{ fields: ["name"] }}
          >
            <AuthView
              classNames={{
                base: styles.authCard,
                content: styles.authContent,
                description: styles.authDescription,
                footer: styles.authFooter,
                footerLink: styles.authFooterLink,
                form: {
                  base: styles.form,
                  button: styles.button,
                  checkbox: styles.checkbox,
                  error: styles.error,
                  input: styles.input,
                  label: styles.label,
                  outlineButton: styles.outlineButton,
                  primaryButton: styles.primaryButton,
                  secondaryButton: styles.outlineButton,
                },
                header: styles.authHeader,
                separator: styles.separator,
                title: styles.authTitle,
              }}
              localization={{
                SIGN_IN: "Welcome back",
                SIGN_IN_ACTION: "Continue",
                SIGN_IN_DESCRIPTION: "Open your orders and account.",
                SIGN_UP: "Join the wardrobe",
                SIGN_UP_ACTION: "Create account",
                SIGN_UP_DESCRIPTION: "Keep your orders together.",
              }}
              path={path}
              redirectTo={returnTo}
              socialLayout="vertical"
            />
          </NeonAuthUIProvider>
        </div>
      </section>
    </main>
  );
}
