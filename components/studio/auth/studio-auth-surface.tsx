"use client";

import { BrandIcon } from "../../brand/brand-icon";
import { PasswordlessAuthView } from "../../auth/passwordless-auth-view";

export function StudioAuthSurface({ returnTo }: { path: string; returnTo: string }) {
  return (
    <main className="studio-auth-shell">
      <section aria-labelledby="studio-auth-title" className="studio-auth-panel">
        <div className="studio-auth-brand" aria-hidden="true"><BrandIcon size={48} /></div>
        <p className="eyebrow">Studio · Lulu</p>
        <h1 id="studio-auth-title">Your private wardrobe desk.</h1>
        <PasswordlessAuthView
          classNames={{
            base: "studio-auth-card",
            content: "studio-auth-content",
            description: "studio-auth-description",
            header: "studio-auth-header",
            title: "studio-auth-title",
            form: {
              base: "studio-auth-form",
              button: "studio-auth-button",
              error: "studio-auth-error",
              input: "studio-auth-input",
              label: "studio-auth-label",
              otpInput: "studio-auth-otp-input",
              otpInputContainer: "studio-auth-otp-container",
              primaryButton: "studio-auth-primary",
            },
          }}
          localization={{
            SIGN_IN: "Sign-in code",
            SIGN_IN_DESCRIPTION: "Enter Lulu’s email. We’ll send a six-digit code.",
            EMAIL_OTP: "Sign-in code",
            EMAIL_OTP_DESCRIPTION: "Enter Lulu’s email. We’ll send a six-digit code.",
          }}
          returnTo={returnTo}
        />
      </section>
    </main>
  );
}
