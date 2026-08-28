"use client";

import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Camera, Shirt, UserRound } from "lucide-react";
import { StudioFeedback } from "../studio/atoms/studio-feedback";
import { StudioLoadingStage } from "../studio/atoms/studio-loading-stage";
import { StudioStackPage, StudioStackSection } from "../studio/atoms/studio-stack-page";
import { useStudio } from "../studio/studio-provider";
import {
  clearCreateMediaIntent,
  createMediaIntent,
  executeCreateMediaCommand,
  isEligibleCreateMediaModel,
  persistCreateMediaIntent,
  readCreateMediaIntent,
  reconcileCreateMediaIntent,
  resolveCreateMediaModel,
  runCreateMediaSingleFlight,
  type CreateMediaIntent,
  type CreateMediaOperation,
} from "./create-media-client";

const CREATE_MEDIA_RECOVERY_MESSAGE = "Studio could not confirm whether this saved request started. It will only check existing Wear state; no new generation will be sent.";
const CREATE_MEDIA_MISSING_MESSAGE = "Studio confirmed that this exact request has no saved Wear generation. Resume the same request key to start it at most once.";
const MODEL_TRY_ON_ZERO_SPEND_BLOCKER = "On-model photos are not available yet. Choose On mannequin to create a garment-only view without using a private identity photo.";
const CREATE_MEDIA_RECOVERY_ATTEMPTS = 3;

