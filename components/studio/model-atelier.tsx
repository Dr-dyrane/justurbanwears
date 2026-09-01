"use client";

/* Private Studio model assets use protected runtime URLs. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowRight,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  UserRound,
} from "lucide-react";
import type { StudioAuthorityModel } from "../../lib/studio/services/studio-authority-client";
import { LifecycleMeta } from "./atoms/lifecycle-meta";
import { StudioFeedback } from "./atoms/studio-feedback";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioLink } from "./atoms/studio-link";
import { StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioStackPage, StudioStackSection } from "./atoms/studio-stack-page";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { useStudio } from "./studio-provider";

type ApiFailure = { error?: { message?: string; recovery?: string } };

type LuluVerification = {
  schemaVersion: "juw.atelier-adult-verification-evidence.v1";
  status: "VERIFIED" | "REVIEW_REQUIRED";
  canRecordReview: boolean;
  reviewBlockedReason: "ADMIN_REQUIRED" | "INDEPENDENT_REVIEWER_REQUIRED" | null;
  authorityRevision: string;
  authorityManifestSha256: string;
  verificationMethod: string | null;
  verifiedAt: string | null;
  expiresAt: string | null;
};

type LuluReviewCommand = {
  action: "RECORD_AUTHORIZED_HUMAN_REVIEW";
  expectedAuthorityRevision: string;
  expectedAuthorityManifestSha256: string;
  declarationVersion: "juw.atelier-authorized-human-review.v1";
  reviewedReliableAdultIdentityEvidence: true;
  matchedEvidenceToLuluAuthority: true;
  reviewedAt: string;
  idempotencyKey: string;
};

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return body as T;
  const failure = body as ApiFailure;
  throw new Error([failure.error?.message, failure.error?.recovery].filter(Boolean).join(" ") || "Studio could not save that model.");
}

function styling(model: StudioAuthorityModel) {
  const value = model.authority.styling;
  return {
    hair: value?.hair || "Natural, softly shaped",
    makeup: value?.makeup || "Fresh skin, quiet definition",
    direction: value?.direction || "Neutral posture, product first",
  };
}

function verificationDate(value: string | null) {
  if (!value) return "Not set";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

async function readLuluVerification(signal?: AbortSignal) {
  const response = await fetch("/api/studio/models/lulu/verification", {
    credentials: "same-origin",
    headers: { accept: "application/json" },
    signal,
  });
  return responseBody<{ verification: LuluVerification }>(response);
}

function LuluVerificationPanel() {
  const [verification, setVerification] = useState<LuluVerification | null>(null);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [reviewedEvidence, setReviewedEvidence] = useState(false);
  const [matchedAuthority, setMatchedAuthority] = useState(false);
  const pendingRef = useRef(false);
  const reviewCommandRef = useRef<LuluReviewCommand | null>(null);
  const reviewedEvidenceId = useId();
  const matchedAuthorityId = useId();

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      setLoading(true);
      setError("");
      try {
        const result = await readLuluVerification(controller.signal);
        setVerification(result.verification);
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError") return;
        setError(cause instanceof Error ? cause.message : "Lulu verification could not be read.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, []);

  async function recordReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!verification?.canRecordReview || !reviewedEvidence || !matchedAuthority || pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    const command = reviewCommandRef.current ?? {
      action: "RECORD_AUTHORIZED_HUMAN_REVIEW",
      expectedAuthorityRevision: verification.authorityRevision,
      expectedAuthorityManifestSha256: verification.authorityManifestSha256,
      declarationVersion: "juw.atelier-authorized-human-review.v1",
      reviewedReliableAdultIdentityEvidence: true,
      matchedEvidenceToLuluAuthority: true,
      reviewedAt: new Date().toISOString(),
      idempotencyKey: `lulu-review:${crypto.randomUUID()}`,
    } satisfies LuluReviewCommand;
    reviewCommandRef.current = command;
    try {
      const response = await fetch("/api/studio/models/lulu/verification", {
        body: JSON.stringify(command),
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
      const result = await responseBody<{ verification: LuluVerification }>(response);
      setVerification(result.verification);
      setReviewedEvidence(false);
      setMatchedAuthority(false);
      reviewCommandRef.current = null;
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The independent review could not be recorded.";
      try {
        const current = (await readLuluVerification()).verification;
        setVerification(current);
        if (current.status === "VERIFIED") {
          setReviewedEvidence(false);
          setMatchedAuthority(false);
          reviewCommandRef.current = null;
        } else {
          if (current.authorityRevision !== command.expectedAuthorityRevision
            || current.authorityManifestSha256 !== command.expectedAuthorityManifestSha256) {
            reviewCommandRef.current = null;
          }
          setError(message);
        }
      } catch {
        setError(message);
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  if (loading) return <p role="status">Checking durable verification…</p>;
  if (!verification) return <StudioFeedback detail={error} state="error" title="Verification unavailable" />;
  if (verification.status === "VERIFIED") return (
    <>
      <dl className="studio-model-facts">
        <div><dt>Adult verification</dt><dd>Verified</dd></div>
        <div><dt>Method</dt><dd>{verification.verificationMethod ?? "Authorized human review"}</dd></div>
        <div><dt>Verified</dt><dd>{verificationDate(verification.verifiedAt)}</dd></div>
        <div><dt>Expires</dt><dd>{verification.expiresAt ? verificationDate(verification.expiresAt) : "No expiry recorded"}</dd></div>
      </dl>
      {error ? <StudioFeedback detail={error} state="error" title="Verification refresh failed" /> : null}
    </>
  );

  if (!verification.canRecordReview) {
    const independentReviewerRequired = verification.reviewBlockedReason === "INDEPENDENT_REVIEWER_REQUIRED";
    return <StudioFeedback
      detail={independentReviewerRequired
        ? "Another Studio admin must review Lulu’s reliable adult identity evidence. Lulu cannot review her own authority."
        : "A Studio admin must review Lulu’s reliable adult identity evidence."}
      state="empty"
      title="Independent review required"
    />;
  }

  return (
    <form className="studio-form-grid studio-task-fields" onSubmit={recordReview}>
      <div className="studio-field studio-field-wide"><span>Independent review</span><small>You are eligible to record the authorized human review for this exact Lulu V4 authority.</small></div>
      <label className="studio-settings-switch studio-field-wide" htmlFor={reviewedEvidenceId}><span className="sr-only">Reliable adult identity evidence reviewed</span><span><strong>I reviewed reliable adult identity evidence</strong><small>This confirmation is about Lulu’s real evidence, not generated output.</small></span><input checked={reviewedEvidence} disabled={pending} id={reviewedEvidenceId} onChange={(event) => setReviewedEvidence(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label>
      <label className="studio-settings-switch studio-field-wide" htmlFor={matchedAuthorityId}><span className="sr-only">Evidence matched to Lulu authority</span><span><strong>I matched the evidence to Lulu V4 authority</strong><small>This binds the review to the current authority revision and manifest.</small></span><input checked={matchedAuthority} disabled={pending} id={matchedAuthorityId} onChange={(event) => setMatchedAuthority(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label>
      {error ? <StudioFeedback detail={error} state="error" title="Review not recorded" /> : null}
      <button className="button button-primary" disabled={pending || !reviewedEvidence || !matchedAuthority} type="submit">{pending ? "Recording review…" : "Record independent review"}</button>
    </form>
  );
}

function ModelTask({
  mode,
  model,
  onDismiss,
  onSaved,
  open,
  returnFocus,
}: {
  mode: "create" | "edit";
  model: StudioAuthorityModel | null;
  onDismiss(): void;
  onSaved(model: StudioAuthorityModel): void;
  open: boolean;
  returnFocus: HTMLElement | null;
}) {
  const currentStyling = model ? styling(model) : { hair: "", makeup: "", direction: "" };
  const [name, setName] = useState(model?.name ?? "");
  const [hair, setHair] = useState(currentStyling.hair);
  const [makeup, setMakeup] = useState(currentStyling.makeup);
  const [direction, setDirection] = useState(currentStyling.direction);
  const [licenseUrl, setLicenseUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const pendingRef = useRef(false);
  const authorityConfirmationId = useId();

  useEffect(() => {
    setName(model?.name ?? "");
    const next = model ? styling(model) : { hair: "", makeup: "", direction: "" };
    setHair(next.hair);
    setMakeup(next.makeup);
    setDirection(next.direction);
    setLicenseUrl("");
    setFile(null);
    setAuthorityConfirmed(false);
    setError("");
  }, [model, open]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setError("");
    try {
      if (mode === "create") {
        if (!file || !authorityConfirmed) throw new Error("Choose one adult model photo and confirm its usage authority.");
        const form = new FormData();
        form.set("name", name);
        form.set("licenseUrl", licenseUrl);
        form.set("authorityConfirmed", "true");
        form.set("file", file);
        const response = await fetch("/api/studio/models", { body: form, credentials: "same-origin", method: "POST" });
        const result = await responseBody<{ model: StudioAuthorityModel }>(response);
        onSaved(result.model);
      } else if (model) {
        const response = await fetch(`/api/studio/models/${model.id}`, {
          body: JSON.stringify({ action: "UPDATE", name, styling: { hair, makeup, direction } }),
          credentials: "same-origin",
          headers: { accept: "application/json", "content-type": "application/json" },
          method: "PATCH",
        });
        const result = await responseBody<{ model: StudioAuthorityModel }>(response);
        onSaved(result.model);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The model could not be saved.");
    } finally {
      pendingRef.current = false;
      setPending(false);
    }
  }

  return (
    <StudioTaskSheet busy={pending} busyLabel={mode === "create" ? "Adding model authority" : "Saving model styling"} eyebrow={mode === "create" ? "Model authority" : "Model styling"} onDismiss={onDismiss} onSubmit={save} open={open} returnFocus={returnFocus} title={mode === "create" ? "Add model" : `Edit ${model?.name ?? "model"}`}>
        <section className="studio-task-question">
          <h3>{mode === "create" ? "Who can wear the piece?" : "How should this model present it?"}</h3>
          <div className="studio-form-grid studio-task-fields">
            <label className="studio-field"><span>Model name</span><input autoComplete="off" disabled={pending} maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} /></label>
            {mode === "create" ? <>
              <label className="studio-field"><span>Adult model photo</span><input accept="image/jpeg,image/png,image/webp" disabled={pending} onChange={(event) => setFile(event.target.files?.[0] ?? null)} required type="file" /></label>
              <label className="studio-field studio-field-wide"><span>Usage source</span><input disabled={pending} inputMode="url" maxLength={500} onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://…" required type="url" value={licenseUrl} /></label>
              <label className="studio-settings-switch studio-field-wide" htmlFor={authorityConfirmationId}><span className="sr-only">Usage authority confirmed</span><span><strong>Usage authority confirmed</strong><small>I may use this adult photo for private Studio try-ons.</small></span><input checked={authorityConfirmed} disabled={pending} id={authorityConfirmationId} onChange={(event) => setAuthorityConfirmed(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label>
            </> : <>
              <label className="studio-field"><span>Hair</span><input disabled={pending} maxLength={120} onChange={(event) => setHair(event.target.value)} value={hair} /></label>
              <label className="studio-field"><span>Makeup</span><input disabled={pending} maxLength={120} onChange={(event) => setMakeup(event.target.value)} value={makeup} /></label>
              <label className="studio-field studio-field-wide"><span>Direction</span><textarea disabled={pending} maxLength={240} onChange={(event) => setDirection(event.target.value)} rows={3} value={direction} /></label>
            </>}
          </div>
        </section>
        {error ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}
        <footer className="studio-task-sheet-footer"><button className="button button-secondary" disabled={pending} onClick={onDismiss} type="button">Cancel</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Saving…" : mode === "create" ? "Add model" : "Save changes"}</button></footer>
    </StudioTaskSheet>
  );
}

export function ModelAtelier() {
  const { authority } = useStudio();
  const searchParams = useSearchParams();
  const intakeHandledRef = useRef(false);
  const requestedModelHandledRef = useRef("");
  const archivePendingRef = useRef(false);
  const models = authority.snapshot?.models ?? [];
  const authorityGeneratedAt = authority.snapshot?.generatedAt;
  const readyModels = models.filter((model) => model.state === "READY");
  const requestedModelId = searchParams.get("model")?.trim() ?? "";
  const requestedModel = readyModels.find((model) => model.id === requestedModelId);
  const requestedModelUnavailable = Boolean(
    requestedModelId && authority.status === "ready" && !requestedModel,
  );
  const [selectedId, setSelectedId] = useState("");
  const [task, setTask] = useState<"create" | "edit" | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selected = requestedModelUnavailable
    ? undefined
    : requestedModel
      ?? readyModels.find((model) => model.id === selectedId)
      ?? readyModels.find((model) => model.kind === "LULU_V3")
      ?? readyModels[0];
  const segments = [
    { key: "profile", label: "Profile" },
    { key: "styling", label: "Styling" },
    { key: "authority", label: "Authority" },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "profile");

  useEffect(() => {
    if (!requestedModelId && !selectedId && selected) setSelectedId(selected.id);
  }, [requestedModelId, selected, selectedId]);

  useEffect(() => {
    const requestKey = `${requestedModelId}:${authorityGeneratedAt ?? "unavailable"}`;
    if (!requestedModelId || authority.status !== "ready" || requestedModelHandledRef.current === requestKey) return;
    requestedModelHandledRef.current = requestKey;
    if (!requestedModel) return;
    setSelectedId(requestedModel.id);
    setError("");
  }, [authority.status, authorityGeneratedAt, requestedModel, requestedModelId]);

  useEffect(() => {
    if (searchParams.get("intake") !== "model") {
      intakeHandledRef.current = false;
      return;
    }
    if (intakeHandledRef.current || authority.status !== "ready") return;
    intakeHandledRef.current = true;
    setTask("create");
  }, [authority.status, searchParams]);

  function openTask(mode: "create" | "edit", focus: HTMLElement | null) {
    setReturnFocus(focus);
    setTask(mode);
    setError("");
  }

  function dismissTask() {
    if (window.location.search.includes("intake=model")) window.history.replaceState(window.history.state, "", "/studio/models");
    setTask(null);
  }

  async function archiveModel(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected || selected.kind === "LULU_V3" || archivePendingRef.current) return;
    archivePendingRef.current = true;
    setPending(true);
    setError("");
    try {
      const response = await fetch(`/api/studio/models/${selected.id}`, {
        body: JSON.stringify({ action: "ARCHIVE", reason: archiveReason }),
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "PATCH",
      });
      await responseBody<{ model: StudioAuthorityModel }>(response);
      setArchiveOpen(false);
      setArchiveReason("");
      setSelectedId("");
      await authority.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The model could not be archived.");
    } finally {
      archivePendingRef.current = false;
      setPending(false);
    }
  }

  if (authority.status === "idle" || authority.status === "loading") return <StudioLoadingStage label="Opening Models…" />;
  if (authority.status === "error" || !authority.snapshot) return <StudioStackPage className="studio-ops-page" kind="service"><StudioFeedback action={<button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button>} detail={authority.error} state="error" title="Models unavailable" /></StudioStackPage>;
  if (requestedModelUnavailable) return (
    <StudioStackPage className="studio-ops-page" kind="service">
      <StudioFeedback
        action={<StudioLink className="button button-secondary" href="/studio/models">Review ready models</StudioLink>}
        detail="The exact model from Ask Studio is not a current ready authority. Studio will not substitute Lulu, another model, or an archived record."
        state="error"
        title="Model not found"
      />
    </StudioStackPage>
  );

  return (
    <StudioStackPage className="studio-ops-page" kind="service">
      <h1 className="sr-only" id="models">Models</h1>
      {selected ? (
        <StudioLink className="studio-stack-current" href={`/studio/media/new?model=${encodeURIComponent(selected.id)}`}>
          <span><small>Media options</small><strong>Review media readiness</strong><LifecycleMeta state={selected.state === "READY" ? "READY" : "DRAFT"} /></span>
          <ArrowRight aria-hidden="true" size={18} />
        </StudioLink>
      ) : (
        <button className="studio-stack-current" onClick={(event) => openTask("create", event.currentTarget)} type="button">
          <span><small>Next</small><strong>Add model</strong></span>
          <Plus aria-hidden="true" size={18} />
        </button>
      )}

      <StudioSegmentedView active={activeView} label="Model workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      <StudioStackSection>
      <div className="studio-model-layout">
        <aside className="studio-model-index">
          <div className="studio-model-list" role="group" aria-label={`${readyModels.length} ready Studio models`}>{readyModels.map((model) => <button aria-pressed={selected?.id === model.id} className={selected?.id === model.id ? "studio-model-option is-selected" : "studio-model-option"} key={model.id} onClick={() => setSelectedId(model.id)} type="button"><span className="studio-model-avatar" aria-hidden="true"><UserRound size={21} /></span><span><strong>{model.name}</strong><LifecycleMeta state="READY" /></span></button>)}</div>
          <button className="studio-model-create" onClick={(event) => openTask("create", event.currentTarget)} type="button"><Plus aria-hidden="true" size={18} /><span><strong>Add model</strong></span><ChevronRight aria-hidden="true" size={16} /></button>
        </aside>

        {selected ? <div className={`studio-model-stage${activeView === "profile" ? "" : " is-panel-only"}`}>
          {activeView === "profile" ? <div className={`studio-model-portrait${selected.kind === "LULU_V3" ? " is-approved" : ""}`}><img alt={`${selected.name}, current Studio model preview`} className="studio-model-approved-image" height={selected.previewHeight ?? 1619} src={selected.previewAssetUrl ?? selected.sourceAssetUrl} width={selected.previewWidth ?? 972} /><div className="studio-model-master-caption"><small>{selected.kind === "LULU_V3" ? "Lulu V4 · current authority" : "Usage confirmed"}</small><strong>{selected.name}</strong><span>{selected.kind === "LULU_V3" ? "Face and body authority synced" : "Approved for Studio reference"}</span></div></div> : null}
          <StudioStackSection
            aria-labelledby={`studio-tab-${activeView}`}
            className="studio-model-profile studio-stack-panel"
            id={`studio-view-${activeView}`}
            meta={<LifecycleMeta state={selected.state === "READY" ? "READY" : "DRAFT"} />}
            role="tabpanel"
            title={selected.name}
          >
            {activeView === "styling" ? <dl className="studio-model-facts"><div><dt>Hair</dt><dd>{styling(selected).hair}</dd></div><div><dt>Makeup</dt><dd>{styling(selected).makeup}</dd></div><div><dt>Direction</dt><dd>{styling(selected).direction}</dd></div></dl> : null}
            {activeView === "authority" ? <><dl className="studio-model-facts"><div><dt>Version</dt><dd>{selected.kind === "LULU_V3" ? "Lulu V4" : selected.authorityRevision ?? "Authorized model"}</dd></div><div><dt>Confirmed</dt><dd>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(selected.authorityConfirmedAt))}</dd></div><div><dt>Source</dt><dd>{selected.licenseUrl ? <a href={selected.licenseUrl} rel="noreferrer" target="_blank">Open usage source</a> : "Lulu private authority"}</dd></div><div><dt>Allowed</dt><dd>{String(selected.authority.allowedUse ?? "Private Studio try-on generation")}</dd></div><div><dt>Restricted</dt><dd>{String(selected.authority.restrictedUse ?? "No public use without separate approval")}</dd></div></dl>{selected.kind === "LULU_V3" ? <LuluVerificationPanel /> : null}</> : null}
            <div className="studio-model-profile-actions">{selected.kind === "LULU_V3" && activeView === "profile" ? <div className="studio-model-lock-note"><Lock aria-hidden="true" size={16} /><span><strong>Lulu V4 stays consistent.</strong><small>Face, body and rear authorities move together.</small></span></div> : selected.kind !== "LULU_V3" && activeView === "styling" ? <button className="button button-primary" onClick={(event) => openTask("edit", event.currentTarget)} type="button"><Pencil aria-hidden="true" size={16} />Edit styling</button> : selected.kind !== "LULU_V3" && activeView === "authority" ? <button className="button button-secondary" onClick={(event) => { setReturnFocus(event.currentTarget); setArchiveOpen(true); }} type="button"><Archive aria-hidden="true" size={16} />Withdraw</button> : null}</div>
          </StudioStackSection>
        </div> : <StudioFeedback action={<button className="button button-primary" onClick={(event) => openTask("create", event.currentTarget)} type="button">Add model</button>} state="empty" title="No model authority" />}
      </div>
      </StudioStackSection>

      <ModelTask key={`${task ?? "closed"}-${selected?.id ?? "none"}`} mode={task ?? "create"} model={task === "edit" ? selected ?? null : null} onDismiss={dismissTask} onSaved={async (model) => { setSelectedId(model.id); setTask(null); await authority.refresh(); }} open={Boolean(task)} returnFocus={returnFocus} />

      <StudioTaskSheet busy={pending} busyLabel="Withdrawing model authority" eyebrow="Withdraw authority" onDismiss={() => setArchiveOpen(false)} onSubmit={archiveModel} open={archiveOpen} returnFocus={returnFocus} title={selected ? `Withdraw ${selected.name}` : "Withdraw model"}><section className="studio-task-question"><h3>Stop using this model?</h3><p>Existing generated media stays in history. New try-ons will no longer offer this model.</p><label className="studio-field"><span>Reason</span><textarea disabled={pending} maxLength={240} onChange={(event) => setArchiveReason(event.target.value)} required rows={3} value={archiveReason} /></label></section>{error ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}<footer className="studio-task-sheet-footer"><button className="button button-secondary" disabled={pending} onClick={() => setArchiveOpen(false)} type="button">Keep model</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Withdrawing…" : "Withdraw authority"}</button></footer></StudioTaskSheet>
    </StudioStackPage>
  );
}
