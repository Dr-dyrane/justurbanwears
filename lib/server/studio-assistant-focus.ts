import {
  normalizeStudioAssistantText,
  resolveStudioAssistantEntryRecord,
  resolveStudioAssistantRouteEntry,
  scoreStudioAssistantDocument,
  type StudioAssistantContext,
  type StudioAssistantDocument,
  type StudioAssistantWorkflowResponse,
} from "../studio/assistant/experience";
import type { StudioAssistantFocus } from "../studio/assistant/threads";

function preferredReference(document: StudioAssistantDocument) {
  if (document.kind !== "Piece") return document.entityId ?? document.id;
  return document.identifiers.find((identifier) => /^JUW-[0-9]/i.test(identifier.trim()))
    ?? document.entityId
    ?? document.id.replace(/^piece:/, "");
}

function focusEntityType(document: StudioAssistantDocument): StudioAssistantFocus["entityType"] {
  if (document.kind === "Piece") return "PIECE";
  if (document.kind === "Collection") return "DROP";
  if (document.kind === "Order") return "ORDER";
  if (document.kind === "Media") return "MEDIA";
  if (document.kind === "Model") return "MODEL";
  return "SERVICE";
}

function selectedFocus(document: StudioAssistantDocument): StudioAssistantFocus {
  return {
    canonicalId: document.entityId ?? document.id,
    entityType: focusEntityType(document),
    label: document.label,
    lastKnownRevision: null,
    reference: preferredReference(document),
    route: document.href,
    unresolvedCandidates: [],
  };
}

function documentByResultId(context: StudioAssistantContext, id: string) {
  return context.documents.find((document) => document.kind !== "Alert" && document.id === id);
}

function documentByRoute(context: StudioAssistantContext, href: string) {
  try {
    const route = new URL(href, "https://studio.invalid");
    return resolveStudioAssistantRouteEntry(context.documents, route.pathname, route.search);
  } catch {
    return null;
  }
}

export function resolveStudioAssistantFocusReference(
  context: StudioAssistantContext,
  reference: string | null | undefined,
) {
  if (!reference) return null;
  const exact = resolveStudioAssistantEntryRecord(context.documents, reference);
  if (exact) return selectedFocus(exact);
  const normalized = normalizeStudioAssistantText(reference);
  const ranked = context.documents
    .filter((document) => document.kind !== "Alert")
    .map((document) => ({ document, score: scoreStudioAssistantDocument(document, normalized) }))
    .filter((candidate) => candidate.score >= 140)
    .sort((left, right) => right.score - left.score || left.document.id.localeCompare(right.document.id));
  return ranked[0] && ranked[0].score > (ranked[1]?.score ?? -1)
    ? selectedFocus(ranked[0].document)
    : null;
}

export function projectStudioAssistantFocus(input: {
  context: StudioAssistantContext;
  current: StudioAssistantFocus | null;
  query: string;
  workflow: StudioAssistantWorkflowResponse;
}): StudioAssistantFocus | null {
  const explicit = resolveStudioAssistantFocusReference(input.context, input.query);
  if (explicit) return explicit;

  const results = input.workflow.response.blocks.flatMap((block) => (
    block.kind === "results"
      ? block.items.filter((item) => item.kind !== "Alert")
      : []
  ));
  if (results.length === 1) {
    const document = documentByResultId(input.context, results[0]!.id)
      ?? documentByRoute(input.context, results[0]!.href);
    if (document) return selectedFocus(document);
  }

  const handoff = input.workflow.response.blocks.find((block) => block.kind === "handoff");
  if (handoff?.kind === "handoff") {
    const document = documentByRoute(input.context, handoff.action.href);
    if (document) return selectedFocus(document);
  }

  const clarification = input.workflow.response.blocks.find((block) => block.kind === "clarification");
  if (clarification?.kind === "clarification") {
    const candidates = clarification.options.flatMap((option) => {
      const document = documentByRoute(input.context, option.href);
      return document ? [{
        canonicalId: document.entityId ?? document.id,
        entityType: focusEntityType(document),
        label: document.label,
        reference: preferredReference(document),
        route: document.href,
      }] : [];
    }).slice(0, 6);
    if (candidates.length) {
      return {
        canonicalId: input.current?.canonicalId ?? null,
        entityType: input.current?.entityType ?? candidates[0]!.entityType,
        label: input.current?.label ?? null,
        lastKnownRevision: input.current?.lastKnownRevision ?? null,
        reference: input.current?.reference ?? null,
        route: input.current?.route ?? null,
        unresolvedCandidates: candidates,
      };
    }
  }

  return input.current;
}
