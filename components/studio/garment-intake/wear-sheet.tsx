"use client";

/* Same-origin operator-protected private asset responses. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Clock3, ImagePlus, LoaderCircle, Maximize2, Plus, Shirt, Sparkles, UserRound, X } from "lucide-react";
import { WardrobeMotion } from "../../brand/wardrobe-motion";
import { StudioDecisionSheet } from "../atoms/studio-decision-sheet";
import { StudioDisclosureRow } from "../atoms/studio-disclosure-row";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import {
  studioDecisionNoteSha256,
  studioDecisionReceiptMatches,
  StudioEngineError,
} from "./engine-client";
import { addWearModel, decideWear, generateWear, readWear, type WearGeneration, type WearModel, type WearOperation, type WearWorkspace } from "./wear-client";

type Step = "choose" | "add-model" | "working" | "review" | "edit" | "failed" | "reconcile" | "saved";
type PendingCommand = "ADD_MODEL" | "DECIDE_EDIT" | "DECIDE_KEEP" | "DECIDE_REJECT" | "GENERATE" | "RETRY";
type WearCorrectionAuthority = { generationId: string; decisionReceiptId: string };
type WearDismissDecision = "DISCARD_DRAFT" | "LEAVE_ACTIVE";

const WEAR_POLL_BASE_MS = 1_600;
const WEAR_POLL_MAX_BACKOFF_MS = 8_000;
const WEAR_CONNECTION_MESSAGE = "Connection interrupted. Studio is still checking this existing Wear task; no new generation was started.";
const validWearRequestId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function wearRequestStorageKey(wardrobeItemId: string) {
  return `juw.studio.wear.request.${wardrobeItemId}.v1`;
}

export function createWearRequestId() {
  return globalThis.crypto.randomUUID();
}

function readWearRequestId(wardrobeItemId: string) {
  if (typeof window === "undefined") return undefined;
  try {
    const value = window.sessionStorage.getItem(wearRequestStorageKey(wardrobeItemId));
    return value && validWearRequestId.test(value) ? value : undefined;
  } catch {
    return undefined;
  }
}

function writeWearRequestId(wardrobeItemId: string, requestId: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(wearRequestStorageKey(wardrobeItemId), requestId);
  } catch {
    // The in-memory recovery state remains authoritative for this mount.
  }
}

function clearWearRequestId(wardrobeItemId: string, expectedRequestId?: string) {
  if (typeof window === "undefined") return;
  try {
    const key = wearRequestStorageKey(wardrobeItemId);
    const current = window.sessionStorage.getItem(key);
    if (!expectedRequestId || current === expectedRequestId) window.sessionStorage.removeItem(key);
  } catch {
    // Session storage is a reload aid, not a runtime dependency.
  }
}

export function wearPollDelay(failureCount: number) {
  const exponent = Math.min(8, Math.max(0, Math.floor(failureCount) - 1));
  return Math.min(WEAR_POLL_BASE_MS * (2 ** exponent), WEAR_POLL_MAX_BACKOFF_MS);
}

export async function runWearSingleFlight<T>(
  guard: { current: boolean },
  command: () => Promise<T>,
): Promise<T | undefined> {
  if (guard.current) return undefined;
  guard.current = true;
  try {
    return await command();
  } finally {
    guard.current = false;
  }
}

export function resolveWearCommandGeneration(
  generations: WearGeneration[],
  response: { generationId: string; requestId: string; reused: boolean },
) {
  const generation = generations.find((item) => item.id === response.generationId);
  if (!generation) return undefined;
  if (generation.requestId === response.requestId) {
    return { adoptsExistingRequest: false, generation };
  }
  if (
    !response.reused
    || !["PENDING", "RUNNING", "COMPLETE", "APPROVED"].includes(generation.state)
  ) return undefined;
  return { adoptsExistingRequest: true, generation };
}

function wearGenerationError(generation: Pick<WearGeneration, "retryAvailable">) {
  return new StudioEngineError(
    502,
    "GENERATION_FAILED",
    "That view was not created.",
    generation.retryAvailable ? "Try once more." : "Choose another view.",
  );
}

export function WearSheet({ onDismiss, open, returnFocus, wardrobeItemId }: {
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
  wardrobeItemId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const closePreviewRef = useRef<HTMLButtonElement>(null);
  const expandPreviewRef = useRef<HTMLButtonElement>(null);
  const commandInFlightRef = useRef(false);
  const confirmedDismissRef = useRef<WearDismissDecision | undefined>(undefined);
  const recoveryFallbackRef = useRef<Extract<Step, "choose" | "edit">>("choose");
  const [workspace, setWorkspace] = useState<WearWorkspace>();
  const [step, setStep] = useState<Step>("choose");
  const [operation, setOperation] = useState<WearOperation>();
  const [selectedModel, setSelectedModel] = useState<WearModel>();
  const [selected, setSelected] = useState<WearGeneration>();
  const [pendingRequestId, setPendingRequestId] = useState<string>();
  const [file, setFile] = useState<File>();
  const [name, setName] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<StudioEngineError>();
  const [connectionMessage, setConnectionMessage] = useState<string>();
  const [pendingCommand, setPendingCommand] = useState<PendingCommand>();
  const [hydrated, setHydrated] = useState(false);
  const [hydrationAttempt, setHydrationAttempt] = useState(0);
  const [hydrationError, setHydrationError] = useState<StudioEngineError>();
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [dismissDecision, setDismissDecision] = useState<WearDismissDecision>();
  const [dismissReturnFocus, setDismissReturnFocus] = useState<HTMLElement | null>(null);
  const commandBusy = pendingCommand !== undefined;
  const modelPreview = useMemo(() => file ? URL.createObjectURL(file) : undefined, [file]);
  const latestTryOnByModel = useMemo(() => {
    const latest = new Map<string, WearGeneration>();
    workspace?.generations.forEach((generation) => {
      if (generation.operation === "MODEL_TRY_ON" && generation.state === "APPROVED" && generation.modelProfileId) {
        latest.set(generation.modelProfileId, generation);
      }
    });
    return [...latest.values()];
  }, [workspace]);
  const pastAttempts = useMemo(() => [...(workspace?.generations ?? [])]
    .filter((generation) => generation.state === "REJECTED" || generation.state === "FAILED")
    .reverse(), [workspace]);

  const rememberWearRequest = useCallback((requestId: string, fallback: Extract<Step, "choose" | "edit">) => {
    recoveryFallbackRef.current = fallback;
    setPendingRequestId(requestId);
    writeWearRequestId(wardrobeItemId, requestId);
  }, [wardrobeItemId]);

  const clearRememberedWearRequest = useCallback((requestId?: string) => {
    setPendingRequestId((current) => current === requestId || !requestId ? undefined : current);
    clearWearRequestId(wardrobeItemId, requestId);
  }, [wardrobeItemId]);

  const applyTrackedGeneration = useCallback((generation: WearGeneration, options: { reusedApproval?: boolean } = {}) => {
    setSelected(generation);
    setOperation(generation.operation);
    if (generation.requiresReconciliation || generation.state === "INDETERMINATE") {
      setPendingRequestId(undefined);
      setError(undefined);
      setStep("reconcile");
      return;
    }
    if (["PENDING", "RUNNING"].includes(generation.state)) {
      setPendingRequestId(generation.requestId);
      writeWearRequestId(wardrobeItemId, generation.requestId);
      setError(undefined);
      setStep("working");
      return;
    }
    clearRememberedWearRequest(generation.requestId);
    if (generation.state === "COMPLETE") {
      setError(undefined);
      setStep("review");
    } else if (generation.state === "APPROVED" && options.reusedApproval) {
      setError(undefined);
      setStep("saved");
    } else if (generation.state === "FAILED") {
      setError(wearGenerationError(generation));
      setStep("failed");
    } else {
      setStep("choose");
    }
  }, [clearRememberedWearRequest, wardrobeItemId]);

  useEffect(() => () => { if (modelPreview) URL.revokeObjectURL(modelPreview); }, [modelPreview]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const rememberedRequestId = readWearRequestId(wardrobeItemId);
    setHydrated(false);
    setWorkspace(undefined);
    setSelected(undefined);
    setPendingRequestId(rememberedRequestId);
    setStep("choose");
    setError(undefined);
    setConnectionMessage(undefined);
    setHydrationError(undefined);
    setFile(undefined);
    setName("");
    setLicenseUrl("");
    setAuthorityConfirmed(false);
    setNote("");
    setHistoryOpen(false);
    void readWear(wardrobeItemId).then(({ workspace: value }) => {
      if (cancelled || commandInFlightRef.current) return;
      setWorkspace(value);
      const remembered = rememberedRequestId
        ? value.generations.find((generation) => generation.requestId === rememberedRequestId)
        : undefined;
      const latest = value.generations.at(-1);
      if (remembered) applyTrackedGeneration(remembered, { reusedApproval: true });
      else {
        if (rememberedRequestId) clearRememberedWearRequest(rememberedRequestId);
        if (latest?.state === "INDETERMINATE") applyTrackedGeneration(latest);
        else if (latest?.state === "COMPLETE") applyTrackedGeneration(latest);
        else if (latest && ["PENDING", "RUNNING"].includes(latest.state)) applyTrackedGeneration(latest);
        else if (latest?.state === "FAILED") applyTrackedGeneration(latest);
        else setStep("choose");
      }
      setHydrated(true);
    }).catch((caught) => {
      if (!cancelled && !commandInFlightRef.current) {
        const nextError = caught instanceof StudioEngineError
          ? caught
          : new StudioEngineError(0, "NETWORK_UNAVAILABLE", "Studio could not restore Wear.", "Try the connection again.");
        setError(nextError);
        setHydrationError(nextError);
      }
    });
    return () => { cancelled = true; };
  }, [applyTrackedGeneration, clearRememberedWearRequest, hydrationAttempt, open, wardrobeItemId]);

  useEffect(() => {
    const selectedGenerationId = selected?.id;
    const trackedRequestId = pendingRequestId ?? selected?.requestId;
    if (!open || step !== "working" || commandBusy || (!selectedGenerationId && !trackedRequestId)) return;
    let cancelled = false;
    let consecutiveFailures = 0;
    let timeout: number | undefined;

    const schedulePoll = (delay: number) => {
      if (cancelled) return;
      timeout = window.setTimeout(() => void poll(), delay);
    };

    const poll = async () => {
      try {
        const { workspace: value } = await readWear(wardrobeItemId);
        if (cancelled) return;
        consecutiveFailures = 0;
        setConnectionMessage(undefined);
        setWorkspace(value);
        const tracked = value.generations.find((generation) => (
          trackedRequestId ? generation.requestId === trackedRequestId : generation.id === selectedGenerationId
        ));
        if (tracked) {
          applyTrackedGeneration(tracked, { reusedApproval: true });
          if (["PENDING", "RUNNING"].includes(tracked.state)) schedulePoll(WEAR_POLL_BASE_MS);
        } else {
          const scopedReconciliation = [...value.generations].reverse().find((generation) => (
            generation.state === "INDETERMINATE"
            && generation.operation === operation
            && generation.modelProfileId === (selectedModel?.id ?? null)
          ));
          if (scopedReconciliation) {
            applyTrackedGeneration(scopedReconciliation);
          } else {
            clearRememberedWearRequest(trackedRequestId);
            setError(new StudioEngineError(409, "GENERATION_NOT_FOUND", "That Wear command did not start.", "Choose the view again when ready."));
            setStep(recoveryFallbackRef.current);
          }
        }
      } catch {
        if (cancelled) return;
        consecutiveFailures += 1;
        setConnectionMessage(WEAR_CONNECTION_MESSAGE);
        schedulePoll(wearPollDelay(consecutiveFailures));
      }
    };

    schedulePoll(WEAR_POLL_BASE_MS);
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [applyTrackedGeneration, clearRememberedWearRequest, commandBusy, open, operation, pendingRequestId, selected?.id, selected?.requestId, selectedModel?.id, step, wardrobeItemId]);

  useEffect(() => {
    if (!expanded) return;
    requestAnimationFrame(() => closePreviewRef.current?.focus({ preventScroll: true }));
    function containExpandedPreviewFocus(event: KeyboardEvent) {
      if (event.key === "Tab") {
        event.preventDefault();
        closePreviewRef.current?.focus({ preventScroll: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeExpandedPreview();
      }
    }
    window.addEventListener("keydown", containExpandedPreviewFocus, { capture: true });
    return () => window.removeEventListener("keydown", containExpandedPreviewFocus, { capture: true });
  }, [expanded]);

  function closeExpandedPreview() {
    setExpanded(false);
    requestAnimationFrame(() => expandPreviewRef.current?.focus({ preventScroll: true }));
  }

  async function withCommandLock(command: PendingCommand, action: () => Promise<void>) {
    await runWearSingleFlight(commandInFlightRef, async () => {
      setPendingCommand(command);
      setError(undefined);
      setConnectionMessage(undefined);
      try {
        await action();
      } finally {
        setPendingCommand(undefined);
      }
    });
  }

  async function run(nextOperation: WearOperation, model?: WearModel, parent?: WearGeneration, correction?: string) {
    await withCommandLock("GENERATE", () => runUnlocked(nextOperation, model, parent, correction));
  }

  async function runUnlocked(
    nextOperation: WearOperation,
    model?: WearModel,
    parent?: WearGeneration,
    correction?: string,
    correctionAuthority?: WearCorrectionAuthority,
  ) {
    const requestId = createWearRequestId();
    rememberWearRequest(requestId, correction ? "edit" : "choose");
    setOperation(nextOperation);
    setSelectedModel(model);
    setSelected(undefined);
    setStep("working");
    try {
      const result = await generateWear(wardrobeItemId, {
        requestId,
        operation: nextOperation,
        modelProfileId: model?.id,
        parentGenerationId: parent?.id,
        correction,
        correctionGenerationId: correctionAuthority?.generationId,
        decisionReceiptId: correctionAuthority?.decisionReceiptId,
      });
      setWorkspace(result.workspace);
      const resolved = resolveWearCommandGeneration(result.workspace.generations, {
        generationId: result.generationId,
        requestId,
        reused: result.reused,
      });
      if (!resolved) throw new StudioEngineError(500, "ENGINE_ERROR", "The Wear view was not saved.", "Try once more.");
      if (resolved.adoptsExistingRequest) clearRememberedWearRequest(requestId);
      applyTrackedGeneration(resolved.generation, { reusedApproval: result.reused });
    } catch (caught) {
      const commandError = caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not make that view.");
      setError(commandError);
      const refreshed = await readWear(wardrobeItemId).catch(() => null);
      const desiredModelId = model?.id ?? parent?.modelProfileId ?? null;
      const exact = refreshed?.workspace.generations.find((item) => item.requestId === requestId);
      const scopedReconciliation = [...(refreshed?.workspace.generations ?? [])].reverse().find((item) => (
          item.state === "INDETERMINATE"
          && item.operation === nextOperation
          && item.modelProfileId === desiredModelId
        ));
      if (refreshed) setWorkspace(refreshed.workspace);
      if (exact) {
        setConnectionMessage(WEAR_CONNECTION_MESSAGE);
        applyTrackedGeneration(exact, { reusedApproval: true });
      } else if (scopedReconciliation) {
        applyTrackedGeneration(scopedReconciliation);
      } else if (!refreshed && (commandError.status === 0 || commandError.status === 409 || commandError.status >= 500)) {
        setConnectionMessage(WEAR_CONNECTION_MESSAGE);
        setStep("working");
      } else {
        clearRememberedWearRequest(requestId);
        setStep(correction ? "edit" : "choose");
      }
    }
  }

  async function decide(decision: "KEEP" | "REJECT") {
    if (!selected) return;
    const pendingDecision = decision === "KEEP" ? "DECIDE_KEEP" : "DECIDE_REJECT";
    await withCommandLock(pendingDecision, async () => {
      const expectedNoteSha256 = await studioDecisionNoteSha256();
      try {
        const result = await decideWear(wardrobeItemId, selected.id, decision);
        const decided = result.workspace.generations.find((generation) => generation.id === selected.id);
        if (!studioDecisionReceiptMatches({
          receipt: decided?.decisionReceipt,
          generationId: selected.id,
          decision,
          noteSha256: expectedNoteSha256,
        })) {
          throw new StudioEngineError(409, "DECISION_CONFLICT", "Another decision changed this view.", "Reload the current Wear state.");
        }
        setWorkspace(result.workspace);
        if (decision === "KEEP") setStep("saved");
        else setStep("choose");
      } catch (caught) {
        const decisionError = caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not save that decision.");
        const refreshed = await readWear(wardrobeItemId).catch(() => null);
        const reconciled = refreshed?.workspace.generations.find((generation) => generation.id === selected.id);
        if (refreshed) setWorkspace(refreshed.workspace);
        const matchesDecision = studioDecisionReceiptMatches({
          receipt: reconciled?.decisionReceipt,
          generationId: selected.id,
          decision,
          noteSha256: expectedNoteSha256,
        });
        if (decision === "KEEP" && reconciled?.state === "APPROVED" && matchesDecision) {
          setError(undefined);
          setStep("saved");
        } else if (decision === "REJECT" && reconciled?.state === "REJECTED" && matchesDecision) {
          setError(undefined);
          setStep("choose");
        } else {
          setError(decisionError);
        }
      }
    });
  }

  async function applyCorrection() {
    if (!selected || !note.trim()) return;
    const correction = note.trim();
    await withCommandLock("DECIDE_EDIT", async () => {
      const expectedNoteSha256 = await studioDecisionNoteSha256(correction);
      let currentWorkspace = workspace;
      let correctionReceipt: WearGeneration["decisionReceipt"] = null;
      try {
        const result = await decideWear(wardrobeItemId, selected.id, "EDIT", correction);
        const decided = result.workspace.generations.find((generation) => generation.id === selected.id);
        if (!studioDecisionReceiptMatches({
          receipt: decided?.decisionReceipt,
          generationId: selected.id,
          decision: "EDIT",
          noteSha256: expectedNoteSha256,
        })) {
          throw new StudioEngineError(409, "DECISION_CONFLICT", "Another decision changed this view.", "Review the current Wear state before spending again.");
        }
        correctionReceipt = decided?.decisionReceipt ?? null;
        currentWorkspace = result.workspace;
        setWorkspace(result.workspace);
      } catch (caught) {
        const decisionError = caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not save that correction.");
        const refreshed = await readWear(wardrobeItemId).catch(() => null);
        const reconciled = refreshed?.workspace.generations.find((generation) => generation.id === selected.id);
        if (refreshed) {
          currentWorkspace = refreshed.workspace;
          setWorkspace(refreshed.workspace);
        }
        if (!studioDecisionReceiptMatches({
          receipt: reconciled?.decisionReceipt,
          generationId: selected.id,
          decision: "EDIT",
          noteSha256: expectedNoteSha256,
        })) {
          setError(decisionError);
          setStep("edit");
          return;
        }
        correctionReceipt = reconciled?.decisionReceipt ?? null;
      }
      const model = currentWorkspace?.models.find((item) => item.id === selected.modelProfileId) ?? selectedModel;
      const parent = selected.operation === "EDITORIAL_MODEL"
        ? currentWorkspace?.generations.find((generation) => generation.id === selected.parentGenerationId)
        : undefined;
      await runUnlocked(selected.operation, model, parent, correction, {
        generationId: selected.id,
        decisionReceiptId: correctionReceipt!.receiptId,
      });
    });
  }

  async function addModel() {
    if (!file || !name.trim() || !licenseUrl.trim() || !authorityConfirmed) return;
    await withCommandLock("ADD_MODEL", async () => {
      setStep("working");
      try {
        const result = await addWearModel(wardrobeItemId, { file, name: name.trim(), licenseUrl: licenseUrl.trim() });
        setWorkspace(result.workspace);
        await runUnlocked("MODEL_TRY_ON", result.model);
      } catch (caught) {
        setError(caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not add that model."));
        setStep("add-model");
      }
    });
  }

  async function retry() {
    if (!selected?.retryAvailable) return;
    await withCommandLock("RETRY", async () => {
      const expectedNoteSha256 = await studioDecisionNoteSha256();
      try {
        const result = await decideWear(wardrobeItemId, selected.id, "RETRY");
        setWorkspace(result.workspace);
        const decided = result.workspace.generations.find((generation) => generation.id === selected.id);
        if (!studioDecisionReceiptMatches({
          receipt: decided?.decisionReceipt,
          generationId: selected.id,
          decision: "RETRY",
          noteSha256: expectedNoteSha256,
        })) {
          throw new StudioEngineError(409, "DECISION_CONFLICT", "Another decision changed this view.", "Review the current Wear state before spending again.");
        }
        const model = result.workspace.models.find((item) => item.id === selected.modelProfileId);
        const parent = selected.operation === "EDITORIAL_MODEL"
          ? result.workspace.generations.find((item) => item.id === selected.parentGenerationId && item.operation === "MODEL_TRY_ON" && item.state === "APPROVED")
          : undefined;
        await runUnlocked(selected.operation, model, parent, undefined, {
          generationId: selected.id,
          decisionReceiptId: decided!.decisionReceipt!.receiptId,
        });
      } catch (caught) {
        const retryError = caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not retry that view.");
        const refreshed = await readWear(wardrobeItemId).catch(() => null);
        const reconciled = refreshed?.workspace.generations.find((generation) => generation.id === selected.id);
        if (refreshed) setWorkspace(refreshed.workspace);
        if (studioDecisionReceiptMatches({
          receipt: reconciled?.decisionReceipt,
          generationId: selected.id,
          decision: "RETRY",
          noteSha256: expectedNoteSha256,
        })) {
          const model = refreshed?.workspace.models.find((item) => item.id === selected.modelProfileId);
          const parent = selected.operation === "EDITORIAL_MODEL"
            ? refreshed?.workspace.generations.find((item) => item.id === selected.parentGenerationId && item.operation === "MODEL_TRY_ON" && item.state === "APPROVED")
            : undefined;
          await runUnlocked(selected.operation, model, parent, undefined, {
            generationId: selected.id,
            decisionReceiptId: reconciled!.decisionReceipt!.receiptId,
          });
        } else {
          setError(retryError);
          setStep("failed");
        }
      }
    });
  }

  function finishDismiss() {
    setExpanded(false);
    setDismissDecision(undefined);
    confirmedDismissRef.current = undefined;
    setDismissReturnFocus(null);
    onDismiss();
    return true;
  }

  function cancelCorrectionDraft() {
    setNote("");
    setError(undefined);
    setStep("review");
  }

  function cancelModelDraft() {
    setFile(undefined);
    setName("");
    setLicenseUrl("");
    setAuthorityConfirmed(false);
    setError(undefined);
    setStep("choose");
  }

  function chooseAnotherView() {
    clearRememberedWearRequest(selected?.requestId ?? pendingRequestId);
    setSelected(undefined);
    setOperation(undefined);
    setError(undefined);
    setConnectionMessage(undefined);
    setStep("choose");
  }

  function requestDismiss() {
    if (expanded) {
      closeExpandedPreview();
      return false;
    }

    if (step === "reconcile") return finishDismiss();

    if (step === "working") {
      requestDismissDecision("LEAVE_ACTIVE");
      return false;
    }

    const hasModelDraft = step === "add-model"
      && Boolean(file || name.trim() || licenseUrl.trim() || authorityConfirmed);
    const hasCorrectionDraft = step === "edit" && Boolean(note.trim());
    if (
      (hasModelDraft || hasCorrectionDraft)
    ) {
      requestDismissDecision("DISCARD_DRAFT");
      return false;
    }

    return finishDismiss();
  }

  function requestDismissDecision(decision: WearDismissDecision) {
    if (dismissDecision) return;
    const activeElement = document.activeElement;
    setDismissReturnFocus(activeElement instanceof HTMLElement ? activeElement : null);
    setDismissDecision(decision);
  }

  async function confirmDismissDecision() {
    if (!dismissDecision) {
      return { error: "The Wear close decision is no longer current.", ok: false as const };
    }
    confirmedDismissRef.current = dismissDecision;
    return { ok: true as const };
  }

  function closeDismissDecision() {
    const confirmed = confirmedDismissRef.current;
    confirmedDismissRef.current = undefined;
    setDismissDecision(undefined);
    if (confirmed) finishDismiss();
  }

  const footer = !hydrated ? hydrationError ? (
    <button className="button button-primary" onClick={() => setHydrationAttempt((attempt) => attempt + 1)} type="button">Try connection</button>
  ) : undefined : step === "review" ? (
    <>
      <button className="button button-secondary" disabled={commandBusy} onClick={() => { setError(undefined); setNote(""); setStep("edit"); }} type="button">Fix one thing</button>
      <button aria-busy={pendingCommand === "DECIDE_KEEP" || undefined} className="button button-primary" disabled={commandBusy} onClick={() => void decide("KEEP")} type="button"><Check aria-hidden="true" size={17} />{pendingCommand === "DECIDE_KEEP" ? "Saving…" : "Keep"}</button>
    </>
  ) : step === "edit" ? (
    <>
      <button className="button button-secondary" disabled={commandBusy} onClick={cancelCorrectionDraft} type="button">Cancel</button>
      <button aria-busy={pendingCommand === "DECIDE_EDIT" || undefined} className="button button-primary" disabled={commandBusy || !note.trim()} onClick={() => void applyCorrection()} type="button">{pendingCommand === "DECIDE_EDIT" ? "Applying…" : "Try correction"}</button>
    </>
  ) : step === "add-model" ? (
    <>
      <button className="button button-secondary" disabled={commandBusy} onClick={cancelModelDraft} type="button">Cancel</button>
      <button aria-busy={pendingCommand === "ADD_MODEL" || undefined} className="button button-primary" disabled={commandBusy || !file || !name.trim() || !licenseUrl.trim() || !authorityConfirmed} onClick={() => void addModel()} type="button">{pendingCommand === "ADD_MODEL" ? "Adding…" : "Add & try on"}</button>
    </>
  ) : step === "saved" ? (
    <button className="button button-primary" onClick={finishDismiss} type="button">Done</button>
  ) : step === "failed" ? selected?.retryAvailable ? (
    <button aria-busy={pendingCommand === "RETRY" || undefined} className="button button-primary" disabled={commandBusy} onClick={() => void retry()} type="button">{pendingCommand === "RETRY" ? "Starting…" : <span>Try once</span>}</button>
  ) : (
    <button className="button button-primary" onClick={chooseAnotherView} type="button">Choose another view</button>
  ) : step === "reconcile" ? (
    <>
      <button className="button button-secondary" onClick={chooseAnotherView} type="button">Other view</button>
      <button className="button button-primary" onClick={finishDismiss} type="button">Done</button>
    </>
  ) : undefined;

  const dismissCopy = dismissDecision === "LEAVE_ACTIVE"
    ? {
      confirmLabel: "Leave task",
      consequence: "Studio continues checking this exact private Wear request. Returning later will reconcile its saved state without starting another generation.",
      receiptDetail: "The current Wear request will remain available to resume.",
      receiptTitle: "Work preserved",
      summary: "Leave while Studio is still making this private view?",
      title: "Leave active Wear task?",
    }
    : dismissDecision === "DISCARD_DRAFT"
      ? {
        confirmLabel: "Discard changes",
        consequence: "Only the unsaved correction or model form is cleared. Saved Wear views and garment truth remain unchanged.",
        receiptDetail: "The unsaved form will close without changing saved Wear media.",
        receiptTitle: "Draft ready to discard",
        summary: "Discard these unsaved Wear changes?",
        title: "Discard Wear changes?",
      }
      : null;

  return (<>
    <StudioTaskSheet
      busy={commandBusy && step !== "working"}
      busyLabel="Saving the current Wear action"
      className="studio-wear-task-sheet"
      eyebrow="Private media"
      footer={footer}
      onBack={!commandBusy && ["add-model", "review", "edit", "failed"].includes(step)
        ? () => step === "edit" ? cancelCorrectionDraft() : step === "add-model" ? cancelModelDraft() : chooseAnotherView()
        : undefined}
      onDismiss={requestDismiss}
      open={open}
      progress={step === "reconcile" ? undefined : step === "choose" ? 18 : step === "working" ? 58 : step === "review" || step === "edit" ? 82 : 100}
      progressLabel="Wear media progress"
      returnFocus={returnFocus}
      title="Wear"
    >
      {!hydrated && hydrationError ? (
        <section aria-live="assertive" className="studio-task-question" role="alert">
          <CircleAlert aria-hidden="true" size={28} />
          <p className="eyebrow">Wear unavailable</p>
          <h3>Saved work could not be restored.</h3>
          <p>{hydrationError.message} {hydrationError.recovery}</p>
        </section>
      ) : !hydrated ? (
        <section aria-live="polite" className="studio-build-state" role="status">
          <div className="studio-build-visual"><Shirt aria-hidden="true" size={70} strokeWidth={1.1} /><span><LoaderCircle aria-hidden="true" className="studio-spin" size={21} /></span></div>
          <div><p className="eyebrow">Wear</p><h3>Opening saved work.</h3><p>Restoring the current private view.</p></div>
        </section>
      ) : step === "choose" ? (
        <section className="studio-task-question">
          <p className="eyebrow">Choose</p>
          <h3>Make a view.</h3>
          <div className="studio-disclosure-group studio-wear-options">
            <StudioDisclosureRow detail="Front" icon={<Shirt size={19} />} label="Mannequin" onClick={() => void run("MANNEQUIN_FRONT")} />
            {workspace?.models.map((model) => <StudioDisclosureRow detail={model.kind === "LULU_V3" ? "Approved V3" : "Authorized"} icon={<UserRound size={19} />} key={model.id} label={model.name} onClick={() => void run("MODEL_TRY_ON", model)} />)}
            <StudioDisclosureRow detail="Photo + authority" icon={<Plus size={19} />} label="Add model" onClick={() => setStep("add-model")} />
            {latestTryOnByModel.map((item) => {
              const model = workspace?.models.find((candidate) => candidate.id === item.modelProfileId);
              return <StudioDisclosureRow detail={model?.name ?? "Approved try-on"} icon={<Sparkles size={19} />} key={`editorial-${item.modelProfileId}`} label="Editorial background" onClick={() => void run("EDITORIAL_MODEL", model, item)} />;
            })}
          </div>
          <div className="studio-wear-truth"><strong>Still needed</strong><span>Back</span><span>Fabric detail</span></div>
          {pastAttempts.length ? (
            <section className="studio-wear-history">
              <button aria-expanded={historyOpen} onClick={() => setHistoryOpen((current) => !current)} type="button">
                <span><Clock3 aria-hidden="true" size={17} /><strong>History</strong></span>
                <small>{pastAttempts.length} not kept</small>
              </button>
              {historyOpen ? <div>{pastAttempts.map((attempt) => <p key={attempt.id}><span>{attempt.operation === "MODEL_TRY_ON" ? "Try-on" : attempt.operation === "EDITORIAL_MODEL" ? "Editorial" : "Mannequin"}</span><small>{attempt.state === "FAILED" ? "Not made" : "Rejected"}</small></p>)}</div> : null}
            </section>
          ) : null}
          {error ? <p className="studio-task-error" role="alert"><CircleAlert aria-hidden="true" size={17} />{error.message} {error.recovery}</p> : null}
        </section>
      ) : null}

      {step === "add-model" ? (
        <section className="studio-task-question studio-wear-model-intake">
          <p className="eyebrow">Model</p><h3>Add an adult photo.</h3>
          <button className="studio-model-photo" onClick={() => fileRef.current?.click()} type="button">
            {modelPreview ? <img alt="Selected model source" src={modelPreview} /> : <><ImagePlus aria-hidden="true" size={30} /><span>Choose photo</span></>}
          </button>
          <input aria-label="Choose adult model photo" className="studio-visually-hidden-file" ref={fileRef} accept="image/*" onChange={(event) => setFile(event.target.files?.[0] ?? undefined)} type="file" />
          <label className="studio-field"><span>Name</span><input maxLength={80} onChange={(event) => setName(event.target.value)} value={name} /></label>
          <label className="studio-field"><span>Usage source</span><input inputMode="url" onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://…" type="url" value={licenseUrl} /></label>
          <label className="studio-authority-check"><input aria-label="Confirm adult photo usage authority" checked={authorityConfirmed} onChange={(event) => setAuthorityConfirmed(event.target.checked)} type="checkbox" /><span><strong>Usage confirmed</strong><small>Adult photo · authorized for this private try-on</small></span></label>
          {error ? <p className="studio-task-error" role="alert">{error.message} {error.recovery}</p> : null}
        </section>
      ) : null}

      {step === "working" ? (
        <section aria-busy="true" aria-live="polite" className="studio-build-state" role="status">
          <div className="studio-build-visual"><Shirt aria-hidden="true" size={70} strokeWidth={1.1} /><span><LoaderCircle aria-hidden="true" className="studio-spin" size={21} /></span></div>
          <div><p className="eyebrow">Making</p><h3>{operation === "MANNEQUIN_FRONT" ? "Mannequin front." : operation === "EDITORIAL_MODEL" ? "Editorial background." : `Try-on${selectedModel ? ` · ${selectedModel.name}` : ""}.`}</h3><p>Private until kept.</p>{connectionMessage ? <p className="studio-task-error">{connectionMessage}</p> : null}</div>
        </section>
      ) : null}

      {step === "failed" ? <section aria-live="assertive" className="studio-task-question"><p className="eyebrow">Not made</p><h3>Try once?</h3><p>{error?.message}</p></section> : null}

      {step === "reconcile" ? <section aria-live="assertive" className="studio-task-question" role="alert"><CircleAlert aria-hidden="true" size={28} /><p className="eyebrow">Reconciliation required</p><h3>No new paid attempt will start.</h3><p>An administrator must reconcile this Wear attempt before Studio can continue.</p></section> : null}

      {step === "review" && selected?.outputUrl ? (
        <section className="studio-wear-review">
          <div className="studio-wear-review-image"><img alt={`${selected.operation.toLowerCase().replaceAll("_", " ")} review`} src={selected.outputUrl} /><button aria-label="Expand Wear image" className="studio-lens-action" onClick={() => setExpanded(true)} ref={expandPreviewRef} type="button"><Maximize2 aria-hidden="true" size={17} />Expand</button></div>
          <div><p className="eyebrow">Review</p><h3>Keep this view?</h3><p>Front only · private</p><button aria-busy={pendingCommand === "DECIDE_REJECT" || undefined} className="studio-text-action" disabled={commandBusy} onClick={() => void decide("REJECT")} type="button">{pendingCommand === "DECIDE_REJECT" ? "Rejecting…" : "Reject"}</button>{error ? <p className="studio-task-error" role="alert">{error.message} {error.recovery}</p> : null}</div>
        </section>
      ) : null}

      {step === "edit" ? <section className="studio-task-question"><p className="eyebrow">Correction</p><h3>What changes?</h3><label className="studio-field"><span>One correction</span><textarea maxLength={500} onChange={(event) => setNote(event.target.value)} rows={6} value={note} /></label>{error ? <p className="studio-task-error" role="alert">{error.message} {error.recovery}</p> : null}</section> : null}

      {step === "saved" && selected?.outputUrl ? <section className="studio-task-receipt"><div className="studio-receipt-visual"><img alt="Approved private Wear view" src={selected.outputUrl} /></div><div aria-live="polite" className="studio-receipt-copy"><div className="juw-receipt-motion"><WardrobeMotion artwork="logo" polarity="auto" size="sm" variant="success" /></div><p className="eyebrow">Kept</p><h3>View saved.</h3><p>Private · not in Shop</p></div></section> : null}

      {expanded && selected?.outputUrl ? <div aria-label="Expanded Wear review" aria-modal="true" className="studio-receipt-preview" role="dialog"><img alt="Expanded private Wear review" src={selected.outputUrl} /><button aria-label="Close expanded Wear image" className="studio-icon-action" onClick={closeExpandedPreview} ref={closePreviewRef} type="button"><X aria-hidden="true" size={19} /></button></div> : null}
      <span aria-live="polite" className="sr-only">{step === "working" ? "Wear generation in progress" : error?.message || ""}</span>
    </StudioTaskSheet>
    {dismissDecision && dismissCopy ? (
      <StudioDecisionSheet
        confirmLabel={dismissCopy.confirmLabel}
        consequence={dismissCopy.consequence}
        destructive={dismissDecision === "DISCARD_DRAFT"}
        eyebrow="Private Wear"
        onConfirm={confirmDismissDecision}
        onDismiss={closeDismissDecision}
        open
        receiptDetail={dismissCopy.receiptDetail}
        receiptTitle={dismissCopy.receiptTitle}
        returnFocus={dismissReturnFocus}
        summary={dismissCopy.summary}
        title={dismissCopy.title}
      />
    ) : null}
  </>);
}
