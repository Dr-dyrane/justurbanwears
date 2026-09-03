import type {
  StudioApplicationProjection,
  StudioSearchDocument,
} from "../application/contracts";
import {
  normalizeStudioAssistantText,
  type StudioAssistantContext,
  type StudioAssistantDocument,
} from "./experience";

function assistantDocumentKind(kind: StudioSearchDocument["kind"]): StudioAssistantDocument["kind"] {
  if (kind === "SERVICE") return "Service";
  if (kind === "COLLECTION") return "Collection";
  if (kind === "ORDER") return "Order";
  if (kind === "MODEL") return "Model";
  if (kind === "MEDIA" || kind === "ATELIER_OPERATION") return "Media";
  if (kind === "UPDATE") return "Alert";
  return "Piece";
}

function wardrobeTargetId(route: string) {
  const match = /^\/studio\/wardrobe\/([^/?#]+)/.exec(route);
  if (!match) return undefined;
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return undefined;
  }
}

function assistantDocument(document: StudioSearchDocument): StudioAssistantDocument {
  const entityId = document.id.includes(":")
    ? document.id.slice(document.id.indexOf(":") + 1)
    : document.id;
  const identifiers = [document.id, entityId, ...document.aliases].filter(Boolean);
  const historical = document.lifecycleState === "SOLD_OUT"
    || document.lifecycleState === "ARCHIVED_DRAFT";
  return {
    availableActions: document.availableActions ? [...document.availableActions] : undefined,
    detail: document.description?.trim() || document.secondaryLabel,
    entityId,
    href: document.route,
    id: document.id,
    identifiers,
    kind: assistantDocumentKind(document.kind),
    label: document.primaryLabel,
    mediaTargetId: historical ? undefined : wardrobeTargetId(document.route),
    state: document.lifecycleState,
    tokens: normalizeStudioAssistantText([
      ...identifiers,
      document.primaryLabel,
      document.secondaryLabel,
      document.description ?? "",
      document.lifecycleState,
    ].join(" ")),
  };
}

/** Builds the only Studio context the conversational agent may inspect. */
export function studioAssistantContextFromProjection(
  projection: StudioApplicationProjection,
): StudioAssistantContext {
  const degraded = projection.degradedSources.length > 0;
  const preview = projection.mode.kind === "SCENARIO";
  return {
    capabilities: projection.capabilities.map((capability) => ({
      id: capability.id,
      state: capability.state,
    })),
    continueAction: projection.continueAction?.href.startsWith("/studio")
      ? { href: projection.continueAction.href, label: projection.continueAction.label }
      : null,
    documents: projection.searchDocuments.map(assistantDocument),
    provenance: {
      detail: projection.mode.kind === "SCENARIO"
        ? projection.mode.notice
        : degraded
          ? `${projection.degradedSources.length} source${projection.degradedSources.length === 1 ? "" : "s"} limited`
          : "Connected Studio application snapshot",
      generatedAt: projection.generatedAt,
      label: preview ? "Scenario preview" : degraded ? "Studio snapshot" : "Live Studio",
      scenario: projection.mode.kind === "SCENARIO" ? projection.mode.id : undefined,
      status: preview ? "preview" : degraded ? "degraded" : "connected",
    },
    summary: {
      attention: projection.summary.attention.value,
      available: projection.summary.available.value,
      drafts: projection.summary.drafts.value,
      live: projection.summary.live.value,
      orders: projection.summary.orders.value,
      review: null,
    },
  };
}
