import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
  type HTMLAttributes,
} from "react";

export const ShopSheet = forwardRef<
  HTMLDialogElement,
  ComponentPropsWithoutRef<"dialog">
>(function ShopSheet({ className, ...props }, ref) {
  return (
    <dialog
      className={["shop-sheet", className].filter(Boolean).join(" ")}
      data-experience-layer="sheet"
      ref={ref}
      {...props}
    />
  );
});

export const ShopSheetHandle = forwardRef<
  HTMLDivElement,
  HTMLAttributes<HTMLDivElement>
>(function ShopSheetHandle({ className, ...props }, ref) {
  return (
    <div
      aria-hidden="true"
      className={["shop-sheet-handle", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  );
});

export const ShopSheetCloseButton = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement>
>(function ShopSheetCloseButton({ className, type = "button", ...props }, ref) {
  return (
    <button
      className={["shop-sheet-close", className].filter(Boolean).join(" ")}
      ref={ref}
      type={type}
      {...props}
    />
  );
});
