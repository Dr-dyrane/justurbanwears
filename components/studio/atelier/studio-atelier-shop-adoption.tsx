"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronRight, LockKeyhole, RefreshCw, Send } from "lucide-react";

import {
  type StudioAtelierShopAdoptionReceipt,
  type StudioAtelierShopAdoptionReview,
  type StudioAtelierShopMediaRole,
} from "../../../lib/studio/atelier/publication-adoption-contracts";
import type { StudioPublicationReview } from
  "../../../lib/studio/engine/catalogue-publication-contracts";
import {
  clearSessionCommandKey,
  getOrCreateSessionCommandKey,
} from "../../../lib/studio/idempotency/session-command-key";
import { StudioFeedback } from "../atoms/studio-feedback";
import {
  parseStudioAtelierAdoptionReceiptEnvelope,
  parseStudioAtelierAdoptionReviewEnvelope,
  studioAtelierAdoptionErrorDetail,
} from "./studio-atelier-shop-adoption-client";

export type StudioAtelierAdoptionUiMode =
  | "idle"
  | "loading"
  | "ready"
  | "blocked"
  | "error"
  | "published";

type AdoptionPanelState =
  | Readonly<{ state: "idle" }>
  | Readonly<{ state: "loading" }>
  | Readonly<{
      state: "ready";
      review: Extract<StudioAtelierShopAdoptionReview, { state: "READY" }>;
      notice?: string;
    }>
  | Readonly<{
      state: "blocked";
      review: Extract<StudioAtelierShopAdoptionReview, { state: "BLOCKED" }>;
    }>
  | Readonly<{ state: "error"; detail: string }>
  | Readonly<{
      state: "published";
      publication: Extract<StudioPublicationReview, { state: "PUBLISHED" }> | null;
      receipt: StudioAtelierShopAdoptionReceipt | null;
    }>;

const ROLE_LABELS = Object.freeze({
  GARMENT_FRONT: "Garment front",
  GARMENT_BACK: "Garment back",
  MANNEQUIN_FRONT: "On mannequin",
  FABRIC_DETAIL: "Fabric detail",
  MODEL_FRONT: "On Lulu · front",
  MODEL_LEFT_PROFILE: "On Lulu · left profile",
  MODEL_REAR_THREE_QUARTER: "On Lulu · rear three-quarter",
} satisfies Record<StudioAtelierShopMediaRole, string>);

class AdoptionRequestError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "AdoptionRequestError";
    this.status = status;
  }
}

async function responseBody(response: Response): Promise<unknown> {
  return response.json().catch(() => null);
}

async function readAdoptionReview(
  wardrobeItemId: string,
  signal?: AbortSignal,
): Promise<StudioAtelierShopAdoptionReview> {
  const response = await fetch(
    `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/atelier/adoption`,
    {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    },
  );
  const body = await responseBody(response);
  if (!response.ok) {
    throw new AdoptionRequestError(
      response.status,
      studioAtelierAdoptionErrorDetail(body, "Atelier publishing readiness is unavailable."),
    );
  }
  const adoption = parseStudioAtelierAdoptionReviewEnvelope(body, wardrobeItemId);
  if (!adoption) {
    throw new AdoptionRequestError(502, "Studio returned an unreadable Atelier publishing review.");
  }
  return adoption;
}

async function postAdoption(input: Readonly<{
  expectedRevision: string;
  idempotencyKey: string;
  wardrobeItemId: string;
}>): Promise<StudioAtelierShopAdoptionReceipt> {
  const response = await fetch(
    `/api/studio/wardrobe/${encodeURIComponent(input.wardrobeItemId)}/atelier/adoption`,
    {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({
        wardrobeItemId: input.wardrobeItemId,
        expectedRevision: input.expectedRevision,
        idempotencyKey: input.idempotencyKey,
        confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
      }),
    },
  );
  const body = await responseBody(response);
  if (!response.ok) {
    throw new AdoptionRequestError(
      response.status,
      studioAtelierAdoptionErrorDetail(body, "The seven locked Atelier views were not published."),
    );
  }
  const receipt = parseStudioAtelierAdoptionReceiptEnvelope(
    body,
    input.wardrobeItemId,
    input.expectedRevision,
  );
  if (!receipt) {
    throw new AdoptionRequestError(502, "Studio returned an unreadable Atelier publication receipt.");
  }
  return receipt;
}

