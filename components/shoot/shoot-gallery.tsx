"use client";

import { useMemo, useState } from "react";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { useStudio } from "../studio/studio-provider";
import { VisualAsset } from "../studio/visual-asset";
import { PageHeading } from "../ui/page-heading";
import { StatusPill } from "../ui/status-pill";

const galleryFilters = ["ALL", "APPROVED", "PENDING", "REJECTED"] as const;

export function ShootGallery() {
  const { garments, shoots } = useStudio();
  const [filter, setFilter] = useState<(typeof galleryFilters)[number]>("ALL");
  const visible = useMemo(() => shoots.filter((shoot) => {
    if (filter === "ALL") return true;
    return shoot.generations.some((generation) => generation.review.decision === filter);
  }), [filter, shoots]);

  return (
    <div id="shoot-gallery">
      <PageHeading
        eyebrow="Visual history"
        title="Every frame stays accountable."
        description="Approved, rejected, and pending outputs remain together so identity and garment decisions never lose their context."
        action={<Link className="button button-primary" href="/studio/media/new">＋ Create shoot</Link>}
      />
      <div className="filter-bar" role="group" aria-label="Filter shoots">
        {galleryFilters.map((item) => <button className={filter === item ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(item)} key={item}>{item.toLowerCase()}</button>)}
        <span className="filter-count">{visible.length} shoots</span>
      </div>
      <div className="shoot-gallery">
        {visible.map((shoot) => {
          const garment = garments.find((item) => item.id === shoot.garmentId);
          const hero = shoot.generations.find((generation) => generation.isHero) ?? shoot.generations[0];
          const decision = shoot.generations.every((generation) => generation.review.decision === "APPROVED")
            ? "APPROVED"
            : shoot.generations.some((generation) => generation.review.decision === "REJECTED")
              ? "MIXED"
              : "PENDING";
          return (
            <Link className="shoot-card" href={`/studio/media/${shoot.id}`} key={shoot.id}>
              <VisualAsset kind="generation" variant={hero.visual} label={`${shoot.id} ${shoot.preset}`} />
              <div className="shoot-card-overlay"><StatusPill status={decision} /><span>{shoot.generations.length} frames</span></div>
              <div className="shoot-card-copy">
                <span><small>{shoot.id}</small><small>{shoot.createdAt}</small></span>
                <h2>{garment?.title}</h2>
                <p>{shoot.preset} · {shoot.crop}</p>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
