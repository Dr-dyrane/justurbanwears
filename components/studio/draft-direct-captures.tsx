"use client";

/* Private operator captures are served through authenticated no-store routes. */
/* eslint-disable @next/next/no-img-element */

import {
  ArrowLeft,
  ArrowRight,
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
  role: PendingDirectCaptureRole;
  state: "PENDING" | "RUNNING" | "COMPLETE" | "APPROVED" | "REJECTED" | "FAILED";
};

type AiSource = { file: File; url: string };
type AiFlow = {
  confirmed: boolean;
  correction: string;
  job: CompletionJob | null;
  role: PendingDirectCaptureRole;
  source: AiSource | null;
  step: "OPENING" | "SOURCE" | "MAKING" | "REVIEW";
};

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
    || !["PENDING", "RUNNING", "COMPLETE", "APPROVED", "REJECTED", "FAILED"].includes(String(candidate.state))) return null;
  const assetUrl = typeof candidate.assetUrl === "string"
    ? candidate.assetUrl
    : isRecord(candidate.output) && typeof candidate.output.assetUrl === "string" ? candidate.output.assetUrl : null;
  return {
    assetUrl,
    attempt: typeof candidate.attempt === "number" ? candidate.attempt : 1,
    canRetry: typeof candidate.canRetry === "boolean" ? candidate.canRetry : candidate.state === "COMPLETE" && candidate.attempt < 2,
    id: candidate.id,
    role: candidate.role,
    state: candidate.state as CompletionJob["state"],
  };
}

function roleSourceCopy(role: PendingDirectCaptureRole) {
  if (role === "GARMENT_FRONT") return { action: "Add a full front", confirmation: "Full front is visible" };
  if (role === "GARMENT_BACK") return { action: "Add a full back", confirmation: "Full back is visible" };
  return { action: "Add a fabric close-up", confirmation: "Fabric surface is clear" };
}

