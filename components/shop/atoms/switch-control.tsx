import type { ButtonHTMLAttributes, ReactNode } from "react";

interface ShopSwitchControlProps extends Omit<
  ButtonHTMLAttributes<HTMLButtonElement>,
  "children" | "onChange" | "role"
> {
  checked: boolean;
  description: ReactNode;
  icon?: ReactNode;
  label: ReactNode;
  onCheckedChange(checked: boolean): void;
}

export function ShopSwitchControl({
  checked,
  className,
  description,
  icon,
  label,
  onCheckedChange,
  type = "button",
  ...props
}: ShopSwitchControlProps) {
  return (
    <button
      aria-checked={checked}
      className={["shop-switch-control", className].filter(Boolean).join(" ")}
      onClick={() => onCheckedChange(!checked)}
      role="switch"
      type={type}
      {...props}
    >
      <span className="shop-switch-copy">
        {icon}
        <span><strong>{label}</strong><small>{description}</small></span>
      </span>
      <span className="shop-switch" aria-hidden="true"><i /></span>
    </button>
  );
}
