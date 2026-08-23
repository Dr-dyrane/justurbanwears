"use client";

/* Protected Studio media uses runtime asset URLs. */
/* eslint-disable @next/next/no-img-element */

import { useMemo, useState } from "react";
import { Camera, CircleAlert, Shirt } from "lucide-react";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { useStudio } from "../studio/studio-provider";
import { PageHeading } from "../ui/page-heading";
import { StatusPill } from "../ui/status-pill";
import { WardrobeMotion } from "../brand/wardrobe-motion";

const filters = ["ALL", "APPROVED", "COMPLETE", "RUNNING", "FAILED"] as const;

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

export function ShootGallery() {
  const { authority } = useStudio();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const visible = useMemo(() => (authority.snapshot?.media ?? []).filter((item) => filter === "ALL" || item.state === filter), [authority.snapshot?.media, filter]);

  if (authority.status === "idle" || authority.status === "loading") return <div className="studio-loading studio-loading-brand" role="status"><WardrobeMotion size="sm" variant="loader" /><span>Opening media…</span></div>;
  if (authority.status === "error") return <div className="studio-quiet-empty" role="alert"><CircleAlert aria-hidden="true" size={24} /><div><strong>Media unavailable</strong><p>{authority.error}</p></div><button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button></div>;

  return (
    <div id="shoot-gallery">
      <PageHeading eyebrow="Visual history" title="Every generated view, together." description="Review, keep or reject real Studio outputs without losing their garment or model authority." action={<Link className="button button-primary" href="/studio/media/new">＋ Create media</Link>} />
      <div className="filter-bar" role="group" aria-label="Filter media">{filters.map((item) => <button className={filter === item ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(item)} key={item}>{item.toLowerCase()}</button>)}<span className="filter-count">{visible.length} views</span></div>
      {visible.length ? <div className="shoot-gallery">{visible.map((item) => <Link className="shoot-card" href={`/studio/media/${item.id}`} key={item.id}>
        {item.outputUrl ? <img alt={`${item.title}, ${label(item.operation)} generated view`} className="visual-asset ratio-portrait" height={1280} loading="lazy" src={item.outputUrl} style={{ objectFit: "cover" }} width={1024} /> : <span className="empty-authority">{item.operation.startsWith("GARMENT") || item.operation === "FABRIC_DETAIL" ? <Shirt aria-hidden="true" size={30} /> : <Camera aria-hidden="true" size={30} />}</span>}
        <div className="shoot-card-overlay"><StatusPill status={item.state} /><span>{label(item.operation)}</span></div>
        <div className="shoot-card-copy"><span><small>{item.sku ?? "Private piece"}</small><small>{new Intl.DateTimeFormat("en-NG", { dateStyle: "medium" }).format(new Date(item.createdAt))}</small></span><h2>{item.title}</h2><p>{item.modelName ? `${item.modelName} · ` : ""}{label(item.operation)}</p></div>
      </Link>)}</div> : <div className="studio-quiet-empty"><Camera aria-hidden="true" size={24} /><div><strong>No generated media yet</strong><p>Choose a private garment to create its first real view.</p></div><Link className="button button-primary" href="/studio/media/new">Create media</Link></div>}
    </div>
  );
}
