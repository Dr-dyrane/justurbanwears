"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import { AuthView, NeonAuthUIProvider, type AuthLocalization, type AuthViewClassNames } from "@neondatabase/auth/react/ui";

const authClient = createAuthClient();

export const PASSWORDLESS_AUTH_LOCALIZATION = {
  EMAIL_OTP: "Email code",
  EMAIL_OTP_DESCRIPTION: "Enter your email to receive a sign-in code.",
  EMAIL_OTP_SEND_ACTION: "Send code",
  EMAIL_OTP_VERIFICATION_SENT: "Code sent. Check your email.",
  EMAIL_OTP_VERIFY_ACTION: "Continue",
} satisfies AuthLocalization;

type PasswordlessAuthViewProps = {
  classNames?: AuthViewClassNames;
  localization?: AuthLocalization;
  returnTo: string;
};

export function PasswordlessAuthView({ classNames, localization, returnTo }: PasswordlessAuthViewProps) {
  return (
    <NeonAuthUIProvider
      authClient={authClient}
      basePath="/auth"
      credentials={false}
      emailOTP
      magicLink={false}
      passkey={false}
      redirectTo={returnTo}
      signUp={false}
      social={{ providers: [] }}
    >
      <AuthView
        classNames={classNames}
        localization={{ ...PASSWORDLESS_AUTH_LOCALIZATION, ...localization }}
        otpSeparators={1}
        redirectTo={returnTo}
        socialLayout="vertical"
        view="EMAIL_OTP"
      />
    </NeonAuthUIProvider>
  );
}
