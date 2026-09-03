"use client";

import { RefreshCw } from "lucide-react";
import { studioProjectionAsOfLabel } from "../../../lib/studio/application/projection-freshness";

export function StudioProjectionFreshnessNotice({
  asOf,
  error,
  onRetry,
}: {
  asOf: string | null;
  error: string;
  onRetry(): void;
}) {
  return (
    <div className="studio-projection-freshness" role="status">
      <div>
        <strong>Last-known Studio</strong>
        <span>{studioProjectionAsOfLabel(asOf)} · {error || "Refresh failed."}</span>
      </div>
      <button onClick={onRetry} type="button">
        <RefreshCw aria-hidden="true" size={15} />
        Try again
      </button>
    </div>
  );
}
