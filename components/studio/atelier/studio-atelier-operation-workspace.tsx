"use client";

/* Authenticated review media is served by an app-owned runtime route. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from "react";
import { LockKeyhole, RefreshCw, ShieldCheck } from "lucide-react";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioStackPage, StudioStackSection } from "../atoms/studio-stack-page";
import { StudioAdaptiveWorkspace } from "../workspace/studio-adaptive-workspace";
import {
  isStudioAtelierUiReadError,
  readStudioAtelierOperation,
  retainNewestStudioAtelierOperation,
  shouldPollStudioAtelierOperation,
  studioAtelierReviewMediaUrl,
  type StudioAtelierUiOperation,
} from "../../../lib/studio/atelier/ui-client";

const RECONCILIATION_DELAYS_MS = [1_500, 2_500, 4_000, 6_500, 8_000] as const;

const statePresentation = {
  DRAFT: { detail: "The operation is saved. Generation has not started.", label: "Prepared" },
  MATERIALIZED: { detail: "Paid bytes are stored privately while quality checks continue.", label: "Checking quality" },
  TECHNICAL_PASS: { detail: "Technical checks passed. Semantic checks still control disclosure.", label: "Checking meaning" },
  TECHNICAL_FAIL: { detail: "Technical checks failed. The private candidate stays hidden.", label: "Technical check failed" },
  SEMANTIC_PASS: { detail: "Every required quality gate passed for this exact review artifact.", label: "Ready for review" },
  SEMANTIC_FAIL: { detail: "A semantic quality gate failed. The private candidate stays hidden.", label: "Quality check failed" },
  USER_APPROVED: { detail: "The exact review artifact is approved and waiting for its durable lock.", label: "Approved" },
  USER_REJECTED: { detail: "This candidate was rejected and cannot become an authority or parent.", label: "Rejected" },
  LOCKED: { detail: "The exact approved bytes are locked and reusable.", label: "Locked" },
  BLOCKED_USER_DIRECTION: { detail: "The durable ledger needs explicit operator direction before it can continue.", label: "Needs direction" },
  SUPERSEDED: { detail: "A newer durable operation replaced this one.", label: "Superseded" },
} as const satisfies Record<StudioAtelierUiOperation["state"], Readonly<{
  detail: string;
  label: string;
}>>;

const stageLabel = {
  GARMENT_01_FRONT: "Garment front",
  GARMENT_02_BACK: "Garment back",
  GARMENT_03_MANNEQUIN: "Mannequin",
  GARMENT_04_DETAIL: "Garment detail",
  SUBJECT_A: "Subject foundation",
  SUBJECT_B: "Subject refinement",
  ROOM_FINAL_05: "Front master",
  SIBLING_06: "Left profile",
  SIBLING_07_CORE: "Right rear three-quarter",
  SIBLING_07_RECOVERY: "Right rear recovery",
} as const satisfies Record<StudioAtelierUiOperation["stage"], string>;

const MUTATION_ACTIONS = new Set<StudioAtelierUiOperation["nextAction"]>([
  "GENERATE",
  "REVIEW",
  "LOCK_OR_REUSE",
  "RESUME_RECORDED_REVIEW",
  "GENERATE_CORRECTION",
]);

function readableError(error: unknown): Readonly<{ detail: string; title: string }> {
  if (isStudioAtelierUiReadError(error)) {
    return {
      detail: `${error.message} ${error.recovery}`,
      title: error.status === 401 ? "Sign in required" : "Saved operation unavailable",
    };
  }
  return {
    detail: "Check this exact saved operation again. No generation was started.",
    title: "Connection interrupted",
  };
}

export function StudioAtelierOperationWorkspace({
  operationId,
}: Readonly<{ operationId: string }>) {
  const requestInFlightRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const [operation, setOperation] = useState<StudioAtelierUiOperation | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [pollAttempt, setPollAttempt] = useState(0);
  const [readError, setReadError] = useState<Readonly<{ detail: string; title: string }> | null>(null);
  const [failedMediaUrl, setFailedMediaUrl] = useState<string | null>(null);

  const refresh = useCallback(async (mode: "initial" | "manual" | "poll") => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    if (mode !== "poll") setChecking(true);
    setReadError(null);
    try {
      const incoming = await readStudioAtelierOperation(operationId, controller.signal);
      setOperation((current) => retainNewestStudioAtelierOperation(current, incoming));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setReadError(readableError(error));
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        requestInFlightRef.current = false;
        setInitialLoading(false);
        if (mode !== "poll") setChecking(false);
      }
    }
  }, [operationId]);

  useEffect(() => {
    void refresh("initial");
    return () => {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      requestInFlightRef.current = false;
    };
  }, [refresh]);

  const waitingForDurableWork = operation
    ? shouldPollStudioAtelierOperation(operation)
    : false;

  useEffect(() => {
    if (
      !waitingForDurableWork
      || requestInFlightRef.current
      || pollAttempt >= RECONCILIATION_DELAYS_MS.length
    ) return;
    const timeout = window.setTimeout(() => {
      setPollAttempt((current) => current + 1);
      void refresh("poll");
    }, RECONCILIATION_DELAYS_MS[pollAttempt]);
    return () => window.clearTimeout(timeout);
  }, [operation?.version, pollAttempt, refresh, waitingForDurableWork]);

  const mediaUrl = operation ? studioAtelierReviewMediaUrl(operation) : null;
  const mediaVisible = mediaUrl !== null && mediaUrl !== failedMediaUrl;
  const presentation = operation ? statePresentation[operation.state] : null;
  const mutationBlocked = operation ? MUTATION_ACTIONS.has(operation.nextAction) : false;
  const pollingExhausted = waitingForDurableWork
    && pollAttempt >= RECONCILIATION_DELAYS_MS.length;

  const checkNow = useCallback(() => {
    if (requestInFlightRef.current) return;
    setPollAttempt(0);
    void refresh("manual");
  }, [refresh]);

  const stage = (
    <section aria-busy={initialLoading || undefined} aria-label="Atelier review stage" className="review-stage">
      <div className="stage-main">
        {mediaVisible && operation ? (
          <img
            alt={`${stageLabel[operation.stage]}, view ${operation.view}, quality-cleared review artifact`}
            className="visual-asset ratio-portrait"
            height={1536}
            onError={() => setFailedMediaUrl(mediaUrl)}
            src={mediaUrl}
            width={1024}
          />
        ) : (
          <div
            aria-label={initialLoading ? "Checking saved operation" : "Preview stays private"}
            className="empty-authority"
          >
            <LockKeyhole aria-hidden="true" size={48} />
            <span aria-hidden="true">{initialLoading ? "Checking" : "Private"}</span>
          </div>
        )}
      </div>
    </section>
  );

  return (
    <StudioAdaptiveWorkspace
      active
      className="studio-atelier-operation-workspace"
      initialDetent="half"
      stage={stage}
      surfaceLabel="Atelier operation controls"
    >
      <StudioStackPage aria-busy={checking || undefined} className="review-page" kind="workflow">
        <h1 className="sr-only">Durable Atelier operation</h1>
        <StudioStackSection
          meta={operation ? `View ${operation.view}` : "Saved operation"}
          title={operation ? stageLabel[operation.stage] : "Atelier recovery"}
        >
          <div className="studio-media-review-controls">
            {initialLoading ? (
              <StudioFeedback
                detail="Reading the durable ledger only. No generation will start."
                state="loading"
                title="Checking saved operation…"
              />
            ) : null}

            {checking && !initialLoading && !operation ? (
              <StudioFeedback
                detail="Rereading this exact durable record only. No command will be replayed."
                state="loading"
                title="Checking current state…"
              />
            ) : null}

            {readError ? (
              <StudioFeedback
                action={checking ? undefined : (
                  <button className="button button-secondary" onClick={checkNow} type="button">
                    Check again
                  </button>
                )}
                detail={readError.detail}
                state="error"
                title={readError.title}
              />
            ) : null}

            {operation && presentation ? (
              <StudioFeedback
                detail={presentation.detail}
                state={operation.state === "LOCKED"
                  ? "success"
                  : waitingForDurableWork
                    ? "loading"
                    : operation.state.includes("FAIL") || operation.state === "BLOCKED_USER_DIRECTION"
                      ? "error"
                      : "empty"}
                title={presentation.label}
              />
            ) : null}

            {mutationBlocked ? (
              <StudioFeedback
                detail="This recovery screen has no command capability. No generation, correction, review decision, or lock can start here."
                state="empty"
                title="Zero-spend recovery only"
              />
            ) : null}

            {pollingExhausted ? (
              <StudioFeedback
                detail="Automatic checks paused after a bounded recovery window. The durable operation is unchanged; checking again still cannot start provider work."
                state="empty"
                title="Still working in the background"
              />
            ) : null}

            {mediaUrl && failedMediaUrl === mediaUrl ? (
              <StudioFeedback
                detail="The authenticated media boundary did not return this exact review artifact. Check current state before trying again."
                state="error"
                title="Review preview unavailable"
              />
            ) : null}

            {operation ? (
              <button
                className="button button-primary button-full"
                disabled={checking}
                onClick={checkNow}
                type="button"
              >
                <RefreshCw aria-hidden="true" size={17} />
                {checking ? "Checking current state…" : "Check current state"}
              </button>
            ) : null}

            <Link className="button button-secondary button-full" href="/studio/media/new">
              Use current Intake
            </Link>

            {operation ? (
              <details className="studio-transition-action">
                <summary>Operation details<span>Durable record</span></summary>
                <div className="studio-transition-action-body">
                  <p><ShieldCheck aria-hidden="true" size={17} /> Server state is the authority.</p>
                  <section className="shoot-record">
                    <dl>
                      <div><dt>Operation</dt><dd>{operation.operationId}</dd></div>
                      <div><dt>Stage</dt><dd>{stageLabel[operation.stage]}</dd></div>
                      <div><dt>View</dt><dd>{operation.view}</dd></div>
                      <div><dt>State</dt><dd>{presentation?.label}</dd></div>
                      <div><dt>Revision</dt><dd>{operation.version}</dd></div>
                      <div><dt>Preview</dt><dd>{operation.candidateVisibility === "REVIEWABLE" ? "Reviewable" : "Private"}</dd></div>
                    </dl>
                  </section>
                  {operation.continuationOperationId ? (
                    <Link
                      className="button button-secondary button-full"
                      href={`/studio/media/atelier/${encodeURIComponent(operation.continuationOperationId)}`}
                    >
                      Open saved correction
                    </Link>
                  ) : null}
                  <Link className="button button-secondary button-full" href="/studio/media">
                    All media
                  </Link>
                </div>
              </details>
            ) : null}
          </div>
        </StudioStackSection>
      </StudioStackPage>
    </StudioAdaptiveWorkspace>
  );
}
