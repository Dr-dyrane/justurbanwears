"use client";

/* Fixed public catalogue paths and protected Studio previews do not use the Next image optimizer. */
/* eslint-disable @next/next/no-img-element */

import {
  ArrowRight,
  RotateCcw,
  Shirt,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { WardrobeMotion } from "../brand/wardrobe-motion";
import { LifecycleMeta, STUDIO_LIFECYCLE_PRESENTATION } from "./atoms/lifecycle-meta";
import { StudioLink as Link } from "./atoms/studio-link";
import { studioGarmentCover } from "./garment-cover";
import {
  ArrangeStudioHomeControl,
  StudioServiceList,
} from "./navigation/studio-service-list";
import { projectStudioDropScopes } from "../../lib/studio/projections/drop-context";
import { useStudio } from "./studio-provider";

export function StudioHome() {
  const {
    garments,
    listings,
    application,
    authority,
    hydration,
    scenario,
  } = useStudio();
  const [sheetRaised, setSheetRaised] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetScrollTopRef = useRef(0);
  const sheetStageRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<number | null>(null);
  const swipeHandledRef = useRef(false);

  const connected = authority.snapshot;
  const projected = scenario ? null : application.snapshot;

  useEffect(() => {
    const stage = sheetStageRef.current;
    if (!stage) return;
    stage.scrollTop = 0;
    sheetScrollTopRef.current = 0;
  }, []);

  const garmentDrafts = connected
    ? connected.pieces.filter((piece) => piece.availability === "PRIVATE").length
    : garments.filter((garment) => garment.state === "DRAFT").length;
  const activeOrders = scenario
    ? connected?.orders.filter((order) => order.lifecycleStatus === "ACTIVE").length ?? 0
    : projected?.summary.orders.value ?? null;
  const orderWork = connected
    ? connected.orders.filter((order) => order.allowedTransitions.length > 0 && !order.return).length
    : scenario
      ? 0
      : null;
  const returnWork = connected
    ? connected.orders.filter((order) => Boolean(order.return && order.allowedReturnTransitions.length)).length
    : scenario
      ? 0
      : null;
  const workCount = garmentDrafts + (orderWork ?? 0) + (returnWork ?? 0);
  const needsAttention = scenario
    ? Math.max(workCount, connected?.notifications.length ?? 0)
    : projected?.summary.attention.value ?? null;
  const localLiveListings = listings.filter((listing) => ["PUBLISHED", "RESERVED"].includes(listing.state)).length;
  const liveListings = scenario ? localLiveListings : projected?.summary.live.value ?? null;
  const availableUnits = scenario
    ? connected?.pieces.filter((piece) => piece.availability === "AVAILABLE").length
      ?? garments.filter((garment) => garment.availability === "AVAILABLE").length
    : projected?.summary.available.value ?? null;

  if (hydration === "idle" || hydration === "restoring" || (!scenario && (authority.status === "idle" || authority.status === "loading"))) {
    return <div className="studio-loading studio-loading-brand" role="status"><WardrobeMotion loop polarity="auto" size="sm" variant="loader" /><span>Opening Lulu Studio…</span></div>;
  }

  const scenarioTasks = [
    {
      count: returnWork,
      href: "/studio/orders?filter=RETURNS",
      key: "returns",
      label: `Review ${returnWork} return${returnWork === 1 ? "" : "s"}`,
    },
    {
      count: orderWork,
      href: "/studio/orders",
      key: "orders",
      label: `Prepare ${orderWork} order${orderWork === 1 ? "" : "s"}`,
    },
    {
      count: garmentDrafts,
      href: "/studio/wardrobe",
      key: "garments",
      label: `Finish ${garmentDrafts} draft${garmentDrafts === 1 ? "" : "s"}`,
    },
  ].filter((task) => (task.count ?? 0) > 0);

  const scenarioPrimaryTask = scenarioTasks[0] ?? {
    count: 0,
    href: "/studio/wardrobe?intake=1",
    key: "clear",
    label: "Add the next piece",
  };
  const primaryTask = scenario
    ? scenarioPrimaryTask
    : projected?.continueAction ?? {
        count: null,
        href: "/studio",
        key: "unavailable",
        label: "Open Studio",
        openCount: 0,
        source: "CONNECTED" as const,
      };
  const primaryOpenCount = scenario ? workCount : projected?.continueAction?.openCount ?? null;
  const dropContext = projectStudioDropScopes(garments, listings);
  const currentDropIds = new Set(dropContext.scopes.find((scope) => scope.key === "current")?.garmentIds ?? []);
  const canEditPrice = (garment: (typeof garments)[number]) => (
    Boolean(garment.privateWardrobeItemId)
    && garment.state !== "CANCELLED"
    && garment.availability !== "ARCHIVED"
    && garment.dynamicPublication?.state !== "ARCHIVED"
  );
  const priceTarget = garments.find((garment) => (
    currentDropIds.has(garment.id)
    && canEditPrice(garment)
    && listings.some((listing) => listing.garmentId === garment.id)
  )) ?? garments.find((garment) => (
    canEditPrice(garment)
    && listings.some((listing) => listing.garmentId === garment.id)
  ));
  const recommendationLinks = [
    ...(priceTarget ? [{
      href: `/studio/wardrobe/${encodeURIComponent(priceTarget.id)}?action=price#garment-lifecycle`,
      key: "price",
      label: "Change price",
    }] : [{ href: "/studio/wardrobe?view=publishing", key: "prices", label: "Review prices" }]),
    { href: "/studio/wardrobe?collection=choose", key: "drop", label: "Browse drops" },
    { href: "/studio/wardrobe?intake=1", key: "intake", label: "Add piece" },
    { href: "/studio/wardrobe?view=publishing", key: "publishing", label: "Review Shop" },
    ...(returnWork ? [{ href: "/studio/orders?filter=RETURNS", key: "returns", label: "Review returns" }] : []),
    ...(activeOrders ? [{ href: "/studio/orders", key: "orders", label: "Open orders" }] : []),
  ].filter((recommendation, index, all) => (
    recommendation.href !== primaryTask.href
    && all.findIndex((candidate) => candidate.href === recommendation.href) === index
  ));
  const recentGarments = [
    ...garments.filter((garment) => currentDropIds.has(garment.id)),
    ...garments.filter((garment) => !currentDropIds.has(garment.id)),
  ].slice(0, 5);
  const truthLabel = scenario
    ? "Scenario preview"
    : projected
      ? projected.degradedSources.length ? "Studio snapshot" : "Live Studio"
      : "Connecting Studio";

  function showServices() {
    setSheetRaised(true);
  }

  function showRecommendation() {
    sheetStageRef.current?.scrollTo({ top: 0 });
    setSheetRaised(false);
  }

  return (
    <div className="studio-ops-page studio-business-home studio-atelier-home studio-premium-surface studio-home-control-plane">
      {!scenario && (authority.status === "error" || application.status === "error") ? (
        <div className="studio-quiet-empty" role="alert">
          <RotateCcw aria-hidden="true" size={22} />
          <div><strong>Live state unavailable</strong><p>{application.error || authority.error}</p></div>
          <button className="button button-secondary" onClick={() => void Promise.all([authority.refresh(), application.refresh()])} type="button">Try again</button>
        </div>
      ) : null}

      <section aria-label={`Recommended · ${truthLabel}`} className="studio-home-recommendation">
        <span>Recommended</span>
        <Link data-experience-action="primary" href={primaryTask.href}>
          <h1 id="studio-recommendation-title">{primaryTask.label}</h1>
          <ArrowRight aria-hidden="true" size={24} />
        </Link>
        <small>{primaryOpenCount === null
          ? "Live state unavailable"
          : primaryOpenCount
            ? `${primaryOpenCount} open`
            : "Studio clear"}</small>
        <nav aria-label="More recommendations" className="studio-home-recommendation-actions">
          {recommendationLinks.map((recommendation) => (
            <Link href={recommendation.href} key={recommendation.key}>
              <span>{recommendation.label}</span>
              <ArrowRight aria-hidden="true" size={14} />
            </Link>
          ))}
        </nav>
      </section>

      <div
        className="studio-home-sheet-stage"
        data-raised={sheetRaised || undefined}
        onScroll={(event) => {
          const currentScrollTop = event.currentTarget.scrollTop;
          const previousScrollTop = sheetScrollTopRef.current;
          sheetScrollTopRef.current = currentScrollTop;
          if (!sheetRaised && currentScrollTop > 4) setSheetRaised(true);
          if (sheetRaised && previousScrollTop > 4 && currentScrollTop <= 0) setSheetRaised(false);
        }}
        ref={sheetStageRef}
      >
      <div className="studio-home-sheet" data-raised={sheetRaised || undefined} ref={sheetRef}>
        <button
          aria-expanded={sheetRaised}
          aria-label={sheetRaised ? "Show Studio recommendation" : "Show Studio services"}
          className="studio-home-sheet-handle"
          onClick={() => {
            if (swipeHandledRef.current) {
              swipeHandledRef.current = false;
              return;
            }
            if (sheetRaised) showRecommendation(); else showServices();
          }}
          onPointerDown={(event) => {
            swipeStartRef.current = event.clientY;
            swipeHandledRef.current = false;
          }}
          onPointerUp={(event) => {
            if (swipeStartRef.current === null) return;
            const distance = event.clientY - swipeStartRef.current;
            swipeStartRef.current = null;
            if (Math.abs(distance) < 28) return;
            swipeHandledRef.current = true;
            if (distance < 0) showServices(); else showRecommendation();
          }}
          type="button"
        ><span /></button>

        <section className="studio-home-summary" aria-label="Studio summary">
          <ul className="studio-summary-grid">
            <li><Link aria-label={needsAttention === null ? "Attention unavailable" : `Attention ${needsAttention}`} className={`studio-summary-item${needsAttention ? " is-attention" : ""}`} href="/studio/operations"><span className="studio-summary-orb"><strong>{needsAttention ?? "—"}</strong></span><small>Attention</small></Link></li>
            <li><Link aria-label={availableUnits === null ? "Available state unavailable" : `Available ${availableUnits}`} className="studio-summary-item" href="/studio/operations?view=inventory"><span className="studio-summary-orb"><strong>{availableUnits ?? "—"}</strong></span><small>Available</small></Link></li>
            <li><Link aria-label={liveListings === null ? "Live state unavailable" : `Live ${liveListings}`} className="studio-summary-item" href="/studio/wardrobe?view=publishing"><span className="studio-summary-orb"><strong>{liveListings ?? "—"}</strong></span><small>Live</small></Link></li>
            <li><Link aria-label={activeOrders === null ? "Orders unavailable" : `Orders ${activeOrders}`} className="studio-summary-item" href="/studio/orders"><span className="studio-summary-orb"><strong>{activeOrders ?? "—"}</strong></span><small>Orders</small></Link></li>
          </ul>
        </section>

        <section aria-label="Studio services" className="studio-home-services">
          <StudioServiceList />
        </section>

        <section className="studio-home-recent studio-atelier-recent" aria-labelledby="studio-recent-title">
          <div className="studio-home-section-heading">
            <h2 id="studio-recent-title">Recent</h2>
            <Link href="/studio/wardrobe">View all <ArrowRight aria-hidden="true" size={14} /></Link>
          </div>

          {recentGarments.length ? (
            <div className="studio-recent-list">
              {recentGarments.map((garment) => {
                const listing = listings.find((candidate) => candidate.garmentId === garment.id);
                const stock = connected?.pieces.find((piece) => (
                  piece.wardrobeItemId === garment.privateWardrobeItemId || piece.sku === garment.sku
                ));
                const cover = studioGarmentCover(garment, listing);
                const lifecycleState = listing?.state ?? garment.state;
                const status = STUDIO_LIFECYCLE_PRESENTATION[lifecycleState];
                const availabilityLabel = stock ? stock.availability.toLowerCase() : "private";
                const showAvailability = availabilityLabel !== status.label.toLowerCase();
                return (
                  <Link
                    className="studio-recent-row"
                    data-state-tone={status.tone}
                    href={`/studio/wardrobe/${encodeURIComponent(garment.id)}`}
                    key={garment.id}
                  >
                    <span className={`studio-recent-media${cover ? " is-photo" : ""}`} data-variant={garment.visual} aria-hidden="true">
                      {cover ? <img alt="" height={cover.height} loading="lazy" src={cover.src} width={cover.width} /> : <Shirt size={22} strokeWidth={1.4} />}
                    </span>
                    <span className="studio-recent-copy">
                      <small>{garment.sku}</small>
                      <strong>{garment.title}</strong>
                      <span className="studio-recent-meta">
                        <LifecycleMeta className="studio-recent-status" state={lifecycleState} />
                        {showAvailability ? <><i aria-hidden="true">·</i><span>{availabilityLabel}</span></> : null}
                      </span>
                    </span>
                    <span aria-hidden="true" className="studio-recent-disclosure">
                      <ArrowRight size={17} />
                    </span>
                  </Link>
                );
              })}
            </div>
          ) : (
            <div className="studio-quiet-empty">
              <Shirt aria-hidden="true" size={24} strokeWidth={1.6} />
              <div><strong>No pieces yet</strong></div>
              <Link className="button button-primary" href="/studio/wardrobe?intake=1">Add piece</Link>
            </div>
          )}
        </section>

        <section className="studio-home-arrange" aria-label="Arrange Studio Home">
          <ArrangeStudioHomeControl />
        </section>
      </div>

      <footer aria-label="Justurban wears" className="studio-home-signoff">
        <WardrobeMotion artwork="logo" className="studio-home-signoff-mark" polarity="auto" size="sm" variant="footer" />
      </footer>
      </div>
    </div>
  );
}
