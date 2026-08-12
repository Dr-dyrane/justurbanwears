"use client";

import { useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, LoaderCircle } from "lucide-react";

export type StudioSegment = { key: string; label: string; count?: number };

export function useStudioSegment(segments: StudioSegment[], fallback: string) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const requested = searchParams.get("view");
  const active = segments.some((segment) => segment.key === requested) ? requested! : fallback;

  function select(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next === fallback) params.delete("view");
    else params.set("view", next);
    const query = params.toString();
    startTransition(() => router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false }));
  }

  return { active, isPending, select };
}

export function StudioSegmentedView({ active, label, onSelect, pending = false, segments }: {
  active: string;
  label: string;
  onSelect(key: string): void;
  pending?: boolean;
  segments: StudioSegment[];
}) {
  const panelId = `studio-view-${active}`;
  function moveFocus(index: number) {
    const segment = segments[index];
    if (!segment) return;
    onSelect(segment.key);
    window.requestAnimationFrame(() => {
      document.getElementById(`studio-tab-${segment.key}`)?.focus();
    });
  }

  return (
    <div aria-busy={pending || undefined} className="studio-segmented-view" data-pending={pending || undefined} role="tablist" aria-label={label}>
      {segments.map((segment) => (
        <button
          aria-controls={active === segment.key ? panelId : undefined}
          aria-selected={active === segment.key}
          className={active === segment.key ? "is-active" : undefined}
          id={`studio-tab-${segment.key}`}
          key={segment.key}
          onClick={() => onSelect(segment.key)}
          onKeyDown={(event) => {
            const index = segments.findIndex((candidate) => candidate.key === segment.key);
            if (event.key === "ArrowRight") { event.preventDefault(); moveFocus((index + 1) % segments.length); }
            if (event.key === "ArrowLeft") { event.preventDefault(); moveFocus((index - 1 + segments.length) % segments.length); }
            if (event.key === "Home") { event.preventDefault(); moveFocus(0); }
            if (event.key === "End") { event.preventDefault(); moveFocus(segments.length - 1); }
          }}
          role="tab"
          tabIndex={active === segment.key ? 0 : -1}
          type="button"
        >
          <span>{segment.label}</span>
          {pending && active === segment.key ? <LoaderCircle aria-hidden="true" className="studio-spin" size={13} /> : null}
          {segment.count === undefined ? null : <small>{segment.count}</small>}
        </button>
      ))}
    </div>
  );
}

export function StudioPager({ label, onPageChange, page, pageSize, total }: {
  label: string;
  onPageChange(page: number): void;
  page: number;
  pageSize: number;
  total: number;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, pageCount - 1);
  const start = total === 0 ? 0 : safePage * pageSize + 1;
  const end = Math.min(total, (safePage + 1) * pageSize);

  if (pageCount <= 1) return null;

  return (
    <nav aria-label={label} className="studio-pager">
      <span>{start}–{end} of {total}</span>
      <div>
        <button aria-label="Previous page" disabled={safePage === 0} onClick={() => onPageChange(safePage - 1)} type="button">
          <ChevronLeft aria-hidden="true" size={17} />
        </button>
        <strong>{safePage + 1} / {pageCount}</strong>
        <button aria-label="Next page" disabled={safePage === pageCount - 1} onClick={() => onPageChange(safePage + 1)} type="button">
          <ChevronRight aria-hidden="true" size={17} />
        </button>
      </div>
    </nav>
  );
}
