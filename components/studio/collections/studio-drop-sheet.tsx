"use client";

import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Check,
  ChevronRight,
  CircleDot,
  MoreHorizontal,
  Pencil,
  Plus,
  Radio,
} from "lucide-react";
import type { StudioCollectionScope } from "../../../lib/studio/application/contracts";
import type {
  StudioCollectionIntent,
  StudioCollectionPreview,
  StudioCollectionReceipt,
} from "../../../lib/studio/collections/contracts";
import {
  confirmStudioCollection,
  previewStudioCollection,
} from "../../../lib/studio/services/studio-collection-client";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";

type DropSheetView = "browse" | "manage" | "name" | "pending" | "preview" | "receipt" | "error";

type AppliedDropChange = {
  collections: StudioCollectionScope[];
  receipt: StudioCollectionReceipt;
};

export interface StudioDropSheetProps {
  allCount: number;
  collections: readonly StudioCollectionScope[];
  initialAction?: "create" | "manage";
  initialCollectionId?: string | null;
  onApplied(change: AppliedDropChange): void;
  onDismiss(): void;
  onSelect(key: string): void;
  open: boolean;
  privateCount: number;
  returnFocus?: HTMLElement | null;
  scenario: boolean;
  selectedKey: string;
}

function nextDropLabel(collections: readonly StudioCollectionScope[]) {
  const ordinal = Math.max(0, ...collections.map((collection) => collection.ordinal)) + 1;
  return `Drop ${String(ordinal).padStart(2, "0")}`;
}

function previewScenarioCollection(
  collections: readonly StudioCollectionScope[],
  intent: StudioCollectionIntent,
): StudioCollectionPreview {
  if (intent.command === "CREATE_COLLECTION") {
    const ordinal = Math.max(0, ...collections.map((collection) => collection.ordinal)) + 1;
    const key = `drop-${String(ordinal).padStart(2, "0")}` as StudioCollectionScope["key"];
    const collection: StudioCollectionScope = {
      id: `scenario:${key}`,
      key,
      label: intent.label.trim(),
      ordinal,
      version: 1,
      state: "DRAFT",
      isCurrent: false,
      authority: "SCENARIO",
      counts: { pieces: 0, private: 0, ready: 0, published: 0, available: 0 },
      nextAction: `/studio/wardrobe?collection=${key}&scenario=lifecycle`,
      updatedAt: new Date().toISOString(),
    };
    return {
      intent: { ...intent, label: intent.label.trim() },
      collection,
      previousActive: collections.find((candidate) => candidate.isCurrent) ?? null,
      changes: [
        { label: "Drop", before: "Not created", after: collection.label },
        { label: "State", before: "—", after: "Draft" },
      ],
      expectedRevision: "0".repeat(64),
      title: `Create ${collection.label}`,
      consequence: `${collection.label} will open as a private draft drop.`,
    };
  }

  const current = collections.find((collection) => collection.id === intent.collectionId);
  if (!current) throw new Error("That drop is no longer available.");
  if (intent.command === "RENAME_COLLECTION") {
    const label = intent.label.trim();
    return {
      intent: { ...intent, label },
      collection: { ...current, label, version: current.version + 1 },
      previousActive: collections.find((candidate) => candidate.isCurrent) ?? null,
      changes: [{ label: "Name", before: current.label, after: label }],
      expectedRevision: "0".repeat(64),
      title: `Rename ${current.label}`,
      consequence: `The drop will appear as ${label} everywhere in Studio.`,
    };
  }
  if (intent.command === "ACTIVATE_COLLECTION") {
    if (current.state !== "DRAFT") throw new Error(`${current.label} is not a draft.`);
    const previousActive = collections.find((candidate) => candidate.isCurrent) ?? null;
    return {
      intent,
      collection: { ...current, state: "ACTIVE", isCurrent: true, version: current.version + 1 },
      previousActive,
      changes: [
        { label: "State", before: "Draft", after: "Live" },
        ...(previousActive ? [{ label: previousActive.label, before: "Live", after: "Archived" }] : []),
      ],
      expectedRevision: "0".repeat(64),
      title: `Activate ${current.label}`,
      consequence: `${current.label} will become the Shop drop${previousActive ? ` and ${previousActive.label} will archive` : ""}.`,
    };
  }
  if (current.state === "ARCHIVED") throw new Error(`${current.label} is already archived.`);
  return {
    intent,
    collection: { ...current, state: "ARCHIVED", isCurrent: false, version: current.version + 1 },
    previousActive: collections.find((candidate) => candidate.isCurrent) ?? null,
    changes: [{ label: "State", before: current.state === "ACTIVE" ? "Live" : "Draft", after: "Archived" }],
    expectedRevision: "0".repeat(64),
    title: `Archive ${current.label}`,
    consequence: `${current.label} will leave active Studio work. Its history remains available.`,
  };
}

