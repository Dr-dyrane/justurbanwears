"use client";

/* Protected Studio media uses runtime asset URLs. */
/* eslint-disable @next/next/no-img-element */

import { useParams } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import { Check, PencilLine, Shirt } from "lucide-react";
import { StudioFeedback } from "../studio/atoms/studio-feedback";
import { StudioLoadingStage } from "../studio/atoms/studio-loading-stage";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { StudioStackPage, StudioStackSection } from "../studio/atoms/studio-stack-page";
import { useStudio } from "../studio/studio-provider";
import { useStudioStackRegistration } from "../studio/navigation/studio-stack-context";
import { StudioAdaptiveWorkspace } from "../studio/workspace/studio-adaptive-workspace";
import { StudioEngineError } from "../studio/garment-intake/engine-client";
import {
  clearMediaReviewIntent,
  createMediaReviewIntent,
  isAmbiguousMediaReviewError,
  persistMediaReviewIntent,
  readMediaReviewIntent,
  reconcileMediaReviewIntent,
  type MediaReviewDecision,
  type MediaReviewIntent,
} from "./media-review-client";
import { MediaStateMeta, mediaStatePresentation } from "./media-state-presentation";

type ApiFailure = { error?: { message?: string; recovery?: string } };

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return body as T;
  const failure = body as ApiFailure;
  throw new StudioEngineError(
    response.status,
    "ENGINE_ERROR",
    failure.error?.message || "That decision could not be saved.",
    failure.error?.recovery,
  );
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function reviewReceipt(decision: MediaReviewDecision, completion: boolean) {
  if (decision === "KEEP") return "View kept in the private garment record. Next: open the piece.";
  if (decision === "REJECT") return "View rejected; its history remains. Next: return to Atelier.";
  return completion
    ? "The one requested correction is running. Next: return to Atelier to monitor it."
    : "Correction saved. Next: open the piece to create the corrected view.";
}

