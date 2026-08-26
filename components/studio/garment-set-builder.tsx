"use client";

/* Private Studio images are served by authenticated same-origin routes. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Check,
  ChevronDown,
  LoaderCircle,
  Sparkles,
} from "lucide-react";
import { WardrobeMotion } from "../brand/wardrobe-motion";
import type {
  GarmentSetCommand,
  GarmentSetSlot,
  GarmentSetWorkspace,
} from "../../lib/studio/engine/garment-set-contracts";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { StudioMediaButton, type StudioMediaItem } from "./media-viewer";

type EngineErrorBody = {
  error?: { message?: string; recovery?: string };
};

type GenesisReceipt = {
  detail: string;
  title: string;
};

type GenesisError = {
  detail: string;
  title: string;
};

function pendingLabel(command: GarmentSetCommand["command"], slot: GarmentSetSlot) {
  if (command === "ADVANCE_CURRENT") return `Preparing ${slot.label.toLowerCase()}`;
  if (command === "KEEP_CURRENT") return `Keeping ${slot.label.toLowerCase()}`;
  if (command === "FIX_CURRENT") return `Applying ${slot.label.toLowerCase()} correction`;
  return `Rejecting ${slot.label.toLowerCase()}`;
}

function commandReceipt(input: {
  command: GarmentSetCommand["command"];
  correction?: string;
  nextActionLabel: string;
  slot: GarmentSetSlot;
}): GenesisReceipt {
  const next = `Next · ${input.nextActionLabel}`;
  if (input.command === "ADVANCE_CURRENT") {
    return { title: `${input.slot.label} started`, detail: `Saved privately · ${next}` };
  }
  if (input.command === "KEEP_CURRENT") {
    return { title: `${input.slot.label} kept`, detail: `Saved privately · ${next}` };
  }
  if (input.command === "REJECT_CURRENT") {
    return { title: `${input.slot.label} rejected`, detail: `Retained privately · ${next}` };
  }
  const correction = input.correction?.trim() ?? "Correction saved";
  const summary = correction.length > 120 ? `${correction.slice(0, 119)}…` : correction;
  return { title: "Correction applied", detail: `${summary} · ${next}` };
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Studio could not connect. Check your connection and try again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as EngineErrorBody;
    throw new Error([body.error?.message, body.error?.recovery].filter(Boolean).join(" ") || "Studio could not finish that action.");
  }
  return response.json() as Promise<T>;
}

function slotStatus(slot: GarmentSetSlot, current: boolean) {
  if (slot.state === "KEPT") return "Kept";
  if (current && slot.state === "REVIEW") return "Review";
  if (current && slot.state === "BUILDING") return "Preparing";
  if (slot.requiresReconciliation) return "Reconciliation required";
  if (slot.state === "FAILED") return slot.canRetry ? "Correction available" : "Source needed";
  if (slot.state === "WAITING") return "Waiting";
  return current ? "Next" : "Later";
}

function stageLabel(workspace: GarmentSetWorkspace) {
  if (workspace.stage === "LULU") return "Lulu";
  if (workspace.stage === "COMPLETE") return "Ready";
  return "Product";
}

function commandBody(input: {
  command: GarmentSetCommand["command"];
  correction?: string;
  revision: string;
  wardrobeItemId: string;
}): GarmentSetCommand {
  const common = {
    expectedRevision: input.revision,
    idempotencyKey: `genesis:${input.wardrobeItemId}:${input.revision}:${input.command}`,
  };
  if (input.command === "ADVANCE_CURRENT") return { ...common, command: input.command, costConfirmed: true };
  if (input.command === "FIX_CURRENT") return { ...common, command: input.command, correction: input.correction ?? "" };
  return { ...common, command: input.command };
}

export function GarmentSetBuilder({
  onDismiss,
  open,
  returnFocus,
  wardrobeItemId,
}: {
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
  wardrobeItemId: string;
}) {
  const [workspace, setWorkspace] = useState<GarmentSetWorkspace | null>(null);
  const [pendingCommand, setPendingCommand] = useState<GarmentSetCommand["command"] | null>(null);
  const [error, setError] = useState<GenesisError | null>(null);
  const [lastReceipt, setLastReceipt] = useState<GenesisReceipt | null>(null);
  const [fixing, setFixing] = useState(false);
  const [correction, setCorrection] = useState("");
  const correctionRef = useRef<HTMLTextAreaElement>(null);
  const feedbackRef = useRef<HTMLDivElement>(null);
  const receiptRef = useRef<HTMLElement>(null);
  const requestEpochRef = useRef(0);
  const activeWardrobeItemRef = useRef(wardrobeItemId);
  if (activeWardrobeItemRef.current !== wardrobeItemId) {
    activeWardrobeItemRef.current = wardrobeItemId;
    requestEpochRef.current += 1;
  }
  const working = pendingCommand !== null;

  const load = useCallback(async (
    preserveError = false,
    requestEpoch = requestEpochRef.current,
  ) => {
    if (!preserveError && requestEpoch === requestEpochRef.current) setError(null);
    try {
      const result = await request<{ workspace: GarmentSetWorkspace }>(
        `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/set`,
      );
      if (requestEpoch !== requestEpochRef.current) return null;
      setWorkspace(result.workspace);
      return result.workspace;
    } catch (loadError) {
      if (requestEpoch !== requestEpochRef.current) return null;
      setError({
        title: "Genesis unavailable",
        detail: loadError instanceof Error ? loadError.message : "Genesis could not be opened.",
      });
      return null;
    }
  }, [wardrobeItemId]);

  useEffect(() => {
    const requestEpoch = requestEpochRef.current + 1;
    requestEpochRef.current = requestEpoch;
    if (!open) return;
    setWorkspace(null);
    setError(null);
    setLastReceipt(null);
    setPendingCommand(null);
    setFixing(false);
    setCorrection("");
    void load(false, requestEpoch);
  }, [load, open]);

  useEffect(() => {
    if (!open || workspace?.nextAction !== "WAIT") return;
    let cancelled = false;
    let timer = 0;
    const requestEpoch = requestEpochRef.current;
    const poll = async () => {
      const result = await load(true, requestEpoch);
      if (result && requestEpoch === requestEpochRef.current) setError(null);
      if (!cancelled && (!result || result.nextAction === "WAIT")) {
        timer = window.setTimeout(() => void poll(), 2_500);
      }
    };
    timer = window.setTimeout(() => void poll(), 2_500);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [load, open, workspace?.nextAction]);

  useEffect(() => {
    if (!fixing) return;
    window.requestAnimationFrame(() => correctionRef.current?.focus({ preventScroll: true }));
  }, [fixing]);

  const current = workspace?.slots.find((slot) => slot.key === workspace.currentSlotKey) ?? null;
  const mediaItems = useMemo<StudioMediaItem[]>(() =>
    workspace?.slots.flatMap((slot) => slot.assetUrl ? [{
      alt: `${workspace.title} · ${slot.label}`,
      label: `${slot.view} · ${slot.label}`,
      src: slot.assetUrl,
    }] : []) ?? [], [workspace]);
  const currentMediaIndex = current?.assetUrl
    ? mediaItems.findIndex((item) => item.src === current.assetUrl)
    : -1;

  const runCommand = useCallback(async (
    command: GarmentSetCommand["command"],
    extra: { correction?: string } = {},
  ) => {
    if (!workspace || !current) return;
    const commandSlot = current;
    const commandRevision = workspace.revision;
    const requestEpoch = requestEpochRef.current;
    setPendingCommand(command);
    setError(null);
    setLastReceipt(null);
    try {
      const body = commandBody({
        command,
        correction: extra.correction,
        revision: workspace.revision,
        wardrobeItemId,
      });
      const result = await request<{ workspace: GarmentSetWorkspace }>(
        `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/set`,
        { method: "POST", body: JSON.stringify(body) },
      );
      if (requestEpoch !== requestEpochRef.current) return;
      setWorkspace(result.workspace);
      const receipt = result.workspace.receipt ? null : commandReceipt({
        command,
        correction: extra.correction,
        nextActionLabel: result.workspace.nextActionLabel,
        slot: commandSlot,
      });
      setLastReceipt(receipt);
      setFixing(false);
      setCorrection("");
      window.requestAnimationFrame(() => {
        (result.workspace.receipt ? receiptRef.current : feedbackRef.current)?.focus({ preventScroll: true });
      });
    } catch (commandError) {
      if (requestEpoch !== requestEpochRef.current) return;
      const refreshed = await load(true, requestEpoch);
      if (requestEpoch !== requestEpochRef.current) return;
      if (!refreshed) {
        setError({
          title: "Could not confirm",
          detail: "Studio may have received the action. Reopen Genesis to check the saved state.",
        });
      } else if (refreshed.revision !== commandRevision) {
        const receipt = refreshed.receipt ? null : commandReceipt({
          command,
          correction: extra.correction,
          nextActionLabel: refreshed.nextActionLabel,
          slot: commandSlot,
        });
        setError(null);
        setLastReceipt(receipt);
        setFixing(false);
        setCorrection("");
      } else {
        setError({
          title: "Nothing changed",
          detail: commandError instanceof Error ? commandError.message : "That action was not saved.",
        });
      }
      window.requestAnimationFrame(() => {
        (refreshed?.receipt ? receiptRef.current : feedbackRef.current)?.focus({ preventScroll: true });
      });
    } finally {
      if (requestEpoch === requestEpochRef.current) setPendingCommand(null);
    }
  }, [current, load, wardrobeItemId, workspace]);

  const pendingText = pendingCommand && current ? pendingLabel(pendingCommand, current) : null;
  const failedWithoutFeedback = !pendingText && !error && !lastReceipt && current?.state === "FAILED";

  const footer = workspace?.nextAction === "ADVANCE" ? (
    <button className="button button-primary studio-set-build" disabled={working} onClick={() => void runCommand("ADVANCE_CURRENT")} type="button">
      {pendingCommand === "ADVANCE_CURRENT" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
      {pendingCommand === "ADVANCE_CURRENT" ? pendingText : workspace.nextActionLabel}
      {Number(workspace.maxAdditionalCostUsd) > 0 ? <small>up to ${workspace.maxAdditionalCostUsd}</small> : null}
    </button>
  ) : workspace?.nextAction === "REVIEW" && fixing ? (
    <div className="studio-set-fix-actions">
      <button className="button button-secondary" disabled={working} onClick={() => setFixing(false)} type="button">Cancel</button>
      <button className="button button-primary" disabled={working || !correction.trim()} onClick={() => void runCommand("FIX_CURRENT", { correction })} type="button">
        {pendingCommand === "FIX_CURRENT" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={18} /> : null}
        {pendingCommand === "FIX_CURRENT" ? "Applying correction…" : "Make correction"}
      </button>
    </div>
  ) : workspace?.nextAction === "REVIEW" ? (
    <div className="studio-set-review-actions">
      <button className="button button-secondary" disabled={working} onClick={() => void runCommand("REJECT_CURRENT")} type="button">
        {pendingCommand === "REJECT_CURRENT" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={18} /> : null}
        {pendingCommand === "REJECT_CURRENT" ? "Rejecting…" : "Reject"}
      </button>
      <button className="button button-secondary" disabled={working} onClick={() => setFixing(true)} type="button">Fix one thing</button>
      <button className="button button-primary" disabled={working} onClick={() => void runCommand("KEEP_CURRENT")} type="button">
        {pendingCommand === "KEEP_CURRENT" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={18} /> : null}
        {pendingCommand === "KEEP_CURRENT" ? "Keeping…" : current?.inferred ? "It matches" : "Keep"}
      </button>
    </div>
  ) : workspace?.nextAction === "DONE" ? (
    <button className="button button-primary" onClick={onDismiss} type="button">Done</button>
  ) : workspace?.nextAction === "BLOCKED" ? (
    current?.requiresReconciliation ? (
      <button aria-disabled="true" className="button button-primary" disabled type="button">
        Reconciliation required
      </button>
    ) : (
      <a
        className="button button-primary"
        href={current?.key === "LULU_TRY_ON"
          ? "/studio/models"
          : `/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}`}
      >
        {workspace.nextActionLabel}
      </a>
    )
  ) : undefined;

  return (
    <StudioTaskSheet
      busy={working}
      busyLabel={pendingText ?? "Saving this Genesis action"}
      className="studio-set-sheet studio-genesis-sheet"
      eyebrow="Genesis"
      footer={footer}
      onDismiss={() => {
        if (working) return false;
        onDismiss();
      }}
      open={open}
      progress={workspace ? workspace.progress.percent : undefined}
      progressLabel="Genesis progress"
      returnFocus={returnFocus}
      title={workspace?.title ?? "Garment Genesis"}
    >
      <div className="studio-set-status">
        {pendingText ? (
          <div aria-live="polite" className="studio-set-feedback is-pending" ref={feedbackRef} role="status" tabIndex={-1}>
            <LoaderCircle aria-hidden="true" className="studio-spin" size={18} />
            <span><strong>{pendingText}</strong><small>Your accepted work stays in place.</small></span>
          </div>
        ) : error ? (
          <div aria-live="assertive" className="studio-set-feedback is-error" ref={feedbackRef} role="alert" tabIndex={-1}>
            <AlertCircle aria-hidden="true" size={18} />
            <span><strong>{error.title}</strong><small>{error.detail}</small></span>
          </div>
        ) : lastReceipt ? (
          <div aria-live="polite" className="studio-set-feedback is-success" ref={feedbackRef} role="status" tabIndex={-1}>
            <Check aria-hidden="true" size={18} />
            <span><strong>{lastReceipt.title}</strong><small>{lastReceipt.detail}</small></span>
          </div>
        ) : failedWithoutFeedback ? (
          <div className="studio-set-feedback is-error" ref={feedbackRef} role="status" tabIndex={-1}>
            <AlertCircle aria-hidden="true" size={18} />
            <span><strong>{current.requiresReconciliation ? "Provider result uncertain" : "View not made"}</strong><small>{current.canRetry ? "The last attempt stayed out of the set. Try this view again." : workspace?.missingEvidence ?? "Add the required evidence to continue."}</small></span>
          </div>
        ) : !workspace ? (
          <div aria-live="polite" className="studio-set-feedback is-pending" role="status">
            <LoaderCircle aria-hidden="true" className="studio-spin" size={18} />
            <span><strong>Opening saved work</strong><small>Restoring the current view.</small></span>
          </div>
        ) : null}
      </div>

      {workspace ? (
        <div aria-busy={working || workspace.nextAction === "WAIT"} className="studio-genesis-workspace">
          <header className="studio-genesis-orient">
            <p>{stageLabel(workspace)} · {workspace.progress.kept} of {workspace.progress.total}</p>
            <h3>{workspace.nextActionLabel}</h3>
            {workspace.nextAction === "WAIT" ? <span>This view stays saved with the piece.</span> : null}
            {workspace.missingEvidence ? <span>{workspace.missingEvidence}</span> : null}
          </header>

          {workspace.receipt ? (
            <section aria-live="polite" className="studio-genesis-receipt" ref={receiptRef} role="status" tabIndex={-1}>
              <div className="studio-genesis-receipt-motion">
                <WardrobeMotion artwork="logo" polarity="auto" size="sm" variant="success" />
              </div>
              <div>
                <h3>{workspace.receipt.title}</h3>
                <p>{workspace.receipt.detail}</p>
                <span>Private</span>
              </div>
            </section>
          ) : current ? (
            <section className={`studio-genesis-current is-${current.state.toLowerCase()}`}>
              {current.assetUrl && currentMediaIndex >= 0 ? (
                <StudioMediaButton
                  className="studio-genesis-media"
                  index={currentMediaIndex}
                  items={mediaItems}
                  label={`Open ${current.label}`}
                >
                  <img alt="" src={current.assetUrl} />
                </StudioMediaButton>
              ) : (
                <div aria-hidden="true" className="studio-genesis-placeholder">
                  {current.state === "BUILDING"
                    ? <LoaderCircle className="studio-spin" size={28} />
                    : <Sparkles size={28} />}
                </div>
              )}
              <div className="studio-genesis-current-copy">
                <span>{current.view}</span>
                <h4>{current.label}</h4>
                <p>{slotStatus(current, true)}</p>
                {current.inferred ? <small>Presentation only · compare with the real garment</small> : null}
              </div>
            </section>
          ) : null}

          {fixing ? (
            <label className="studio-genesis-correction">
              <span>Fix one thing</span>
              <textarea
                maxLength={500}
                onChange={(event) => setCorrection(event.target.value)}
                placeholder="Only the exact change"
                ref={correctionRef}
                rows={3}
                value={correction}
              />
            </label>
          ) : null}

          <details className="studio-genesis-sequence">
            <summary><span>View sequence</span><ChevronDown aria-hidden="true" size={17} /></summary>
            <ol>
              {workspace.slots.map((slot) => (
                <li aria-current={slot.key === workspace.currentSlotKey ? "step" : undefined} key={slot.key}>
                  <span>{slot.view}</span>
                  <strong>{slot.label}</strong>
                  <small>{slotStatus(slot, slot.key === workspace.currentSlotKey)}</small>
                </li>
              ))}
            </ol>
          </details>
        </div>
      ) : null}
    </StudioTaskSheet>
  );
}