export function StudioAtelierShopAdoption({
  active,
  onBusyChange,
  onCommitted,
  onModeChange,
  reconcilePublication,
  wardrobeItemId,
}: Readonly<{
  active: boolean;
  onBusyChange(busy: boolean): void;
  onCommitted(): void;
  onModeChange(mode: StudioAtelierAdoptionUiMode): void;
  reconcilePublication(): Promise<StudioPublicationReview | null>;
  wardrobeItemId: string;
}>) {
  const confirmationId = useId();
  const commandInFlightRef = useRef(false);
  const readInFlightRef = useRef(false);
  const readyRevisionRef = useRef<string | null>(null);
  const activeReadRef = useRef<AbortController | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [panel, setPanel] = useState<AdoptionPanelState>({ state: "idle" });

  const applyReview = useCallback((review: StudioAtelierShopAdoptionReview) => {
    if (review.state === "READY") {
      if (readyRevisionRef.current !== review.expectedRevision) {
        setConfirmed(false);
      }
      readyRevisionRef.current = review.expectedRevision;
      setPanel({ state: "ready", review });
      return;
    }
    readyRevisionRef.current = null;
    setConfirmed(false);
    setPanel({ state: "blocked", review });
  }, []);

  const refresh = useCallback(async () => {
    if (!active || readInFlightRef.current) return;
    readInFlightRef.current = true;
    const controller = new AbortController();
    activeReadRef.current = controller;
    setPanel({ state: "loading" });
    try {
      applyReview(await readAdoptionReview(wardrobeItemId, controller.signal));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPanel({
          state: "error",
          detail: error instanceof Error
            ? error.message
            : "Atelier publishing readiness is unavailable.",
        });
      }
    } finally {
      if (activeReadRef.current === controller) {
        activeReadRef.current = null;
        readInFlightRef.current = false;
      }
    }
  }, [active, applyReview, wardrobeItemId]);

  useEffect(() => {
    if (!active) {
      activeReadRef.current?.abort();
      activeReadRef.current = null;
      readInFlightRef.current = false;
      return;
    }
    void refresh();
    return () => {
      activeReadRef.current?.abort();
      activeReadRef.current = null;
      readInFlightRef.current = false;
    };
  }, [active, refresh]);

  useEffect(() => {
    onModeChange(active ? panel.state : "idle");
  }, [active, onModeChange, panel.state]);

  const markPublished = useCallback((input: Readonly<{
    publication: Extract<StudioPublicationReview, { state: "PUBLISHED" }> | null;
    receipt: StudioAtelierShopAdoptionReceipt | null;
  }>) => {
    readyRevisionRef.current = null;
    setConfirmed(false);
    setPanel({ state: "published", ...input });
    onCommitted();
  }, [onCommitted]);

  const adopt = useCallback(async () => {
    if (panel.state !== "ready" || !confirmed || commandInFlightRef.current) return;
    const expectedRevision = panel.review.expectedRevision;
    const commandScope = `atelier-shop-adoption:${wardrobeItemId}`;
    const idempotencyKey = getOrCreateSessionCommandKey({
      keyPrefix: `studio-atelier-adoption:${wardrobeItemId}`,
      revision: expectedRevision,
      scope: commandScope,
    });

    commandInFlightRef.current = true;
    setBusy(true);
    onBusyChange(true);
    setPanel({ state: "ready", review: panel.review });
    try {
      const receipt = await postAdoption({
        expectedRevision,
        idempotencyKey,
        wardrobeItemId,
      });
      const publication = await reconcilePublication().catch(() => null);
      clearSessionCommandKey({
        key: idempotencyKey,
        revision: expectedRevision,
        scope: commandScope,
      });
      markPublished({
        publication: publication?.state === "PUBLISHED" ? publication : null,
        receipt,
      });
    } catch (error) {
      const publication = await reconcilePublication().catch(() => null);
      if (publication?.state === "PUBLISHED") {
        clearSessionCommandKey({
          key: idempotencyKey,
          revision: expectedRevision,
          scope: commandScope,
        });
        markPublished({ publication, receipt: null });
      } else {
        const reconciled = await readAdoptionReview(wardrobeItemId).catch(() => null);
        if (reconciled?.state === "READY") {
          if (reconciled.expectedRevision !== expectedRevision) {
            clearSessionCommandKey({
              key: idempotencyKey,
              revision: expectedRevision,
              scope: commandScope,
            });
            setConfirmed(false);
            setPanel({
              state: "ready",
              review: reconciled,
              notice: "The locked views changed. Review the current seven views before publishing.",
            });
          } else {
            setPanel({
              state: "ready",
              review: reconciled,
              notice: error instanceof Error
                ? error.message
                : "Publication may not have finished. The same safe command is ready to retry.",
            });
          }
        } else if (reconciled?.state === "BLOCKED") {
          setPanel({
            state: "ready",
            review: panel.review,
            notice: "Publication status is still being confirmed. Close and reopen Shop to check the latest status, or retry the same safe command.",
          });
        } else {
          setPanel({
            state: "ready",
            review: panel.review,
            notice: error instanceof Error
              ? error.message
              : "Publication may not have finished. Check again before retrying.",
          });
        }
      }
    } finally {
      commandInFlightRef.current = false;
      setBusy(false);
      onBusyChange(false);
    }
  }, [confirmed, markPublished, onBusyChange, panel, reconcilePublication, wardrobeItemId]);

  if (!active || panel.state === "idle") return null;

  if (panel.state === "loading") {
    return (
      <StudioFeedback
        detail="This check is read-only. It cannot start image generation."
        state="loading"
        title="Checking locked Atelier views…"
      />
    );
  }

  if (panel.state === "error") {
    return (
      <details className="studio-piece-shop studio-atelier-adoption-status">
        <summary className="studio-draft-media-action">
          <span><LockKeyhole aria-hidden="true" size={18} /><span><small>Atelier photos</small><strong>Unavailable</strong></span></span>
          <span className="studio-inline-state">Check details <ChevronRight aria-hidden="true" size={16} /></span>
        </summary>
        <div className="studio-draft-readiness">
          <p className="studio-engine-error" role="alert">{panel.detail}</p>
          <button className="button button-secondary" onClick={() => void refresh()} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Check again
          </button>
        </div>
      </details>
    );
  }

  if (panel.state === "blocked") {
    return (
      <details className="studio-piece-shop studio-atelier-adoption-status">
        <summary className="studio-draft-media-action">
          <span><LockKeyhole aria-hidden="true" size={18} /><span><small>Atelier photos</small><strong>Not ready</strong></span></span>
          <span className="studio-inline-state">{panel.review.blockers.length} blocker{panel.review.blockers.length === 1 ? "" : "s"} <ChevronRight aria-hidden="true" size={16} /></span>
        </summary>
        <div className="studio-draft-readiness">
          <p className="studio-inline-state">Shop adoption stays private and zero-spend until every blocker is resolved.</p>
          <div className="studio-piece-shop-blockers" aria-label="Atelier publication blockers" role="list">
            {panel.review.blockers.map((blocker) => <span key={blocker} role="listitem">{blocker}</span>)}
          </div>
          <button className="button button-secondary" onClick={() => void refresh()} type="button">
            <RefreshCw aria-hidden="true" size={15} /> Check again
          </button>
        </div>
      </details>
    );
  }

  if (panel.state === "published") {
    const shopUrl = panel.publication?.receipt.shopUrl;
    return (
      <StudioFeedback
        action={shopUrl ? <a className="button button-primary" href={shopUrl}>View in Shop</a> : undefined}
        detail="The exact seven locked roles are now the Shop media set. Lifecycle controls can take the listing off Shop or archive it."
        state="success"
        title="Published from Atelier"
      />
    );
  }

  return (
    <section
      aria-busy={busy || undefined}
      className="studio-piece-shop studio-publication-review studio-atelier-adoption-review"
    >
      <div className="studio-card-heading">
        <div><small>Seven locked views</small><h3>Ready for Shop</h3></div>
        <LockKeyhole aria-label="Exact locked Atelier media" size={18} />
      </div>
      <p className="studio-inline-state">Review the roles below. Private storage and provider details never enter this screen.</p>
      <div className="studio-readiness-list" aria-label="Seven locked Atelier views" role="list">
        {panel.review.roles.map((role) => (
          <p key={role} role="listitem">
            <strong>{ROLE_LABELS[role]}</strong>
            <span><Check aria-hidden="true" size={14} /> Locked</span>
          </p>
        ))}
      </div>
      <div className="studio-publication-confirm">
        <input
          checked={confirmed}
          disabled={busy}
          id={confirmationId}
          onChange={(event) => setConfirmed(event.target.checked)}
          type="checkbox"
        />
        <label htmlFor={confirmationId}>
          <strong>Publish these seven views</strong>
          <small>This adopts the exact locked media; it does not generate new images.</small>
        </label>
      </div>
      {panel.notice ? <p className="studio-engine-error" role="alert">{panel.notice}</p> : null}
      <div className="studio-sheet-actions">
        <button
          className="button button-primary"
          data-studio-workspace-primary="true"
          disabled={!confirmed || busy}
          onClick={() => void adopt()}
          type="button"
        >
          <Send aria-hidden="true" size={15} />
          {busy ? "Publishing seven views…" : "Publish seven views"}
        </button>
      </div>
    </section>
  );
}
