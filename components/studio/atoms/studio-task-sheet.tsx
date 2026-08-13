"use client";

import { useCallback, useEffect, useId, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";

const subscribeToClientReady = () => () => {};
const getClientReady = () => true;
const getServerReady = () => false;

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
  const dismissedRef = useRef(false);
  const mounted = useSyncExternalStore(subscribeToClientReady, getClientReady, getServerReady);
  const titleId = useId();

  const dismiss = useCallback(() => {
    if (dismissedRef.current) return;
    dismissedRef.current = true;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    onDismiss();
    requestAnimationFrame(() => returnFocus?.focus({ preventScroll: true }));
  }, [onDismiss, returnFocus]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    dismissedRef.current = false;
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

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    const handleBackdropClick = (event: MouseEvent) => {
      if (event.target === dialog) dismiss();
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      dismiss();
    };
    dialog.addEventListener("click", handleBackdropClick);
    dialog.addEventListener("keydown", handleEscape);
    return () => {
      dialog.removeEventListener("click", handleBackdropClick);
      dialog.removeEventListener("keydown", handleEscape);
    };
  }, [dismiss, open]);

  if (!mounted) return null;

  return createPortal(
    <dialog
      aria-labelledby={titleId}
      className={`studio-intake-sheet studio-task-sheet ${className}`.trim()}
      onCancel={(event) => { event.preventDefault(); dismiss(); }}
      onClose={dismiss}
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
          <button aria-label="Close" className="studio-icon-action" onClick={dismiss} ref={closeButtonRef} type="button">
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
    </dialog>,
    document.body,
  );
}
