"use client";

import { useEffect, useState, type ReactNode } from "react";
import { StudioFeedback } from "./studio-feedback";
import { StudioTaskSheet } from "./studio-task-sheet";

export type StudioDecisionResult =
  | { ok: true }
  | { error: string; ok: false };

interface StudioDecisionSheetProps {
  busyLabel?: string;
  children?: ReactNode;
  confirmLabel: string;
  consequence: ReactNode;
  destructive?: boolean;
  eyebrow?: string;
  fallbackFocus?: HTMLElement | null;
  onConfirm(): Promise<StudioDecisionResult>;
  onDismiss(): void;
  open: boolean;
  receiptDetail: ReactNode;
  receiptTitle: string;
  returnFocus?: HTMLElement | null;
  summary: ReactNode;
  title: string;
}

type DecisionPhase = "review" | "loading" | "success" | "error";

/**
 * Shared consequential-mutation grammar: review, explicit confirmation,
 * pending state, then a durable receipt or recoverable error.
 */
export function StudioDecisionSheet({
  busyLabel = "Applying this change",
  children,
  confirmLabel,
  consequence,
  destructive = false,
  eyebrow = "Review",
  fallbackFocus,
  onConfirm,
  onDismiss,
  open,
  receiptDetail,
  receiptTitle,
  returnFocus,
  summary,
  title,
}: StudioDecisionSheetProps) {
  const [phase, setPhase] = useState<DecisionPhase>("review");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setPhase("review");
    setError("");
  }, [open, title]);

  async function confirm() {
    if (phase === "loading") return;
    setPhase("loading");
    setError("");
    const result = await onConfirm();
    if (result.ok) {
      setPhase("success");
      return;
    }
    setError(result.error);
    setPhase("error");
  }

  const footer = (requestClose: () => void) => phase === "review" ? (
    <>
      <button className="button button-secondary" onClick={requestClose} type="button">Cancel</button>
      <button className={`button button-primary${destructive ? " is-destructive" : ""}`} onClick={() => void confirm()} type="button">{confirmLabel}</button>
    </>
  ) : phase === "error" ? (
    <>
      <button className="button button-secondary" onClick={requestClose} type="button">Cancel</button>
      <button className="button button-primary" onClick={() => void confirm()} type="button">Try again</button>
    </>
  ) : phase === "success" ? (
    <button className="button button-primary" onClick={requestClose} type="button">Done</button>
  ) : undefined;

  return (
    <StudioTaskSheet
      busy={phase === "loading"}
      busyLabel={busyLabel}
      className="studio-decision-sheet"
      eyebrow={eyebrow}
      fallbackFocus={fallbackFocus}
      footer={footer}
      onDismiss={() => {
        if (phase === "loading") return false;
        onDismiss();
      }}
      open={open}
      returnFocus={returnFocus}
      title={title}
    >
      {phase === "review" ? (
        <div className="studio-decision-review">
          <p className="studio-decision-summary">{summary}</p>
          {children}
          <section className="studio-decision-consequence">
            <small>After confirmation</small>
            <p>{consequence}</p>
          </section>
        </div>
      ) : phase === "loading" ? (
        <StudioFeedback detail="Keep this sheet open while Studio finishes." state="loading" title={busyLabel} />
      ) : phase === "success" ? (
        <StudioFeedback detail={receiptDetail} state="success" title={receiptTitle} />
      ) : (
        <StudioFeedback detail={error} state="error" title="That change did not finish" />
      )}
    </StudioTaskSheet>
  );
}
