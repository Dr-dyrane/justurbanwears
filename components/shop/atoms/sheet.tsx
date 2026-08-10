import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ComponentPropsWithoutRef,
} from "react";

export const ShopSheet = forwardRef<
  HTMLDialogElement,
  ComponentPropsWithoutRef<"dialog">
>(function ShopSheet({ className, ...props }, ref) {
  return (
    <dialog
      className={["shop-sheet", className].filter(Boolean).join(" ")}
      ref={ref}
      {...props}
    />
  );
});

export function ShopSheetHandle() {
  return <div className="shop-sheet-handle" aria-hidden="true" />;
}

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
