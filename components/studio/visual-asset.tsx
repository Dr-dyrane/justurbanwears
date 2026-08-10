import type { VisualVariant } from "../../lib/data/types";

export function VisualAsset({
  kind,
  variant,
  label,
  ratio = "portrait",
  quiet = false,
}: {
  kind: "identity" | "garment" | "generation";
  variant: VisualVariant;
  label: string;
  ratio?: "portrait" | "square" | "landscape";
  quiet?: boolean;
}) {
  return (
    <div
      className={`visual-asset visual-${kind} ratio-${ratio}${quiet ? " visual-quiet" : ""}`}
      data-variant={variant}
      role="img"
      aria-label={`${label}. Privacy-safe visual placeholder.`}
    >
      <span className="visual-light" aria-hidden="true" />
      <span className="visual-grid" aria-hidden="true" />
      <span className="visual-register" aria-hidden="true">
        <span>K</span>
        <span>{kind.slice(0, 3).toUpperCase()}</span>
      </span>
      <span className="visual-subject" aria-hidden="true">
        <span className="visual-head" />
        <span className="visual-body" />
        <span className="visual-detail" />
      </span>
      <span className="visual-caption">
        <small>{kind === "generation" ? "MOCK FRAME" : "PRIVATE REFERENCE"}</small>
        {label}
      </span>
      <span className="visual-safe-mark" aria-hidden="true">LOCAL / SAFE</span>
    </div>
  );
}
