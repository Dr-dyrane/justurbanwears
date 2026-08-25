"use client";

import { WardrobeMotion } from "../../brand/wardrobe-motion";

type StudioLoadingStageProps = {
  label: string;
};

export function StudioLoadingStage({ label }: StudioLoadingStageProps) {
  return (
    <div
      aria-atomic="true"
      aria-busy="true"
      aria-live="polite"
      className="studio-loading studio-loading-brand"
      data-studio-loading-stage="true"
      role="status"
    >
      <WardrobeMotion loop polarity="auto" size="sm" variant="loader" />
      <span>{label}</span>
    </div>
  );
}
