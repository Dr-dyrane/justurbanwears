"use client";

/* Engine previews are same-origin, operator-protected asset responses. */
/* eslint-disable @next/next/no-img-element */

import { useEffect, useRef, useState } from "react";
import {
  Camera,
  Check,
  CircleAlert,
  CircleDashed,
  ImagePlus,
  LoaderCircle,
  Maximize2,
  PackageCheck,
  Pencil,
  RotateCcw,
  ScanLine,
  Shirt,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import { WardrobeMotion } from "../../brand/wardrobe-motion";
import type { GarmentCategory } from "../../../lib/studio/domain/entities";
import { LifecycleBadge } from "../atoms/lifecycle-badge";
import { StudioLink } from "../atoms/studio-link";
import { StudioDisclosureRow } from "../atoms/studio-disclosure-row";
import { StudioTaskSheet, type StudioTaskSheetControls } from "../atoms/studio-task-sheet";
import { StudioAdaptiveWorkspace } from "../workspace/studio-adaptive-workspace";
import {
  intakeRecoveryStep,
  studioDecisionNoteSha256,
  studioDecisionReceiptMatches,
  studioEngineIntakeClient,
  StudioEngineError,
  type GarmentIntakeClient,
  type StudioCorrectionAuthority,
  type IntakeFacts,
  type IntakeSnapshot,
  type IntakeSourceMode,
} from "./engine-client";

type IntakeStep = "start" | "source" | "build" | "confirm" | "edit" | "wear" | "receipt" | "reconcile";
type BuildStage = "READING" | "GARMENT" | "VIEWS" | "READY";
type PendingAction = "BUILD" | "KEEP" | "RETRY";

interface GarmentIntakeSheetProps {
  client?: GarmentIntakeClient;
  onBuildSet?(wardrobeItemId: string): void;
  onDismiss(): void;
  onOpenWear?(wardrobeItemId: string): void;
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

const activeIntakeStates = ["ANALYZING", "GENERATING"];
const intakeIntentStorageKey = "juw.studio.garment-intake.intent.v1";
const validIntakeIntentKey = /^[a-zA-Z0-9._:-]{8,160}$/;

type StoredIntakeIntent = {
  dispatched: boolean;
  fingerprint: string;
  key: string;
};

function createIntakeIntentKey() {
  return `studio-intake:${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}:${Math.random().toString(36).slice(2)}`}`;
}

function intakeIntentFingerprint(sourceMode: IntakeSourceMode, description?: string) {
  const normalizedDescription = (description ?? "").trim().replace(/\s+/g, " ");
  return `${sourceMode}:${normalizedDescription}`;
}

function readStoredIntakeIntent(): StoredIntakeIntent | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    const stored = window.sessionStorage.getItem(intakeIntentStorageKey);
    if (!stored) return undefined;
    if (validIntakeIntentKey.test(stored)) {
      return { dispatched: true, fingerprint: "", key: stored };
    }
    const parsed = JSON.parse(stored) as Partial<StoredIntakeIntent>;
    return typeof parsed.key === "string"
      && validIntakeIntentKey.test(parsed.key)
      && typeof parsed.fingerprint === "string"
      && typeof parsed.dispatched === "boolean"
      ? { dispatched: parsed.dispatched, fingerprint: parsed.fingerprint, key: parsed.key }
      : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredIntakeIntent(value: StoredIntakeIntent) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(intakeIntentStorageKey, JSON.stringify(value));
  } catch {
    // The in-memory ref remains stable when storage is unavailable.
  }
}

function clearStoredIntakeIntentKey(expected?: string) {
  if (typeof window === "undefined") return;
  try {
    const stored = readStoredIntakeIntent();
    if (!expected || stored?.key === expected) {
      window.sessionStorage.removeItem(intakeIntentStorageKey);
    }
  } catch {
    // Storage is an optional reload aid, not a runtime dependency.
  }
}

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

export function GarmentIntakeSheet({
  client = studioEngineIntakeClient,
  onBuildSet,
  onDismiss,
  onOpenWear,
  open,
  returnFocus,
}: GarmentIntakeSheetProps) {
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const commandInFlightRef = useRef(false);
  const factsBeforeEditRef = useRef<IntakeFacts | undefined>(undefined);
  const intakeIntentRef = useRef<StoredIntakeIntent | undefined>(undefined);
  const previewUrlRef = useRef<string | undefined>(undefined);
  const receiptExpandRef = useRef<HTMLButtonElement>(null);
  const receiptPreviewCloseRef = useRef<HTMLButtonElement>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<IntakeStep>("start");
  const [sourceMode, setSourceMode] = useState<IntakeSourceMode | null>(null);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [intake, setIntake] = useState<IntakeSnapshot>();
  const [facts, setFacts] = useState<IntakeFacts>(emptyFacts);
  const [buildStage, setBuildStage] = useState<BuildStage>("READING");
  const [error, setError] = useState<StudioEngineError>();
  const [pendingAction, setPendingAction] = useState<PendingAction>();
  const [pollingNotice, setPollingNotice] = useState<string>();
  const [preview, setPreview] = useState<string>();
  const [retryUsed, setRetryUsed] = useState(false);
  const [wardrobeItemId, setWardrobeItemId] = useState<string>();
  const [receiptPreviewOpen, setReceiptPreviewOpen] = useState(false);
  const [recoverableIntakes, setRecoverableIntakes] = useState<IntakeSnapshot[]>([]);
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const candidatePreview = intake ? client.candidateUrl(intake) : undefined;
  const pollingIntakeId = intake?.id;
  const pollingIntakeState = intake?.state;
  const working = pendingAction !== undefined;
  const progress = ({ start: 8, source: 24, build: 54, confirm: 70, edit: 70, wear: 88, receipt: 100, reconcile: 70 } satisfies Record<IntakeStep, number>)[step];
  const canKeep = Boolean(facts.title && facts.category && facts.colour);
  const sourceLabel = sourceMode === "DESCRIBE" ? "Description" : sourceMode === "CAMERA" ? "Camera" : "Photos";

  const currentImage = candidatePreview ?? (intake ? client.sourceUrl?.(intake) : undefined) ?? preview;
  const hasDurableSource = Boolean(intake?.assets.some((asset) => asset.role === "SOURCE"));

  useEffect(() => () => {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
  }, []);

  useEffect(() => {
    if (!open || step !== "start" || !client.listActiveIntakes) return;
    let current = true;
    setRecoveryLoading(true);
    void client.listActiveIntakes().then((result) => {
      if (current) setRecoverableIntakes(result.intakes);
    }).catch(() => undefined).finally(() => {
      if (current) setRecoveryLoading(false);
    });
    return () => { current = false; };
  }, [client, open, step]);

  useEffect(() => {
    if (!open || !pollingIntakeId || !pollingIntakeState || !client.getIntake || !activeIntakeStates.includes(pollingIntakeState)) return;
    const getIntake = client.getIntake;
    const intakeId = pollingIntakeId;
    let cancelled = false;
    let failures = 0;
    let timeout: number | undefined;

    const schedule = (delay: number) => {
      timeout = window.setTimeout(() => {
        void poll();
      }, delay);
    };

    const poll = async () => {
      try {
        const { intake: refreshed } = await getIntake(intakeId);
        if (cancelled) return;
        failures = 0;
        setPollingNotice(undefined);
        const recoveredStep = applyIntakeSnapshot(refreshed);
        if (recoveredStep === "build") {
          schedule(1_800);
        }
      } catch {
        if (cancelled) return;
        failures += 1;
        setPollingNotice("Connection interrupted. Studio is still working; reconnecting…");
        schedule(Math.min(14_400, 1_800 * (2 ** Math.min(failures, 3))));
      }
    };

    schedule(1_800);
    return () => {
      cancelled = true;
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
  }, [client, open, pollingIntakeId, pollingIntakeState]);

  useEffect(() => {
    if (!receiptPreviewOpen) return;
    requestAnimationFrame(() => receiptPreviewCloseRef.current?.focus({ preventScroll: true }));
  }, [receiptPreviewOpen]);

  useEffect(() => {
    if (!receiptPreviewOpen) return;
    function closePreview(event: KeyboardEvent) {
      if (event.key === "Tab") {
        event.preventDefault();
        receiptPreviewCloseRef.current?.focus({ preventScroll: true });
      } else if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setReceiptPreviewOpen(false);
      }
    }
    window.addEventListener("keydown", closePreview, { capture: true });
    return () => window.removeEventListener("keydown", closePreview, { capture: true });
  }, [receiptPreviewOpen]);

  useEffect(() => {
    if (receiptPreviewOpen || step !== "receipt") return;
    requestAnimationFrame(() => receiptExpandRef.current?.focus({ preventScroll: true }));
  }, [receiptPreviewOpen, step]);

  function claimCommand() {
    if (commandInFlightRef.current) return false;
    commandInFlightRef.current = true;
    return true;
  }

  function releaseCommand() {
    commandInFlightRef.current = false;
  }

  function intakeIntentKey() {
    const fingerprint = intakeIntentFingerprint(sourceMode!, description);
    const stored = intakeIntentRef.current ?? readStoredIntakeIntent();
    if (stored?.fingerprint && stored.fingerprint !== fingerprint && stored.dispatched) {
      throw new StudioEngineError(
        409,
        "INTAKE_INTENT_CONFLICT",
        "An earlier garment start still needs recovery.",
        "Continue the unfinished intake or deliberately discard it before starting a different garment.",
      );
    }
    const value: StoredIntakeIntent = stored && (!stored.fingerprint || stored.fingerprint === fingerprint)
      ? { ...stored, fingerprint }
      : { dispatched: false, fingerprint, key: createIntakeIntentKey() };
    intakeIntentRef.current = value;
    writeStoredIntakeIntent(value);
    return value.key;
  }

  function markIntakeIntentDispatched() {
    const current = intakeIntentRef.current;
    if (!current) return;
    const dispatched = { ...current, dispatched: true };
    intakeIntentRef.current = dispatched;
    writeStoredIntakeIntent(dispatched);
  }

  function settleIntakeIntent() {
    const value = intakeIntentRef.current ?? readStoredIntakeIntent();
    clearStoredIntakeIntentKey(value?.key);
    intakeIntentRef.current = undefined;
  }

  function clearPreview() {
    if (previewUrlRef.current) URL.revokeObjectURL(previewUrlRef.current);
    previewUrlRef.current = undefined;
    setPreview(undefined);
  }

  function reset(options: { preserveIntent?: boolean } = {}) {
    if (!options.preserveIntent) clearStoredIntakeIntentKey();
    intakeIntentRef.current = options.preserveIntent
      ? intakeIntentRef.current ?? readStoredIntakeIntent()
      : undefined;
    factsBeforeEditRef.current = undefined;
    setStep("start");
    setSourceMode(null);
    setDescription("");
    setFile(null);
    clearPreview();
    setIntake(undefined);
    setFacts(emptyFacts);
    setError(undefined);
    setPendingAction(undefined);
    setPollingNotice(undefined);
    setRetryUsed(false);
    setWardrobeItemId(undefined);
    setReceiptPreviewOpen(false);
    setRecoverableIntakes([]);
    setRecoveryLoading(false);
  }

  function finishDismiss(options: { preserveIntent?: boolean } = {}) {
    reset(options);
    onDismiss();
    return true;
  }

  function requestDismiss() {
    if (receiptPreviewOpen) {
      setReceiptPreviewOpen(false);
      return false;
    }

    if (working || step === "build") {
      if (!window.confirm("Leave this Studio task? The active request may still finish, and Studio will preserve this intake for recovery.")) {
        return false;
      }
      return finishDismiss({ preserveIntent: true });
    }

    if (step === "reconcile") return finishDismiss();

    const garmentSaved = Boolean(wardrobeItemId) || step === "wear" || step === "receipt";
    if (
      !garmentSaved
      && step !== "start"
      && !window.confirm("Discard this garment intake? The current source and edits will be cleared.")
    ) {
      return false;
    }

    return finishDismiss();
  }

  function back() {
    setError(undefined);
    if (step === "source") setStep("start");
    else if (step === "edit") cancelFactsEdit();
    else if (step === "wear") setStep("confirm");
  }

  function beginFactsEdit() {
    factsBeforeEditRef.current = { ...facts };
    setStep("edit");
  }

  function cancelFactsEdit() {
    if (factsBeforeEditRef.current) setFacts(factsBeforeEditRef.current);
    factsBeforeEditRef.current = undefined;
    setStep("confirm");
  }

  function finishFactsEdit() {
    factsBeforeEditRef.current = undefined;
    setStep("confirm");
  }

  function chooseDescription() {
    setSourceMode("DESCRIBE");
    setFile(null);
    clearPreview();
    setStep("source");
  }

  function applyIntakeSnapshot(next: IntakeSnapshot) {
    const recoveredStep = intakeRecoveryStep(next);
    setIntake(next);
    setSourceMode(next.sourceMode);
    setDescription(next.description ?? "");
    setFacts(normalizeFacts(next.facts));
    setWardrobeItemId(next.wardrobeItemId);
    if (recoveredStep === "build") {
      setBuildStage(next.state === "ANALYZING" ? "READING" : "GARMENT");
    } else if (recoveredStep === "confirm") {
      setBuildStage("READY");
    }
    setStep(recoveredStep);
    return recoveredStep;
  }

  async function reconcileIntake(intakeId: string) {
    if (!client.getIntake) return null;
    const result = await client.getIntake(intakeId).catch(() => null);
    if (!result) return null;
    settleIntakeIntent();
    setPollingNotice(undefined);
    const recoveredStep = applyIntakeSnapshot(result.intake);
    return { intake: result.intake, recoveredStep };
  }

  function resumeIntake(next: IntakeSnapshot) {
    settleIntakeIntent();
    setError(undefined);
    setPollingNotice(undefined);
    applyIntakeSnapshot(next);
  }

  function chooseFile(mode: Extract<IntakeSourceMode, "CAMERA" | "UPLOAD">, nextFile: File | null) {
    if (!nextFile) return;
    clearPreview();
    const nextPreview = URL.createObjectURL(nextFile);
    previewUrlRef.current = nextPreview;
    setPreview(nextPreview);
    setSourceMode(mode);
    setFile(nextFile);
    setDescription("");
    setStep("source");
    setError(undefined);
  }

  async function performBuild(
    correction?: string,
    startingIntake = intake,
    correctionAuthority?: StudioCorrectionAuthority,
  ) {
    setError(undefined);
    setPollingNotice(undefined);
    setBuildStage("READING");
    setStep("build");
    let nextIntake = startingIntake;

    try {
      if (!nextIntake) {
        const idempotencyKey = intakeIntentKey();
        markIntakeIntentDispatched();
        nextIntake = (await client.createIntake(sourceMode!, description.trim() || undefined, idempotencyKey)).intake;
        setIntake(nextIntake);
        settleIntakeIntent();
      }
      if (nextIntake.reconciliation?.state === "INDETERMINATE") {
        applyIntakeSnapshot(nextIntake);
        return;
      }
      if (file && !nextIntake.assets.some((asset) => asset.role === "SOURCE")) {
        nextIntake = (await client.addSource(nextIntake.id, file)).intake;
        setIntake(nextIntake);
      }
      if (["DRAFT", "FAILED"].includes(nextIntake.state) && !Object.keys(nextIntake.facts ?? {}).length) {
        nextIntake = (await client.analyzeIntake(nextIntake, description.trim() || undefined)).intake;
        setIntake(nextIntake);
        setFacts(normalizeFacts(nextIntake.facts));
      }
      setIntake(nextIntake);
      if (activeIntakeStates.includes(nextIntake.state)) {
        setBuildStage(nextIntake.state === "ANALYZING" ? "READING" : "GARMENT");
        return;
      }
      if (nextIntake.reconciliation?.state === "INDETERMINATE") {
        applyIntakeSnapshot(nextIntake);
        return;
      }
      setBuildStage("GARMENT");
      const generated = await client.generateGarment(nextIntake, correction, correctionAuthority);
      setIntake(generated.intake);
      setFacts((current) => normalizeFacts({ ...current, ...generated.intake.facts }));
      if (activeIntakeStates.includes(generated.intake.state)) {
        setBuildStage(generated.intake.state === "ANALYZING" ? "READING" : "GARMENT");
        return;
      }
      setBuildStage("VIEWS");
      requestAnimationFrame(() => {
        setBuildStage("READY");
        window.setTimeout(() => setStep("confirm"), 180);
      });
    } catch (caught) {
      const ambiguous = !(caught instanceof StudioEngineError)
        || caught.status === 0
        || caught.status === 409
        || caught.status >= 500;
      const reconciled = ambiguous && nextIntake?.id ? await reconcileIntake(nextIntake.id) : null;
      if (reconciled?.recoveredStep === "reconcile") {
        setError(undefined);
        return;
      }
      if (reconciled && reconciled.intake.state !== "FAILED") {
        setError(undefined);
        return;
      }
      if (isExplicitlyUnavailable(caught)) {
        setError(caught as StudioEngineError);
        setStep("source");
      } else {
        setError(caught instanceof StudioEngineError
          ? caught
          : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not finish that action."));
        setStep("source");
      }
    }
  }

  async function runBuild(correction?: string) {
    if (intake?.reconciliation || !sourceMode || (sourceMode === "DESCRIBE" ? !description.trim() : !file && !hasDurableSource)) return;
    if (!claimCommand()) return;
    setPendingAction("BUILD");
    try {
      await performBuild(correction);
    } finally {
      setPendingAction(undefined);
      releaseCommand();
    }
  }

  async function keep() {
    if (intake?.reconciliation || !canKeep || !claimCommand()) return;
    setPendingAction("KEEP");
    setError(undefined);
    try {
      if (intake) {
        const decided = await client.decideIntake(intake, "KEEP");
        setIntake(decided.intake);
        const committed = await client.commitIntake(decided.intake, facts);
        setIntake(committed.intake);
        setWardrobeItemId(committed.wardrobeItem.id);
      }
      setStep("wear");
    } catch (caught) {
      const keepError = caught instanceof StudioEngineError
        ? caught
        : new StudioEngineError(500, "ENGINE_ERROR", "Studio could not save this garment.");
      const reconciled = intake ? await reconcileIntake(intake.id) : null;
      if (reconciled?.intake.wardrobeItemId || reconciled?.intake.state === "COMMITTED") {
        setError(undefined);
        setStep("receipt");
      } else if (
        reconciled?.intake.state === "DECISION"
        && reconciled.intake.candidate?.status === "APPROVED"
      ) {
        try {
          const committed = await client.commitIntake(reconciled.intake, facts);
          setIntake(committed.intake);
          setWardrobeItemId(committed.wardrobeItem.id);
          setError(undefined);
          setStep("receipt");
        } catch {
          const committedReconciliation = await reconcileIntake(reconciled.intake.id);
          if (committedReconciliation?.intake.wardrobeItemId || committedReconciliation?.intake.state === "COMMITTED") {
            setError(undefined);
            setStep("receipt");
          } else {
            setError(keepError);
          }
        }
      } else {
        setError(keepError);
      }
    } finally {
      setPendingAction(undefined);
      releaseCommand();
    }
  }

  async function retry() {
    const reviewedGenerationId = intake?.candidate?.generationId;
    if (!intake || !reviewedGenerationId || intake.reconciliation || retryUsed || !claimCommand()) return;
    const correction = "Keep the garment truth. Improve the clean product-front view.";
    const decisionNote = correction;
    let expectedNoteSha256 = "";
    setRetryUsed(true);
    setPendingAction("RETRY");
    setError(undefined);
    try {
      expectedNoteSha256 = await studioDecisionNoteSha256(decisionNote);
      const decision = await client.decideIntake(intake, "RETRY", decisionNote);
      if (!studioDecisionReceiptMatches({
        receipt: decision.intake.decisionReceipt,
        generationId: reviewedGenerationId,
        decision: "RETRY",
        noteSha256: expectedNoteSha256,
      })) {
        throw new StudioEngineError(409, "DECISION_CONFLICT", "Another decision changed this candidate.", "Review the current garment state before spending again.");
      }
      setIntake(decision.intake);
      await performBuild(correction, decision.intake, {
        generationId: reviewedGenerationId,
        decisionReceiptId: decision.intake.decisionReceipt!.receiptId,
      });
    } catch (caught) {
      const retryError = caught instanceof StudioEngineError
        ? caught
        : new StudioEngineError(500, "GENERATION_FAILED", "Studio could not make another view.");
      const reconciled = await reconcileIntake(intake.id);
      if (reconciled && expectedNoteSha256 && studioDecisionReceiptMatches({
        receipt: reconciled.intake.decisionReceipt,
        generationId: reviewedGenerationId,
        decision: "RETRY",
        noteSha256: expectedNoteSha256,
      })) {
        setError(undefined);
        await performBuild(correction, reconciled.intake, {
          generationId: reviewedGenerationId,
          decisionReceiptId: reconciled.intake.decisionReceipt!.receiptId,
        });
      } else if (reconciled && reconciled.recoveredStep !== "source") {
        setError(undefined);
      } else {
        setError(retryError);
      }
    } finally {
      setPendingAction(undefined);
      releaseCommand();
    }
  }

  const renderFooter = ({ requestClose, requestCloseAndThen }: StudioTaskSheetControls) => step === "source" ? (
    <>
      <button className="button button-secondary" onClick={back} type="button">Back</button>
      <button className="button button-primary" data-studio-workspace-primary="true" disabled={working || (sourceMode === "DESCRIBE" ? !description.trim() : !file && !hasDurableSource)} onClick={() => void runBuild()} type="button">
        {pendingAction === "BUILD" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={16} /> : null}
        {pendingAction === "BUILD" ? "Building…" : "Build garment"}
      </button>
    </>
  ) : step === "confirm" ? (
    <>
      <button className="button button-secondary" disabled={working} onClick={beginFactsEdit} type="button"><Pencil aria-hidden="true" size={16} />Edit</button>
      <button className="button button-primary" data-studio-workspace-primary="true" disabled={!canKeep || working} onClick={() => void keep()} type="button">
        {pendingAction === "KEEP" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={16} /> : <Check aria-hidden="true" size={16} />}
        {pendingAction === "KEEP" ? "Keeping…" : "Keep"}
      </button>
    </>
  ) : step === "edit" ? (
    <>
      <button className="button button-secondary" onClick={cancelFactsEdit} type="button">Cancel</button>
      <button className="button button-primary" data-studio-workspace-primary="true" disabled={!canKeep || working} onClick={finishFactsEdit} type="button">Done</button>
    </>
  ) : step === "wear" ? (
    <button className="button button-primary" data-studio-workspace-primary="true" onClick={() => setStep("receipt")} type="button">Not now</button>
  ) : step === "receipt" ? (
    <>
      <StudioLink className="button button-secondary" href={wardrobeItemId ? `/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}` : "/studio/wardrobe"} onClick={(event) => {
        event.preventDefault();
        const destination = event.currentTarget.href;
        requestCloseAndThen(() => window.location.assign(destination));
      }}>Open garment</StudioLink>
      <button className="button button-primary" data-studio-workspace-primary="true" onClick={requestClose} type="button">Done</button>
    </>
  ) : step === "reconcile" ? (
    <button className="button button-primary" data-studio-workspace-primary="true" onClick={requestClose} type="button">Done</button>
  ) : undefined;

  const stageCopy = step === "start"
    ? { detail: "Photo or description", title: "Add one garment" }
    : step === "source"
      ? { detail: sourceMode === "DESCRIBE" ? "Describe only what is visible" : "Source ready", title: "Your garment" }
      : step === "build"
        ? { detail: buildStage === "READY" ? "Ready to review" : "Preparing one clean garment view", title: "Building" }
        : step === "confirm" || step === "edit"
          ? { detail: "Check the garment facts", title: facts.title || "Review garment" }
          : step === "wear"
            ? { detail: "The private wardrobe record is ready", title: facts.title || "Garment saved" }
            : step === "receipt"
              ? { detail: "Private · not for sale", title: facts.title || "In Wardrobe" }
              : { detail: "No new paid attempt will start", title: "Needs review" };

  const intakeStage = (
    <div className={`juw-intake-v2-stage is-${step}`}>
      <div className="juw-intake-v2-media">
        {currentImage
          ? <img alt={`${facts.title || "Selected garment"} preview`} src={currentImage} />
          : <span aria-hidden="true"><Shirt size={84} strokeWidth={1} /></span>}
        {step === "build" ? (
          <span aria-hidden="true" className="juw-intake-v2-building"><LoaderCircle className="studio-spin" size={24} /></span>
        ) : null}
      </div>
      <div className="juw-intake-v2-stage-copy">
        <small>{stageCopy.detail}</small>
        <strong>{stageCopy.title}</strong>
      </div>
      {step === "receipt" && currentImage ? (
        <button aria-label="Expand garment preview" className="studio-lens-action" onClick={() => setReceiptPreviewOpen(true)} ref={receiptExpandRef} type="button">
          <Maximize2 aria-hidden="true" size={17} />Expand
        </button>
      ) : null}
    </div>
  );

  return (
    <StudioTaskSheet
      className="studio-garment-task-sheet is-adaptive-host"
      eyebrow={sourceMode ? sourceLabel : "New garment"}
      onBack={!working && ["source", "edit", "wear"].includes(step) ? back : undefined}
      onDismiss={requestDismiss}
      open={open}
      progress={step === "receipt" || step === "reconcile" ? undefined : progress}
      progressLabel={`Garment intake ${progress}% complete`}
      returnFocus={returnFocus}
      title={step === "receipt" ? "In wardrobe" : step === "reconcile" ? "Needs review" : "Garment intake"}
    >
      {({ requestClose, requestCloseAndThen }) => <>
      <input aria-label="Take garment photo" className="studio-visually-hidden-file" ref={cameraInputRef} accept="image/*" capture="environment" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => chooseFile("CAMERA", event.target.files?.[0] ?? null)} tabIndex={-1} type="file" />
      <input aria-label="Choose garment photo" className="studio-visually-hidden-file" ref={uploadInputRef} accept="image/*" onClick={(event) => { event.currentTarget.value = ""; }} onChange={(event) => chooseFile("UPLOAD", event.target.files?.[0] ?? null)} tabIndex={-1} type="file" />

      <StudioAdaptiveWorkspace active={open} className="juw-intake-v2" stage={intakeStage} surfaceLabel="Add garment controls">
        <div className="juw-intake-v2-content">
          {step === "start" ? (
        <section className="studio-task-question">
          <p className="eyebrow">Start</p>
          <h3>Show us the piece.</h3>
          {recoverableIntakes.length ? (
            <div className="studio-disclosure-group studio-intake-start-options" aria-label="Unfinished garment intakes">
              {recoverableIntakes.map((recoverable) => <StudioDisclosureRow detail={recoverable.reconciliation ? "Needs administrator reconciliation" : recoverable.facts?.title || "Unfinished garment"} icon={<RotateCcw size={19} />} key={recoverable.id} label="Continue" onClick={() => resumeIntake(recoverable)} />)}
            </div>
          ) : recoveryLoading ? <p className="studio-inline-state"><LoaderCircle aria-hidden="true" className="studio-spin" size={15} />Checking unfinished work…</p> : null}
          <div className="studio-disclosure-group studio-intake-start-options">
            <StudioDisclosureRow detail="Take photo" icon={<Camera size={19} />} label="Camera" onClick={() => cameraInputRef.current?.click()} />
            <StudioDisclosureRow detail="Choose photo" icon={<Upload size={19} />} label="Photos" onClick={() => uploadInputRef.current?.click()} />
            <StudioDisclosureRow detail="Use words" icon={<Pencil size={19} />} label="Describe" onClick={chooseDescription} />
          </div>
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
            <div className="juw-intake-v2-source-status">
              <span><Check aria-hidden="true" size={17} /><strong>Photo ready</strong></span>
              <button className="studio-text-action" onClick={() => (sourceMode === "CAMERA" ? cameraInputRef : uploadInputRef).current?.click()} type="button">
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
            {pollingNotice ? <p className="studio-inline-state"><CircleDashed aria-hidden="true" size={15} />{pollingNotice}</p> : null}
          </div>
        </section>
      ) : null}

      {step === "reconcile" ? (
        <section aria-live="assertive" className="studio-task-question" role="alert">
          <CircleAlert aria-hidden="true" size={28} />
          <p className="eyebrow">Reconciliation required</p>
          <h3>No new paid attempt will start.</h3>
          <p>{intake?.reconciliation?.message ?? "An administrator must reconcile this attempt before Studio can continue."}</p>
        </section>
      ) : null}

      {step === "confirm" ? (
        <section className="studio-confirm-state">
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
              <button className="studio-text-action" disabled={working} onClick={beginFactsEdit} type="button"><Pencil size={15} />Edit</button>
              <button className="studio-text-action" disabled={retryUsed || working} onClick={() => void retry()} type="button">
                {pendingAction === "RETRY" ? <LoaderCircle aria-hidden="true" className="studio-spin" size={15} /> : <RotateCcw size={15} />}
                {pendingAction === "RETRY" ? "Trying again…" : retryUsed ? "Retry used" : "Try again"}
              </button>
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
          <p className="eyebrow">Next</p>
          <h3>Continue in Atelier?</h3>
          {onBuildSet || onOpenWear ? (
            <div className="studio-disclosure-group studio-wear-options">
              {onBuildSet
                ? <StudioDisclosureRow detail="Resume the next saved view" icon={<Sparkles size={19} />} label="Continue Genesis" onClick={() => wardrobeItemId && onBuildSet(wardrobeItemId)} />
                : onOpenWear
                  ? <StudioDisclosureRow detail="Choose one presentation view" icon={<Shirt size={19} />} label="Open Wear" onClick={() => wardrobeItemId && onOpenWear(wardrobeItemId)} />
                  : null}
            </div>
          ) : <p>This simulator stops before private media work.</p>}
        </section>
      ) : null}

      {step === "receipt" ? (
        <section className="studio-task-receipt">
          <div aria-live="polite" className="studio-receipt-copy">
            <div className="juw-receipt-motion">
              <WardrobeMotion artwork="logo" polarity="auto" size="sm" variant="success" />
            </div>
            <p className="eyebrow">Saved</p>
            <h3>{facts.title} is in Wardrobe.</h3>
            <p>Continue in Atelier any time.</p>
            <div className="studio-receipt-state"><LifecycleBadge state="DRAFT" /><small>Private · not for sale</small></div>
            <small className="studio-receipt-id">{wardrobeItemId}</small>
          </div>
        </section>
      ) : null}

          {step === "start" || step === "build" ? null : <div className="juw-intake-v2-actions">{renderFooter({ requestClose, requestCloseAndThen })}</div>}
        </div>
      </StudioAdaptiveWorkspace>

      {receiptPreviewOpen && currentImage ? (
        <div
          aria-label={`${facts.title} garment preview`}
          aria-modal="true"
          className="studio-receipt-preview"
          role="dialog"
        >
          <img alt={`${facts.title} saved garment preview, expanded`} src={currentImage} />
          <button aria-label="Close expanded garment preview" className="studio-icon-action" onClick={() => {
            setReceiptPreviewOpen(false);
          }} ref={receiptPreviewCloseRef} type="button">
            <X aria-hidden="true" size={19} />
          </button>
        </div>
      ) : null}

      <span aria-live="polite" className="sr-only">{working ? `${buildStage.toLowerCase()} in progress` : error?.message ?? ""}</span>
      </>}
    </StudioTaskSheet>
  );
}
