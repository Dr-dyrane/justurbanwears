"use client";

import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  MessageCircleMore,
  Search,
} from "lucide-react";
import { STUDIO_SERVICES } from "../../../lib/studio/service-registry";
import {
  normalizeStudioAssistantText,
  resolveStudioAssistantRouteEntry,
  type StudioAssistantDocument,
} from "../../../lib/studio/assistant/experience";
import { studioAssistantContextFromProjection } from "../../../lib/studio/assistant/projection";
import { historicalDrop01Kind } from "../../../lib/studio/projections/piece-workspace";
import { studioScenarioHref } from "../../../lib/studio/simulator";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

interface CommandDocument {
  detail: string;
  href: string;
  id: string;
  kind: string;
  label: string;
  tokens: string;
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-NG");
}

function scoreDocument(document: CommandDocument, query: string) {
  const normalized = normalize(query);
  if (!normalized) return document.kind === "Service" ? 2 : 1;
  const label = normalize(document.label);
  const detail = normalize(document.detail);
  if (label === normalized) return 100;
  if (normalized.includes(label)) return 90;
  if (document.tokens.includes(normalized)) return 80;
  if (label.startsWith(normalized)) return 60;
  const words = normalized.split(/\s+/).filter(Boolean);
  return words.reduce((score, word) => score + (document.tokens.includes(word) || detail.includes(word) ? 10 : 0), 0);
}

export function StudioCommandCenter({
  routeSearch = "",
  showAsk = true,
  showSearch = true,
}: {
  routeSearch?: string;
  showAsk?: boolean;
  showSearch?: boolean;
}) {
  const pathname = usePathname();
  const studio = useStudio();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchCapability = studio.scenario
    ? "AVAILABLE"
    : studio.application.snapshot?.capabilities.find((capability) => capability.id === "SEARCH")?.state ?? "UNAVAILABLE";
  const askCapability = studio.scenario
    ? "AVAILABLE"
    : studio.application.snapshot?.capabilities.find((capability) => capability.id === "ASK_READ")?.state ?? "UNAVAILABLE";
  const canSearch = searchCapability !== "UNAVAILABLE";
  const canAsk = askCapability !== "UNAVAILABLE";
  const routeDocuments = useMemo<StudioAssistantDocument[]>(() => {
    if (studio.application.snapshot) {
      return studioAssistantContextFromProjection(studio.application.snapshot).documents;
    }
    return [
      ...STUDIO_SERVICES.map((service) => ({
        detail: service.description,
        entityId: service.key,
        href: service.href,
        id: `service:${service.key}`,
        identifiers: [service.key, service.label, ...service.aliases],
        kind: "Service" as const,
        label: service.label,
        state: "AVAILABLE",
        tokens: normalizeStudioAssistantText([service.key, service.label, service.description, ...service.aliases].join(" ")),
      })),
      ...studio.garments.map((garment) => {
        const state = historicalDrop01Kind(garment) ?? garment.state;
        return {
          detail: `${garment.sku} · ${garment.category} · ${state.toLocaleLowerCase("en-NG").replaceAll("_", " ")}`,
          entityId: garment.id,
          href: `/studio/wardrobe/${encodeURIComponent(garment.id)}`,
          id: `piece:${garment.id}`,
          identifiers: [garment.id, garment.privateWardrobeItemId, garment.sku, garment.title].filter(Boolean) as string[],
          kind: "Piece" as const,
          label: garment.title,
          mediaTargetId: garment.privateWardrobeItemId ?? garment.id,
          state,
          tokens: normalizeStudioAssistantText(`${garment.sku} ${garment.title} ${garment.category} ${garment.color} ${state}`),
        };
      }),
    ];
  }, [studio.application.snapshot, studio.garments]);

  const documents = useMemo<CommandDocument[]>(() => routeDocuments.map((document) => ({
    id: document.id,
    kind: document.kind,
    label: document.label,
    detail: document.detail,
    href: document.href,
    tokens: document.tokens,
  })), [routeDocuments]);

  const entryRecord = resolveStudioAssistantRouteEntry(
    routeDocuments,
    pathname,
    routeSearch,
  );
  const askHref = studioScenarioHref(
    entryRecord
      ? `/studio/ask?focus=${encodeURIComponent(entryRecord.id)}`
      : "/studio/ask",
    studio.scenario,
  );

  const searchResults = useMemo(() => documents
    .map((document) => ({ document, score: scoreDocument(document, searchQuery) }))
    .filter((result) => result.score > 0)
    .sort((left, right) => right.score - left.score || left.document.label.localeCompare(right.document.label))
    .slice(0, 8)
    .map((result) => result.document), [documents, searchQuery]);

  useEffect(() => {
    if (!searchOpen) return;
    const frame = window.requestAnimationFrame(() => searchInputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [searchOpen]);

  return (
    <div className="studio-command-center">
      {showSearch ? <button
        aria-controls="studio-search-anything"
        aria-expanded={searchOpen}
        aria-label="Find a Studio service or piece"
        className="studio-command-search-trigger"
        disabled={!canSearch}
        onClick={(event) => {
          if (!canSearch) return;
          setReturnFocus(event.currentTarget);
          setSearchOpen(true);
        }}
        type="button"
      >
        <Search aria-hidden="true" size={18} />
        <span>{searchCapability === "READ_ONLY_COMPATIBILITY" ? "Find services" : "Find in Studio"}</span>
      </button> : null}
      {!showAsk ? <span aria-hidden="true" className="studio-command-placeholder" /> : canAsk ? (
        <Link
          aria-label="Ask Studio"
          className="studio-command-ask-trigger"
          href={askHref}
        >
          <MessageCircleMore aria-hidden="true" size={18} />
          <span>Ask Studio</span>
        </Link>
      ) : (
        <button aria-label="Ask Studio unavailable" className="studio-command-ask-trigger" disabled type="button">
          <MessageCircleMore aria-hidden="true" size={18} />
          <span>Ask Studio</span>
        </button>
      )}

      {showSearch ? <StudioTaskSheet
        className="studio-command-sheet studio-search-sheet"
        eyebrow={studio.scenario
          ? "Scenario find"
          : searchCapability === "READ_ONLY_COMPATIBILITY"
            ? "Service directory"
          : studio.application.snapshot
            ? "Studio index"
            : "Local find"}
        onDismiss={() => setSearchOpen(false)}
        open={searchOpen}
        returnFocus={returnFocus}
        title="Find in Studio"
      >
        <section id="studio-search-anything">
          <label className="studio-command-query">
            <span className="sr-only">Search Studio</span>
            <input
              autoComplete="off"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder={searchCapability === "READ_ONLY_COMPATIBILITY"
                ? "Service name"
                : studio.application.snapshot ? "Piece, SKU, order, model…" : "Service, piece, or SKU"}
              ref={searchInputRef}
              type="search"
              value={searchQuery}
            />
          </label>
          <div aria-label="Studio search results" className="studio-command-results">
            {searchResults.length ? searchResults.map((result) => (
              <Link className="studio-command-result" href={result.href} key={result.id}>
                <span><strong>{result.label}</strong><small>{result.kind} · {result.detail}</small></span>
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
            )) : (
              <div className="studio-quiet-empty" role="status">
                <Search aria-hidden="true" size={22} />
                <div><strong>No safe result yet</strong><p>Try a service name, garment title, or exact SKU.</p></div>
              </div>
            )}
          </div>
        </section>
      </StudioTaskSheet> : null}
    </div>
  );
}
