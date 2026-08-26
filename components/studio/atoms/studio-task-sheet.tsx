"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, X } from "lucide-react";
import { useDocumentScrollLock } from "../../../hooks/use-document-scroll-lock";
import { useHistoryBackedDialog } from "../../../hooks/use-history-backed-dialog";

const subscribeToClientReady = () => () => {};
const getClientReady = () => true;
const getServerReady = () => false;

interface StudioTaskSheetProps {
  busy?: boolean;
  busyLabel?: string;
  children: React.ReactNode;
  className?: string;
  eyebrow?: string;
  footer?: React.ReactNode | ((requestClose: () => void) => React.ReactNode);
  fallbackFocus?: HTMLElement | null;
  onBack?: () => void;
  onDismiss(): boolean | void;
  onSubmit?: React.FormEventHandler<HTMLFormElement>;
  open: boolean;
  progress?: number;
  progressLabel?: string;
  returnFocus?: HTMLElement | null;
  title: string;
}

export function StudioTaskSheet({
  busy = false,
  busyLabel = "Saving this task",
  children,
  className = "",
  eyebrow,
  fallbackFocus,
  footer,
  onBack,
  onDismiss,
  onSubmit,
  open,
  progress,
  progressLabel = "Task progress",
  returnFocus,
  title,
}: StudioTaskSheetProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const fallbackReturnFocusRef = useRef<HTMLElement | null>(null);
  const mounted = useSyncExternalStore(subscribeToClientReady, getClientReady, getServerReady);
  const titleId = useId();
  useDocumentScrollLock(open);

  const acceptDismiss = useCallback(() => {
    if (busy) return false;
    const accepted = onDismiss();
    if (accepted === false) return false;
    const dialog = dialogRef.current;
    if (dialog?.open) dialog.close();
    return true;
  }, [busy, onDismiss]);

  const { openWithHistory, requestClose } = useHistoryBackedDialog({
    isOpen: open,
    marker: `studio-task:${titleId}`,
    onDismiss: acceptDismiss,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!open) {
      if (dialog.open) dialog.close();
      return;
    }

    if (!dialog.open) {
      const activeElement = document.activeElement;
      fallbackReturnFocusRef.current = returnFocus
        ?? (activeElement instanceof HTMLElement ? activeElement : null);
      openWithHistory();
      dialog.showModal();
    }
    window.requestAnimationFrame(() => {
      closeButtonRef.current?.focus({ preventScroll: true });
    });
  }, [open, openWithHistory, returnFocus]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;

    const closeFromBackdrop = (event: globalThis.MouseEvent) => {
      if (event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left
        || event.clientX > bounds.right
        || event.clientY < bounds.top
        || event.clientY > bounds.bottom;
      if (outside) requestClose();
    };

    dialog.addEventListener("click", closeFromBackdrop);
    return () => dialog.removeEventListener("click", closeFromBackdrop);
  }, [open, requestClose]);

  const restoreFocus = useCallback(() => {
    const target = returnFocus?.isConnected
      ? returnFocus
      : fallbackFocus?.isConnected
        ? fallbackFocus
        : fallbackReturnFocusRef.current?.isConnected
          ? fallbackReturnFocusRef.current
          : null;
    window.requestAnimationFrame(() => target?.focus({ preventScroll: true }));
  }, [fallbackFocus, returnFocus]);

  if (!mounted) return null;

  return createPortal(
    <dialog
      aria-labelledby={titleId}
      aria-modal="true"
      className={`studio-intake-sheet studio-task-sheet ${className}`.trim()}
      data-experience-layer="sheet"
      data-studio-sheet-safety="guarded"
      onCancel={(event) => {
        event.preventDefault();
        requestClose();
      }}
      onClose={restoreFocus}
      ref={dialogRef}
    >
      <div aria-busy={busy || undefined} className="studio-task-sheet-frame">
        {busy ? <span aria-live="polite" className="sr-only" role="status">{busyLabel}</span> : null}
        <header className="studio-task-sheet-header">
          <div className="studio-task-sheet-leading">
            {onBack ? (
              <button aria-label="Go back" className="studio-icon-action" disabled={busy} onClick={onBack} type="button">
                <ArrowLeft aria-hidden="true" size={19} />
              </button>
            ) : null}
            <div>
              {eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}
              <h2 id={titleId}>{title}</h2>
            </div>
          </div>
          <button
            aria-label={`Close ${title}`}
            className="studio-icon-action"
            disabled={busy}
            onClick={requestClose}
            ref={closeButtonRef}
            type="button"
          >
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

        {onSubmit ? (
          <form className="studio-task-sheet-body" onSubmit={onSubmit}>{children}</form>
        ) : (
          <div className="studio-task-sheet-body">{children}</div>
        )}
        {footer ? (
          <footer className="studio-task-sheet-footer">
            {typeof footer === "function" ? footer(requestClose) : footer}
          </footer>
        ) : null}
      </div>
    </dialog>,
    document.body,
  );
}
