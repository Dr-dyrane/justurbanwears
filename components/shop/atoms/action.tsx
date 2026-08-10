import Link from "next/link";
import type {
  ButtonHTMLAttributes,
  ComponentPropsWithoutRef,
} from "react";

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

type ShopActionLinkProps = ComponentPropsWithoutRef<typeof Link> & {
  tone?: Exclude<ShopActionTone, "muted">;
};

export function ShopActionLink({
  className,
  tone = "primary",
  ...props
}: ShopActionLinkProps) {
  return <Link className={actionClassName(tone, className)} {...props} />;
}
