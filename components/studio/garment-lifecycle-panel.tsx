"use client";

/* Operator-protected previews and immutable public Blob assets use verified dimensions. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  Archive,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  History,
  ImagePlus,
  LoaderCircle,
  Pencil,
  RotateCcw,
  Send,
  Trash2,
} from "lucide-react";
import type { IntakeFacts } from "../../lib/studio/engine/contracts";
import type {
  GarmentLifecycleCommand,
  GarmentLifecycleWorkspace,
  GarmentRevisionMediaRole,
} from "../../lib/studio/engine/garment-lifecycle-contracts";
import { WardrobeMotion } from "../brand/wardrobe-motion";
import {
  StudioDecisionSheet,
  type StudioDecisionResult,
} from "./atoms/studio-decision-sheet";
import { StudioMediaButton, type StudioMediaItem } from "./media-viewer";

type ErrorBody = { error?: { message?: string; recovery?: string } };
type GarmentDecision = "ARCHIVE" | "DISCARD_REVISION" | "PUBLISH_REVISION" | "REPUBLISH" | "UNPUBLISH";

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency: "NGN",
    maximumFractionDigits: 0,
  }).format(value);
}

function stateLabel(state: GarmentLifecycleWorkspace["state"]) {
  return state === "PUBLISHED" ? "Live in Shop"
    : state === "UNPUBLISHED" ? "Private · off Shop"
      : state === "ARCHIVED" ? "Archived" : "Private";
}

async function responseJson<T>(response: Response): Promise<T> {
  const body = await response.json().catch(() => ({})) as T & ErrorBody;
  if (!response.ok) {
    throw new Error([body.error?.message, body.error?.recovery].filter(Boolean).join(" ") || "That action did not finish.");
  }
  return body;
}

export function GarmentLifecyclePanel({
  initialAction,
  onWorkspaceChange,
  wardrobeItemId,
}: {
  initialAction?: "price";
  onWorkspaceChange?(workspace: GarmentLifecycleWorkspace): void;
  wardrobeItemId: string;
}) {
  const [workspace, setWorkspace] = useState<GarmentLifecycleWorkspace>();
  const [draftFacts, setDraftFacts] = useState<IntakeFacts>();
  const [editing, setEditing] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<GarmentDecision | null>(null);
  const [decisionReturnFocus, setDecisionReturnFocus] = useState<HTMLElement | null>(null);
  const [milestone, setMilestone] = useState<"published" | "returned" | null>(null);
  const [reload, setReload] = useState(0);
  const priceRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const initialActionHandledRef = useRef(false);
  const publicationKeyRef = useRef(`studio-revision:${wardrobeItemId}:${crypto.randomUUID()}`);

  const accept = useCallback((next: GarmentLifecycleWorkspace) => {
    setWorkspace(next);
    setDraftFacts(next.editableFacts);
    setError("");
    onWorkspaceChange?.(next);
  }, [onWorkspaceChange]);

  useEffect(() => {
    const controller = new AbortController();
    initialActionHandledRef.current = false;
    setWorkspace(undefined);
    setError("");
    setMilestone(null);
    setDecision(null);
    setDecisionReturnFocus(null);
    publicationKeyRef.current = `studio-revision:${wardrobeItemId}:${crypto.randomUUID()}`;
    void fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then((response) => responseJson<{ workspace: GarmentLifecycleWorkspace }>(response))
      .then((body) => accept(body.workspace))
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Piece controls are unavailable.");
      });
    return () => controller.abort();
  }, [accept, reload, wardrobeItemId]);

  useEffect(() => {
    if (
      initialAction !== "price"
      || initialActionHandledRef.current
      || !workspace
      || workspace.wardrobeItemId !== wardrobeItemId
      || !workspace.allowedActions.includes("EDIT")
    ) return;
    initialActionHandledRef.current = true;
    setDraftFacts(workspace.editableFacts);
    setEditing(true);
    setError("");
    requestAnimationFrame(() => priceRef.current?.focus({ preventScroll: true }));
  }, [initialAction, wardrobeItemId, workspace]);

  async function command(value: GarmentLifecycleCommand, action: string): Promise<StudioDecisionResult> {
    if (busy) return { error: "Another Studio change is still finishing.", ok: false };
    setBusy(action);
    setError("");
    setMilestone(null);
    try {
      const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await responseJson<{ workspace: GarmentLifecycleWorkspace }>(response);
      accept(body.workspace);
      if (value.command === "SAVE_FACTS") setEditing(false);
      if (value.command === "PUBLISH_REVISION") {
        publicationKeyRef.current = `studio-revision:${wardrobeItemId}:${crypto.randomUUID()}`;
        setMilestone("published");
      }
      if (value.command === "REPUBLISH") setMilestone("returned");
      return { ok: true };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That action did not finish.";
      setError(message);
      return { error: message, ok: false };
    } finally {
      setBusy("");
    }
  }

  function requestDecision(nextDecision: GarmentDecision, trigger: HTMLElement) {
    setDecision(nextDecision);
    setDecisionReturnFocus(trigger);
    setError("");
  }

  async function executeDecision(nextDecision: GarmentDecision): Promise<StudioDecisionResult> {
    if (nextDecision === "PUBLISH_REVISION") {
      if (!workspace?.draft) return { error: "This private revision is no longer available.", ok: false };
      return command({
        command: "PUBLISH_REVISION",
        confirmation: "PUBLISH_REVISION",
        expectedRevision: workspace.draft.expectedRevision,
        idempotencyKey: publicationKeyRef.current,
        publicMediaConfirmed: true,
      }, nextDecision);
    }
    if (nextDecision === "DISCARD_REVISION") {
      if (!workspace?.draft) return { error: "This private revision is no longer available.", ok: false };
      return command({
        command: "DISCARD_REVISION",
        expectedRevision: workspace.draft.expectedRevision,
      }, nextDecision);
    }
    if (nextDecision === "ARCHIVE") {
      if (!workspace) return { error: "Piece controls are no longer available.", ok: false };
      return command({
        command: "ARCHIVE",
        confirmation: "ARCHIVE",
        expectedVersion: workspace.itemVersion,
      }, nextDecision);
    }
    if (!workspace?.live) return { error: "The Shop revision changed. Review the piece again.", ok: false };
    if (nextDecision === "UNPUBLISH") {
      return command({
        command: "UNPUBLISH",
        confirmation: "UNPUBLISH",
        expectedRevision: workspace.live.sourceRevision,
      }, nextDecision);
    }
    return command({
      command: "REPUBLISH",
      confirmation: "REPUBLISH",
      expectedRevision: workspace.live.sourceRevision,
    }, nextDecision);
  }

  async function replaceMedia(role: GarmentRevisionMediaRole, file?: File) {
    if (!file || !workspace || busy) return;
    setBusy(role);
    setError("");
    const body = new FormData();
    body.set("file", file);
    body.set("role", role);
    body.set("expectedVersion", String(workspace.itemVersion));
    try {
      const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle/media`, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const result = await responseJson<{ workspace: GarmentLifecycleWorkspace }>(response);
      accept(result.workspace);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "That photo did not save.");
    } finally {
      setBusy("");
    }
  }

  function beginEdit(priceOnly = false) {
    if (!workspace) return;
    setDraftFacts(workspace.editableFacts);
    setEditing(true);
    setError("");
    if (priceOnly) requestAnimationFrame(() => priceRef.current?.focus({ preventScroll: true }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !draftFacts) return;
    void command({
      command: "SAVE_FACTS",
      expectedVersion: workspace.draft?.version ?? workspace.itemVersion,
      facts: draftFacts,
    }, "SAVE_FACTS");
  }

  if (!workspace) {
    return (
      <section className="studio-piece-shop" id="garment-lifecycle" aria-live="polite">
        {error ? <><p className="studio-engine-error" role="alert">{error}</p><button className="button button-secondary" onClick={() => setReload((value) => value + 1)} type="button">Try again</button></> : <span className="studio-inline-state"><LoaderCircle aria-hidden="true" className="studio-spin" size={16} />Opening piece controls…</span>}
      </section>
    );
  }

  const editable = workspace.allowedActions.includes("EDIT");
  const liveMediaItems: StudioMediaItem[] = workspace.live?.media.map((media) => ({
    alt: `${workspace.facts.title} · ${media.label.toLowerCase()}`,
    label: media.label,
    src: media.src,
  })) ?? [];
  const decisionCopy = decision ? {
    ARCHIVE: {
      busyLabel: "Archiving this piece",
      confirmLabel: "Archive piece",
      consequence: "It leaves Shop, becomes read-only here, and remains in history.",
      destructive: true,
      receiptDetail: "The piece is off Shop and preserved in Studio history.",
      receiptTitle: "Piece archived",
      summary: `Archive ${workspace.facts.title}?`,
      title: "Archive this piece?",
    },
    DISCARD_REVISION: {
      busyLabel: "Discarding this revision",
      confirmLabel: "Discard revision",
      consequence: "Private edits in this revision are removed. The current Shop listing stays unchanged.",
      destructive: true,
      receiptDetail: "The private revision was removed; Shop was not changed.",
      receiptTitle: "Revision discarded",
      summary: `Discard private revision ${workspace.draft?.revisionNumber ?? ""}?`,
      title: "Discard this revision?",
    },
    PUBLISH_REVISION: {
      busyLabel: "Publishing this revision",
      confirmLabel: "Publish changes",
      consequence: "These exact facts and approved photos replace the current customer-facing listing.",
      destructive: false,
      receiptDetail: "Customers can now see this exact revision.",
      receiptTitle: "Published to Shop",
      summary: `${workspace.draft?.diff.length ?? 0} customer-visible change${workspace.draft?.diff.length === 1 ? "" : "s"} will go live.`,
      title: "Publish this revision?",
    },
    REPUBLISH: {
      busyLabel: "Returning this piece to Shop",
      confirmLabel: "Return to Shop",
      consequence: "The last approved listing becomes visible to customers again.",
      destructive: false,
      receiptDetail: "The approved listing is visible to customers again.",
      receiptTitle: "Returned to Shop",
      summary: `Return ${workspace.facts.title} to Shop?`,
      title: "Return to Shop?",
    },
    UNPUBLISH: {
      busyLabel: "Removing this piece from Shop",
      confirmLabel: "Remove from Shop",
      consequence: "Customers can no longer see it. The garment and approved listing stay private in Studio.",
      destructive: true,
      receiptDetail: "The piece is private and can be returned to Shop later.",
      receiptTitle: "Removed from Shop",
      summary: `Remove ${workspace.facts.title} from Shop?`,
      title: "Remove from Shop?",
    },
  }[decision] : null;

  return (
    <section className="studio-piece-shop studio-listing-editor" id="garment-lifecycle" aria-labelledby="garment-lifecycle-title" ref={panelRef} tabIndex={-1}>
      <div className="studio-card-heading">
        <div><small>Listing</small><h3 id="garment-lifecycle-title">{stateLabel(workspace.state)}</h3></div>
        {busy ? <LoaderCircle aria-label="Working" className="studio-spin" size={18} /> : null}
      </div>

      {milestone ? (
        <section aria-live="polite" className="juw-studio-publish-receipt">
          <div className="juw-receipt-motion">
            <WardrobeMotion artwork="logo" polarity="auto" size="sm" variant="success" />
          </div>
          <div>
            <small>Shop updated</small>
            <strong>{milestone === "published" ? "Published to Shop." : "Returned to Shop."}</strong>
            <p>{milestone === "published" ? "Customers can now see this exact revision." : "The approved listing is visible to customers again."}</p>
          </div>
        </section>
      ) : null}

      {!editing ? (
        <div className="studio-garment-facts">
          <span>{formatNaira(workspace.editableFacts.price)}</span>
          <span>{workspace.editableFacts.sizeLabel}</span>
          <span>{workspace.editableFacts.condition}</span>
        </div>
      ) : null}

      {!editing && editable ? (
        <div className="studio-card-actions">
          <button className="button button-primary" onClick={() => beginEdit(true)} type="button"><Pencil aria-hidden="true" size={16} />Change price</button>
          <button className="button button-secondary" onClick={() => beginEdit()} type="button">Edit details</button>
        </div>
      ) : null}

      {editing && draftFacts ? (
        <form onSubmit={save}>
          <div className="studio-form-grid studio-listing-fields">
            <label className="studio-field"><span>Name</span><input maxLength={100} onChange={(event) => setDraftFacts({ ...draftFacts, title: event.target.value })} required value={draftFacts.title} /></label>
            <label className="studio-field"><span>Price (₦)</span><input inputMode="numeric" min="1" onChange={(event) => setDraftFacts({ ...draftFacts, price: Math.max(0, Number(event.target.value)) })} ref={priceRef} required type="number" value={draftFacts.price || ""} /></label>
            <label className="studio-field"><span>Category</span><select onChange={(event) => setDraftFacts({ ...draftFacts, category: event.target.value as IntakeFacts["category"] })} value={draftFacts.category}>{["Dress", "Shirt", "Set", "Knitwear", "Skirt", "Trousers", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label>
            <label className="studio-field"><span>Colour</span><input maxLength={60} onChange={(event) => setDraftFacts({ ...draftFacts, colour: event.target.value })} required value={draftFacts.colour} /></label>
            <label className="studio-field"><span>Size</span><input maxLength={60} onChange={(event) => setDraftFacts({ ...draftFacts, sizeLabel: event.target.value })} required value={draftFacts.sizeLabel} /></label>
            <label className="studio-field"><span>Condition</span><input maxLength={100} onChange={(event) => setDraftFacts({ ...draftFacts, condition: event.target.value })} required value={draftFacts.condition} /></label>
          </div>
          <p className="studio-inline-state">{workspace.live ? "Changes stay private until you publish them." : "This changes the private garment only."}</p>
          <div className="studio-card-actions">
            <button className="button button-secondary" onClick={() => { setEditing(false); setDraftFacts(workspace.editableFacts); }} type="button">Cancel</button>
            <button className="button button-primary" disabled={busy === "SAVE_FACTS"} type="submit">{busy === "SAVE_FACTS" ? "Saving…" : workspace.live ? "Save private revision" : "Save changes"}</button>
          </div>
        </form>
      ) : null}

      {editable && workspace.mediaEditable ? (
        <div className="studio-direct-capture-actions" aria-label="Replace garment photos">
          {(["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] as const).map((role) => (
            <label aria-disabled={Boolean(busy)} className="button button-secondary" key={role}>
              {busy === role ? <LoaderCircle aria-hidden="true" className="studio-spin" size={16} /> : <ImagePlus aria-hidden="true" size={16} />}
              <span>Replace {role === "GARMENT_FRONT" ? "front" : role === "GARMENT_BACK" ? "back" : "detail"}</span>
              <input accept="image/jpeg,image/png,image/webp" disabled={Boolean(busy)} onChange={(event) => void replaceMedia(role, event.target.files?.[0])} type="file" />
            </label>
          ))}
        </div>
      ) : null}

      {editable && !workspace.mediaEditable ? <p className="studio-inline-state">The approved catalogue photo set stays unchanged when you edit these details.</p> : null}

      {workspace.draft ? (
        <section className="studio-publication-review" aria-label={`Revision ${workspace.draft.revisionNumber} review`}>
          <div className="studio-card-heading"><div><small>Private revision {workspace.draft.revisionNumber}</small><h3>Review changes</h3></div><span>{workspace.draft.diff.length} change{workspace.draft.diff.length === 1 ? "" : "s"}</span></div>
          {workspace.draft.media.length ? <div className="studio-publication-media">{workspace.draft.media.map((media) => <StudioMediaButton items={[{ alt: `${workspace.draft!.facts.title} · ${media.label.toLowerCase()}`, label: media.label, src: media.assetUrl }]} key={`${media.slot}:${media.id}`} label={`Preview ${media.label.toLowerCase()}`}><img alt={`${workspace.draft!.facts.title} · ${media.label.toLowerCase()}`} height={media.height} src={media.assetUrl} width={media.width} /></StudioMediaButton>)}</div> : null}
          {workspace.draft.diff.length ? <div className="studio-readiness-list">{workspace.draft.diff.map((change) => <p key={change.field}><strong>{change.label}</strong><span>{change.before} → {change.after}</span></p>)}</div> : <p className="studio-inline-state">No customer-visible change yet.</p>}
          <div className="studio-card-actions">
            <button className="button button-secondary" disabled={Boolean(busy)} onClick={(event) => requestDecision("DISCARD_REVISION", event.currentTarget)} type="button"><Trash2 aria-hidden="true" size={15} />Discard</button>
            <button className="button button-primary" disabled={Boolean(busy) || !workspace.draft.diff.length} onClick={(event) => requestDecision("PUBLISH_REVISION", event.currentTarget)} type="button"><Send aria-hidden="true" size={15} />Publish changes</button>
          </div>
        </section>
      ) : null}

      {workspace.live?.media.length ? (
        <div className="studio-publication-media" aria-label="Current Shop photos">
          {workspace.live.media.map((media, index) => <StudioMediaButton index={index} items={liveMediaItems} key={media.slot} label={`Preview current ${media.label.toLowerCase()}`}><img alt={`${workspace.facts.title} · ${media.label.toLowerCase()}`} src={media.src} /></StudioMediaButton>)}
        </div>
      ) : null}

      <div className="studio-card-actions">
        {workspace.state === "PUBLISHED" && workspace.live ? <><a className="button button-secondary" href={workspace.live.receipt.shopUrl}><Eye aria-hidden="true" size={15} />View in Shop</a><button className="button button-secondary" disabled={Boolean(busy)} onClick={(event) => requestDecision("UNPUBLISH", event.currentTarget)} type="button"><EyeOff aria-hidden="true" size={15} />Remove from Shop</button></> : null}
        {workspace.state === "UNPUBLISHED" && workspace.live ? <button className="button button-primary" disabled={Boolean(busy)} onClick={(event) => requestDecision("REPUBLISH", event.currentTarget)} type="button"><RotateCcw aria-hidden="true" size={15} />Return to Shop</button> : null}
        {workspace.allowedActions.includes("ARCHIVE") ? <button className="button button-secondary" disabled={Boolean(busy)} onClick={(event) => requestDecision("ARCHIVE", event.currentTarget)} type="button"><Archive aria-hidden="true" size={15} />Archive</button> : null}
      </div>

      {error ? <p className="studio-engine-error" role="alert">{error}</p> : null}
      <p className="studio-inline-state" aria-live="polite">{busy ? "Working…" : workspace.draft ? "Only Lulu sees this revision." : workspace.state === "PUBLISHED" ? "Customers see the published version." : "Customers cannot see this piece."}</p>

      <section className="studio-wear-history">
        <button aria-expanded={historyOpen} onClick={() => setHistoryOpen((value) => !value)} type="button"><History aria-hidden="true" size={16} /><span>History</span>{historyOpen ? <ChevronUp aria-hidden="true" size={16} /> : <ChevronDown aria-hidden="true" size={16} />}</button>
        {historyOpen ? <div>{workspace.history.length ? workspace.history.map((event) => <p key={event.id}><span>{event.summary}</span><small>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(event.occurredAt))}</small></p>) : <p><span>No changes yet</span><small>New actions appear here.</small></p>}</div> : null}
      </section>

      {decision && decisionCopy ? (
        <StudioDecisionSheet
          busyLabel={decisionCopy.busyLabel}
          confirmLabel={decisionCopy.confirmLabel}
          consequence={decisionCopy.consequence}
          destructive={decisionCopy.destructive}
          eyebrow="Listing review"
          fallbackFocus={panelRef.current}
          onConfirm={() => executeDecision(decision)}
          onDismiss={() => {
            setDecision(null);
            setDecisionReturnFocus(null);
          }}
          open
          receiptDetail={decisionCopy.receiptDetail}
          receiptTitle={decisionCopy.receiptTitle}
          returnFocus={decisionReturnFocus}
          summary={decisionCopy.summary}
          title={decisionCopy.title}
        >
          {decision === "PUBLISH_REVISION" && workspace.draft?.diff.length ? (
            <div className="studio-decision-diff" aria-label="Changes to publish">
              {workspace.draft.diff.map((change) => (
                <p key={change.field}><strong>{change.label}</strong><span>{change.before}</span><i aria-hidden="true">→</i><span>{change.after}</span></p>
              ))}
            </div>
          ) : null}
        </StudioDecisionSheet>
      ) : null}
    </section>
  );
}
