"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, CircleDot } from "lucide-react";
import type { StudioCollectionScope } from "../../../lib/studio/application/contracts";
import type {
  StudioCollectionPreview,
  StudioCollectionReceipt,
} from "../../../lib/studio/collections/contracts";
import {
  confirmStudioCollection,
  previewStudioCollection,
} from "../../../lib/studio/services/studio-collection-client";
import {
  clearSessionCommandKey,
  getOrCreateSessionCommandKey,
} from "../../../lib/studio/idempotency/session-command-key";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";

type ChangeDropPhase = "select" | "preparing" | "review" | "confirming" | "success" | "error";
type FailedStep = "preview" | "confirm";

type AppliedDropChange = {
  collections: StudioCollectionScope[];
  receipt: StudioCollectionReceipt;
};

export interface ChangeDropSheetProps {
  collections: readonly StudioCollectionScope[];
  currentCollectionId: string | null;
  onApplied(change: AppliedDropChange): void;
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
  sku: string;
  title: string;
}

function stateLabel(collection: StudioCollectionScope) {
  if (collection.state === "ACTIVE") return "Live";
  if (collection.state === "DRAFT") return "Draft";
  return "Archived";
}

function databaseCollections(collections: readonly StudioCollectionScope[]) {
  return collections
    .filter((collection) => (
      collection.authority === "DATABASE"
      && (collection.key === "drop-01" || collection.key === "drop-02")
    ))
    .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || right.ordinal - left.ordinal);
}

