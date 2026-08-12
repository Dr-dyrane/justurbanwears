import { BRAND_ASSETS } from "../../lib/brand/assets";

type BrandLogoProps = {
  alt?: string;
  className?: string;
  width?: number;
};

export function BrandLogo({
  alt = "JustUrbanWears by Lulu",
  className,
  width = 240,
}: BrandLogoProps) {
  return (
    // The SVG wrapper preserves the owner-approved centered artwork exactly.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={alt}
      className={className}
      height={Math.round((width * 1392) / 1313)}
      src={BRAND_ASSETS.logo.runtimeSvg}
      width={width}
    />
  );
}
