"use client";

/* Protected Studio and catalogue media use stable runtime URLs. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useRef, useState } from "react";
import {
  Check,
  ChevronRight,
  CircleAlert,
  MapPin,
  PackageCheck,
  RotateCcw,
  Shirt,
  UserRound,
} from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { formatNaira } from "../../lib/shop/catalog";
import {
  orderStateLabel,
  studioOrderHasDueReturnWork,
} from "../../lib/shop/order-presentation";
import type { StudioLifecycleState } from "../../lib/studio/domain/entities";
import { selectStudioWorkProjection } from "../../lib/studio/application/work-projection";
import { selectStudioProjectionFreshness } from "../../lib/studio/application/projection-freshness";
import {
  StudioAuthorityClientError,
  type StudioAuthorityPiece,
} from "../../lib/studio/services/studio-authority-client";
import { LifecycleMeta, STUDIO_LIFECYCLE_PRESENTATION } from "./atoms/lifecycle-meta";
import { StudioDecisionSheet, type StudioDecisionResult } from "./atoms/studio-decision-sheet";
import { StudioFeedback } from "./atoms/studio-feedback";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioProjectionFreshnessNotice } from "./atoms/studio-projection-freshness";
import { StudioLink as Link } from "./atoms/studio-link";
import { StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioStackPage, StudioStackSection } from "./atoms/studio-stack-page";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { useStudio } from "./studio-provider";

const locations = [
  { key: "WARDROBE_RAIL", label: "Wardrobe rail" },
  { key: "PACKING_SHELF", label: "Packing shelf" },
  { key: "RETURN_INSPECTION", label: "Return inspection" },
] as const;
type StudioLocation = (typeof locations)[number];
type LocationCommand = "CONFIRM" | "MOVE";

interface LocationReview {
  command: LocationCommand;
  piece: StudioAuthorityPiece;
  target: StudioLocation;
}

const EMPTY_PIECES: StudioAuthorityPiece[] = [];
const HOLD_INTENT_STORAGE_KEY = "juw.studio.hold-intent.v1";
const LOCATION_INTENT_STORAGE_KEY = "juw.studio.location-intent.v1";
const MUTATION_INTENT_TTL_MS = 60 * 60 * 1000;
const HOLD_IDEMPOTENCY_KEY_PATTERN = /^hold:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCATION_IDEMPOTENCY_KEY_PATTERN = /^location:[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_FINGERPRINT_PATTERN = /^[0-9a-f]{64}$/;
const AUTHORITY_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{6}Z$/;
const AUTHORITY_REFRESH_BLOCKER = "Couldn’t verify current Studio state. Nothing changed. Try again.";

interface MutationIntent {
  expiresAt: number;
  fingerprint: string;
  idempotencyKey: string;
}

interface LocationMutationIntent extends MutationIntent {
  command: "CONFIRM" | "MOVE";
  expectedAuthorityRevision: string;
  expectedVersion: number;
  locationKey: typeof locations[number]["key"];
  pieceKey: string;
}

function readMutationIntent(
  storageKey: string,
  idempotencyKeyPattern: RegExp,
  now = Date.now(),
): MutationIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const candidate = JSON.parse(window.sessionStorage.getItem(storageKey) ?? "null") as Record<string, unknown> | null;
    const keys = candidate && !Array.isArray(candidate) ? Object.keys(candidate) : [];
    const valid = candidate
      && keys.length === 3
      && keys.every((key) => ["expiresAt", "fingerprint", "idempotencyKey"].includes(key))
      && typeof candidate.fingerprint === "string"
      && SHA256_FINGERPRINT_PATTERN.test(candidate.fingerprint)
      && typeof candidate.idempotencyKey === "string"
      && idempotencyKeyPattern.test(candidate.idempotencyKey)
      && Number.isSafeInteger(candidate.expiresAt)
      && (candidate.expiresAt as number) > now
      && (candidate.expiresAt as number) <= now + MUTATION_INTENT_TTL_MS;
    if (valid) return candidate as unknown as MutationIntent;
    window.sessionStorage.removeItem(storageKey);
  } catch {
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      // A blocked storage API must not block an operator from reviewing the form.
    }
  }
  return null;
}

function persistMutationIntent(storageKey: string, intent: MutationIntent) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(storageKey, JSON.stringify(intent));
  } catch {
    // The mounted in-memory intent still protects an immediate retry.
  }
}

function readLocationMutationIntent(now = Date.now()): LocationMutationIntent | null {
  if (typeof window === "undefined") return null;
  try {
    const candidate = JSON.parse(window.sessionStorage.getItem(LOCATION_INTENT_STORAGE_KEY) ?? "null") as Record<string, unknown> | null;
    const keys = candidate && !Array.isArray(candidate) ? Object.keys(candidate) : [];
    const valid = candidate
      && keys.length === 8
      && keys.every((key) => [
        "command",
        "expectedAuthorityRevision",
        "expectedVersion",
        "expiresAt",
        "fingerprint",
        "idempotencyKey",
        "locationKey",
        "pieceKey",
      ].includes(key))
      && (candidate.command === "CONFIRM" || candidate.command === "MOVE")
      && typeof candidate.expectedAuthorityRevision === "string"
      && AUTHORITY_TIMESTAMP_PATTERN.test(candidate.expectedAuthorityRevision)
      && Number.isSafeInteger(candidate.expectedVersion)
      && (candidate.expectedVersion as number) >= 0
      && locations.some((location) => location.key === candidate.locationKey)
      && typeof candidate.pieceKey === "string"
      && candidate.pieceKey.length > 0
      && typeof candidate.fingerprint === "string"
      && SHA256_FINGERPRINT_PATTERN.test(candidate.fingerprint)
      && typeof candidate.idempotencyKey === "string"
      && LOCATION_IDEMPOTENCY_KEY_PATTERN.test(candidate.idempotencyKey)
      && Number.isSafeInteger(candidate.expiresAt)
      && (candidate.expiresAt as number) > now
      && (candidate.expiresAt as number) <= now + MUTATION_INTENT_TTL_MS;
    if (valid) return candidate as unknown as LocationMutationIntent;
    window.sessionStorage.removeItem(LOCATION_INTENT_STORAGE_KEY);
  } catch {
    try {
      window.sessionStorage.removeItem(LOCATION_INTENT_STORAGE_KEY);
    } catch {
      // A blocked storage API must not block an operator from reviewing the piece.
    }
  }
  return null;
}

function clearMutationIntent(storageKey: string) {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(storageKey);
  } catch {
    // A successful authoritative response remains sufficient when storage is blocked.
  }
}

async function mutationFingerprint(value: string) {
  const digest = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function shortDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat("en-NG", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(date)
    : value;
}

function lifecycle(piece: StudioAuthorityPiece): StudioLifecycleState {
  if (piece.activeHold) return "RESERVED";
  if (piece.availability === "PRIVATE") return "DRAFT";
  if (piece.availability === "AVAILABLE") return "PUBLISHED";
  if (piece.availability === "ARCHIVED") return "CANCELLED";
  return piece.availability;
}

function nextDayValue() {
  const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(next.getTime() - next.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function OperationsDesk() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { authority, scenario } = useStudio();
  const snapshot = authority.snapshot;
  const authorityFreshness = selectStudioProjectionFreshness({
    error: authority.error,
    generatedAt: snapshot?.generatedAt ?? null,
    status: authority.status,
  });
  const pieces = snapshot?.pieces ?? EMPTY_PIECES;
  const holds = snapshot?.holds ?? [];
  const orders = snapshot?.orders ?? [];
  const activeHolds = holds.filter((hold) => hold.status === "ACTIVE");
  const work = snapshot ? selectStudioWorkProjection(snapshot) : null;
  const actionOrders = work ? [...work.dueReturns, ...work.dueOrders] : [];
  const mismatches = work?.locationMismatches ?? EMPTY_PIECES;
  const segments = [
    { key: "attention", label: "Attention", count: work?.attentionCount ?? 0 },
    { key: "inventory", label: "Inventory", count: pieces.length },
    { key: "holds", label: "Holds", count: activeHolds.length },
  ];
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "attention");
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [holdOpen, setHoldOpen] = useState(false);
  const [holdPieceKey, setHoldPieceKey] = useState<string | null>(null);
  const [holdReturnFocus, setHoldReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [reason, setReason] = useState("");
  const [expiresAt, setExpiresAt] = useState(nextDayValue);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [requestedPieceError, setRequestedPieceError] = useState("");
  const [requestedStateNotice, setRequestedStateNotice] = useState("");
  const [pendingAction, setPendingAction] = useState<"location" | "release" | null>(null);
  const [locationReview, setLocationReview] = useState<LocationReview | null>(null);
  const [locationReturnFocus, setLocationReturnFocus] = useState<HTMLElement | null>(null);
  const [releaseOpen, setReleaseOpen] = useState(false);
  const [releaseReturnFocus, setReleaseReturnFocus] = useState<HTMLElement | null>(null);
  const [scenarioOrderOpen, setScenarioOrderOpen] = useState(false);
  const [scenarioOrderReturnFocus, setScenarioOrderReturnFocus] = useState<HTMLButtonElement | null>(null);
  const holdPendingRef = useRef(false);
  const holdIntentRef = useRef<MutationIntent | null>(null);
  const detailMutationPendingRef = useRef(false);
  const locationIntentRef = useRef<LocationMutationIntent | null>(null);
  const requestedPieceHandledRef = useRef("");
  const selected = pieces.find((piece) => piece.pieceKey === selectedKey) ?? null;
  const holdPiece = pieces.find((piece) => piece.pieceKey === holdPieceKey) ?? null;
  const nextMismatch = mismatches[0] ?? null;
  const nextActionOrder = actionOrders.find(studioOrderHasDueReturnWork)
    ?? actionOrders[0]
    ?? null;
  const nextActionOrderLabel = nextActionOrder
    ? scenario ? nextActionOrder.lines[0]?.name ?? "Preview order" : nextActionOrder.reference
    : "";
  const nextHeldPiece = activeHolds
    .map((hold) => pieces.find((piece) => piece.sku === hold.sku) ?? null)
    .find((piece): piece is StudioAuthorityPiece => Boolean(piece))
    ?? null;
  const scenarioOrderReference = scenario ? searchParams.get("order") : null;
  const scenarioOrder = scenarioOrderReference
    ? orders.find((order) => order.reference === scenarioOrderReference) ?? null
    : null;

  useEffect(() => {
    setScenarioOrderOpen(Boolean(scenarioOrder));
  }, [scenarioOrder]);

  useEffect(() => {
    const legacyView = searchParams.get("view");
    if (legacyView === "orders" && !scenario) {
      router.replace("/studio/orders");
    } else if (legacyView === "returns" && !scenario) {
      router.replace("/studio/orders?filter=RETURNS");
    }
  }, [router, scenario, searchParams]);

  useEffect(() => {
    const requestedPiece = searchParams.get("piece")?.trim().toLocaleLowerCase("en-NG") ?? "";
    if (!requestedPiece) {
      requestedPieceHandledRef.current = "";
      setRequestedPieceError("");
      return;
    }
    const action = searchParams.get("action");
    const requestedAction = action === "hold"
      ? "hold"
      : action === "release"
        ? "release"
        : action === "location"
          ? "location"
          : "review";
    const requestKey = `${requestedAction}:${requestedPiece}`;
    if (authority.status !== "ready" || requestedPieceHandledRef.current === requestKey) return;
    requestedPieceHandledRef.current = requestKey;
    if (!pieces.length) {
      setRequestedPieceError("The exact piece from Ask Studio is not in the current Operations projection. Studio will not substitute a similar SKU.");
      return;
    }
    const piece = pieces.find((candidate) => (
      candidate.pieceKey.toLocaleLowerCase("en-NG") === requestedPiece
      || candidate.wardrobeItemId?.toLocaleLowerCase("en-NG") === requestedPiece
      || candidate.sku?.toLocaleLowerCase("en-NG") === requestedPiece
    ));
    if (!piece) {
      setRequestedPieceError("The exact piece from Ask Studio is not in the current Operations projection. Studio will not substitute a similar SKU.");
      return;
    }
    setRequestedPieceError("");
    setRequestedStateNotice("");
    setNotice("");
    setError("");
    if (
      requestedAction === "hold"
      && !scenario
      && !piece.activeHold
      && piece.availability === "AVAILABLE"
      && piece.expectedCustody === "STUDIO"
      && !piece.hasLocationMismatch
      && piece.sku
    ) {
      setHoldPieceKey(piece.pieceKey);
      setSelectedKey(null);
      setCustomerName("");
      setContact("");
      setReason("");
      setExpiresAt(nextDayValue());
      setHoldOpen(true);
      return;
    }
    setSelectedKey(piece.pieceKey);
    if (requestedAction === "release" && !piece.activeHold) {
      setRequestedStateNotice("This piece has no active hold to release. Current Operations truth has replaced the older request.");
    }
  }, [authority.status, pieces, scenario, searchParams]);

  function openPiece(piece: StudioAuthorityPiece, trigger: HTMLButtonElement) {
    setSelectedKey(piece.pieceKey);
    setReturnFocus(trigger);
    setNotice("");
    setError("");
    setRequestedStateNotice("");
  }

  function closePiece() {
    setSelectedKey(null);
    setNotice("");
    setError("");
    setRequestedStateNotice("");
  }

  function openLocationReview(
    piece: StudioAuthorityPiece,
    target: StudioLocation,
    command: LocationCommand,
    trigger: HTMLElement,
  ) {
    setLocationReview({ command, piece, target });
    setLocationReturnFocus(trigger);
    setError("");
  }

  function closeLocationReview() {
    setLocationReview(null);
  }

  function clearScenarioOrderRoute() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("order");
    if (params.get("view") === "orders") params.delete("view");
    const query = params.toString();
    router.replace(`/studio/operations${query ? `?${query}` : ""}`, { scroll: false });
  }

  function closeScenarioOrder() {
    setScenarioOrderOpen(false);
    clearScenarioOrderRoute();
  }

  function openScenarioOrder(trigger: HTMLButtonElement) {
    if (!scenarioOrder) return;
    setScenarioOrderReturnFocus(trigger);
    setScenarioOrderOpen(true);
  }

  function openHold() {
    if (!selected) return;
    setHoldPieceKey(selected.pieceKey);
    setHoldReturnFocus(returnFocus);
    setSelectedKey(null);
    setHoldOpen(true);
    setCustomerName("");
    setContact("");
    setReason("");
    setExpiresAt(nextDayValue());
    setError("");
  }

  async function refreshReviewedPiece(
    reviewed: StudioAuthorityPiece,
  ): Promise<{ error: string; piece: null } | { error: null; piece: StudioAuthorityPiece }> {
    const refreshed = await authority.refresh().catch(() => null);
    if (!refreshed) return { error: AUTHORITY_REFRESH_BLOCKER, piece: null };
    const current = refreshed.pieces.find((piece) => piece.pieceKey === reviewed.pieceKey);
    if (!current) {
      return {
        error: `${reviewed.title} is no longer in current Studio inventory. Nothing changed.`,
        piece: null,
      };
    }
    if (
      current.authorityRevision !== reviewed.authorityRevision
      || current.locationVersion !== reviewed.locationVersion
    ) {
      return {
        error: `${reviewed.title} changed since this sheet opened. Review the refreshed details before confirming. Nothing changed.`,
        piece: null,
      };
    }
    return { error: null, piece: current };
  }

  async function saveHold(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!holdPiece?.sku || holdPendingRef.current) return;
    holdPendingRef.current = true;
    setPending(true);
    setError("");
    let submittedExpiresAt: string | null = null;
    let submittedIntent: MutationIntent | null = null;
    try {
      const normalizedExpiresAt = new Date(expiresAt).toISOString();
      submittedExpiresAt = normalizedExpiresAt;
      const fingerprint = await mutationFingerprint(JSON.stringify({
        contact: contact.trim(),
        customerName: customerName.trim(),
        expiresAt: normalizedExpiresAt,
        reason: reason.trim(),
        sku: holdPiece.sku,
      }));
      let intent = holdIntentRef.current ?? readMutationIntent(HOLD_INTENT_STORAGE_KEY, HOLD_IDEMPOTENCY_KEY_PATTERN);
      const replaying = Boolean(intent && intent.fingerprint === fingerprint);
      if (!replaying) {
        const fresh = await refreshReviewedPiece(holdPiece);
        if (!fresh.piece) {
          setError(fresh.error);
          return;
        }
      }
      if (!intent || intent.fingerprint !== fingerprint) {
        intent = {
          expiresAt: Date.now() + MUTATION_INTENT_TTL_MS,
          fingerprint,
          idempotencyKey: `hold:${crypto.randomUUID()}`,
        };
      }
      submittedIntent = intent;
      holdIntentRef.current = intent;
      persistMutationIntent(HOLD_INTENT_STORAGE_KEY, intent);
      const consequence = await authority.createHold({
        sku: holdPiece.sku,
        customerName,
        contact,
        reason,
        expiresAt: normalizedExpiresAt,
        idempotencyKey: intent.idempotencyKey,
      });
      setNotice(consequence);
      setHoldOpen(false);
      setSelectedKey(holdPiece.pieceKey);
      setHoldPieceKey(null);
      holdIntentRef.current = null;
      clearMutationIntent(HOLD_INTENT_STORAGE_KEY);
    } catch (cause) {
      const reconciled = await authority.refresh().catch(() => null);
      const intentStartedAt = submittedIntent
        ? submittedIntent.expiresAt - MUTATION_INTENT_TTL_MS
        : Number.POSITIVE_INFINITY;
      const recovered = reconciled?.holds.find((hold) => (
        hold.status === "ACTIVE"
        && hold.sku === holdPiece.sku
        && hold.customerName === customerName.trim()
        && hold.contact === contact.trim()
        && hold.reason === reason.trim()
        && hold.expiresAt === submittedExpiresAt
        && Date.parse(hold.createdAt) >= intentStartedAt
      ));
      if (recovered) {
        setNotice("The customer hold was saved. Studio recovered it from current authority after the response was interrupted.");
        setHoldOpen(false);
        setSelectedKey(holdPiece.pieceKey);
        setHoldPieceKey(null);
        holdIntentRef.current = null;
        clearMutationIntent(HOLD_INTENT_STORAGE_KEY);
        return;
      }
      setError(cause instanceof Error ? cause.message : "The hold could not be saved.");
    } finally {
      holdPendingRef.current = false;
      setPending(false);
    }
  }

  function cancelHold() {
    if (holdPendingRef.current) return;
    setHoldOpen(false);
    setHoldPieceKey(null);
    holdIntentRef.current = null;
    clearMutationIntent(HOLD_INTENT_STORAGE_KEY);
  }

  function openRelease(trigger: HTMLElement) {
    setReleaseReturnFocus(trigger);
    setReleaseOpen(true);
    setError("");
  }

  async function releaseHold(): Promise<StudioDecisionResult> {
    if (!selected?.activeHold) return { error: "This piece no longer has an active hold.", ok: false };
    if (detailMutationPendingRef.current) return { error: "Another inventory change is already in progress.", ok: false };
    detailMutationPendingRef.current = true;
    setPendingAction("release");
    setPending(true);
    setError("");
    const holdId = selected.activeHold.id;
    const releaseStartedAt = Date.now();
    try {
      const fresh = await refreshReviewedPiece(selected);
      if (!fresh.piece) {
        setError(fresh.error);
        return { error: fresh.error, ok: false };
      }
      const freshHold = fresh.piece.activeHold;
      if (!freshHold || freshHold.id !== holdId || freshHold.status !== "ACTIVE") {
        const message = `${selected.title} no longer has the reviewed active hold. Nothing changed.`;
        setError(message);
        return { error: message, ok: false };
      }
      const consequence = await authority.releaseHold(holdId);
      setNotice(consequence);
      return { ok: true };
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "The hold could not be released.";
      const reconciled = await authority.refresh().catch(() => null);
      const recovered = reconciled?.holds.find((hold) => hold.id === holdId);
      if (
        recovered
        && recovered.status !== "ACTIVE"
        && recovered.releasedAt
        && Date.parse(recovered.releasedAt) >= releaseStartedAt
      ) {
        setNotice("The hold is no longer active. Studio recovered the current state after the response was interrupted.");
        return { ok: true };
      }
      setError(message);
      return { error: message, ok: false };
    } finally {
      detailMutationPendingRef.current = false;
      setPendingAction(null);
      setPending(false);
    }
  }

  async function recordLocation(
    piece: StudioAuthorityPiece,
    locationKey: typeof locations[number]["key"],
    command: LocationCommand,
  ): Promise<StudioDecisionResult> {
    if (detailMutationPendingRef.current) return { error: "Another inventory change is already in progress.", ok: false };
    const expectedAuthorityRevision = piece.authorityRevision;
    const expectedVersion = piece.locationVersion;
    const pieceKey = piece.pieceKey;
    detailMutationPendingRef.current = true;
    setPendingAction("location");
    setPending(true);
    setError("");
    let submittedIntent: LocationMutationIntent | null = null;
    try {
      const storedIntent = locationIntentRef.current ?? readLocationMutationIntent();
      const storedTargetsReview = Boolean(
        storedIntent
        && storedIntent.command === command
        && storedIntent.locationKey === locationKey
        && storedIntent.pieceKey === pieceKey,
      );
      const storedRequest = storedTargetsReview && storedIntent
        ? {
            command: storedIntent.command,
            expectedAuthorityRevision: storedIntent.expectedAuthorityRevision,
            expectedVersion: storedIntent.expectedVersion,
            locationKey: storedIntent.locationKey,
            pieceKey: storedIntent.pieceKey,
          }
        : null;
      const storedFingerprint = storedRequest
        ? await mutationFingerprint(JSON.stringify(storedRequest))
        : null;
      const replaying = Boolean(
        storedIntent
        && storedRequest
        && storedIntent.fingerprint === storedFingerprint,
      );
      let intent = replaying ? storedIntent : null;
      if (!intent) {
        const fresh = await refreshReviewedPiece(piece);
        if (!fresh.piece) {
          setError(fresh.error);
          return { error: fresh.error, ok: false };
        }
        const request = { command, expectedAuthorityRevision, expectedVersion, locationKey, pieceKey };
        const fingerprint = await mutationFingerprint(JSON.stringify(request));
        intent = {
          ...request,
          expiresAt: Date.now() + MUTATION_INTENT_TTL_MS,
          fingerprint,
          idempotencyKey: `location:${crypto.randomUUID()}`,
        };
      }
      submittedIntent = intent;
      locationIntentRef.current = intent;
      persistMutationIntent(LOCATION_INTENT_STORAGE_KEY, intent);
      setNotice(await authority.recordLocation({
        command: intent.command,
        expectedAuthorityRevision: intent.expectedAuthorityRevision,
        expectedVersion: intent.expectedVersion,
        pieceKey: intent.pieceKey,
        locationKey: intent.locationKey,
        idempotencyKey: intent.idempotencyKey,
      }));
      locationIntentRef.current = null;
      clearMutationIntent(LOCATION_INTENT_STORAGE_KEY);
      return { ok: true };
    } catch (cause) {
      const reconciled = await authority.refresh().catch(() => null);
      const recovered = reconciled?.pieces.find((piece) => piece.pieceKey === pieceKey);
      if (
        cause instanceof StudioAuthorityClientError
        && cause.status === 409
        && cause.code === "VERSION_CONFLICT"
      ) {
        locationIntentRef.current = null;
        clearMutationIntent(LOCATION_INTENT_STORAGE_KEY);
        const message = recovered
          ? `${piece.title} changed in another window. It is now expected at ${recovered.expectedLocationLabel.toLowerCase()}. Review the refreshed location before moving it again.`
          : `${cause.message} Reload Operations and review the current location before moving it again.`;
        setError(message);
        return { error: message, ok: false };
      }
      const intentStartedAt = submittedIntent
        ? submittedIntent.expiresAt - MUTATION_INTENT_TTL_MS
        : Number.POSITIVE_INFINITY;
      const recoveredAfterIntent = Boolean(
        recovered?.observedAt
        && Date.parse(recovered.observedAt) >= intentStartedAt,
      );
      const recoveredChange = recoveredAfterIntent && (command === "MOVE"
        ? recovered?.expectedCustody === "STUDIO"
          && recovered.expectedLocationKey === locationKey
          && !recovered.hasLocationMismatch
        : recovered?.observedLocationKey === locationKey);
      if (recoveredChange) {
        setNotice(command === "MOVE"
          ? "The piece location was moved. Studio recovered the current state after the response was interrupted."
          : "The location check was saved. Studio recovered it from current authority after the response was interrupted.");
        locationIntentRef.current = null;
        clearMutationIntent(LOCATION_INTENT_STORAGE_KEY);
        return { ok: true };
      }
      const message = cause instanceof Error ? cause.message : "The location could not be saved.";
      setError(message);
      return { error: message, ok: false };
    } finally {
      detailMutationPendingRef.current = false;
      setPendingAction(null);
      setPending(false);
    }
  }

  function confirmLocationReview(): Promise<StudioDecisionResult> {
    if (!locationReview) {
      return Promise.resolve({ error: "Choose a location again.", ok: false });
    }
    return recordLocation(locationReview.piece, locationReview.target.key, locationReview.command);
  }

  if (authority.status === "idle" || authority.status === "loading") {
    return <StudioLoadingStage label="Opening Operations…" />;
  }

  if (!snapshot) {
    return (
      <StudioStackPage className="studio-ops-page studio-premium-surface" kind="service">
        <h1 className="sr-only">Operations</h1>
        <StudioFeedback action={<button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button>} detail={authority.error} state="error" title="Operations unavailable" />
      </StudioStackPage>
    );
  }

  return (
    <StudioStackPage className="studio-ops-page studio-premium-surface" kind="service">
      <h1 className="sr-only">Operations</h1>

      {authorityFreshness.state === "STALE" ? (
        <StudioProjectionFreshnessNotice
          asOf={authorityFreshness.asOf}
          error={authority.error}
          onRetry={() => void authority.refresh()}
        />
      ) : null}

      {requestedPieceError ? <StudioFeedback detail={requestedPieceError} state="error" title="Piece unavailable" /> : null}

      {scenarioOrderReference ? scenarioOrder ? (
        <button
          aria-expanded={scenarioOrderOpen}
          aria-haspopup="dialog"
          aria-label={`Open preview order for ${scenarioOrder.lines[0]?.name ?? "wardrobe piece"}`}
          className="studio-piece-next"
          id="studio-scenario-order"
          onClick={(event) => openScenarioOrder(event.currentTarget)}
          type="button"
        >
          <span><PackageCheck aria-hidden="true" size={20} /></span>
          <span>
            <small>Preview order</small>
            <strong>{scenarioOrder.lines[0]?.name ?? "Wardrobe order"}</strong>
            <span>{orderStateLabel(scenarioOrder.lifecycleStatus)} · {orderStateLabel(scenarioOrder.fulfillmentStatus)}</span>
          </span>
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      ) : (
        <section className="studio-piece-next" id="studio-scenario-order" aria-label="Requested preview order unavailable">
          <span><CircleAlert aria-hidden="true" size={20} /></span>
          <div>
            <small>Preview order unavailable</small>
            <strong>Requested order</strong>
            <p>This order is not in the current preview. Studio will not substitute another order.</p>
          </div>
          <button className="button button-secondary" onClick={clearScenarioOrderRoute} type="button">Return to Operations</button>
        </section>
      ) : null}

      <section className="studio-piece-next" aria-label="Next Operations action">
        <span>{nextMismatch || nextActionOrder ? <CircleAlert aria-hidden="true" size={20} /> : <Check aria-hidden="true" size={20} />}</span>
        <div>
          <small>Continue</small>
          <strong>{nextMismatch ? `Reconcile ${nextMismatch.title}` : nextActionOrder ? (studioOrderHasDueReturnWork(nextActionOrder) ? "Review return" : "Continue order") : nextHeldPiece ? `Review hold for ${nextHeldPiece.title}` : "Inventory reconciled"}</strong>
          <p>{nextMismatch ? `${nextMismatch.observedLocationLabel ?? "Last seen location"} differs from ${nextMismatch.expectedLocationLabel}.` : nextActionOrder ? `${nextActionOrderLabel} needs review.` : nextHeldPiece ? "Confirm the customer hold is still current." : "No exception is waiting. A stock count is the next available action."}</p>
        </div>
        {nextMismatch ? <button className="button button-primary" onClick={(event) => openPiece(nextMismatch, event.currentTarget)} type="button">Review location</button> : nextActionOrder ? <Link className="button button-primary" href={`/studio/orders/${nextActionOrder.reference}#studio-order-next-action`}>{studioOrderHasDueReturnWork(nextActionOrder) ? "Review return" : "Open order"}</Link> : nextHeldPiece ? <button className="button button-primary" onClick={(event) => openPiece(nextHeldPiece, event.currentTarget)} type="button">Review hold</button> : <Link className="button button-primary" href="/studio/stocktake">Start stock count</Link>}
      </section>

      <StudioSegmentedView active={activeView} label="Operations workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      {activeView === "attention" ? (
        <StudioStackSection className="studio-operation-section studio-stack-panel" id="studio-view-attention" aria-labelledby="studio-tab-attention" role="tabpanel">
          {mismatches.length || actionOrders.length ? <div className="studio-operation-cards">
            {mismatches.map((piece) => <article className="studio-operation-card studio-compact-row" data-state-tone="critical" key={`location:${piece.pieceKey}`}><button className="studio-operation-card-trigger" onClick={(event) => openPiece(piece, event.currentTarget)} type="button"><div className="studio-card-heading"><div><small>{piece.sku ?? "Private piece"}</small><h3>{piece.title}</h3></div><CircleAlert aria-label="Location differs" size={18} /></div><dl><div><dt>Expected</dt><dd>{piece.expectedLocationLabel}</dd></div><div><dt>Last seen</dt><dd>{piece.observedLocationLabel ?? "Not confirmed"}</dd></div></dl><span className="studio-operation-card-open"><span className="sr-only">Review location</span><ChevronRight aria-hidden="true" size={17} /></span></button></article>)}
            {actionOrders.map((order) => {
              const hasReturnWork = studioOrderHasDueReturnWork(order);
              return <article className="studio-operation-card studio-compact-row" data-state-tone={hasReturnWork ? "critical" : "caution"} key={`order:${order.reference}`}><Link className="studio-operation-card-trigger" href={`/studio/orders/${order.reference}#studio-order-next-action`}><div className="studio-card-heading"><div><small>{scenario ? "Preview order" : order.reference}</small><h3>{order.lines[0]?.name ?? "Wardrobe order"}</h3><LifecycleMeta state={hasReturnWork ? "DRAFT" : "RESERVED"} /></div></div><dl><div><dt>Exception</dt><dd>{hasReturnWork ? "Return needs review" : "Order needs action"}</dd></div><div><dt>Payment</dt><dd>{order.fundsConfirmationStatus.toLowerCase()}</dd></div></dl><span className="studio-operation-card-open"><span className="sr-only">Open in Orders</span><ChevronRight aria-hidden="true" size={17} /></span></Link></article>;
            })}
          </div> : <StudioFeedback state="empty" title="Nothing needs attention" />}
        </StudioStackSection>
      ) : null}

      {activeView === "inventory" ? (
        <StudioStackSection className="studio-operation-section studio-stack-panel" id="studio-view-inventory" aria-labelledby="studio-tab-inventory" role="tabpanel">
          {pieces.length ? <div className="studio-table studio-inventory-list" role="list" aria-label="Inventory pieces">
            {pieces.map((piece) => {
              const pieceState = lifecycle(piece);
              const status = STUDIO_LIFECYCLE_PRESENTATION[pieceState];
              return (
              <article role="listitem" key={piece.pieceKey}>
                <button aria-haspopup="dialog" className="studio-table-row studio-inventory-row-trigger studio-compact-row" data-state-tone={status.tone} onClick={(event) => openPiece(piece, event.currentTarget)} type="button">
                  <span className={`studio-inventory-media${piece.imageSrc ? " is-photo" : ""}`}>{piece.imageSrc ? <img alt="" height={160} loading="lazy" src={piece.imageSrc} width={128} /> : <Shirt aria-hidden="true" size={22} />}</span>
                  <span className="studio-inventory-copy"><small>{piece.sku ?? "Private piece"}</small><strong>{piece.title}</strong><span className="studio-inventory-meta"><LifecycleMeta state={pieceState} /><i aria-hidden="true">·</i><em>{piece.observedLocationLabel ?? piece.expectedLocationLabel}</em></span></span>
                  <span className="studio-inventory-stock"><strong>{piece.observedLocationLabel ?? piece.expectedLocationLabel}</strong><small>{piece.hasLocationMismatch ? `Expected ${piece.expectedLocationLabel}` : piece.observedAt ? `Confirmed ${shortDate(piece.observedAt)}` : "Expected location"}</small></span>
                  <span className="studio-inventory-action">{piece.hasLocationMismatch ? <CircleAlert aria-label="Location differs" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}</span>
                </button>
              </article>
              );
            })}
          </div> : <StudioFeedback action={<Link className="button button-primary" href="/studio/wardrobe?intake=1">Add garment</Link>} state="empty" title="No pieces yet" />}
        </StudioStackSection>
      ) : null}

      {activeView === "holds" ? (
        <StudioStackSection className="studio-operation-section studio-stack-panel" id="studio-view-holds" aria-labelledby="studio-tab-holds" role="tabpanel">
          {activeHolds.length ? <div className="studio-operation-cards">{activeHolds.map((hold) => {
            const piece = pieces.find((candidate) => candidate.sku === hold.sku);
            return <article className="studio-operation-card studio-compact-row" data-state-tone="caution" key={hold.id}><button className="studio-operation-card-trigger" onClick={(event) => piece && openPiece(piece, event.currentTarget)} type="button"><div className="studio-card-heading"><div><small>{hold.sku}</small><h3>{piece?.title ?? hold.sku}</h3><LifecycleMeta state="RESERVED" /></div></div><dl><div><dt>For</dt><dd>{hold.customerName}</dd></div><div><dt>Contact</dt><dd>{hold.contact}</dd></div><div><dt>Expires</dt><dd>{shortDate(hold.expiresAt)}</dd></div></dl><span className="studio-operation-card-open"><span className="sr-only">Review</span><ChevronRight aria-hidden="true" size={17} /></span></button></article>;
          })}</div> : <StudioFeedback state="empty" title="No active holds" />}
        </StudioStackSection>
      ) : null}

      <StudioTaskSheet
        className="studio-scenario-order-sheet"
        eyebrow={scenarioOrder ? "Preview order" : "Scenario preview"}
        footer={(requestClose) => <button className="button button-primary" onClick={requestClose} type="button">Done</button>}
        onDismiss={closeScenarioOrder}
        open={scenarioOrderOpen && Boolean(scenarioOrder)}
        returnFocus={scenarioOrderReturnFocus}
        title={scenarioOrder?.lines[0]?.name.split(" · ")[0] ?? "Scenario order"}
      >
        {scenarioOrder ? <div className="studio-inventory-detail">
          <StudioFeedback detail="This preview uses the local lifecycle scenario. It cannot charge, dispatch, refund, release, or change an order." state="empty" title="Read-only scenario" />
          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Customer</h3></div>
            <dl className="studio-inventory-detail-facts">
              <div><dt>Name</dt><dd>{scenarioOrder.contact.name}</dd></div>
              <div><dt>Contact</dt><dd>{scenarioOrder.contact.phone || scenarioOrder.contact.email}</dd></div>
              <div><dt>Created</dt><dd>{shortDate(scenarioOrder.savedAt)}</dd></div>
            </dl>
          </section>
          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Piece</h3></div>
            <dl className="studio-inventory-detail-facts">
              {scenarioOrder.lines.map((line) => <div key={line.sku}><dt>{line.sku}</dt><dd>{line.name} · {line.taggedSize}</dd></div>)}
              <div><dt>Total</dt><dd>{formatNaira(scenarioOrder.total)}</dd></div>
              <div><dt>Handoff</dt><dd>{scenarioOrder.deliveryLabel}</dd></div>
            </dl>
          </section>
          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Status</h3></div>
            <dl className="studio-inventory-detail-facts">
              <div><dt>Reference</dt><dd>Preview only</dd></div>
              <div><dt>Order</dt><dd>{orderStateLabel(scenarioOrder.lifecycleStatus)}</dd></div>
              <div><dt>Receipt</dt><dd>{orderStateLabel(scenarioOrder.paymentReviewStatus)}</dd></div>
              <div><dt>Payment</dt><dd>{orderStateLabel(scenarioOrder.fundsConfirmationStatus)}</dd></div>
              <div><dt>{scenarioOrder.fulfillment.kind === "PICKUP" ? "Pickup" : "Delivery"}</dt><dd>{orderStateLabel(scenarioOrder.fulfillmentStatus)}</dd></div>
            </dl>
          </section>
        </div> : null}
      </StudioTaskSheet>

      <StudioTaskSheet className="studio-inventory-detail-sheet" eyebrow={selected?.sku ?? "Private piece"} onDismiss={closePiece} open={Boolean(selected)} returnFocus={returnFocus} title={selected?.title ?? "Piece"}>
        {selected ? <div className="studio-inventory-detail">
          {selected.imageSrc ? <figure className="studio-inventory-detail-media is-photo"><img alt={`${selected.title} inventory view`} height={1280} src={selected.imageSrc} width={1024} /></figure> : null}
          <LifecycleMeta className="studio-inventory-detail-state" state={lifecycle(selected)} />
          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Location</h3></div>
            <dl className="studio-inventory-detail-facts"><div><dt>Custody</dt><dd>{selected.expectedCustody.toLowerCase()}</dd></div><div><dt>Expected</dt><dd>{selected.expectedLocationLabel}</dd></div><div><dt>Last seen</dt><dd>{selected.observedLocationLabel ?? "Not confirmed"}</dd></div><div><dt>Attached to</dt><dd>{selected.activeHold ? `Hold · ${selected.activeHold.customerName}` : selected.orderReference ? `Order · ${selected.orderReference}` : "Nothing"}</dd></div></dl>
          </section>

          {selected.hasLocationMismatch ? <StudioFeedback action={selected.orderReference ? <Link className="button button-secondary" href={`/studio/orders/${selected.orderReference}`}>Review order</Link> : undefined} detail={`Expected ${selected.expectedLocationLabel}; last seen ${selected.observedLocationLabel}.`} state="error" title="Location differs" /> : null}

          {requestedStateNotice ? <StudioFeedback detail={requestedStateNotice} state="empty" title="No active hold" /> : null}
          {notice ? <StudioFeedback detail={notice} state="success" title="Saved" /> : null}
          {error ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}

          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Confirm location</h3></div>
            {selected.expectedCustody === "STUDIO" ? <div className="studio-inventory-decision-grid">{locations.map((location) => {
              const confirmsExpected = selected.expectedLocationKey === location.key;
              const savingLocation = pendingAction === "location";
              return <button aria-busy={savingLocation} aria-haspopup="dialog" className="studio-inventory-decision" disabled={Boolean(pendingAction) || Boolean(scenario)} key={location.key} onClick={(event) => openLocationReview(selected, location, confirmsExpected ? "CONFIRM" : "MOVE", event.currentTarget)} type="button"><MapPin aria-hidden="true" size={20} /><span><strong>{savingLocation ? "Saving location…" : confirmsExpected ? `Confirm at ${location.label}` : `Move to ${location.label}`}</strong><small>{scenario ? "Read-only scenario" : savingLocation ? "Keeping other inventory actions paused." : confirmsExpected ? "Check the piece is here." : `Expected location becomes ${location.label.toLowerCase()}.`}</small></span><ChevronRight aria-hidden="true" size={17} /></button>;
            })}</div> : <div className="studio-quiet-empty"><MapPin aria-hidden="true" size={22} /><div><strong>{selected.expectedLocationLabel}</strong><p>{selected.orderReference ? "Continue with the connected order." : "Confirm the handoff before moving this piece."}</p></div>{selected.orderReference ? <Link className="button button-secondary" href={`/studio/orders/${selected.orderReference}`}>Open order</Link> : null}</div>}
          </section>

          <section className="studio-inventory-detail-section">
            <div className="studio-inventory-detail-heading"><h3>Actions</h3></div>
            <div className="studio-inventory-decision-grid">
              {selected.orderReference ? <Link className="studio-inventory-decision" href={`/studio/orders/${selected.orderReference}`}><PackageCheck aria-hidden="true" size={20} /><span><strong>Open order</strong><small>Continue with this order.</small></span><ChevronRight aria-hidden="true" size={17} /></Link> : null}
              {selected.activeHold ? <button className="studio-inventory-decision" disabled={Boolean(pendingAction) || Boolean(scenario)} onClick={(event) => openRelease(event.currentTarget)} type="button"><RotateCcw aria-hidden="true" size={20} /><span><strong>Review hold release</strong><small>{scenario ? "Read-only scenario" : "Confirm before making this piece available again."}</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
              {!selected.activeHold && selected.availability === "AVAILABLE" && selected.expectedCustody === "STUDIO" && !selected.hasLocationMismatch && selected.sku ? <button className="studio-inventory-decision" disabled={Boolean(pendingAction) || Boolean(scenario)} onClick={openHold} type="button"><UserRound aria-hidden="true" size={20} /><span><strong>Hold for customer</strong><small>{scenario ? "Read-only scenario" : "Name, contact and expiry required."}</small></span><ChevronRight aria-hidden="true" size={17} /></button> : null}
              <Link className="studio-inventory-decision" href={`/studio/wardrobe/${encodeURIComponent(selected.wardrobeItemId ?? selected.sku ?? selected.pieceKey)}`}><Shirt aria-hidden="true" size={20} /><span><strong>Open piece</strong><small>Review garment truth and media.</small></span><ChevronRight aria-hidden="true" size={17} /></Link>
            </div>
          </section>
        </div> : null}
      </StudioTaskSheet>

      <StudioDecisionSheet
        busyLabel={locationReview?.command === "CONFIRM" ? "Saving this location check" : "Moving this piece"}
        confirmLabel={locationReview?.command === "CONFIRM" ? "Confirm location" : "Move"}
        consequence={locationReview?.command === "CONFIRM"
          ? `${locationReview.piece.title} will be recorded as seen at ${locationReview.target.label.toLowerCase()}. Expected location, Shop and orders stay unchanged.`
          : locationReview
            ? `Expected location changes from ${locationReview.piece.expectedLocationLabel} to ${locationReview.target.label}. Shop and orders stay unchanged.`
            : "The location record changes. Shop and orders stay unchanged."}
        eyebrow="Inventory"
        onConfirm={confirmLocationReview}
        onDismiss={closeLocationReview}
        open={Boolean(locationReview)}
        receiptDetail={locationReview?.command === "CONFIRM"
          ? `${locationReview.piece.title} was confirmed at ${locationReview.target.label.toLowerCase()}.`
          : locationReview
            ? `${locationReview.piece.title} is now expected at ${locationReview.target.label.toLowerCase()}.`
          : "The expected location is current."}
        receiptTitle={locationReview?.command === "CONFIRM" ? "Location confirmed" : "Location moved"}
        returnFocus={locationReturnFocus}
        summary={locationReview?.piece.title ?? "Review this location change."}
        title={locationReview?.command === "CONFIRM" ? "Confirm location" : "Review move"}
      />

      <StudioDecisionSheet
        busyLabel="Releasing this hold"
        confirmLabel="Release hold"
        consequence="The customer hold ends and the piece can become available again when no active order still reserves it."
        destructive
        eyebrow="Customer hold"
        onConfirm={releaseHold}
        onDismiss={() => setReleaseOpen(false)}
        open={releaseOpen}
        receiptDetail={notice || "Operations refreshed the authoritative hold and inventory state."}
        receiptTitle="Hold released"
        returnFocus={releaseReturnFocus}
        summary={selected?.activeHold
          ? `Release ${selected.title} from ${selected.activeHold.customerName}'s hold?`
          : `Review the current hold state for ${selected?.title ?? "this piece"}.`}
        title="Release customer hold"
      />

      <StudioTaskSheet busy={pending} busyLabel="Saving this hold" eyebrow="Customer hold" onDismiss={() => { if (holdPendingRef.current) return false; cancelHold(); }} onSubmit={saveHold} open={holdOpen} returnFocus={holdReturnFocus} title={holdPiece ? `Hold ${holdPiece.title}` : "Hold piece"}>
          <div className="studio-form-grid">
            <label className="studio-field"><span>Customer name</span><input autoComplete="name" disabled={pending} maxLength={120} onChange={(event) => setCustomerName(event.target.value)} required value={customerName} /></label>
            <label className="studio-field"><span>Phone or email</span><input autoComplete="email" disabled={pending} maxLength={160} onChange={(event) => setContact(event.target.value)} required value={contact} /></label>
            <label className="studio-field"><span>Expires</span><input disabled={pending} min={new Date().toISOString().slice(0, 16)} onChange={(event) => setExpiresAt(event.target.value)} required type="datetime-local" value={expiresAt} /></label>
            <label className="studio-field"><span>Reason</span><input disabled={pending} maxLength={240} onChange={(event) => setReason(event.target.value)} placeholder="Trying on tomorrow" required value={reason} /></label>
          </div>
          {error ? <StudioFeedback detail={error} state="error" title="Couldn’t save" /> : null}
          <footer className="studio-task-sheet-footer"><button className="button button-secondary" disabled={pending} onClick={cancelHold} type="button">Cancel</button><button className="button button-primary" disabled={pending} type="submit">{pending ? "Holding…" : "Hold piece"}</button></footer>
      </StudioTaskSheet>
    </StudioStackPage>
  );
}