export function ShootComposer() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { application, authority } = useStudio();
  const commandInFlightRef = useRef(false);
  const operatorScope = application.snapshot?.operator.storageScope ?? "";
  const pieces = useMemo(
    () => (authority.snapshot?.pieces ?? []).filter((candidate) => candidate.wardrobeItemId && candidate.availability !== "ARCHIVED"),
    [authority.snapshot?.pieces],
  );
  const authorityModels = useMemo(() => authority.snapshot?.models ?? [], [authority.snapshot?.models]);
  const models = useMemo(() => authorityModels.filter(isEligibleCreateMediaModel), [authorityModels]);
  const requestedGarmentId = searchParams.get("garment");
  const requestedModelId = searchParams.get("model");
  const requestedModel = useMemo(
    () => resolveCreateMediaModel(authorityModels, requestedModelId),
    [authorityModels, requestedModelId],
  );
  const [initializedScope, setInitializedScope] = useState("");
  const [wardrobeSelection, setWardrobeItemId] = useState("");
  const [operation, setOperation] = useState<CreateMediaOperation>("MANNEQUIN_FRONT");
  const [modelSelection, setModelProfileId] = useState("");
  const [pendingIntent, setPendingIntent] = useState<CreateMediaIntent>();
  const [busy, setBusy] = useState(false);
  const [busyLabel, setBusyLabel] = useState("Building view…");
  const [error, setError] = useState("");
  const [recoveryMessage, setRecoveryMessage] = useState("");
  const [recoveryResolution, setRecoveryResolution] = useState<"MISSING" | "UNKNOWN">("UNKNOWN");
  const [recoveryAttempt, setRecoveryAttempt] = useState(0);
  const scopeInitialized = Boolean(operatorScope) && initializedScope === operatorScope;
  const invalidRequestedModel = scopeInitialized
    && !pendingIntent
    && requestedModelId !== null
    && requestedModel.kind === "invalid";
  const fallbackWardrobeItemId = pieces.find((candidate) => candidate.wardrobeItemId === requestedGarmentId)?.wardrobeItemId
    ?? pieces[0]?.wardrobeItemId
    ?? "";
  const wardrobeItemId = pendingIntent || pieces.some((candidate) => candidate.wardrobeItemId === wardrobeSelection)
    ? wardrobeSelection
    : fallbackWardrobeItemId;
  const fallbackModelProfileId = models.find((model) => model.kind === "LULU_V3")?.id ?? models[0]?.id ?? "";
  const modelProfileId = pendingIntent || invalidRequestedModel || models.some((model) => model.id === modelSelection)
    ? modelSelection
    : fallbackModelProfileId;
  const piece = pieces.find((candidate) => candidate.wardrobeItemId === wardrobeItemId);
  const selectedModel = models.find((candidate) => candidate.id === modelProfileId);
  const controlsLocked = busy || pendingIntent !== undefined || invalidRequestedModel;

  const navigateToGeneration = useCallback(async (
    generation: { id: string },
    intent: CreateMediaIntent,
  ) => {
    clearCreateMediaIntent(intent.requestId, operatorScope);
    setPendingIntent(undefined);
    setRecoveryMessage("");
    setRecoveryResolution("UNKNOWN");
    await authority.refresh().catch(() => undefined);
    router.push(`/studio/media/${generation.id}`);
  }, [authority, operatorScope, router]);

  const checkExistingIntent = useCallback(async (intent: CreateMediaIntent) => {
    await runCreateMediaSingleFlight(commandInFlightRef, async () => {
      setBusy(true);
      setBusyLabel("Checking existing view…");
      setError("");
      try {
        const result = await reconcileCreateMediaIntent(intent);
        if (result.kind === "resolved") {
          await navigateToGeneration(result.generation, intent);
        } else if (result.kind === "missing") {
          setRecoveryResolution("MISSING");
          setRecoveryMessage(intent.operation === "MODEL_TRY_ON"
            ? MODEL_TRY_ON_ZERO_SPEND_BLOCKER
            : CREATE_MEDIA_MISSING_MESSAGE);
        } else {
          setRecoveryResolution("UNKNOWN");
          setRecoveryMessage(CREATE_MEDIA_RECOVERY_MESSAGE);
        }
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Studio could not check the saved media request.");
      } finally {
        setBusy(false);
      }
    });
  }, [navigateToGeneration]);

  useEffect(() => {
    if (authority.status !== "ready" || application.status !== "ready" || !operatorScope) return;
    if (initializedScope === operatorScope) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setPendingIntent(undefined);
      setRecoveryMessage("");
      setRecoveryResolution("UNKNOWN");
      const remembered = readCreateMediaIntent(operatorScope);
      if (remembered) {
        setWardrobeItemId(remembered.wardrobeItemId);
        setOperation(remembered.operation);
        setModelProfileId(remembered.modelProfileId ?? "");
        setPendingIntent(remembered);
        setRecoveryAttempt(0);
        setInitializedScope(operatorScope);
        void checkExistingIntent(remembered);
        return;
      }

      setWardrobeItemId(
        pieces.find((candidate) => candidate.wardrobeItemId === requestedGarmentId)?.wardrobeItemId
          ?? pieces[0]?.wardrobeItemId
          ?? "",
      );
      if (requestedModel.kind === "selected") {
        setOperation("MODEL_TRY_ON");
        setModelProfileId(requestedModel.model.id);
      } else if (requestedModel.kind === "invalid") {
        setOperation("MODEL_TRY_ON");
        setModelProfileId("");
      } else {
        setOperation("MANNEQUIN_FRONT");
        setModelProfileId(models.find((model) => model.kind === "LULU_V3")?.id ?? models[0]?.id ?? "");
      }
      setInitializedScope(operatorScope);
    });
    return () => { cancelled = true; };
  }, [application.status, authority.status, checkExistingIntent, initializedScope, models, operatorScope, pieces, requestedGarmentId, requestedModel]);

  useEffect(() => {
    if (
      !pendingIntent
      || busy
      || !recoveryMessage
      || recoveryResolution === "MISSING"
      || recoveryAttempt >= CREATE_MEDIA_RECOVERY_ATTEMPTS
    ) return;
    const delay = Math.min(1_600 * (2 ** recoveryAttempt), 6_400);
    const timeout = window.setTimeout(() => {
      setRecoveryAttempt((current) => current + 1);
      void checkExistingIntent(pendingIntent);
    }, delay);
    return () => window.clearTimeout(timeout);
  }, [busy, checkExistingIntent, pendingIntent, recoveryAttempt, recoveryMessage, recoveryResolution]);

  const resumeSavedIntent = useCallback(async (intent: CreateMediaIntent) => {
    if (intent.operation === "MODEL_TRY_ON") {
      setRecoveryResolution("MISSING");
      setRecoveryMessage(MODEL_TRY_ON_ZERO_SPEND_BLOCKER);
      return;
    }
    await runCreateMediaSingleFlight(commandInFlightRef, async () => {
      setBusy(true);
      setBusyLabel("Resuming saved request…");
      setError("");
      try {
        const result = await executeCreateMediaCommand(intent);
        if (result.kind === "resolved") {
          await navigateToGeneration(result.generation, intent);
        } else if (result.kind === "rejected") {
          clearCreateMediaIntent(intent.requestId, operatorScope);
          setPendingIntent(undefined);
          setRecoveryMessage("");
          setRecoveryResolution("UNKNOWN");
          setError(result.error.message);
        } else {
          setRecoveryResolution(result.resolution);
          setRecoveryMessage(result.resolution === "MISSING"
            ? CREATE_MEDIA_MISSING_MESSAGE
            : CREATE_MEDIA_RECOVERY_MESSAGE);
        }
      } catch (cause) {
        setRecoveryResolution("UNKNOWN");
        setRecoveryMessage(CREATE_MEDIA_RECOVERY_MESSAGE);
        setError(cause instanceof Error ? cause.message : "Studio could not check the saved media request.");
      } finally {
        setBusy(false);
      }
    });
  }, [navigateToGeneration, operatorScope]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runCreateMediaSingleFlight(commandInFlightRef, async () => {
      if (
        !scopeInitialized
        || pendingIntent
        || invalidRequestedModel
        || !wardrobeItemId
        || operation !== "MANNEQUIN_FRONT"
      ) return;

      setBusy(true);
      setBusyLabel("Building view…");
      setError("");
      setRecoveryMessage("");
      let intent: CreateMediaIntent;
      try {
        intent = createMediaIntent({
          wardrobeItemId,
          operation: "MANNEQUIN_FRONT",
        });
        persistCreateMediaIntent(intent, operatorScope);
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "Studio did not start generation.");
        setBusy(false);
        return;
      }

      setPendingIntent(intent);
      setRecoveryAttempt(0);
      try {
        const result = await executeCreateMediaCommand(intent);
        if (result.kind === "resolved") {
          await navigateToGeneration(result.generation, intent);
        } else if (result.kind === "rejected") {
          clearCreateMediaIntent(intent.requestId, operatorScope);
          setPendingIntent(undefined);
          setError(result.error.message);
        } else {
          setRecoveryResolution(result.resolution);
          setRecoveryMessage(result.resolution === "MISSING"
            ? CREATE_MEDIA_MISSING_MESSAGE
            : CREATE_MEDIA_RECOVERY_MESSAGE);
        }
      } catch (cause) {
        setRecoveryMessage(CREATE_MEDIA_RECOVERY_MESSAGE);
        setError(cause instanceof Error ? cause.message : "Studio could not check the saved media request.");
      } finally {
        setBusy(false);
      }
    });
  }

  if (authority.status === "idle" || authority.status === "loading") {
    return <StudioLoadingStage label="Opening Atelier…" />;
  }
  if (application.status === "idle" || application.status === "loading") {
    return <StudioLoadingStage label="Verifying Studio operator…" />;
  }
  if (authority.status === "error") {
    return <StudioFeedback detail={authority.error} state="error" title="Media unavailable" />;
  }
  if (application.status === "error" || !operatorScope) {
    return <StudioFeedback detail={application.error || "Studio could not verify the current operator."} state="error" title="Media unavailable" />;
  }
  if (!scopeInitialized) return <StudioLoadingStage label="Opening Atelier…" />;

  const modelIntentCannotResume = pendingIntent?.operation === "MODEL_TRY_ON"
    && recoveryResolution === "MISSING";
  const recoveryFeedback = pendingIntent ? (
    <StudioFeedback
      action={busy || modelIntentCannotResume ? undefined : (
        <button
          className="button button-secondary"
          onClick={() => void (recoveryResolution === "MISSING"
            ? resumeSavedIntent(pendingIntent)
            : checkExistingIntent(pendingIntent))}
          type="button"
        >
          {recoveryResolution === "MISSING" ? "Resume saved request" : "Check existing work"}
        </button>
      )}
      detail={recoveryMessage || "Studio is checking the saved request against the current Wear state. No new generation will be sent."}
      state={busy ? "loading" : modelIntentCannotResume ? "error" : "empty"}
      title={busy ? busyLabel : modelIntentCannotResume ? "Model try-on unavailable" : "Request outcome unconfirmed"}
    />
  ) : null;

  return (
    <StudioStackPage kind="workflow">
      <h1 className="sr-only">Create media</h1>
      {recoveryFeedback}
      {pieces.length ? (
        <form className="composer-layout" onSubmit={submit}>
          <div className="composer-main">
            <StudioStackSection className="composer-section" meta="1" title="Piece">
              <label className="authority-card select-authority">
                <span className="empty-authority"><Shirt aria-hidden="true" size={26} /></span>
                <div>
                  <span><small>Garment</small></span>
                  <select
                    aria-label="Garment"
                    disabled={controlsLocked}
                    onChange={(event) => setWardrobeItemId(event.target.value)}
                    value={wardrobeItemId}
                  >
                    {pieces.map((item) => (
                      <option key={item.pieceKey} value={item.wardrobeItemId!}>
                        {item.sku ?? "Private"} · {item.title}
                      </option>
                    ))}
                  </select>
                  <p>{piece?.colour} · {piece?.condition}</p>
                </div>
              </label>
            </StudioStackSection>
            <StudioStackSection className="composer-section" meta="2" title="View">
              <div className="preset-grid">
                <button
                  aria-pressed={operation === "MANNEQUIN_FRONT"}
                  className={operation === "MANNEQUIN_FRONT" ? "preset-card active" : "preset-card"}
                  disabled={controlsLocked}
                  onClick={() => setOperation("MANNEQUIN_FRONT")}
                  type="button"
                >
                  <strong>Mannequin</strong><small>Garment only</small>
                </button>
                <button
                  aria-pressed={operation === "MODEL_TRY_ON"}
                  aria-describedby="model-try-on-zero-spend-blocker"
                  className={operation === "MODEL_TRY_ON" ? "preset-card active" : "preset-card"}
                  disabled
                  type="button"
                >
                  <strong>On model</strong><small>Not available yet</small>
                </button>
              </div>
              <p className="studio-inline-state" id="model-try-on-zero-spend-blocker">
                {MODEL_TRY_ON_ZERO_SPEND_BLOCKER}
              </p>
            </StudioStackSection>
            {operation === "MODEL_TRY_ON" ? (
              <StudioStackSection className="composer-section" meta="3" title="Model">
                <label className="authority-card select-authority">
                  <span className="empty-authority"><UserRound aria-hidden="true" size={26} /></span>
                  <div>
                    <span><small>Model</small></span>
                    <select
                      aria-label="Model"
                      disabled={controlsLocked}
                      onChange={(event) => setModelProfileId(event.target.value)}
                      required
                      value={modelProfileId}
                    >
                      {!modelProfileId ? <option disabled value="">Choose an approved model</option> : null}
                      {modelProfileId && !selectedModel ? <option value={modelProfileId}>Saved model</option> : null}
                      {models.map((model) => <option key={model.id} value={model.id}>{model.name}</option>)}
                    </select>
                    <p>{selectedModel ? `${selectedModel.name} · Approved for Wear` : "No eligible model selected"}</p>
                  </div>
                </label>
              </StudioStackSection>
            ) : null}
          </div>
          <aside className="brief-panel">
            <div className="brief-sticky">
              <h2>{piece?.title ?? "Choose a piece"}</h2>
              <div className="brief-meta">
                <span>View</span>
                <strong>{operation === "MANNEQUIN_FRONT" ? "Mannequin" : "Model try-on"}</strong>
                {operation === "MODEL_TRY_ON" ? <><span>Model</span><strong>{selectedModel?.name ?? "Unavailable"}</strong></> : null}
                <span>Visibility</span><strong>Private</strong>
              </div>
              {operation === "MANNEQUIN_FRONT" ? (
                <button
                  className="button button-primary button-full"
                  disabled={controlsLocked || !wardrobeItemId}
                  type="submit"
                >
                  {busy ? <><span className="spinner" />{busyLabel}</> : pendingIntent ? "Request saved" : <><Camera aria-hidden="true" size={17} />Build view</>}
                </button>
              ) : pendingIntent ? null : (
                <StudioFeedback
                  detail={MODEL_TRY_ON_ZERO_SPEND_BLOCKER}
                  state="error"
                  title="Model try-on unavailable"
                />
              )}
              {invalidRequestedModel ? (
                <StudioFeedback
                  action={<button className="button button-secondary" onClick={() => router.push("/studio/models")} type="button">Choose a model</button>}
                  detail="This model link is missing, archived, or not eligible for Wear. Studio did not substitute another model."
                  state="error"
                  title="Model unavailable"
                />
              ) : null}
              {!invalidRequestedModel && operation === "MODEL_TRY_ON" && !selectedModel && !pendingIntent ? (
                <StudioFeedback detail="Choose a READY model with valid Wear authority before building this view." state="error" title="Model required" />
              ) : null}
              {error ? <StudioFeedback detail={error} state="error" title="View not made" /> : null}
            </div>
          </aside>
        </form>
      ) : pendingIntent ? null : (
        <StudioFeedback
          action={<button className="button button-primary" onClick={() => router.push("/studio/wardrobe?intake=1")} type="button">Intake garment</button>}
          detail="Add a private garment before creating media."
          state="empty"
          title="No garment yet"
        />
      )}
    </StudioStackPage>
  );
}
