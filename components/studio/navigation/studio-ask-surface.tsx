"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  CircleAlert,
  LoaderCircle,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import {
  normalizeStudioAssistantText,
  resolveStudioAssistant,
  type StudioAssistantBlock,
  type StudioAssistantContext,
  type StudioAssistantDocument,
  type StudioAssistantResponse,
} from "../../../lib/studio/assistant/experience";
import type { StudioSearchDocument } from "../../../lib/studio/application/contracts";
import { STUDIO_SERVICES } from "../../../lib/studio/service-registry";
import { StudioLink as Link } from "../atoms/studio-link";
import { useStudio } from "../studio-provider";

type AskTurn = {
  id: string;
  query: string;
  response?: StudioAssistantResponse;
  state: "complete" | "error" | "resolving";
};

const STORAGE_KEY = "juw.studio.ask.v1";
const STARTERS = [
  "What needs attention?",
  "Change JUW-001 price",
  "Prepare media for JUW-003",
  "Find active orders",
] as const;

function assistantTokens(values: Array<string | null | undefined>) {
  return normalizeStudioAssistantText(values.filter(Boolean).join(" "));
}

function storedQuery(value: unknown) {
  if (typeof value === "string") return value.trim();
  if (!value || typeof value !== "object") return "";
  const candidate = value as { query?: unknown };
  return typeof candidate.query === "string" ? candidate.query.trim() : "";
}

function restoreQueries() {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    const value = JSON.parse(stored) as unknown;
    return Array.isArray(value) ? value.map(storedQuery).filter(Boolean).slice(-12) : [];
  } catch {
    return [];
  }
}

function pieceDetail(input: { availability?: string; category: string; colour?: string; state?: string }) {
  return [input.category, input.colour, input.availability ?? input.state]
    .filter(Boolean)
    .join(" · ");
}

function assistantDocumentKind(kind: StudioSearchDocument["kind"]): StudioAssistantDocument["kind"] {
  if (kind === "SERVICE") return "Service";
  if (kind === "ORDER") return "Order";
  if (kind === "MODEL") return "Model";
  if (kind === "MEDIA" || kind === "ATELIER_OPERATION") return "Media";
  if (kind === "UPDATE") return "Alert";
  return "Piece";
}

function projectedAssistantDocument(
  document: StudioSearchDocument,
  connected: ReturnType<typeof useStudio>["authority"]["snapshot"],
): StudioAssistantDocument {
  const kind = assistantDocumentKind(document.kind);
  const entityId = document.id.includes(":") ? document.id.slice(document.id.indexOf(":") + 1) : document.id;
  const piece = kind === "Piece"
    ? connected?.pieces.find((candidate) => (
        candidate.pieceKey === entityId
        || candidate.wardrobeItemId === entityId
        || Boolean(candidate.sku && document.aliases.includes(candidate.sku))
      ))
    : undefined;
  return {
    detail: document.secondaryLabel,
    entityId,
    href: document.route,
    id: document.id,
    identifiers: [document.id, entityId, ...document.aliases],
    kind,
    label: document.primaryLabel,
    mediaTargetId: piece?.wardrobeItemId ?? undefined,
    state: document.lifecycleState,
    tokens: assistantTokens([
      document.id,
      document.primaryLabel,
      document.secondaryLabel,
      document.lifecycleState,
      ...document.aliases,
    ]),
  };
}

