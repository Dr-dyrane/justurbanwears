import type { AnchorHTMLAttributes } from "react";

export type ShopLinkProps = Omit<AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  href: string;
};

/**
 * Public-shop navigation deliberately uses the browser document boundary.
 * The current Nitro production adapter can intercept vinext links without
 * completing navigation; a native anchor remains reliable on touch, keyboard,
 * and pointer input while preserving a real href.
 */
export function ShopLink({ children, href, ...props }: ShopLinkProps) {
  return <a href={href} {...props}>{children}</a>;
}
