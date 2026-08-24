"use client";

/* Private Studio model assets use protected runtime URLs. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Archive,
  ArrowRight,
  ChevronRight,
  CircleAlert,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import type { StudioAuthorityModel } from "../../lib/studio/services/studio-authority-client";
import { APPROVED_PUBLIC_MODEL_PREVIEW } from "../../lib/studio/projections/approved-catalogue";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { StudioLink } from "./atoms/studio-link";
import { StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { useStudio } from "./studio-provider";

type ApiFailure = { error?: { message?: string; recovery?: string } };

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
      setPending(false);
    }
  }

  return (
    <StudioTaskSheet eyebrow={mode === "create" ? "Model authority" : "Model styling"} onDismiss={onDismiss} open={open} returnFocus={returnFocus} title={mode === "create" ? "Add model" : `Edit ${model?.name ?? "model"}`}>
      <form className="studio-task-sheet-body" onSubmit={save}>
        <section className="studio-task-question">
          <h3>{mode === "create" ? "Who can wear the piece?" : "How should this model present it?"}</h3>
          <div className="studio-form-grid studio-task-fields">
            <label className="studio-field"><span>Model name</span><input autoComplete="off" maxLength={80} onChange={(event) => setName(event.target.value)} required value={name} /></label>
            {mode === "create" ? <>
              <label className="studio-field"><span>Adult model photo</span><input accept="image/jpeg,image/png,image/webp" onChange={(event) => setFile(event.target.files?.[0] ?? null)} required type="file" /></label>
              <label className="studio-field studio-field-wide"><span>Usage source</span><input inputMode="url" maxLength={500} onChange={(event) => setLicenseUrl(event.target.value)} placeholder="https://…" required type="url" value={licenseUrl} /></label>
              <label className="studio-settings-switch studio-field-wide" htmlFor={authorityConfirmationId}><span className="sr-only">Usage authority confirmed</span><span><strong>Usage authority confirmed</strong><small>I may use this adult photo for private Studio try-ons.</small></span><input checked={authorityConfirmed} id={authorityConfirmationId} onChange={(event) => setAuthorityConfirmed(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label>
            </> : <>
              <label className="studio-field"><span>Hair</span><input maxLength={120} onChange={(event) => setHair(event.target.value)} value={hair} /></label>
              <label className="studio-field"><span>Makeup</span><input maxLength={120} onChange={(event) => setMakeup(event.target.value)} value={makeup} /></label>
              <label className="studio-field studio-field-wide"><span>Direction</span><textarea maxLength={240} onChange={(event) => setDirection(event.target.value)} rows={3} value={direction} /></label>
            </>}
          </div>
        </section>
        {error ? <p className="studio-task-error" role="alert">{error}</p> : null}
        <footer className="studio-task-sheet-footer"><button className="button button-secondary" onClick={onDismiss} type="button">Cancel</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Saving…" : mode === "create" ? "Add model" : "Save changes"}</button></footer>
      </form>
    </StudioTaskSheet>
  );
}

export function ModelAtelier() {
  const { authority } = useStudio();
  const searchParams = useSearchParams();
  const intakeHandledRef = useRef(false);
  const models = authority.snapshot?.models ?? [];
  const readyModels = models.filter((model) => model.state === "READY");
  const [selectedId, setSelectedId] = useState("");
  const [task, setTask] = useState<"create" | "edit" | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLElement | null>(null);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [archiveReason, setArchiveReason] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const selected = readyModels.find((model) => model.id === selectedId)
    ?? readyModels.find((model) => model.kind === "LULU_V3")
    ?? readyModels[0]
    ?? models[0];
  const segments = [
    { key: "profile", label: "Profile" },
    { key: "styling", label: "Styling" },
    { key: "authority", label: "Authority" },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "profile");

  useEffect(() => {
    if (!selectedId && selected) setSelectedId(selected.id);
  }, [selected, selectedId]);

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
    if (!selected || selected.kind === "LULU_V3") return;
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
      setPending(false);
    }
  }

  if (authority.status === "idle" || authority.status === "loading") return <div className="studio-loading" role="status">Opening model atelier…</div>;
  if (authority.status === "error" || !authority.snapshot) return <div className="studio-quiet-empty" role="alert"><CircleAlert aria-hidden="true" size={24} /><div><strong>Models unavailable</strong><p>{authority.error}</p></div><button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button></div>;

  return (
    <div className="studio-ops-page">
      <h1 className="sr-only" id="models">Models</h1>
      {selected ? (
        <StudioLink className="studio-stack-current" href={`/studio/media/new?model=${encodeURIComponent(selected.id)}`}>
          <span><small>Continue</small><strong>Create with {selected.name}</strong></span>
          <LifecycleBadge state={selected.state === "READY" ? "READY" : "DRAFT"} />
          <ArrowRight aria-hidden="true" size={18} />
        </StudioLink>
      ) : (
        <button className="studio-stack-current" onClick={(event) => openTask("create", event.currentTarget)} type="button">
          <span><small>Next</small><strong>Add model</strong></span>
          <Plus aria-hidden="true" size={18} />
        </button>
      )}

      <StudioSegmentedView active={activeView} label="Model workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      <div className="studio-model-layout">
        <aside className="studio-model-index">
          <div className="studio-index-heading"><span>Models</span><strong>{readyModels.length}</strong></div>
          <div className="studio-model-list" role="group" aria-label="Studio models">{readyModels.map((model) => <button aria-pressed={selected?.id === model.id} className={selected?.id === model.id ? "studio-model-option is-selected" : "studio-model-option"} key={model.id} onClick={() => setSelectedId(model.id)} type="button"><span className="studio-model-avatar" aria-hidden="true"><UserRound size={21} /></span><span><strong>{model.name}</strong><small>{model.kind === "LULU_V3" ? "Approved default" : "Authority confirmed"}</small></span><LifecycleBadge state="READY" /></button>)}</div>
          <button className="studio-model-create" onClick={(event) => openTask("create", event.currentTarget)} type="button"><Plus aria-hidden="true" size={18} /><span><strong>Add another model</strong><small>Photo and usage source required</small></span><ChevronRight aria-hidden="true" size={16} /></button>
        </aside>

        {selected ? <div className={`studio-model-stage${activeView === "profile" ? "" : " is-panel-only"}`}>
          {activeView === "profile" ? <div className={`studio-model-portrait${selected.kind === "LULU_V3" ? " is-approved" : ""}`}><img alt={`${selected.name}, private approved model authority`} className="studio-model-approved-image" height={1619} src={selected.kind === "LULU_V3" ? APPROVED_PUBLIC_MODEL_PREVIEW.src : selected.sourceAssetUrl} width={972} /><span className="studio-model-anchor-badge"><ShieldCheck aria-hidden="true" size={17} /><span><small>{selected.kind === "LULU_V3" ? "Approved V3 profile" : "Usage confirmed"}</small><strong>{selected.name}</strong></span></span><div className="studio-model-master-caption"><small>Private model authority</small><strong>{selected.name}</strong><span>Ready for try-ons</span></div></div> : null}
          <section className="studio-model-profile studio-stack-panel" role="tabpanel">
            <div className="studio-editor-heading"><div><p className="eyebrow">{selected.kind === "LULU_V3" ? "Approved default" : "Model profile"}</p><h2>{selected.name}</h2></div><LifecycleBadge state={selected.state === "READY" ? "READY" : "DRAFT"} /></div>
            {activeView === "profile" ? <div className="studio-approved-prefill" role="note"><ShieldCheck aria-hidden="true" size={18} /><span><strong>Ready for private Wear work</strong><small>Authority confirmed {new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(selected.authorityConfirmedAt))}</small></span></div> : null}
            {activeView === "styling" ? <section className="studio-model-profile-section"><div className="studio-profile-section-heading"><div><p className="eyebrow">Styling</p><h3>How {selected.name} presents the clothes</h3></div></div><dl className="studio-model-facts"><div><dt>Hair</dt><dd>{styling(selected).hair}</dd></div><div><dt>Makeup</dt><dd>{styling(selected).makeup}</dd></div><div><dt>Direction</dt><dd>{styling(selected).direction}</dd></div></dl></section> : null}
            {activeView === "authority" ? <section className="studio-model-profile-section"><div className="studio-profile-section-heading"><div><p className="eyebrow">Authority</p><h3>Evidence and limits</h3></div><ShieldCheck aria-label="Confirmed" size={18} /></div><dl className="studio-model-facts"><div><dt>Source</dt><dd>{selected.licenseUrl ? <a href={selected.licenseUrl} rel="noreferrer" target="_blank">Open usage source</a> : "Lulu private authority"}</dd></div><div><dt>Allowed</dt><dd>{String(selected.authority.allowedUse ?? "Private Studio try-on generation")}</dd></div><div><dt>Restricted</dt><dd>{String(selected.authority.restrictedUse ?? "No public use without separate approval")}</dd></div></dl></section> : null}
            <div className="studio-model-profile-actions">{selected.kind === "LULU_V3" ? <div className="studio-model-lock-note"><Lock aria-hidden="true" size={16} /><span><strong>Lulu stays consistent.</strong><small>Add another model for a different identity.</small></span></div> : <div className="studio-inventory-decision-grid"><button className="button button-primary" onClick={(event) => openTask("edit", event.currentTarget)} type="button"><Pencil aria-hidden="true" size={16} />Edit styling</button><button className="button button-secondary" onClick={(event) => { setReturnFocus(event.currentTarget); setArchiveOpen(true); }} type="button"><Archive aria-hidden="true" size={16} />Withdraw</button></div>}</div>
          </section>
        </div> : <div className="studio-quiet-empty"><UserRound aria-hidden="true" size={24} /><div><strong>No model authority yet</strong><p>Add one adult photo and its usage source.</p></div></div>}
      </div>

      <ModelTask key={`${task ?? "closed"}-${selected?.id ?? "none"}`} mode={task ?? "create"} model={task === "edit" ? selected ?? null : null} onDismiss={dismissTask} onSaved={async (model) => { setSelectedId(model.id); setTask(null); await authority.refresh(); }} open={Boolean(task)} returnFocus={returnFocus} />

      <StudioTaskSheet eyebrow="Withdraw authority" onDismiss={() => setArchiveOpen(false)} open={archiveOpen} returnFocus={returnFocus} title={selected ? `Withdraw ${selected.name}` : "Withdraw model"}><form className="studio-task-sheet-body" onSubmit={archiveModel}><section className="studio-task-question"><h3>Stop using this model?</h3><p>Existing generated media stays in history. New try-ons will no longer offer this model.</p><label className="studio-field"><span>Reason</span><textarea maxLength={240} onChange={(event) => setArchiveReason(event.target.value)} required rows={3} value={archiveReason} /></label></section>{error ? <p className="studio-task-error" role="alert">{error}</p> : null}<footer className="studio-task-sheet-footer"><button className="button button-secondary" onClick={() => setArchiveOpen(false)} type="button">Keep model</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Withdrawing…" : "Withdraw authority"}</button></footer></form></StudioTaskSheet>
    </div>
  );
}
