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
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioLink as Link } from "./atoms/studio-link";
import { studioGarmentCover } from "./garment-cover";
import {
  ArrangeStudioHomeControl,
  StudioServiceList,
} from "./navigation/studio-service-list";
import {
  studioOrderHasDueReturnWork,
  studioOrderHasDueWork,
} from "../../lib/shop/order-presentation";
import { moveFocusFromWorkspaceGrip } from "./workspace/studio-workspace-focus";
import { projectStudioDropScopes } from "../../lib/studio/projections/drop-context";
import {
  actionableStudioDraftCount,
  historicalDrop01Kind,
} from "../../lib/studio/projections/piece-workspace";
import { selectStudioHomeGate } from "../../lib/studio/application/home-gate";
import { selectStudioProjectionFreshness } from "../../lib/studio/application/projection-freshness";
import { selectStudioWorkProjection } from "../../lib/studio/application/work-projection";
import { useStudio } from "./studio-provider";
import { StudioProjectionFreshnessNotice } from "./atoms/studio-projection-freshness";

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
  const [desktopWorkspace, setDesktopWorkspace] = useState(false);
  const sheetRef = useRef<HTMLDivElement>(null);
  const sheetContentRef = useRef<HTMLElement>(null);
  const sheetHandleRef = useRef<HTMLButtonElement>(null);
  const sheetStageRef = useRef<HTMLDivElement>(null);
  const swipeStartRef = useRef<number | null>(null);
  const swipeHandledRef = useRef(false);

  const connected = authority.snapshot;
  const projected = scenario ? null : application.snapshot;
  const applicationFreshness = selectStudioProjectionFreshness({
    error: application.error,
    generatedAt: projected?.generatedAt ?? null,
    status: application.status,
  });

  useEffect(() => {
    const stage = sheetStageRef.current;
    if (!stage) return;
    const desktopWorkspaceQuery = window.matchMedia("(min-width: 1100px) and (min-height: 600px)");
    const synchronizeWorkspace = () => {
      stage.scrollTo({ top: 0 });
      if (desktopWorkspaceQuery.matches) {
        moveFocusFromWorkspaceGrip(sheetContentRef.current, sheetHandleRef.current);
      }
      setDesktopWorkspace(desktopWorkspaceQuery.matches);
    };

    synchronizeWorkspace();
    desktopWorkspaceQuery.addEventListener("change", synchronizeWorkspace);
    window.addEventListener("resize", synchronizeWorkspace);
    return () => {
      desktopWorkspaceQuery.removeEventListener("change", synchronizeWorkspace);
      window.removeEventListener("resize", synchronizeWorkspace);
    };
  }, [application.status, authority.status, hydration, scenario]);

  const garmentDrafts = scenario
    ? actionableStudioDraftCount(garments)
    : projected?.summary.drafts.value
      ?? connected?.pieces.filter((piece) => piece.availability === "PRIVATE").length
      ?? 0;
  const connectedActiveOrders = connected
    ? connected.orders.filter((order) => order.lifecycleStatus === "ACTIVE").length
    : null;
  const activeOrders = scenario
    ? connectedActiveOrders ?? 0
    : projected?.summary.orders.value ?? connectedActiveOrders;
  const orderWork = connected
    ? connected.orders.filter((order) => (
        studioOrderHasDueWork(order) && !studioOrderHasDueReturnWork(order)
      )).length
    : scenario
      ? 0
      : null;
  const returnWork = connected
    ? connected.orders.filter(studioOrderHasDueReturnWork).length
    : scenario
      ? 0
      : null;
  const scenarioWork = scenario && connected ? selectStudioWorkProjection(connected) : null;
  const needsAttention = scenario
    ? scenarioWork?.attentionCount ?? 0
    : projected?.summary.attention.value ?? null;
  const garmentsById = new Map(garments.map((garment) => [garment.id, garment]));
  const garmentsBySku = new Map(garments.map((garment) => [garment.sku, garment]));
  const localLiveListings = listings.filter((listing) => {
    if (listing.state !== "PUBLISHED" && listing.state !== "RESERVED") return false;
    const garment = garmentsById.get(listing.garmentId);
    return !garment || historicalDrop01Kind(garment) === null;
  }).length;
  const projectedLiveListings = projected?.summary.live.value ?? null;
  const currentPublishedListings = projected?.collectionScopes
    .find((scope) => scope.isCurrent)?.counts.published ?? null;
  const liveListings = scenario
    ? localLiveListings
    : projectedLiveListings ?? currentPublishedListings;
  const liveListingsLabel = scenario || projectedLiveListings !== null
    ? "Live"
    : currentPublishedListings !== null ? "Published" : "Shop";
  const availableUnits = scenario
    ? connected?.pieces.filter((piece) => {
        if (piece.availability !== "AVAILABLE") return false;
        const garment = piece.sku ? garmentsBySku.get(piece.sku) : undefined;
        return !garment || historicalDrop01Kind(garment) === null;
      }).length
      ?? garments.filter((garment) => (
        garment.availability === "AVAILABLE"
        && historicalDrop01Kind(garment) === null
      )).length
    : projected?.summary.available.value ?? null;

  const homeGate = selectStudioHomeGate({
    applicationStatus: application.status,
    authorityStatus: authority.status,
    hydration,
    scenario: Boolean(scenario),
  });
  const recentPiecesState = scenario || hydration === "ready"
    ? "ready"
    : hydration === "degraded" ? "unavailable" : "loading";
  if (homeGate === "loading") {
    return <StudioLoadingStage label="Opening Lulu Studio…" />;
  }
  if (homeGate === "error") {
    return (
      <div className="studio-ops-page studio-business-home studio-atelier-home studio-premium-surface studio-home-control-plane">
        <div className="studio-quiet-empty" role="alert">
          <RotateCcw aria-hidden="true" size={22} />
          <div><strong>Studio could not open</strong><p>{application.error || authority.error}</p></div>
          <button
            className="button button-primary"
            data-experience-action="primary"
            onClick={() => void Promise.all([authority.refresh(), application.refresh()])}
            type="button"
          >Try again</button>
        </div>
      </div>
    );
  }

  const scenarioTasks = [
    {
      count: scenarioWork?.locationMismatches.length ?? 0,
      href: "/studio/operations?view=inventory",
      key: "locations",
      label: `Review ${scenarioWork?.locationMismatches.length ?? 0} location${scenarioWork?.locationMismatches.length === 1 ? "" : "s"}`,
    },
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
        count: 0,
        href: "/studio/wardrobe?intake=1",
        key: "clear",
        label: "Add the next piece",
        openCount: 0,
        source: "CONNECTED" as const,
      };
  const primaryOpenCount = scenario ? scenarioPrimaryTask.count : projected?.continueAction?.openCount ?? null;
  const dropContext = projectStudioDropScopes(garments, listings);
  const currentDropIds = new Set(dropContext.scopes.find((scope) => scope.key === "current")?.garmentIds ?? []);
  const recentGarments = [
    ...garments.filter((garment) => currentDropIds.has(garment.id)),
    ...garments.filter((garment) => !currentDropIds.has(garment.id)),
  ].slice(0, 5);
  const truthLabel = scenario
    ? "Scenario preview"
    : applicationFreshness.state === "STALE"
      ? "Last-known Studio"
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
      <section aria-label={`Recommended · ${truthLabel}`} className="studio-home-recommendation">
        <span>Recommended</span>
        <Link data-experience-action="primary" href={primaryTask.href}>
          <h1 id="studio-recommendation-title">{primaryTask.label}</h1>
          <ArrowRight aria-hidden="true" size={24} />
        </Link>
        <small>{primaryOpenCount === null
          ? "Recommendation needs a refresh"
          : primaryOpenCount
            ? `${primaryOpenCount} open`
            : "Studio clear"}</small>
        {applicationFreshness.state === "STALE" ? (
          <StudioProjectionFreshnessNotice
            asOf={applicationFreshness.asOf}
            error={application.error}
            onRetry={() => void application.refresh()}
          />
        ) : null}
      </section>

      <div
        className="studio-home-sheet-stage"
        data-raised={sheetRaised || undefined}
        ref={sheetStageRef}
      >
      <div className="studio-home-sheet" data-raised={sheetRaised || undefined} ref={sheetRef}>
        <button
          aria-expanded={sheetRaised}
          aria-label={sheetRaised ? "Show Studio recommendation" : "Show Studio services"}
          className="studio-home-sheet-handle"
          hidden={desktopWorkspace}
          onBlur={(event) => {
            if (event.relatedTarget || !window.matchMedia("(min-width: 1100px) and (min-height: 600px)").matches) return;
            window.requestAnimationFrame(() => {
              let firstActiveRead = true;
              moveFocusFromWorkspaceGrip(
                sheetContentRef.current,
                sheetHandleRef.current,
                () => {
                  if (firstActiveRead) {
                    firstActiveRead = false;
                    return sheetHandleRef.current;
                  }
                  return document.activeElement;
                },
              );
            });
          }}
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
          ref={sheetHandleRef}
          type="button"
        ><span /></button>

        <section className="studio-home-summary" aria-label="Studio summary" ref={sheetContentRef}>
          <ul className="studio-summary-grid">
            <li><Link aria-label={needsAttention === null ? "Attention unavailable" : `Attention ${needsAttention}`} className={`studio-summary-item${needsAttention ? " is-attention" : ""}`} href="/studio/operations"><span className="studio-summary-orb"><strong>{needsAttention ?? "—"}</strong></span><small>Attention</small></Link></li>
            <li><Link aria-label={availableUnits === null ? "Available state unavailable" : `Available ${availableUnits}`} className="studio-summary-item" href="/studio/operations?view=inventory"><span className="studio-summary-orb"><strong>{availableUnits ?? "—"}</strong></span><small>Available</small></Link></li>
            <li><Link aria-label={liveListings === null ? "Open Shop publishing" : `${liveListingsLabel} ${liveListings}`} className="studio-summary-item" href="/studio/wardrobe?view=publishing"><span className="studio-summary-orb"><strong>{liveListings ?? "—"}</strong></span><small>{liveListingsLabel}</small></Link></li>
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

          {recentPiecesState === "loading" ? (
            <div className="studio-quiet-empty" role="status">
              <Shirt aria-hidden="true" size={24} strokeWidth={1.6} />
              <div><strong>Loading recent pieces…</strong><p>Wardrobe details are catching up.</p></div>
            </div>
          ) : recentPiecesState === "unavailable" ? (
            <div className="studio-quiet-empty" role="status">
              <Shirt aria-hidden="true" size={24} strokeWidth={1.6} />
              <div><strong>Recent pieces unavailable</strong><p>Wardrobe could not be verified. Other Studio areas remain available.</p></div>
              <Link className="button button-secondary" href="/studio/wardrobe">Retry in Wardrobe</Link>
            </div>
          ) : recentGarments.length ? (
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
