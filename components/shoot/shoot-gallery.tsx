"use client";

/* Protected Studio media uses runtime asset URLs. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ArrowRight, Camera, ImagePlus, Shirt, Users } from "lucide-react";
import type { StudioLifecycleState } from "../../lib/studio/domain/entities";
import { LifecycleMeta } from "../studio/atoms/lifecycle-meta";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { StudioFeedback } from "../studio/atoms/studio-feedback";
import { StudioStackPage, StudioStackSection } from "../studio/atoms/studio-stack-page";
import { useStudio } from "../studio/studio-provider";

const filters = ["ALL", "APPROVED", "COMPLETE", "RUNNING", "FAILED"] as const;

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function lifecycleState(state: string): StudioLifecycleState {
  if (state === "FAILED") return "ERROR";
  if (state === "REJECTED") return "CANCELLED";
  if (state === "RUNNING") return "DRAFT";
  return "READY";
}

export function ShootGallery() {
  const { authority } = useStudio();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const media = authority.snapshot?.media ?? [];
  const visible = media.filter((item) => filter === "ALL" || item.state === filter);
  const currentMedia = media.find((item) => item.state === "COMPLETE")
    ?? media.find((item) => item.state === "RUNNING")
    ?? media.find((item) => item.state === "FAILED");
  const readyModels = authority.snapshot?.models.filter((model) => model.state === "READY").length ?? 0;

  if (authority.status === "idle" || authority.status === "loading") return <StudioFeedback state="loading" title="Opening Atelier" />;
  if (authority.status === "error") {
    const configurationFailure = /not enabled|approved studio workspace|configured/i.test(authority.error);
    return <StudioFeedback action={configurationFailure ? <Link className="button button-secondary" href="/studio/wardrobe">Open Wardrobe</Link> : <button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button>} detail={authority.error} state="error" title="Media unavailable" />;
  }

  return (
    <StudioStackPage id="shoot-gallery" kind="service">
      <h1 className="sr-only">Atelier</h1>
      <StudioStackSection>
        {currentMedia ? <Link className="studio-stack-current" href={`/studio/media/${currentMedia.id}`}><span><small>{currentMedia.state === "COMPLETE" ? "Review" : "Continue"}</small><strong>{currentMedia.title}</strong></span><LifecycleMeta state={lifecycleState(currentMedia.state)} /><ArrowRight aria-hidden="true" size={18} /></Link> : <Link className="studio-stack-current" href="/studio/media/new"><span><small>Next</small><strong>Create media</strong></span><ImagePlus aria-hidden="true" size={18} /></Link>}
      </StudioStackSection>
      <StudioStackSection>
        <nav aria-label="Atelier services" className="studio-stack-secondary">
          <Link href="/studio/models"><Users aria-hidden="true" size={19} /><span><strong>Models</strong><small>{readyModels} ready</small></span><ArrowRight aria-hidden="true" size={17} /></Link>
        </nav>
      </StudioStackSection>
      <StudioStackSection meta={`${visible.length}`} title="Media">
        <details className="studio-stack-filter">
          <summary>Filter · {filter.toLowerCase()}</summary>
          <div className="filter-bar" role="group" aria-label="Filter media">{filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(item)} key={item} type="button">{item.toLowerCase()}</button>)}</div>
        </details>
        {visible.length ? <div className="shoot-gallery">{visible.map((item) => <Link className="shoot-card" href={`/studio/media/${item.id}`} key={item.id}>
          {item.outputUrl ? <img alt={`${item.title}, ${label(item.operation)} generated view`} className="visual-asset ratio-portrait" height={1280} loading="lazy" src={item.outputUrl} style={{ objectFit: "cover" }} width={1024} /> : <span className="empty-authority">{item.operation.startsWith("GARMENT") || item.operation === "FABRIC_DETAIL" ? <Shirt aria-hidden="true" size={30} /> : <Camera aria-hidden="true" size={30} />}</span>}
          <div className="shoot-card-copy"><h2>{item.title}</h2><p><span>{label(item.operation)}</span><LifecycleMeta state={lifecycleState(item.state)} /></p></div>
          <ArrowRight aria-hidden="true" className="shoot-card-disclosure" size={18} />
        </Link>)}</div> : <StudioFeedback action={<Link className="button button-primary" href="/studio/media/new">Create media</Link>} detail="Choose a private garment to create its first view." state="empty" title="No media yet" />}
      </StudioStackSection>
    </StudioStackPage>
  );
}
