export type StudioAssistantDocumentKind =
  | "Alert"
  | "Collection"
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
  continueAction?: StudioAssistantAction | null;
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

export interface StudioAssistantPromptSuggestion {
  id: string;
  label: string;
  prompt: string;
}

export interface StudioAssistantTaskStep {
  id: string;
  label: string;
}

/**
 * A task draft is a device-private plan, never an executable Studio command.
 * The action always hands the operator to the owning domain workflow where
 * current truth, preview, confirmation and receipts remain authoritative.
 */
export interface StudioAssistantTaskDraft {
  action: StudioAssistantAction;
  consequence: string;
  id: string;
  objective: string;
  requiresOwningWorkflowConfirmation: true;
  risk: StudioAssistantRisk;
  schemaVersion: "studio-assistant-task/v1";
  sourceQuery: string;
  state: "PROPOSED";
  steps: StudioAssistantTaskStep[];
  storage: "DEVICE_PRIVATE";
  title: string;
}

export interface StudioAssistantWorkflowResponse {
  response: StudioAssistantResponse;
  schemaVersion: "studio-assistant-workflow/v1";
  suggestions: StudioAssistantPromptSuggestion[];
  taskDraft: StudioAssistantTaskDraft | null;
}

const STATUS_PATTERN = /\b(attention|brief|overview|summary|status|today|waiting|what(?:'s| is) happening)\b/i;
const CAPABILITY_PATTERN = /\b(help|what can you do|how can you help|capabilities)\b/i;
const PRICE_PATTERN = /\b(price|pricing)\b/i;
const PRICE_CHANGE_PATTERN = /\b(change|edit|set|update|raise|reduce|lower)\b/i;
const COLLECTION_PATTERN = /\b(drop|collection)\b/i;
const CREATE_COLLECTION_PATTERN = /\b(add|create|new|start)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(add|create|new|start)\b/i;
const RENAME_COLLECTION_PATTERN = /\b(rename)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(rename)\b/i;
const ACTIVATE_COLLECTION_PATTERN = /\b(activate|launch|make live)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(activate|launch|make live)\b/i;
const ARCHIVE_COLLECTION_PATTERN = /\b(archive)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(archive)\b/i;
const CREATE_PIECE_PATTERN = /\b(add|bring in|create|intake|new|register|upload)\b[\s\S]*\b(garment|piece|product|item|clothes|dress|shirt|skirt|set|trouser|knit)\b|\bintake\b/i;
const PUBLISH_PATTERN = /\b(go live|list|listing|publish|publication|shop preview|public)\b/i;
const MEDIA_PATTERN = /\b(atelier|generate|image|media|photo|render|shoot|try[ -]?on|wear)\b/i;
const MODEL_PATTERN = /\b(body canon|consent|face|identity|lulu|model|styling)\b/i;
const ORDER_PATTERN = /\b(customer|delivery|dispatch|fulfil|fulfill|order|payment|pickup|refund|return)\b/i;
const INVENTORY_PATTERN = /\b(available|hold|inventory|location|reserve|scan|stock|stocktake)\b/i;
const REVERSE_PATTERN = /\b(archive|cancel|delete|hide|remove|unpublish|withdraw)\b/i;
const NAVIGATE_PATTERN = /\b(find|go to|open|resume|show|take me|view|where)\b/i;
const UNDERSTAND_PATTERN = /\b(explain|how|why|what does|what is)\b/i;
const ASK_MEDIA_MUTATION_BOUNDARY = "Ask only opens Media. The current flow keeps new model generation unavailable until private-identity provider-retention consent is verified; no generation starts from this handoff.";
const ASK_ORDER_MUTATION_BOUNDARY = "Ask only opens Orders. It cannot create a payment reservation; checkout must first show configured payment details, and no stock is reserved from this handoff.";

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
    Collection: 5,
    Order: 4,
    Model: 3,
    Media: 2,
    Alert: 1,
    Service: 0,
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

function collectionOptions(context: StudioAssistantContext, query: string) {
  const ranked = rankedDocuments(context, query, "Collection");
  const scenario = context.provenance.status === "preview" ? "&scenario=lifecycle" : "";
  if (ranked.length) return ranked.slice(0, 4).map(({ document }) => ({
    href: `/studio/wardrobe?collection=choose&dropAction=manage&dropId=${encodeURIComponent(document.entityId ?? "")}${scenario}`,
    label: document.label,
  }));
  return [{ href: `/studio/wardrobe?collection=choose${scenario}`, label: "Browse drops" }];
}

function collectionHandoff(
  context: StudioAssistantContext,
  query: string,
  input: { actionLabel: string; body: string; consequence: string; risk: StudioAssistantRisk; title: string },
) {
  const target = exactTarget(context, query, "Collection");
  if (!target) return response(context, "CHANGE", input.risk, [{
    body: "Choose the exact drop before Studio prepares the change.",
    kind: "clarification",
    options: collectionOptions(context, query),
    title: "Which drop?",
  }]);
  const scenario = context.provenance.status === "preview" ? "&scenario=lifecycle" : "";
  return response(context, "CHANGE", input.risk, [{
    action: {
      href: `/studio/wardrobe?collection=choose&dropAction=manage&dropId=${encodeURIComponent(target.entityId ?? "")}${scenario}`,
      label: input.actionLabel,
    },
    body: input.body,
    consequence: input.consequence,
    kind: "handoff",
    risk: input.risk,
    title: input.title,
  }]);
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
  if (target.state === "SOLD_OUT" || target.state === "ARCHIVED_DRAFT") {
    return historicalPieceResponse(context, target);
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

function historicalPieceResponse(
  context: StudioAssistantContext,
  target: StudioAssistantDocument,
) {
  const soldOut = target.state === "SOLD_OUT";
  return response(context, "RESOLVE", "R0", [
    {
      body: soldOut
        ? `${target.label} is closed with Drop 01 and is not active Shop work.`
        : `${target.label} is an unfinished Drop 01 test piece kept only as an archived draft.`,
      kind: "answer",
      title: soldOut ? "Sold out history" : "Archived draft",
    },
    resultBlock("Drop 01 history", [target]),
  ]);
}

function capabilityResponse(context: StudioAssistantContext) {
  return response(context, "UNDERSTAND", "R0", [
    {
      body: "Ask provides connected guidance and navigation. It does not execute a mutation or prove that an owning workflow is ready.",
      kind: "answer",
      title: "Studio guide",
    },
    {
      items: [
        { detail: "Pieces, drafts, prices, drops", href: "/studio/wardrobe", id: "capability:wardrobe", kind: "Service", label: "Wardrobe" },
        { detail: "Review media · Ask cannot start model generation", href: "/studio/media", id: "capability:atelier", kind: "Service", label: "Atelier" },
        { detail: "Review existing orders · Ask cannot reserve payment or stock", href: "/studio/orders", id: "capability:orders", kind: "Service", label: "Orders" },
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
      ...(context.continueAction ? [{
        action: context.continueAction,
        body: "Resume the highest-priority open Studio work from its owning workspace.",
        consequence: "Opening the workspace does not apply a change.",
        kind: "handoff" as const,
        risk: "R0" as const,
        title: "Continue next",
      }] : []),
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

  if (CREATE_COLLECTION_PATTERN.test(query)) {
    const scenario = context.provenance.status === "preview" ? "&scenario=lifecycle" : "";
    return response(context, "CREATE", "R1", [{
      action: { href: `/studio/wardrobe?collection=choose&dropAction=create${scenario}`, label: "Name drop" },
      body: "Name the drop, review the draft, then confirm it.",
      consequence: "The new drop stays private until it is activated.",
      kind: "handoff",
      risk: "R1",
      title: "New drop",
    }]);
  }

  if (RENAME_COLLECTION_PATTERN.test(query)) {
    return collectionHandoff(context, query, {
      actionLabel: "Review rename",
      body: "Open the selected drop and prepare its new Studio name.",
      consequence: "The name changes only after preview and confirmation.",
      risk: "R2",
      title: "Rename drop",
    });
  }

  if (ACTIVATE_COLLECTION_PATTERN.test(query)) {
    return collectionHandoff(context, query, {
      actionLabel: "Review activation",
      body: "Open the selected draft and review the active-drop handover.",
      consequence: "Activation requires confirmation and returns a durable receipt.",
      risk: "R3",
      title: "Activate drop",
    });
  }

  if (ARCHIVE_COLLECTION_PATTERN.test(query)) {
    return collectionHandoff(context, query, {
      actionLabel: "Review archive",
      body: "Open the selected drop and review what leaves active Studio work.",
      consequence: "History remains available; the archive happens only after confirmation.",
      risk: "R3",
      title: "Archive drop",
    });
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
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    return response(context, "CHANGE", "R3", [{
      action: {
        href: target ? target.href : "/studio/wardrobe?view=publishing",
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
    if (target?.kind === "Piece" && (target.state === "SOLD_OUT" || target.state === "ARCHIVED_DRAFT")) {
      return historicalPieceResponse(context, target);
    }
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
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
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
        label: target ? "Open garment media" : "Open Media",
      },
      body: target
        ? `Media will load ${target.label} so its connected garment authority can be reviewed without selecting another piece.`
        : "Open Media to review existing work or choose a garment. The owning flow shows what is actually available.",
      consequence: ASK_MEDIA_MUTATION_BOUNDARY,
      kind: "handoff",
      risk: "R2",
      title: target ? `Media for ${target.label}` : "Media",
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
      body: isReturn ? "Review requested returns, evidence, and the next allowed transition." : "Review existing payment evidence, fulfilment, delivery, and active next actions.",
      consequence: isReturn
        ? "Ask only opens Returns. Any change still requires the order workspace receipt flow."
        : ASK_ORDER_MUTATION_BOUNDARY,
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

function stableAssistantId(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

function safeStudioAction(action: StudioAssistantAction) {
  try {
    const origin = "https://studio.invalid";
    const parsed = new URL(action.href, origin);
    const canonical = `${parsed.pathname}${parsed.search}${parsed.hash}`;
    return parsed.origin === origin
      && canonical === action.href
      && (parsed.pathname === "/studio" || parsed.pathname.startsWith("/studio/"));
  } catch {
    return false;
  }
}

function taskDraftForResponse(rawQuery: string, assistantResponse: StudioAssistantResponse) {
  const handoff = assistantResponse.blocks.find((block) => block.kind === "handoff");
  if (!handoff || handoff.risk === "R0" || !safeStudioAction(handoff.action)) return null;

  const stableSeed = [handoff.title, handoff.action.href, handoff.risk].join("|");
  const confirmationStep = handoff.risk === "R1"
    ? "Save the private draft only when its details are ready"
    : "Review the consequence and confirm only in the owning workflow";
  return {
    action: handoff.action,
    consequence: handoff.consequence,
    id: `studio-task-${stableAssistantId(stableSeed)}`,
    objective: handoff.body,
    requiresOwningWorkflowConfirmation: true,
    risk: handoff.risk,
    schemaVersion: "studio-assistant-task/v1",
    sourceQuery: rawQuery.trim(),
    state: "PROPOSED",
    steps: [
      { id: "open", label: `Open ${handoff.action.label.toLocaleLowerCase("en-NG")}` },
      { id: "verify", label: "Verify the exact record and current Studio state" },
      { id: "confirm", label: confirmationStep },
    ],
    storage: "DEVICE_PRIVATE",
    title: handoff.title,
  } satisfies StudioAssistantTaskDraft;
}

function promptSuggestions(
  assistantResponse: StudioAssistantResponse,
  taskDraft: StudioAssistantTaskDraft | null,
): StudioAssistantPromptSuggestion[] {
  const hasClarification = assistantResponse.blocks.some((block) => block.kind === "clarification");
  const suggestions = hasClarification
    ? [
        { label: "Show matching pieces", prompt: "Show the matching pieces" },
        { label: "Explain the safe next step", prompt: "Explain the safe next step" },
      ]
    : assistantResponse.intent === "CREATE"
      ? [
          { label: "Check blockers", prompt: "What could block this task?" },
          { label: "Show current priorities", prompt: "What needs attention?" },
          { label: "Explain the workflow", prompt: "Explain how this Studio workflow works" },
        ]
      : assistantResponse.intent === "CHANGE" || assistantResponse.intent === "REVERSE"
        ? [
            { label: "Check impact", prompt: "What should I verify before this change?" },
            { label: "Show current priorities", prompt: "What needs attention?" },
          ]
        : assistantResponse.intent === "RESOLVE"
          ? [
              { label: "Choose the next task", prompt: "What should I work on first?" },
              { label: "Show private drafts", prompt: "Show private Wardrobe drafts" },
              { label: "Review orders", prompt: "Show orders that need attention" },
            ]
          : [
              { label: "Show current priorities", prompt: "What needs attention?" },
              { label: "Find a record", prompt: "Help me find a Studio record" },
              { label: "Show capabilities", prompt: "What can you help with?" },
            ];

  return suggestions.slice(0, taskDraft ? 3 : 2).map((suggestion) => ({
    ...suggestion,
    id: `studio-suggestion-${stableAssistantId(`${assistantResponse.intent}|${suggestion.prompt}`)}`,
  }));
}

export function resolveStudioAssistantWorkflow(
  rawQuery: string,
  context: StudioAssistantContext,
): StudioAssistantWorkflowResponse {
  const assistantResponse = resolveStudioAssistant(rawQuery, context);
  const taskDraft = taskDraftForResponse(rawQuery, assistantResponse);
  return {
    response: assistantResponse,
    schemaVersion: "studio-assistant-workflow/v1",
    suggestions: promptSuggestions(assistantResponse, taskDraft),
    taskDraft,
  };
}

export function studioAssistantFallbackText(workflow: StudioAssistantWorkflowResponse) {
  const block = workflow.response.blocks.find((candidate) => (
    candidate.kind === "answer"
    || candidate.kind === "clarification"
    || candidate.kind === "handoff"
    || candidate.kind === "recovery"
  ));
  if (!block) return "I found the relevant Studio records below. Choose one to continue safely.";
  if (block.kind === "answer") return `**${block.title}**\n\n${block.body}`;
  if (block.kind === "clarification") return `**${block.title}**\n\n${block.body}`;
  if (block.kind === "handoff") return `**${block.title}**\n\n${block.body} ${block.consequence}`;
  return `**${block.title}**\n\n${block.body}`;
}
