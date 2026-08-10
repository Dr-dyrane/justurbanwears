"use client";

import Link from "next/link";
import { useStudio } from "./studio-provider";
import { VisualAsset } from "./visual-asset";
import { StatusPill } from "../ui/status-pill";

export function StudioHome() {
  const { identity, garments, shoots } = useStudio();
  const awaiting = garments.filter((garment) => garment.canonState === "REVIEW");
  const retryCount = shoots.flatMap((shoot) => shoot.generations).filter(
    (generation) => generation.review.decision === "NEEDS RETRY",
  ).length;
  const pendingCount = shoots.flatMap((shoot) => shoot.generations).filter(
    (generation) => generation.review.decision === "PENDING",
  ).length;
  const approvedFrames = shoots.flatMap((shoot) => shoot.generations).filter(
    (generation) => generation.review.decision === "APPROVED",
  ).length;
  const exportReady = shoots.filter((shoot) =>
    shoot.generations.some(
      (generation) => generation.isHero && generation.review.decision === "APPROVED",
    ),
  ).length;
  const featuredShoot = shoots[0];
  const featuredGarment = garments.find((garment) => garment.id === featuredShoot?.garmentId);
  const queuedShoots = shoots.filter((shoot) => shoot.generations.length > 0).slice(0, 3);

  return (
    <div className="studio-page">
      <header className="studio-masthead">
        <div className="masthead-copy">
          <p className="eyebrow">Operator workspace · <time dateTime="2026-08-09">09 August 2026</time></p>
          <h1>From source truth to final frame.</h1>
          <p>
            Intake, canon, direction, review, and export stay connected without letting private identity sources cross into the public shop.
          </p>
        </div>
        <div className="masthead-actions">
          <Link className="button button-secondary" href="/garments/new">New garment</Link>
          <Link className="button button-primary" href="/shoots/new">
            <span aria-hidden="true">＋</span> Direct a shoot
          </Link>
        </div>
        <span className="masthead-depth-mark" aria-hidden="true">
          <span>JW</span>
          <small>PRIVATE EDITION</small>
        </span>
      </header>

      <section className="readiness-strip" aria-label="Studio pipeline readiness">
        <Link href="/konan" className="readiness-item">
          <span className="mini-orb"><span>{identity.completeness}</span>%</span>
          <span><small>01 · Identity canon</small><strong>{identity.status === "APPROVED" ? "Ready" : "Needs primary set"}</strong></span>
        </Link>
        <Link href="/garments" className="readiness-item">
          <span className="readiness-number">{garments.filter((g) => g.canonState === "APPROVED").length}</span>
          <span><small>02 · Garment canon</small><strong>{awaiting.length} awaiting approval</strong></span>
        </Link>
        <Link href={featuredShoot ? `/shoots/${featuredShoot.id}` : "/shoots"} className="readiness-item">
          <span className="readiness-number">{pendingCount}</span>
          <span><small>03 · Human review</small><strong>{retryCount} in retry queue</strong></span>
        </Link>
        <Link href="/shoots" className="readiness-item">
          <span className="readiness-number">{exportReady}</span>
          <span><small>04 · Export desk</small><strong>{approvedFrames} approved frames</strong></span>
        </Link>
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Review stage</p>
            <h2>On the decision table</h2>
          </div>
          <Link className="text-link" href="/shoots">View all shoots <span>↗</span></Link>
        </div>

        {featuredShoot ? (
          <div className="light-table" aria-label="Current shoot contact sheet">
            <Link href={`/shoots/${featuredShoot.id}`} className="featured-frame">
              <span className="frame-register" aria-hidden="true">
                <span>CONTACT 01</span>
                <span>HERO SELECT</span>
              </span>
              <VisualAsset kind="generation" variant="studio" label={`${featuredGarment?.sku ?? "Unassigned garment"} front`} ratio="landscape" />
              <div className="frame-overlay">
                <StatusPill status="MOCK" />
                <div>
                  <p>{featuredShoot.id} · {featuredShoot.preset}</p>
                  <h3>{featuredGarment?.title ?? "Unassigned garment"}</h3>
                </div>
                <span className="open-mark" aria-hidden="true">↗</span>
              </div>
            </Link>

            <aside className="queue-panel" aria-label="Approval queue">
              <span className="sheet-tape" aria-hidden="true" />
              <div className="queue-head">
                <div>
                  <small>CONTACTS 02—04</small>
                  <h3>Approval queue</h3>
                </div>
                <span>{pendingCount + retryCount}</span>
              </div>
              {queuedShoots.map((shoot, index) => {
                const garment = garments.find((item) => item.id === shoot.garmentId);
                const pending = shoot.generations.filter((generation) =>
                  ["PENDING", "NEEDS RETRY"].includes(generation.review.decision),
                ).length;
                return (
                  <Link className="queue-row" href={`/shoots/${shoot.id}`} key={shoot.id}>
                    <span className="queue-index" aria-hidden="true">0{index + 2}</span>
                    <VisualAsset kind="generation" variant={shoot.generations[0].visual} label={shoot.id} ratio="square" quiet />
                    <span className="queue-copy">
                      <small>{garment?.sku ?? "NO SKU"} · {shoot.preset}</small>
                      <strong>{garment?.title ?? "Unassigned garment"}</strong>
                      <span>{pending ? `${pending} decisions open` : "Review complete"}</span>
                    </span>
                    <span className="row-arrow" aria-hidden="true">›</span>
                  </Link>
                );
              })}
              {queuedShoots.length === 0 ? (
                <p className="queue-empty">No generated frames are waiting for review.</p>
              ) : null}
            </aside>
          </div>
        ) : (
          <div className="studio-empty-state">
            <span aria-hidden="true">JW / 00</span>
            <div>
              <p className="eyebrow">The table is clear</p>
              <h3>Stage your first private shoot.</h3>
              <p>Add a verified garment, choose a direction, and the contact sheet will begin here.</p>
            </div>
            <Link className="button button-primary" href="/shoots/new">Create shoot</Link>
          </div>
        )}
      </section>

      <section className="section-block">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Product intake</p>
            <h2>Recent garments</h2>
          </div>
          <Link className="text-link" href="/garments">Open library <span>↗</span></Link>
        </div>
        <div className="garment-row" aria-label="Recent garment contact sheet">
          {garments.slice(0, 4).map((garment, index) => (
            <Link className="garment-tile" data-contact={String(index + 1).padStart(2, "0")} href={`/garments/${garment.id}`} key={garment.id}>
              <span className="tile-register" aria-hidden="true">JW / {String(index + 1).padStart(2, "0")}</span>
              <VisualAsset kind="garment" variant={garment.visual} label={garment.title} />
              <div className="garment-tile-copy">
                <span><small>{garment.sku}</small><StatusPill status={garment.canonState} /></span>
                <h3>{garment.title}</h3>
                <p>{garment.sizeLabel} · ₦{garment.price.toLocaleString("en-NG")}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
