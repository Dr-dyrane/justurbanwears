"use client";

import { useMemo, useState } from "react";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { useStudio } from "../studio/studio-provider";
import { VisualAsset } from "../studio/visual-asset";
import { PageHeading } from "../ui/page-heading";
import { StatusPill } from "../ui/status-pill";

const filters = ["ALL", "AVAILABLE", "RESERVED", "SOLD", "REVIEW"] as const;

export function GarmentLibrary() {
  const { garments } = useStudio();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const visible = useMemo(
    () => garments.filter((garment) => {
      if (filter === "ALL") return true;
      if (filter === "REVIEW") return garment.canonState === "REVIEW";
      return garment.availability === filter;
    }),
    [filter, garments],
  );

  return (
    <div>
      <PageHeading
        eyebrow="Garment canon"
        title="The wardrobe, kept honest."
        description="Every product begins with its source record. No generation can replace missing garment truth."
        action={<Link className="button button-primary" href="/garments/new">＋ Add garment</Link>}
      />
      <div className="filter-bar" role="group" aria-label="Filter garments">
        {filters.map((item) => (
          <button className={filter === item ? "filter-chip active" : "filter-chip"} key={item} onClick={() => setFilter(item)}>
            {item === "REVIEW" ? "Needs review" : item.toLowerCase()}
          </button>
        ))}
        <span className="filter-count">{visible.length} pieces</span>
      </div>
      <div className="garment-grid">
        {visible.map((garment) => (
          <Link className="garment-card" href={`/garments/${garment.id}`} key={garment.id}>
            <VisualAsset kind="garment" variant={garment.visual} label={garment.title} />
            <div className="garment-card-topline">
              <span>{garment.sku}</span>
              <StatusPill status={garment.canonState} />
            </div>
            <h2>{garment.title}</h2>
            <div className="garment-meta">
              <span>{garment.sizeLabel}</span>
              <span>{garment.condition}</span>
              <strong>₦{garment.price.toLocaleString("en-NG")}</strong>
            </div>
            <div className="availability-line">
              <span className={`availability-dot availability-${garment.availability.toLowerCase()}`} />
              {garment.availability.toLowerCase()}
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
