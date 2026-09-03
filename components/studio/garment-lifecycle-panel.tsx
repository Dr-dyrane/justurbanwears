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
  GarmentLifecycleCommandReceipt,
  GarmentLifecycleWorkspace,
  GarmentPermanentDeleteReceipt,
  GarmentRevisionMediaReceipt,
  GarmentRevisionMediaRole,
} from "../../lib/studio/engine/garment-lifecycle-contracts";
import { WardrobeMotion } from "../brand/wardrobe-motion";
import {
  StudioDecisionSheet,
  type StudioDecisionResult,
} from "./atoms/studio-decision-sheet";
import { StudioMediaButton, type StudioMediaItem } from "./media-viewer";
import {
  clearSessionCommandKey,
  getOrCreateSessionCommandKey,
} from "../../lib/studio/idempotency/session-command-key";

type ErrorBody = { error?: { message?: string; recovery?: string } };
type GarmentDecision = "ARCHIVE" | "DELETE_PERMANENTLY" | "DISCARD_REVISION" | "PUBLISH_REVISION" | "REPUBLISH" | "UNPUBLISH";
type FactsEditMode = "details" | "price";
type GarmentMilestone = "details-saved" | "media-saved" | "price-saved" | "published" | "returned";
type GarmentMediaCommandIdentity = {
  expectedDraftVersion: number | null;
  expectedItemVersion: number;
  expectedPublicationRevision: string | null;
  idempotencyKey: string;
  mediaRole: GarmentRevisionMediaRole;
  mediaSha256: string;
  revision: string;
  scope: string;
};
type GarmentLifecycleRecoveryIdentity = {
  command: "SAVE_FACTS" | "ARCHIVE";
  expectedVersion: number;
  idempotencyKey: string;
  revision: string;
  scope: string;
};
type GarmentLifecycleRecoveryCommand =
  | Omit<Extract<GarmentLifecycleCommand, { command: "SAVE_FACTS" }>, "idempotencyKey">
  | Omit<Extract<GarmentLifecycleCommand, { command: "ARCHIVE" }>, "idempotencyKey">;

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

function sameFacts(left: IntakeFacts, right: IntakeFacts) {
  return JSON.stringify(left) === JSON.stringify(right);
}

