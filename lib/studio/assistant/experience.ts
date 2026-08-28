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

export type StudioAssistantCapabilityState =
  | "AVAILABLE"
  | "READ_ONLY_COMPATIBILITY"
  | "UNAVAILABLE";

export interface StudioAssistantCapability {
  id:
    | "PROJECTION"
    | "SEARCH"
    | "ASK_READ"
    | "WARDROBE_READ"
    | "WARDROBE_WRITE"
    | "ORDERS_READ"
    | "ORDERS_CREATE"
    | "ORDERS_WRITE"
    | "MODELS_READ"
    | "MODELS_WRITE"
    | "MEDIA_READ"
    | "MEDIA_WRITE"
    | "OPERATIONS_READ"
    | "HOLDS_WRITE"
    | "LOCATIONS_WRITE"
    | "OPERATIONS_WRITE"
    | "COLLECTIONS_READ"
    | "COLLECTIONS_WRITE";
  state: StudioAssistantCapabilityState;
}

export interface StudioAssistantDocument {
  availableActions?: Array<
    | "CREATE_HOLD"
    | "RELEASE_HOLD"
    | "CREATE_ORDER"
    | "CANCEL_ORDER"
    | "REFUND_ORDER"
    | "ADVANCE_ORDER"
    | "UPDATE_LOCATION"
  >;
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
  capabilities: StudioAssistantCapability[];
  continueAction?: StudioAssistantAction | null;
  documents: StudioAssistantDocument[];
  provenance: {
    detail: string;
    generatedAt: string | null;
    label: string;
    scenario?: string;
    status: "connected" | "degraded" | "preview";
  };
  summary: StudioAssistantSummary;
}

