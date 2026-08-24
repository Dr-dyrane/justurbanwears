import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Clock3,
  LockKeyhole,
  RotateCcw,
} from "lucide-react";
import type { StudioLifecycleState } from "../../../lib/studio/domain/entities";

export type StudioLifecycleTone = "neutral" | "positive" | "caution" | "critical";

export const STUDIO_LIFECYCLE_PRESENTATION: Record<StudioLifecycleState, {
  Icon: typeof CircleCheck;
  label: string;
  tone: StudioLifecycleTone;
}> = {
  EMPTY: { Icon: CircleDashed, label: "Empty", tone: "neutral" },
  DRAFT: { Icon: Clock3, label: "Draft", tone: "neutral" },
  READY: { Icon: CircleCheck, label: "Ready", tone: "positive" },
  PUBLISHED: { Icon: CircleCheck, label: "Live", tone: "positive" },
  RESERVED: { Icon: CirclePause, label: "Reserved", tone: "caution" },
  SOLD: { Icon: LockKeyhole, label: "Sold", tone: "neutral" },
  CANCELLED: { Icon: CircleX, label: "Cancelled", tone: "neutral" },
  RETURNED: { Icon: RotateCcw, label: "Returned", tone: "critical" },
  ERROR: { Icon: CircleAlert, label: "Needs attention", tone: "critical" },
};

export function LifecycleMeta({ className = "", state }: { className?: string; state: StudioLifecycleState }) {
  const presentation = STUDIO_LIFECYCLE_PRESENTATION[state];
  const StatusIcon = presentation.Icon;

  return (
    <span className={`studio-lifecycle-meta${className ? ` ${className}` : ""}`} data-tone={presentation.tone}>
      <StatusIcon aria-hidden="true" size={12} strokeWidth={1.9} />
      <span>{presentation.label}</span>
    </span>
  );
}
