"use client";

/* Fixed public catalogue paths and protected Studio previews do not use the Next image optimizer. */
/* eslint-disable @next/next/no-img-element */

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
import { studioGarmentCover } from "./garment-cover";
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
    scenario,
  } = useStudio();

  const modelDrafts = models.filter((model) => model.state === "DRAFT").length;
  const garmentDrafts = garments.filter((garment) => garment.state === "DRAFT").length;
  const listingWork = listings.filter((listing) => ["DRAFT", "READY"].includes(listing.state)).length;
  const orderWork = orders.filter((order) => order.state === "RESERVED").length;
  const returnWork = returns.filter((returnCase) => returnCase.state === "DRAFT").length;
  const workCount = modelDrafts + garmentDrafts + listingWork + orderWork + returnWork;
  const liveListings = listings.filter((listing) => ["PUBLISHED", "RESERVED"].includes(listing.state)).length;
  const availableUnits = inventory.reduce((total, record) => total + Math.max(0, record.onHand - record.reserved), 0);
  const readyModels = models.filter((model) => model.state !== "DRAFT").length;

  if (hydration === "idle" || hydration === "restoring") {
    return <div className="studio-loading" role="status">Opening Lulu Studio…</div>;
  }

  const tasks = [
    {
      action: "Review returns",
      count: returnWork,
      detail: "Inspect each return, then restock it or remove it from sale.",
      eyebrow: "Return waiting",
      hero: "Start with the return.",
      href: "/studio/operations?view=returns",
      icon: RotateCcw,
      key: "returns",
      title: `Decide what happens to ${returnWork} returned piece${returnWork === 1 ? "" : "s"}.`,
      tone: "urgent",
    },
    {
      action: "Prepare orders",
      count: orderWork,
      detail: "Confirm each piece and move the reservation toward fulfilment.",
      eyebrow: "Order waiting",
      hero: "Start with the order.",
      href: "/studio/orders",
      icon: PackageCheck,
      key: "orders",
      title: `Prepare ${orderWork} reserved order${orderWork === 1 ? "" : "s"}.`,
      tone: "active",
    },
    {
      action: "Finish listings",
      count: listingWork,
      detail: "Clear the remaining gate and make each piece ready for the Shop.",
      eyebrow: "Publishing",
      hero: "Start with the Shop preview.",
      href: "/studio/wardrobe?view=publishing",
      icon: Sparkles,
      key: "publishing",
      title: `Finish ${listingWork} listing${listingWork === 1 ? "" : "s"}.`,
      tone: "active",
    },
    {
      action: "Complete intake",
      count: garmentDrafts,
      detail: "Add the missing photos or details before the piece enters the wardrobe.",
      eyebrow: "Garment draft",
      hero: "Start with the garment.",
      href: "/studio/wardrobe",
      icon: Shirt,
      key: "garments",
      title: `Complete ${garmentDrafts} garment draft${garmentDrafts === 1 ? "" : "s"}.`,
      tone: "active",
    },
    {
      action: "Finish profiles",
      count: modelDrafts,
      detail: "Complete identity and styling readiness before the next try-on.",
      eyebrow: "Model readiness",
      hero: "Start with the model.",
      href: "/studio/models",
      icon: Users,
      key: "models",
      title: `Finish ${modelDrafts} model profile${modelDrafts === 1 ? "" : "s"}.`,
      tone: "active",
    },
  ].filter((task) => task.count > 0);

  const primaryTask = tasks[0] ?? {
    action: "Intake garment",
    count: 0,
    detail: "The lifecycle is clear. Start with one piece and let the Studio carry it forward.",
    eyebrow: "Studio clear",
    hero: "The Studio is clear.",
    href: "/studio/wardrobe?intake=1",
    icon: CheckCircle2,
    key: "clear",
    title: "Bring in the next piece.",
    tone: "clear",
  };
  const PrimaryTaskIcon = primaryTask.icon;
  const supportingTasks = tasks.slice(1);
  const recentGarments = garments.slice(0, 6);

  return (
    <div className="studio-ops-page studio-business-home studio-atelier-home studio-premium-surface">
      <header className="studio-atelier-hero">
        <div className="studio-atelier-hero-copy">
          <p className="eyebrow">Business home</p>
          <h1>{primaryTask.hero}</h1>
          {!workCount ? <p>No work is waiting.</p> : null}
        </div>
        <div className="studio-atelier-hero-actions">
          <div className={`studio-atelier-save-state ${!scenario && persistence === "available" ? "is-saved" : "is-memory"}`} role="status">
            {scenario
              ? <><RotateCcw aria-hidden="true" size={15} />Simulator · not saved</>
              : persistence === "available"
              ? <><CheckCircle2 aria-hidden="true" size={15} />Workspace saved</>
              : <><RotateCcw aria-hidden="true" size={15} />Temporary session</>}
          </div>
          <Link className="button button-primary" href="/studio/wardrobe?intake=1">Intake garment</Link>
        </div>
      </header>

      <section className="studio-atelier-attention" aria-labelledby="studio-attention-title">
        <div className="studio-atelier-section-heading">
          <div>
            <p className="eyebrow">Now</p>
            <h2 id="studio-attention-title">Next</h2>
          </div>
          <span>{workCount ? `${workCount} open decision${workCount === 1 ? "" : "s"}` : "Nothing waiting"}</span>
        </div>

        <div className="studio-attention-layout">
          <Link className={`studio-attention-primary is-${primaryTask.tone}`} href={primaryTask.href}>
            <span className="studio-attention-primary-icon" aria-hidden="true">
              <PrimaryTaskIcon size={28} strokeWidth={1.8} />
            </span>
            <div className="studio-attention-primary-copy">
              <small>{primaryTask.eyebrow}</small>
              <h3>{primaryTask.title}</h3>
              <p>{primaryTask.detail}</p>
            </div>
            <span className="studio-attention-primary-action">
              <strong>{primaryTask.count || "Next"}</strong>
              <span>{primaryTask.action}<ArrowRight aria-hidden="true" size={17} /></span>
            </span>
          </Link>

          <div className="studio-attention-queue" aria-label="Supporting work">
            {supportingTasks.length ? supportingTasks.map((task) => {
              const Icon = task.icon;
              return (
                <Link className="studio-attention-row" href={task.href} key={task.key}>
                  <span aria-hidden="true"><Icon size={18} strokeWidth={1.8} /></span>
                  <span><strong>{task.title}</strong><small>{task.action}</small></span>
                  <em>{task.count}</em>
                </Link>
              );
            }) : (
              <div className="studio-attention-clear" role="status">
                <CheckCircle2 aria-hidden="true" size={20} />
                <div><strong>No loose ends.</strong><p>Bring in the next piece when you are ready.</p></div>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="studio-atelier-pulse" aria-labelledby="studio-pulse-title">
        <div className="studio-atelier-section-heading">
          <div>
            <p className="eyebrow">Ready</p>
            <h2 id="studio-pulse-title">The business pulse</h2>
          </div>
        </div>
        <div className="studio-pulse-grid" role="list">
          <Link className="studio-pulse-item" href="/studio/operations" role="listitem">
            <small>Available now</small>
            <strong>{availableUnits}</strong>
            <span>unit{availableUnits === 1 ? "" : "s"} ready to move</span>
          </Link>
          <Link className="studio-pulse-item" href="/studio/wardrobe?view=publishing" role="listitem">
            <small>Live in Shop</small>
            <strong>{liveListings}</strong>
            <span>piece{liveListings === 1 ? "" : "s"} visible to customers</span>
          </Link>
          <Link className="studio-pulse-item" href="/studio/models" role="listitem">
            <small>Models ready</small>
            <strong>{readyModels}</strong>
            <span>model{readyModels === 1 ? "" : "s"} ready for try-ons</span>
          </Link>
        </div>
      </section>

      <section className="studio-atelier-recent" aria-labelledby="studio-recent-title">
        <div className="studio-atelier-section-heading">
          <div>
            <p className="eyebrow">Changed</p>
            <h2 id="studio-recent-title">Recent pieces</h2>
          </div>
          <Link href="/studio/wardrobe">Open wardrobe <ArrowRight aria-hidden="true" size={14} /></Link>
        </div>

        {recentGarments.length ? (
          <div className="studio-recent-list">
            {recentGarments.map((garment) => {
              const listing = listings.find((candidate) => candidate.garmentId === garment.id);
              const stock = inventory.find((candidate) => candidate.garmentId === garment.id);
              const cover = studioGarmentCover(garment, listing);
              return (
                <Link className="studio-recent-row" href={`/studio/wardrobe/${encodeURIComponent(garment.privateWardrobeItemId ?? garment.id)}`} key={garment.id}>
                  <span className={`studio-recent-media${cover ? " is-photo" : ""}`} data-variant={garment.visual} aria-hidden="true">
                    {cover ? <img alt="" height={cover.height} loading="lazy" src={cover.src} width={cover.width} /> : <Shirt size={22} strokeWidth={1.4} />}
                  </span>
                  <span className="studio-recent-copy">
                    <small>{garment.sku} · {garment.category}</small>
                    <strong>{garment.title}</strong>
                    <em>{stock ? `${Math.max(0, stock.onHand - stock.reserved)} available` : "No stock record"} · {garment.sizeLabel}</em>
                  </span>
                  <span className="studio-recent-state">
                    <LifecycleBadge state={listing?.state ?? garment.state} />
                    <ArrowRight aria-hidden="true" size={17} />
                  </span>
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
