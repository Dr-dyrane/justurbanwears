"use client";

/* Protected Studio media uses runtime asset URLs. */
/* eslint-disable @next/next/no-img-element */

import { useState } from "react";
import { ArrowRight, Camera, ImagePlus, LockKeyhole, Shirt, Users } from "lucide-react";
import { StudioLink as Link } from "../studio/atoms/studio-link";
import { StudioLoadingStage } from "../studio/atoms/studio-loading-stage";
import { StudioFeedback } from "../studio/atoms/studio-feedback";
import { StudioStackPage, StudioStackSection } from "../studio/atoms/studio-stack-page";
import { useStudio } from "../studio/studio-provider";
import type { StudioAuthorityMedia } from "../../lib/studio/services/studio-authority-client";
import { MediaStateMeta, mediaStatePresentation, type MediaState } from "./media-state-presentation";

const filters = [
  "ALL",
  "PENDING",
  "RUNNING",
  "COMPLETE",
  "APPROVED",
  "REJECTED",
  "FAILED",
  "INDETERMINATE",
] as const satisfies readonly ("ALL" | MediaState)[];

const currentPriority: readonly MediaState[] = [
  "COMPLETE",
  "INDETERMINATE",
  "RUNNING",
  "PENDING",
  "FAILED",
  "REJECTED",
  "APPROVED",
];

function label(value: string) {
  return value.toLowerCase().replaceAll("_", " ");
}

function currentActionLabel(state: MediaState) {
  if (state === "COMPLETE") return "Review";
  if (state === "INDETERMINATE") return "Reconcile";
  if (state === "RUNNING" || state === "PENDING") return "Monitor";
  if (state === "FAILED") return "Needs attention";
  if (state === "REJECTED") return "View history";
  return "Approved";
}

function galleryPreviewAttemptKey(outputUrl: string | null, authorityGeneratedAt: string) {
  return `${authorityGeneratedAt}\u0000${outputUrl ?? ""}`;
}

function ShootGalleryCard({
  authorityGeneratedAt,
  item,
}: {
  authorityGeneratedAt: string;
  item: StudioAuthorityMedia;
}) {
  const previewAttemptKey = galleryPreviewAttemptKey(item.outputUrl, authorityGeneratedAt);
  const [failedPreviewAttemptKey, setFailedPreviewAttemptKey] = useState("");
  const privateMediaUnavailable = Boolean(
    item.outputUrl && failedPreviewAttemptKey === previewAttemptKey,
  );
  const garmentEvidence = item.operation.startsWith("GARMENT") || item.operation === "FABRIC_DETAIL";

  return (
    <Link className="shoot-card" href={`/studio/media/${item.id}`}>
      {item.outputUrl && !privateMediaUnavailable
        ? <img alt="" className="visual-asset ratio-portrait" height={1280} key={previewAttemptKey} loading="lazy" onError={(event) => { event.currentTarget.hidden = true; setFailedPreviewAttemptKey(previewAttemptKey); }} onLoad={() => setFailedPreviewAttemptKey("")} src={item.outputUrl} style={{ objectFit: "cover" }} width={1024} />
        : privateMediaUnavailable
          ? <span aria-label={`${item.title} private media unavailable`} className="empty-authority" role="img"><LockKeyhole aria-hidden="true" size={30} /></span>
          : <span className="empty-authority">{garmentEvidence ? <Shirt aria-hidden="true" size={30} /> : <Camera aria-hidden="true" size={30} />}</span>}
      <div className="shoot-card-copy"><h2>{item.title}</h2><p><span>{privateMediaUnavailable ? "Private media unavailable" : label(item.operation)}</span><MediaStateMeta state={item.state} /></p></div>
      <ArrowRight aria-hidden="true" className="shoot-card-disclosure" size={18} />
    </Link>
  );
}

export function ShootGallery() {
  const { authority } = useStudio();
  const [filter, setFilter] = useState<(typeof filters)[number]>("ALL");
  const media = authority.snapshot?.media ?? [];
  const authorityGeneratedAt = authority.snapshot?.generatedAt ?? "unhydrated";
  const visible = media.filter((item) => filter === "ALL" || item.state === filter);
  const currentMedia = currentPriority
    .map((state) => media.find((item) => item.state === state))
    .find((item) => item !== undefined);
  const readyModels = authority.snapshot?.models.filter((model) => model.state === "READY").length ?? 0;
  const selectedFilterLabel = filter === "ALL" ? "all" : mediaStatePresentation(filter).label.toLowerCase();

  if (authority.status === "idle" || authority.status === "loading") return <StudioLoadingStage label="Opening Atelier…" />;
  if (authority.status === "error") {
    const configurationFailure = /not enabled|approved studio workspace|configured/i.test(authority.error);
    return <StudioFeedback action={configurationFailure ? <Link className="button button-secondary" href="/studio/wardrobe">Open Wardrobe</Link> : <button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button>} detail={authority.error} state="error" title="Media unavailable" />;
  }

  return (
    <StudioStackPage id="shoot-gallery" kind="service">
      <h1 className="sr-only">Atelier</h1>
      <StudioStackSection>
        {currentMedia ? <Link className="studio-stack-current" href={`/studio/media/${currentMedia.id}`}><span><small>{currentActionLabel(currentMedia.state)}</small><strong>{currentMedia.title}</strong></span><MediaStateMeta state={currentMedia.state} /><ArrowRight aria-hidden="true" size={18} /></Link> : media.length === 0 ? <Link className="studio-stack-current" href="/studio/media/new"><span><small>Next</small><strong>Create media</strong></span><ImagePlus aria-hidden="true" size={18} /></Link> : null}
      </StudioStackSection>
      <StudioStackSection>
        <nav aria-label="Atelier services" className="studio-stack-secondary">
          <Link href="/studio/models"><Users aria-hidden="true" size={19} /><span><strong>Models</strong><small>{readyModels} ready</small></span><ArrowRight aria-hidden="true" size={17} /></Link>
        </nav>
      </StudioStackSection>
      <StudioStackSection meta={`${visible.length}`} title="Media">
        <details className="studio-stack-filter">
          <summary>Filter · {selectedFilterLabel}</summary>
          <div className="filter-bar" role="group" aria-label="Filter media">{filters.map((item) => <button aria-pressed={filter === item} className={filter === item ? "filter-chip active" : "filter-chip"} onClick={() => setFilter(item)} key={item} type="button">{item === "ALL" ? "all" : mediaStatePresentation(item).label.toLowerCase()}</button>)}</div>
        </details>
        {visible.length ? <div className="shoot-gallery">{visible.map((item) => <ShootGalleryCard authorityGeneratedAt={authorityGeneratedAt} item={item} key={item.id} />)}</div> : media.length === 0
          ? <StudioFeedback action={<Link className="button button-primary" href="/studio/media/new">Create media</Link>} detail="Choose a private garment to create its first view." state="empty" title="No media yet" />
          : <StudioFeedback action={<button className="button button-primary" onClick={() => setFilter("ALL")} type="button">Show all</button>} detail={`The ${selectedFilterLabel} filter is empty. Show all to see the other media.`} state="empty" title={`No ${selectedFilterLabel} media`} />}
      </StudioStackSection>
    </StudioStackPage>
  );
}
