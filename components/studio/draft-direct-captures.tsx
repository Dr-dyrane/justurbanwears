"use client";

/* Private operator captures are served through authenticated no-store routes. */
/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  Camera,
  Check,
  CircleAlert,
  Images,
  LoaderCircle,
  RefreshCw,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { Garment } from "../../lib/studio/domain/entities";
import {
  pendingWardrobeMediaLabel,
} from "../../lib/studio/seeds/private-wardrobe-products";
import {
  isPendingDirectCaptureRole,
  PENDING_DIRECT_CAPTURE_ROLES,
  type OperatorSafePendingCapture,
  type PendingDirectCaptureRole,
} from "../../lib/studio/engine/pending-capture-contracts";
import { useStudio } from "./studio-provider";
import { StudioMediaButton, type StudioMediaItem } from "./media-viewer";

type CaptureWorkspace = { sku: string; captures: OperatorSafePendingCapture[] };
type Preview = { role: PendingDirectCaptureRole; file: File; url: string };

export type DirectCaptureTarget = {
  aiSourceMode?: "APPROVED_FRONT";
  approvedFrontUrl?: string;
  completionEndpoint: string;
  endpoint: string;
  key: string;
  requiredRoles: readonly PendingDirectCaptureRole[];
};

type CompletionJob = {
  assetUrl: string | null;
  attempt: number;
  canRetry: boolean;
  id: string;
  requiresReconciliation: boolean;
  role: PendingDirectCaptureRole;
  sourceMode: "APPROVED_FRONT" | "UPLOADED_AUTHORITY";
  state: "PENDING" | "RUNNING" | "COMPLETE" | "APPROVED" | "REJECTED" | "FAILED" | "INDETERMINATE";
};

type AiSource = { file: File; url: string };
type AiFlow = {
  confirmed: boolean;
  correction: string;
  job: CompletionJob | null;
  role: PendingDirectCaptureRole;
  source: AiSource | null;
  sourceMode: "APPROVED_FRONT" | "UPLOADED_AUTHORITY";
  step: "OPENING" | "SOURCE" | "MAKING" | "REVIEW";
};

type CaptureReadState = {
  endpoint: string;
  error: string | null;
  status: "LOADING" | "READY" | "ERROR";
};

type AiResumeResult =
  | { kind: "ABORTED" }
  | { kind: "EMPTY" }
  | { kind: "REVIEW"; job: CompletionJob }
  | { kind: "TIMEOUT"; job: CompletionJob | null };