function buildContext(studio: ReturnType<typeof useStudio>): StudioAssistantContext {
  const connected = studio.authority.snapshot;
  const projected = studio.scenario ? null : studio.application.snapshot;
  const documents: StudioAssistantDocument[] = projected
    ? projected.searchDocuments.map((document) => projectedAssistantDocument(document, connected))
    : STUDIO_SERVICES.map((service) => ({
        detail: service.description,
        href: service.href,
        id: `service:${service.key}`,
        identifiers: [service.key, service.label, ...service.aliases],
        kind: "Service",
        label: service.label,
        tokens: assistantTokens([service.key, service.label, service.description, ...service.aliases]),
      }));

  if (!projected) {
  const knownPieceKeys = new Set<string>();
  for (const garment of studio.garments) {
    knownPieceKeys.add(garment.sku.toLocaleLowerCase("en-NG"));
    knownPieceKeys.add(garment.id.toLocaleLowerCase("en-NG"));
    if (garment.privateWardrobeItemId) knownPieceKeys.add(garment.privateWardrobeItemId.toLocaleLowerCase("en-NG"));
    documents.push({
      detail: pieceDetail({ availability: garment.availability, category: garment.category, colour: garment.color }),
      entityId: garment.id,
      href: `/studio/wardrobe/${encodeURIComponent(garment.id)}`,
      id: `piece:${garment.id}`,
      identifiers: [garment.id, garment.sku, garment.privateWardrobeItemId ?? ""],
      kind: "Piece",
      label: garment.title,
      mediaTargetId: garment.privateWardrobeItemId ?? (studio.scenario ? garment.id : undefined),
      state: garment.state,
      tokens: assistantTokens([
        garment.id,
        garment.sku,
        garment.title,
        garment.category,
        garment.color,
        garment.condition,
        garment.state,
        garment.availability,
        garment.dynamicPublication?.drop,
      ]),
    });
  }

  for (const piece of connected?.pieces ?? []) {
    const keys = [piece.sku, piece.wardrobeItemId, piece.pieceKey].filter(Boolean) as string[];
    if (keys.some((key) => knownPieceKeys.has(key.toLocaleLowerCase("en-NG")))) continue;
    const entityId = piece.wardrobeItemId ?? piece.pieceKey;
    documents.push({
      detail: pieceDetail({ availability: piece.availability, category: piece.category, colour: piece.colour }),
      entityId,
      href: piece.wardrobeItemId
        ? `/studio/wardrobe/${encodeURIComponent(piece.wardrobeItemId)}`
        : "/studio/operations?view=inventory",
      id: `piece:${entityId}`,
      identifiers: keys,
      kind: "Piece",
      label: piece.title,
      mediaTargetId: piece.wardrobeItemId ?? undefined,
      state: piece.availability,
      tokens: assistantTokens([
        ...keys,
        piece.title,
        piece.category,
        piece.colour,
        piece.condition,
        piece.sizeLabel,
        piece.availability,
        piece.expectedLocationLabel,
        piece.observedLocationLabel,
      ]),
    });
  }

  for (const order of connected?.orders ?? []) {
    const skus = order.lines.map((line) => line.sku);
    const labels = order.lines.map((line) => line.name);
    documents.push({
      detail: [order.lifecycleStatus, order.paymentReviewStatus, order.fulfillmentStatus].join(" · "),
      entityId: order.reference,
      href: `/studio/orders/${encodeURIComponent(order.reference)}#studio-order-next-action`,
      id: `order:${order.id}`,
      identifiers: [order.id, order.reference, ...skus],
      kind: "Order",
      label: `Order ${order.reference}`,
      state: order.return ? order.return.status : order.lifecycleStatus,
      tokens: assistantTokens([
        order.id,
        order.reference,
        ...skus,
        ...labels,
        order.lifecycleStatus,
        order.paymentReviewStatus,
        order.fundsConfirmationStatus,
        order.fulfillmentStatus,
        order.return?.status,
      ]),
    });
  }

  for (const model of connected?.models ?? []) {
    documents.push({
      detail: `${model.kind.replaceAll("_", " ")} · ${model.state.toLocaleLowerCase("en-NG")}`,
      entityId: model.id,
      href: "/studio/models?view=authority",
      id: `model:${model.id}`,
      identifiers: [model.id, model.name, model.kind],
      kind: "Model",
      label: model.name,
      state: model.state,
      tokens: assistantTokens([model.id, model.name, model.kind, model.state, "identity face body canon consent styling"]),
    });
  }

  for (const media of connected?.media ?? []) {
    documents.push({
      detail: `${media.operation.replaceAll("_", " ")} · ${media.state.toLocaleLowerCase("en-NG")}`,
      entityId: media.id,
      href: `/studio/media/${encodeURIComponent(media.id)}`,
      id: `media:${media.id}`,
      identifiers: [media.id, media.sku ?? ""],
      kind: "Media",
      label: media.title,
      state: media.state,
      tokens: assistantTokens([media.id, media.sku, media.title, media.operation, media.state, media.modelName]),
    });
  }

  for (const notification of connected?.notifications ?? []) {
    documents.push({
      detail: notification.detail,
      entityId: notification.id,
      href: notification.href,
      id: `alert:${notification.id}`,
      identifiers: [notification.id],
      kind: "Alert",
      label: notification.title,
      state: notification.tone,
      tokens: assistantTokens([notification.id, notification.kind, notification.tone, notification.title, notification.detail]),
    });
  }
  }

  const projectedAttention = connected
    ? Math.max(
        connected.notifications.length,
        connected.pieces.filter((piece) => piece.availability === "PRIVATE" || piece.hasLocationMismatch).length
          + connected.orders.filter((order) => order.allowedTransitions.length > 0 || order.allowedReturnTransitions.length > 0).length,
      )
    : studio.scenario
      ? studio.garments.filter((garment) => garment.state === "DRAFT" || garment.state === "ERROR").length
      : null;
  const localLive = studio.garments.filter((garment) => garment.dynamicPublication?.state === "PUBLISHED").length
    || studio.listings.filter((listing) => listing.state === "PUBLISHED").length;

  return {
    documents,
    provenance: projected
      ? {
          detail: projected.degradedSources.length
            ? `${projected.degradedSources.length} source${projected.degradedSources.length === 1 ? "" : "s"} limited`
            : "Connected Studio application snapshot",
          generatedAt: projected.generatedAt,
          label: projected.degradedSources.length ? "Studio snapshot" : "Live Studio",
          status: projected.degradedSources.length ? "degraded" : "connected",
        }
      : studio.scenario
      ? {
          detail: "Lifecycle simulator · in-memory state",
          generatedAt: connected?.generatedAt ?? null,
          label: "Scenario preview",
          status: "preview",
        }
      : studio.authority.status === "ready" && connected
        ? {
            detail: "Connected authority projection",
            generatedAt: connected.generatedAt,
            label: "Live Studio",
            status: "connected",
          }
        : {
            detail: studio.authority.error || "Connected truth is still loading; local Wardrobe remains available.",
            generatedAt: null,
            label: "Local preview",
            status: "degraded",
          },
    summary: {
      attention: projected ? projected.summary.attention.value : projectedAttention,
      available: projected
        ? projected.summary.available.value
        : connected?.pieces.filter((piece) => piece.availability === "AVAILABLE").length
          ?? (studio.scenario ? studio.garments.filter((garment) => garment.availability === "AVAILABLE").length : null),
      drafts: projected
        ? null
        : connected?.pieces.filter((piece) => piece.availability === "PRIVATE").length
          ?? (studio.scenario ? studio.garments.filter((garment) => garment.state === "DRAFT").length : null),
      live: projected ? projected.summary.live.value : studio.scenario ? localLive : null,
      orders: projected
        ? projected.summary.orders.value
        : connected?.orders.filter((order) => order.lifecycleStatus === "ACTIVE").length ?? null,
      review: projected
        ? null
        : connected?.media.filter((media) => media.state === "COMPLETE" || media.state === "FAILED").length
          ?? (studio.scenario ? 0 : null),
    },
  };
}

