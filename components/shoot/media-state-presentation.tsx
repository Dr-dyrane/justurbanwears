import {
  CircleAlert,
  CircleCheck,
  CircleDashed,
  CirclePause,
  CircleX,
  Clock3,
  LoaderCircle,
} from "lucide-react";
import type { StudioAuthorityMedia } from "../../lib/studio/services/studio-authority-client";

export type MediaState = StudioAuthorityMedia["state"];

export const MEDIA_STATE_PRESENTATION: Record<MediaState, {
  detail: string;
  Icon: typeof CircleCheck;
  label: string;
  tone: "neutral" | "positive" | "caution" | "critical";
}> = {
  PENDING: {
    detail: "Queued and waiting to start.",
    Icon: Clock3,
    label: "Queued",
    tone: "neutral",
  },
  RUNNING: {
    detail: "Generation is running.",
    Icon: LoaderCircle,
    label: "Running",
    tone: "neutral",
  },
  COMPLETE: {
    detail: "The image is ready to review. It is not approved yet.",
    Icon: CirclePause,
    label: "Awaiting review",
    tone: "caution",
  },
  APPROVED: {
    detail: "Approved and kept in the private garment record.",
    Icon: CircleCheck,
    label: "Approved",
    tone: "positive",
  },
  REJECTED: {
    detail: "Rejected. This image will not be used as an approved garment view.",
    Icon: CircleX,
    label: "Rejected",
    tone: "critical",
  },
  FAILED: {
    detail: "Studio could not make a reviewable image.",
    Icon: CircleAlert,
    label: "Failed",
    tone: "critical",
  },
  INDETERMINATE: {
    detail: "Studio could not confirm the result. Check it before trying again.",
    Icon: CircleDashed,
    label: "Needs checking",
    tone: "critical",
  },
};

export function mediaStatePresentation(state: MediaState) {
  return MEDIA_STATE_PRESENTATION[state];
}

export function MediaStateMeta({ className = "", state }: { className?: string; state: MediaState }) {
  const presentation = mediaStatePresentation(state);
  const StatusIcon = presentation.Icon;

  return (
    <span
      className={`studio-lifecycle-meta${className ? ` ${className}` : ""}`}
      data-media-state={state}
      data-tone={presentation.tone}
    >
      <StatusIcon aria-hidden="true" size={12} strokeWidth={1.9} />
      <span>{presentation.label}</span>
    </span>
  );
}
