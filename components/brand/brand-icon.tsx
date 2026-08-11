import { BRAND_ASSETS } from "../../lib/brand/assets";

export function BrandIcon({ className, size }: { className?: string; size: number }) {
  return (
    // The surrounding link supplies the accessible name.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt=""
      className={className}
      height={size}
      src={BRAND_ASSETS.icon.runtimeSvg}
      width={size}
    />
  );
}