function confirmScenarioCollection(
  collections: readonly StudioCollectionScope[],
  preview: StudioCollectionPreview,
): AppliedDropChange {
  const occurredAt = new Date().toISOString();
  let next = [...collections];
  let collection = preview.collection;
  if (preview.intent.command === "CREATE_COLLECTION") {
    collection = { ...preview.collection, updatedAt: occurredAt };
    next = [collection, ...next];
  } else if (preview.intent.command === "ACTIVATE_COLLECTION") {
    next = next.map((candidate) => {
      if (candidate.id === preview.collection.id) return { ...preview.collection, updatedAt: occurredAt };
      if (!candidate.isCurrent) return candidate;
      return {
        ...candidate,
        state: "ARCHIVED" as const,
        isCurrent: false,
        version: candidate.version + 1,
        updatedAt: occurredAt,
      };
    });
    collection = next.find((candidate) => candidate.id === preview.collection.id) ?? preview.collection;
  } else {
    next = next.map((candidate) => candidate.id === preview.collection.id
      ? { ...preview.collection, updatedAt: occurredAt }
      : candidate);
    collection = next.find((candidate) => candidate.id === preview.collection.id) ?? preview.collection;
  }
  const consequence = preview.intent.command === "CREATE_COLLECTION"
    ? `${collection.label} created.`
    : preview.intent.command === "ACTIVATE_COLLECTION"
      ? `${collection.label} is now live.`
      : preview.intent.command === "ARCHIVE_COLLECTION"
        ? `${collection.label} archived.`
        : `${collection.label} renamed.`;
  return {
    collections: next.sort((left, right) => right.ordinal - left.ordinal),
    receipt: {
      id: `scenario:${crypto.randomUUID()}`,
      command: preview.intent.command,
      collection,
      consequence,
      nextRoute: collection.nextAction,
      occurredAt,
      replayed: false,
    },
  };
}

function stateLabel(collection: StudioCollectionScope) {
  if (collection.state === "ACTIVE") return "Live";
  if (collection.state === "DRAFT") return "Draft";
  return "Archived";
}