export function ShootDetail() {
  const params = useParams<{ id: string }>();
  const { application, authority } = useStudio();
  const media = authority.snapshot?.media.find((item) => item.id === params.id);
  const operatorScope = application.snapshot?.operator.storageScope ?? "";
  const [note, setNote] = useState("");
  const [truthConfirmed, setTruthConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [pendingLabel, setPendingLabel] = useState("");
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const [recoveryIntent, setRecoveryIntent] = useState<MediaReviewIntent | null>(null);
  const [settledMediaId, setSettledMediaId] = useState("");
  const pendingRef = useRef(false);
  const truthConfirmationId = useId();
  useStudioStackRegistration({
    backHref: "/studio/media",
    backLabel: "Atelier",
    title: media?.sku ?? (media ? label(media.operation) : "Atelier media"),
  });

  const mediaId = media?.id;
  useEffect(() => {
    if (!operatorScope || !mediaId) return;
    const saved = readMediaReviewIntent(operatorScope, mediaId);
    if (!saved) return;
    queueMicrotask(() => {
      setRecoveryIntent(saved);
      setError("Studio has a saved decision with an unconfirmed outcome. Check current Studio state before any other review action.");
    });
  }, [mediaId, operatorScope]);

  if (authority.status === "idle" || authority.status === "loading") return <StudioLoadingStage label="Opening media…" />;
  if (application.status === "idle" || application.status === "loading") return <StudioLoadingStage label="Verifying Studio operator…" />;
  if (authority.status === "error") return <StudioFeedback detail={authority.error} state="error" title="Media unavailable" />;
  if (application.status === "error" || !operatorScope) return <StudioFeedback detail={application.error || "Studio could not verify the current operator."} state="error" title="Media unavailable" />;
  if (!media) return <StudioFeedback action={<Link className="button button-secondary" href="/studio/media">Return to Media</Link>} state="empty" title="Media not found" />;
  const completion = ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"].includes(media.operation);
  const decisionBlocked = recoveryIntent !== null || settledMediaId === media.id;
  const canReview = !decisionBlocked && media.state === "COMPLETE";
  const canFix = !decisionBlocked && (completion
    ? ["COMPLETE", "FAILED", "REJECTED"].includes(media.state)
    : media.state === "COMPLETE");
  const correction = note.trim();
  const statePresentation = mediaStatePresentation(media.state);

  async function reconcileSavedDecision(intent: MediaReviewIntent) {
    if (pendingRef.current) return;
    pendingRef.current = true;
    setPending(true);
    setPendingLabel("Checking saved decision");
    setError("");
    try {
      const result = await reconcileMediaReviewIntent(intent);
      if (result.kind !== "reflected") {
        setError(result.error?.message || "Studio still cannot confirm this decision. No review action was replayed.");
        return;
      }
      clearMediaReviewIntent(intent, operatorScope);
      setRecoveryIntent(null);
      setSettledMediaId(intent.mediaId);
      setReceipt(reviewReceipt(intent.decision, completion));
      void authority.refresh();
    } finally {
      pendingRef.current = false;
      setPending(false);
      setPendingLabel("");
    }
  }

  async function decide(decision: "KEEP" | "FIX" | "REJECT") {
    if (!media || pendingRef.current || recoveryIntent) return;
    if (decision === "FIX" && !correction) {
      setError("Describe the one thing to fix before continuing.");
      return;
    }
    if (decision === "KEEP" && completion && !truthConfirmed) {
      setError("Confirm that this view matches the real garment before keeping it.");
      return;
    }
    if (decision !== "FIX" && !canReview) {
      setError("This view is not awaiting a review decision.");
      return;
    }
    if (decision === "FIX" && !canFix) {
      setError("This view cannot be corrected from here.");
      return;
    }
    pendingRef.current = true;
    setPending(true);
    setPendingLabel(decision === "KEEP" ? "Keeping view" : decision === "REJECT" ? "Rejecting view" : "Sending one correction");
    setError("");
    setReceipt("");
    let intent: MediaReviewIntent | null = null;
    let dispatched = false;
    try {
      intent = createMediaReviewIntent({
        decision,
        media,
        snapshot: authority.snapshot!,
      });
      persistMediaReviewIntent(intent, operatorScope);
      setRecoveryIntent(intent);
      const path = completion
        ? `/api/studio/wardrobe/${media.wardrobeItemId}/completions/${media.id}/decision`
        : `/api/studio/wardrobe/${media.wardrobeItemId}/wear/${media.id}/decision`;
      const apiDecision = decision === "FIX" ? (completion ? "RETRY" : "EDIT") : decision;
      const body = completion
        ? { decision: apiDecision, correction: decision === "FIX" ? correction : undefined, truthConfirmed: decision === "KEEP" ? truthConfirmed : undefined }
        : { decision: apiDecision, note: decision === "FIX" ? correction : undefined };
      dispatched = true;
      const response = await fetch(path, {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
      await responseBody<unknown>(response);
      clearMediaReviewIntent(intent, operatorScope);
      setRecoveryIntent(null);
      setSettledMediaId(media.id);
      setReceipt(reviewReceipt(decision, completion));
      void authority.refresh();
    } catch (cause) {
      if (!intent || !dispatched) {
        if (intent) clearMediaReviewIntent(intent, operatorScope);
        setRecoveryIntent(null);
        setError(cause instanceof Error ? cause.message : "Studio did not send that decision.");
      } else if (isAmbiguousMediaReviewError(cause)) {
        const reconciled = await reconcileMediaReviewIntent(intent);
        if (reconciled.kind === "reflected") {
          clearMediaReviewIntent(intent, operatorScope);
          setRecoveryIntent(null);
          setSettledMediaId(media.id);
          setReceipt(reviewReceipt(decision, completion));
          void authority.refresh();
        } else {
          setRecoveryIntent(intent);
          setError(reconciled.error?.message || "Studio could not confirm the saved decision. Check current state; no review action will be replayed.");
        }
      } else {
        clearMediaReviewIntent(intent, operatorScope);
        setRecoveryIntent(null);
        setError(cause instanceof Error ? cause.message : "That decision could not be saved.");
      }
    } finally {
      pendingRef.current = false;
      setPending(false);
      setPendingLabel("");
    }
  }

  return (
    <StudioAdaptiveWorkspace
      active
      initialDetent="half"
      stage={(
        <section className="review-stage"><div className="stage-main">{media.outputUrl ? <img alt={`${media.title}, ${label(media.operation)} review`} className="visual-asset ratio-portrait" height={1280} src={media.outputUrl} width={1024} /> : <div className="empty-authority"><Shirt aria-hidden="true" size={52} /><span>{statePresentation.label}</span></div>}</div></section>
      )}
      surfaceLabel="Media review controls"
    >
      <StudioStackPage className="review-page" kind="record">
        <h1 className="sr-only">{media.sku ?? media.title}</h1>
        <StudioStackSection action={<Link className="button button-secondary" href={`/studio/wardrobe/${media.wardrobeItemId}`}>Open piece</Link>} meta={<MediaStateMeta state={media.state} />} title={label(media.operation)}>
        <div className="studio-media-review-controls">
        <p className="review-piece-name">{media.title}</p>
        <MediaStateMeta state={media.state} />
        <p>{statePresentation.detail}</p>
        {canReview && completion ? <label className="studio-settings-switch" htmlFor={truthConfirmationId}><span className="sr-only">Matches the real garment</span><span><strong>Matches the real garment</strong><small>Required before Keep. Unseen construction stays unverified.</small></span><input checked={truthConfirmed} id={truthConfirmationId} onChange={(event) => setTruthConfirmed(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label> : null}
        {canReview ? <button className="button button-primary button-full" disabled={pending || (completion && !truthConfirmed)} onClick={() => void decide("KEEP")} type="button"><Check aria-hidden="true" size={17} />Keep</button> : null}
        {canReview ? <details className="studio-transition-action review-secondary-decisions"><summary>Fix one thing or Reject<span>Other decisions</span></summary><div className="studio-transition-action-body"><label className="review-note"><span>Describe one correction</span><textarea aria-describedby={`${truthConfirmationId}-correction-help`} maxLength={500} onChange={(event) => setNote(event.target.value)} required rows={3} value={note} /></label><small id={`${truthConfirmationId}-correction-help`}>Required for Fix one thing · up to 500 characters.</small><button className="button button-secondary button-full" disabled={pending || !correction} onClick={() => void decide("FIX")} type="button"><PencilLine aria-hidden="true" size={17} />Fix one thing</button><button className="button button-secondary button-full" disabled={pending} onClick={() => void decide("REJECT")} type="button">Reject</button></div></details> : null}
        {!canReview && canFix ? <div className="studio-transition-action-body"><label className="review-note"><span>Describe one correction</span><textarea aria-describedby={`${truthConfirmationId}-correction-help`} maxLength={500} onChange={(event) => setNote(event.target.value)} required rows={3} value={note} /></label><small id={`${truthConfirmationId}-correction-help`}>Required for Fix one thing · up to 500 characters.</small><button className="button button-primary button-full" disabled={pending || !correction} onClick={() => void decide("FIX")} type="button"><PencilLine aria-hidden="true" size={17} />Fix one thing</button></div> : null}
        {!completion && ["FAILED", "REJECTED"].includes(media.state) ? <Link className="button button-primary button-full" href={`/studio/wardrobe/${media.wardrobeItemId}`}>Open piece</Link> : null}
        {["PENDING", "RUNNING"].includes(media.state) ? <StudioFeedback detail={statePresentation.detail} state="loading" title={statePresentation.label} /> : null}
        {media.state === "APPROVED" ? <StudioFeedback detail={statePresentation.detail} state="success" title="Approved" /> : null}
        {media.state === "INDETERMINATE" ? <StudioFeedback detail={statePresentation.detail} state="error" title="Result needs checking" /> : null}
        {media.state === "FAILED" ? <StudioFeedback detail={statePresentation.detail} state="error" title="Generation failed" /> : null}
        {media.state === "REJECTED" ? <StudioFeedback detail={statePresentation.detail} state="empty" title="View rejected" /> : null}
        {recoveryIntent ? <StudioFeedback action={pending ? undefined : <button className="button button-secondary" onClick={() => void reconcileSavedDecision(recoveryIntent)} type="button">Check current state</button>} detail={error || "Studio will reread this exact decision before enabling another review action."} state="error" title="Decision outcome unconfirmed" /> : null}
        {pending ? <StudioFeedback state="loading" title={pendingLabel} /> : null}
        {receipt ? <StudioFeedback detail={receipt} state="success" title="Saved" /> : null}
        {error && !recoveryIntent ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}
        <details className="studio-transition-action">
          <summary>Generation history<span>Provenance</span></summary>
          <div className="studio-transition-action-body"><div className="compare-pair"><div><span className="empty-authority"><Shirt aria-hidden="true" size={26} /></span><span>Garment authority</span></div><div><span className="empty-authority">{media.modelName ?? "AI"}</span><span>{media.modelName ? "Model authority" : "Generated view"}</span></div></div><section className="shoot-record"><dl><div><dt>Garment</dt><dd>{media.sku ?? media.wardrobeItemId}</dd></div><div><dt>Operation</dt><dd>{label(media.operation)}</dd></div><div><dt>Model</dt><dd>{media.modelName ?? "No model"}</dd></div><div><dt>State</dt><dd>{statePresentation.label}</dd></div><div><dt>Created</dt><dd>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(media.createdAt))}</dd></div><div><dt>Cost</dt><dd>{media.costUsd ? `$${media.costUsd}` : "Not recorded"}</dd></div><div><dt>Updated</dt><dd>{new Date(media.updatedAt).toLocaleString("en-NG")}</dd></div></dl></section></div>
        </details>
        </div>
        </StudioStackSection>
      </StudioStackPage>
    </StudioAdaptiveWorkspace>
  );
}
