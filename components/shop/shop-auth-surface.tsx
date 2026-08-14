"use client";

import { ArrowLeft, Check, PackageCheck, Sparkles } from "lucide-react";
import Image from "next/image";
import { PasswordlessAuthView } from "../auth/passwordless-auth-view";
import { BrandWordmark } from "../brand/brand-wordmark";
import { ShopLink as Link } from "./atoms/shop-link";
import styles from "./shop-auth.module.css";

export function ShopAuthSurface({ returnTo }: { path: string; returnTo: string }) {
  return (
    <main className={styles.shell} id="shop-content">
      <Link className={styles.back} href="/shop">
        <ArrowLeft aria-hidden="true" size={17} strokeWidth={1.8} /> Keep browsing
      </Link>

      <section className={styles.stage} aria-labelledby="shop-auth-title">
        <div className={styles.story}>
          <BrandWordmark className={styles.wordmark} />
          <p className={styles.kicker}>Your wardrobe, remembered</p>
          <h1 id="shop-auth-title">Sign in to view your orders.</h1>
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
          <PasswordlessAuthView
            classNames={{
              base: styles.authCard,
              content: styles.authContent,
              description: styles.authDescription,
              footer: styles.authFooter,
              footerLink: styles.authFooterLink,
              form: {
                base: styles.form,
                button: styles.button,
                error: styles.error,
                input: styles.input,
                label: styles.label,
                otpInput: styles.otpInput,
                otpInputContainer: styles.otpInputContainer,
                primaryButton: styles.primaryButton,
              },
              header: styles.authHeader,
              separator: styles.separator,
              title: styles.authTitle,
            }}
            localization={{
              SIGN_IN_DESCRIPTION: "Enter your email to open your orders.",
              EMAIL_OTP_DESCRIPTION: "Enter your email to open your orders.",
            }}
            returnTo={returnTo}
          />
        </div>
      </section>
    </main>
  );
}