function riskLabel(risk: StudioAssistantResponse["risk"]) {
  if (risk === "R3") return "Confirmation required";
  if (risk === "R2") return "Review required";
  if (risk === "R1") return "Private draft";
  return "Read only";
}

function provenanceTime(value: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return null;
  return new Intl.DateTimeFormat("en-NG", { hour: "numeric", minute: "2-digit" }).format(date);
}

function AssistantBlock({ block }: { block: StudioAssistantBlock }) {
  if (block.kind === "answer") {
    return <div className="studio-ask-answer"><strong>{block.title}</strong><p>{block.body}</p></div>;
  }
  if (block.kind === "metrics") {
    return (
      <div aria-label="Studio summary" className="studio-ask-metrics">
        {block.items.map((item) => <Link href={item.href} key={item.label}><strong>{item.value}</strong><small>{item.label}</small></Link>)}
      </div>
    );
  }
  if (block.kind === "results") {
    return (
      <div className="studio-ask-results">
        <small>{block.title}</small>
        <div>{block.items.map((item) => (
          <Link href={item.href} key={item.id}>
            <span><strong>{item.label}</strong><small>{item.kind} · {item.detail}</small></span>
            {item.state ? <em>{item.state.replaceAll("_", " ")}</em> : null}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        ))}</div>
      </div>
    );
  }
  if (block.kind === "clarification") {
    return (
      <div className="studio-ask-clarification">
        <strong>{block.title}</strong><p>{block.body}</p>
        <div>{block.options.map((option) => <Link href={option.href} key={`${option.href}:${option.label}`}>{option.label}<ArrowRight aria-hidden="true" size={15} /></Link>)}</div>
      </div>
    );
  }
  if (block.kind === "handoff") {
    return (
      <div className="studio-ask-handoff">
        <small>{riskLabel(block.risk)}</small>
        <strong>{block.title}</strong>
        <p>{block.body}</p>
        <span>{block.consequence}</span>
        <Link className="button button-primary" href={block.action.href}>{block.action.label}<ArrowRight aria-hidden="true" size={15} /></Link>
      </div>
    );
  }
  return (
    <div className="studio-ask-recovery">
      <CircleAlert aria-hidden="true" size={19} />
      <div><strong>{block.title}</strong><p>{block.body}</p></div>
      <div>{block.actions.map((action) => <Link href={action.href} key={`${action.href}:${action.label}`}>{action.label}</Link>)}</div>
    </div>
  );
}