function errorMessage(value: unknown) {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string") return value.error.message;
  return "The photo could not be saved.";
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
  const capturesHeadingRef = useRef<HTMLDivElement>(null);
  const [captures, setCaptures] = useState<OperatorSafePendingCapture[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<PendingDirectCaptureRole | null>(null);
  const [aiFlow, setAiFlow] = useState<AiFlow | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const aiJobId = aiFlow?.job?.id;
  const aiStep = aiFlow?.step;
  const busy = loading || Boolean(savingRole) || aiFlow?.step === "OPENING" || aiFlow?.step === "MAKING";
  const savedMedia: StudioMediaItem[] = captures.map((capture) => ({
    alt: `${pendingWardrobeMediaLabel(capture.role)} saved privately`,
    label: pendingWardrobeMediaLabel(capture.role),
    src: capture.assetUrl,
  }));
  const requiredRoles = useMemo(() => PENDING_DIRECT_CAPTURE_ROLES.filter((role) =>
    target.requiredRoles.includes(role)
  ), [target.requiredRoles]);
  const missingRoles = requiredRoles.filter((role) => !captures.some((capture) => capture.role === role));

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
    setLoading(true);
    void fetch(target.endpoint, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const workspace = parseWorkspace(body);
      if (!workspace) throw new Error("The saved photos could not be read.");
      applyWorkspace(workspace);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Photos could not load." });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [applyWorkspace, target.endpoint]);

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

  function choose(role: PendingDirectCaptureRole, file?: File) {
    if (!file || busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setFeedback({ tone: "error", text: "Choose a JPEG, PNG or WebP under 12 MB." });
      return;
    }
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ role, file, url: URL.createObjectURL(file) });
    setFeedback(null);
  }

  async function usePhoto() {
    if (!preview || savingRole) return;
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
      const body: unknown = await response.json();
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
    if (busy) return;
    aiResumeControllerRef.current?.abort();
    const controller = new AbortController();
    aiResumeControllerRef.current = controller;
    aiReturnFocusRef.current = origin;
    setFeedback(null);
    setAiFlow({ confirmed: false, correction: "", job: null, role, source: null, step: "OPENING" });
    try {
      for (let poll = 0; poll < 40 && !controller.signal.aborted; poll += 1) {
        const response = await fetch(`${target.completionEndpoint}?role=${encodeURIComponent(role)}`, {
          cache: "no-store",
          credentials: "same-origin",
          headers: { accept: "application/json" },
          signal: controller.signal,
        });
        const body: unknown = await response.json();
        if (!response.ok) throw new Error(errorMessage(body));
        const job = parseCompletionJob(body);
        if (!job || job.state === "REJECTED" || job.state === "APPROVED") {
          setAiFlow((current) => current?.role === role ? { ...current, job: null, step: "SOURCE" } : current);
          return;
        }
        if (job.state === "COMPLETE" || job.state === "FAILED") {
          setAiFlow((current) => current?.role === role ? { ...current, job, step: "REVIEW" } : current);
          return;
        }
        setAiFlow((current) => current?.role === role ? { ...current, job, step: "MAKING" } : current);
        await new Promise((resolve) => window.setTimeout(resolve, 1_500));
      }
      if (!controller.signal.aborted) {
        setAiFlow((current) => current?.role === role ? { ...current, step: "REVIEW" } : current);
        setFeedback({ tone: "error", text: "This view is taking longer. Close it and check again." });
      }
    } catch (error) {
      if (controller.signal.aborted) return;
      setAiFlow((current) => current?.role === role ? { ...current, job: null, step: "SOURCE" } : current);
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "AI views are unavailable." });
    }
  }

  function closeAi() {
    aiResumeControllerRef.current?.abort();
    if (aiFlow?.source) URL.revokeObjectURL(aiFlow.source.url);
    setAiFlow(null);
    restoreAiFocus();
  }

  function chooseAiSource(file?: File) {
    if (!file || busy || !aiFlow) return;
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setFeedback({ tone: "error", text: "Choose a JPEG, PNG or WebP under 12 MB." });
      return;
    }
    if (aiFlow.source) URL.revokeObjectURL(aiFlow.source.url);
    setAiFlow({ ...aiFlow, confirmed: false, job: null, source: { file, url: URL.createObjectURL(file) }, step: "SOURCE" });
    setFeedback(null);
  }

  async function createAiCandidate() {
    if (!aiFlow?.source || !aiFlow.confirmed || aiFlow.step === "MAKING") return;
    const source = aiFlow.source;
    const role = aiFlow.role;
    setAiFlow({ ...aiFlow, step: "MAKING" });
    setFeedback(null);
    const form = new FormData();
    form.set("role", role);
    form.set("file", source.file);
    form.set("authorityConfirmed", "true");
    try {
      const response = await fetch(target.completionEndpoint, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const job = parseCompletionJob(body);
      if (!job || job.state !== "COMPLETE" || !job.assetUrl) throw new Error("The new view is not ready yet.");
      setAiFlow((current) => current && current.role === role ? { ...current, job, step: "REVIEW" } : current);
    } catch (error) {
      setAiFlow((current) => current && current.role === role ? { ...current, step: "SOURCE" } : current);
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "The new view could not be made." });
    }
  }

  async function decideAi(decision: "KEEP" | "RETRY" | "REJECT") {
    if (!aiFlow?.job || aiFlow.step === "MAKING") return;
    const role = aiFlow.role;
    setAiFlow({ ...aiFlow, step: "MAKING" });
    setFeedback(null);
    try {
      const response = await fetch(`${target.completionEndpoint}/${encodeURIComponent(aiFlow.job.id)}/decision`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({ decision, correction: aiFlow.correction.trim() || undefined }),
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
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
      if (!job || job.state !== "COMPLETE" || !job.assetUrl) throw new Error("The revised view is not ready yet.");
      setAiFlow((current) => current && current.role === role ? { ...current, correction: "", job, step: "REVIEW" } : current);
    } catch (error) {
      setAiFlow((current) => current && current.role === role ? { ...current, step: "REVIEW" } : current);
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "The view could not be updated." });
    }
  }

  if (!requiredRoles.length) return null;

  return (
    <section className="studio-direct-captures" aria-label={`${garment.title} private captures`}>
      <div className="studio-direct-captures-heading" ref={capturesHeadingRef} tabIndex={-1}>
        <div><small>Product photos</small><strong>{captures.length}/{requiredRoles.length} saved</strong></div>
        {loading ? (
          <Spinner label="Loading saved photos" />
        ) : captures.length === requiredRoles.length ? (
          <Check aria-hidden="true" size={18} />
        ) : (
          <Images aria-hidden="true" className="is-incomplete" size={18} />
        )}
      </div>

      {aiFlow ? (
        <section aria-labelledby={aiStepHeadingId} className="studio-ai-capture-flow" data-step={aiFlow.step.toLowerCase()}>
          <div className="studio-ai-capture-bar">
            <button aria-label="Back to missing photos" disabled={aiFlow.step === "MAKING"} onClick={closeAi} type="button"><ArrowLeft aria-hidden="true" size={18} /></button>
            <span><small>Magic Wand</small><strong>{pendingWardrobeMediaLabel(aiFlow.role)}</strong></span>
            <button aria-label="Cancel AI view" disabled={aiFlow.step === "MAKING"} onClick={closeAi} type="button"><X aria-hidden="true" size={18} /></button>
          </div>

          {aiFlow.step === "SOURCE" ? <div className="studio-ai-source">
            <div className="studio-ai-source-heading"><WandSparkles aria-hidden="true" size={24} /><div><h3 id={aiStepHeadingId} ref={aiStepHeadingRef} tabIndex={-1}>{roleSourceCopy(aiFlow.role).action}</h3><small>Only this view. Unseen sides stay missing.</small></div></div>
            {aiFlow.source ? <StudioMediaButton className="studio-ai-source-preview" items={[{
              alt: `${pendingWardrobeMediaLabel(aiFlow.role)} source`,
              label: "Source",
              src: aiFlow.source.url,
            }]} label="Expand source photo"><img alt={`${pendingWardrobeMediaLabel(aiFlow.role)} source`} src={aiFlow.source.url} /></StudioMediaButton> : null}
            <div className="studio-ai-source-actions">
              <label aria-disabled={busy} aria-label={`Take source photo for ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()}`}><Camera aria-hidden="true" size={18} /><span>Camera</span><input accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => chooseAiSource(event.target.files?.[0])} type="file" /></label>
              <label aria-disabled={busy} aria-label={`Choose source photo for ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()}`}><Images aria-hidden="true" size={18} /><span>Photos</span><input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => chooseAiSource(event.target.files?.[0])} type="file" /></label>
            </div>
            {aiFlow.source ? <label className="studio-ai-authority"><input checked={aiFlow.confirmed} onChange={(event) => setAiFlow({ ...aiFlow, confirmed: event.target.checked })} type="checkbox" /><span><Check aria-hidden="true" size={15} /><strong>{roleSourceCopy(aiFlow.role).confirmation}</strong></span></label> : null}
            {aiFlow.source ? <button className="button button-primary studio-ai-create" disabled={!aiFlow.confirmed} onClick={() => void createAiCandidate()} type="button"><WandSparkles aria-hidden="true" size={17} />Create view</button> : null}
          </div> : null}

          {aiFlow.step === "OPENING" || aiFlow.step === "MAKING" ? <div aria-live="polite" className="studio-ai-making" role="status"><span><WandSparkles aria-hidden="true" size={29} /></span><h3 id={aiStepHeadingId} ref={aiStepHeadingRef} tabIndex={-1}>{aiFlow.step === "OPENING" ? "Opening saved work" : `Making ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()}`}</h3><div aria-hidden="true"><i /><i /><i /></div></div> : null}

          {aiFlow.step === "REVIEW" ? <div className="studio-ai-review">
            {aiFlow.job?.assetUrl ? <StudioMediaButton className="studio-ai-review-media" items={[{
              alt: `${pendingWardrobeMediaLabel(aiFlow.role)} AI candidate`,
              label: pendingWardrobeMediaLabel(aiFlow.role),
              src: aiFlow.job.assetUrl,
            }]} label={`Expand ${pendingWardrobeMediaLabel(aiFlow.role).toLowerCase()} candidate`}><img alt={`${pendingWardrobeMediaLabel(aiFlow.role)} AI candidate`} src={aiFlow.job.assetUrl} /></StudioMediaButton> : null}
            <div className="studio-ai-review-copy"><small>Private</small><h3 id={aiStepHeadingId} ref={aiStepHeadingRef} tabIndex={-1}>{aiFlow.job?.assetUrl ? "Keep this view?" : "This view did not finish"}</h3></div>
            {aiFlow.job?.canRetry ? <label className="studio-ai-correction"><span>Correction</span><input maxLength={180} onChange={(event) => setAiFlow({ ...aiFlow, correction: event.target.value })} placeholder="Keep the sleeves unchanged" value={aiFlow.correction} /></label> : null}
            <div className="studio-ai-review-actions">
              <button className="button button-secondary" disabled={!aiFlow.job?.canRetry} onClick={() => void decideAi("RETRY")} type="button"><RefreshCw aria-hidden="true" size={16} />Try again</button>
              {aiFlow.job?.assetUrl ? <button className="button button-primary" onClick={() => void decideAi("KEEP")} type="button"><Check aria-hidden="true" size={16} />Keep</button> : null}
            </div>
            {aiFlow.job?.state === "COMPLETE" ? <button className="studio-ai-discard" onClick={() => void decideAi("REJECT")} type="button">Discard AI view</button> : <button className="studio-ai-discard" onClick={closeAi} type="button">Done</button>}
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
            <button className="button button-primary" disabled={Boolean(savingRole)} onClick={usePhoto} type="button">
              {savingRole ? <Spinner /> : <Check aria-hidden="true" size={15} />}
              {savingRole ? "Saving…" : "Use photo"}
            </button>
          </div>
        </div>
      ) : (
        <div className="studio-direct-capture-list">
          {missingRoles[0] ? (
            <button
              aria-label={`Create ${pendingWardrobeMediaLabel(missingRoles[0]).toLowerCase()} with Magic Wand`}
              className="studio-magic-capture-shortcut"
              disabled={busy}
              onClick={(event) => void openAi(missingRoles[0], event.currentTarget)}
              type="button"
            >
              <span><WandSparkles aria-hidden="true" size={18} /></span>
              <span><small>Magic Wand</small><strong>{pendingWardrobeMediaLabel(missingRoles[0])}</strong></span>
              <ArrowRight aria-hidden="true" size={16} />
            </button>
          ) : null}
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