export interface StudioAssistantAction {
  href: string;
  label: string;
  prompt?: string;
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

export type StudioAssistantSuggestionFamily =
  | "BLOCKERS"
  | "CAPABILITIES"
  | "GENERAL"
  | "IMPACT"
  | "ORDERS"
  | "PRIORITIES"
  | "PRIVATE_DRAFTS"
  | "SAFE_NEXT"
  | "WORKFLOW";

export function studioAssistantSuggestionFamily(prompt: string): StudioAssistantSuggestionFamily {
  if (prompt === "What needs attention?") return "PRIORITIES";
  if (prompt === "Show private Wardrobe drafts") return "PRIVATE_DRAFTS";
  if (prompt === "Open orders requiring action") return "ORDERS";
  if (prompt === "What can you help with?") return "CAPABILITIES";
  if (prompt.startsWith("Check blockers for: ")) return "BLOCKERS";
  if (prompt.startsWith("Check impact for: ")) return "IMPACT";
  if (prompt.startsWith("Explain the workflow for: ")) return "WORKFLOW";
  if (prompt.startsWith("Explain the safe next step for: ")) return "SAFE_NEXT";
  return "GENERAL";
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
const CAPABILITY_PATTERN = /^(?:help|help me|what can you (?:do|help with)|how can you help|capabilities|show capabilities)[?.!\s]*$/i;
const PRICE_PATTERN = /\b(price|pricing)\b/i;
const PRICE_CHANGE_PATTERN = /\b(change|edit|set|update|raise|reduce|lower)\b/i;
const COLLECTION_PATTERN = /\b(drop|collection)\b/i;
const CREATE_ORDER_PATTERN = /\b(create|new)\b[\s\S]*\b(customer\s+)?order\b|\b(customer\s+)?order\b[\s\S]*\b(create|new)\b|\b(prepare|start)\b[\s\S]*\bcustomer\s+order\b|\bcustomer\s+order\b[\s\S]*\b(prepare|start)\b|\breserve\b[\s\S]*\border\b|\border\b[\s\S]*\breserve\b/i;
const CREATE_COLLECTION_PATTERN = /\b(add|create|new|start)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(add|create|new|start)\b/i;
const RENAME_COLLECTION_PATTERN = /\b(rename)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(rename)\b/i;
const ACTIVATE_COLLECTION_PATTERN = /\b(activate|launch|make live)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(activate|launch|make live)\b/i;
const ARCHIVE_COLLECTION_PATTERN = /\b(archive)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(archive)\b/i;
const COLLECTION_ASSIGNMENT_PATTERN = /\b(add|assign|change|move|put|release|remove|set|switch|transfer)\b[\s\S]*\b(drop|collection)\b|\b(drop|collection)\b[\s\S]*\b(add|assign|change|move|put|release|remove|set|switch|transfer)\b/i;
const CREATE_PIECE_PATTERN = /\b(add|bring in|create|intake|register|upload)\b[\s\S]*\b(garment|piece|product|item|clothes|dress|shirt|skirt|set|trouser|knit)\b|\bintake\b/i;
const PUBLICATION_PATTERN = /\b(go live|list|listing|publish|publication|shop preview|public)\b/i;
const PUBLISH_MUTATION_PATTERN = /\b(go live|make public|publish)\b|\blist(?:ing)?\b[\s\S]*\bfor sale\b/i;
const MEDIA_PATTERN = /\b(atelier|catalogue|generate|image|images|media|photo|photos|render|shoot|shot|shots|try[ -]?on|wear)\b/i;
const MEDIA_VIEW_PATTERN = /\b(add|create|generate|prepare|render|shoot|upload)\b[\s\S]*\b(back|detail|front|master|profile|view(?:\s*0?[1-7])?)\b/i;
const MEDIA_CREATE_PATTERN = /\b(add|create|generate|prepare|render|shoot|upload)\b/i;
const MODEL_PATTERN = /\b(body canon|consent|face|identity|lulu|model|styling)\b/i;
const MODEL_MUTATION_PATTERN = /\b(add|change|create|edit|remove|replace|update)\b/i;
const ORDER_PATTERN = /\b(customer|delivery|dispatch|fulfil|fulfill|order|payment|pickup|refund|return)\b/i;
const ORDER_SPECIFIC_PATTERN = /\b(customer|delivery|dispatch|fulfil|fulfill|payment|pickup|refund|return)\b/i;
const ORDER_WORKFLOW_PATTERN = /\border\b|\b(?:ord|order)-[a-z0-9-]+\b/i;
const INVENTORY_PATTERN = /\b(available|hold|inventory|location|reserve|scan|stock|stocktake)\b/i;
const HOLD_PATTERN = /\b(hold|reserve|reservation)\b/i;
const HOLD_RELEASE_PATTERN = /\b(cancel|release|remove)\b[\s\S]*\b(hold|reservation)\b|\b(hold|reservation)\b[\s\S]*\b(cancel|release|remove)\b/i;
const HOLD_READ_PATTERN = /\b(active|check|current|existing|find|has|have|open|review|show|status|view)\b/i;
const REVERSE_PATTERN = /\b(archive|cancel|delete|hide|refund|release|remove|unpublish|withdraw)\b/i;
const ORDER_REVERSAL_PATTERN = /(?:\b(cancel|refund|reverse|void)\b[\s\S]*\border\b|\border\b[\s\S]*\b(cancel|refund|reverse|void)\b|\b(cancel|refund|reverse|void)\b[\s\S]*\b(?:ord|order)-[a-z0-9-]+\b)/i;
const ORDER_ADVANCE_PATTERN = /\b(advance|approve|confirm|correct|dispatch|fulfil|fulfill|mark|prepare|process|progress|receive|reschedule|resolve|schedule|send)\b/i;
const LOCATION_MUTATION_PATTERN = /(?:\b(confirm|move|record|set|update)\b[\s\S]*\b(location|rail|shelf|return inspection)\b|\b(location|rail|shelf|return inspection)\b[\s\S]*\b(confirm|move|record|set|update)\b)/i;
const WARDROBE_FIELD_PATTERN = /\b(category|colour|color|copy|description|measurement|measurements|price|pricing|size|title)\b/i;
const NAVIGATE_PATTERN = /\b(find|go to|open|resume|review|show|take me|view|where)\b/i;
const UNDERSTAND_PATTERN = /\b(explain|how|why|what does|what is)\b/i;
const ASK_MEDIA_MUTATION_BOUNDARY = "Ask only opens Media. The current flow keeps new model generation unavailable until private-identity provider-retention consent is verified; no generation starts from this handoff.";
const ASK_ORDER_MUTATION_BOUNDARY = "Ask only opens Orders. It cannot create a payment reservation; checkout must first show configured payment details, and no stock is reserved from this handoff.";
const ASSISTANT_SEARCH_STOP_WORDS = new Set([
  "a", "an", "and", "before", "change", "check", "create", "edit", "explain",
  "find", "for", "i", "in", "lower", "new", "of", "open", "please", "price",
  "pricing", "raise", "reduce", "review", "safe", "set", "show", "step", "task",
  "the", "this", "to", "update", "what", "which", "with",
]);

export function normalizeStudioAssistantText(value: string) {
  return value.trim().toLocaleLowerCase("en-NG").replace(/\s+/g, " ");
}

function includesIdentifier(query: string, identifier: string) {
  const normalizedIdentifier = normalizeStudioAssistantText(identifier);
  if (!normalizedIdentifier) return false;
  const escaped = normalizedIdentifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?:^|[^a-z0-9-])${escaped}(?=$|[^a-z0-9-])`).test(query);
}

export function scoreStudioAssistantDocument(document: StudioAssistantDocument, rawQuery: string) {
  const query = normalizeStudioAssistantText(rawQuery);
  if (!query) return 0;
  const label = normalizeStudioAssistantText(document.label);
  const identifiers = document.identifiers.filter(Boolean);
  if (identifiers.some((identifier) => normalizeStudioAssistantText(identifier) === query)) return 180;
  if (identifiers.some((identifier) => includesIdentifier(query, identifier))) return 150;
  if (label === query) return 140;
  if (includesIdentifier(query, label) || label.includes(query)) return 100;
  const tokenWords = new Set(document.tokens.split(/[^a-z0-9-]+/).filter(Boolean));
  const words = query
    .split(/[^a-z0-9-]+/)
    .filter((word) => word.length > 1 && !ASSISTANT_SEARCH_STOP_WORDS.has(word));
  return words.reduce((score, word) => (
    score + (tokenWords.has(word) ? 12 : 0)
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
  const seen = new Set<string>();
  return context.documents
    .filter((document) => !kind || document.kind === kind)
    .map((document) => ({ document, score: scoreStudioAssistantDocument(document, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score
      || kindPriority[right.document.kind] - kindPriority[left.document.kind]
      || left.document.label.localeCompare(right.document.label))
    .filter(({ document }) => {
      const key = document.kind === "Piece"
        ? `${document.kind}:${document.href}`
        : document.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
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
  return {
    blocks: blocks.map((block) => preservePreviewBlock(context, block)),
    intent,
    provenance: context.provenance,
    risk,
  };
}

function exactTarget(context: StudioAssistantContext, query: string, kind?: StudioAssistantDocumentKind) {
  const ranked = rankedDocuments(context, query, kind);
  if (!ranked.length) return null;
  const first = ranked[0];
  if (first.score >= 150) return first.document;
  if (first.score >= 100 && (ranked.length === 1 || first.score > ranked[1].score)) return first.document;
  return null;
}

function exactOrderReferenceTarget(context: StudioAssistantContext, query: string) {
  return context.documents.find((document) => document.kind === "Order" && [
    document.entityId,
    document.id.startsWith("order:") ? document.id.slice("order:".length) : document.id,
  ].some((identifier) => identifier ? includesIdentifier(query, identifier) : false)) ?? null;
}

function exactMediaReferenceTarget(context: StudioAssistantContext, query: string) {
  return context.documents.find((document) => document.kind === "Media" && [
    document.entityId,
    document.id.startsWith("media:") ? document.id.slice("media:".length) : document.id,
  ].some((identifier) => identifier ? includesIdentifier(query, identifier) : false)) ?? null;
}

function explicitOrderReference(query: string) {
  const match = /\border\s+([a-z0-9-]{3,})\b/i.exec(query);
  const direct = /\b(?:scenario-order|order|ord)-[a-z0-9-]+\b/i.exec(query);
  const candidate = match?.[1] ?? direct?.[0] ?? "";
  return /[\d-]/.test(candidate) && !/^juw-/i.test(candidate) ? candidate : null;
}

function explicitPieceReference(query: string) {
  return /\bjuw-[a-z0-9-]+\b/i.exec(query)?.[0].toUpperCase() ?? null;
}

function preferredPromptIdentifier(document: StudioAssistantDocument) {
  return document.identifiers.find((identifier) => /^JUW-[A-Z0-9-]+$/i.test(identifier))
    ?? document.identifiers.find((identifier) => (
      identifier !== document.id
      && identifier !== document.entityId
      && !identifier.includes(":")
    ))
    ?? document.entityId
    ?? document.label;
}

function pieceOptions(
  context: StudioAssistantContext,
  query: string,
  selectionPrompt: (document: StudioAssistantDocument) => string,
  eligible: (document: StudioAssistantDocument) => boolean = (document) => (
    document.state !== "SOLD_OUT" && document.state !== "ARCHIVED_DRAFT"
  ),
  fallbackToEligible = false,
) {
  const ranked = rankedDocuments(context, query, "Piece")
    .filter(({ document }) => eligible(document));
  if (ranked.length) {
    const topScore = ranked[0].score;
    return ranked
      .filter(({ score }) => score >= Math.max(12, topScore - 12))
      .slice(0, 4)
      .map(({ document }) => ({
        href: document.href,
        label: document.label,
        prompt: selectionPrompt(document),
      }));
  }
  if (fallbackToEligible) {
    const seen = new Set<string>();
    const candidates = context.documents.filter((document) => {
      if (document.kind !== "Piece" || !eligible(document) || seen.has(document.href)) return false;
      seen.add(document.href);
      return true;
    }).slice(0, 4);
    if (candidates.length) return candidates.map((document) => ({
      href: document.href,
      label: document.label,
      prompt: selectionPrompt(document),
    }));
  }
  return [{ href: "/studio/wardrobe", label: "Choose in Wardrobe" }];
}

function previewScenarioId(context: StudioAssistantContext) {
  if (context.provenance.status !== "preview") return "";
  if (context.provenance.scenario) return context.provenance.scenario;
  for (const document of context.documents) {
    try {
      const scenario = new URL(document.href, "https://studio.invalid").searchParams.get("scenario");
      if (scenario) return scenario;
    } catch {
      // Invalid document routes are rejected at the action boundary.
    }
  }
  return "";
}

function previewScenarioSuffix(context: StudioAssistantContext) {
  const scenario = previewScenarioId(context);
  return scenario ? `&scenario=${encodeURIComponent(scenario)}` : "";
}

function preservePreviewHref(context: StudioAssistantContext, href: string) {
  const scenario = previewScenarioId(context);
  if (!scenario || !href.startsWith("/studio")) return href;
  try {
    const parsed = new URL(href, "https://studio.invalid");
    if (!parsed.searchParams.has("scenario")) parsed.searchParams.set("scenario", scenario);
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return href;
  }
}

function preservePreviewBlock(
  context: StudioAssistantContext,
  block: StudioAssistantBlock,
): StudioAssistantBlock {
  if (block.kind === "metrics") {
    return { ...block, items: block.items.map((item) => ({ ...item, href: preservePreviewHref(context, item.href) })) };
  }
  if (block.kind === "results") {
    return { ...block, items: block.items.map((item) => ({ ...item, href: preservePreviewHref(context, item.href) })) };
  }
  if (block.kind === "clarification") {
    return { ...block, options: block.options.map((option) => ({ ...option, href: preservePreviewHref(context, option.href) })) };
  }
  if (block.kind === "handoff") {
    return { ...block, action: { ...block.action, href: preservePreviewHref(context, block.action.href) } };
  }
  if (block.kind === "recovery") {
    return { ...block, actions: block.actions.map((action) => ({ ...action, href: preservePreviewHref(context, action.href) })) };
  }
  return block;
}

function collectionOptions(
  context: StudioAssistantContext,
  query: string,
  selectionPrompt: (document: StudioAssistantDocument) => string,
  eligible: (document: StudioAssistantDocument) => boolean = () => true,
) {
  const ranked = rankedDocuments(context, query, "Collection")
    .filter(({ document }) => eligible(document));
  const scenario = previewScenarioSuffix(context);
  if (ranked.length) return ranked.slice(0, 4).map(({ document }) => ({
    href: `/studio/wardrobe?collection=choose&dropAction=manage&dropId=${encodeURIComponent(document.entityId ?? "")}${scenario}`,
    label: document.label,
    prompt: selectionPrompt(document),
  }));
  return [{ href: `/studio/wardrobe?collection=choose${scenario}`, label: "Browse drops" }];
}

function capabilityAvailable(context: StudioAssistantContext, id: StudioAssistantCapability["id"]) {
  return context.capabilities.some((capability) => capability.id === id && capability.state === "AVAILABLE");
}

function unavailableWorkflowResponse(
  context: StudioAssistantContext,
  input: { body: string; href: string; label: string; title: string },
) {
  return response(context, "UNDERSTAND", "R0", [
    { body: input.body, kind: "answer", title: input.title },
    {
      items: [{
        detail: "Read the current workspace without preparing a change",
        href: input.href,
        id: `unavailable:${normalizeStudioAssistantText(input.title).replaceAll(" ", "-")}`,
        kind: "Service",
        label: input.label,
      }],
      kind: "results",
      title: "Available now",
    },
  ]);
}

function collectionWriteUnavailableResponse(context: StudioAssistantContext) {
  return response(context, "UNDERSTAND", "R0", [
    {
      body: "This Studio projection is read-only for drop changes. You can review the current drops, but Ask will not present a create, rename, activation, or archive action until the owning capability is available.",
      kind: "answer",
      title: "Drop changes unavailable",
    },
    {
      items: [{
        detail: "Read current drop state without preparing a change",
        href: "/studio/wardrobe?collection=choose",
        id: "capability:collections-read",
        kind: "Service",
        label: "Review drops",
      }],
      kind: "results",
      title: "Available now",
    },
  ]);
}

function collectionHandoff(
  context: StudioAssistantContext,
  query: string,
  input: {
    actionLabel: string;
    body: string;
    consequence: string;
    eligible?: (document: StudioAssistantDocument) => boolean;
    risk: StudioAssistantRisk;
    selectionPrompt(document: StudioAssistantDocument): string;
    title: string;
  },
) {
  const target = exactTarget(context, query, "Collection");
  if (!target) return response(context, "CHANGE", input.risk, [{
    body: "Choose the exact drop before Studio prepares the change.",
    kind: "clarification",
    options: collectionOptions(context, query, input.selectionPrompt, input.eligible),
    title: "Which drop?",
  }]);
  const scenario = previewScenarioSuffix(context);
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
    selectionPrompt(target: StudioAssistantDocument): string;
    title: string;
  },
) {
  const target = exactTarget(context, query, "Piece");
  if (!target) {
    const explicitReference = explicitPieceReference(query);
    if (explicitReference) return unknownPieceResponse(context, explicitReference);
    return response(context, "CHANGE", input.risk, [{
      body: "Name the piece or use its exact SKU so Studio can prepare the right workspace.",
      kind: "clarification",
      options: pieceOptions(context, query, input.selectionPrompt),
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

function unknownPieceResponse(
  context: StudioAssistantContext,
  reference: string,
) {
  return response(context, "RESOLVE", "R0", [
    {
      body: `No current piece matches ${reference}. Studio will not substitute a shorter or similar SKU.`,
      kind: "answer",
      title: "Piece not found",
    },
    {
      action: { href: "/studio/wardrobe", label: "Verify in Wardrobe" },
      body: "Review the authoritative piece index before preparing any change.",
      consequence: "Opening Wardrobe does not create or change a piece.",
      kind: "handoff",
      risk: "R0",
      title: "Verify piece reference",
    },
  ]);
}

function capabilityResponse(context: StudioAssistantContext) {
  return response(context, "UNDERSTAND", "R0", [
    {
      body: "Find records, check current status, and open the workflow that owns each change.",
      kind: "answer",
      title: "Studio guide",
    },
    {
      items: [
        { detail: "Pieces, drafts, prices and drops", href: "/studio/wardrobe", id: "capability:wardrobe", kind: "Service", label: "Wardrobe" },
        { detail: "Review media", href: "/studio/media", id: "capability:atelier", kind: "Service", label: "Atelier" },
        { detail: "Orders and returns", href: "/studio/orders", id: "capability:orders", kind: "Service", label: "Orders" },
        { detail: "Attention, stock, holds and recovery", href: "/studio/operations", id: "capability:operations", kind: "Service", label: "Operations" },
      ],
      kind: "results",
      title: "Services",
    },
  ]);
}

function contextualGuidanceResponse(
  context: StudioAssistantContext,
  mode: "blockers" | "impact" | "safe-next" | "workflow",
  originalQuery: string,
) {
  const original = resolveStudioAssistant(originalQuery, context);
  const handoff = original.blocks.find((block) => block.kind === "handoff");
  const clarification = original.blocks.find((block) => block.kind === "clarification");
  const copy = clarification
    ? {
        body: "Choose one exact target first. Studio will then show the owning review, its current consequence, and the confirmation boundary without making you find the record again.",
        title: "Choose the target first",
      }
    : handoff
      ? mode === "blockers"
        ? {
            body: `${handoff.consequence} Verify that the target is current and that the owning workflow remains available before continuing.`,
            title: "Before you start",
          }
        : mode === "impact"
          ? {
              body: `${handoff.consequence} Review the exact target and current Studio state before confirming in the owning workflow.`,
              title: "Before you confirm",
            }
          : mode === "workflow"
            ? {
                body: `Ask prepares the safe handoff. The owning workflow rereads current truth, shows the exact preview, collects confirmation, and returns the authoritative receipt. ${handoff.consequence}`,
                title: "How this workflow works",
              }
            : {
                body: `${handoff.consequence} Continue through the owning workflow shown below; Ask does not apply the change itself.`,
                title: "Safe next step",
              }
      : {
          body: "Use the current Studio result below. Ask will keep navigation and explanation separate from any owning workflow change.",
          title: "Safe next step",
        };

  return response(context, "UNDERSTAND", original.risk, [
    { ...copy, kind: "answer" },
    ...original.blocks.filter((block) => block.kind !== "answer"),
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

  const guidance = /^(check blockers|check impact|explain the safe next step|explain the workflow)\s+for:\s*(.+)$/i.exec(rawQuery.trim());
  if (guidance) {
    const mode = guidance[1].toLocaleLowerCase("en-NG") === "check blockers"
      ? "blockers"
      : guidance[1].toLocaleLowerCase("en-NG") === "check impact"
        ? "impact"
        : guidance[1].toLocaleLowerCase("en-NG") === "explain the workflow"
          ? "workflow"
          : "safe-next";
    return contextualGuidanceResponse(context, mode, guidance[2]);
  }

  if (CAPABILITY_PATTERN.test(query)) return capabilityResponse(context);

  const anyExactTarget = exactTarget(context, query);
  const explicitMediaIntent = MEDIA_PATTERN.test(query) || MEDIA_VIEW_PATTERN.test(query);
  const explicitInventoryIntent = INVENTORY_PATTERN.test(query);
  const exactMediaReference = exactMediaReferenceTarget(context, query);
  const exactOrderReference = exactOrderReferenceTarget(context, query);
  const requestedOrderReference = explicitOrderReference(rawQuery.trim());
  const explicitOrderDomain = Boolean(exactOrderReference)
    || Boolean(requestedOrderReference)
    || (ORDER_WORKFLOW_PATTERN.test(query) && (!explicitMediaIntent || ORDER_SPECIFIC_PATTERN.test(query)));
  const explicitOrderReversal = ORDER_REVERSAL_PATTERN.test(query);
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

  if (
    CREATE_ORDER_PATTERN.test(query)
    && !explicitMediaIntent
    && !exactOrderReferenceTarget(context, query)
    && !((NAVIGATE_PATTERN.test(query) || UNDERSTAND_PATTERN.test(query))
      && !/\b(create|prepare|reserve|start)\b/i.test(query))
  ) {
    const target = exactTarget(context, query, "Piece");
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    const explicitReference = explicitPieceReference(query);
    if (!target && explicitReference) return unknownPieceResponse(context, explicitReference);
    if (target && !target.availableActions?.includes("CREATE_ORDER")) {
      return response(context, "RESOLVE", "R0", [{
        action: { href: target.href, label: "Review current piece" },
        body: `${target.label} is not currently eligible for a new customer order. Review its availability, reservation, and custody truth before choosing another action.`,
        consequence: "Opening the piece does not create an order or reserve stock.",
        kind: "handoff",
        risk: "R0",
        title: "Order creation not available",
      }]);
    }
    if (context.provenance.status === "preview") {
      return unavailableWorkflowResponse(context, {
        body: "Customer-order creation is read-only in the lifecycle simulator. Review the scenario order queue without creating or reserving anything.",
        href: "/studio/orders",
        label: "Review scenario orders",
        title: "Order creation unavailable in preview",
      });
    }
    if (!capabilityAvailable(context, "ORDERS_CREATE")) {
      return unavailableWorkflowResponse(context, {
        body: "Orders cannot prove current product, payment, and reservation write readiness, so Ask will not prepare a new customer order.",
        href: "/studio/orders",
        label: "Review Orders",
        title: "Order creation unavailable",
      });
    }
    if (!target) {
      return response(context, "CREATE", "R3", [{
        body: "Choose the exact physically reconciled piece before Studio prepares a customer order.",
        kind: "clarification",
        options: pieceOptions(
          context,
          query,
          (candidate) => `Create a customer order for ${preferredPromptIdentifier(candidate)}`,
          (candidate) => candidate.availableActions?.includes("CREATE_ORDER") ?? false,
          true,
        ),
        title: "Which piece?",
      }]);
    }
    const piece = target ? preferredPromptIdentifier(target) : null;
    return response(context, "CREATE", "R3", [{
      action: {
        href: `/studio/orders?action=create${piece ? `&piece=${encodeURIComponent(piece)}` : ""}`,
        label: "Start customer order",
      },
      body: target
        ? `Open the guarded customer-order form for ${target.label}, then verify availability, customer details, and fulfilment.`
        : "Open the guarded customer-order form, choose the exact available piece, then verify customer details and fulfilment.",
      consequence: "No order or stock reservation is created until the Orders review is submitted and returns its authoritative receipt.",
      kind: "handoff",
      risk: "R3",
      title: target ? `New order for ${target.label}` : "New customer order",
    }]);
  }

  const collectionAssignmentPiece = COLLECTION_ASSIGNMENT_PATTERN.test(query)
    ? exactTarget(context, query, "Piece")
    : null;
  if (collectionAssignmentPiece) {
    const collection = exactTarget(context, query, "Collection");
    return response(context, "UNDERSTAND", "R0", [{
      action: { href: collectionAssignmentPiece.href, label: "Review current piece" },
      body: `${collectionAssignmentPiece.label}${collection ? ` and ${collection.label}` : ""} are resolved, but the current Studio projection does not expose a guarded collection-membership command.`,
      consequence: "Opening the piece does not move it, create a garment, or create a drop.",
      kind: "handoff",
      risk: "R0",
      title: "Collection move unavailable",
    }]);
  }

  if (CREATE_PIECE_PATTERN.test(query) && !explicitMediaIntent && !explicitOrderDomain) {
    if (!capabilityAvailable(context, "WARDROBE_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Wardrobe intake is not writable in the current projection, so Ask will not prepare a new garment record.",
        href: "/studio/wardrobe",
        label: "Review Wardrobe",
        title: "Piece intake unavailable",
      });
    }
    return response(context, "CREATE", "R1", [{
      action: { href: "/studio/wardrobe?intake=1", label: "Start intake" },
      body: "Wardrobe will collect the minimum garment truth first, then disclose media and publication steps when they are needed.",
      consequence: "Nothing is created until intake is saved.",
      kind: "handoff",
      risk: "R1",
      title: "Add a piece",
    }]);
  }

  if (
    CREATE_COLLECTION_PATTERN.test(query)
    && !explicitMediaIntent
    && !explicitOrderDomain
    && !((NAVIGATE_PATTERN.test(query) || UNDERSTAND_PATTERN.test(query))
      && !/\b(add|create|start)\b/i.test(query))
  ) {
    if (!capabilityAvailable(context, "COLLECTIONS_WRITE")) {
      return collectionWriteUnavailableResponse(context);
    }
    const scenario = previewScenarioSuffix(context);
    return response(context, "CREATE", "R1", [{
      action: { href: `/studio/wardrobe?collection=choose&dropAction=create${scenario}`, label: "Name drop" },
      body: "Name the drop, review the draft, then confirm it.",
      consequence: "The new drop stays private until it is activated.",
      kind: "handoff",
      risk: "R1",
      title: "New drop",
    }]);
  }

  if (RENAME_COLLECTION_PATTERN.test(query) && !explicitMediaIntent && !explicitOrderDomain) {
    if (!capabilityAvailable(context, "COLLECTIONS_WRITE")) {
      return collectionWriteUnavailableResponse(context);
    }
    return collectionHandoff(context, query, {
      actionLabel: "Review rename",
      body: "Open the selected drop and prepare its new Studio name.",
      consequence: "The name changes only after preview and confirmation.",
      risk: "R2",
      selectionPrompt: (target) => `Rename ${preferredPromptIdentifier(target)}`,
      title: "Rename drop",
    });
  }

  if (ACTIVATE_COLLECTION_PATTERN.test(query) && !explicitMediaIntent && !explicitOrderDomain) {
    if (!capabilityAvailable(context, "COLLECTIONS_WRITE")) {
      return collectionWriteUnavailableResponse(context);
    }
    const target = exactTarget(context, query, "Collection");
    if (target?.state === "ACTIVE") {
      return response(context, "RESOLVE", "R0", [
        { body: `${target.label} is already the active drop. No activation task is needed.`, kind: "answer", title: "Drop already active" },
        resultBlock("Current drop", [target]),
      ]);
    }
    if (target && target.state !== "DRAFT") {
      return response(context, "RESOLVE", "R0", [
        { body: `${target.label} cannot be activated from ${target.state?.toLowerCase() ?? "its current state"}. Choose a draft drop.`, kind: "answer", title: "Drop cannot be activated" },
        resultBlock("Current drop state", [target]),
      ]);
    }
    return collectionHandoff(context, query, {
      actionLabel: "Review activation",
      body: "Open the selected draft and review the active-drop handover.",
      consequence: "Activation requires confirmation and returns a durable receipt.",
      eligible: (candidate) => candidate.state === "DRAFT",
      risk: "R3",
      selectionPrompt: (target) => `Activate ${preferredPromptIdentifier(target)}`,
      title: "Activate drop",
    });
  }

  if (ARCHIVE_COLLECTION_PATTERN.test(query) && !explicitMediaIntent && !explicitOrderDomain) {
    if (!capabilityAvailable(context, "COLLECTIONS_WRITE")) {
      return collectionWriteUnavailableResponse(context);
    }
    const target = exactTarget(context, query, "Collection");
    if (target?.state === "ARCHIVED") {
      return response(context, "RESOLVE", "R0", [
        { body: `${target.label} is already archived. No archive task is needed.`, kind: "answer", title: "Drop already archived" },
        resultBlock("Drop history", [target]),
      ]);
    }
    return collectionHandoff(context, query, {
      actionLabel: "Review archive",
      body: "Open the selected drop and review what leaves active Studio work.",
      consequence: "History remains available; the archive happens only after confirmation.",
      eligible: (candidate) => candidate.state !== "ARCHIVED",
      risk: "R3",
      selectionPrompt: (target) => `Archive ${preferredPromptIdentifier(target)}`,
      title: "Archive drop",
    });
  }

  if (PRICE_PATTERN.test(query) && PRICE_CHANGE_PATTERN.test(query) && !explicitOrderDomain) {
    const target = exactTarget(context, query, "Piece");
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    if (!capabilityAvailable(context, "WARDROBE_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Wardrobe cannot prove current price-write readiness, so Ask will not prepare a price change.",
        href: "/studio/wardrobe",
        label: "Review Wardrobe",
        title: "Price change unavailable",
      });
    }
    return targetedPieceHandoff(context, query, {
      actionHref: (target) => `${target.href}${target.href.includes("?") ? "&" : "?"}action=price#garment-lifecycle`,
      actionLabel: "Review price",
      body: (target) => `Open ${target.label} with its current price and the exact change preview.`,
      consequence: "The price stays unchanged until you confirm in Wardrobe.",
      risk: "R2",
      selectionPrompt: (target) => `Change ${preferredPromptIdentifier(target)} price`,
      title: "Change price",
    });
  }

  if (COLLECTION_PATTERN.test(query) && /\b(change|choose|move|set|switch)\b/i.test(query) && !explicitOrderDomain) {
    return response(context, "UNDERSTAND", "R0", [{
      action: { href: "/studio/wardrobe?collection=choose", label: "Review collections" },
      body: "Review current collection scope. Ask will not prepare a membership change until Wardrobe exposes a guarded assignment command.",
      consequence: "Opening collection scope does not move or change a garment.",
      kind: "handoff",
      risk: "R0",
      title: "Collection move unavailable",
    }]);
  }

  if (PUBLICATION_PATTERN.test(query) && !explicitOrderDomain) {
    const target = exactTarget(context, query, "Piece");
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    const explicitReference = explicitPieceReference(query);
    if (!target && explicitReference) return unknownPieceResponse(context, explicitReference);
    const changesPublication = PUBLISH_MUTATION_PATTERN.test(query)
      && !NAVIGATE_PATTERN.test(query)
      && !UNDERSTAND_PATTERN.test(query);
    if (!changesPublication) {
      if (!capabilityAvailable(context, "WARDROBE_READ")) {
        return unavailableWorkflowResponse(context, {
          body: "Wardrobe cannot establish current public-listing truth.",
          href: "/studio/wardrobe?view=publishing",
          label: "Retry Wardrobe",
          title: "Publication review unavailable",
        });
      }
      return response(context, "RESOLVE", "R0", [{
        action: {
          href: target ? target.href : "/studio/wardrobe?view=publishing",
          label: target ? "Review public listing" : "Review publication queue",
        },
        body: target
          ? `Review ${target.label}'s current Shop-facing media, copy, price, and availability without changing it.`
          : "Review current public-listing and publication-readiness truth without changing it.",
        consequence: "Opening publication state does not publish, unpublish, or edit a listing.",
        kind: "handoff",
        risk: "R0",
        title: target ? `Public listing for ${target.label}` : "Publication status",
      }]);
    }
    if (!capabilityAvailable(context, "WARDROBE_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Wardrobe cannot prove current publication-write readiness across media, price, and availability, so Ask will not prepare a Shop change.",
        href: "/studio/wardrobe?view=publishing",
        label: "Review publication queue",
        title: "Publication review unavailable",
      });
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

  if (HOLD_RELEASE_PATTERN.test(query) && !ORDER_WORKFLOW_PATTERN.test(query)) {
    if (context.provenance.status === "preview") {
      return unavailableWorkflowResponse(context, {
        body: "Customer holds are read-only in the lifecycle simulator. Review the current hold without releasing it.",
        href: "/studio/operations?view=holds",
        label: "Review scenario holds",
        title: "Hold release unavailable in preview",
      });
    }
    if (!capabilityAvailable(context, "HOLDS_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Operations cannot prove current hold-release readiness, so Ask will not prepare the change.",
        href: "/studio/operations?view=holds",
        label: "Review Holds",
        title: "Hold release unavailable",
      });
    }
    const target = exactTarget(context, query, "Piece");
    if (!target) {
      const explicitReference = explicitPieceReference(query);
      if (explicitReference) return unknownPieceResponse(context, explicitReference);
      return response(context, "REVERSE", "R3", [{
        body: "Choose the exact piece before Studio prepares a hold release.",
        kind: "clarification",
        options: pieceOptions(
          context,
          query,
          (candidate) => `Release hold for ${preferredPromptIdentifier(candidate)}`,
          (candidate) => candidate.availableActions?.includes("RELEASE_HOLD") ?? false,
        ),
        title: "Which piece?",
      }]);
    }
    if (target.state === "SOLD_OUT" || target.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    if (!target.availableActions?.includes("RELEASE_HOLD")) {
      return response(context, "RESOLVE", "R0", [{
        action: {
          href: `/studio/operations?view=holds&piece=${encodeURIComponent(preferredPromptIdentifier(target))}`,
          label: "Review hold status",
        },
        body: `${target.label} has no active customer hold in the current Studio projection.`,
        consequence: "Opening Holds only reconciles the current record; it does not release or create a hold.",
        kind: "handoff",
        risk: "R0",
        title: "No active hold to release",
      }]);
    }
    const piece = preferredPromptIdentifier(target);
    return response(context, "REVERSE", "R3", [{
      action: {
        href: `/studio/operations?view=holds&action=release&piece=${encodeURIComponent(piece)}`,
        label: "Review hold release",
      },
      body: `Open ${target.label} in Operations and verify the exact active hold before releasing it.`,
      consequence: "The piece remains held until the guarded Operations action is confirmed and returns its authoritative receipt.",
      kind: "handoff",
      risk: "R3",
      title: `Release hold for ${target.label}`,
    }]);
  }

  if (HOLD_PATTERN.test(query) && !ORDER_WORKFLOW_PATTERN.test(query) && (NAVIGATE_PATTERN.test(query) || HOLD_READ_PATTERN.test(query) || UNDERSTAND_PATTERN.test(query))) {
    if (!capabilityAvailable(context, "OPERATIONS_READ")) {
      return unavailableWorkflowResponse(context, {
        body: "Operations cannot establish current hold and custody truth.",
        href: "/studio/operations?view=holds",
        label: "Review Operations",
        title: "Hold review unavailable",
      });
    }
    const target = exactTarget(context, query, "Piece");
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    const explicitReference = explicitPieceReference(query);
    if (!target && explicitReference) return unknownPieceResponse(context, explicitReference);
    return response(context, "RESOLVE", "R0", [{
      action: {
        href: target
          ? `/studio/operations?view=holds&piece=${encodeURIComponent(preferredPromptIdentifier(target))}`
          : "/studio/operations?view=holds",
        label: target ? "Open hold record" : "Review holds",
      },
      body: target
        ? `Review ${target.label}'s current custody and hold truth without changing it.`
        : "Review active customer holds, custody, and expiry without changing them.",
      consequence: "Opening Holds does not create or release a reservation.",
      kind: "handoff",
      risk: "R0",
      title: target ? `Hold status for ${target.label}` : "Customer holds",
    }]);
  }

  if (HOLD_PATTERN.test(query) && !ORDER_WORKFLOW_PATTERN.test(query)) {
    if (context.provenance.status === "preview") {
      return unavailableWorkflowResponse(context, {
        body: "Customer holds are read-only in the lifecycle simulator. Review the piece and its current custody without creating a hold.",
        href: "/studio/operations?view=holds",
        label: "Review scenario holds",
        title: "Holds unavailable in preview",
      });
    }
    if (!capabilityAvailable(context, "HOLDS_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Operations cannot prove current availability, custody, and hold-write readiness, so Ask will not prepare a customer hold.",
        href: "/studio/operations?view=holds",
        label: "Review Holds",
        title: "Hold unavailable",
      });
    }
    const target = exactTarget(context, query, "Piece");
    if (!target) {
      const explicitReference = explicitPieceReference(query);
      if (explicitReference) return unknownPieceResponse(context, explicitReference);
      return response(context, "CHANGE", "R2", [{
        body: "Choose the exact available piece before Studio prepares a customer hold.",
        kind: "clarification",
        options: pieceOptions(
          context,
          query,
          (candidate) => `Hold ${preferredPromptIdentifier(candidate)}`,
          (candidate) => candidate.availableActions?.includes("CREATE_HOLD") ?? false,
        ),
        title: "Which piece?",
      }]);
    }
    if (target.state === "SOLD_OUT" || target.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    if (!target.availableActions?.includes("CREATE_HOLD")) {
      return response(context, "RESOLVE", "R0", [{
        action: {
          href: `/studio/operations?view=holds&piece=${encodeURIComponent(preferredPromptIdentifier(target))}`,
          label: "Review hold status",
        },
        body: `${target.label} is not currently eligible for a new customer hold. Review its reservation, availability, and custody truth first.`,
        consequence: "Opening Holds does not create another reservation or change stock.",
        kind: "handoff",
        risk: "R0",
        title: "Customer hold not available",
      }]);
    }
    const piece = preferredPromptIdentifier(target);
    return response(context, "CHANGE", "R2", [{
      action: {
        href: `/studio/operations?view=holds&action=hold&piece=${encodeURIComponent(piece)}`,
        label: "Review customer hold",
      },
      body: `Open ${target.label} in Operations and verify availability, custody, customer details, and expiry.`,
      consequence: "No hold is created until the guarded Operations form is confirmed and returns its authoritative receipt.",
      kind: "handoff",
      risk: "R2",
      title: `Hold ${target.label}`,
    }]);
  }

  const exactWardrobeFieldTarget = REVERSE_PATTERN.test(query) && WARDROBE_FIELD_PATTERN.test(query)
    ? exactTarget(context, query, "Piece")
    : null;
  if (exactWardrobeFieldTarget) {
    return response(context, "RESOLVE", "R0", [{
      action: { href: exactWardrobeFieldTarget.href, label: "Review current piece" },
      body: `${exactWardrobeFieldTarget.label} is resolved, but Ask will not reinterpret deleting a field as deleting or archiving the whole garment.`,
      consequence: "Opening the piece does not remove its price, copy, measurements, or garment record.",
      kind: "handoff",
      risk: "R0",
      title: "Field removal unavailable",
    }]);
  }

  if (
    REVERSE_PATTERN.test(query)
    && (!explicitOrderDomain || explicitOrderReversal)
    && (!explicitMediaIntent || Boolean(exactMediaReference))
    && !explicitInventoryIntent
  ) {
    const historicalTarget = exactTarget(context, query, "Piece");
    if (historicalTarget?.state === "SOLD_OUT" || historicalTarget?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, historicalTarget);
    }
    if (context.provenance.status === "preview") {
      return unavailableWorkflowResponse(context, {
        body: "Reversals are read-only in the lifecycle simulator. Review current state without deleting, cancelling, withdrawing, refunding, or releasing anything.",
        href: "/studio",
        label: "Review scenario Studio",
        title: "Reversal unavailable in preview",
      });
    }
    const exactReverseOrder = exactOrderReferenceTarget(context, query);
    const requestedReverseOrder = explicitOrderReference(rawQuery.trim());
    if (ORDER_PATTERN.test(query) || exactReverseOrder || requestedReverseOrder) {
      if (!capabilityAvailable(context, "ORDERS_WRITE")) {
        return unavailableWorkflowResponse(context, {
          body: "Orders cannot prove current transition-write readiness, so Ask will not prepare a cancellation, refund, or reversal.",
          href: "/studio/orders",
          label: "Review Orders",
          title: "Order reversal unavailable",
        });
      }
      const exactOrder = exactReverseOrder;
      if (!exactOrder) {
        return response(context, "REVERSE", "R3", [{
          body: "Use the exact order reference before Studio prepares a cancellation, refund, or other reversal. A SKU can belong to more than one order.",
          kind: "clarification",
          options: [{ href: "/studio/orders", label: "Choose in Orders" }],
          title: "Which exact order?",
        }]);
      }
      const requiredOrderAction = /\brefund\b/i.test(query) ? "REFUND_ORDER" : "CANCEL_ORDER";
      if (!exactOrder.availableActions?.includes(requiredOrderAction)) {
        return response(context, "RESOLVE", "R0", [{
          action: { href: exactOrder.href, label: "Review current order" },
          body: requiredOrderAction === "REFUND_ORDER"
            ? `${exactOrder.label} has no refund transition available in the current order projection.`
            : `${exactOrder.label} has no cancellation or reversal transition available in the current order projection.`,
          consequence: "Opening the order does not apply a transition or create a task for an unavailable action.",
          kind: "handoff",
          risk: "R0",
          title: requiredOrderAction === "REFUND_ORDER" ? "Refund not available" : "Order reversal not available",
        }]);
      }
      return response(context, "REVERSE", "R3", [{
        action: { href: exactOrder.href, label: "Review order" },
        body: `Open ${exactOrder.label} and inspect its payment, stock, fulfilment, and customer consequences.`,
        consequence: "Ask Studio never cancels, refunds, or reverses an order from chat; the owning order workflow must confirm and receipt the exact transition.",
        kind: "handoff",
        risk: "R3",
        title: "Review order reversal",
      }]);
    }
    const target = explicitMediaIntent
      ? exactMediaReference
      : (["Piece", "Collection", "Model", "Media"] as const)
          .map((kind) => exactTarget(context, query, kind))
          .find((candidate) => candidate !== null) ?? null;
    if (target?.kind === "Piece" && (target.state === "SOLD_OUT" || target.state === "ARCHIVED_DRAFT")) {
      return historicalPieceResponse(context, target);
    }
    if (!target) {
      const explicitReference = explicitPieceReference(query);
      if (explicitReference) return unknownPieceResponse(context, explicitReference);
      return response(context, "REVERSE", "R3", [{
        body: "Name the exact piece, order, drop, model, or media record before Studio prepares a reversal.",
        kind: "clarification",
        options: [
          { href: "/studio/wardrobe", label: "Choose in Wardrobe" },
          { href: "/studio/orders", label: "Choose in Orders" },
          { href: "/studio/models", label: "Choose in Models" },
        ],
        title: "Which exact record?",
      }]);
    }
    const requiredCapability = target.kind === "Piece"
      ? "WARDROBE_WRITE" as const
      : target.kind === "Collection"
        ? "COLLECTIONS_WRITE" as const
        : target.kind === "Model"
          ? "MODELS_WRITE" as const
          : "MEDIA_WRITE" as const;
    if (!capabilityAvailable(context, requiredCapability)) {
      return unavailableWorkflowResponse(context, {
        body: `${target.label} is readable, but its owning workflow has not proved write readiness for this reversal.`,
        href: target.href,
        label: "Review current record",
        title: "Reversal unavailable",
      });
    }
    return response(context, "REVERSE", "R3", [{
      action: { href: target.href, label: "Review record" },
      body: `Open ${target.label} and inspect its connected listing, stock, order, and media consequences.`,
      consequence: "Ask Studio will never delete, archive, cancel, or unpublish from an ambiguous message.",
      kind: "handoff",
      risk: "R3",
      title: "Review before reversing",
    }]);
  }

  if (explicitMediaIntent && !explicitOrderDomain) {
    const createsMedia = (
      MEDIA_CREATE_PATTERN.test(query)
      || (/\b(new|try[ -]?on)\b/i.test(query) && !NAVIGATE_PATTERN.test(query))
    ) && !UNDERSTAND_PATTERN.test(query);
    const target = exactTarget(context, query, "Piece");
    const mediaTarget = exactMediaReference;
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    const explicitReference = explicitPieceReference(query);
    if (!target && !mediaTarget && explicitReference) return unknownPieceResponse(context, explicitReference);
    if (!createsMedia && mediaTarget) {
      return response(context, "RESOLVE", "R0", [resultBlock("Media", [mediaTarget])]);
    }
    if (createsMedia && !capabilityAvailable(context, "MEDIA_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Atelier cannot prove the complete authority, canvas, provider, and qualification preflight required for new media, so Ask will not expose a decorative generation action.",
        href: "/studio/media",
        label: "Review existing Media",
        title: "New media unavailable",
      });
    }
    if (!capabilityAvailable(context, "MEDIA_READ")) {
      return unavailableWorkflowResponse(context, {
        body: "Media cannot establish current garment authority and generation state, so Ask will not prepare media work.",
        href: "/studio/media",
        label: "Review Media",
        title: "Media workflow unavailable",
      });
    }
    if (createsMedia && !target) {
      return response(context, "CREATE", "R2", [{
        body: "Choose the exact current piece before Studio prepares Media. A drop, order, or descriptive garment type is not enough authority for generation.",
        kind: "clarification",
        options: pieceOptions(
          context,
          query,
          (candidate) => `Prepare media for ${preferredPromptIdentifier(candidate)}`,
          (candidate) => Boolean(candidate.mediaTargetId)
            && candidate.state !== "SOLD_OUT"
            && candidate.state !== "ARCHIVED_DRAFT",
        ),
        title: "Which piece?",
      }]);
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
    return response(context, createsMedia ? "CREATE" : "GO", createsMedia ? "R2" : "R0", [{
      action: {
        href: target
          ? createsMedia
            ? `/studio/media/new?garment=${encodeURIComponent(target.mediaTargetId!)}`
            : target.href
          : "/studio/media",
        label: target ? (createsMedia ? "Open garment media" : "Review piece media") : "Open Media",
      },
      body: target
        ? createsMedia
          ? `Media will load ${target.label} so its connected garment authority can be reviewed without selecting another piece.`
          : `Open ${target.label} and review its current approved media without starting a generation.`
        : "Open Media to review existing work or choose a garment. The owning flow shows what is actually available.",
      consequence: createsMedia
        ? ASK_MEDIA_MUTATION_BOUNDARY
        : "Opening current media does not start generation or change an approval.",
      kind: "handoff",
      risk: createsMedia ? "R2" : "R0",
      title: target ? `Media for ${target.label}` : "Media",
    }]);
  }

  if (MODEL_PATTERN.test(query)) {
    if (MODEL_MUTATION_PATTERN.test(query)) {
      if (!capabilityAvailable(context, "MODELS_WRITE")) {
        return unavailableWorkflowResponse(context, {
          body: "Models has not proved identity, consent, asset, and authority write readiness, so Ask will not prepare a model change.",
          href: context.provenance.status === "preview" ? "/studio/wardrobe" : "/studio/models",
          label: context.provenance.status === "preview" ? "Return to Wardrobe" : "Review Models",
          title: "Model changes unavailable",
        });
      }
      const target = exactTarget(context, query, "Model");
      const createsModel = /\b(add|create|new)\b/i.test(query);
      return response(context, createsModel ? "CREATE" : "CHANGE", "R2", [{
        action: {
          href: target?.href ?? (createsModel ? "/studio/models?intake=model" : "/studio/models"),
          label: target ? "Review model change" : createsModel ? "Add model authority" : "Open Models",
        },
        body: target
          ? `Open ${target.label} and review the exact identity, styling, consent, and asset change.`
          : createsModel
            ? "Open the guarded model-authority intake and provide an adult photo, usage source, and explicit authority confirmation."
            : "Open Models and choose the exact authority record before preparing a change.",
        consequence: "No model identity, styling, consent, or asset changes until the guarded Models workflow confirms and receipts it.",
        kind: "handoff",
        risk: "R2",
        title: target ? `Update ${target.label}` : createsModel ? "Add model" : "Model change",
      }]);
    }
    if (!capabilityAvailable(context, "MODELS_READ")) {
      return unavailableWorkflowResponse(context, {
        body: "Model identity, consent, face, and body authority are not exposed in this projection, so Ask will not substitute simulator or inferred truth.",
        href: "/studio/wardrobe",
        label: "Return to Wardrobe",
        title: "Model authority unavailable",
      });
    }
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
    if (!capabilityAvailable(context, "ORDERS_READ")) {
      return unavailableWorkflowResponse(context, {
        body: "Orders cannot establish current payment, fulfilment, delivery, or return truth.",
        href: "/studio/orders",
        label: "Retry Orders",
        title: "Order review unavailable",
      });
    }
    const exactOrder = exactOrderReferenceTarget(context, query);
    if (exactOrder && ORDER_ADVANCE_PATTERN.test(query)) {
      if (!exactOrder.availableActions?.includes("ADVANCE_ORDER")) {
        return response(context, "RESOLVE", "R0", [
          {
            body: `${exactOrder.label} has no positive next transition available in the current order projection. Review its current state without forcing the requested step.`,
            kind: "answer",
            title: "No order action available",
          },
          resultBlock("Current order", [exactOrder]),
        ]);
      }
      if (!capabilityAvailable(context, "ORDERS_WRITE")) {
        return unavailableWorkflowResponse(context, {
          body: "Orders cannot prove current transition-write readiness, so Ask will not prepare the next lifecycle action.",
          href: exactOrder.href,
          label: "Review current order",
          title: "Order action unavailable",
        });
      }
      return response(context, "CHANGE", "R2", [{
        action: { href: `${exactOrder.href}#studio-order-next-action`, label: "Open next order action" },
        body: `Open ${exactOrder.label} at its authoritative next action. Complete any payment, quality, handoff, delivery, return, or refund prerequisite shown there before the requested later step.`,
        consequence: "Ask does not advance the order. The exact owning workflow must preview, confirm, and receipt the currently allowed transition.",
        kind: "handoff",
        risk: "R2",
        title: `Continue ${exactOrder.label}`,
      }]);
    }
    if (exactOrder) return response(context, "RESOLVE", "R0", [resultBlock("Order", [exactOrder])]);
    const requestedReference = explicitOrderReference(rawQuery.trim());
    if (requestedReference) {
      return response(context, "RESOLVE", "R0", [
        {
          body: `No current order matches ${requestedReference}. Open Orders with that reference prefilled and verify it against connected truth.`,
          kind: "answer",
          title: "Order not found",
        },
        {
          action: { href: `/studio/orders?search=${encodeURIComponent(requestedReference)}`, label: "Search Orders" },
          body: "Search the authoritative order queue without substituting a similar reference.",
          consequence: ASK_ORDER_MUTATION_BOUNDARY,
          kind: "handoff",
          risk: "R0",
          title: "Verify order reference",
        },
      ]);
    }
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

  if (LOCATION_MUTATION_PATTERN.test(query) && !explicitOrderDomain) {
    if (!capabilityAvailable(context, "OPERATIONS_READ") || !capabilityAvailable(context, "LOCATIONS_WRITE")) {
      return unavailableWorkflowResponse(context, {
        body: "Operations cannot prove current location and custody write readiness, so Ask will not prepare a movement or location confirmation.",
        href: "/studio/operations?view=inventory",
        label: "Review inventory",
        title: "Location change unavailable",
      });
    }
    const target = exactTarget(context, query, "Piece");
    if (target?.state === "SOLD_OUT" || target?.state === "ARCHIVED_DRAFT") {
      return historicalPieceResponse(context, target);
    }
    const explicitReference = explicitPieceReference(query);
    if (!target && explicitReference) return unknownPieceResponse(context, explicitReference);
    if (!target) {
      return response(context, "CHANGE", "R2", [{
        body: "Choose the exact current piece before Studio prepares a location confirmation or move.",
        kind: "clarification",
        options: pieceOptions(context, query, (candidate) => `Update location for ${preferredPromptIdentifier(candidate)}`),
        title: "Which piece?",
      }]);
    }
    if (!target.availableActions?.includes("UPDATE_LOCATION")) {
      return response(context, "RESOLVE", "R0", [{
        action: {
          href: `/studio/operations?view=inventory&piece=${encodeURIComponent(preferredPromptIdentifier(target))}`,
          label: "Review current custody",
        },
        body: `${target.label} is not currently in Studio custody, so Operations cannot prepare a location confirmation or move.`,
        consequence: "Opening inventory does not change custody or location.",
        kind: "handoff",
        risk: "R0",
        title: "Location change not available",
      }]);
    }
    return response(context, "CHANGE", "R2", [{
      action: {
        href: `/studio/operations?view=inventory&action=location&piece=${encodeURIComponent(preferredPromptIdentifier(target))}`,
        label: "Review piece location",
      },
      body: `Open ${target.label} in Operations, reconcile its current custody, then choose the exact confirmed or destination location.`,
      consequence: "Ask does not move the piece. Operations applies a location only after its guarded confirmation returns an authoritative receipt.",
      kind: "handoff",
      risk: "R2",
      title: `Update location for ${target.label}`,
    }]);
  }

  if (INVENTORY_PATTERN.test(query)) {
    if (!capabilityAvailable(context, "OPERATIONS_READ")) {
      return unavailableWorkflowResponse(context, {
        body: "Operations cannot establish current inventory, custody, location, and hold truth.",
        href: "/studio/operations",
        label: "Retry Operations",
        title: "Inventory unavailable",
      });
    }
    const target = exactTarget(context, query, "Piece");
    if (target) {
      return response(context, "RESOLVE", "R0", [{
        action: {
          href: `/studio/operations?view=inventory&piece=${encodeURIComponent(preferredPromptIdentifier(target))}`,
          label: "Open inventory record",
        },
        body: `${target.label}: ${target.detail}`,
        consequence: "Inventory opens current availability, custody, location, and hold truth without changing it.",
        kind: "handoff",
        risk: "R0",
        title: `Inventory for ${target.label}`,
      }]);
    }
    const explicitReference = explicitPieceReference(query);
    if (explicitReference) return unknownPieceResponse(context, explicitReference);
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
  rawQuery: string,
  assistantResponse: StudioAssistantResponse,
  taskDraft: StudioAssistantTaskDraft | null,
): StudioAssistantPromptSuggestion[] {
  const sourceQuery = rawQuery.trim();
  const hasClarification = assistantResponse.blocks.some((block) => block.kind === "clarification");
  const suggestions = hasClarification
    ? [
        { label: "Explain the safe next step", prompt: `Explain the safe next step for: ${sourceQuery}` },
        { label: "Show current priorities", prompt: "What needs attention?" },
      ]
    : assistantResponse.intent === "CREATE"
      ? [
          { label: "Check blockers", prompt: `Check blockers for: ${sourceQuery}` },
          { label: "Show current priorities", prompt: "What needs attention?" },
          { label: "Explain the workflow", prompt: `Explain the workflow for: ${sourceQuery}` },
        ]
      : assistantResponse.intent === "CHANGE" || assistantResponse.intent === "REVERSE"
        ? [
            { label: "Check impact", prompt: `Check impact for: ${sourceQuery}` },
            { label: "Show current priorities", prompt: "What needs attention?" },
          ]
        : assistantResponse.intent === "RESOLVE"
          ? [
              { label: "Choose the next task", prompt: "What needs attention?" },
              { label: "Show private drafts", prompt: "Show private Wardrobe drafts" },
              { label: "Review orders", prompt: "Open orders requiring action" },
            ]
          : [
              { label: "Show current priorities", prompt: "What needs attention?" },
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
    suggestions: promptSuggestions(rawQuery, assistantResponse, taskDraft),
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
