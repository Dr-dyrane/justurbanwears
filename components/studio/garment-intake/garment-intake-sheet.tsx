"use client";

/* Engine previews are same-origin, operator-protected asset responses. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Camera,
  Check,
  CheckCircle2,
  CircleDashed,
  ImagePlus,
  LoaderCircle,
  PackageCheck,
  Pencil,
  RotateCcw,
  ScanLine,
  Shirt,
  Sparkles,
  Upload,
  UserPlus,
  UserRound,
} from "lucide-react";
import type { GarmentCategory } from "../../../lib/studio/domain/entities";
import { LifecycleBadge } from "../atoms/lifecycle-badge";
import { StudioDisclosureRow } from "../atoms/studio-disclosure-row";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";
import {
  addSource,
  analyzeIntake,
  candidateUrl,
  commitIntake,
  createIntake,
  decideIntake,
  generateGarment,
  StudioEngineError,
  type IntakeFacts,
  type IntakeSnapshot,
  type IntakeSourceMode,
} from "./engine-client";

type IntakeStep = "start" | "source" | "build" | "confirm" | "edit" | "wear" | "receipt";
type BuildStage = "READING" | "GARMENT" | "VIEWS" | "READY";

interface GarmentIntakeSheetProps {
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
}

const categories: Array<{ label: GarmentCategory; icon: React.ReactNode }> = [
  { label: "Dress", icon: <Sparkles size={18} /> },
  { label: "Shirt", icon: <Shirt size={18} /> },
  { label: "Set", icon: <PackageCheck size={18} /> },
  { label: "Knitwear", icon: <Shirt size={18} /> },
  { label: "Skirt", icon: <ScanLine size={18} /> },
  { label: "Trousers", icon: <ScanLine size={18} /> },
];

const conditions = ["Excellent", "Very good", "Good · visible wear"];
const buildStages: BuildStage[] = ["READING", "GARMENT", "VIEWS", "READY"];

const emptyFacts: IntakeFacts = {
  title: "",
  category: "Dress",
  colour: "",
  sizeLabel: "Size on request",
  condition: "Excellent",
  price: 0,
};

function formatPrice(value: number) {
  return value > 0
    ? new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value)
    : "Price later";
}

function normalizeFacts(value?: Partial<IntakeFacts>): IntakeFacts {
  const price = Number(value?.price ?? 0);
  return {
    title: String(value?.title ?? "").trim(),
    category: String(value?.category ?? "Dress").trim() || "Dress",
    colour: String(value?.colour ?? "").trim(),
    sizeLabel: String(value?.sizeLabel ?? "Size on request").trim() || "Size on request",
    condition: String(value?.condition ?? "Excellent").trim() || "Excellent",
    price: Number.isFinite(price) ? Math.max(0, price) : 0,
  };
}

function isExplicitlyUnavailable(error: unknown) {
  return error instanceof StudioEngineError
    && ["ENGINE_DISABLED", "ENGINE_UNAVAILABLE"].includes(error.code);
}

export function GarmentIntakeSheet({ onDismiss, open, returnFocus }: GarmentIntakeSheetProps) {
  const studio = useStudio();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<IntakeStep>("start");
  const [sourceMode, setSourceMode] = useState<IntakeSourceMode | null>(null);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<IntakeSnapshot>();
  const [facts, setFacts] = useState<IntakeFacts>(emptyFacts);
  const [buildStage, setBuildStage] = useState<BuildStage>("READING");
  const [error, setError] = useState<StudioEngineError>();
  const [working, setWorking] = useState(false);
  const [retryUsed, setRetryUsed] = useState(false);
  const [wardrobeItemId, setWardrobeItemId] = useState<string>();
  const [wearChoice, setWearChoice] = useState<string>();

  const candidatePreview = intake ? candidateUrl(intake) : undefined;
  const progress = ({ start: 8, source: 24, build: 54, confirm: 70, edit: 70, wear: 88, receipt: 100 } satisfies Record<IntakeStep, number>)[step];
  const canKeep = Boolean(facts.title && facts.category && facts.colour);
  const sourceLabel = sourceMode === "DESCRIBE" ? "Description" : sourceMode === "CAMERA" ? "Camera" : "Photos";

  const preview = useMemo(() => file ? URL.createObjectURL(file) : undefined, [file]);
  const currentImage = candidatePreview ?? preview;

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview);
  }, [preview]);

  function reset() {
    setStep("start");
    setSourceMode(null);
    setDescription("");
    setFile(null);
    setIntake(undefined);
    setFacts(emptyFacts);
    setError(undefined);
    setWorking(false);
    setRetryUsed(false);
    setWardrobeItemId(undefined);
    setWearChoice(undefined);
  }

  function dismiss() {
    reset();
    onDismiss();
  }

  const existingModels = useMemo(
    () => studio.models.filter((model) => model.state === "READY" || model.isDefault),
    [studio.models],
  );

  function back() {
    setError(undefined);
    if (step === "source") setStep("start");
    else if (step === "edit") setStep("confirm");
    else if (step === "confirm") setStep("source");
    else if (step === "wear") setStep("confirm");
  }

  function chooseDescription() {
    setSourceMode("DESCRIBE");
    setFile(null);
    setStep("source");
  }

  function chooseFile(mode: Extract<IntakeSourceMode, "CAMERA" | "UPLOAD">, nextFile: File | null) {
    if (!nextFile) return;
    setSourceMode(mode);
    setFile(nextFile);
    setDescription("");
    setStep("source");
    setError(undefined);
  }

  async function runBuild(correction?: string) {
    if (!sourceMode || (sourceMode === "DESCRIBE" ? !description.trim() : !file)) return;
    setWorking(true);
    setError(undefined);
    setBuildStage("READING");
    setStep("build");

    try {
      let nextIntake = intake;
      if (!nextIntake || correction === undefined) {
        nextIntake = (await createIntake(sourceMode, description.trim() || undefined)).intake;
        if (file) nextIntake = (await addSource(nextIntake.id, file)).intake;
        nextIntake = (await analyzeIntake(nextIntake, description.trim() || undefined)).intake;
        setFacts(normalizeFacts(nextIntake.facts));
      }
      setIntake(nextIntake);
      setBuildStage("GARMENT");
      const generated = await generateGarment(nextIntake, correction);
      setIntake(generated.intake);
      setFacts((current) => normalizeFacts({ ...current, ...generated.intake.facts }));
      setBuildStage("VIEWS");
      requestAnimationFrame(() => {
        setBuildStage("READY");
        window.setTimeout(() => setStep("confirm"), 180);
      });
    } catch (caught) {
      if (isExplicitlyUnavailable(caught)) {
        setError(caught as StudioEngineError);
        setStep("source");
      } else {
        setError(caught instanceof StudioEngineError
          ? caught
          : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not finish that action."));
        setStep("source");
      }
    } finally {
      setWorking(false);
    }
  }

  async function keep() {
    if (!canKeep || working) return;
    setWorking(true);
    setError(undefined);
    try {
      if (intake) {
        const decided = await decideIntake(intake, "KEEP");
        const committed = await commitIntake(decided.intake, facts);
        setIntake(committed.intake);
        setWardrobeItemId(committed.wardrobeItem.id);
      }
      setStep("wear");
    } catch (caught) {
      setError(caught instanceof StudioEngineError
        ? caught
        : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not save this garment."));
    } finally {
      setWorking(false);
    }
  }

  async function retry() {
    if (!intake || retryUsed || working) return;
    setRetryUsed(true);
    setWorking(true);
    setError(undefined);
    try {
      const decision = await decideIntake(intake, "RETRY", "One operator-requested correction");
      setIntake(decision.intake);
      setWorking(false);
      await runBuild("Keep the garment truth. Improve the clean product-front view.");
    } catch (caught) {
      setWorking(false);
      setError(caught instanceof StudioEngineError
        ? caught
        : new StudioEngineError(500, "GENERATION_FAILED", "Studio could not make another view."));
    }
  }

  function finishWear(choice?: string) {
    setWearChoice(choice);
    setStep("receipt");
  }

  const footer = step === "source" ? (
    <>
      <button className="button button-secondary" onClick={back} type="button">Back</button>
      <button className="button button-primary" disabled={working || (sourceMode === "DESCRIBE" ? !description.trim() : !file)} onClick={() => void runBuild()} type="button">
        Build garment
      </button>
    </>
  ) : step === "confirm" ? (
    <>
      <button className="button button-secondary" onClick={() => setStep("edit")} type="button"><Pencil aria-hidden="true" size={16} />Edit</button>
      <button className="button button-primary" disabled={!canKeep || working} onClick={() => void keep()} type="button">
        {working ? <LoaderCircle aria-hidden="true" className="studio-spin" size={16} /> : <Check aria-hidden="true" size={16} />}Keep
      </button>
    </>
  ) : step === "edit" ? (
    <>
      <button className="button button-secondary" onClick={() => setStep("confirm")} type="button">Cancel</button>
      <button className="button button-primary" disabled={!canKeep} onClick={() => setStep("confirm")} type="button">Done</button>
    </>
  ) : step === "wear" ? (
    <button className="button button-primary" onClick={() => finishWear()} type="button">Not now</button>
  ) : step === "receipt" ? (
    <>
      <a className="button button-secondary" href="#garments" onClick={dismiss}>Open garment</a>
      <button className="button button-primary" onClick={dismiss} type="button">Done</button>
    </>
  ) : undefined;

  return (
    <StudioTaskSheet
      className="studio-garment-task-sheet"
      eyebrow={sourceMode ? sourceLabel : "New garment"}
      footer={footer}
      onBack={["source", "confirm", "edit", "wear"].includes(step) ? back : undefined}
      onDismiss={dismiss}
      open={open}
      progress={step === "receipt" ? undefined : progress}
      progressLabel={`Garment intake ${progress}% complete`}
      returnFocus={returnFocus}
      title={step === "receipt" ? "In wardrobe" : "Garment intake"}
    >
      {step === "start" ? (
        <section className="studio-task-question">
          <p className="eyebrow">Start</p>
          <h3>Show us the piece.</h3>
          <div className="studio-disclosure-group studio-intake-start-options">
            <StudioDisclosureRow detail="Take photo" icon={<Camera size={19} />} label="Camera" onClick={() => cameraInputRef.current?.click()} />
            <StudioDisclosureRow detail="Choose photo" icon={<Upload size={19} />} label="Photos" onClick={() => uploadInputRef.current?.click()} />
            <StudioDisclosureRow detail="Use words" icon={<Pencil size={19} />} label="Describe" onClick={chooseDescription} />
          </div>
          <input aria-label="Take garment photo" className="studio-visually-hidden-file" ref={cameraInputRef} accept="image/*" capture="environment" onChange={(event) => chooseFile("CAMERA", event.target.files?.[0] ?? null)} type="file" />
          <input aria-label="Choose garment photo" className="studio-visually-hidden-file" ref={uploadInputRef} accept="image/*" onChange={(event) => chooseFile("UPLOAD", event.target.files?.[0] ?? null)} type="file" />
        </section>
      ) : null}

      {step === "source" ? (
        <section className="studio-task-question studio-garment-source">
          <p className="eyebrow">Source</p>
          <h3>{sourceMode === "DESCRIBE" ? "Describe the garment." : "Use this photo?"}</h3>
          {sourceMode === "DESCRIBE" ? (
            <label className="studio-field studio-garment-description">
              <span>Garment</span>
              <textarea maxLength={600} onChange={(event) => setDescription(event.target.value)} placeholder="Coral gathered two-piece set…" rows={7} value={description} />
            </label>
          ) : currentImage ? (
            <div className="studio-source-preview">
              <img alt="Selected garment source" src={currentImage} />
              <button className="studio-lens-action" onClick={() => (sourceMode === "CAMERA" ? cameraInputRef : uploadInputRef).current?.click()} type="button">
                <ImagePlus aria-hidden="true" size={17} />Replace
              </button>
            </div>
          ) : null}
          {error ? (
            <div className="studio-engine-error" role="alert">
              <CircleDashed aria-hidden="true" size={19} />
              <span><strong>{error.message}</strong><small>{error.recovery}</small></span>
            </div>
          ) : null}
        </section>
      ) : null}

      {step === "build" ? (
        <section className="studio-build-state" aria-live="polite" role="status">
          <div className="studio-build-visual">
            {currentImage ? <img alt="Garment source being prepared" src={currentImage} /> : <Shirt aria-hidden="true" size={70} strokeWidth={1.1} />}
            <span><LoaderCircle aria-hidden="true" className="studio-spin" size={21} /></span>
          </div>
          <div>
            <p className="eyebrow">Build</p>
            <h3>{buildStage === "READY" ? "Ready to review." : "Making the garment."}</h3>
            <ol className="studio-build-stages">
              {buildStages.map((stage, index) => {
                const activeIndex = buildStages.indexOf(buildStage);
                const complete = index < activeIndex || buildStage === "READY";
                return <li className={stage === buildStage ? "is-active" : complete ? "is-complete" : undefined} key={stage}>{complete ? <Check size={15} /> : <span />}{stage.toLowerCase()}</li>;
              })}
            </ol>
          </div>
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="studio-confirm-state">
          <div className="studio-confirm-hero">
            {currentImage ? <img alt={`${facts.title || "Garment"} review`} src={currentImage} /> : <Shirt aria-hidden="true" size={72} strokeWidth={1.05} />}
          </div>
          <div className="studio-confirm-copy">
            <p className="eyebrow">Confirm</p>
            <h3>{facts.title || "Name this garment"}</h3>
            <dl className="studio-confirm-facts">
              <div><dt>Category</dt><dd>{facts.category}</dd></div>
              <div><dt>Colour</dt><dd>{facts.colour || "Add colour"}</dd></div>
              <div><dt>Size</dt><dd>{facts.sizeLabel}</dd></div>
              <div><dt>Condition</dt><dd>{facts.condition}</dd></div>
              <div><dt>Price</dt><dd>{formatPrice(facts.price)}</dd></div>
            </dl>
            <div className="studio-decision-actions">
              <button className="studio-text-action" onClick={() => setStep("edit")} type="button"><Pencil size={15} />Edit</button>
              <button className="studio-text-action" disabled={retryUsed || working} onClick={() => void retry()} type="button"><RotateCcw size={15} />{retryUsed ? "Retry used" : "Try again"}</button>
            </div>
            {error ? <p className="studio-task-error" role="alert">{error.message} {error.recovery}</p> : null}
          </div>
        </section>
      ) : null}

      {step === "edit" ? (
        <section className="studio-task-question studio-fact-editor">
          <p className="eyebrow">Edit</p>
          <h3>Keep only what is true.</h3>
          <div className="studio-fact-fields">
            <label className="studio-field"><span>Name</span><input value={facts.title} onChange={(event) => setFacts((current) => ({ ...current, title: event.target.value }))} /></label>
            <label className="studio-field"><span>Colour</span><input value={facts.colour} onChange={(event) => setFacts((current) => ({ ...current, colour: event.target.value }))} /></label>
            <label className="studio-field"><span>Size</span><input value={facts.sizeLabel} onChange={(event) => setFacts((current) => ({ ...current, sizeLabel: event.target.value }))} /></label>
            <label className="studio-field"><span>Price</span><input inputMode="numeric" min="0" type="number" value={facts.price || ""} onChange={(event) => setFacts((current) => ({ ...current, price: Math.max(0, Number(event.target.value)) }))} /></label>
          </div>
          <fieldset className="studio-choice-fieldset">
            <legend>Category</legend>
            <div className="studio-choice-grid">
              {categories.map((item) => <button aria-pressed={facts.category === item.label} className={facts.category === item.label ? "is-selected" : undefined} key={item.label} onClick={() => setFacts((current) => ({ ...current, category: item.label }))} type="button">{item.icon}<span>{item.label}</span></button>)}
            </div>
          </fieldset>
          <fieldset className="studio-choice-fieldset">
            <legend>Condition</legend>
            <div className="studio-choice-list">
              {conditions.map((condition) => <button aria-pressed={facts.condition === condition} className={facts.condition === condition ? "is-selected" : undefined} key={condition} onClick={() => setFacts((current) => ({ ...current, condition }))} type="button"><span>{condition}</span>{facts.condition === condition ? <Check aria-hidden="true" size={16} /> : null}</button>)}
            </div>
          </fieldset>
        </section>
      ) : null}

      {step === "wear" ? (
        <section className="studio-task-question">
          <p className="eyebrow">Wear</p>
          <h3>Put it on?</h3>
          <div className="studio-disclosure-group studio-wear-options">
            <StudioDisclosureRow detail="Next" icon={<Shirt size={19} />} label="Mannequin" onClick={() => finishWear("Mannequin")} />
            {existingModels.map((model) => (
              <StudioDisclosureRow detail="Next" icon={<UserRound size={19} />} key={model.id} label={model.name} onClick={() => finishWear(model.name)} />
            ))}
            <StudioDisclosureRow detail="Next" icon={<UserPlus size={19} />} label="Add model" onClick={() => finishWear("Add model")} />
          </div>
        </section>
      ) : null}

      {step === "receipt" ? (
        <section className="studio-task-receipt" aria-live="polite" role="status">
          <span><CheckCircle2 aria-hidden="true" size={30} /></span>
          <p className="eyebrow">Saved</p>
          <h3>{facts.title} is in Wardrobe.</h3>
          <p>{wearChoice ? `${wearChoice} selected for the next action.` : "Add a model view any time."}</p>
          <LifecycleBadge state="DRAFT" />
          <small className="studio-receipt-id">{wardrobeItemId}</small>
        </section>
      ) : null}

      <span aria-live="polite" className="sr-only">{working ? `${buildStage.toLowerCase()} in progress` : error?.message ?? ""}</span>
    </StudioTaskSheet>
  );
}