export function StudioAskSurface() {
  const studio = useStudio();
  const askCapability = studio.scenario
    ? "AVAILABLE"
    : studio.application.snapshot?.capabilities.find((capability) => capability.id === "ASK_READ")?.state ?? "UNAVAILABLE";
  const context = useMemo(() => buildContext(studio), [studio]);
  const [query, setQuery] = useState("");
  const [turns, setTurns] = useState<AskTurn[]>([]);
  const [restored, setRestored] = useState(false);
  const [restoreQueue, setRestoreQueue] = useState<string[] | null>(null);
  const timerRef = useRef<number | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const resolving = turns.some((turn) => turn.state === "resolving");

  useEffect(() => {
    setRestoreQueue(restoreQueries());
  }, []);

  useEffect(() => {
    if (restored || restoreQueue === null) return;
    if (!restoreQueue.length) {
      setRestored(true);
      setRestoreQueue(null);
      return;
    }
    const applicationSettled = Boolean(studio.scenario)
      || studio.application.status === "ready"
      || studio.application.status === "error";
    if (!applicationSettled) return;
    setTurns(restoreQueue.map((stored, index) => {
      try {
        return {
          id: `restored-${index}`,
          query: stored,
          response: resolveStudioAssistant(stored, context),
          state: "complete" as const,
        };
      } catch {
        return { id: `restored-${index}`, query: stored, state: "error" as const };
      }
    }));
    setRestored(true);
    setRestoreQueue(null);
  }, [context, restoreQueue, restored, studio.application.status, studio.scenario]);

  useEffect(() => {
    if (!restored) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [restored]);

  useEffect(() => {
    if (!restored) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(
        turns.filter((turn) => turn.state === "complete").map((turn) => turn.query).slice(-12),
      ));
    } catch {
      // A private browsing policy may disable session storage; chat remains usable.
    }
  }, [restored, turns]);

  useEffect(() => {
    if (!turns.length) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns]);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
  }, []);

  const submit = useCallback((requestedQuery: string) => {
    const cleanQuery = requestedQuery.trim();
    if (!cleanQuery || resolving) return;
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const pendingTurn: AskTurn = { id, query: cleanQuery, state: "resolving" };
    setQuery("");
    setTurns((current) => [...current, pendingTurn].slice(-12));
    timerRef.current = window.setTimeout(() => {
      try {
        const resolved = resolveStudioAssistant(cleanQuery, context);
        setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, response: resolved, state: "complete" } : turn));
      } catch {
        setTurns((current) => current.map((turn) => turn.id === id ? { ...turn, state: "error" } : turn));
      } finally {
        timerRef.current = null;
      }
    }, 180);
  }, [context, resolving]);

  function resetConversation() {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = null;
    setTurns([]);
    setQuery("");
    try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Keep the UI usable. */ }
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  if (!studio.scenario && (studio.application.status === "idle" || studio.application.status === "loading")) {
    return <div className="studio-loading" role="status">Opening Ask Studio…</div>;
  }

  if (askCapability === "UNAVAILABLE") {
    return (
      <section className="studio-ask-page">
        <div className="studio-quiet-empty" role="alert">
          <CircleAlert aria-hidden="true" size={22} />
          <div><strong>Ask Studio is unavailable</strong><p>No connected Studio source is available to answer safely.</p></div>
          <Link className="button button-secondary" href="/studio">Return home</Link>
        </div>
      </section>
    );
  }

  return (
    <section className="studio-ask-page">
      <div aria-live="polite" className="studio-ask-thread">
        {!turns.length ? (
          <div className="studio-ask-welcome">
            <Sparkles aria-hidden="true" size={24} />
            <h1>What needs doing?</h1>
            <div>{STARTERS.map((starter) => <button disabled={resolving} key={starter} onClick={() => submit(starter)} type="button">{starter}</button>)}</div>
          </div>
        ) : (
          <>
            <div className="studio-ask-session-tools">
              <button onClick={resetConversation} type="button"><RotateCcw aria-hidden="true" size={15} />New</button>
            </div>
            {turns.map((turn) => (
              <article className="studio-ask-turn" key={turn.id}>
                <p className="studio-ask-operator">{turn.query}</p>
                {turn.state === "resolving" ? (
                  <div className="studio-ask-resolving" role="status"><LoaderCircle aria-hidden="true" size={17} />Reading Studio</div>
                ) : turn.state === "error" ? (
                  <div className="studio-ask-error" role="alert">
                    <CircleAlert aria-hidden="true" size={18} />
                    <span><strong>Studio could not resolve that.</strong><small>Your request was not applied.</small></span>
                    <button onClick={() => submit(turn.query)} type="button">Try again</button>
                  </div>
                ) : turn.response ? (
                  <div className="studio-ask-response">
                    {turn.response.blocks.map((block, index) => <AssistantBlock block={block} key={`${turn.id}:${block.kind}:${index}`} />)}
                    <small className={`studio-ask-provenance is-${turn.response.provenance.status}`} title={turn.response.provenance.generatedAt ?? undefined}>
                      {turn.response.provenance.label} · {turn.response.provenance.detail}
                      {provenanceTime(turn.response.provenance.generatedAt) ? ` · ${provenanceTime(turn.response.provenance.generatedAt)}` : ""}
                    </small>
                  </div>
                ) : null}
              </article>
            ))}
          </>
        )}
        <div ref={endRef} />
      </div>

      <div className="studio-ask-composer-dock">
        <form
          className="studio-ask-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit(query);
          }}
        >
          <label>
            <span className="sr-only">Ask Studio</span>
            <textarea
              disabled={resolving}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                submit(query);
              }}
              placeholder="Ask about Studio or find a record"
              ref={inputRef}
              rows={1}
              value={query}
            />
          </label>
          <button aria-label="Send to Ask Studio" className="studio-ai-send" disabled={!query.trim() || resolving} type="submit">
            {resolving ? <LoaderCircle aria-hidden="true" size={18} /> : <ArrowRight aria-hidden="true" size={18} />}
          </button>
        </form>
        {askCapability === "READ_ONLY_COMPATIBILITY"
          ? <p>Service guidance only while connected records are unavailable.</p>
          : null}
      </div>
    </section>
  );
}
