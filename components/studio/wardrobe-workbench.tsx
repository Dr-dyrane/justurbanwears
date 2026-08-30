"use client";

/* Approved catalogue media uses fixed local public paths across supported runtimes. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { assignDocumentNavigation } from "../brand/document-navigation-loading-stage";
import {
  ArrowRight,
  Check,
  ChevronDown,
  ImagePlus,
  LockKeyhole,
  PackageOpen,
  Plus,
  Send,
  ShieldCheck,
  Shirt,
  SlidersHorizontal,
} from "lucide-react";
import type {
  Garment,
  ListingUpdateInput,
  StudioListing,
  StudioLifecycleState,
} from "../../lib/studio/domain/entities";
import {
  everyGateReady,
  listingReadiness,
} from "../../lib/studio/domain/readiness";
import {
  getApprovedPublicListingContract,
  publicMediaLabel,
} from "../../lib/studio/projections/approved-catalogue";
import {
  getPendingWardrobeProductContract,
  pendingWardrobeMediaLabel,
  type PendingWardrobeProductContract,
} from "../../lib/studio/seeds/private-wardrobe-products";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { LifecycleMeta, STUDIO_LIFECYCLE_PRESENTATION } from "./atoms/lifecycle-meta";
import { ReadinessList } from "./atoms/readiness-list";
import { StudioDecisionSheet } from "./atoms/studio-decision-sheet";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioPager, StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioLink } from "./atoms/studio-link";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { StudioDropSheet } from "./collections/studio-drop-sheet";
import { StudioStackPage, StudioStackSection } from "./atoms/studio-stack-page";
import { GarmentIntakeSheet } from "./garment-intake/garment-intake-sheet";
import { WearSheet } from "./garment-intake/wear-sheet";
import { DraftDirectCaptures } from "./draft-direct-captures";
import type { DirectCaptureTarget } from "./draft-direct-captures";
import { useStudio } from "./studio-provider";
import { studioGarmentCover } from "./garment-cover";
import {
  isPendingDirectCaptureRole,
  pendingCaptureView,
  type OperatorSafePendingCapture,
} from "../../lib/studio/engine/pending-capture-contracts";
import {
  historicalDrop01Kind,
  selectPieceWorkspace,
} from "../../lib/studio/projections/piece-workspace";
import type {
  StudioPublicationReceipt,
  StudioPublicationReview,
} from "../../lib/studio/engine/catalogue-publication-contracts";
import type { StudioCollectionScope } from "../../lib/studio/application/contracts";
import {
  StudioMediaButton,
  StudioMediaViewerProvider,
  type StudioMediaItem,
} from "./media-viewer";
import { studioScenarioHref } from "../../lib/studio/simulator";
import { GarmentLifecyclePanel } from "./garment-lifecycle-panel";
import type { GarmentLifecycleWorkspace } from "../../lib/studio/engine/garment-lifecycle-contracts";
import { StudioAdaptiveWorkspace } from "./workspace/studio-adaptive-workspace";
import {
  StudioAtelierShopAdoption,
  type StudioAtelierAdoptionUiMode,
} from "./atelier/studio-atelier-shop-adoption";
import {
  projectStudioDropScopes,
  studioDropScopeForGarment,
} from "../../lib/studio/projections/drop-context";
import { selectStudioPublishingQueue } from "../../lib/studio/projections/publishing-queue";
import {
  clearSessionCommandKey,
  getOrCreateSessionCommandKey,
} from "../../lib/studio/idempotency/session-command-key";

const filters: Array<"ALL" | StudioLifecycleState> = [
  "ALL",
  "DRAFT",
  "READY",
  "PUBLISHED",
  "RESERVED",
  "SOLD",
  "RETURNED",
];

const garmentPageSize = 9;
const publishingPageSize = 8;
const studioUuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type WardrobeDropScope = StudioCollectionScope["key"];
type WardrobeCollectionScope = "all" | "private" | WardrobeDropScope;

const BASELINE_COLLECTIONS: StudioCollectionScope[] = [
  {
    id: "compat:drop-02",
    key: "drop-02",
    label: "Drop 02",
    ordinal: 2,
    version: 1,
    state: "ACTIVE",
    isCurrent: true,
    authority: "COMPATIBILITY",
    counts: { pieces: null, private: null, ready: null, published: null, available: null },
    nextAction: "/studio/wardrobe",
    updatedAt: "",
  },
  {
    id: "compat:drop-01",
    key: "drop-01",
    label: "Drop 01",
    ordinal: 1,
    version: 1,
    state: "ARCHIVED",
    isCurrent: false,
    authority: "COMPATIBILITY",
    counts: { pieces: null, private: null, ready: null, published: null, available: null },
    nextAction: "/studio/wardrobe?collection=drop-01",
    updatedAt: "",
  },
];

function dropKeyFromLabel(label: string): WardrobeDropScope | null {
  const normalized = label.trim().toLowerCase().replace(/\s+/g, "-");
  if (/^drop-[0-9]{2,}$/.test(normalized)) return normalized as WardrobeDropScope;
  return null;
}

function collectionScopeFromParam(value: string | null, currentDropKey: WardrobeDropScope): WardrobeCollectionScope {
  if (!value) return currentDropKey;
  const normalized = value.trim().toLowerCase();
  if (normalized === "current") return currentDropKey;
  if (normalized === "past") return currentDropKey === "drop-02" ? "drop-01" : "drop-02";
  if (normalized === "studio") return "private";
  if (normalized === "all" || normalized === "private" || /^drop-[0-9]{2,}$/.test(normalized)) {
    return normalized as WardrobeCollectionScope;
  }
  return currentDropKey;
}

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function PendingProductMedia({
  capturedViews = [],
  contract,
  title,
}: {
  capturedViews?: readonly PendingWardrobeProductContract["missingViews"][number][];
  contract: PendingWardrobeProductContract;
  title: string;
}) {
  const hasPublicMedia = contract.publicSafeMedia.length > 0;
  const stillMissing = contract.missingViews.filter((view) => !capturedViews.includes(view));
  const directSetComplete = contract.missingViews.length > 0 && stillMissing.length === 0;
  const mediaItems: StudioMediaItem[] = contract.publicSafeMedia.map((media) => ({
    alt: `${title}: ${pendingWardrobeMediaLabel(media.view).toLowerCase()}`,
    label: pendingWardrobeMediaLabel(media.view),
    src: media.src,
  }));
  return (
    <section className="studio-pending-product-media" aria-label={`${title} media readiness`}>
      <div className={`studio-pending-media-heading${hasPublicMedia ? " is-ready" : ""}`}>
        <span>
          {hasPublicMedia
            ? <Check aria-hidden="true" size={14} />
            : <ImagePlus aria-hidden="true" size={14} />}
        </span>
        <div>
          <strong>{hasPublicMedia ? "Shop photos" : directSetComplete ? "Ready to review" : "Photos needed"}</strong>
          <small>
            {hasPublicMedia
              ? `${contract.publicSafeMedia.length} Shop-ready photo${contract.publicSafeMedia.length === 1 ? "" : "s"}`
              : directSetComplete ? "Photos saved privately" : "Add the missing photos"}
          </small>
        </div>
      </div>

      {contract.publicSafeMedia.length ? (
        <div className="studio-pending-media-strip" aria-label={`${title} customer-ready views`}>
          {contract.publicSafeMedia.map((media, index) => {
            const label = pendingWardrobeMediaLabel(media.view);
            return (
              <StudioMediaButton index={index} items={mediaItems} key={media.view} label={`Preview ${label.toLowerCase()}`}>
                <figure>
                  <img alt={`${title}: ${label.toLowerCase()}`} height={media.height} loading="lazy" src={media.src} width={media.width} />
                  <figcaption>{label}</figcaption>
                </figure>
              </StudioMediaButton>
            );
          })}
        </div>
      ) : null}

      <div className="studio-capture-next">
        <small>{stillMissing.length ? "Next photos" : "Photos"}</small>
        <div>
          {stillMissing.map((view) => (
            <span key={view}>{pendingWardrobeMediaLabel(view)}</span>
          ))}
          {stillMissing.length ? null : <span>Saved · private</span>}
        </div>
      </div>
    </section>
  );
}

function garmentDossierHref(garment: Garment) {
  return `/studio/wardrobe/${encodeURIComponent(garment.id)}`;
}

function GarmentCard({ garment }: { garment: Garment }) {
  const { listings } = useStudio();
  const listing = listings.find((candidate) => candidate.garmentId === garment.id);
  const cover = studioGarmentCover(garment, listing);
  const capturedRoles = (["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] as const).filter((role) =>
    garment.references.some((reference) =>
      reference.id.startsWith("pending-capture-")
      && reference.view === pendingCaptureView(role)
    )
  );
  const workspace = selectPieceWorkspace({ garment, listing, capturedRoles });
  const coverItems: StudioMediaItem[] = cover ? [{ alt: cover.alt, label: "Garment front", src: cover.src }] : [];
  return (
    <article className="studio-garment-card" id={`studio-garment-${garment.id}`} tabIndex={-1}>
      <div className={`studio-garment-visual${cover ? " is-photo" : ""}`} data-variant={garment.visual}>
        {cover ? <StudioMediaButton items={coverItems} label={`Preview ${garment.title}`}><img alt={cover.alt} height={cover.height} loading="lazy" src={cover.src} width={cover.width} /></StudioMediaButton> : null}
        <span>{garment.category}</span>
        {cover ? null : <Shirt aria-hidden="true" size={54} strokeWidth={1.1} />}
        <small>{garment.sku}</small>
      </div>
      <div className="studio-garment-body">
        <StudioLink aria-label={`Open ${garment.title}`} className="studio-garment-disclosure" href={garmentDossierHref(garment)}>
          <span><small>{garment.sku} · {garment.sizeLabel}</small><strong>{garment.title}</strong><small>{garment.color} · {garment.price > 0 ? formatNaira(garment.price) : "Price pending"}</small></span>
          <span className="studio-piece-stage" data-stage={workspace.stage}>{workspace.stageLabel}</span>
          <ArrowRight aria-hidden="true" size={17} />
        </StudioLink>
      </div>
    </article>
  );
}

export function PieceWorkspaceView({ garment, initialAction, layout = "embedded", onDismiss, onContinueMedia }: { garment: Garment; initialAction?: "price"; layout?: "adaptive" | "embedded"; onDismiss(): void; onContinueMedia(garment: Garment): void }) {
  const studio = useStudio();
  const historicalKind = historicalDrop01Kind(garment);
  const completedDrop01Product = historicalKind === "SOLD_OUT";
  const incompleteDrop01Archive = historicalKind === "ARCHIVED_DRAFT";
  const historicalDrop01 = historicalKind !== null;
  const [captures, setCaptures] = useState<OperatorSafePendingCapture[]>([]);
  const [publicationReview, setPublicationReview] = useState<StudioPublicationReview | null>(
    garment.dynamicPublication?.state === "PUBLISHED"
      ? { state: "PUBLISHED", receipt: garment.dynamicPublication }
      : null,
  );
  const [publicationLoading, setPublicationLoading] = useState(Boolean(
    garment.privateWardrobeItemId && !historicalDrop01 && garment.dynamicPublication?.state !== "PUBLISHED"
  ));
  const [publicationLoadError, setPublicationLoadError] = useState("");
  const [publicationReload, setPublicationReload] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [publicationConfirmed, setPublicationConfirmed] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publicationError, setPublicationError] = useState("");
  const [publicationNeedsRefresh, setPublicationNeedsRefresh] = useState(false);
  const [atelierAdoptionMode, setAtelierAdoptionMode] = useState<StudioAtelierAdoptionUiMode>("idle");
  const [atelierAdoptionBusy, setAtelierAdoptionBusy] = useState(false);
  const [lifecycleWorkspace, setLifecycleWorkspace] = useState<GarmentLifecycleWorkspace>();
  const [photosOpen, setPhotosOpen] = useState(false);
  const [photosReturnFocus, setPhotosReturnFocus] = useState<HTMLElement | null>(null);
  const [secondaryOpen, setSecondaryOpen] = useState(initialAction === "price");
  const [detailsReturnFocus, setDetailsReturnFocus] = useState<HTMLElement | null>(null);
  const [shopReturnFocus, setShopReturnFocus] = useState<HTMLElement | null>(null);
  const publicationConfirmationId = useId();
  const publicationCommandRef = useRef(false);
  const photosTriggerRef = useRef<HTMLButtonElement>(null);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const shopTriggerRef = useRef<HTMLButtonElement>(null);
  const publicationCommandScope = `piece-publication:${garment.privateWardrobeItemId ?? garment.id}`;
  const listing = studio.listings.find((candidate) => candidate.garmentId === garment.id);
  const pendingContract = getPendingWardrobeProductContract(garment.sku);
  const cover = studioGarmentCover(garment, listing);
  const capturedRoles = (["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] as const).filter((role) =>
    captures.some((capture) => capture.role === role)
    || garment.references.some((reference) =>
      reference.id.startsWith("pending-capture-")
      && reference.view === pendingCaptureView(role)
    )
  );
  const workspace = selectPieceWorkspace({ garment, listing, capturedRoles });
  const captureTarget: DirectCaptureTarget | null = historicalDrop01 ? null : pendingContract ? {
    completionEndpoint: `/api/studio/pending-products/${encodeURIComponent(pendingContract.sku)}/completions`,
    endpoint: `/api/studio/pending-products/${encodeURIComponent(pendingContract.sku)}/captures`,
    key: pendingContract.sku,
    requiredRoles: pendingContract.missingViews.filter(isPendingDirectCaptureRole),
  } : garment.privateWardrobeItemId ? {
    aiSourceMode: "APPROVED_FRONT",
    approvedFrontUrl: garment.reviewCover?.src,
    completionEndpoint: `/api/studio/wardrobe/${encodeURIComponent(garment.privateWardrobeItemId)}/completions`,
    endpoint: `/api/studio/wardrobe/${encodeURIComponent(garment.privateWardrobeItemId)}/captures`,
    key: garment.privateWardrobeItemId,
    requiredRoles: ["GARMENT_BACK", "FABRIC_DETAIL"],
  } : null;
  const coverItems: StudioMediaItem[] = cover ? [{ alt: cover.alt, label: "Garment front", src: cover.src }] : [];
  const captureRevision = captures.map((capture) => `${capture.id}:${capture.approvedAt}`).join("|");
  const dynamicReview = garment.privateWardrobeItemId ? publicationReview : null;
  const authoritativePublicationState = lifecycleWorkspace?.state ?? garment.dynamicPublication?.state;
  const atelierAdoptionPublished = atelierAdoptionMode === "published";
  const hasAtelierAdoptionRoute = Boolean(
    garment.privateWardrobeItemId && studioUuidPattern.test(garment.privateWardrobeItemId),
  );
  const atelierAdoptionActive = hasAtelierAdoptionRoute
    && reviewOpen
    && authoritativePublicationState !== "PUBLISHED"
    && authoritativePublicationState !== "UNPUBLISHED"
    && authoritativePublicationState !== "ARCHIVED"
    && dynamicReview?.state !== "PUBLISHED";
  const atelierAdoptionOwnsShopSheet = atelierAdoptionActive
    && atelierAdoptionMode !== "blocked"
    && atelierAdoptionMode !== "error";
  const lifecycleOwnsMedia = authoritativePublicationState === "PUBLISHED"
    || authoritativePublicationState === "UNPUBLISHED";
  const nextAction = historicalDrop01
    ? workspace.nextAction
    : authoritativePublicationState === "ARCHIVED"
    ? { kind: "DYNAMIC_MANAGE", label: "View history", detail: "This piece is archived." }
    : authoritativePublicationState === "UNPUBLISHED"
      ? { kind: "DYNAMIC_MANAGE", label: "Manage listing", detail: "Edit it or return it to Shop." }
      : authoritativePublicationState === "PUBLISHED" || dynamicReview?.state === "PUBLISHED" || atelierAdoptionPublished
        ? { kind: "DYNAMIC_MANAGE", label: "Manage listing", detail: "Change price, photos, or visibility." }
        : atelierAdoptionMode === "loading"
          ? { kind: "DYNAMIC_LOADING", label: "Checking readiness…", detail: "" }
          : atelierAdoptionMode === "ready"
            ? { kind: "DYNAMIC_REVIEW", label: "Review seven Shop views", detail: "Publish the exact locked Atelier set." }
        : publicationLoading
          ? { kind: "DYNAMIC_LOADING", label: "Checking readiness…", detail: "" }
          : publicationLoadError
            ? { kind: "DYNAMIC_RETRY", label: "Check again", detail: publicationLoadError }
            : dynamicReview?.state === "READY"
              ? { kind: "DYNAMIC_REVIEW", label: "Review Shop preview", detail: "Confirm the piece and its three public photos." }
              : dynamicReview?.state === "BLOCKED" && workspace.nextAction.kind !== "CAPTURE"
                ? { kind: "DYNAMIC_REVIEW", label: "Finish Shop setup", detail: `${dynamicReview.blockers.length} step${dynamicReview.blockers.length === 1 ? "" : "s"} left.` }
                : workspace.nextAction;
  const dynamicStage = incompleteDrop01Archive
    ? { stage: "PRIVATE", label: "Archived draft" }
    : completedDrop01Product
      ? { stage: "SOLD", label: "Sold out" }
      : authoritativePublicationState === "ARCHIVED"
    ? { stage: "ARCHIVED", label: "Archived" }
    : authoritativePublicationState === "UNPUBLISHED"
      ? { stage: "PRIVATE", label: "Off Shop" }
      : authoritativePublicationState === "PUBLISHED" || atelierAdoptionPublished
        ? { stage: "LIVE", label: "Live" }
        : dynamicReview?.state === "READY"
    ? { stage: "READY", label: "Ready to publish" }
    : dynamicReview?.state === "PUBLISHED"
      ? { stage: "LIVE", label: "Live" }
      : { stage: workspace.stage, label: workspace.stageLabel };
  const targetCaptureCount = captureTarget?.requiredRoles.length ?? 0;
  const savedTargetCaptureCount = captureTarget?.requiredRoles.filter((role) => capturedRoles.includes(role)).length ?? 0;
  const photosState = targetCaptureCount
    ? `${savedTargetCaptureCount}/${targetCaptureCount} saved`
    : pendingContract?.publicSafeMedia.length
      ? `${pendingContract.publicSafeMedia.length} approved`
      : "Ready";
  const detailsState = garment.price > 0
    ? `${formatNaira(garment.price)} · ${garment.sizeLabel}`
    : `Price pending · ${garment.sizeLabel}`;
  const hasFactsTask = historicalDrop01 || Boolean(garment.privateWardrobeItemId || listing);
  const shopState = incompleteDrop01Archive
    ? "Archived draft"
    : completedDrop01Product
      ? "Sold out · archived"
      : authoritativePublicationState === "ARCHIVED"
    ? "Archived"
    : authoritativePublicationState === "UNPUBLISHED"
      ? "Off Shop"
      : authoritativePublicationState === "PUBLISHED" || atelierAdoptionPublished
        ? "Live"
        : atelierAdoptionMode === "loading"
          ? "Checking"
          : atelierAdoptionMode === "ready"
            ? "Ready to publish"
        : publicationLoading
          ? "Checking"
          : publicationLoadError
            ? "Unavailable"
            : dynamicReview?.state === "READY"
        ? "Ready to publish"
        : dynamicReview?.state === "PUBLISHED"
          ? "Live"
          : dynamicReview?.state === "BLOCKED"
            ? `${dynamicReview.blockers.length} step${dynamicReview.blockers.length === 1 ? "" : "s"} left`
            : "Private";
  const readPublicationReview = useCallback(async (signal?: AbortSignal) => {
    if (!garment.privateWardrobeItemId) return null;
    const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(garment.privateWardrobeItemId)}/publication`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal,
    });
    const body = await response.json() as { review?: StudioPublicationReview; error?: { message?: string } };
    if (!response.ok || !body.review) throw new Error(body.error?.message || "Readiness is unavailable.");
    return body.review;
  }, [garment.privateWardrobeItemId]);

  const reconcilePublicationReview = useCallback(async () => {
    const review = await readPublicationReview();
    if (review) {
      setPublicationReview(review);
      if (review.state === "PUBLISHED") {
        setPublicationError("");
        setPublicationNeedsRefresh(true);
      }
    }
    return review;
  }, [readPublicationReview]);

  const markAtelierAdoptionCommitted = useCallback(() => {
    setPublicationNeedsRefresh(true);
  }, []);

  useEffect(() => {
    if (!garment.privateWardrobeItemId || historicalDrop01) return;
    if (garment.dynamicPublication?.state === "PUBLISHED") {
      setPublicationReview({ state: "PUBLISHED", receipt: garment.dynamicPublication });
      setPublicationLoading(false);
      setPublicationLoadError("");
      return;
    }
    const controller = new AbortController();
    setPublicationReview(null);
    setPublicationLoading(true);
    setPublicationLoadError("");
    void readPublicationReview(controller.signal).then((review) => {
      if (review) {
        setPublicationReview(review);
        if (review.state === "PUBLISHED") setReviewOpen(false);
      }
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setPublicationLoadError(error instanceof Error ? error.message : "Readiness is unavailable.");
    }).finally(() => {
      if (!controller.signal.aborted) setPublicationLoading(false);
    });
    return () => controller.abort();
  }, [garment.dynamicPublication, garment.privateWardrobeItemId, historicalDrop01, captureRevision, publicationReload, readPublicationReview]);

  async function publishDynamicPiece() {
    if (!garment.privateWardrobeItemId || dynamicReview?.state !== "READY" || !publicationConfirmed || publicationCommandRef.current) return;
    const publicationRevision = dynamicReview.expectedRevision;
    const idempotencyKey = getOrCreateSessionCommandKey({
      keyPrefix: `studio-publish:${garment.privateWardrobeItemId}`,
      revision: publicationRevision,
      scope: publicationCommandScope,
    });
    publicationCommandRef.current = true;
    setPublishing(true);
    setPublicationError("");
    try {
      const response = await fetch(`/api/studio/wardrobe/${encodeURIComponent(garment.privateWardrobeItemId)}/publication`, {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json", "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision: publicationRevision,
          idempotencyKey,
          confirmation: "PUBLISH",
          publicMediaConfirmed: true,
        }),
      });
      const body = await response.json() as {
        receipt?: StudioPublicationReceipt;
        error?: { code?: string; message?: string; recovery?: string };
      };
      if (!response.ok || !body.receipt) {
        if (response.status === 409) {
          clearSessionCommandKey({
            key: idempotencyKey,
            revision: publicationRevision,
            scope: publicationCommandScope,
          });
          setPublicationConfirmed(false);
          setPublicationReview(null);
          setPublicationLoading(true);
          setPublicationError("Piece changed. Review the refreshed details.");
          setPublicationReload((value) => value + 1);
          return;
        }
        throw new Error([body.error?.message, body.error?.recovery].filter(Boolean).join(" ") || "Publishing did not finish.");
      }
      clearSessionCommandKey({
        key: idempotencyKey,
        revision: publicationRevision,
        scope: publicationCommandScope,
      });
      setPublicationReview({ state: "PUBLISHED", receipt: body.receipt });
      setPublicationNeedsRefresh(true);
    } catch (caught) {
      const recovered = await readPublicationReview().catch(() => null);
      if (recovered?.state === "PUBLISHED") {
        clearSessionCommandKey({
          key: idempotencyKey,
          revision: publicationRevision,
          scope: publicationCommandScope,
        });
        setPublicationReview(recovered);
        setPublicationNeedsRefresh(true);
        setPublicationError("");
      } else {
        setPublicationError(caught instanceof Error ? caught.message : "Publishing did not finish. Try again.");
      }
    } finally {
      publicationCommandRef.current = false;
      setPublishing(false);
    }
  }

  function activeTrigger(fallback: HTMLElement | null) {
    return document.activeElement instanceof HTMLElement ? document.activeElement : fallback;
  }

  function openPhotos(returnFocus = activeTrigger(photosTriggerRef.current)) {
    setPhotosReturnFocus(returnFocus);
    setPhotosOpen(true);
  }

  function openDetails(returnFocus = activeTrigger(detailsTriggerRef.current)) {
    setDetailsReturnFocus(returnFocus);
    setSecondaryOpen(true);
  }

  function openShop(returnFocus = activeTrigger(shopTriggerRef.current)) {
    setShopReturnFocus(returnFocus);
    setReviewOpen(true);
  }

  function dismissShop() {
    if (publicationNeedsRefresh) {
      assignDocumentNavigation(`/studio/wardrobe/${encodeURIComponent(garment.id)}`);
      return;
    }
    setReviewOpen(false);
  }

  function runNextAction() {
    if (nextAction.kind === "DYNAMIC_REVIEW") {
      openShop();
    } else if (nextAction.kind === "DYNAMIC_MANAGE") {
      openDetails();
    } else if (nextAction.kind === "DYNAMIC_RETRY") {
      setPublicationReload((value) => value + 1);
    } else if (workspace.nextAction.kind === "CAPTURE") {
      openPhotos();
    } else if (workspace.nextAction.kind === "FINISH") {
      studio.moveGarmentToWardrobe(garment.id);
    } else if (workspace.nextAction.kind === "TRY_ON") {
      onContinueMedia(garment);
    } else if (workspace.nextAction.kind === "PREPARE_SHOP") {
      studio.prepareListing(garment.id);
      openDetails();
    } else if (workspace.nextAction.kind === "REVIEW_SHOP") {
      openDetails();
    } else if (workspace.nextAction.kind === "PUBLISH" && listing) {
      openDetails();
    } else if (workspace.nextAction.kind === "VIEW_SHOP" && listing) {
      assignDocumentNavigation(`/shop/products/${listing.slug}`);
    } else if (workspace.nextAction.kind === "VIEW_OPERATIONS") {
      assignDocumentNavigation(studioScenarioHref("/studio/operations", studio.scenario));
    } else if (workspace.nextAction.kind === "KEEP_PRIVATE") {
      onDismiss();
    }
  }

  const adaptive = layout === "adaptive";
  const visual = (
      <div
        className={adaptive ? "juw-piece-v2-media" : `studio-draft-visual${cover ? " is-photo" : ""}`}
        data-piece-region="canvas"
        data-variant={garment.visual}
      >
        {cover ? <StudioMediaButton items={coverItems} label={`Preview ${garment.title}`}><img alt={cover.alt} height={cover.height} src={cover.src} width={cover.width} /></StudioMediaButton> : <Shirt aria-hidden="true" size={64} strokeWidth={1.05} />}
      </div>
  );
  const controls = (
      <div className={adaptive ? "juw-piece-v2-content" : "studio-draft-content"} data-piece-region="workspace">
        <div className={adaptive ? "juw-piece-v2-summary" : "studio-draft-summary"}>
          <div className="studio-card-heading"><div><small>{garment.sku} · {garment.sizeLabel}</small>{adaptive ? <h1 className="juw-piece-v2-title">{garment.title}</h1> : <h3>{garment.title}</h3>}</div><span className="studio-piece-stage" data-stage={dynamicStage.stage}>{dynamicStage.label}</span></div>
          <p>{garment.color} · {garment.condition}</p>
          <div className="studio-garment-facts">
            <span>{garment.price > 0 ? formatNaira(garment.price) : "Price pending"}</span>
            <span>{garment.quantity} unit{garment.quantity === 1 ? "" : "s"}</span>
            {garment.measurements.length > 0 ? <span>{garment.measurements.length} measurements</span> : null}
          </div>
        </div>
        <button
          aria-label={`${nextAction.label} for ${garment.title}`}
          className="studio-piece-next"
          data-studio-workspace-primary="true"
          disabled={nextAction.kind === "DYNAMIC_LOADING"}
          id="piece-primary-action"
          onClick={runNextAction}
          type="button"
        >
          <span><small>Next</small><strong>{nextAction.label}</strong><span>{nextAction.detail}</span></span>
          {nextAction.kind === "DYNAMIC_LOADING" ? null : <ArrowRight aria-hidden="true" size={18} />}
        </button>

        <div aria-label={`${garment.title} tasks`} className="studio-service-list studio-piece-task-list">
          {captureTarget && !lifecycleOwnsMedia ? (
            <button
              aria-haspopup="dialog"
              className="studio-service-row studio-piece-task-row"
              onClick={() => openPhotos(photosTriggerRef.current)}
              ref={photosTriggerRef}
              type="button"
            >
              <span aria-hidden="true"><ImagePlus size={19} strokeWidth={1.75} /></span>
              <span className="studio-service-copy"><strong>Product photos</strong><small>{photosState}</small></span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : null}
          {hasFactsTask && (historicalDrop01 || nextAction.kind !== "DYNAMIC_MANAGE") ? (
            <button
              aria-haspopup="dialog"
              className="studio-service-row studio-piece-task-row"
              onClick={() => openDetails(detailsTriggerRef.current)}
              ref={detailsTriggerRef}
              type="button"
            >
              <span aria-hidden="true"><SlidersHorizontal size={19} strokeWidth={1.75} /></span>
              <span className="studio-service-copy"><strong>{historicalDrop01 ? "History" : "Facts & price"}</strong><small>{historicalDrop01 ? "Read only" : detailsState}</small></span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : null}
          {garment.privateWardrobeItemId && !historicalDrop01 ? (
            <button
              aria-haspopup="dialog"
              className="studio-service-row studio-piece-task-row"
              onClick={() => openShop(shopTriggerRef.current)}
              ref={shopTriggerRef}
              type="button"
            >
              <span aria-hidden="true"><Send size={18} strokeWidth={1.75} /></span>
              <span className="studio-service-copy"><strong>Shop</strong><small>{shopState}</small></span>
              <ArrowRight aria-hidden="true" size={17} />
            </button>
          ) : null}
        </div>

        {captureTarget && !lifecycleOwnsMedia ? (
          <StudioTaskSheet
            className="studio-piece-photos-sheet"
            onDismiss={() => setPhotosOpen(false)}
            open={photosOpen}
            returnFocus={photosReturnFocus}
            title="Product photos"
          >
            {pendingContract ? <PendingProductMedia capturedViews={capturedRoles} contract={pendingContract} title={garment.title} /> : null}
            <DraftDirectCaptures garment={garment} onCapturesChange={setCaptures} target={captureTarget} />
          </StudioTaskSheet>
        ) : null}

        {garment.privateWardrobeItemId && !historicalDrop01 ? (
          <StudioTaskSheet
            busy={publishing || atelierAdoptionBusy}
            busyLabel={atelierAdoptionBusy ? "Publishing seven locked Atelier views" : "Publishing this piece"}
            className="studio-piece-shop-sheet"
            onDismiss={dismissShop}
            open={reviewOpen}
            returnFocus={shopReturnFocus}
            title="Shop"
          >
            {hasAtelierAdoptionRoute ? (
              <StudioAtelierShopAdoption
                active={atelierAdoptionActive}
                onBusyChange={setAtelierAdoptionBusy}
                onCommitted={markAtelierAdoptionCommitted}
                onModeChange={setAtelierAdoptionMode}
                reconcilePublication={reconcilePublicationReview}
                wardrobeItemId={garment.privateWardrobeItemId}
              />
            ) : null}
            {!atelierAdoptionOwnsShopSheet && dynamicReview?.state === "READY" ? <section className="studio-piece-shop studio-publication-review" id="piece-publication-review">
              <div className="studio-card-heading"><div><small>Preview</small><h3>{dynamicReview.title}</h3></div><strong>{formatNaira(dynamicReview.price)}</strong></div>
              <div className="studio-publication-media">
                {dynamicReview.media.map((item) => <StudioMediaButton items={[{
                  alt: `${dynamicReview.title} · ${item.label.toLowerCase()}`,
                  label: item.label,
                  src: item.assetUrl,
                }]} key={item.id} label={`Preview ${item.label.toLowerCase()}`}>
                  <img alt={`${dynamicReview.title} · ${item.label.toLowerCase()}`} height={item.height} src={item.assetUrl} width={item.width} />
                </StudioMediaButton>)}
              </div>
              <div className="studio-garment-facts">
                <span>{dynamicReview.category}</span><span>{dynamicReview.colour}</span><span>{dynamicReview.sizeLabel}</span><span>1 available</span>
              </div>
              <div className="studio-publication-confirm"><input checked={publicationConfirmed} id={publicationConfirmationId} onChange={(event) => setPublicationConfirmed(event.target.checked)} type="checkbox" /><label htmlFor={publicationConfirmationId}><strong>Make public</strong><small>These facts and photos will appear in Shop.</small></label></div>
              {publicationError ? <p className="studio-engine-error" role="alert">{publicationError}</p> : null}
              <div className="studio-sheet-actions"><button className="button button-primary" disabled={!publicationConfirmed || publishing} onClick={() => void publishDynamicPiece()} type="button">{publishing ? "Publishing…" : "Publish"}</button></div>
            </section> : null}
            {!atelierAdoptionOwnsShopSheet && publicationLoading ? <StudioLoadingStage label="Checking Shop…" /> : null}
            {!atelierAdoptionOwnsShopSheet && !publicationLoading && publicationLoadError ? <section className="studio-piece-shop-status"><p className="studio-engine-error" role="alert">{publicationLoadError}</p><button className="button button-primary" onClick={() => setPublicationReload((value) => value + 1)} type="button">Try again</button></section> : null}
            {!atelierAdoptionOwnsShopSheet && !publicationLoading && dynamicReview?.state === "BLOCKED" ? <section className="studio-piece-shop-status">
              <span aria-hidden="true"><Send size={20} /></span>
              <div><strong>Not ready yet</strong><small>{dynamicReview.blockers.length} step{dynamicReview.blockers.length === 1 ? "" : "s"} left</small></div>
              <div className="studio-piece-shop-blockers">{dynamicReview.blockers.map((blocker) => <span key={blocker}>{blocker}</span>)}</div>
              <div className="studio-sheet-actions">
                {captureTarget && !lifecycleOwnsMedia ? <button className="button button-primary" onClick={() => { setReviewOpen(false); openPhotos(photosTriggerRef.current); }} type="button">Open photos</button> : null}
                <button className="button button-secondary" onClick={() => { setReviewOpen(false); openDetails(detailsTriggerRef.current); }} type="button">Open details</button>
              </div>
            </section> : null}
            {!publicationLoading && dynamicReview?.state === "PUBLISHED" ? <section className="studio-piece-shop-status is-success">
              <span aria-hidden="true"><Check size={20} /></span>
              <div aria-live="polite"><strong>Live in Shop</strong><small>{dynamicReview.receipt.sku}</small></div>
              <a className="button button-primary" href={dynamicReview.receipt.shopUrl}>View in Shop</a>
            </section> : null}
          </StudioTaskSheet>
        ) : null}

        {hasFactsTask ? <>
          <StudioTaskSheet
            className="studio-piece-details-sheet"
            onDismiss={() => setSecondaryOpen(false)}
            open={secondaryOpen}
            returnFocus={detailsReturnFocus}
            title={historicalDrop01 ? "History" : "Facts & price"}
          >
            <div className="studio-piece-secondary-body">
              {historicalDrop01 ? (
                <section aria-label={`${garment.title} history`} className="studio-piece-shop studio-piece-history-summary">
                  <div className="studio-card-heading">
                    <div><small>Drop 01 history</small><h3>{dynamicStage.label}</h3></div>
                    <LockKeyhole aria-hidden="true" size={18} />
                  </div>
                  <p>{completedDrop01Product
                    ? "This completed Drop 01 piece is closed and cannot return to active Shop work."
                    : "This unfinished test piece is kept as an archived draft and is not active work."}</p>
                  <div className="studio-garment-facts">
                    <span>{garment.sku}</span>
                    <span>{garment.sizeLabel}</span>
                    <span>{garment.price > 0 ? formatNaira(garment.price) : "Price not set"}</span>
                  </div>
                </section>
              ) : <>
                {garment.privateWardrobeItemId
                  ? <GarmentLifecyclePanel initialAction={initialAction} onWorkspaceChange={setLifecycleWorkspace} wardrobeItemId={garment.privateWardrobeItemId} />
                  : listing ? <section className="studio-piece-shop"><ListingEditor listing={listing} /></section> : null}
              </>}
            </div>
          </StudioTaskSheet>
        </> : null}
      </div>
  );
  if (adaptive) {
    return (
      <StudioAdaptiveWorkspace
        className="juw-piece-v2"
        stage={visual}
        surfaceLabel={`${garment.title} controls`}
      >
        {controls}
      </StudioAdaptiveWorkspace>
    );
  }
  return <section className="studio-draft-manager studio-piece-workspace">{visual}{controls}</section>;
}

function ApprovedPublicMedia({ sku, slug, title }: {
  sku: string;
  slug: string;
  title: string;
}) {
  const contract = getApprovedPublicListingContract(sku, slug);
  if (!contract) {
    return (
      <div className="studio-public-media-empty">
        <ImagePlus aria-hidden="true" size={18} strokeWidth={1.6} />
        <span><small>Public media</small><strong>No approved product set</strong></span>
      </div>
    );
  }

  const mediaItems: StudioMediaItem[] = contract.media.map((frame) => ({
    alt: `${title}: ${publicMediaLabel(frame.slot).toLowerCase()}`,
    label: publicMediaLabel(frame.slot),
    src: frame.src,
  }));

  return (
    <div className="studio-public-contract">
      <div className="studio-public-anchor">
        {contract.modelAnchor.src
          ? <img alt="" height={42} src={contract.modelAnchor.src} width={42} />
          : <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.7} />}
        <span><small>Approved model</small><strong>{contract.modelAnchor.id}</strong></span>
        <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
      </div>
      <div className="studio-public-media-grid" aria-label={`${title} approved public frames`}>
        {contract.media.map((frame, index) => {
          const label = publicMediaLabel(frame.slot);
          return (
            <StudioMediaButton index={index} items={mediaItems} key={frame.slot} label={`Preview ${label.toLowerCase()}`}>
              <figure>
                <img alt={`${title}: ${label.toLowerCase()}`} loading="lazy" src={frame.src} />
                <figcaption>{label}</figcaption>
              </figure>
            </StudioMediaButton>
          );
        })}
      </div>
    </div>
  );
}

function ListingEditor({ listing }: { listing: StudioListing }) {
  const studio = useStudio();
  const garment = studio.garments.find((candidate) => candidate.id === listing.garmentId);
  const [title, setTitle] = useState(listing.title);
  const [description, setDescription] = useState(listing.description);
  const [price, setPrice] = useState(String(listing.price));
  const [modelId, setModelId] = useState(listing.modelId);
  const [decision, setDecision] = useState<
    | { kind: "CONFIRM_READY" | "PUBLISH" }
    | { kind: "SAVE"; update: ListingUpdateInput }
  >();
  const [decisionReturnFocus, setDecisionReturnFocus] = useState<HTMLElement | null>(null);
  const decisionInFlightRef = useRef(false);
  const gates = listingReadiness(studio, listing);
  const allReady = everyGateReady(gates);
  const approvedContract = getApprovedPublicListingContract(garment?.sku ?? "", listing.slug);
  if (!garment) return null;

  function requestDecision(
    kind: "CONFIRM_READY" | "PUBLISH",
    returnFocus: HTMLElement,
  ): void;
  function requestDecision(
    kind: "SAVE",
    returnFocus: HTMLElement,
    update: ListingUpdateInput,
  ): void;
  function requestDecision(
    kind: "CONFIRM_READY" | "PUBLISH" | "SAVE",
    returnFocus: HTMLElement,
    update?: ListingUpdateInput,
  ) {
    if (decisionInFlightRef.current) return;
    setDecisionReturnFocus(returnFocus);
    setDecision(kind === "SAVE" ? { kind, update: update! } : { kind });
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const activeElement = document.activeElement;
    requestDecision(
      "SAVE",
      activeElement instanceof HTMLElement ? activeElement : event.currentTarget,
      { title, description, price: Number(price), modelId },
    );
  }

  async function confirmDecision() {
    if (!decision || decisionInFlightRef.current) {
      return { error: "The listing decision is no longer current.", ok: false as const };
    }
    decisionInFlightRef.current = true;
    try {
      if (decision.kind === "SAVE") {
        studio.updateListing(listing.id, decision.update);
      } else if (decision.kind === "CONFIRM_READY") {
        if (!studio.confirmListingReady(listing.id)) {
          return { error: "The Shop preview is no longer ready. Review the refreshed checks and try again.", ok: false as const };
        }
      } else if (!studio.publishListing(listing.id)) {
        return { error: "The listing was not published. Review its current readiness and try again.", ok: false as const };
      }
      return { ok: true as const };
    } catch (caught) {
      return {
        error: caught instanceof Error ? caught.message : "Studio could not finish that listing change. Try again.",
        ok: false as const,
      };
    } finally {
      decisionInFlightRef.current = false;
    }
  }

  const decisionCopy = decision?.kind === "SAVE"
    ? {
      confirmLabel: "Save details",
      consequence: "Studio updates this private Shop draft. Customers see no change until the separate publish confirmation succeeds.",
      receiptDetail: "The authoritative local listing now contains the reviewed title, description, price, and model.",
      receiptTitle: "Details saved",
      summary: `Save the reviewed Shop details for ${listing.title}?`,
      title: "Review listing changes",
    }
    : decision?.kind === "CONFIRM_READY"
      ? {
        confirmLabel: "Approve preview",
        consequence: "The listing moves to Ready. It remains private until a separate publish confirmation.",
        receiptDetail: "The Shop preview is approved and ready for its final publication review.",
        receiptTitle: "Preview approved",
        summary: `Approve ${listing.title} as ready to publish?`,
        title: "Approve Shop preview?",
      }
      : decision?.kind === "PUBLISH"
        ? {
          confirmLabel: "Publish",
          consequence: "The approved listing becomes customer-visible in Shop using the reviewed facts and public media.",
          receiptDetail: "The authoritative local listing is now published in the simulator Shop.",
          receiptTitle: "Listing published",
          summary: `Publish ${listing.title} to Shop?`,
          title: "Publish listing?",
        }
        : null;

  return (<>
    <article className="studio-listing-card" id={listing.id}>
      <div className="studio-listing-preview">
        <span className="studio-public-label"><Send aria-hidden="true" size={13} />Shop preview</span>
        <ApprovedPublicMedia sku={garment.sku} slug={listing.slug} title={title} />
        <small>{listing.slug}</small>
        <h3>{title}</h3>
        <p>{description || "Description required"}</p>
        <strong>{formatNaira(Number(price) || 0)}</strong>
        <span>{garment.sizeLabel} · {garment.color} · {garment.condition}</span>
      </div>
      <form className="studio-listing-editor" onSubmit={save}>
        <div className="studio-card-heading"><div><small>{garment.sku}</small><h3>Ready for Shop</h3></div><LifecycleBadge state={listing.state} /></div>
        <div className="studio-form-grid studio-listing-fields">
          <label className="studio-field"><span>Shop title</span><input value={title} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="studio-field"><span>Price (₦)</span><input type="number" min="1" value={price} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setPrice(event.target.value)} /></label>
          <label className="studio-field"><span>Model</span><select value={modelId} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setModelId(event.target.value)}>{studio.models.map((model) => <option value={model.id} key={model.id}>{model.name} · {model.state.toLowerCase()}</option>)}</select></label>
          <label className="studio-field studio-field-wide"><span>Shop description</span><textarea rows={3} value={description} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
        <ReadinessList gates={gates} />
        <div className="studio-card-actions">
          {listing.state === "DRAFT" ? <button className="button button-secondary" type="submit">Save details</button> : null}
          {listing.state === "DRAFT" && approvedContract ? <button className="button button-primary" disabled={!allReady} onClick={(event) => requestDecision("CONFIRM_READY", event.currentTarget)} type="button">Approve Shop preview</button> : null}
          {listing.state === "READY" && approvedContract ? <button className="button button-primary" onClick={(event) => requestDecision("PUBLISH", event.currentTarget)} type="button">Publish</button> : null}
          {!approvedContract && ["DRAFT", "READY"].includes(listing.state) ? <span className="studio-inline-state"><LockKeyhole aria-hidden="true" size={16} />Private · photos still need approval</span> : null}
          {listing.state === "PUBLISHED" ? <span className="studio-inline-state"><Check aria-hidden="true" size={16} />Live in Shop</span> : null}
          {listing.state === "RESERVED" ? <span className="studio-inline-state">Reserved by an open order</span> : null}
          {listing.state === "SOLD" ? <span className="studio-inline-state">Sold · manage the return in Operations</span> : null}
        </div>
      </form>
    </article>
    {decision && decisionCopy ? (
      <StudioDecisionSheet
        confirmLabel={decisionCopy.confirmLabel}
        consequence={decisionCopy.consequence}
        eyebrow="Shop listing"
        onConfirm={confirmDecision}
        onDismiss={() => {
          setDecision(undefined);
          setDecisionReturnFocus(null);
        }}
        open
        receiptDetail={decisionCopy.receiptDetail}
        receiptTitle={decisionCopy.receiptTitle}
        returnFocus={decisionReturnFocus}
        summary={decisionCopy.summary}
        title={decisionCopy.title}
      >
        {decision.kind === "SAVE" ? (
          <div aria-label="Listing changes" className="studio-decision-diff">
            <p><strong>Title</strong><span>{listing.title}</span><i aria-hidden="true">→</i><span>{decision.update.title}</span></p>
            <p><strong>Price</strong><span>{formatNaira(listing.price)}</span><i aria-hidden="true">→</i><span>{formatNaira(decision.update.price ?? listing.price)}</span></p>
          </div>
        ) : null}
      </StudioDecisionSheet>
    ) : null}
  </>);
}

export function WardrobeWorkbench() {
  const studio = useStudio();
  const searchParams = useSearchParams();
  const dropContext = useMemo(
    () => projectStudioDropScopes(studio.garments, studio.listings),
    [studio.garments, studio.listings],
  );
  const projectedCollections = useMemo(
    () => studio.application.snapshot?.collectionScopes ?? [],
    [studio.application.snapshot],
  );
  const [collectionDefinitions, setCollectionDefinitions] = useState<StudioCollectionScope[]>([]);
  const availableCollections = collectionDefinitions.length
    ? collectionDefinitions
    : projectedCollections.length
      ? projectedCollections
      : BASELINE_COLLECTIONS;
  const collectionsForSheet = useMemo(
    () => availableCollections.map((collection) => {
      if (collection.counts.pieces !== null && collection.key !== "drop-01") return collection;
      const localPieces = new Set(studio.garments.filter((garment) => (
        studioDropScopeForGarment(garment, studio.listings, dropContext.currentDrop).label === collection.label
      )).map((garment) => garment.sku)).size;
      const pieces = collection.key === "drop-01"
        ? Math.max(collection.counts.pieces ?? 0, localPieces)
        : localPieces;
      return { ...collection, counts: { ...collection.counts, pieces } };
    }),
    [availableCollections, dropContext.currentDrop, studio.garments, studio.listings],
  );
  const currentCollectionKey = availableCollections.find((scope) => scope.isCurrent)?.key
    ?? dropKeyFromLabel(dropContext.currentDrop)
    ?? "drop-02";
  const intakeOriginRef = useRef<"query" | "trigger" | null>(null);
  const garmentQueryHandledRef = useRef<string | null>(null);
  const [intakeReturnFocus, setIntakeReturnFocus] = useState<HTMLElement | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [openPieceId, setOpenPieceId] = useState<string | null>(null);
  const [pieceReturnFocus, setPieceReturnFocus] = useState<HTMLElement | null>(null);
  const [garmentPage, setGarmentPage] = useState(0);
  const [publishingPage, setPublishingPage] = useState(0);
  const [wearWardrobeItemId, setWearWardrobeItemId] = useState<string | null>(null);
  const [wearReturnFocus, setWearReturnFocus] = useState<HTMLElement | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideReturnFocus, setGuideReturnFocus] = useState<HTMLElement | null>(null);
  const collectionQueryHandledRef = useRef(false);
  const collectionTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [collectionOpen, setCollectionOpen] = useState(false);
  const [collectionReturnFocus, setCollectionReturnFocus] = useState<HTMLElement | null>(null);
  const [collectionScope, setCollectionScope] = useState<WardrobeCollectionScope>(() => {
    const requestedScope = searchParams.get("collection");
    return studio.scenario && (!requestedScope || requestedScope === "choose")
      ? "all"
      : collectionScopeFromParam(requestedScope, currentCollectionKey);
  });
  const collectionIds = useMemo(() => {
    if (collectionScope === "all") return new Set(studio.garments.map((garment) => garment.id));
    if (collectionScope === "private") {
      return new Set(dropContext.scopes
        .filter((scope) => scope.key === "private" || scope.key === "studio")
        .flatMap((scope) => scope.garmentIds));
    }
    const label = availableCollections.find((scope) => scope.key === collectionScope)?.label
      ?? (collectionScope === "drop-01" ? "Drop 01" : "Drop 02");
    return new Set(studio.garments
      .filter((garment) => studioDropScopeForGarment(garment, studio.listings, dropContext.currentDrop).label === label)
      .map((garment) => garment.id));
  }, [availableCollections, collectionScope, dropContext.currentDrop, dropContext.scopes, studio.garments, studio.listings]);
  const scopedGarments = useMemo(
    () => studio.garments.filter((garment) => collectionIds.has(garment.id)),
    [collectionIds, studio.garments],
  );
  const activeScopedGarments = useMemo(
    () => scopedGarments.filter((garment) => historicalDrop01Kind(garment) === null),
    [scopedGarments],
  );
  const historyOnly = scopedGarments.length > 0 && activeScopedGarments.length === 0;
  const scopedListings = useMemo(
    () => studio.listings.filter((listing) => collectionIds.has(listing.garmentId)),
    [collectionIds, studio.listings],
  );
  const publishingQueue = useMemo(
    () => selectStudioPublishingQueue(activeScopedGarments, scopedListings),
    [activeScopedGarments, scopedListings],
  );
  const segments = useMemo(() => historyOnly ? [
    { key: "garments", label: "Garments", count: scopedGarments.length },
  ] : [
    { key: "garments", label: "Garments", count: scopedGarments.length },
    { key: "publishing", label: "Publishing", count: publishingQueue.length },
  ], [historyOnly, publishingQueue.length, scopedGarments.length]);
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "garments");

  useEffect(() => {
    if (searchParams.get("guide") !== "1" || guideOpen) return;
    window.setTimeout(() => setGuideOpen(true), 0);
  }, [guideOpen, searchParams]);

  useEffect(() => {
    const queryWantsCollection = searchParams.get("collection") === "choose"
      || Boolean(searchParams.get("dropAction"));
    if (!queryWantsCollection) {
      collectionQueryHandledRef.current = false;
      return;
    }
    if (!studio.scenario && studio.application.status === "loading") return;
    if (collectionQueryHandledRef.current || collectionOpen) return;
    collectionQueryHandledRef.current = true;
    window.setTimeout(() => setCollectionOpen(true), 0);
  }, [collectionOpen, searchParams, studio.application.status, studio.scenario]);

  useEffect(() => {
    if (!collectionOpen || collectionReturnFocus || !collectionTriggerRef.current) return;
    setCollectionReturnFocus(collectionTriggerRef.current);
  }, [collectionOpen, collectionReturnFocus]);

  useEffect(() => {
    const garmentId = searchParams.get("garment");
    if (!garmentId) {
      garmentQueryHandledRef.current = null;
      return;
    }
    if (garmentQueryHandledRef.current === garmentId || studio.hydration === "idle" || studio.hydration === "restoring") return;
    const garmentIndex = studio.garments.findIndex((garment) => garment.id === garmentId);
    if (garmentIndex < 0) return;
    const garment = studio.garments[garmentIndex];
    const resolvedScope = studioDropScopeForGarment(garment, studio.listings, dropContext.currentDrop);
    const resolvedCollectionScope: WardrobeCollectionScope = resolvedScope.key === "studio" || resolvedScope.key === "private"
      ? "private"
      : availableCollections.find((scope) => scope.label === resolvedScope.label)?.key
        ?? dropKeyFromLabel(resolvedScope.label)
        ?? "private";
    garmentQueryHandledRef.current = garmentId;
    window.requestAnimationFrame(() => {
      setCollectionScope(resolvedCollectionScope);
      setFilter("ALL");
      setGarmentPage(0);
      setOpenPieceId(garmentId);
    });
  }, [availableCollections, dropContext.currentDrop, searchParams, studio.garments, studio.hydration, studio.listings]);

  useEffect(() => {
    function syncCollectionScope() {
      const requestedScope = new URLSearchParams(window.location.search).get("collection");
      setCollectionScope(studio.scenario && (!requestedScope || requestedScope === "choose")
        ? "all"
        : collectionScopeFromParam(requestedScope, currentCollectionKey));
      setGarmentPage(0);
      setPublishingPage(0);
    }

    window.addEventListener("popstate", syncCollectionScope);
    return () => window.removeEventListener("popstate", syncCollectionScope);
  }, [currentCollectionKey, studio.scenario]);

  useEffect(() => {
    const queryWantsIntake = searchParams.get("intake") === "1";
    if (queryWantsIntake && !intakeOpen) {
      intakeOriginRef.current = "query";
      window.setTimeout(() => {
        setIntakeReturnFocus(null);
        setIntakeOpen(true);
      }, 0);
    } else if (!queryWantsIntake && intakeOriginRef.current === "query" && intakeOpen) {
      window.setTimeout(() => setIntakeOpen(false), 0);
    }
  }, [intakeOpen, searchParams, studio.hydration]);

  useEffect(() => {
    function syncQueryIntake() {
      const queryWantsIntake = new URLSearchParams(window.location.search).get("intake") === "1";
      if (!queryWantsIntake && intakeOriginRef.current === "query") {
        setIntakeOpen(false);
      }
    }

    window.addEventListener("popstate", syncQueryIntake);
    return () => window.removeEventListener("popstate", syncQueryIntake);
  }, []);

  function openIntake(returnFocus: HTMLElement | null) {
    intakeOriginRef.current = "trigger";
    setIntakeReturnFocus(returnFocus);
    setIntakeOpen(true);
  }

  function finishIntake() {
    const origin = intakeOriginRef.current;
    intakeOriginRef.current = null;
    setIntakeReturnFocus(null);
    setIntakeOpen(false);

    if (origin === "query") {
      const url = new URL(window.location.href);
      url.searchParams.delete("intake");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }

  const visibleGarments = useMemo(() => scopedGarments.filter((garment) => {
    if (filter === "ALL") return true;
    const listing = studio.listings.find((candidate) => candidate.garmentId === garment.id);
    return (listing?.state ?? garment.state) === filter;
  }), [filter, scopedGarments, studio.listings]);
  const safeGarmentPage = Math.min(garmentPage, Math.max(0, Math.ceil(visibleGarments.length / garmentPageSize) - 1));
  const pagedGarments = visibleGarments.slice(safeGarmentPage * garmentPageSize, (safeGarmentPage + 1) * garmentPageSize);
  const safePublishingPage = Math.min(publishingPage, Math.max(0, Math.ceil(publishingQueue.length / publishingPageSize) - 1));
  const pagedPublishingQueue = publishingQueue.slice(safePublishingPage * publishingPageSize, (safePublishingPage + 1) * publishingPageSize);
  const openPiece = studio.garments.find((garment) => garment.id === openPieceId);
  const nextGarment = activeScopedGarments.find((garment) => garment.state === "DRAFT") ?? activeScopedGarments[0];
  const nextPublishingEntry = publishingQueue.find((entry) => ["DRAFT", "READY"].includes(entry.state)) ?? publishingQueue[0];

  if (studio.hydration === "idle" || studio.hydration === "restoring") {
    return <StudioLoadingStage label="Opening wardrobe…" />;
  }

  const privateCount = dropContext.scopes
    .filter((scope) => scope.key === "studio" || scope.key === "private")
    .reduce((count, scope) => count + scope.count, 0);
  const dropChoices = [...collectionsForSheet]
    .sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || right.ordinal - left.ordinal)
    .map((scope) => {
      const localCount = studio.garments.filter((garment) => (
        studioDropScopeForGarment(garment, studio.listings, dropContext.currentDrop).label === scope.label
      )).length;
      return {
        key: scope.key as WardrobeCollectionScope,
        label: scope.label,
        count: scope.counts.pieces ?? localCount,
      };
    });
  const collectionChoices: Array<{ key: WardrobeCollectionScope; label: string; count: number | null }> = [
    { key: "all", label: "All", count: dropContext.totalCount },
    ...dropChoices,
    { key: "private", label: "Private", count: privateCount },
  ];
  const selectedCollection = collectionChoices.find((choice) => choice.key === collectionScope)
    ?? collectionChoices.find((choice) => choice.key === currentCollectionKey)
    ?? collectionChoices[0];

  function selectCollection(key: string) {
    const resolvedKey = key as WardrobeCollectionScope;
    setCollectionScope(resolvedKey);
    setFilter("ALL");
    setGarmentPage(0);
    setPublishingPage(0);
    const url = new URL(window.location.href);
    if (resolvedKey === currentCollectionKey) url.searchParams.delete("collection");
    else url.searchParams.set("collection", resolvedKey);
    url.searchParams.delete("dropAction");
    url.searchParams.delete("dropId");
    const target = `${url.pathname}${url.search}${url.hash}`;
    const commitSelection = () => {
      window.history.replaceState(window.history.state, "", target);
      setCollectionScope(resolvedKey);
    };
    if (window.history.state?.justUrbanDialog) {
      window.addEventListener("popstate", commitSelection, { once: true });
    } else {
      commitSelection();
    }
    setCollectionOpen(false);
  }

  function dismissCollection() {
    setCollectionOpen(false);
    setCollectionReturnFocus(null);
    const currentQuery = new URLSearchParams(window.location.search);
    if (currentQuery.get("collection") !== "choose" && !currentQuery.has("dropAction")) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("collection");
    url.searchParams.delete("dropAction");
    url.searchParams.delete("dropId");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }

  return (
    <StudioMediaViewerProvider>
    <StudioStackPage className="studio-ops-page studio-premium-surface studio-wardrobe-page" kind="service">
      <h1 className="sr-only" id="garments">Wardrobe</h1>

      <div className="studio-wardrobe-toolbar">
        <button
          aria-haspopup="dialog"
          className="studio-drop-scope-trigger"
          onClick={(event) => {
            setCollectionReturnFocus(event.currentTarget);
            setCollectionOpen(true);
          }}
          ref={collectionTriggerRef}
          type="button"
        >
          <span>{selectedCollection.label} · {selectedCollection.count === null
            ? "count unavailable"
            : `${selectedCollection.count} piece${selectedCollection.count === 1 ? "" : "s"}`}</span>
          <ChevronDown aria-hidden="true" size={15} />
        </button>
        <button className="studio-wardrobe-add-trigger" onClick={(event) => openIntake(event.currentTarget)} type="button">
          <Plus aria-hidden="true" size={16} />
          <span>Add garment</span>
        </button>
      </div>

      {activeView === "garments" ? (
        nextGarment ? (
          <StudioLink className="studio-stack-current" href={garmentDossierHref(nextGarment)}>
            <span><small>Continue</small><strong>{nextGarment.title}</strong><LifecycleMeta state={nextGarment.state} /></span>
            <ArrowRight aria-hidden="true" size={18} />
          </StudioLink>
        ) : historyOnly ? (
          <div className="studio-stack-current" data-history-only="true">
            <span><small>History</small><strong>Drop 01 is closed</strong></span>
            <LockKeyhole aria-hidden="true" size={18} />
          </div>
        ) : (
          <button className="studio-stack-current" onClick={(event) => openIntake(event.currentTarget)} type="button">
            <span><small>Next</small><strong>Add garment</strong></span>
            <Plus aria-hidden="true" size={18} />
          </button>
        )
      ) : nextPublishingEntry ? (
        <StudioLink className="studio-stack-current" href={garmentDossierHref(nextPublishingEntry.garment)}>
          <span><small>Continue</small><strong>{nextPublishingEntry.title}</strong><LifecycleMeta state={nextPublishingEntry.state} /></span>
          <ArrowRight aria-hidden="true" size={18} />
        </StudioLink>
      ) : (
        <StudioLink className="studio-stack-current" href="/studio/wardrobe">
          <span><small>Next</small><strong>Prepare a garment for Shop</strong></span>
          <ArrowRight aria-hidden="true" size={18} />
        </StudioLink>
      )}

      <StudioSegmentedView active={activeView} label="Wardrobe workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      {activeView === "garments" ? (
        <StudioStackSection aria-labelledby="studio-tab-garments" id="studio-view-garments" role="tabpanel">
          {historyOnly ? null : <details className="studio-stack-filter">
            <summary>
              <span className="studio-stack-filter-label"><SlidersHorizontal aria-hidden="true" size={15} strokeWidth={1.8} />Filter · {filter.toLowerCase()}</span>
              <span>{visibleGarments.length}</span>
            </summary>
            <div className="studio-filter-bar" role="group" aria-label="Filter wardrobe">
              {filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "is-active" : undefined} onClick={() => { setFilter(item); setGarmentPage(0); }} key={item} type="button">{item.toLowerCase()}</button>)}
            </div>
          </details>}
          <h2 className="sr-only" id="garments-view-title">Garments</h2>
          {visibleGarments.length ? <><div className="studio-garment-grid">{pagedGarments.map((garment) => <GarmentCard garment={garment} key={garment.id} />)}</div><StudioPager label="Garment pages" onPageChange={setGarmentPage} page={safeGarmentPage} pageSize={garmentPageSize} total={visibleGarments.length} /></> : (
            <div className="studio-quiet-empty studio-wardrobe-empty"><PackageOpen aria-hidden="true" size={26} strokeWidth={1.5} /><div><strong>{studio.garments.length
              ? filter === "ALL" ? `${selectedCollection.label} is empty` : "No garments in this state"
              : "Your wardrobe is empty"}</strong><p>{studio.garments.length
              ? filter === "ALL" ? "Choose another drop." : "Choose another filter."
            : "Add your first garment."}</p></div></div>
          )}
        </StudioStackSection>
      ) : (
        <section className="studio-publishing-section studio-stack-panel" id="studio-view-publishing" aria-labelledby="studio-tab-publishing" role="tabpanel">
          <div className="studio-section-title"><div><p className="eyebrow">Publishing</p><h2 id="publishing-title">Listing review</h2></div><span>{publishingQueue.length} piece{publishingQueue.length === 1 ? "" : "s"}</span></div>
          {publishingQueue.length ? <><div className="studio-publishing-queue">{pagedPublishingQueue.map((entry) => {
            const status = STUDIO_LIFECYCLE_PRESENTATION[entry.state];
            const cover = studioGarmentCover(entry.garment, entry.kind === "LISTING" ? entry.listing : undefined);
            return <StudioLink className="studio-publishing-row studio-compact-row" data-publication-path={entry.kind === "STUDIO_NATIVE_THREE_PHOTO" ? "native-three-photo" : "listing"} data-state-tone={status.tone} href={garmentDossierHref(entry.garment)} key={entry.id}>
              <span aria-hidden="true" className={`studio-publishing-media${cover ? " is-photo" : ""}`} data-variant={entry.garment.visual}>
                {cover ? <img alt="" height={cover.height} loading="lazy" src={cover.src} width={cover.width} /> : <Shirt size={22} strokeWidth={1.4} />}
              </span>
              <span className="studio-publishing-copy"><small>{entry.garment.sku}{entry.kind === "STUDIO_NATIVE_THREE_PHOTO" ? " · 3-photo Shop" : ""}</small><strong>{entry.title}</strong><LifecycleMeta state={entry.state} /></span>
              <ArrowRight aria-hidden="true" size={17} />
            </StudioLink>;
          })}</div><StudioPager label="Publishing pages" onPageChange={setPublishingPage} page={safePublishingPage} pageSize={publishingPageSize} total={publishingQueue.length} /></> : <div className="studio-quiet-empty"><Send aria-hidden="true" size={24} strokeWidth={1.5} /><div><strong>No Shop previews</strong><p>Approved Shop previews appear here.</p></div></div>}
        </section>
      )}

      <StudioDropSheet
        allCount={dropContext.totalCount}
        collections={collectionsForSheet}
        initialAction={searchParams.get("dropAction") === "create"
          ? "create"
          : searchParams.get("dropAction") === "manage" ? "manage" : undefined}
        initialCollectionId={searchParams.get("dropId")}
        onApplied={(change) => {
          setCollectionDefinitions(change.collections);
          if (!studio.scenario) void studio.application.refresh();
        }}
        onDismiss={dismissCollection}
        onSelect={selectCollection}
        open={collectionOpen}
        privateCount={privateCount}
        returnFocus={collectionReturnFocus}
        scenario={Boolean(studio.scenario)}
        selectedKey={collectionScope}
      />

      {wearWardrobeItemId ? <WearSheet
        onDismiss={() => { setWearWardrobeItemId(null); setWearReturnFocus(null); }}
        open
        returnFocus={wearReturnFocus}
        wardrobeItemId={wearWardrobeItemId}
      /> : null}

      <StudioTaskSheet
        className="studio-guide-sheet"
        eyebrow="Lulu's guide"
        onDismiss={() => {
          setGuideOpen(false);
          setGuideReturnFocus(null);
          if (new URLSearchParams(window.location.search).get("guide") === "1") {
            const url = new URL(window.location.href);
            url.searchParams.delete("guide");
            window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
          }
        }}
        open={guideOpen}
        returnFocus={guideReturnFocus}
        title="Add a garment"
      >
        <section className="studio-guide-flow">
          {[
            ["01", "Show", "Camera · Photos · Describe", "01-start.png"],
            ["02", "Build", "Confirm the source", "02-source.png"],
            ["03", "Review", "Keep · Edit · Try once", "03-confirm.png"],
            ["04", "Finish", "Private in Wardrobe", "05-saved.png"],
          ].map(([number, title, detail, image]) => (
            <figure key={number}>
              <img alt={`${title} step in Lulu's garment intake`} height={844} loading="lazy" src={`/studio/guides/lulu-garment-intake/${image}`} width={390} />
              <figcaption><span>{number}</span><div><strong>{title}</strong><small>{detail}</small></div></figcaption>
            </figure>
          ))}
        </section>
        <p className="studio-guide-truth"><ShieldCheck aria-hidden="true" size={17} />Private until you publish. Unseen back and detail stay missing.</p>
      </StudioTaskSheet>

      <GarmentIntakeSheet
        client={studio.intakeClient}
        onDismiss={finishIntake}
        open={intakeOpen}
        returnFocus={intakeReturnFocus}
      />

      <StudioTaskSheet
        className="studio-draft-sheet studio-piece-sheet"
        eyebrow="Piece"
        onDismiss={() => { setOpenPieceId(null); setPieceReturnFocus(null); }}
        open={Boolean(openPiece)}
        returnFocus={pieceReturnFocus}
        title={openPiece?.title ?? "Piece"}
      >
        {openPiece ? <PieceWorkspaceView
          garment={openPiece}
          onDismiss={() => setOpenPieceId(null)}
          onContinueMedia={(garment) => {
            setOpenPieceId(null);
            setWearReturnFocus(pieceReturnFocus);
            window.setTimeout(() => setWearWardrobeItemId(garment.privateWardrobeItemId ?? null), 180);
          }}
        /> : null}
      </StudioTaskSheet>
    </StudioStackPage>
    </StudioMediaViewerProvider>
  );
}
