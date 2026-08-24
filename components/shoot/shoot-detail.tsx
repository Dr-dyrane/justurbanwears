"use client";

/* Protected Studio media uses runtime asset URLs. */
/* eslint-disable @next/next/no-img-element */

import { useParams } from "next/navigation";
import { useId, useState } from "react";
import { Check, CircleAlert, RotateCcw, Shirt } from "lucide-react";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { useStudio } from "../studio/studio-provider";
import { StatusPill } from "../ui/status-pill";
import { useStudioStackRegistration } from "../studio/navigation/studio-stack-context";

type ApiFailure = { error?: { message?: string; recovery?: string } };

async function responseBody<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T | ApiFailure;
  if (response.ok) return body as T;
  const failure = body as ApiFailure;
  throw new Error([failure.error?.message, failure.error?.recovery].filter(Boolean).join(" ") || "That decision could not be saved.");
}

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function ShootDetail() {
  const params = useParams<{ id: string }>();
  const { authority } = useStudio();
  const media = authority.snapshot?.media.find((item) => item.id === params.id);
  const [note, setNote] = useState("");
  const [truthConfirmed, setTruthConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [receipt, setReceipt] = useState("");
  const [error, setError] = useState("");
  const truthConfirmationId = useId();
  useStudioStackRegistration({
    backHref: "/studio/media",
    backLabel: "Atelier",
    title: media?.sku ?? (media ? label(media.operation) : "Atelier media"),
  });

  if (authority.status === "idle" || authority.status === "loading") return <div className="studio-loading" role="status">Opening media…</div>;
  if (!media) return <div className="empty-state"><h1>Media not found</h1><Link href="/studio/media">Return to Media</Link></div>;
  const completion = ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"].includes(media.operation);
  const canDecide = media.state === "COMPLETE";
  const canRetry = completion && ["COMPLETE", "FAILED", "REJECTED"].includes(media.state);

  async function decide(decision: "KEEP" | "REJECT" | "RETRY") {
    if (!media) return;
    setPending(true);
    setError("");
    setReceipt("");
    try {
      const path = completion
        ? `/api/studio/wardrobe/${media.wardrobeItemId}/completions/${media.id}/decision`
        : `/api/studio/wardrobe/${media.wardrobeItemId}/wear/${media.id}/decision`;
      const body = completion
        ? { decision, correction: decision === "RETRY" ? note.trim() || undefined : undefined, truthConfirmed: decision === "KEEP" ? truthConfirmed : undefined }
        : { decision, note: note.trim() || undefined };
      const response = await fetch(path, {
        body: JSON.stringify(body),
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        method: "POST",
      });
      await responseBody<unknown>(response);
      setReceipt(decision === "KEEP"
        ? "View kept in the private garment record. Next: open the piece."
        : decision === "REJECT"
          ? "View rejected; its history remains. Next: return to Atelier."
          : "One corrected retry is running. Next: return to Atelier to monitor it.");
      await authority.refresh();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That decision could not be saved.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="review-page">
      <div className="detail-topbar studio-page-tools"><StatusPill status={media.state} /><Link className="button button-secondary" href={`/studio/wardrobe/${media.wardrobeItemId}`}>Open piece</Link></div>
      <div className="review-workspace">
        <section className="review-stage"><div className="stage-main">{media.outputUrl ? <img alt={`${media.title}, ${label(media.operation)} review`} className="visual-asset ratio-portrait" height={1280} src={media.outputUrl} style={{ objectFit: "contain" }} width={1024} /> : <div className="empty-authority"><Shirt aria-hidden="true" size={52} /><span>{media.state === "FAILED" ? "View failed" : "View is building"}</span></div>}</div></section>
        <aside className="review-panel"><div className="review-scroll">
          <p className="eyebrow">Review</p><h1>{label(media.operation)}</h1>
          <div className="compare-pair"><div><span className="empty-authority"><Shirt aria-hidden="true" size={26} /></span><span>Garment authority</span></div><div><span className="empty-authority">{media.modelName ?? "AI"}</span><span>{media.modelName ? "Model authority" : "Generated view"}</span></div></div>
          <dl className="studio-model-facts"><div><dt>Piece</dt><dd>{media.title}</dd></div><div><dt>State</dt><dd>{label(media.state)}</dd></div><div><dt>Created</dt><dd>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(media.createdAt))}</dd></div></dl>
          {canDecide && completion ? <label className="studio-settings-switch" htmlFor={truthConfirmationId}><span className="sr-only">Matches the real garment</span><span><strong>Matches the real garment</strong><small>Unseen construction stays unverified.</small></span><input checked={truthConfirmed} id={truthConfirmationId} onChange={(event) => setTruthConfirmed(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label> : null}
          {(canDecide || canRetry) ? <label className="review-note"><span>{canRetry ? "Correction or note" : "Review note"}</span><textarea maxLength={500} onChange={(event) => setNote(event.target.value)} rows={3} value={note} /></label> : null}
          {canDecide ? <div className="studio-inventory-decision-grid"><button className="button button-primary button-full" disabled={pending || (completion && !truthConfirmed)} onClick={() => void decide("KEEP")} type="button"><Check aria-hidden="true" size={17} />Keep view</button><button className="button button-secondary button-full" disabled={pending} onClick={() => void decide("REJECT")} type="button">Reject</button></div> : null}
          {canRetry ? <button className="button button-secondary button-full" disabled={pending} onClick={() => void decide("RETRY")} type="button"><RotateCcw aria-hidden="true" size={17} />Retry once</button> : null}
          {!completion && ["FAILED", "REJECTED"].includes(media.state) ? <Link className="button button-primary button-full" href={`/studio/wardrobe/${media.wardrobeItemId}`}>Retry in Piece</Link> : null}
          {receipt ? <div className="studio-quiet-empty" aria-live="polite" role="status"><Check aria-hidden="true" size={20} /><div><strong>Saved</strong><p>{receipt}</p></div></div> : null}
          {error ? <div className="studio-quiet-empty" role="alert"><CircleAlert aria-hidden="true" size={20} /><div><strong>Couldn’t save</strong><p>{error}</p></div></div> : null}
        </div></aside>
      </div>
      <details className="studio-transition-action">
        <summary>Generation history<span>Provenance</span></summary>
        <div className="studio-transition-action-body"><section className="shoot-record"><dl><div><dt>Garment</dt><dd>{media.sku ?? media.wardrobeItemId}</dd></div><div><dt>Operation</dt><dd>{label(media.operation)}</dd></div><div><dt>Model</dt><dd>{media.modelName ?? "No model"}</dd></div><div><dt>State</dt><dd>{label(media.state)}</dd></div><div><dt>Cost</dt><dd>{media.costUsd ? `$${media.costUsd}` : "Not recorded"}</dd></div><div><dt>Updated</dt><dd>{new Date(media.updatedAt).toLocaleString("en-NG")}</dd></div></dl></section></div>
      </details>
    </div>
  );
}
