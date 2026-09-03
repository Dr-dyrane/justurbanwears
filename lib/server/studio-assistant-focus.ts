import {
  normalizeStudioAssistantText,
  resolveStudioAssistantEntryPiece,
  type StudioAssistantContext,
  type StudioAssistantDocument,
  type StudioAssistantWorkflowResponse,
} from "../studio/assistant/experience";
import type { StudioAssistantFocus } from "../studio/assistant/threads";

function pieceReference(document: StudioAssistantDocument) {
  return document.identifiers.find((identifier) => /^JUW-[0-9]/i.test(identifier.trim()))
    ?? document.entityId
    ?? document.id.replace(/^piece:/, "");
}

function selectedFocus(document: StudioAssistantDocument): StudioAssistantFocus {
  return {
    canonicalId: document.entityId ?? document.id.replace(/^piece:/, ""),
    entityType: "PIECE",
    label: document.label,
    lastKnownRevision: null,
    reference: pieceReference(document),
    route: document.href,
    unresolvedCandidates: [],
  };
}

function documentByResultId(context: StudioAssistantContext, id: string) {
  return context.documents.find((document) => document.kind === "Piece" && document.id === id);
}

function documentByRoute(context: StudioAssistantContext, href: string) {
  const clean = href.split("?")[0]?.split("#")[0];
  return context.documents.find((document) => (
    document.kind === "Piece"
    && document.href.split("?")[0]?.split("#")[0] === clean
  ));
}

export function resolveStudioAssistantFocusReference(
  context: StudioAssistantContext,
  reference: string | null | undefined,
) {
  if (!reference) return null;
  const exact = resolveStudioAssistantEntryPiece(context.documents, reference);
  if (exact) return selectedFocus(exact);
  const normalized = normalizeStudioAssistantText(reference);
  const byName = context.documents.filter((document) => (
    document.kind === "Piece" && normalizeStudioAssistantText(document.label) === normalized
  ));
  return byName.length === 1 ? selectedFocus(byName[0]!) : null;
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
      ? block.items.filter((item) => item.kind === "Piece")
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
        canonicalId: document.entityId ?? document.id.replace(/^piece:/, ""),
        entityType: "PIECE" as const,
        label: document.label,
        reference: pieceReference(document),
        route: document.href,
      }] : [];
    }).slice(0, 6);
    if (candidates.length) {
      return {
        canonicalId: input.current?.canonicalId ?? null,
        entityType: "PIECE",
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
