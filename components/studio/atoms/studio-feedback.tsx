"use client";

import type { HTMLAttributes, ReactNode } from "react";
import { WardrobeMotion } from "../../brand/wardrobe-motion";

export type StudioFeedbackState = "loading" | "success" | "error" | "empty";

export interface StudioFeedbackProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  action?: ReactNode;
  detail?: ReactNode;
  state: StudioFeedbackState;
  title: ReactNode;
}

export function StudioFeedback({
  action,
  className = "",
  detail,
  state,
  title,
  ...props
}: StudioFeedbackProps) {
  const isError = state === "error";
  const classes = ["studio-feedback", `is-${state}`, className].filter(Boolean).join(" ");
  return (
    <div
      {...props}
      aria-atomic="true"
      aria-busy={state === "loading" || undefined}
      aria-live={isError ? "assertive" : "polite"}
      className={classes}
      data-studio-feedback={state}
      role={isError ? "alert" : "status"}
    >
      {state === "loading" ? (
        <WardrobeMotion
          artwork="logo"
          className="studio-feedback-motion"
          loop
          polarity="auto"
          size="sm"
          variant="loader"
        />
      ) : state === "success" ? (
        <WardrobeMotion
          artwork="logo"
          className="studio-feedback-motion"
          polarity="auto"
          size="sm"
          variant="success"
        />
      ) : state === "error" ? (
        <WardrobeMotion
          artwork="logo"
          className="studio-feedback-motion"
          polarity="auto"
          size="sm"
          variant="empty"
        />
      ) : null}
      <div className="studio-feedback-copy">
        <strong>{title}</strong>
        {detail === undefined ? null : <div className="studio-feedback-detail">{detail}</div>}
      </div>
      {action === undefined ? null : <div className="studio-feedback-action">{action}</div>}
    </div>
  );
}
