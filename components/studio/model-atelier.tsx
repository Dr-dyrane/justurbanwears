"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CheckCircle2,
  ChevronRight,
  Lock,
  Pencil,
  Plus,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import type { StudioModel } from "../../lib/studio/domain/entities";
import { modelReadiness } from "../../lib/studio/domain/readiness";
import { LULU_NEUTRAL_MASTER_PROFILE } from "../../lib/studio/domain/state";
import { APPROVED_PUBLIC_MODEL_ANCHOR } from "../../lib/studio/projections/approved-catalogue";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { ReadinessList } from "./atoms/readiness-list";
import { StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { useStudio } from "./studio-provider";

type ModelTaskStep = "name" | "styling" | "readiness" | "review" | "receipt";

interface ModelTaskDraft {
  name: string;
  hair: string;
  makeup: string;
  direction: string;
  identityApproved: boolean;
  consentConfirmed: boolean;
}

interface ModelTask {
  mode: "create" | "edit";
  modelId?: string;
  draft: ModelTaskDraft;
  origin: "query" | "trigger";
  returnFocus: HTMLElement | null;
}

const taskSteps: ModelTaskStep[] = ["name", "styling", "readiness", "review"];

function modelDraft(model?: StudioModel): ModelTaskDraft {
  if (model) {
    return {
      name: model.name,
      hair: model.styling.hair,
      makeup: model.styling.makeup,
      direction: model.styling.direction,
      identityApproved: model.readiness.identityApproved,
      consentConfirmed: model.readiness.consentConfirmed,
    };
  }

  return {
    name: "",
    hair: LULU_NEUTRAL_MASTER_PROFILE.styling.hair,
    makeup: LULU_NEUTRAL_MASTER_PROFILE.styling.makeup,
    direction: LULU_NEUTRAL_MASTER_PROFILE.styling.direction,
    identityApproved: false,
    consentConfirmed: false,
  };
}

function ModelTaskSheet({
  onDismiss,
  onSelect,
  task,
}: {
  onDismiss(): void;
  onSelect(id: string): void;
  task: ModelTask | null;
}) {
  const { createModel, models, updateModel } = useStudio();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const questionRef = useRef<HTMLHeadingElement>(null);
  const [draft, setDraft] = useState<ModelTaskDraft>(() => task?.draft ?? modelDraft());
  const [step, setStep] = useState<ModelTaskStep>("name");
  const [editingFromReview, setEditingFromReview] = useState(false);
  const [error, setError] = useState("");
  const [receiptState, setReceiptState] = useState<"DRAFT" | "READY">("DRAFT");

  useEffect(() => {
    if (!task) return;
    const dialog = dialogRef.current;
    const bodyOverflow = document.body.style.overflow;
    const documentOverflow = document.documentElement.style.overflow;
    const closeFromBackdrop = (event: MouseEvent) => {
      if (!dialog || event.target !== dialog) return;
      const bounds = dialog.getBoundingClientRect();
      const outside = event.clientX < bounds.left
        || event.clientX > bounds.right
        || event.clientY < bounds.top
        || event.clientY > bounds.bottom;
      if (outside) dialog.close();
    };
    const closeWhenQueryLeaves = () => {
      if (task.origin !== "query") return;
      const params = new URLSearchParams(window.location.search);
      if (params.get("intake") !== "model") dialog?.close();
    };

    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    dialog?.addEventListener("click", closeFromBackdrop);
    window.addEventListener("popstate", closeWhenQueryLeaves);
    if (dialog && !dialog.open) dialog.showModal();
    requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));

    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = documentOverflow;
      dialog?.removeEventListener("click", closeFromBackdrop);
      window.removeEventListener("popstate", closeWhenQueryLeaves);
    };
  }, [task]);

  useEffect(() => {
    if (!task) return;
    requestAnimationFrame(() => questionRef.current?.focus({ preventScroll: true }));
  }, [step, task]);

  if (!task) {
    return <dialog className="studio-intake-sheet studio-model-task-sheet" ref={dialogRef} />;
  }

  const activeIndex = taskSteps.indexOf(step);
  const progress = step === "receipt" || editingFromReview
    ? 100
    : Math.round(((Math.max(activeIndex, 0) + 1) / taskSteps.length) * 100);
  const stylingComplete = Boolean(draft.hair.trim() && draft.makeup.trim() && draft.direction.trim());
  const ready = stylingComplete && draft.identityApproved && draft.consentConfirmed;

  function close() {
    dialogRef.current?.close();
  }

  function validateName() {
    const name = draft.name.trim();
    if (!name) {
      setError("Add the name Studio should use.");
      return false;
    }
    const duplicate = models.some((model) => (
      model.id !== task?.modelId
      && model.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase()
    ));
    if (duplicate) {
      setError("That model name is already in Studio.");
      return false;
    }
    setError("");
    return true;
  }

  function enterStep(next: ModelTaskStep, fromReview = false) {
    setError("");
    setEditingFromReview(fromReview);
    setStep(next);
  }

  function advance() {
    if (step === "name" && !validateName()) return;
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep("review");
      return;
    }
    if (step === "name") setStep("styling");
    if (step === "styling") setStep("readiness");
    if (step === "readiness") setStep("review");
    if (step === "review") save();
  }

  function back() {
    if (editingFromReview) {
      setEditingFromReview(false);
      setStep("review");
      return;
    }
    const previous = taskSteps[Math.max(0, activeIndex - 1)];
    if (previous) setStep(previous);
  }

  function save() {
    if (!validateName()) {
      setEditingFromReview(true);
      setStep("name");
      return;
    }
    const update = {
      name: draft.name,
      styling: {
        hair: draft.hair,
        makeup: draft.makeup,
        direction: draft.direction,
      },
      readiness: {
        identityApproved: draft.identityApproved,
        consentConfirmed: draft.consentConfirmed,
        stylingComplete,
      },
    };

    if (task.mode === "create") {
      const id = createModel({ name: draft.name });
      if (!id) {
        setError("Studio could not create this model. Check the name and try again.");
        setStep("name");
        return;
      }
      updateModel(id, update);
      onSelect(id);
    } else if (task.modelId) {
      updateModel(task.modelId, update);
      onSelect(task.modelId);
    }

    setReceiptState(ready ? "READY" : "DRAFT");
    setStep("receipt");
    setEditingFromReview(false);
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (step !== "receipt") advance();
  }

  return (
    <dialog
      aria-labelledby="studio-model-task-title"
      aria-modal="true"
      className="studio-intake-sheet studio-model-task-sheet"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      onClose={() => {
        onDismiss();
        task.returnFocus?.focus({ preventScroll: true });
      }}
      ref={dialogRef}
    >
      <form onSubmit={submit}>
        <header className="studio-task-sheet-header">
          <div className="studio-task-sheet-leading">
            {(editingFromReview || step !== "name") && step !== "receipt" ? (
              <button aria-label="Back" className="studio-icon-action" onClick={back} type="button">
                <ArrowLeft aria-hidden="true" size={20} />
              </button>
            ) : null}
            <div>
              <p className="eyebrow">Model intake</p>
              <h2 id="studio-model-task-title">{task.mode === "create" ? "Add model" : `Edit ${task.draft.name}`}</h2>
            </div>
          </div>
          <button aria-label="Close model intake" className="studio-icon-action" onClick={close} ref={closeButtonRef} type="button">
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        {step !== "receipt" ? (
          <div className="studio-task-progress" aria-label={`Model intake ${progress}% complete`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}>
            <span style={{ width: `${progress}%` }} />
          </div>
        ) : null}

        <div className="studio-task-sheet-body">
          {step === "name" ? (
            <section className="studio-task-question">
              <p className="eyebrow">Name</p>
              <h3 ref={questionRef} tabIndex={-1}>What should Studio call this model?</h3>
              <p>Use the working name you will recognise when preparing a listing.</p>
              <label className="studio-field studio-task-primary-field">
                <span>Model name</span>
                <input
                  aria-describedby={error ? "studio-model-task-error" : undefined}
                  aria-invalid={Boolean(error)}
                  autoComplete="off"
                  onChange={(event) => { setDraft((current) => ({ ...current, name: event.target.value })); setError(""); }}
                  placeholder="Model name"
                  value={draft.name}
                />
              </label>
            </section>
          ) : null}

          {step === "styling" ? (
            <section className="studio-task-question">
              <p className="eyebrow">Styling</p>
              <h3 ref={questionRef} tabIndex={-1}>How should this model present the clothes?</h3>
              <p>Studio starts with Lulu’s quiet, product-first direction. Change only what this model needs.</p>
              <div className="studio-form-grid studio-task-fields">
                <label className="studio-field"><span>Hair direction</span><input value={draft.hair} onChange={(event) => setDraft((current) => ({ ...current, hair: event.target.value }))} /></label>
                <label className="studio-field"><span>Makeup direction</span><input value={draft.makeup} onChange={(event) => setDraft((current) => ({ ...current, makeup: event.target.value }))} /></label>
                <label className="studio-field studio-field-wide"><span>Presentation direction</span><textarea rows={4} value={draft.direction} onChange={(event) => setDraft((current) => ({ ...current, direction: event.target.value }))} /></label>
              </div>
            </section>
          ) : null}

          {step === "readiness" ? (
            <section className="studio-task-question">
              <p className="eyebrow">Readiness</p>
              <h3 ref={questionRef} tabIndex={-1}>What is already cleared?</h3>
              <p>You can save a draft now and finish approval later.</p>
              <fieldset className="studio-readiness-controls studio-task-readiness">
                <legend className="sr-only">Model readiness</legend>
                <label className={draft.identityApproved ? "is-checked" : undefined}>
                  <input type="checkbox" checked={draft.identityApproved} onChange={(event) => setDraft((current) => ({ ...current, identityApproved: event.target.checked }))} />
                  <span><ShieldCheck aria-hidden="true" size={19} /><strong>Identity approved</strong><small>The controlled identity set is ready for Studio use</small></span>
                </label>
                <label className={draft.consentConfirmed ? "is-checked" : undefined}>
                  <input type="checkbox" checked={draft.consentConfirmed} onChange={(event) => setDraft((current) => ({ ...current, consentConfirmed: event.target.checked }))} />
                  <span><Check aria-hidden="true" size={19} /><strong>Commercial use confirmed</strong><small>The current Studio use is cleared</small></span>
                </label>
              </fieldset>
            </section>
          ) : null}

          {step === "review" ? (
            <section className="studio-task-question studio-task-review">
              <p className="eyebrow">Review</p>
              <h3 ref={questionRef} tabIndex={-1}>Save this model profile?</h3>
              <p>{ready ? "Everything needed for listings is ready." : "This profile will stay in draft until every readiness item is complete."}</p>
              <div className="studio-review-rows">
                <button onClick={() => enterStep("name", true)} type="button"><span><small>Name</small><strong>{draft.name || "Not added"}</strong></span><Pencil aria-hidden="true" size={16} /></button>
                <button onClick={() => enterStep("styling", true)} type="button"><span><small>Styling</small><strong>{stylingComplete ? "Product direction set" : "Needs direction"}</strong></span><Pencil aria-hidden="true" size={16} /></button>
                <button onClick={() => enterStep("readiness", true)} type="button"><span><small>Readiness</small><strong>{ready ? "Ready for listings" : "Save as draft"}</strong></span><Pencil aria-hidden="true" size={16} /></button>
              </div>
            </section>
          ) : null}

          {step === "receipt" ? (
            <section className="studio-task-receipt" aria-live="polite" role="status">
              <div className="studio-model-receipt-visual" aria-hidden="true">
                <span><UserRound size={52} strokeWidth={1.2} /></span>
                <small>{receiptState === "READY" ? "Ready" : "Draft"}</small>
              </div>
              <div className="studio-receipt-copy">
                <span><CheckCircle2 aria-hidden="true" size={24} /></span>
                <p className="eyebrow">Saved</p>
                <h3 ref={questionRef} tabIndex={-1}>{draft.name} is in Studio.</h3>
                <p>{receiptState === "READY" ? "Ready for approved try-ons." : "Saved privately. Finish approval when ready."}</p>
                <div className="studio-receipt-state"><LifecycleBadge state={receiptState} /><small>Private Studio profile</small></div>
              </div>
            </section>
          ) : null}

          <p className="studio-task-error" id="studio-model-task-error" role={error ? "alert" : undefined}>{error}</p>
        </div>

        <footer className="studio-task-sheet-footer">
          {step === "receipt" ? (
            <button className="button button-primary" onClick={close} type="button">Done</button>
          ) : (
            <>
              <button className="button button-secondary" onClick={close} type="button">Cancel</button>
              <button className="button button-primary" type="submit">
                {step === "review" ? (task.mode === "create" ? "Add model" : "Save changes") : editingFromReview ? "Done" : "Continue"}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}

function ModelProfile({ model, onEdit, view }: { model: StudioModel; onEdit(event: React.MouseEvent<HTMLButtonElement>): void; view: string }) {
  const gates = modelReadiness(model);
  return (
    <section className="studio-model-profile studio-stack-panel" id={`studio-view-${view}`} aria-labelledby={`studio-tab-${view}`} role="tabpanel">
      <div className="studio-editor-heading">
        <div>
          <p className="eyebrow">{model.isDefault ? "Approved default" : "Model profile"}</p>
          <h2 id="studio-model-profile-title">{model.name}</h2>
        </div>
        <LifecycleBadge state={model.state} />
      </div>

      {view === "profile" && model.isDefault ? (
        <div className="studio-approved-prefill" role="note">
          <ShieldCheck aria-hidden="true" size={18} strokeWidth={1.8} />
          <span><strong>Lulu approved profile</strong><small>Approved portrait and product-first direction</small></span>
        </div>
      ) : null}

      {view === "styling" ? <section className="studio-model-profile-section" id="model-styling" aria-labelledby="studio-model-styling-title">
        <div className="studio-profile-section-heading"><div><p className="eyebrow">Styling</p><h3 id="studio-model-styling-title">How {model.name} presents the clothes</h3></div>{model.isDefault ? <span><Lock aria-hidden="true" size={14} />Approved profile</span> : null}</div>
        <dl className="studio-model-facts">
          <div><dt>Hair</dt><dd>{model.styling.hair || "Not set"}</dd></div>
          <div><dt>Makeup</dt><dd>{model.styling.makeup || "Not set"}</dd></div>
          <div><dt>Direction</dt><dd>{model.styling.direction || "Not set"}</dd></div>
        </dl>
      </section> : null}

      {view === "readiness" ? <section className="studio-model-profile-section" id="model-readiness" aria-labelledby="studio-model-readiness-title">
        <div className="studio-profile-section-heading"><div><p className="eyebrow">Readiness</p><h3 id="studio-model-readiness-title">{model.state === "READY" ? "Ready for listings" : "What still needs attention"}</h3></div><strong>{model.completeness}%</strong></div>
        <ReadinessList gates={gates} />
      </section> : null}

      <div className="studio-model-profile-actions">
        {model.isDefault ? (
          <div className="studio-model-lock-note"><Lock aria-hidden="true" size={16} /><span><strong>Lulu stays consistent.</strong><small>Add another model for a different identity or styling profile.</small></span></div>
        ) : (
          <button className="button button-primary" onClick={onEdit} type="button"><Pencil aria-hidden="true" size={16} />Edit model</button>
        )}
      </div>
    </section>
  );
}

export function ModelAtelier() {
  const { models, defaultModelId, hydration } = useStudio();
  const searchParams = useSearchParams();
  const intakeHandledRef = useRef(false);
  const [selectedId, setSelectedId] = useState(defaultModelId);
  const [task, setTask] = useState<ModelTask | null>(null);
  const selected = models.find((model) => model.id === selectedId)
    ?? models.find((model) => model.id === defaultModelId)
    ?? models[0];
  const modelSegments = [
    { key: "profile", label: "Profile" },
    { key: "styling", label: "Styling" },
    { key: "readiness", label: "Readiness", count: selected?.completeness },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(modelSegments, "profile");

  useEffect(() => {
    if (searchParams.get("intake") !== "model") {
      intakeHandledRef.current = false;
      return;
    }
    if (intakeHandledRef.current || hydration === "idle" || hydration === "restoring") return;
    intakeHandledRef.current = true;
    const frame = window.requestAnimationFrame(() => {
      setTask({ mode: "create", draft: modelDraft(), origin: "query", returnFocus: null });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [hydration, searchParams]);

  function openCreate(returnFocus: HTMLElement | null) {
    setTask({ mode: "create", draft: modelDraft(), origin: "trigger", returnFocus });
  }

  function openEdit(model: StudioModel, returnFocus: HTMLElement | null) {
    setTask({ mode: "edit", modelId: model.id, draft: modelDraft(model), origin: "trigger", returnFocus });
  }

  function dismissTask() {
    if (window.location.search.includes("intake=model")) {
      window.history.replaceState(window.history.state, "", "/studio/models");
    }
    setTask(null);
  }

  if (hydration === "idle" || hydration === "restoring" || !selected) {
    return <div className="studio-loading" role="status">Opening model atelier…</div>;
  }

  return (
    <div className="studio-ops-page">
      <header className="studio-ops-heading" id="models">
        <div><p className="eyebrow">Model atelier</p><h1>Choose who wears the piece.</h1><p>Lulu is your approved default. Add another model only when you need a distinct identity or styling profile.</p></div>
        <div className="studio-model-heading-actions">
          <span className="studio-private-chip"><ShieldCheck aria-hidden="true" size={15} />Private readiness only</span>
          <button className="button button-primary" onClick={(event) => openCreate(event.currentTarget)} type="button"><Plus aria-hidden="true" size={17} />Add model</button>
        </div>
      </header>

      <StudioSegmentedView active={activeView} label="Model workspace" onSelect={selectView} pending={viewPending} segments={modelSegments} />

      <div className="studio-model-layout">
        <aside className="studio-model-index">
          <div className="studio-index-heading"><span>Models</span><strong>{models.length}</strong></div>
          <div className="studio-model-list" role="group" aria-label="Studio models">
            {models.map((model) => (
              <button
                aria-pressed={selected.id === model.id}
                className={selected.id === model.id ? "studio-model-option is-selected" : "studio-model-option"}
                key={model.id}
                onClick={() => setSelectedId(model.id)}
                type="button"
              >
                <span className="studio-model-avatar" aria-hidden="true"><UserRound size={21} strokeWidth={1.6} /></span>
                <span><strong>{model.name}</strong><small>{model.isDefault ? "Approved default" : `${model.completeness}% ready`}</small></span>
                <LifecycleBadge state={model.state} />
              </button>
            ))}
          </div>
          <button className="studio-model-create" id="new-model" onClick={(event) => openCreate(event.currentTarget)} type="button"><Plus aria-hidden="true" size={18} /><span><strong>Add another model</strong><small>Guided name, styling and readiness</small></span><ChevronRight aria-hidden="true" size={16} /></button>
        </aside>
        <div className={`studio-model-stage${activeView === "profile" ? "" : " is-panel-only"}`}>
          {activeView === "profile" ? <div className={`studio-model-portrait${selected.isDefault ? " is-approved" : ""}`}>
            {selected.isDefault ? (
              <>
                {/* Approved public projection only; no private source image enters this bundle. */}
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={`${selected.name}, approved Studio identity profile`}
                  className="studio-model-approved-image"
                  height={1619}
                  src={APPROVED_PUBLIC_MODEL_ANCHOR.src}
                  width={972}
                />
                <span className="studio-model-anchor-badge">
                  <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
                  <span><small>Approved profile</small><strong>Lulu</strong></span>
                </span>
                <div className="studio-model-master-caption">
                  <small>Studio identity profile</small>
                  <strong>{selected.name}</strong>
                  <span>Ready for approved try-ons</span>
                </div>
              </>
            ) : (
              <>
                <span aria-hidden="true"><Sparkles size={22} strokeWidth={1.5} /></span>
                <div className="studio-model-silhouette" aria-hidden="true"><i /><b /></div>
                <small>{selected.version}</small>
              </>
            )}
          </div> : null}
          <ModelProfile model={selected} onEdit={(event) => openEdit(selected, event.currentTarget)} view={activeView} />
        </div>
      </div>

      <ModelTaskSheet key={task ? `${task.mode}-${task.modelId ?? "new"}` : "closed"} onDismiss={dismissTask} onSelect={setSelectedId} task={task} />
    </div>
  );
}
