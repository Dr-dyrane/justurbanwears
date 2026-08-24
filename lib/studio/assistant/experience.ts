export type StudioAssistantDocumentKind =
  | "Alert"
  | "Media"
  | "Model"
  | "Order"
  | "Piece"
  | "Service";

export type StudioAssistantIntent =
  | "CHANGE"
  | "CREATE"
  | "GO"
  | "ORCHESTRATE"
  | "RESOLVE"
  | "REVERSE"
  | "UNDERSTAND";

export type StudioAssistantRisk = "R0" | "R1" | "R2" | "R3";

export interface StudioAssistantDocument {
  detail: string;
  entityId?: string;
  href: string;
  id: string;
  identifiers: string[];
  kind: StudioAssistantDocumentKind;
  label: string;
  mediaTargetId?: string;
  state?: string;
  tokens: string;
}

export interface StudioAssistantSummary {
  attention: number | null;
  available: number | null;
  drafts: number | null;
  live: number | null;
  orders: number | null;
  review: number | null;
}

export interface StudioAssistantContext {
  documents: StudioAssistantDocument[];
  provenance: {
    detail: string;
    generatedAt: string | null;
    label: string;
    status: "connected" | "degraded" | "preview";
  };
  summary: StudioAssistantSummary;
}

export interface StudioAssistantAction {
  href: string;
  label: string;
}

export type StudioAssistantBlock =
  | {
      body: string;
      kind: "answer";
      title: string;
    }
  | {
      items: Array<{ href: string; label: string; value: number | string }>;
      kind: "metrics";
    }
  | {
      items: Array<{
        detail: string;
        href: string;
        id: string;
        kind: StudioAssistantDocumentKind;
        label: string;
        state?: string;
      }>;
      kind: "results";
      title: string;
    }
  | {
      body: string;
      kind: "clarification";
      options: StudioAssistantAction[];
      title: string;
    }
  | {
      action: StudioAssistantAction;
      body: string;
      consequence: string;
      kind: "handoff";
      risk: StudioAssistantRisk;
      title: string;
    }
  | {
      actions: StudioAssistantAction[];
      body: string;
      kind: "recovery";
      title: string;
    };

export interface StudioAssistantResponse {
  blocks: StudioAssistantBlock[];
  intent: StudioAssistantIntent;
  provenance: StudioAssistantContext["provenance"];
  risk: StudioAssistantRisk;
}

