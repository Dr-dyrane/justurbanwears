"use client";

/* Approved catalogue media uses fixed local public paths across supported runtimes. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  BookOpen,
  Check,
  ImagePlus,
  PackageOpen,
  Plus,
  Send,
  ShieldCheck,
  Shirt,
} from "lucide-react";
import type {
  Garment,
  StudioListing,
  StudioLifecycleState,
} from "../../lib/studio/domain/entities";
import {
  everyGateReady,
  garmentReadiness,
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
import { ReadinessList } from "./atoms/readiness-list";
import { StudioPager, StudioSegmentedView, useStudioSegment } from "./atoms/studio-segmented-view";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { GarmentIntakeSheet } from "./garment-intake/garment-intake-sheet";
import { WearSheet } from "./garment-intake/wear-sheet";
import { useStudio } from "./studio-provider";
import { studioGarmentCover } from "./garment-cover";

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

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function MissingMedia({ garment }: { garment: Garment }) {
  const { addGarmentMedia } = useStudio();
  const missing = (["FRONT", "BACK", "DETAIL"] as const).filter((view) =>
    !garment.references.some((reference) => reference.view === view),
  );
  if (!missing.length) return null;
  return (
    <div className="studio-missing-media">
      <span><ImagePlus aria-hidden="true" size={16} />Add missing media</span>
      <div>
        {missing.map((view) => (
          <label key={view}>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(event) => {
                if (event.target.files?.[0]) addGarmentMedia(garment.id, view);
                event.target.value = "";
              }}
            />
            {view.toLowerCase()}
          </label>
        ))}
      </div>
    </div>
  );
}

function PendingProductMedia({
  contract,
  title,
}: {
  contract: PendingWardrobeProductContract;
  title: string;
}) {
  const hasReadyMedia = contract.publicSafeMedia.length > 0;
  return (
    <section className="studio-pending-product-media" aria-label={`${title} media readiness`}>
      <div className={`studio-pending-media-heading${hasReadyMedia ? " is-ready" : ""}`}>
        <span>
          {hasReadyMedia
            ? <Check aria-hidden="true" size={14} />
            : <ImagePlus aria-hidden="true" size={14} />}
        </span>
        <div>
          <strong>{hasReadyMedia ? "Ready" : "Capture needed"}</strong>
          <small>
            {hasReadyMedia
              ? `${contract.publicSafeMedia.length} customer-ready view${contract.publicSafeMedia.length === 1 ? "" : "s"}`
              : "Customer view not ready yet"}
          </small>
        </div>
      </div>

      {contract.publicSafeMedia.length ? (
        <div className="studio-pending-media-strip" aria-label={`${title} customer-ready views`}>
          {contract.publicSafeMedia.map((media) => {
            const label = pendingWardrobeMediaLabel(media.view);
            return (
              <figure key={media.view}>
                <img
                  alt={`${title}: ${label.toLowerCase()}`}
                  height={media.height}
                  loading="lazy"
                  src={media.src}
                  width={media.width}
                />
                <figcaption>{label}</figcaption>
              </figure>
            );
          })}
        </div>
      ) : null}

      <div className="studio-capture-next">
        <small>Capture next</small>
        <div>
          {contract.missingViews.map((view) => (
            <span key={view}>{pendingWardrobeMediaLabel(view)}</span>
          ))}
        </div>
      </div>
    </section>
  );
}

function GarmentCard({ garment, onOpenListing, onOpenWear }: { garment: Garment; onOpenListing(listing: StudioListing, origin: HTMLElement): void; onOpenWear(garment: Garment, origin: HTMLElement): void }) {
  const { listings, moveGarmentToWardrobe, prepareListing } = useStudio();
  const listing = listings.find((candidate) => candidate.garmentId === garment.id);
  const pendingContract = getPendingWardrobeProductContract(garment.sku);
  const approvedContract = listing
    ? getApprovedPublicListingContract(garment.sku, listing.slug)
    : undefined;
  const cover = studioGarmentCover(garment, listing);
  const gates = garmentReadiness(garment);
  const ready = everyGateReady(gates);
  const nextAction = pendingContract?.missingViews.length
    ? `Add ${pendingContract.missingViews.map(pendingWardrobeMediaLabel).join(" · ")}`
    : garment.privateWardrobeItemId
      ? "Add back · fabric detail"
      : ready ? "Ready for wardrobe" : gates.find((gate) => !gate.ready)?.label ?? "Review garment";
  return (
    <article className="studio-garment-card" id={`studio-garment-${garment.id}`} tabIndex={-1}>
      <div className={`studio-garment-visual${cover ? " is-photo" : ""}`} data-variant={garment.visual}>
        {cover ? <img alt={cover.alt} height={cover.height} loading="lazy" src={cover.src} width={cover.width} /> : null}
        <span>{garment.category}</span>
        {cover ? null : <Shirt aria-hidden="true" size={54} strokeWidth={1.1} />}
        <small>{garment.sku}</small>
      </div>
      <div className="studio-garment-body">
        <div className="studio-card-heading"><div><small>{garment.sku} · {garment.sizeLabel}</small><h3>{garment.title}</h3></div><LifecycleBadge state={listing?.state ?? garment.state} /></div>
        <p>{garment.color} · {garment.condition}</p>
        <div className="studio-garment-facts">
          <span>{garment.price > 0 ? formatNaira(garment.price) : "Price pending"}</span>
          <span>{garment.quantity} unit{garment.quantity === 1 ? "" : "s"}</span>
          <span>{garment.measurements.length > 0 ? `${garment.measurements.length} measurements` : "Measurements pending"}</span>
        </div>
        {pendingContract ? <PendingProductMedia contract={pendingContract} title={garment.title} /> : null}
        <ReadinessList gates={gates} compact />
        {pendingContract || approvedContract ? null : <MissingMedia garment={garment} />}
        {(garment.privateWardrobeItemId || pendingContract) ? (
          <div className="studio-card-next">
            <span><small>Next</small><strong>{nextAction}</strong></span>
            {garment.privateWardrobeItemId ? <button aria-label={`Open media for ${garment.title}`} onClick={(event) => onOpenWear(garment, event.currentTarget)} type="button"><ImagePlus aria-hidden="true" size={17} /></button> : null}
          </div>
        ) : null}
        <div className="studio-card-actions">
          {garment.state === "DRAFT" ? <button aria-label={`Move ${garment.title} to wardrobe`} className="button button-primary" disabled={!ready} onClick={() => moveGarmentToWardrobe(garment.id)} type="button"><span>Move to wardrobe</span><ArrowRight aria-hidden="true" size={14} /></button> : null}
          {["READY", "RETURNED"].includes(garment.state) && !listing ? <button aria-label={`Prepare listing for ${garment.title}`} className="button button-primary" onClick={() => prepareListing(garment.id)} type="button"><span>Prepare listing</span><ArrowRight aria-hidden="true" size={14} /></button> : null}
          {listing ? <button aria-label={`Open listing for ${garment.title}`} className="button button-secondary" onClick={(event) => onOpenListing(listing, event.currentTarget)} type="button"><span>Open listing</span><ArrowRight aria-hidden="true" size={14} /></button> : null}
        </div>
      </div>
    </article>
  );
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

  return (
    <div className="studio-public-contract">
      <div className="studio-public-anchor">
        {contract.modelAnchor.src
          ? <img alt="" height={42} src={contract.modelAnchor.src} width={42} />
          : <ShieldCheck aria-hidden="true" size={22} strokeWidth={1.7} />}
        <span><small>Approved model anchor</small><strong>{contract.modelAnchor.id}</strong></span>
        <ShieldCheck aria-hidden="true" size={17} strokeWidth={1.8} />
      </div>
      <div className="studio-public-media-grid" aria-label={`${title} approved public frames`}>
        {contract.media.map((frame) => {
          const label = publicMediaLabel(frame.slot);
          return (
            <figure key={frame.slot}>
              <img alt={`${title}: ${label.toLowerCase()}`} loading="lazy" src={frame.src} />
              <figcaption>{label}</figcaption>
            </figure>
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
  const gates = listingReadiness(studio, listing);
  const allReady = everyGateReady(gates);
  if (!garment) return null;

  function save(event: FormEvent) {
    event.preventDefault();
    studio.updateListing(listing.id, { title, description, price: Number(price), modelId });
  }

  return (
    <article className="studio-listing-card" id={listing.id}>
      <div className="studio-listing-preview">
        <span className="studio-public-label"><Send aria-hidden="true" size={13} />Public projection</span>
        <ApprovedPublicMedia sku={garment.sku} slug={listing.slug} title={title} />
        <small>{listing.slug}</small>
        <h3>{title}</h3>
        <p>{description || "Description required"}</p>
        <strong>{formatNaira(Number(price) || 0)}</strong>
        <span>{garment.sizeLabel} · {garment.color} · {garment.condition}</span>
      </div>
      <form className="studio-listing-editor" onSubmit={save}>
        <div className="studio-card-heading"><div><small>{garment.sku}</small><h3>Listing readiness</h3></div><LifecycleBadge state={listing.state} /></div>
        <div className="studio-form-grid studio-listing-fields">
          <label className="studio-field"><span>Public title</span><input value={title} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setTitle(event.target.value)} /></label>
          <label className="studio-field"><span>Price (₦)</span><input type="number" min="1" value={price} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setPrice(event.target.value)} /></label>
          <label className="studio-field"><span>Model</span><select value={modelId} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setModelId(event.target.value)}>{studio.models.map((model) => <option value={model.id} key={model.id}>{model.name} · {model.state.toLowerCase()}</option>)}</select></label>
          <label className="studio-field studio-field-wide"><span>Public description</span><textarea rows={3} value={description} disabled={!['DRAFT', 'READY'].includes(listing.state)} onChange={(event) => setDescription(event.target.value)} /></label>
        </div>
        <ReadinessList gates={gates} />
        <div className="studio-card-actions">
          {listing.state === "DRAFT" ? <><button className="button button-secondary" type="submit">Save listing</button><button className="button button-primary" disabled={!allReady} onClick={() => studio.confirmListingReady(listing.id)} type="button">Clear gates</button></> : null}
          {listing.state === "READY" ? <button className="button button-primary" onClick={() => studio.publishListing(listing.id)} type="button">Put up for sale</button> : null}
          {listing.state === "PUBLISHED" ? <span className="studio-inline-state"><Check aria-hidden="true" size={16} />Available in catalogue state</span> : null}
          {listing.state === "RESERVED" ? <span className="studio-inline-state">Reserved by an open order</span> : null}
          {listing.state === "SOLD" ? <span className="studio-inline-state">Sold · return actions live in Operations</span> : null}
        </div>
      </form>
    </article>
  );
}

export function WardrobeWorkbench() {
  const studio = useStudio();
  const searchParams = useSearchParams();
  const intakeOriginRef = useRef<"query" | "trigger" | null>(null);
  const garmentQueryHandledRef = useRef<string | null>(null);
  const [intakeReturnFocus, setIntakeReturnFocus] = useState<HTMLElement | null>(null);
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const [openListingId, setOpenListingId] = useState<string | null>(null);
  const [listingReturnFocus, setListingReturnFocus] = useState<HTMLElement | null>(null);
  const [garmentPage, setGarmentPage] = useState(0);
  const [publishingPage, setPublishingPage] = useState(0);
  const [wearWardrobeItemId, setWearWardrobeItemId] = useState<string | null>(null);
  const [wearReturnFocus, setWearReturnFocus] = useState<HTMLElement | null>(null);
  const [guideOpen, setGuideOpen] = useState(false);
  const [guideReturnFocus, setGuideReturnFocus] = useState<HTMLElement | null>(null);
  const segments = useMemo(() => [
    { key: "garments", label: "Garments", count: studio.garments.length },
    { key: "publishing", label: "Publishing", count: studio.listings.length },
  ], [studio.garments.length, studio.listings.length]);
  const { active: activeView, isPending: viewPending, select: selectView } = useStudioSegment(segments, "garments");

  useEffect(() => {
    if (searchParams.get("guide") !== "1" || guideOpen) return;
    window.setTimeout(() => setGuideOpen(true), 0);
  }, [guideOpen, searchParams]);

  useEffect(() => {
    const garmentId = searchParams.get("garment");
    if (!garmentId) {
      garmentQueryHandledRef.current = null;
      return;
    }
    if (garmentQueryHandledRef.current === garmentId || studio.hydration === "idle" || studio.hydration === "restoring") return;
    const garmentIndex = studio.garments.findIndex((garment) => garment.id === garmentId);
    if (garmentIndex < 0) return;
    garmentQueryHandledRef.current = garmentId;
    const listing = studio.listings.find((candidate) => candidate.garmentId === garmentId);
    window.requestAnimationFrame(() => {
      setFilter("ALL");
      setGarmentPage(Math.floor(garmentIndex / garmentPageSize));
      if (listing) setOpenListingId(listing.id);
      else window.requestAnimationFrame(() => document.getElementById(`studio-garment-${garmentId}`)?.focus({ preventScroll: false }));
    });
  }, [searchParams, studio.garments, studio.hydration, studio.listings]);

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

  const visibleGarments = useMemo(() => studio.garments.filter((garment) => {
    if (filter === "ALL") return true;
    const listing = studio.listings.find((candidate) => candidate.garmentId === garment.id);
    return (listing?.state ?? garment.state) === filter;
  }), [filter, studio.garments, studio.listings]);
  const safeGarmentPage = Math.min(garmentPage, Math.max(0, Math.ceil(visibleGarments.length / garmentPageSize) - 1));
  const pagedGarments = visibleGarments.slice(safeGarmentPage * garmentPageSize, (safeGarmentPage + 1) * garmentPageSize);
  const safePublishingPage = Math.min(publishingPage, Math.max(0, Math.ceil(studio.listings.length / publishingPageSize) - 1));
  const pagedListings = studio.listings.slice(safePublishingPage * publishingPageSize, (safePublishingPage + 1) * publishingPageSize);
  const openListing = studio.listings.find((listing) => listing.id === openListingId);

  if (studio.hydration === "idle" || studio.hydration === "restoring") {
    return <div className="studio-loading" role="status">Opening wardrobe…</div>;
  }

  return (
    <div className="studio-ops-page">
      <header className="studio-ops-heading" id="garments">
        <div><p className="eyebrow">Wardrobe</p><h1>Every piece, ready when it is true.</h1><p>Add the piece, review each view, and publish only what Lulu approves.</p></div>
        <div className="studio-ops-heading-actions">
          <button className="button button-secondary" onClick={(event) => { setGuideReturnFocus(event.currentTarget); setGuideOpen(true); }} type="button"><BookOpen aria-hidden="true" size={17} />Guide</button>
          <button className="button button-primary" onClick={(event) => openIntake(event.currentTarget)} type="button"><Plus aria-hidden="true" size={17} />Intake garment</button>
        </div>
      </header>

      <StudioSegmentedView active={activeView} label="Wardrobe workspace" onSelect={selectView} pending={viewPending} segments={segments} />

      {activeView === "garments" ? (
        <section aria-labelledby="studio-tab-garments" id="studio-view-garments" role="tabpanel">
          <div className="studio-filter-bar" role="group" aria-label="Filter wardrobe">
            {filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "is-active" : undefined} onClick={() => { setFilter(item); setGarmentPage(0); }} key={item} type="button">{item.toLowerCase()}</button>)}
            <span>{visibleGarments.length} shown</span>
          </div>
          <h2 className="sr-only" id="garments-view-title">Garments</h2>
          {visibleGarments.length ? <><div className="studio-garment-grid">{pagedGarments.map((garment) => <GarmentCard garment={garment} key={garment.id} onOpenListing={(listing, origin) => { setListingReturnFocus(origin); setOpenListingId(listing.id); }} onOpenWear={(next, origin) => { setWearReturnFocus(origin); setWearWardrobeItemId(next.privateWardrobeItemId ?? null); }} />)}</div><StudioPager label="Garment pages" onPageChange={setGarmentPage} page={safeGarmentPage} pageSize={garmentPageSize} total={visibleGarments.length} /></> : (
            <div className="studio-quiet-empty studio-wardrobe-empty"><PackageOpen aria-hidden="true" size={26} strokeWidth={1.5} /><div><strong>{studio.garments.length ? "No garments in this state" : "Your wardrobe is empty"}</strong><p>{studio.garments.length ? "Choose another lifecycle filter." : "Start with one photographed and classified piece."}</p></div>{studio.garments.length ? null : <button className="button button-primary" onClick={(event) => openIntake(event.currentTarget)} type="button">Intake garment</button>}</div>
          )}
        </section>
      ) : (
        <section className="studio-publishing-section studio-stack-panel" id="studio-view-publishing" aria-labelledby="studio-tab-publishing" role="tabpanel">
          <div className="studio-section-title"><div><p className="eyebrow">Publishing</p><h2 id="publishing-title">Listing review</h2></div><span>{studio.listings.length} listing{studio.listings.length === 1 ? "" : "s"}</span></div>
          {studio.listings.length ? <><div className="studio-publishing-queue">{pagedListings.map((listing) => {
            const garment = studio.garments.find((candidate) => candidate.id === listing.garmentId);
            return <button className="studio-publishing-row" key={listing.id} onClick={(event) => { setListingReturnFocus(event.currentTarget); setOpenListingId(listing.id); }} type="button"><span><small>{garment?.sku}</small><strong>{listing.title}</strong></span><LifecycleBadge state={listing.state} /><ArrowRight aria-hidden="true" size={17} /></button>;
          })}</div><StudioPager label="Publishing pages" onPageChange={setPublishingPage} page={safePublishingPage} pageSize={publishingPageSize} total={studio.listings.length} /></> : <div className="studio-quiet-empty"><Send aria-hidden="true" size={24} strokeWidth={1.5} /><div><strong>No listing drafts</strong><p>Move a garment to wardrobe, then prepare its listing.</p></div></div>}
        </section>
      )}

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
        title="One piece. One action."
      >
        <section className="studio-guide-flow">
          {[
            ["01", "Show", "Camera · Photos · Describe", "01-start.png"],
            ["02", "Build", "Confirm the source", "02-source.png"],
            ["03", "Review", "Keep · Edit · Try once", "03-confirm.png"],
            ["04", "Wear", "Mannequin · Lulu · Model", "04-wear.png"],
            ["05", "Finish", "Draft · Private", "05-saved.png"],
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
        onDismiss={finishIntake}
        onOpenWear={(id) => {
          finishIntake();
          window.setTimeout(() => setWearWardrobeItemId(id), 180);
        }}
        open={intakeOpen}
        returnFocus={intakeReturnFocus}
      />

      <StudioTaskSheet
        eyebrow="Publishing"
        onDismiss={() => setOpenListingId(null)}
        open={Boolean(openListing)}
        returnFocus={listingReturnFocus}
        title={openListing?.title ?? "Listing"}
      >
        {openListing ? <ListingEditor listing={openListing} /> : null}
      </StudioTaskSheet>
    </div>
  );
}
