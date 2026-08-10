"use client";

/* Approved catalogue media uses fixed local public paths across supported runtimes. */
/* eslint-disable @next/next/no-img-element */

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Camera,
  Check,
  ImagePlus,
  PackageOpen,
  Plus,
  Send,
  ShieldCheck,
  Shirt,
  X,
} from "lucide-react";
import type {
  Garment,
  GarmentCategory,
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
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { ReadinessList } from "./atoms/readiness-list";
import { useStudio } from "./studio-provider";

type CaptureKey = "front" | "back" | "detail";

const filters: Array<"ALL" | StudioLifecycleState> = [
  "ALL",
  "DRAFT",
  "READY",
  "PUBLISHED",
  "RESERVED",
  "SOLD",
  "RETURNED",
];

function formatNaira(value: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", maximumFractionDigits: 0 }).format(value);
}

function GarmentIntakeDialog({
  dialogRef,
  onClosed,
}: {
  dialogRef: React.RefObject<HTMLDialogElement | null>;
  onClosed(): void;
}) {
  const { createGarment } = useStudio();
  const [files, setFiles] = useState<Record<CaptureKey, File | null>>({ front: null, back: null, detail: null });

  function close() {
    dialogRef.current?.close();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    createGarment({
      sku: String(form.get("sku")),
      title: String(form.get("title")),
      category: String(form.get("category")) as GarmentCategory,
      sizeLabel: String(form.get("size")),
      estimatedFit: String(form.get("fit")),
      color: String(form.get("colour")),
      price: Number(form.get("price")),
      condition: String(form.get("condition")),
      brand: String(form.get("brand") || ""),
      source: String(form.get("source") || "Studio intake"),
      notes: String(form.get("description")),
      privateNote: String(form.get("privateNote") || ""),
      publicDescription: String(form.get("description")),
      quantity: Number(form.get("quantity")),
      saleEligible: form.get("saleEligible") === "on",
      measurements: [
        { label: "Bust", value: String(form.get("bust") || "") },
        { label: "Waist", value: String(form.get("waist") || "") },
        { label: "Length", value: String(form.get("length") || "") },
      ],
      hasFront: Boolean(files.front),
      hasBack: Boolean(files.back),
      hasDetail: Boolean(files.detail),
    });
    event.currentTarget.reset();
    setFiles({ front: null, back: null, detail: null });
    close();
  }

  return (
    <dialog className="studio-intake-sheet" ref={dialogRef} aria-labelledby="studio-intake-title" onClose={onClosed}>
      <form onSubmit={submit}>
        <header>
          <div><p className="eyebrow">Garment pipeline</p><h2 id="studio-intake-title">Snap. Classify. Wardrobe.</h2></div>
          <button aria-label="Close garment intake" className="studio-icon-action" onClick={close} type="button"><X aria-hidden="true" size={20} /></button>
        </header>

        <section className="studio-intake-step">
          <div className="studio-step-label"><span>01</span><div><strong>Snap or upload</strong><small>Only readiness metadata is saved.</small></div></div>
          <div className="studio-capture-grid">
            {(["front", "back", "detail"] as CaptureKey[]).map((key) => (
              <label className={files[key] ? "studio-capture-tile has-file" : "studio-capture-tile"} key={key}>
                <input type="file" accept="image/*" capture="environment" onChange={(event) => setFiles((current) => ({ ...current, [key]: event.target.files?.[0] ?? null }))} />
                {files[key] ? <Check aria-hidden="true" size={22} /> : <Camera aria-hidden="true" size={22} />}
                <strong>{key}</strong>
                <small>{files[key]?.name ?? "Choose image"}</small>
              </label>
            ))}
          </div>
        </section>

        <section className="studio-intake-step">
          <div className="studio-step-label"><span>02</span><div><strong>Create & classify</strong><small>Facts drive the readiness gates.</small></div></div>
          <div className="studio-form-grid">
            <label className="studio-field"><span>SKU</span><input name="sku" placeholder="JUW-101" required /></label>
            <label className="studio-field"><span>Garment name</span><input name="title" placeholder="Cocoa bias dress" required /></label>
            <label className="studio-field"><span>Category</span><select name="category" defaultValue="Dress"><option>Dress</option><option>Shirt</option><option>Knitwear</option><option>Skirt</option><option>Trousers</option></select></label>
            <label className="studio-field"><span>Colour</span><input name="colour" placeholder="Cocoa" required /></label>
            <label className="studio-field"><span>Tagged size</span><input name="size" placeholder="UK 12" required /></label>
            <label className="studio-field"><span>Fit</span><input name="fit" placeholder="Relaxed 10–12" required /></label>
            <label className="studio-field"><span>Condition</span><select name="condition" defaultValue="Excellent pre-loved"><option>New with tags</option><option>Excellent pre-loved</option><option>Very good</option><option>Good — disclosed wear</option></select></label>
            <label className="studio-field"><span>Quantity</span><input name="quantity" type="number" min="1" defaultValue="1" required /></label>
            <label className="studio-field"><span>Price (₦)</span><input name="price" type="number" min="1" placeholder="18500" required /></label>
            <label className="studio-field"><span>Brand</span><input name="brand" placeholder="Unlabelled" /></label>
            <label className="studio-field"><span>Bust</span><input name="bust" placeholder="96 cm" /></label>
            <label className="studio-field"><span>Waist</span><input name="waist" placeholder="78 cm" /></label>
            <label className="studio-field"><span>Length</span><input name="length" placeholder="124 cm" required /></label>
            <label className="studio-field"><span>Acquisition source</span><input name="source" placeholder="Private Studio note" /></label>
            <label className="studio-field studio-field-wide"><span>Public description</span><textarea name="description" rows={3} placeholder="Bias-cut midi with a softly flared hem." required /></label>
            <label className="studio-field studio-field-wide"><span>Private condition note</span><textarea name="privateNote" rows={2} placeholder="Operator-only detail" /></label>
          </div>
          <label className="studio-check-row"><input aria-label="Eligible for sale" type="checkbox" name="saleEligible" defaultChecked /><span><strong>Eligible for sale</strong><small>No unresolved condition hold</small></span></label>
        </section>

        <footer><button className="button button-secondary" onClick={close} type="button">Cancel</button><button className="button button-primary" type="submit">Create garment</button></footer>
      </form>
    </dialog>
  );
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

function GarmentCard({ garment }: { garment: Garment }) {
  const { listings, moveGarmentToWardrobe, prepareListing } = useStudio();
  const listing = listings.find((candidate) => candidate.garmentId === garment.id);
  const approvedContract = listing
    ? getApprovedPublicListingContract(garment.sku, listing.slug)
    : undefined;
  const approvedCover = approvedContract?.media.find((frame) => frame.slot === "GARMENT_FRONT");
  const gates = garmentReadiness(garment);
  const ready = everyGateReady(gates);
  return (
    <article className="studio-garment-card">
      <div className={`studio-garment-visual${approvedCover ? " is-photo" : ""}`} data-variant={garment.visual}>
        {approvedCover ? <img alt={`${garment.title}, approved garment front`} loading="lazy" src={approvedCover.src} /> : null}
        <span>{garment.category}</span>
        {approvedCover ? null : <Shirt aria-hidden="true" size={54} strokeWidth={1.1} />}
        <small>{garment.sku}</small>
      </div>
      <div className="studio-garment-body">
        <div className="studio-card-heading"><div><small>{garment.sku} · {garment.sizeLabel}</small><h3>{garment.title}</h3></div><LifecycleBadge state={listing?.state ?? garment.state} /></div>
        <p>{garment.color} · {garment.condition}</p>
        <div className="studio-garment-facts"><span>{formatNaira(garment.price)}</span><span>{garment.quantity} unit{garment.quantity === 1 ? "" : "s"}</span><span>{garment.measurements.length} measurements</span></div>
        <ReadinessList gates={gates} compact />
        <MissingMedia garment={garment} />
        <div className="studio-card-actions">
          {garment.state === "DRAFT" ? <button className="button button-primary" disabled={!ready} onClick={() => moveGarmentToWardrobe(garment.id)} type="button">Move to wardrobe</button> : null}
          {["READY", "RETURNED"].includes(garment.state) && !listing ? <button className="button button-primary" onClick={() => prepareListing(garment.id)} type="button">Prepare listing</button> : null}
          {listing ? <a className="button button-secondary" href={`#${listing.id}`}>Open listing <ArrowRight aria-hidden="true" size={14} /></a> : null}
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
        <img alt="" height={42} src={contract.modelAnchor.src} width={42} />
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const intakeOriginRef = useRef<"query" | "trigger" | null>(null);
  const intakeReturnFocusRef = useRef<HTMLElement | null>(null);
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");

  useEffect(() => {
    const queryWantsIntake = searchParams.get("intake") === "1";
    if (queryWantsIntake && !dialogRef.current?.open) {
      intakeOriginRef.current = "query";
      intakeReturnFocusRef.current = null;
      dialogRef.current?.showModal();
    } else if (!queryWantsIntake && intakeOriginRef.current === "query" && dialogRef.current?.open) {
      dialogRef.current.close();
    }
  }, [searchParams, studio.hydration]);

  useEffect(() => {
    function syncQueryIntake() {
      const queryWantsIntake = new URLSearchParams(window.location.search).get("intake") === "1";
      if (!queryWantsIntake && intakeOriginRef.current === "query" && dialogRef.current?.open) {
        dialogRef.current.close();
      }
    }

    window.addEventListener("popstate", syncQueryIntake);
    return () => window.removeEventListener("popstate", syncQueryIntake);
  }, []);

  function openIntake(returnFocus: HTMLElement | null) {
    intakeOriginRef.current = "trigger";
    intakeReturnFocusRef.current = returnFocus;
    dialogRef.current?.showModal();
  }

  function finishIntake() {
    const origin = intakeOriginRef.current;
    const returnFocus = intakeReturnFocusRef.current;
    intakeOriginRef.current = null;
    intakeReturnFocusRef.current = null;

    if (origin === "query") {
      const url = new URL(window.location.href);
      url.searchParams.delete("intake");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    } else {
      returnFocus?.focus({ preventScroll: true });
    }
  }

  const visibleGarments = useMemo(() => studio.garments.filter((garment) => {
    if (filter === "ALL") return true;
    const listing = studio.listings.find((candidate) => candidate.garmentId === garment.id);
    return (listing?.state ?? garment.state) === filter;
  }), [filter, studio.garments, studio.listings]);

  if (studio.hydration === "idle" || studio.hydration === "restoring") {
    return <div className="studio-loading" role="status">Opening wardrobe…</div>;
  }

  return (
    <div className="studio-ops-page">
      <header className="studio-ops-heading" id="garments">
        <div><p className="eyebrow">Garment pipeline</p><h1>The wardrobe, ready to sell.</h1><p>Capture the piece once, clear its truth gates, then publish only the approved catalogue projection.</p></div>
        <button className="button button-primary" onClick={(event) => openIntake(event.currentTarget)} type="button"><Plus aria-hidden="true" size={17} />Intake garment</button>
      </header>

      <div className="studio-filter-bar" role="group" aria-label="Filter wardrobe">
        {filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "is-active" : undefined} onClick={() => setFilter(item)} key={item} type="button">{item.toLowerCase()}</button>)}
        <span>{visibleGarments.length} shown</span>
      </div>

      {visibleGarments.length ? <div className="studio-garment-grid">{visibleGarments.map((garment) => <GarmentCard garment={garment} key={garment.id} />)}</div> : (
        <div className="studio-quiet-empty studio-wardrobe-empty"><PackageOpen aria-hidden="true" size={26} strokeWidth={1.5} /><div><strong>{studio.garments.length ? "No garments in this state" : "Your wardrobe is empty"}</strong><p>{studio.garments.length ? "Choose another lifecycle filter." : "Start with one photographed and classified piece."}</p></div>{studio.garments.length ? null : <button className="button button-primary" onClick={(event) => openIntake(event.currentTarget)} type="button">Intake garment</button>}</div>
      )}

      <section className="studio-publishing-section" id="publishing" aria-labelledby="publishing-title">
        <div className="studio-section-title"><div><p className="eyebrow">Publishing</p><h2 id="publishing-title">Catalogue gates</h2></div><span>{studio.listings.length} listing{studio.listings.length === 1 ? "" : "s"}</span></div>
        {studio.listings.length ? <div className="studio-listing-stack">{studio.listings.map((listing) => <ListingEditor listing={listing} key={listing.id} />)}</div> : <div className="studio-quiet-empty"><Send aria-hidden="true" size={24} strokeWidth={1.5} /><div><strong>No listing drafts</strong><p>Move a garment to wardrobe, then prepare its listing.</p></div></div>}
      </section>

      <GarmentIntakeDialog dialogRef={dialogRef} onClosed={finishIntake} />
    </div>
  );
}
