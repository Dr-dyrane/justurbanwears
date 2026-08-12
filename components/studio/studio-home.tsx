"use client";

import {
  ArrowRight,
  CheckCircle2,
  PackageCheck,
  RotateCcw,
  Shirt,
  Sparkles,
  Users,
} from "lucide-react";
import { LifecycleBadge } from "./atoms/lifecycle-badge";
import { StudioLink as Link } from "./atoms/studio-link";
import { useStudio } from "./studio-provider";

export function StudioHome() {
  const {
    models,
    garments,
    listings,
    inventory,
    orders,
    returns,
    hydration,
    persistence,
  } = useStudio();

  if (hydration === "idle" || hydration === "restoring") {
    return <div className="studio-loading" role="status">Opening Lulu Studio…</div>;
  }

  const modelDrafts = models.filter((model) => model.state === "DRAFT").length;
  const garmentDrafts = garments.filter((garment) => garment.state === "DRAFT").length;
  const listingWork = listings.filter((listing) => ["DRAFT", "READY"].includes(listing.state)).length;
  const orderWork = orders.filter((order) => order.state === "RESERVED").length;
  const returnWork = returns.filter((returnCase) => returnCase.state === "DRAFT").length;
  const workCount = modelDrafts + garmentDrafts + listingWork + orderWork + returnWork;
  const liveListings = listings.filter((listing) => ["PUBLISHED", "RESERVED"].includes(listing.state)).length;
  const availableUnits = inventory.reduce((total, record) => total + Math.max(0, record.onHand - record.reserved), 0);

  const queues = [
    {
      href: "/studio/models",
      label: "Models",
      count: modelDrafts,
      detail: modelDrafts ? "Finish identity and styling readiness" : `${models.length} model${models.length === 1 ? "" : "s"} ready or tracked`,
      icon: Users,
    },
    {
      href: "/studio/wardrobe",
      label: "Wardrobe",
      count: garmentDrafts,
      detail: garmentDrafts ? "Complete intake and move to wardrobe" : `${garments.length} garment${garments.length === 1 ? "" : "s"} recorded`,
      icon: Shirt,
    },
    {
      href: "/studio/wardrobe#publishing",
      label: "Publishing",
      count: listingWork,
      detail: listingWork ? "Clear gates and put items up for sale" : `${liveListings} listing${liveListings === 1 ? "" : "s"} in catalogue state`,
      icon: Sparkles,
    },
    {
      href: "/studio/operations",
      label: "Orders & returns",
      count: orderWork + returnWork,
      detail: orderWork || returnWork ? `${orderWork} order · ${returnWork} return` : "No fulfilment decisions waiting",
      icon: PackageCheck,
    },
  ];

  return (
    <div className="studio-ops-page studio-business-home">
      <header className="studio-ops-hero">
        <div>
          <p className="eyebrow">Business home</p>
          <h1>{workCount ? `${workCount} decision${workCount === 1 ? "" : "s"} for Lulu.` : "Lulu, the studio is clear."}</h1>
          <p>Every garment, listing, order, and return follows one stock-aware lifecycle.</p>
        </div>
        <div className="studio-hero-actions">
          <Link className="button button-secondary" href="/studio/models">Model atelier</Link>
          <Link className="button button-primary" href="/studio/wardrobe?intake=1">Intake garment</Link>
        </div>
      </header>

      <div className={`studio-save-state ${persistence === "available" ? "is-saved" : "is-memory"}`} role="status">
        {persistence === "available"
          ? <><CheckCircle2 aria-hidden="true" size={16} />Saved on this device</>
          : <><RotateCcw aria-hidden="true" size={16} />Memory only for this session</>}
      </div>

      <section className="studio-queue-section" id="work" aria-labelledby="studio-next-work">
        <div className="studio-section-title">
          <div><p className="eyebrow">Now</p><h2 id="studio-next-work">Actionable work</h2></div>
          <span>{workCount ? `${workCount} open` : "Nothing blocked"}</span>
        </div>
        <div className="studio-queue-grid">
          {queues.map(({ href, label, count, detail, icon: Icon }) => (
            <Link className={count ? "studio-queue-card has-work" : "studio-queue-card"} href={href} key={label}>
              <span className="studio-queue-icon" aria-hidden="true"><Icon size={20} strokeWidth={1.7} /></span>
              <span className="studio-queue-count">{count}</span>
              <strong>{label}</strong>
              <p>{detail}</p>
              <span className="studio-card-link">Open <ArrowRight aria-hidden="true" size={15} /></span>
            </Link>
          ))}
        </div>
      </section>

      <section className="studio-lifecycle-section" id="lifecycle" aria-labelledby="studio-lifecycle-title">
        <div className="studio-section-title">
          <div><p className="eyebrow">Live state</p><h2 id="studio-lifecycle-title">Commerce lifecycle</h2></div>
          <span>{availableUnits} unit{availableUnits === 1 ? "" : "s"} available</span>
        </div>
        <div className="studio-lifecycle-track" role="list">
          {[
            ["Draft", garments.filter((item) => item.state === "DRAFT").length],
            ["Ready", garments.filter((item) => item.state === "READY").length],
            ["Published", listings.filter((item) => item.state === "PUBLISHED").length],
            ["Reserved", orders.filter((item) => item.state === "RESERVED").length],
            ["Sold", orders.filter((item) => item.state === "SOLD").length],
            ["Returned", returns.filter((item) => item.state === "RETURNED").length],
          ].map(([label, count], index) => (
            <div className="studio-lifecycle-step" role="listitem" key={String(label)}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <strong>{count}</strong>
              <small>{label}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="studio-record-section" id="records" aria-labelledby="studio-record-title">
        <div className="studio-section-title">
          <div><p className="eyebrow">Records</p><h2 id="studio-record-title">Latest garment state</h2></div>
          <Link className="text-link" href="/studio/wardrobe">Open wardrobe <ArrowRight aria-hidden="true" size={14} /></Link>
        </div>
        {garments.length ? (
          <div className="studio-record-list">
            {garments.slice(0, 5).map((garment) => {
              const listing = listings.find((candidate) => candidate.garmentId === garment.id);
              const stock = inventory.find((candidate) => candidate.garmentId === garment.id);
              return (
                <Link className="studio-record-row" href="/studio/wardrobe" key={garment.id}>
                  <span className="studio-record-swatch" data-variant={garment.visual} aria-hidden="true" />
                  <span><small>{garment.sku}</small><strong>{garment.title}</strong></span>
                  <span>{stock ? `${Math.max(0, stock.onHand - stock.reserved)} available` : "No stock record"}</span>
                  <LifecycleBadge state={listing?.state ?? garment.state} />
                  <ArrowRight aria-hidden="true" size={17} />
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="studio-quiet-empty">
            <Shirt aria-hidden="true" size={24} strokeWidth={1.6} />
            <div><strong>No garments yet</strong><p>Intake one piece to establish the full lifecycle.</p></div>
            <Link className="button button-primary" href="/studio/wardrobe?intake=1">Intake garment</Link>
          </div>
        )}
      </section>
    </div>
  );
}