export function ChangeDropSheet({
  collections,
  currentCollectionId,
  onApplied,
  onDismiss,
  open,
  returnFocus,
  sku,
  title,
}: ChangeDropSheetProps) {
  const available = useMemo(() => databaseCollections(collections), [collections]);
  const current = available.find((collection) => collection.id === currentCollectionId) ?? null;
  const [selectedId, setSelectedId] = useState("");
  const [preview, setPreview] = useState<StudioCollectionPreview | null>(null);
  const [receipt, setReceipt] = useState<StudioCollectionReceipt | null>(null);
  const [phase, setPhase] = useState<ChangeDropPhase>("select");
  const [failedStep, setFailedStep] = useState<FailedStep>("preview");
  const [error, setError] = useState("");
  const openRef = useRef(false);
  const inFlightRef = useRef(false);

  useEffect(() => {
    if (open && !openRef.current) {
      setSelectedId("");
      setPreview(null);
      setReceipt(null);
      setPhase("select");
      setFailedStep("preview");
      setError("");
    }
    openRef.current = open;
  }, [open]);

  const selected = available.find((collection) => collection.id === selectedId) ?? null;
  const commandScope = preview
    ? `studio-collection-membership:${sku}:${preview.collection.id}`
    : "";

  function back() {
    if (phase === "confirming" || phase === "preparing") return;
    if (phase === "error" && failedStep === "confirm" && preview) {
      setError("");
      setPhase("review");
      return;
    }
    setPreview(null);
    setError("");
    setPhase("select");
  }

  async function prepare() {
    if (!selected || selected.id === currentCollectionId || inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("preparing");
    setError("");
    try {
      const next = await previewStudioCollection({
        command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP",
        collectionId: selected.id,
        expectedVersion: selected.version,
        sku,
      });
      setPreview(next);
      setPhase("review");
    } catch (caught) {
      setFailedStep("preview");
      setError(caught instanceof Error ? caught.message : "Studio could not review that drop move.");
      setPhase("error");
    } finally {
      inFlightRef.current = false;
    }
  }

  async function confirm() {
    if (!preview || inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("confirming");
    setError("");
    const idempotencyKey = getOrCreateSessionCommandKey({
      keyPrefix: `studio-drop-move:${sku}`,
      revision: preview.expectedRevision,
      scope: commandScope,
    });
    try {
      const applied = await confirmStudioCollection({ idempotencyKey, preview });
      clearSessionCommandKey({
        key: idempotencyKey,
        revision: preview.expectedRevision,
        scope: commandScope,
      });
      setReceipt(applied.receipt);
      setPhase("success");
      onApplied(applied);
    } catch (caught) {
      setFailedStep("confirm");
      setError(caught instanceof Error ? caught.message : "Studio could not finish that drop move.");
      setPhase("error");
    } finally {
      inFlightRef.current = false;
    }
  }

  const busy = phase === "preparing" || phase === "confirming";
  const sheetTitle = receipt
    ? "Drop updated"
    : preview || (phase === "error" && failedStep === "confirm")
      ? "Review move"
      : "Change drop";

  return (
    <StudioTaskSheet
      busy={busy}
      busyLabel={phase === "confirming" ? "Publishing this drop change" : "Reviewing this move"}
      className="studio-decision-sheet studio-change-drop-sheet"
      eyebrow="Published piece"
      footer={(requestClose) => {
        if (busy) return null;
        if (phase === "success") return <button className="button button-primary" onClick={requestClose} type="button">Done</button>;
        if (phase === "review") return <><button className="button button-secondary" onClick={back} type="button">Back</button><button className="button button-primary" onClick={() => void confirm()} type="button">Publish drop change</button></>;
        if (phase === "error") return <><button className="button button-secondary" onClick={back} type="button">Back</button><button className="button button-primary" onClick={() => void (failedStep === "confirm" ? confirm() : prepare())} type="button">Try again</button></>;
        return <><button className="button button-secondary" onClick={requestClose} type="button">Cancel</button><button className="button button-primary" disabled={!selected || selected.id === currentCollectionId} onClick={() => void prepare()} type="button">Review move</button></>;
      }}
      onBack={phase === "review" || phase === "error" ? back : undefined}
      onDismiss={onDismiss}
      open={open}
      returnFocus={returnFocus}
      title={sheetTitle}
    >
      {phase === "select" ? (
        <>
          <section className="studio-task-question">
            <h3>Move {title}</h3>
            <p>{current ? `Currently in ${current.label}.` : "Current drop unavailable."}</p>
          </section>
          {current && available.some((collection) => collection.id !== current.id) ? (
            <div aria-label="Choose destination drop" className="studio-drop-list">
              {available.map((collection) => {
                const isCurrent = collection.id === current.id;
                const isSelected = collection.id === selectedId;
                return (
                  <button
                    aria-pressed={isSelected}
                    className="studio-drop-context-row"
                    disabled={isCurrent}
                    key={collection.id}
                    onClick={() => setSelectedId(collection.id)}
                    type="button"
                  >
                    <span aria-hidden="true" className="studio-drop-ordinal">{String(collection.ordinal).padStart(2, "0")}</span>
                    <span className="studio-drop-row-copy"><strong>{collection.label}</strong><small><CircleDot aria-hidden="true" size={10} />{isCurrent ? "Current" : stateLabel(collection)}</small></span>
                    {isCurrent || isSelected ? <Check aria-label={isCurrent ? "Current drop" : "Selected"} size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
                  </button>
                );
              })}
            </div>
          ) : (
            <StudioFeedback
              detail="Studio needs the current database drops before it can move this piece."
              state="error"
              title="Drop change unavailable"
            />
          )}
        </>
      ) : phase === "preparing" ? (
        <StudioFeedback detail="Checking the destination and customer impact." state="loading" title="Reviewing move" />
      ) : phase === "review" && preview ? (
        <div className="studio-decision-review">
          <p className="studio-decision-summary">{preview.title}</p>
          <div aria-label="Drop changes" className="studio-decision-diff">
            {preview.changes.map((change) => <p key={`${change.label}:${change.before}:${change.after}`}><strong>{change.label}</strong><span>{change.before}</span><i aria-hidden="true">→</i><span>{change.after}</span></p>)}
          </div>
          <section className="studio-decision-consequence"><small>After confirmation</small><p>{preview.consequence}</p></section>
        </div>
      ) : phase === "confirming" ? (
        <StudioFeedback detail="Keep this sheet open while Studio finishes." state="loading" title="Publishing drop change" />
      ) : phase === "success" && receipt ? (
        <StudioFeedback detail={receipt.consequence} state="success" title={`Moved to ${receipt.collection.label}`} />
      ) : (
        <StudioFeedback detail={error} state="error" title="That drop change did not finish" />
      )}
    </StudioTaskSheet>
  );
}
