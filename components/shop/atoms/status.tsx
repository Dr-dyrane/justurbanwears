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
  "No payment is taken. Placing the order saves it on this device.";

export function LocalCommerceDisclosure({ className }: { className?: string }) {
  return (
    <p className={["shop-local-disclosure", className].filter(Boolean).join(" ")}
    >{localCommerceDisclosure}</p>
  );
}
