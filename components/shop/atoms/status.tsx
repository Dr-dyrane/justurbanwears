import type { ReactNode } from "react";

export type ShopStatusTone = "positive" | "attention" | "muted" | "offline";

export function ShopStatusIndicator({
  className,
  detail,
  label,
  tone = "muted",
}: {
  className?: string;
  detail?: ReactNode;
  label: ReactNode;
  tone?: ShopStatusTone;
}) {
  return (
    <span
      className={["shop-status-indicator", className].filter(Boolean).join(" ")}
      data-tone={tone}
    >
      <i aria-hidden="true" />
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </span>
  );
}

export const localCommerceDisclosure =
  "Shopping activity stays on this device. Checkout fields are discarded; payment, fulfilment, and live carrier updates are not connected.";

export function LocalCommerceDisclosure({ className }: { className?: string }) {
  return (
    <p className={["shop-local-disclosure", className].filter(Boolean).join(" ")}
    >{localCommerceDisclosure}</p>
  );
}