export function StudioDropSheet({
  allCount,
  collections,
  initialAction,
  initialCollectionId,
  onApplied,
  onDismiss,
  onSelect,
  open,
  privateCount,
  returnFocus,
  scenario,
  selectedKey,
}: StudioDropSheetProps) {
  const [view, setView] = useState<DropSheetView>("browse");
  const [managedId, setManagedId] = useState<string | null>(null);
  const [nameMode, setNameMode] = useState<"create" | "rename">("create");
  const [name, setName] = useState("");
  const [preview, setPreview] = useState<StudioCollectionPreview | null>(null);
  const [receipt, setReceipt] = useState<StudioCollectionReceipt | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState<(() => void) | null>(null);
  const wasOpen = useRef(false);
  const idempotencyKeyRef = useRef<string | null>(null);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const managed = collections.find((collection) => collection.id === managedId) ?? null;
  const ordered = useMemo(
    () => [...collections].sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || right.ordinal - left.ordinal),
    [collections],
  );

  useEffect(() => {
    if (open && !wasOpen.current) {
      setView(initialAction === "create" ? "name" : initialAction === "manage" ? "manage" : "browse");
      setManagedId(initialAction === "manage" ? initialCollectionId ?? null : null);
      setName(initialAction === "create" ? nextDropLabel(collections) : "");
      setNameMode("create");
      setPreview(null);
      setReceipt(null);
      setError("");
      setRetry(null);
      idempotencyKeyRef.current = null;
    }
    wasOpen.current = open;
  }, [collections, initialAction, initialCollectionId, open]);

  useEffect(() => {
    if (view !== "name") return;
    const frame = window.requestAnimationFrame(() => nameInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [view]);

  async function prepare(intent: StudioCollectionIntent) {
    const run = () => void prepare(intent);
    setError("");
    setRetry(null);
    setView("pending");
    try {
      const next = scenario
        ? previewScenarioCollection(collections, intent)
        : await previewStudioCollection(intent);
      idempotencyKeyRef.current = null;
      setPreview(next);
      setView("preview");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not prepare that change.");
      setRetry(() => run);
      setView("error");
    }
  }

  async function confirm() {
    if (!preview) return;
    const run = () => void confirm();
    setError("");
    setRetry(null);
    setView("pending");
    try {
      idempotencyKeyRef.current ??= `studio-drop:${preview.intent.command.toLowerCase()}:${crypto.randomUUID()}`;
      const applied = scenario
        ? confirmScenarioCollection(collections, preview)
        : await confirmStudioCollection({
            preview,
            idempotencyKey: idempotencyKeyRef.current,
          });
      onApplied(applied);
      setReceipt(applied.receipt);
      setView("receipt");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Studio could not save that change.");
      setRetry(() => run);
      setView("error");
    }
  }

  function beginCreate() {
    setNameMode("create");
    setName(nextDropLabel(collections));
    setView("name");
  }

  function beginRename() {
    if (!managed) return;
    setNameMode("rename");
    setName(managed.label);
    setView("name");
  }

  function submitName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const label = name.trim();
    if (!label) return;
    if (nameMode === "create") void prepare({ command: "CREATE_COLLECTION", label });
    else if (managed) void prepare({
      command: "RENAME_COLLECTION",
      collectionId: managed.id,
      expectedVersion: managed.version,
      label,
    });
  }

  const title = view === "browse"
    ? "Browse drops"
    : view === "manage"
      ? managed?.label ?? "Drop"
      : view === "name"
        ? nameMode === "create" ? "New drop" : "Rename drop"
        : view === "preview"
          ? preview?.title ?? "Review change"
          : view === "receipt"
            ? receipt?.consequence ?? "Saved"
            : view === "error"
              ? "Not saved"
              : "Working";
  const canGoBack = view !== "browse" && view !== "pending" && view !== "receipt";

  function back() {
    if (view === "manage") setView("browse");
    else if (view === "name") setView(nameMode === "rename" ? "manage" : "browse");
    else if (view === "preview") setView(preview?.intent.command === "CREATE_COLLECTION" ? "name" : "manage");
    else setView(managed ? "manage" : "browse");
  }

  return (
    <StudioTaskSheet
      busy={view === "pending"}
      className="studio-drop-sheet"
      eyebrow={scenario ? "Scenario preview" : undefined}
      onBack={canGoBack ? back : undefined}
      onDismiss={onDismiss}
      open={open}
      returnFocus={returnFocus}
      title={title}
    >
      {view === "browse" ? (
        <div className="studio-drop-list">
          <button className="studio-drop-context-row" onClick={() => onSelect("all")} type="button">
            <span aria-hidden="true" className="studio-drop-ordinal">∞</span>
            <span className="studio-drop-row-copy"><strong>All pieces</strong><small>{allCount} total</small></span>
            {selectedKey === "all" ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
          </button>
          {ordered.map((collection) => (
            <div className="studio-drop-row" data-state={collection.state.toLowerCase()} key={collection.id}>
              <button className="studio-drop-row-main" onClick={() => onSelect(collection.key)} type="button">
                <span aria-hidden="true" className="studio-drop-ordinal">{String(collection.ordinal).padStart(2, "0")}</span>
                <span className="studio-drop-row-copy">
                  <strong>{collection.label}</strong>
                  <small><CircleDot aria-hidden="true" size={10} />{stateLabel(collection)} · {collection.counts.pieces ?? "—"} pieces</small>
                </span>
                {selectedKey === collection.key ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
              </button>
              <button
                aria-label={`Manage ${collection.label}`}
                className="studio-drop-row-more"
                onClick={() => { setManagedId(collection.id); setView("manage"); }}
                type="button"
              ><MoreHorizontal aria-hidden="true" size={17} /></button>
            </div>
          ))}
          <button className="studio-drop-context-row" onClick={() => onSelect("private")} type="button">
            <span aria-hidden="true" className="studio-drop-ordinal">P</span>
            <span className="studio-drop-row-copy"><strong>Private</strong><small>{privateCount} pieces</small></span>
            {selectedKey === "private" ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
          </button>
          <button className="studio-drop-new" onClick={beginCreate} type="button">
            <Plus aria-hidden="true" size={17} />
            <span><strong>New drop</strong><small>Start private</small></span>
            <ChevronRight aria-hidden="true" size={17} />
          </button>
        </div>
      ) : null}

      {view === "manage" && managed ? (
        <div className="studio-drop-actions">
          <button onClick={beginRename} type="button"><Pencil aria-hidden="true" size={18} /><span><strong>Rename</strong><small>Change its Studio name</small></span><ChevronRight aria-hidden="true" size={17} /></button>
          {managed.state === "DRAFT" ? <button onClick={() => void prepare({ command: "ACTIVATE_COLLECTION", collectionId: managed.id, expectedVersion: managed.version })} type="button"><Radio aria-hidden="true" size={18} /><span><strong>Activate</strong><small>Make this the Shop drop</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
          {managed.state !== "ARCHIVED" ? <button onClick={() => void prepare({ command: "ARCHIVE_COLLECTION", collectionId: managed.id, expectedVersion: managed.version })} type="button"><Archive aria-hidden="true" size={18} /><span><strong>Archive</strong><small>Keep history, leave active work</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
        </div>
      ) : null}

      {view === "manage" && !managed ? (
        <StudioFeedback detail="Return to Browse drops and choose the current record." state="error" title="Drop unavailable" />
      ) : null}

      {view === "name" ? (
        <form className="studio-drop-name" onSubmit={submitName}>
          <label><span>Name</span><input maxLength={120} onChange={(event) => setName(event.target.value)} ref={nameInputRef} value={name} /></label>
          <footer className="studio-task-sheet-footer"><button className="button button-primary" disabled={!name.trim()} type="submit">Preview</button></footer>
        </form>
      ) : null}

      {view === "pending" ? <StudioFeedback detail="No change is applied until confirmation completes." state="loading" title="Preparing drop" /> : null}

      {view === "preview" && preview ? (
        <div className="studio-drop-preview">
          <div className="studio-drop-diff">
            {preview.changes.map((change) => <div key={`${change.label}:${change.after}`}><span>{change.label}</span><small>{change.before}</small><ChevronRight aria-hidden="true" size={14} /><strong>{change.after}</strong></div>)}
          </div>
          <p>{preview.consequence}</p>
          <footer className="studio-task-sheet-footer"><button className="button button-secondary" onClick={back} type="button">Back</button><button className="button button-primary" onClick={() => void confirm()} type="button">Confirm</button></footer>
        </div>
      ) : null}

      {view === "receipt" && receipt ? (
        <div className="studio-drop-receipt">
          <span aria-hidden="true"><Check size={22} /></span>
          <strong>{receipt.consequence}</strong>
          <small>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium", timeStyle: "short" }).format(new Date(receipt.occurredAt))}</small>
          <button className="button button-primary" onClick={() => onSelect(receipt.collection.key)} type="button">Open {receipt.collection.label}</button>
        </div>
      ) : null}

      {view === "error" ? <StudioFeedback action={retry ? <button className="button button-primary" onClick={retry} type="button">Try again</button> : undefined} detail={error} state="error" title="Drop unchanged" /> : null}
    </StudioTaskSheet>
  );
}