function Spinner({ label }: { label?: string }) {
  return <span aria-label={label} className="studio-capture-spinner" role={label ? "status" : undefined}><LoaderCircle aria-hidden="true" size={17} /></span>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseWorkspace(value: unknown): CaptureWorkspace | null {
  if (!isRecord(value) || !Array.isArray(value.captures)) return null;
  const captures = value.captures.filter((capture): capture is OperatorSafePendingCapture =>
    isRecord(capture)
    && typeof capture.id === "string"
    && typeof capture.role === "string"
    && PENDING_DIRECT_CAPTURE_ROLES.includes(capture.role as PendingDirectCaptureRole)
    && typeof capture.view === "string"
    && typeof capture.mimeType === "string"
    && typeof capture.assetUrl === "string"
    && typeof capture.approvedAt === "string"
  );
  const key = typeof value.sku === "string"
    ? value.sku
    : typeof value.wardrobeItemId === "string" ? value.wardrobeItemId : null;
  return key ? { sku: key, captures } : null;
}

function parseCompletionJob(value: unknown): CompletionJob | null {
  const candidate = isRecord(value) && isRecord(value.job) ? value.job : value;
  if (!isRecord(candidate)
    || typeof candidate.id !== "string"
    || !isPendingDirectCaptureRole(candidate.role)
    || !["PENDING", "RUNNING", "COMPLETE", "APPROVED", "REJECTED", "FAILED", "INDETERMINATE"].includes(String(candidate.state))) return null;
  const assetUrl = typeof candidate.assetUrl === "string"
    ? candidate.assetUrl
    : isRecord(candidate.output) && typeof candidate.output.assetUrl === "string" ? candidate.output.assetUrl : null;
  return {
    assetUrl,
    attempt: typeof candidate.attempt === "number" ? candidate.attempt : 1,
    canRetry: typeof candidate.canRetry === "boolean" ? candidate.canRetry : candidate.state === "COMPLETE" && (typeof candidate.attempt !== "number" || candidate.attempt < 2),
    id: candidate.id,
    requiresReconciliation: candidate.requiresReconciliation === true || candidate.state === "INDETERMINATE",
    role: candidate.role,
    sourceMode: candidate.sourceMode === "APPROVED_FRONT" ? "APPROVED_FRONT" : "UPLOADED_AUTHORITY",
    state: candidate.state as CompletionJob["state"],
  };
}

function roleSourceCopy(role: PendingDirectCaptureRole) {
  if (role === "GARMENT_FRONT") return { action: "Add a full front", confirmation: "Full front is visible" };
  if (role === "GARMENT_BACK") return { action: "Add a full back", confirmation: "Full back is visible" };
  return { action: "Add a fabric close-up", confirmation: "Fabric surface is clear" };
}

function inferredSourceCopy(role: PendingDirectCaptureRole) {
  if (role === "GARMENT_BACK") return {
    action: "Create from product front",
    detail: "AI suggests the unseen back. You verify it before saving.",
  };
  return {
    action: "Create from product front",
    detail: "AI suggests a detail from visible fabric. You verify it before saving.",
  };
}

function inferredReviewCopy(role: PendingDirectCaptureRole) {
  return role === "GARMENT_BACK"
    ? { heading: "Does this match the real back?", detail: "Inferred from the product front. Check the garment." }
    : { heading: "Does this match the real fabric?", detail: "Suggested from the product front. Check the garment." };
}

function errorMessage(value: unknown, fallback = "The photo could not be saved.") {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string") return value.error.message;
  return fallback;
}

async function responseJson(response: Response) {
  try {
    return await response.json() as unknown;
  } catch {
    return null;
  }
}

export function DraftDirectCaptures({
  garment,
  onCapturesChange,
  target,
}: {
  garment: Garment;
  onCapturesChange(captures: OperatorSafePendingCapture[]): void;
  target: DirectCaptureTarget;
}) {
  const { syncPendingGarmentCaptures } = useStudio();
  const aiStepHeadingId = useId();
  const aiStepHeadingRef = useRef<HTMLHeadingElement>(null);
  const aiReturnFocusRef = useRef<HTMLElement | null>(null);
  const aiResumeControllerRef = useRef<AbortController | null>(null);
  const aiCommandInFlightRef = useRef(false);
  const capturesHeadingRef = useRef<HTMLDivElement>(null);
  const [captures, setCaptures] = useState<OperatorSafePendingCapture[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [captureRead, setCaptureRead] = useState<CaptureReadState>({
    endpoint: target.endpoint,
    error: null,
    status: "LOADING",
  });
  const [captureReadAttempt, setCaptureReadAttempt] = useState(0);
  const [savingRole, setSavingRole] = useState<PendingDirectCaptureRole | null>(null);
  const [aiFlow, setAiFlow] = useState<AiFlow | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const aiJobId = aiFlow?.job?.id;
  const aiStep = aiFlow?.step;
  const workspaceLoading = captureRead.endpoint !== target.endpoint || captureRead.status === "LOADING";
  const workspaceReady = captureRead.endpoint === target.endpoint && captureRead.status === "READY";
  const workspaceError = captureRead.endpoint === target.endpoint && captureRead.status === "ERROR"
    ? captureRead.error ?? "Saved photos are unavailable."
    : null;
  const busy = !workspaceReady || Boolean(savingRole) || aiFlow?.step === "OPENING" || aiFlow?.step === "MAKING";
  const savedMedia: StudioMediaItem[] = captures.map((capture) => ({
    alt: `${pendingWardrobeMediaLabel(capture.role)} saved privately`,
    label: pendingWardrobeMediaLabel(capture.role),
    src: capture.assetUrl,
  }));
  const requiredRoles = useMemo(() => PENDING_DIRECT_CAPTURE_ROLES.filter((role) =>
    target.requiredRoles.includes(role)
  ), [target.requiredRoles]);
  const aiUsesApprovedFront = aiFlow?.sourceMode === "APPROVED_FRONT";

  const applyWorkspace = useCallback((workspace: CaptureWorkspace) => {
    setCaptures(workspace.captures);
    onCapturesChange(workspace.captures);
    syncPendingGarmentCaptures(garment.id, workspace.captures.map((capture) => ({
      id: `pending-capture-${capture.id}`,
      view: capture.view,
      quality: 100,
    })));
  }, [garment.id, onCapturesChange, syncPendingGarmentCaptures]);

  useEffect(() => {
    const controller = new AbortController();
    setCaptureRead({ endpoint: target.endpoint, error: null, status: "LOADING" });
    void fetch(target.endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const body = await responseJson(response);
      if (!response.ok) throw new Error(errorMessage(body, "Saved photos are unavailable. Try again."));
      const workspace = parseWorkspace(body);
      if (!workspace) throw new Error("The saved photos could not be read.");
      applyWorkspace(workspace);
      if (!controller.signal.aborted) {
        setCaptureRead({ endpoint: target.endpoint, error: null, status: "READY" });
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) {
        setCaptureRead({
          endpoint: target.endpoint,
          error: error instanceof Error ? error.message : "Photos could not load.",
          status: "ERROR",
        });
      }
    });
    return () => controller.abort();
  }, [applyWorkspace, captureReadAttempt, target.endpoint]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  useEffect(() => () => {
    if (aiFlow?.source) URL.revokeObjectURL(aiFlow.source.url);
  }, [aiFlow?.source]);

  useEffect(() => {
    if (!aiStep) return;
    window.requestAnimationFrame(() => {
      const heading = aiStepHeadingRef.current;
      if (!heading) return;
      heading.scrollIntoView({
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
        block: "start",
      });
      heading.focus({ preventScroll: true });
    });
  }, [aiJobId, aiStep]);

  useEffect(() => () => aiResumeControllerRef.current?.abort(), []);

  function retryCaptureRead() {
    if (workspaceLoading) return;
    setCaptureReadAttempt((attempt) => attempt + 1);
  }

  function choose(role: PendingDirectCaptureRole, file?: File) {
    if (!workspaceReady || !file || busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setFeedback({ tone: "error", text: "Choose a JPEG, PNG or WebP under 12 MB." });
      return;
    }
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ role, file, url: URL.createObjectURL(file) });
    setFeedback(null);
  }

  async function usePhoto() {
    if (!workspaceReady || !preview || savingRole) return;
    setSavingRole(preview.role);
    setFeedback(null);
    const form = new FormData();
    form.set("role", preview.role);
    form.set("file", preview.file);
    try {
      const response = await fetch(target.endpoint, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(errorMessage(body));
      const workspace = parseWorkspace(body);
      if (!workspace) throw new Error("The saved photo could not be read.");
      applyWorkspace(workspace);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      setFeedback({ tone: "success", text: `${pendingWardrobeMediaLabel(preview.role)} saved privately.` });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "The photo could not be saved." });
    } finally {
      setSavingRole(null);
    }
  }

  function restoreAiFocus() {
    window.requestAnimationFrame(() => {
      const origin = aiReturnFocusRef.current;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
      else capturesHeadingRef.current?.focus({ preventScroll: true });
    });
  }

  async function openAi(role: PendingDirectCaptureRole, origin: HTMLElement) {
    if (!workspaceReady || busy) return;
    aiResumeControllerRef.current?.abort();
    const controller = new AbortController();
    aiResumeControllerRef.current = controller;
    aiReturnFocusRef.current = origin;
    setFeedback(null);
    setAiFlow({
      confirmed: false,
      correction: "",
      job: null,
      role,
      source: null,
      sourceMode: target.aiSourceMode ?? "UPLOADED_AUTHORITY",
      step: "OPENING",
    });
    try {
      const result = await resumeAiCompletion(role, controller, true);
      if (result.kind === "TIMEOUT") {
        setFeedback({ tone: "error", text: "This view is taking longer. Close it and check again." });
      } else if (result.kind === "REVIEW" && result.job.requiresReconciliation) {
        setFeedback({ tone: "error", text: "Studio cannot confirm the provider result. No retry was started; an administrator must reconcile this saved attempt." });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setAiFlow((current) => current?.role === role ? { ...current, job: null, step: "REVIEW" } : current);
      setFeedback({ tone: "error", text: `${error instanceof Error ? error.message : "AI views are unavailable."} No new attempt was started. Close and check again.` });
    }
  }

  async function readLatestAiCompletion(role: PendingDirectCaptureRole, signal: AbortSignal) {
    const response = await fetch(`${target.completionEndpoint}?role=${encodeURIComponent(role)}`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    });
    const body = await responseJson(response);
    if (!response.ok) throw new Error(errorMessage(body, "AI views are unavailable. Try again."));
    return parseCompletionJob(body);
  }

  async function resumeAiCompletion(
    role: PendingDirectCaptureRole,
    controller: AbortController,
    allowEmptySource: boolean,
  ): Promise<AiResumeResult> {
    let latest: CompletionJob | null = null;
    for (let poll = 0; poll < 40 && !controller.signal.aborted; poll += 1) {
      latest = await readLatestAiCompletion(role, controller.signal);
      if (!latest || latest.state === "REJECTED" || latest.state === "APPROVED") {
        setAiFlow((current) => current?.role === role
          ? { ...current, job: null, step: allowEmptySource ? "SOURCE" : "REVIEW" }
          : current);
        return { kind: "EMPTY" };
      }
      if (latest.state === "COMPLETE" && !latest.assetUrl) {
        const blockedJob = { ...latest, canRetry: false, requiresReconciliation: true };
        setAiFlow((current) => current?.role === role
          ? { ...current, job: blockedJob, sourceMode: blockedJob.sourceMode, step: "REVIEW" }
          : current);
        return { job: blockedJob, kind: "REVIEW" };
      }
      if (latest.state === "COMPLETE" || latest.state === "FAILED" || latest.state === "INDETERMINATE") {
        const reviewJob = latest;
        setAiFlow((current) => current?.role === role
          ? { ...current, job: reviewJob, sourceMode: reviewJob.sourceMode, step: "REVIEW" }
          : current);
        return { job: reviewJob, kind: "REVIEW" };
      }
      const pendingJob = latest;
      setAiFlow((current) => current?.role === role
        ? { ...current, job: pendingJob, sourceMode: pendingJob.sourceMode, step: "MAKING" }
        : current);
      await new Promise((resolve) => window.setTimeout(resolve, 1_500));
    }
    if (controller.signal.aborted) return { kind: "ABORTED" };
    setAiFlow((current) => current?.role === role ? { ...current, job: latest, step: "REVIEW" } : current);
    return { job: latest, kind: "TIMEOUT" };
  }

  function closeAi() {
    aiResumeControllerRef.current?.abort();
    if (aiFlow?.source) URL.revokeObjectURL(aiFlow.source.url);
    setAiFlow(null);
    restoreAiFocus();
  }

  function chooseAiSource(file?: File) {
    if (!workspaceReady || !file || busy || !aiFlow) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setFeedback({ tone: "error", text: "Choose a JPEG, PNG or WebP under 12 MB." });
      return;
    }
    if (aiFlow.source) URL.revokeObjectURL(aiFlow.source.url);
    setAiFlow({ ...aiFlow, confirmed: false, job: null, source: { file, url: URL.createObjectURL(file) }, sourceMode: "UPLOADED_AUTHORITY", step: "SOURCE" });
    setFeedback(null);
  }

  function chooseDirectAlternative(file?: File) {
    if (!workspaceReady || !file || busy || !aiFlow) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setFeedback({ tone: "error", text: "Choose a JPEG, PNG or WebP under 12 MB." });
      return;
    }
    const role = aiFlow.role;
    if (aiFlow.source) URL.revokeObjectURL(aiFlow.source.url);
    if (preview) URL.revokeObjectURL(preview.url);
    setAiFlow(null);
    setPreview({ role, file, url: URL.createObjectURL(file) });
    setFeedback(null);
  }

  async function createAiCandidate() {
    if (!workspaceReady || !aiFlow || aiFlow.step === "MAKING" || aiCommandInFlightRef.current) return;
    if (aiFlow.sourceMode === "UPLOADED_AUTHORITY" && (!aiFlow.source || !aiFlow.confirmed)) return;
    aiCommandInFlightRef.current = true;
    aiResumeControllerRef.current?.abort();
    const source = aiFlow.source;
    const role = aiFlow.role;
    const sourceMode = aiFlow.sourceMode;
    setAiFlow({ ...aiFlow, step: "MAKING" });
    setFeedback(null);
    const requestInit: RequestInit = sourceMode === "APPROVED_FRONT"
      ? {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ role, sourceMode }),
      }
      : (() => {
        const form = new FormData();
        form.set("role", role);
        form.set("file", source!.file);
        form.set("authorityConfirmed", "true");
        return { method: "POST", credentials: "same-origin", body: form } satisfies RequestInit;
      })();
    try {
      const response = await fetch(target.completionEndpoint, requestInit);
      const body = await responseJson(response);
      if (!response.ok) {
        const failure = new Error(errorMessage(body, "The new view could not be made. Try again."));
        if (response.status < 500 && response.status !== 409) {
          setAiFlow((current) => current && current.role === role ? { ...current, step: "SOURCE" } : current);
          setFeedback({ tone: "error", text: failure.message });
          return;
        }
        throw failure;
      }
      const job = parseCompletionJob(body);
      if (job?.requiresReconciliation) {
        setAiFlow((current) => current && current.role === role ? { ...current, job, step: "REVIEW" } : current);
        setFeedback({ tone: "error", text: "Studio cannot confirm the provider result. No retry was started; an administrator must reconcile this saved attempt." });
        return;
      }
      if (!job) throw new Error("The new view response could not be confirmed.");
      if (job.state === "COMPLETE" && job.assetUrl) {
        setAiFlow((current) => current && current.role === role ? { ...current, job, step: "REVIEW" } : current);
        return;
      }
      if (job.state === "FAILED" || job.state === "INDETERMINATE") {
        setAiFlow((current) => current && current.role === role ? { ...current, job, step: "REVIEW" } : current);
        return;
      }
      const controller = new AbortController();
      aiResumeControllerRef.current = controller;
      const result = await resumeAiCompletion(role, controller, false);
      if (result.kind === "EMPTY") {
        setFeedback({ tone: "error", text: "Studio could not confirm a saved attempt. No new attempt was started. Close and check again." });
      } else if (result.kind === "TIMEOUT") {
        setFeedback({ tone: "error", text: "This saved attempt is still running. No new attempt was started. Close and check again." });
      } else if (result.kind === "REVIEW" && result.job.requiresReconciliation) {
        setFeedback({ tone: "error", text: "Studio cannot confirm the provider result. No retry was started; an administrator must reconcile this saved attempt." });
      }
    } catch (error) {
      const controller = new AbortController();
      aiResumeControllerRef.current = controller;
      setAiFlow((current) => current && current.role === role ? { ...current, step: "MAKING" } : current);
      try {
        const result = await resumeAiCompletion(role, controller, false);
        if (result.kind === "ABORTED") return;
        if (result.kind === "REVIEW") {
          setFeedback(result.job.requiresReconciliation
            ? { tone: "error", text: "Studio cannot confirm the provider result. No retry was started; an administrator must reconcile this saved attempt." }
            : { tone: result.job.state === "COMPLETE" ? "success" : "error", text: result.job.state === "COMPLETE" ? "Saved work recovered. Review it before continuing." : "The saved attempt did not finish. Review it before trying again." });
          return;
        }
        setFeedback({
          tone: "error",
          text: result.kind === "TIMEOUT"
            ? "Studio is still checking the saved attempt. No new attempt was started. Close and check again."
            : "Studio could not find a saved attempt after checking. No new attempt was started. Close and check again.",
        });
      } catch (reconciliationError) {
        if (controller.signal.aborted) return;
        setAiFlow((current) => current && current.role === role ? { ...current, job: null, step: "REVIEW" } : current);
        setFeedback({
          tone: "error",
          text: `${reconciliationError instanceof Error ? reconciliationError.message : error instanceof Error ? error.message : "The new view could not be confirmed."} No new attempt was started. Close and check again.`,
        });
      }
    } finally {
      aiCommandInFlightRef.current = false;
    }
  }

  async function decideAi(decision: "KEEP" | "RETRY" | "REJECT") {
    if (!workspaceReady || !aiFlow?.job || aiFlow.step === "MAKING" || aiCommandInFlightRef.current) return;
    aiCommandInFlightRef.current = true;
    const role = aiFlow.role;
    setAiFlow({ ...aiFlow, step: "MAKING" });
    setFeedback(null);
    try {
      const response = await fetch(`${target.completionEndpoint}/${encodeURIComponent(aiFlow.job.id)}/decision`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          decision,
          correction: aiFlow.correction.trim() || undefined,
          ...(decision === "KEEP" && aiFlow.sourceMode === "APPROVED_FRONT" ? { truthConfirmed: true } : {}),
        }),
      });
      const body = await responseJson(response);
      if (!response.ok) throw new Error(errorMessage(body, "The view could not be updated. Try again."));
      if (decision === "REJECT") {
        if (aiFlow.source) URL.revokeObjectURL(aiFlow.source.url);
        setAiFlow(null);
        setFeedback({ tone: "success", text: "AI view discarded." });
        restoreAiFocus();
        return;
      }
      if (decision === "KEEP") {
        const workspace = parseWorkspace(isRecord(body) && body.workspace ? body.workspace : body);
        if (!workspace) throw new Error("The approved view could not be read.");
        applyWorkspace(workspace);
        if (aiFlow.source) URL.revokeObjectURL(aiFlow.source.url);
        setAiFlow(null);
        setFeedback({ tone: "success", text: `${pendingWardrobeMediaLabel(role)} saved privately.` });
        restoreAiFocus();
        return;
      }
      const job = parseCompletionJob(body);
      if (job?.requiresReconciliation) {
        setAiFlow((current) => current && current.role === role ? { ...current, correction: "", job, step: "REVIEW" } : current);
        setFeedback({ tone: "error", text: "Studio cannot confirm the provider result. No retry was started; an administrator must reconcile this saved attempt." });
        return;
      }
      if (!job || job.state !== "COMPLETE" || !job.assetUrl) throw new Error("The revised view is not ready yet.");
      setAiFlow((current) => current && current.role === role ? { ...current, correction: "", job, step: "REVIEW" } : current);
    } catch (error) {
      setAiFlow((current) => current && current.role === role ? { ...current, step: "REVIEW" } : current);
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "The view could not be updated." });
    } finally {
      aiCommandInFlightRef.current = false;
    }
  }

  if (!requiredRoles.length) return null;

  return (
    <section className="studio-direct-captures" aria-label={`${garment.title} private captures`}>
      <div className="studio-direct-captures-heading" ref={capturesHeadingRef} tabIndex={-1}>
        <div><small>Saved</small><strong>{captures.length} of {requiredRoles.length}</strong></div>
        {workspaceLoading ? (
          <Spinner label="Loading saved photos" />
        ) : workspaceError ? (
          <CircleAlert aria-hidden="true" size={18} />
        ) : captures.length === requiredRoles.length ? (
          <Check aria-hidden="true" size={18} />
        ) : (
          <Images aria-hidden="true" className="is-incomplete" size={18} />
        )}
      </div>

      {workspaceError ? (
        <div className="studio-capture-feedback is-error" role="alert">
          <CircleAlert aria-hidden="true" size={15} />
          <span>{workspaceError}</span>
          <button className="button button-secondary" onClick={retryCaptureRead} type="button">Try again</button>
        </div>
      ) : aiFlow ? (
        <section aria-labelledby={aiStepHeadingId} className="studio-ai-capture-flow" data-step={aiFlow.step.toLowerCase()}>
          <div className="studio-ai-capture-bar">
            <button aria-label="Back to missing photos" disabled={aiFlow.step === "MAKING"} onClick={closeAi} type="button"><ArrowLeft aria-hidden="true" size={18} /></button>
            <span><small>Magic Wand</small><strong>{pendingWardrobeMediaLabel(aiFlow.role)}</strong></span>
            <button aria-label="Cancel AI view" disabled={aiFlow.step === "MAKING"} onClick={closeAi} type="button"><X aria-hidden="true" size={18} /></button>
          </div>

          {aiFlow.step === "SOURCE" ? <div className="studio-ai-source">
            <div className="studio-ai-source-heading"><WandSparkles aria-hidden="true" size={24} /><div><h3 id={aiStepHeadingId} ref={aiStepHeadingRef} tabIndex={-1}>{aiUsesApprovedFront ? inferredSourceCopy(aiFlow.role).action : roleSourceCopy(aiFlow.role).action}</h3><small>{aiUsesApprovedFront ? inferredSourceCopy(aiFlow.role).detail : "Only this view. Unseen sides stay missing."}</small></div></div>
            {aiUsesApprovedFront && target.approvedFrontUrl ? <StudioMediaButton className="studio-ai-source-preview" items={[{
              alt: `${garment.title} approved product front`,
              label: "Product front",
              src: target.approvedFrontUrl,
            }]} label="Expand approved product front"><img alt={`${garment.title} approved product front`} src={target.approvedFrontUrl} /></StudioMediaButton> : null}
            {aiFlow.source ? <StudioMediaButton className="studio-ai-source-preview" items={[{
              alt: `${pendingWardrobeMediaLabel(aiFlow.role)} source`,
              label: "Source",
              src: aiFlow.source.url,
            }]} label="Expand source photo"><img alt={`${pendingWardrobeMediaLabel(aiFlow.role)} source`} src={aiFlow.source.url} /></StudioMediaButton> : null}
            {aiUsesApprovedFront ? <button className="button button-primary studio-ai-create" disabled={busy} onClick={() => void createAiCandidate()} type="button"><WandSparkles aria-hidden="true" size={17} />Create AI preview</button> : null}
            {aiUsesApprovedFront ? <div className="studio-ai-source-alternatives"><small>Or add the real view</small><div className="studio-ai-source-actions">
              <label aria-disabled={busy} aria-label={`Take ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()} photo`}><Camera aria-hidden="true" size={18} /><span>Camera</span><input accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => chooseDirectAlternative(event.target.files?.[0])} type="file" /></label>
              <label aria-disabled={busy} aria-label={`Choose ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()} from Photos`}><Images aria-hidden="true" size={18} /><span>Photos</span><input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => chooseDirectAlternative(event.target.files?.[0])} type="file" /></label>
            </div></div> : <>
              <div className="studio-ai-source-actions">
                <label aria-disabled={busy} aria-label={`Take source photo for ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()}`}><Camera aria-hidden="true" size={18} /><span>Camera</span><input accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => chooseAiSource(event.target.files?.[0])} type="file" /></label>
                <label aria-disabled={busy} aria-label={`Choose source photo for ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()}`}><Images aria-hidden="true" size={18} /><span>Photos</span><input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => chooseAiSource(event.target.files?.[0])} type="file" /></label>
              </div>
              {aiFlow.source ? <label className="studio-ai-authority"><input checked={aiFlow.confirmed} disabled={busy} onChange={(event) => setAiFlow({ ...aiFlow, confirmed: event.target.checked })} type="checkbox" /><span><Check aria-hidden="true" size={15} /><strong>{roleSourceCopy(aiFlow.role).confirmation}</strong></span></label> : null}
              {aiFlow.source ? <button className="button button-primary studio-ai-create" disabled={busy || !aiFlow.confirmed} onClick={() => void createAiCandidate()} type="button"><WandSparkles aria-hidden="true" size={17} />Create view</button> : null}
            </>}
          </div> : null}

          {aiFlow.step === "OPENING" || aiFlow.step === "MAKING" ? <div aria-live="polite" className="studio-ai-making" role="status"><span><WandSparkles aria-hidden="true" size={29} /></span><h3 id={aiStepHeadingId} ref={aiStepHeadingRef} tabIndex={-1}>{aiFlow.step === "OPENING" ? "Opening saved work" : `Making ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()}`}</h3><div aria-hidden="true"><i /><i /><i /></div></div> : null}

          {aiFlow.step === "REVIEW" ? <div className="studio-ai-review">
            {aiFlow.job?.assetUrl ? <StudioMediaButton className="studio-ai-review-media" items={[{
              alt: `${pendingWardrobeMediaLabel(aiFlow.role)} AI candidate`,
              label: pendingWardrobeMediaLabel(aiFlow.role),
              src: aiFlow.job.assetUrl,
            }]} label={`Expand ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()} candidate`}><img alt={`${pendingWardrobeMediaLabel(aiFlow.role)} AI candidate`} src={aiFlow.job.assetUrl} /></StudioMediaButton> : null}
            <div className="studio-ai-review-copy"><small>{aiUsesApprovedFront ? "Private AI preview" : "Private"}</small><h3 id={aiStepHeadingId} ref={aiStepHeadingRef} tabIndex={-1}>{aiFlow.job?.requiresReconciliation ? "Reconciliation required" : aiFlow.job?.assetUrl ? aiUsesApprovedFront ? inferredReviewCopy(aiFlow.role).heading : "Keep this view?" : "This view did not finish"}</h3>{aiFlow.job?.assetUrl && aiUsesApprovedFront ? <p>{inferredReviewCopy(aiFlow.role).detail}</p> : null}{aiFlow.job?.requiresReconciliation ? <p>Studio cannot confirm the provider result. This saved attempt cannot be retried automatically.</p> : null}</div>
            {aiFlow.job?.canRetry ? <label className="studio-ai-correction"><span>Correction</span><input disabled={busy} maxLength={180} onChange={(event) => setAiFlow({ ...aiFlow, correction: event.target.value })} placeholder="Keep the sleeves unchanged" value={aiFlow.correction} /></label> : null}
            <div className="studio-ai-review-actions">
              <button className="button button-secondary" disabled={busy || !aiFlow.job?.canRetry || aiFlow.job?.requiresReconciliation} onClick={() => void decideAi("RETRY")} type="button"><RefreshCw aria-hidden="true" size={16} />Try again</button>
              {aiFlow.job?.assetUrl ? <button className="button button-primary" disabled={busy} onClick={() => void decideAi("KEEP")} type="button"><Check aria-hidden="true" size={16} />{aiUsesApprovedFront ? "Yes, it matches" : "Keep"}</button> : null}
            </div>
            {aiFlow.job?.state === "COMPLETE" ? <button className="studio-ai-discard" disabled={busy} onClick={() => void decideAi("REJECT")} type="button">Discard AI view</button> : <button className="studio-ai-discard" onClick={closeAi} type="button">Done</button>}
          </div> : null}
        </section>
      ) : preview ? (
        <div className="studio-capture-preview">
          <StudioMediaButton className="studio-capture-preview-media" items={[{
            alt: `${pendingWardrobeMediaLabel(preview.role)} preview`,
            label: pendingWardrobeMediaLabel(preview.role),
            src: preview.url,
          }]} label={`Expand ${pendingWardrobeMediaLabel(preview.role).toLowerCase()} preview`}>
            <img alt={`${pendingWardrobeMediaLabel(preview.role)} preview`} src={preview.url} />
          </StudioMediaButton>
          <div>
            <span><small>Preview</small><strong>{pendingWardrobeMediaLabel(preview.role)}</strong></span>
            <label aria-disabled={busy} className="button button-secondary">
              <RefreshCw aria-hidden="true" size={15} />Replace
              <input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => choose(preview.role, event.target.files?.[0])} type="file" />
            </label>
            <button className="button button-primary" disabled={busy} onClick={usePhoto} type="button">
              {savingRole ? <Spinner /> : <Check aria-hidden="true" size={15} />}
              {savingRole ? "Saving…" : "Use photo"}
            </button>
          </div>
        </div>
      ) : (
        <div className="studio-direct-capture-list">
          {requiredRoles.map((role) => {
            const saved = captures.find((capture) => capture.role === role);
            return (
              <article className={saved ? "is-saved" : undefined} key={role}>
                {saved ? <StudioMediaButton className="studio-direct-capture-media" index={captures.findIndex((capture) => capture.id === saved.id)} items={savedMedia} label={`Preview ${pendingWardrobeMediaLabel(role).toLowerCase()}`}><img alt={`${pendingWardrobeMediaLabel(role)} saved privately`} src={saved.assetUrl} /></StudioMediaButton> : <div><Images aria-hidden="true" size={21} /></div>}
                <span><small>{saved ? "Saved privately" : "Missing"}</small><strong>{pendingWardrobeMediaLabel(role)}</strong></span>
                <div className="studio-direct-capture-actions">
                  {saved ? null : <button aria-label={`Create ${pendingWardrobeMediaLabel(role).toLowerCase()} with AI`} className="studio-direct-capture-magic" disabled={busy} onClick={(event) => void openAi(role, event.currentTarget)} type="button"><WandSparkles aria-hidden="true" size={18} /><span aria-hidden="true">Magic</span></button>}
                  <label aria-disabled={busy} aria-label={`Take ${pendingWardrobeMediaLabel(role).toLowerCase()} photo`}>
                    <Camera aria-hidden="true" size={17} />
                    <span aria-hidden="true">Camera</span>
                    <input accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => choose(role, event.target.files?.[0])} type="file" />
                  </label>
                  <label aria-disabled={busy} aria-label={`${saved ? "Replace" : "Choose"} ${pendingWardrobeMediaLabel(role).toLowerCase()} from Photos`}>
                    {saved ? <RefreshCw aria-hidden="true" size={17} /> : <Images aria-hidden="true" size={17} />}
                    <span aria-hidden="true">{saved ? "Replace" : "Photos"}</span>
                    <input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => choose(role, event.target.files?.[0])} type="file" />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {feedback ? <p className={`studio-capture-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.tone === "error" ? <CircleAlert aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}{feedback.text}</p> : null}
      <p className="studio-capture-private-note">Only Lulu sees this.</p>
    </section>
  );
}
