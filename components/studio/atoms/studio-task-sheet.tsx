"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowLeft, X } from "lucide-react";

interface StudioTaskSheetProps {
  children: React.ReactNode;
  className?: string;
  eyebrow: string;
  footer?: React.ReactNode;
  onBack?: () => void;
  onDismiss(): void;
  open: boolean;
  progress?: number;
  progressLabel?: string;
  returnFocus?: HTMLElement | null;
  title: string;
}

export function StudioTaskSheet({
  children,
  className = "",
  eyebrow,
  footer,
  onBack,
  onDismiss,
  open,
  progress,
  progressLabel = "Task progress",
  returnFocus,
  title,
}: StudioTaskSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    if (!dialog.open) dialog.showModal();
    requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
    };
  }, [open]);

  function close() {
    dialogRef.current?.close();
  }

  function handleClosed() {
    onDismiss();
    requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }));
  }

  return (
    <dialog
      aria-labelledby={titleId}
      className={`studio-intake-sheet studio-task-sheet ${className}`.trim()}
      onClose={handleClosed}
      ref={dialogRef}
    >
      <div className="studio-task-sheet-frame">
        <header className="studio-task-sheet-header">
          <div className="studio-task-sheet-leading">
            {onBack ? (
              <button aria-label="Go back" className="studio-icon-action" onClick={onBack} type="button">
                <ArrowLeft aria-hidden="true" size={19} />
              </button>
            ) : null}
            <div>
              <p className="eyebrow">{eyebrow}</p>
              <h2 id={titleId}>{title}</h2>
            </div>
          </div>
          <button aria-label="Close" className="studio-icon-action" onClick={close} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={19} />
          </button>
        </header>

        {typeof progress === "number" ? (
          <div
            aria-label={progressLabel}
            aria-valuemax={100}
            aria-valuemin={0}
            aria-valuenow={progress}
            className="studio-task-progress"
            role="progressbar"
          >
            <span style={{ width: `${Math.max(0, Math.min(progress, 100))}%` }} />
          </div>
        ) : null}

        <div className="studio-task-sheet-body">{children}</div>
        {footer ? <footer className="studio-task-sheet-footer">{footer}</footer> : null}
      </div>
    </dialog>
  );
}
