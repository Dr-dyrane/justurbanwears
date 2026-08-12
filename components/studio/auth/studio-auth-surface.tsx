"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { AuthView, NeonAuthUIProvider } from "@neondatabase/auth/react/ui";
import { BrandIcon } from "../../brand/brand-icon";

const authClient = createAuthClient();

export function StudioAuthSurface({ path, returnTo }: { path: string; returnTo: string }) {
  return (
    <main className="studio-auth-shell">
      <section aria-labelledby="studio-auth-title" className="studio-auth-panel">
        <div className="studio-auth-brand" aria-hidden="true"><BrandIcon size={48} /></div>
        <p className="eyebrow">Studio · Lulu</p>
        <h1 id="studio-auth-title">Your private wardrobe desk.</h1>
        <NeonAuthUIProvider
          authClient={authClient}
          basePath="/auth"
          credentials={{ forgotPassword: true, rememberMe: true }}
          redirectTo={returnTo}
          signUp={{ fields: ["name"] }}
        >
          <AuthView path={path} redirectTo={returnTo} socialLayout="vertical" />
        </NeonAuthUIProvider>
      </section>
    </main>
  );
}
