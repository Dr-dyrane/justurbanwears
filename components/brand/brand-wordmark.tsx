import { BRAND_ASSETS } from "../../lib/brand/assets";

export function BrandWordmark({ className }: { className?: string }) {
  return (
    <span aria-hidden="true" className={["brand-wordmark", className].filter(Boolean).join(" ")}>
      {/* The outlined masters keep every live wordmark independent of local fonts. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="brand-wordmark-image brand-wordmark-image-light"
        height={37}
        src={BRAND_ASSETS.wordmark.runtimeSvg}
        width={162}
      />
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt=""
        className="brand-wordmark-image brand-wordmark-image-reverse"
        height={37}
        src={BRAND_ASSETS.wordmark.runtimeReverseSvg}
        width={162}
      />
    </span>
  );
}
