import type {
  AnchorHTMLAttributes,
  ButtonHTMLAttributes,
} from "react";
import { ShopLink } from "./shop-link";

type ShopActionTone = "primary" | "secondary" | "muted";

function actionClassName(tone: ShopActionTone, className?: string) {
  return ["shop-action", `shop-action-${tone}`, className].filter(Boolean).join(" ");
}

interface ShopActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ShopActionTone;
}

export function ShopActionButton({
  className,
  tone = "primary",
  type = "button",
  ...props
}: ShopActionButtonProps) {
  return (
    <button
      className={actionClassName(tone, className)}
      type={type}
      {...props}
    />
  );
}

type ShopActionLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
  tone?: Exclude<ShopActionTone, "muted">;
};

export function ShopActionLink({
  className,
  tone = "primary",
  ...props
}: ShopActionLinkProps) {
  return <ShopLink className={actionClassName(tone, className)} {...props} />;
}
