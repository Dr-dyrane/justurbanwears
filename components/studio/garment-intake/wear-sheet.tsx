"use client";

/* Same-origin operator-protected private asset responses. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, CircleAlert, Clock3, ImagePlus, LoaderCircle, Maximize2, Plus, Shirt, Sparkles, UserRound, X } from "lucide-react";
import { StudioDisclosureRow } from "../atoms/studio-disclosure-row";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { StudioEngineError } from "./engine-client";
import { addWearModel, decideWear, generateWear, readWear, type WearGeneration, type WearModel, type WearOperation, type WearWorkspace } from "./wear-client";

type Step = "choose" | "add-model" | "working" | "review" | "edit" | "failed" | "saved";

export function WearSheet({ onDismiss, open, returnFocus, wardrobeItemId }: {
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
  wardrobeItemId: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const closePreviewRef = useRef<HTMLButtonElement>(null);
  const [workspace, setWorkspace] = useState<WearWorkspace>();
  const [step, setStep] = useState<Step>("choose");
  const [operation, setOperation] = useState<WearOperation>();
  const [selectedModel, setSelectedModel] = useState<WearModel>();
  const [selected, setSelected] = useState<WearGeneration>();
  const [file, setFile] = useState<File>();
  const [name, setName] = useState("");
  const [licenseUrl, setLicenseUrl] = useState("");
  const [authorityConfirmed, setAuthorityConfirmed] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<StudioEngineError>();
  const [expanded, setExpanded] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
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

  useEffect(() => () => { if (modelPreview) URL.revokeObjectURL(modelPreview); }, [modelPreview]);

  useEffect(() => {
    if (!open) return;
    setError(undefined);
    void readWear(wardrobeItemId).then(({ workspace: value }) => {
      setWorkspace(value);
      const latest = value.generations.at(-1);
      if (latest?.state === "COMPLETE") { setSelected(latest); setStep("review"); }
      else if (latest && ["PENDING", "RUNNING"].includes(latest.state)) { setSelected(latest); setStep("working"); }
      else setStep("choose");
    }).catch((caught) => setError(caught));
  }, [open, wardrobeItemId]);

  useEffect(() => {
    if (!open || step !== "working") return;
    const timeout = window.setTimeout(() => {
      void readWear(wardrobeItemId).then(({ workspace: value }) => {
        setWorkspace(value);
        const latest = value.generations.at(-1);
        if (latest?.state === "COMPLETE") { setSelected(latest); setStep("review"); }
        else if (latest?.state === "FAILED") { setSelected(latest); setError(new StudioEngineError(502, "GENERATION_FAILED", "That view was not created.", latest.retryAvailable ? "Try once more." : "Choose another view.")); setStep("failed"); }
      }).catch((caught) => setError(caught));
    }, 1600);
    return () => window.clearTimeout(timeout);
  }, [open, step, wardrobeItemId, workspace]);

  useEffect(() => {
    if (expanded) requestAnimationFrame(() => closePreviewRef.current?.focus({ preventScroll: true }));
  }, [expanded]);

  async function run(nextOperation: WearOperation, model?: WearModel, parent?: WearGeneration, correction?: string) {
    setError(undefined);
    setOperation(nextOperation);
    setSelectedModel(model);
    setStep("working");
    try {
      const result = await generateWear(wardrobeItemId, {
        operation: nextOperation,
        modelProfileId: model?.id,
        parentGenerationId: parent?.id,
        correction,
      });
      setWorkspace(result.workspace);
      const candidate = [...result.workspace.generations].reverse().find((item) => item.operation === nextOperation && item.modelProfileId === (model?.id ?? parent?.modelProfileId ?? null));
      if (!candidate) throw new StudioEngineError(500, "ENGINE_ERROR", "The Wear view was not saved.", "Try once more.");
      setSelected(candidate);
      setStep(candidate.outputUrl ? "review" : candidate.state === "FAILED" ? "failed" : "working");
    } catch (caught) {
      setError(caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not make that view."));
      const refreshed = await readWear(wardrobeItemId).catch(() => null);
      const failed = refreshed?.workspace.generations.at(-1);
      if (refreshed) setWorkspace(refreshed.workspace);
      if (failed?.state === "FAILED") { setSelected(failed); setStep("failed"); }
      else setStep("choose");
    }
  }

  async function decide(decision: "KEEP" | "EDIT" | "REJECT") {
    if (!selected) return;
    try {
      const result = await decideWear(wardrobeItemId, selected.id, decision, note.trim() || undefined);
      setWorkspace(result.workspace);
      if (decision === "KEEP") setStep("saved");
      else if (decision === "EDIT") setStep("edit");
      else setStep("choose");
    } catch (caught) {
      setError(caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not save that decision."));
    }
  }

  async function addModel() {
    if (!file || !name.trim() || !licenseUrl.trim() || !authorityConfirmed) return;
    setStep("working");
    try {
      const result = await addWearModel(wardrobeItemId, { file, name: name.trim(), licenseUrl: licenseUrl.trim() });
      setWorkspace(result.workspace);
      await run("MODEL_TRY_ON", result.model);
    } catch (caught) {
      setError(caught instanceof StudioEngineError ? caught : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not add that model."));
      setStep("add-model");
    }
  }

  async function retry() {
    if (!selected?.retryAvailable) return;
    await decideWear(wardrobeItemId, selected.id, "RETRY");
    const model = workspace?.models.find((item) => item.id === selected.modelProfileId);
    const parent = selected.operation === "EDITORIAL_MODEL"
      ? workspace?.generations.find((item) => item.id === selected.parentGenerationId && item.operation === "MODEL_TRY_ON" && item.state === "APPROVED")
      : undefined;
    await run(selected.operation, model, parent);
  }

  const footer = step === "review" ? (
    <>
      <button className="button button-secondary" onClick={() => void decide("EDIT")} type="button">Edit</button>
      <button className="button button-primary" onClick={() => void decide("KEEP")} type="button"><Check aria-hidden="true" size={17} />Keep</button>
    </>
  ) : step === "edit" ? (
    <>
      <button className="button button-secondary" onClick={() => setStep("review")} type="button">Cancel</button>
      <button className="button button-primary" disabled={!note.trim()} onClick={() => selected && void run(
        selected.operation,
        workspace?.models.find((model) => model.id === selected.modelProfileId) ?? selectedModel,
        selected.operation === "EDITORIAL_MODEL"
          ? workspace?.generations.find((generation) => generation.id === selected.parentGenerationId)
          : undefined,
        note.trim(),
      )} type="button">Try correction</button>
    </>
  ) : step === "add-model" ? (
    <>
      <button className="button button-secondary" onClick={() => setStep("choose")} type="button">Cancel</button>
      <button className="button button-primary" disabled={!file || !name.trim() || !licenseUrl.trim() || !authorityConfirmed} onClick={() => void addModel()} type="button">Add & try on</button>
    </>
  ) : step === "saved" ? (
    <button className="button button-primary" onClick={onDismiss} type="button">Done</button>
  ) : step === "failed" ? (
    <button className="button button-primary" disabled={!selected?.retryAvailable} onClick={() => void retry()} type="button">Try once</button>
  ) : undefined;

  return (
    <StudioTaskSheet
      className="studio-wear-task-sheet"
      eyebrow="Private media"
      footer={footer}
      onBack={["add-model", "review", "edit"].includes(step) ? () => setStep(step === "add-model" ? "choose" : "choose") : undefined}
      onDismiss={onDismiss}
      open={open}
      progress={step === "choose" ? 18 : step === "working" ? 58 : step === "review" || step === "edit" ? 82 : 100}
      progressLabel="Wear media progress"
      returnFocus={returnFocus}
      title="Wear"
    >
      {step === "choose" ? (
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
        <section aria-live="polite" className="studio-build-state" role="status">
          <div className="studio-build-visual"><Shirt aria-hidden="true" size={70} strokeWidth={1.1} /><span><LoaderCircle aria-hidden="true" className="studio-spin" size={21} /></span></div>
          <div><p className="eyebrow">Making</p><h3>{operation === "MANNEQUIN_FRONT" ? "Mannequin front." : operation === "EDITORIAL_MODEL" ? "Editorial background." : `Try-on${selectedModel ? ` · ${selectedModel.name}` : ""}.`}</h3><p>Private until kept.</p></div>
        </section>
      ) : null}

      {step === "failed" ? <section aria-live="assertive" className="studio-task-question"><p className="eyebrow">Not made</p><h3>Try once?</h3><p>{error?.message}</p></section> : null}

      {step === "review" && selected?.outputUrl ? (
        <section className="studio-wear-review">
          <div className="studio-wear-review-image"><img alt={`${selected.operation.toLowerCase().replaceAll("_", " ")} review`} src={selected.outputUrl} /><button aria-label="Expand Wear image" className="studio-lens-action" onClick={() => setExpanded(true)} type="button"><Maximize2 aria-hidden="true" size={17} />Expand</button></div>
          <div><p className="eyebrow">Review</p><h3>Keep this view?</h3><p>Front only · private</p><button className="studio-text-action" onClick={() => void decide("REJECT")} type="button">Reject</button></div>
        </section>
      ) : null}

      {step === "edit" ? <section className="studio-task-question"><p className="eyebrow">Correction</p><h3>What changes?</h3><label className="studio-field"><span>One correction</span><textarea maxLength={500} onChange={(event) => setNote(event.target.value)} rows={6} value={note} /></label></section> : null}

      {step === "saved" && selected?.outputUrl ? <section className="studio-task-receipt"><div className="studio-receipt-visual"><img alt="Approved private Wear view" src={selected.outputUrl} /></div><div aria-live="polite" className="studio-receipt-copy"><span><Check aria-hidden="true" size={24} /></span><p className="eyebrow">Kept</p><h3>View saved.</h3><p>Private · not in Shop</p></div></section> : null}

      {expanded && selected?.outputUrl ? <div aria-label="Expanded Wear review" aria-modal="true" className="studio-receipt-preview" role="dialog"><img alt="Expanded private Wear review" src={selected.outputUrl} /><button aria-label="Close expanded Wear image" className="studio-icon-action" onClick={() => setExpanded(false)} ref={closePreviewRef} type="button"><X aria-hidden="true" size={19} /></button></div> : null}
      <span aria-live="polite" className="sr-only">{step === "working" ? "Wear generation in progress" : error?.message || ""}</span>
    </StudioTaskSheet>
  );
}