const STATUS_PATTERN = /\b(attention|brief|overview|summary|status|today|waiting|what(?:'s| is) happening)\b/i;
const CAPABILITY_PATTERN = /\b(help|what can you do|how can you help|capabilities)\b/i;
const PRICE_PATTERN = /\b(price|pricing)\b/i;
const PRICE_CHANGE_PATTERN = /\b(change|edit|set|update|raise|reduce|lower)\b/i;
const COLLECTION_PATTERN = /\b(drop|collection)\b/i;
const CREATE_PIECE_PATTERN = /\b(add|bring in|create|intake|new|register|upload)\b[\s\S]*\b(garment|piece|product|item|clothes|dress|shirt|skirt|set|trouser|knit)\b|\bintake\b/i;
const PUBLISH_PATTERN = /\b(go live|list|listing|publish|publication|shop preview|public)\b/i;
const MEDIA_PATTERN = /\b(atelier|generate|image|media|photo|render|shoot|try[ -]?on|wear)\b/i;
const MODEL_PATTERN = /\b(body canon|consent|face|identity|lulu|model|styling)\b/i;
const ORDER_PATTERN = /\b(customer|delivery|dispatch|fulfil|fulfill|order|payment|pickup|refund|return)\b/i;
const INVENTORY_PATTERN = /\b(available|hold|inventory|location|reserve|scan|stock|stocktake)\b/i;
const REVERSE_PATTERN = /\b(archive|cancel|delete|hide|remove|unpublish|withdraw)\b/i;
const NAVIGATE_PATTERN = /\b(find|go to|open|resume|show|take me|view|where)\b/i;
const UNDERSTAND_PATTERN = /\b(explain|how|why|what does|what is)\b/i;

export function normalizeStudioAssistantText(value: string) {
  return value.trim().toLocaleLowerCase("en-NG").replace(/\s+/g, " ");
}

function includesIdentifier(query: string, identifier: string) {
  const normalizedIdentifier = normalizeStudioAssistantText(identifier);
  if (!normalizedIdentifier) return false;
  return query === normalizedIdentifier
    || query.includes(` ${normalizedIdentifier} `)
    || query.startsWith(`${normalizedIdentifier} `)
    || query.endsWith(` ${normalizedIdentifier}`)
    || query.includes(normalizedIdentifier);
}

export function scoreStudioAssistantDocument(document: StudioAssistantDocument, rawQuery: string) {
  const query = normalizeStudioAssistantText(rawQuery);
  if (!query) return 0;
  const label = normalizeStudioAssistantText(document.label);
  const identifiers = document.identifiers.filter(Boolean);
  if (identifiers.some((identifier) => normalizeStudioAssistantText(identifier) === query)) return 180;
  if (identifiers.some((identifier) => includesIdentifier(query, identifier))) return 150;
  if (label === query) return 140;
  if (query.includes(label) || label.includes(query)) return 100;
  const words = query.split(/[^a-z0-9-]+/).filter((word) => word.length > 1);
  return words.reduce((score, word) => (
    score + (document.tokens.includes(word) ? 12 : 0)
  ), 0);
}

function rankedDocuments(context: StudioAssistantContext, query: string, kind?: StudioAssistantDocumentKind) {
  const kindPriority: Record<StudioAssistantDocumentKind, number> = {
    Piece: 6,
    Order: 5,
    Model: 4,
    Media: 3,
    Alert: 2,
    Service: 1,
  };
  return context.documents
    .filter((document) => !kind || document.kind === kind)
    .map((document) => ({ document, score: scoreStudioAssistantDocument(document, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || kindPriority[right.document.kind] - kindPriority[left.document.kind]
      || left.document.label.localeCompare(right.document.label));
}

function resultBlock(title: string, documents: StudioAssistantDocument[]): StudioAssistantBlock {
  return {
    items: documents.slice(0, 6).map((document) => ({
      detail: document.detail,
      href: document.href,
      id: document.id,
      kind: document.kind,
      label: document.label,
      state: document.state,
    })),
    kind: "results",
    title,
  };
}

function response(
  context: StudioAssistantContext,
  intent: StudioAssistantIntent,
  risk: StudioAssistantRisk,
  blocks: StudioAssistantBlock[],
): StudioAssistantResponse {
  return { blocks, intent, provenance: context.provenance, risk };
}

function exactTarget(context: StudioAssistantContext, query: string, kind?: StudioAssistantDocumentKind) {
  const ranked = rankedDocuments(context, query, kind);
  if (!ranked.length) return null;
  const first = ranked[0];
  if (first.score >= 150) return first.document;
  if (first.score >= 100 && (ranked.length === 1 || first.score > ranked[1].score)) return first.document;
  return null;
}

function pieceOptions(context: StudioAssistantContext, query: string) {
  const ranked = rankedDocuments(context, query, "Piece");
  if (ranked.length) return ranked.slice(0, 4).map(({ document }) => ({ href: document.href, label: document.label }));
  return [{ href: "/studio/wardrobe", label: "Choose in Wardrobe" }];
}

function targetedPieceHandoff(
  context: StudioAssistantContext,
  query: string,
  input: {
    actionHref(target: StudioAssistantDocument): string;
    actionLabel: string;
    body(target: StudioAssistantDocument): string;
    consequence: string;
    risk: StudioAssistantRisk;
    title: string;
  },
) {
  const target = exactTarget(context, query, "Piece");
  if (!target) {
    return response(context, "CHANGE", input.risk, [{
      body: "Name the piece or use its exact SKU so Studio can prepare the right workspace.",
      kind: "clarification",
      options: pieceOptions(context, query),
      title: "Which piece?",
    }]);
  }
  return response(context, "CHANGE", input.risk, [{
    action: { href: input.actionHref(target), label: input.actionLabel },
    body: input.body(target),
    consequence: input.consequence,
    kind: "handoff",
    risk: input.risk,
    title: input.title,
  }]);
}

function capabilityResponse(context: StudioAssistantContext) {
  return response(context, "UNDERSTAND", "R0", [
    {
      body: "Ask for the Studio summary, a known SKU or order, or an available service. Changes open the owning stack with its preview and confirmation intact.",
      kind: "answer",
      title: "Studio guide",
    },
    {
      items: [
        { detail: "Pieces, drafts, prices, drops", href: "/studio/wardrobe", id: "capability:wardrobe", kind: "Service", label: "Wardrobe" },
        { detail: "Product media and approved Wear", href: "/studio/media", id: "capability:atelier", kind: "Service", label: "Atelier" },
        { detail: "Payments, fulfilment, returns", href: "/studio/orders", id: "capability:orders", kind: "Service", label: "Orders" },
        { detail: "Attention, stock, holds, recovery", href: "/studio/operations", id: "capability:operations", kind: "Service", label: "Operations" },
      ],
      kind: "results",
      title: "Try a service",
    },
  ]);
}

export function resolveStudioAssistant(
  rawQuery: string,
  context: StudioAssistantContext,
): StudioAssistantResponse {
  const query = normalizeStudioAssistantText(rawQuery);
  if (!query) {
    return response(context, "RESOLVE", "R0", [{
      actions: [{ href: "/studio", label: "Studio Home" }],
      body: "Ask about a piece, order, model, image, stock state, or the next task.",
      kind: "recovery",
      title: "What should Studio resolve?",
    }]);
  }

  if (CAPABILITY_PATTERN.test(query)) return capabilityResponse(context);

  const anyExactTarget = exactTarget(context, query);
  if (STATUS_PATTERN.test(query) && (!anyExactTarget || anyExactTarget.kind === "Service")) {
    const { summary } = context;
    return response(context, "RESOLVE", "R0", [
      {
        body: summary.attention === null
          ? "Connected attention is unavailable. Local Wardrobe remains available."
          : summary.attention
          ? `${summary.attention} item${summary.attention === 1 ? "" : "s"} need attention. Start there, or open any current state below.`
          : "Nothing urgent is projected. Open any current state below.",
        kind: "answer",
        title: "Studio now",
      },
      {
        items: [
          { href: "/studio/operations", label: "Attention", value: summary.attention ?? "—" },
          { href: "/studio/operations?view=inventory", label: "Available", value: summary.available ?? "—" },
          { href: "/studio/wardrobe?view=publishing", label: "Live", value: summary.live ?? "—" },
          { href: "/studio/orders", label: "Orders", value: summary.orders ?? "—" },
        ],
        kind: "metrics",
      },
      ...(summary.review ? [{
        items: [
          { detail: `${summary.review} media item${summary.review === 1 ? "" : "s"} awaiting a decision`, href: "/studio/media", id: "review:media", kind: "Media" as const, label: "Review Atelier" },
          ...(summary.drafts ? [{ detail: `${summary.drafts} private draft${summary.drafts === 1 ? "" : "s"}`, href: "/studio/wardrobe?collection=private", id: "review:drafts", kind: "Piece" as const, label: "Finish drafts" }] : []),
        ],
        kind: "results" as const,
        title: "Next",
      }] : []),
    ]);
  }

  if (CREATE_PIECE_PATTERN.test(query)) {
    return response(context, "CREATE", "R1", [{
      action: { href: "/studio/wardrobe?intake=1", label: "Start intake" },
      body: "Wardrobe will collect the minimum garment truth first, then disclose media and publication steps when they are needed.",
      consequence: "Nothing is created until intake is saved.",
      kind: "handoff",
      risk: "R1",
      title: "Add a piece",
    }]);
  }

  if (PRICE_PATTERN.test(query) && PRICE_CHANGE_PATTERN.test(query)) {
    return targetedPieceHandoff(context, query, {
      actionHref: (target) => `${target.href}${target.href.includes("?") ? "&" : "?"}action=price#garment-lifecycle`,
      actionLabel: "Review price",
      body: (target) => `Open ${target.label} with its current price and the exact change preview.`,
      consequence: "The price stays unchanged until you confirm in Wardrobe.",
      risk: "R2",
      title: "Change price",
    });
  }

  if (COLLECTION_PATTERN.test(query) && /\b(change|choose|move|set|switch)\b/i.test(query)) {
    return response(context, "CHANGE", "R2", [{
      action: { href: "/studio/wardrobe?collection=choose", label: "Choose collection" },
      body: "Open collection scope, then choose the piece and review its destination. Studio does not infer a drop from chat text.",
      consequence: "No public listing or garment record changes from this handoff.",
      kind: "handoff",
      risk: "R2",
      title: "Switch collection",
    }]);
  }

  if (PUBLISH_PATTERN.test(query)) {
    const target = exactTarget(context, query, "Piece");
    return response(context, "CHANGE", "R3", [{
      action: {
        href: target
          ? `/studio/wardrobe?view=publishing&garment=${encodeURIComponent(target.entityId ?? target.id.replace(/^piece:/, ""))}`
          : "/studio/wardrobe?view=publishing",
        label: "Review Shop",
      },
      body: target
        ? `Review ${target.label} against its approved public photos, price, copy, and availability.`
        : "Review publication readiness, customer-facing copy, media, price, and availability.",
      consequence: "Nothing goes live until the Shop publication confirmation succeeds.",
      kind: "handoff",
      risk: "R3",
      title: target ? `Publish ${target.label}` : "Review Shop",
    }]);
  }

  if (REVERSE_PATTERN.test(query)) {
    const target = exactTarget(context, query);
    return response(context, "REVERSE", "R3", [{
      action: { href: target?.href ?? "/studio/operations", label: target ? "Review record" : "Review impact" },
      body: target
        ? `Open ${target.label} and inspect its connected listing, stock, order, and media consequences.`
        : "Choose the exact record in its owning stack before any destructive action is prepared.",
      consequence: "Ask Studio will never delete, archive, cancel, or unpublish from an ambiguous message.",
      kind: "handoff",
      risk: "R3",
      title: "Review before reversing",
    }]);
  }

  if (MEDIA_PATTERN.test(query)) {
    const target = exactTarget(context, query, "Piece");
    if (target && !target.mediaTargetId) {
      return response(context, "CREATE", "R2", [{
        action: { href: target.href, label: "Connect piece" },
        body: `${target.label} does not yet have the connected Wardrobe authority Atelier needs.`,
        consequence: "Atelier will not select or generate for a different garment.",
        kind: "handoff",
        risk: "R2",
        title: "Connect garment authority",
      }]);
    }
    return response(context, "CREATE", "R2", [{
      action: {
        href: target ? `/studio/media/new?garment=${encodeURIComponent(target.mediaTargetId!)}` : "/studio/media",
        label: target ? "Prepare media" : "Open Atelier",
      },
      body: target
        ? `Atelier will load ${target.label} and preserve its garment, identity, and view authorities.`
        : "Open Atelier to resume a run, review media, or choose a garment for a new operation.",
      consequence: "Generation begins only after the Atelier operation preview is complete.",
      kind: "handoff",
      risk: "R2",
      title: target ? `Create for ${target.label}` : "Atelier",
    }]);
  }

  if (MODEL_PATTERN.test(query)) {
    const modelMatches = rankedDocuments(context, query, "Model").map(({ document }) => document);
    return response(context, UNDERSTAND_PATTERN.test(query) ? "UNDERSTAND" : "GO", "R0", modelMatches.length
      ? [resultBlock("Approved model authority", modelMatches)]
      : [{
          action: { href: "/studio/models", label: "Open Models" },
          body: "Review the approved identity, consent, body canon, and styling authority.",
          consequence: "Model authority remains read-only until its own guarded workflow is opened.",
          kind: "handoff",
          risk: "R0",
          title: "Models",
        }]);
  }

  if (ORDER_PATTERN.test(query)) {
    const orderMatches = rankedDocuments(context, query, "Order").map(({ document }) => document);
    if (orderMatches.length) return response(context, "RESOLVE", "R0", [resultBlock("Orders", orderMatches)]);
    const isReturn = /\b(refund|return)\b/i.test(query);
    return response(context, "GO", "R0", [{
      action: { href: isReturn ? "/studio/orders?filter=RETURNS" : "/studio/orders", label: isReturn ? "Review returns" : "Open orders" },
      body: isReturn ? "See requested returns, evidence, and the next allowed transition." : "See payment, fulfilment, delivery, and active next actions.",
      consequence: "Order changes still require the order workspace receipt flow.",
      kind: "handoff",
      risk: "R0",
      title: isReturn ? "Returns" : "Orders",
    }]);
  }

  if (INVENTORY_PATTERN.test(query)) {
    const pieceMatches = rankedDocuments(context, query, "Piece").map(({ document }) => document);
    if (pieceMatches.length && anyExactTarget) return response(context, "RESOLVE", "R0", [resultBlock("Inventory record", pieceMatches)]);
    return response(context, "GO", "R0", [{
      action: { href: /\bhold|reserve\b/i.test(query) ? "/studio/operations?view=holds" : "/studio/operations?view=inventory", label: "Open inventory" },
      body: "Review availability, custody, locations, holds, and physical stock from connected Studio truth.",
      consequence: "Any hold or movement opens its own preview and receipt flow.",
      kind: "handoff",
      risk: "R0",
      title: "Inventory",
    }]);
  }

  const ranked = rankedDocuments(context, query);
  if (anyExactTarget) {
    return response(context, UNDERSTAND_PATTERN.test(query) ? "UNDERSTAND" : "RESOLVE", "R0", [
      {
        body: anyExactTarget.detail,
        kind: "answer",
        title: anyExactTarget.label,
      },
      resultBlock("Open record", [anyExactTarget]),
    ]);
  }

  if (ranked.length) {
    const topScore = ranked[0].score;
    const closeMatches = ranked.filter(({ score }) => score >= Math.max(12, topScore - 12)).map(({ document }) => document);
    return response(context, NAVIGATE_PATTERN.test(query) ? "GO" : "RESOLVE", "R0", [
      resultBlock(closeMatches.length > 1 ? "Best matches" : "Found", closeMatches),
    ]);
  }

  return response(context, "ORCHESTRATE", "R0", [{
    actions: [
      { href: "/studio/wardrobe", label: "Wardrobe" },
      { href: "/studio/media", label: "Atelier" },
      { href: "/studio/orders", label: "Orders" },
      { href: "/studio/operations", label: "Operations" },
    ],
    body: "Use an exact SKU or order reference, or name the service and outcome. Ask Studio will clarify before it prepares a connected change.",
    kind: "recovery",
    title: "I could not resolve that safely",
  }]);
}