async function fileSha256(file: File) {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mediaReceiptMatchesCommand(
  receipt: GarmentRevisionMediaReceipt | null | undefined,
  command: GarmentMediaCommandIdentity,
  wardrobeItemId: string,
) {
  return receipt?.command === "REPLACE_MEDIA"
    && receipt.wardrobeItemId === wardrobeItemId
    && receipt.idempotencyKey === command.idempotencyKey
    && receipt.mediaRole === command.mediaRole
    && receipt.mediaSha256 === command.mediaSha256
    && receipt.expectedItemVersion === command.expectedItemVersion
    && receipt.expectedDraftVersion === command.expectedDraftVersion
    && receipt.expectedPublicationRevision === command.expectedPublicationRevision;
}

function commandIsReflected(
  workspace: GarmentLifecycleWorkspace,
  command: GarmentLifecycleCommand,
) {
  if (command.command === "SAVE_FACTS") return sameFacts(workspace.editableFacts, command.facts);
  if (command.command === "PUBLISH_REVISION" || command.command === "REPUBLISH") return workspace.state === "PUBLISHED";
  if (command.command === "UNPUBLISH") return workspace.state === "UNPUBLISHED";
  if (command.command === "ARCHIVE") return workspace.state === "ARCHIVED";
  return !workspace.draft;
}

function lifecycleCommandRevision(command: GarmentLifecycleRecoveryCommand) {
  return command.command === "SAVE_FACTS"
    ? `${command.expectedVersion}:${JSON.stringify(command.facts)}`
    : String(command.expectedVersion);
}

function lifecycleReceiptMatchesCommand(
  receipt: GarmentLifecycleCommandReceipt | null | undefined,
  command: GarmentLifecycleRecoveryIdentity,
  wardrobeItemId: string,
) {
  return receipt?.wardrobeItemId === wardrobeItemId
    && receipt.command === command.command
    && receipt.expectedVersion === command.expectedVersion
    && receipt.idempotencyKey === command.idempotencyKey;
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
  onChangeDrop,
  onPermanentDelete,
  onWorkspaceChange,
  wardrobeItemId,
}: {
  initialAction?: "price";
  onChangeDrop?(): void;
  onPermanentDelete?(): void;
  onWorkspaceChange?(workspace: GarmentLifecycleWorkspace): void;
  wardrobeItemId: string;
}) {
  const [workspace, setWorkspace] = useState<GarmentLifecycleWorkspace>();
  const [draftFacts, setDraftFacts] = useState<IntakeFacts>();
  const [editMode, setEditMode] = useState<FactsEditMode | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [decision, setDecision] = useState<GarmentDecision | null>(null);
  const [decisionReturnFocus, setDecisionReturnFocus] = useState<HTMLElement | null>(null);
  const [milestone, setMilestone] = useState<GarmentMilestone | null>(null);
  const [reload, setReload] = useState(0);
  const priceRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const milestoneRef = useRef<HTMLElement>(null);
  const initialActionHandledRef = useRef(false);
  const commandInFlightRef = useRef(false);
  const publicationKeyRef = useRef("");
  const deletionCompletedRef = useRef(false);
  const publicationCommandScope = `revision-publication:${wardrobeItemId}`;
  const deletionCommandScope = `garment-permanent-delete:${wardrobeItemId}`;

  const accept = useCallback((next: GarmentLifecycleWorkspace) => {
    if (next.draft) {
      publicationKeyRef.current = getOrCreateSessionCommandKey({
        keyPrefix: `studio-revision:${wardrobeItemId}`,
        revision: next.draft.expectedRevision,
        scope: publicationCommandScope,
      });
    } else {
      clearSessionCommandKey({ scope: publicationCommandScope });
      publicationKeyRef.current = "";
    }
    setWorkspace(next);
    setDraftFacts(next.editableFacts);
    setError("");
    onWorkspaceChange?.(next);
  }, [onWorkspaceChange, publicationCommandScope, wardrobeItemId]);

  const readWorkspace = useCallback(async (signal?: AbortSignal) => {
    const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    });
    return (await responseJson<{ workspace: GarmentLifecycleWorkspace }>(response)).workspace;
  }, [wardrobeItemId]);

  useEffect(() => {
    const controller = new AbortController();
    initialActionHandledRef.current = false;
    setWorkspace(undefined);
    setEditMode(null);
    setError("");
    setMilestone(null);
    setDecision(null);
    setDecisionReturnFocus(null);
    deletionCompletedRef.current = false;
    publicationKeyRef.current = "";
    void readWorkspace(controller.signal)
      .then(accept)
      .catch((caught: unknown) => {
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Piece controls are unavailable.");
      });
    return () => controller.abort();
  }, [accept, readWorkspace, reload, wardrobeItemId]);

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
    setEditMode("price");
    setError("");
    requestAnimationFrame(() => priceRef.current?.focus({ preventScroll: true }));
  }, [initialAction, wardrobeItemId, workspace]);

  useEffect(() => {
    if (!milestone) return;
    milestoneRef.current?.focus({ preventScroll: true });
  }, [milestone]);

  async function command(value: GarmentLifecycleCommand, action: string): Promise<StudioDecisionResult> {
    if (commandInFlightRef.current) return { error: "Another Studio change is still finishing.", ok: false };
    commandInFlightRef.current = true;
    setBusy(action);
    setError("");
    setMilestone(null);
    const publicationIdentity = value.command === "PUBLISH_REVISION"
      ? { key: value.idempotencyKey, revision: value.expectedRevision }
      : null;
    const lifecycleIdentity: GarmentLifecycleRecoveryIdentity | null = value.command === "SAVE_FACTS" || value.command === "ARCHIVE"
      ? {
          command: value.command,
          expectedVersion: value.expectedVersion,
          idempotencyKey: value.idempotencyKey,
          revision: lifecycleCommandRevision(value),
          scope: `garment-lifecycle:${wardrobeItemId}:${value.command.toLowerCase()}`,
        }
      : null;
    const markSuccess = () => {
      if (value.command === "SAVE_FACTS") {
        setMilestone(editMode === "price" ? "price-saved" : "details-saved");
        setEditMode(null);
      }
      if (value.command === "PUBLISH_REVISION") setMilestone("published");
      if (value.command === "REPUBLISH") setMilestone("returned");
    };
    try {
      const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify(value),
      });
      const body = await responseJson<{
        receipt?: GarmentLifecycleCommandReceipt | null;
        workspace: GarmentLifecycleWorkspace;
      }>(response);
      if (lifecycleIdentity && !lifecycleReceiptMatchesCommand(body.receipt, lifecycleIdentity, wardrobeItemId)) {
        throw new Error("Studio could not verify that garment change receipt.");
      }
      if (publicationIdentity) clearSessionCommandKey({
        ...publicationIdentity,
        scope: publicationCommandScope,
      });
      if (lifecycleIdentity) clearSessionCommandKey({
        key: lifecycleIdentity.idempotencyKey,
        revision: lifecycleIdentity.revision,
        scope: lifecycleIdentity.scope,
      });
      accept(body.workspace);
      markSuccess();
      return { ok: true };
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : "That action did not finish.";
      if (lifecycleIdentity) {
        const receiptResponse = await fetch(
          `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle?idempotencyKey=${encodeURIComponent(lifecycleIdentity.idempotencyKey)}`,
          { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } },
        ).catch(() => null);
        const reconciled = receiptResponse?.ok
          ? await receiptResponse.json().catch(() => null) as {
              receipt?: GarmentLifecycleCommandReceipt | null;
              workspace?: GarmentLifecycleWorkspace;
            } | null
          : null;
        if (reconciled?.workspace) accept(reconciled.workspace);
        if (
          reconciled?.workspace
          && lifecycleReceiptMatchesCommand(reconciled.receipt, lifecycleIdentity, wardrobeItemId)
        ) {
          clearSessionCommandKey({
            key: lifecycleIdentity.idempotencyKey,
            revision: lifecycleIdentity.revision,
            scope: lifecycleIdentity.scope,
          });
          markSuccess();
          return { ok: true };
        }
        setError(message);
        return { error: message, ok: false };
      }
      const reconciled = await readWorkspace().catch(() => null);
      if (reconciled) {
        accept(reconciled);
        if (commandIsReflected(reconciled, value)) {
          if (publicationIdentity) clearSessionCommandKey({
            ...publicationIdentity,
            scope: publicationCommandScope,
          });
          markSuccess();
          return { ok: true };
        }
      }
      setError(message);
      return { error: message, ok: false };
    } finally {
      commandInFlightRef.current = false;
      setBusy("");
    }
  }

  function requestDecision(nextDecision: GarmentDecision, trigger: HTMLElement) {
    deletionCompletedRef.current = false;
    setDecision(nextDecision);
    setDecisionReturnFocus(trigger);
    setError("");
  }

  async function executeDecision(nextDecision: GarmentDecision): Promise<StudioDecisionResult> {
    if (nextDecision === "DELETE_PERMANENTLY") {
      if (!workspace || workspace.state !== "ARCHIVED" || !workspace.permanentDelete.eligible) {
        return { error: workspace?.permanentDelete.blockers.join(" ") || "This piece cannot be permanently deleted.", ok: false };
      }
      if (commandInFlightRef.current) return { error: "Another Studio change is still finishing.", ok: false };
      const revision = String(workspace.itemVersion);
      const idempotencyKey = getOrCreateSessionCommandKey({
        keyPrefix: `studio-delete:${wardrobeItemId}`,
        revision,
        scope: deletionCommandScope,
      });
      commandInFlightRef.current = true;
      setBusy(nextDecision);
      setError("");
      try {
        const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/deletion`, {
          method: "POST",
          credentials: "same-origin",
          headers: { accept: "application/json", "content-type": "application/json" },
          body: JSON.stringify({
            confirmation: "DELETE_PERMANENTLY",
            expectedVersion: workspace.itemVersion,
            idempotencyKey,
          }),
        });
        await responseJson<{ receipt: GarmentPermanentDeleteReceipt }>(response);
        clearSessionCommandKey({ key: idempotencyKey, revision, scope: deletionCommandScope });
        deletionCompletedRef.current = true;
        return { ok: true };
      } catch (caught) {
        const receiptResponse = await fetch(
          `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/deletion?idempotencyKey=${encodeURIComponent(idempotencyKey)}`,
          { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } },
        ).catch(() => null);
        const reconciled = receiptResponse?.ok
          ? await receiptResponse.json().catch(() => null) as { receipt?: GarmentPermanentDeleteReceipt | null } | null
          : null;
        if (reconciled?.receipt) {
          clearSessionCommandKey({ key: idempotencyKey, revision, scope: deletionCommandScope });
          deletionCompletedRef.current = true;
          return { ok: true };
        }
        const message = caught instanceof Error ? caught.message : "Permanent deletion did not finish.";
        setError(message);
        return { error: message, ok: false };
      } finally {
        commandInFlightRef.current = false;
        setBusy("");
      }
    }
    if (nextDecision === "PUBLISH_REVISION") {
      if (!workspace?.draft) return { error: "This private revision is no longer available.", ok: false };
      publicationKeyRef.current ||= getOrCreateSessionCommandKey({
        keyPrefix: `studio-revision:${wardrobeItemId}`,
        revision: workspace.draft.expectedRevision,
        scope: publicationCommandScope,
      });
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
      const draft = {
        command: "ARCHIVE",
        confirmation: "ARCHIVE",
        expectedVersion: workspace.itemVersion,
      } as const;
      const revision = lifecycleCommandRevision(draft);
      const scope = `garment-lifecycle:${wardrobeItemId}:archive`;
      return command({
        ...draft,
        idempotencyKey: getOrCreateSessionCommandKey({
          keyPrefix: `studio-piece:${wardrobeItemId}:archive`,
          revision,
          scope,
        }),
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
    if (!file || !workspace || commandInFlightRef.current) return;
    commandInFlightRef.current = true;
    setBusy(role);
    setError("");
    setMilestone(null);
    let commandIdentity: GarmentMediaCommandIdentity | undefined;
    try {
      const mediaSha256 = await fileSha256(file);
      // Keep the recovery key stable across a lost-response reload. The server
      // fingerprint still binds the exact item, draft and publication versions.
      const revision = `${role}:${mediaSha256}`;
      const scope = `garment-media:${wardrobeItemId}:${role}`;
      const idempotencyKey = getOrCreateSessionCommandKey({
        keyPrefix: `studio-media:${wardrobeItemId}:${role.toLowerCase()}`,
        revision,
        scope,
      });
      commandIdentity = {
        expectedDraftVersion: workspace.draft?.version ?? null,
        expectedItemVersion: workspace.itemVersion,
        expectedPublicationRevision: workspace.live?.sourceRevision ?? null,
        idempotencyKey,
        mediaRole: role,
        mediaSha256,
        revision,
        scope,
      };
      const body = new FormData();
      body.set("file", file);
      body.set("role", role);
      body.set("expectedDraftVersion", commandIdentity.expectedDraftVersion === null ? "" : String(commandIdentity.expectedDraftVersion));
      body.set("expectedItemVersion", String(commandIdentity.expectedItemVersion));
      body.set("expectedPublicationRevision", commandIdentity.expectedPublicationRevision ?? "");
      body.set("idempotencyKey", idempotencyKey);
      const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle/media`, {
        method: "POST",
        credentials: "same-origin",
        body,
      });
      const result = await responseJson<{
        receipt: GarmentRevisionMediaReceipt;
        workspace: GarmentLifecycleWorkspace;
      }>(response);
      if (!mediaReceiptMatchesCommand(result.receipt, commandIdentity, wardrobeItemId)) {
        throw new Error("Studio could not verify that photo receipt.");
      }
      clearSessionCommandKey({ key: idempotencyKey, revision, scope });
      accept(result.workspace);
      setMilestone("media-saved");
    } catch (caught) {
      const receiptResponse = commandIdentity
        ? await fetch(
            `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/lifecycle/media?idempotencyKey=${encodeURIComponent(commandIdentity.idempotencyKey)}`,
            { cache: "no-store", credentials: "same-origin", headers: { accept: "application/json" } },
          ).catch(() => null)
        : null;
      const reconciled = receiptResponse?.ok
        ? await receiptResponse.json().catch(() => null) as {
            receipt?: GarmentRevisionMediaReceipt | null;
            workspace?: GarmentLifecycleWorkspace;
          } | null
        : null;
      if (
        commandIdentity
        && reconciled
        && mediaReceiptMatchesCommand(reconciled.receipt, commandIdentity, wardrobeItemId)
        && reconciled.workspace
      ) {
        clearSessionCommandKey({
          key: commandIdentity.idempotencyKey,
          revision: commandIdentity.revision,
          scope: commandIdentity.scope,
        });
        accept(reconciled.workspace);
        setMilestone("media-saved");
      } else {
        if (commandIdentity && reconciled?.receipt?.idempotencyKey === commandIdentity.idempotencyKey) {
          clearSessionCommandKey({
            key: commandIdentity.idempotencyKey,
            revision: commandIdentity.revision,
            scope: commandIdentity.scope,
          });
        }
        setError(caught instanceof Error ? caught.message : "That photo did not save.");
      }
    } finally {
      commandInFlightRef.current = false;
      setBusy("");
    }
  }

  function beginEdit(mode: FactsEditMode) {
    if (!workspace) return;
    setDraftFacts(workspace.editableFacts);
    setEditMode(mode);
    setError("");
    if (mode === "price") requestAnimationFrame(() => priceRef.current?.focus({ preventScroll: true }));
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!workspace || !draftFacts) return;
    const draft = {
      command: "SAVE_FACTS",
      expectedVersion: workspace.draft?.version ?? workspace.itemVersion,
      facts: draftFacts,
    } as const;
    const revision = lifecycleCommandRevision(draft);
    const scope = `garment-lifecycle:${wardrobeItemId}:save_facts`;
    void command({
      ...draft,
      idempotencyKey: getOrCreateSessionCommandKey({
        keyPrefix: `studio-piece:${wardrobeItemId}:save`,
        revision,
        scope,
      }),
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
    DELETE_PERMANENTLY: {
      busyLabel: "Deleting this piece",
      confirmLabel: "Delete permanently",
      consequence: "It is removed from Wardrobe and cannot be restored. Private engine evidence stays retained for integrity.",
      destructive: true,
      receiptDetail: "The archived piece was removed from Wardrobe. This cannot be undone.",
      receiptTitle: "Piece deleted",
      summary: workspace.facts.title,
      title: "Delete this piece permanently?",
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
  const milestoneCopy = milestone ? {
    "details-saved": {
      detail: workspace.live ? "The revision remains private until you publish it." : "The private garment now shows these details.",
      eyebrow: "Piece updated",
      title: workspace.live ? "Private revision saved." : "Garment details saved.",
    },
    "media-saved": {
      detail: workspace.live ? "The photo is in the private revision; the current Shop listing is unchanged." : "The private garment now uses this photo.",
      eyebrow: "Photo updated",
      title: "Garment photo saved.",
    },
    "price-saved": {
      detail: workspace.live ? "The new price remains private until you publish the revision." : "The private garment now shows this price.",
      eyebrow: "Price updated",
      title: "Price saved.",
    },
    published: {
      detail: "Customers can now see this exact revision.",
      eyebrow: "Shop updated",
      title: "Published to Shop.",
    },
    returned: {
      detail: "The approved listing is visible to customers again.",
      eyebrow: "Shop updated",
      title: "Returned to Shop.",
    },
  }[milestone] : null;

  return (
    <section className="studio-piece-shop studio-listing-editor" id="garment-lifecycle" aria-labelledby="garment-lifecycle-title" ref={panelRef} tabIndex={-1}>
      <div className="studio-card-heading">
        <div><small>Listing</small><h3 id="garment-lifecycle-title">{stateLabel(workspace.state)}</h3></div>
        {busy ? <LoaderCircle aria-label="Working" className="studio-spin" size={18} /> : null}
      </div>

      {milestoneCopy ? (
        <section aria-live="polite" className="juw-studio-publish-receipt" ref={milestoneRef} role="status" tabIndex={-1}>
          <div className="juw-receipt-motion">
            <WardrobeMotion artwork="logo" polarity="auto" size="sm" variant="success" />
          </div>
          <div>
            <small>{milestoneCopy.eyebrow}</small>
            <strong>{milestoneCopy.title}</strong>
            <p>{milestoneCopy.detail}</p>
          </div>
        </section>
      ) : null}

      {!editMode ? (
        <div className="studio-garment-facts">
          <span>{formatNaira(workspace.editableFacts.price)}</span>
          <span>{workspace.editableFacts.sizeLabel}</span>
          <span>{workspace.editableFacts.condition}</span>
        </div>
      ) : null}

      {!editMode && (editable || onChangeDrop) ? (
        <div className="studio-card-actions">
          {editable ? <><button className="button button-primary" onClick={() => beginEdit("price")} type="button"><Pencil aria-hidden="true" size={16} />Change price</button><button className="button button-secondary" onClick={() => beginEdit("details")} type="button">Edit details</button></> : null}
          {onChangeDrop ? <button className="button button-secondary" onClick={onChangeDrop} type="button">Change drop</button> : null}
        </div>
      ) : null}

      {editMode && draftFacts ? (
        <form onSubmit={save}>
          <div className="studio-form-grid studio-listing-fields">
            {editMode === "details" ? <label className="studio-field"><span>Name</span><input maxLength={100} onChange={(event) => setDraftFacts({ ...draftFacts, title: event.target.value })} required value={draftFacts.title} /></label> : null}
            <label className="studio-field"><span>Price (₦)</span><input inputMode="numeric" min="1" onChange={(event) => setDraftFacts({ ...draftFacts, price: Math.max(0, Number(event.target.value)) })} ref={priceRef} required type="number" value={draftFacts.price || ""} /></label>
            {editMode === "details" ? <>
              <label className="studio-field studio-field-wide"><span>Shop description</span><textarea maxLength={2000} onChange={(event) => setDraftFacts({ ...draftFacts, description: event.target.value })} required rows={3} value={draftFacts.description ?? ""} /></label>
              <label className="studio-field"><span>Category</span><select onChange={(event) => setDraftFacts({ ...draftFacts, category: event.target.value as IntakeFacts["category"] })} value={draftFacts.category}>{["Dress", "Shirt", "Set", "Knitwear", "Skirt", "Trousers", "Other"].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className="studio-field"><span>Colour</span><input maxLength={60} onChange={(event) => setDraftFacts({ ...draftFacts, colour: event.target.value })} required value={draftFacts.colour} /></label>
              <label className="studio-field"><span>Size</span><input maxLength={60} onChange={(event) => setDraftFacts({ ...draftFacts, sizeLabel: event.target.value })} required value={draftFacts.sizeLabel} /></label>
              <label className="studio-field"><span>Condition</span><input maxLength={100} onChange={(event) => setDraftFacts({ ...draftFacts, condition: event.target.value })} required value={draftFacts.condition} /></label>
            </> : null}
          </div>
          <p className="studio-inline-state">{workspace.live ? "Changes stay private until you publish them." : "This changes the private garment only."}</p>
          <div className="studio-card-actions">
            <button className="button button-secondary" onClick={() => { setEditMode(null); setDraftFacts(workspace.editableFacts); }} type="button">Cancel</button>
            <button className="button button-primary" disabled={busy === "SAVE_FACTS"} type="submit">{busy === "SAVE_FACTS" ? "Saving…" : editMode === "price" ? "Save price" : workspace.live ? "Save private revision" : "Save changes"}</button>
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
        {workspace.state === "ARCHIVED" && workspace.permanentDelete.eligible ? <button className="button button-secondary is-destructive" disabled={Boolean(busy)} onClick={(event) => requestDecision("DELETE_PERMANENTLY", event.currentTarget)} type="button"><Trash2 aria-hidden="true" size={15} />Delete permanently</button> : null}
      </div>

      {workspace.state === "ARCHIVED" && !workspace.permanentDelete.eligible ? <p className="studio-inline-state">{workspace.permanentDelete.blockers.join(" ")}</p> : null}

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
            const deleted = decision === "DELETE_PERMANENTLY" && deletionCompletedRef.current;
            setDecision(null);
            setDecisionReturnFocus(null);
            deletionCompletedRef.current = false;
            if (deleted) onPermanentDelete?.();
          }}
          open
          receiptDetail={decisionCopy.receiptDetail}
          receiptTitle={decisionCopy.receiptTitle}
          returnFocus={decisionReturnFocus}
          summary={decisionCopy.summary}
          title={decisionCopy.title}
        >
          {decision === "PUBLISH_REVISION" && workspace.draft?.diff.length ? (
            <>
              <section className="studio-publication-summary" aria-label="Final Shop listing">
                <small>Customers will see</small>
                <strong>{workspace.draft.facts.title}</strong>
                <p>{workspace.draft.facts.description}</p>
                <div className="studio-garment-facts">
                  <span>{formatNaira(workspace.draft.facts.price)}</span>
                  <span>{workspace.draft.facts.colour}</span>
                  <span>{workspace.draft.facts.sizeLabel}</span>
                  <span>{workspace.draft.facts.condition}</span>
                </div>
              </section>
              <div className="studio-decision-diff" aria-label="Changes to publish">
                {workspace.draft.diff.map((change) => (
                  <p key={change.field}><strong>{change.label}</strong><span>{change.before}</span><i aria-hidden="true">→</i><span>{change.after}</span></p>
                ))}
              </div>
            </>
          ) : null}
        </StudioDecisionSheet>
      ) : null}
    </section>
  );
}
