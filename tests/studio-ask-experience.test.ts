import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  contextualizeStudioAssistantQuery,
  resolveStudioAssistant,
  resolveStudioAssistantEntryPiece,
  resolveStudioAssistantWorkflow,
  studioAssistantFallbackText,
  studioAssistantSuggestionFamily,
  type StudioAssistantBlock,
  type StudioAssistantContext,
  type StudioAssistantDocument,
} from "../lib/studio/assistant/experience";

const root = process.cwd();

function document(input: Partial<StudioAssistantDocument> & Pick<StudioAssistantDocument, "id" | "kind" | "label">): StudioAssistantDocument {
  const identifiers = input.identifiers ?? [input.id.replace(/^[^:]+:/, "")];
  return {
    availableActions: input.availableActions,
    detail: input.detail ?? `${input.label} detail`,
    entityId: input.entityId,
    href: input.href ?? "/studio",
    id: input.id,
    identifiers,
    kind: input.kind,
    label: input.label,
    mediaTargetId: input.mediaTargetId,
    state: input.state,
    tokens: input.tokens ?? [input.label, input.detail, ...identifiers].filter(Boolean).join(" ").toLocaleLowerCase("en-NG"),
  };
}

const context: StudioAssistantContext = {
  capabilities: [
    { id: "PROJECTION", state: "AVAILABLE" },
    { id: "SEARCH", state: "AVAILABLE" },
    { id: "ASK_READ", state: "AVAILABLE" },
    { id: "WARDROBE_READ", state: "AVAILABLE" },
    { id: "WARDROBE_WRITE", state: "AVAILABLE" },
    { id: "ORDERS_READ", state: "AVAILABLE" },
    { id: "ORDERS_CREATE", state: "AVAILABLE" },
    { id: "ORDERS_WRITE", state: "AVAILABLE" },
    { id: "MODELS_READ", state: "AVAILABLE" },
    { id: "MODELS_WRITE", state: "AVAILABLE" },
    { id: "MEDIA_READ", state: "AVAILABLE" },
    { id: "MEDIA_WRITE", state: "AVAILABLE" },
    { id: "OPERATIONS_READ", state: "AVAILABLE" },
    { id: "HOLDS_WRITE", state: "AVAILABLE" },
    { id: "LOCATIONS_WRITE", state: "AVAILABLE" },
    { id: "OPERATIONS_WRITE", state: "AVAILABLE" },
    { id: "COLLECTIONS_READ", state: "AVAILABLE" },
    { id: "COLLECTIONS_WRITE", state: "AVAILABLE" },
    { id: "COLLECTION_MEMBERSHIP_WRITE", state: "UNAVAILABLE" },
  ],
  documents: [
    document({ href: "/studio/wardrobe", id: "service:wardrobe", identifiers: ["wardrobe", "garment", "piece"], kind: "Service", label: "Wardrobe" }),
    document({ href: "/studio/media", id: "service:atelier", identifiers: ["atelier", "media", "image"], kind: "Service", label: "Atelier" }),
    document({ entityId: "4b8b9d7e-37f8-4b2e-86dc-d2d345d35d2c", href: "/studio/wardrobe?collection=drop-02&scenario=lifecycle", id: "collection:4b8b9d7e-37f8-4b2e-86dc-d2d345d35d2c", identifiers: ["drop-02", "drop 02", "current drop"], kind: "Collection", label: "Drop 02", state: "ACTIVE", tokens: "drop-02 drop 02 current drop active" }),
    document({ availableActions: ["CREATE_HOLD", "CREATE_ORDER", "UPDATE_LOCATION"], entityId: "g-001", href: "/studio/wardrobe/g-001", id: "piece:g-001", identifiers: ["g-001", "JUW-001"], kind: "Piece", label: "Coral Drift Dress", mediaTargetId: "wardrobe-001", state: "READY", tokens: "g-001 juw-001 coral drift dress ready available dress coral" }),
    document({ availableActions: ["UPDATE_LOCATION"], entityId: "g-002", href: "/studio/wardrobe/g-002", id: "piece:g-002", identifiers: ["g-002", "JUW-002"], kind: "Piece", label: "Coral Mini Set", mediaTargetId: "wardrobe-002", state: "DRAFT", tokens: "g-002 juw-002 coral mini set draft private set coral" }),
    document({ availableActions: ["ADVANCE_ORDER", "CANCEL_ORDER", "REFUND_ORDER"], entityId: "ORD-001", href: "/studio/orders/ORD-001", id: "order:o-001", identifiers: ["o-001", "ORD-001", "JUW-001"], kind: "Order", label: "Order ORD-001", state: "ACTIVE", tokens: "o-001 ord-001 juw-001 order active payment delivery" }),
    document({ entityId: "lulu-v3", href: "/studio/models?view=authority", id: "model:lulu-v3", identifiers: ["lulu-v3", "Lulu", "LULU_V3"], kind: "Model", label: "Lulu", state: "READY", tokens: "lulu lulu-v3 identity face body canon consent styling ready" }),
    document({ entityId: "media-001", href: "/studio/media/media-001", id: "media:media-001", identifiers: ["media-001"], kind: "Media", label: "Coral front", state: "COMPLETE", tokens: "media-001 coral front complete garment front juw-001" }),
  ],
  provenance: {
    detail: "Lifecycle simulator · in-memory state",
    generatedAt: "2026-08-23T12:00:00.000Z",
    label: "Scenario preview",
    scenario: "lifecycle",
    status: "preview",
  },
  summary: { attention: 4, available: 1, drafts: 2, live: 2, orders: 1, review: 1 },
};
const connectedContext: StudioAssistantContext = {
  ...context,
  capabilities: context.capabilities.map((capability) => (
    capability.id === "COLLECTION_MEMBERSHIP_WRITE"
      ? { ...capability, state: "AVAILABLE" as const }
      : capability
  )),
  provenance: {
    detail: "Connected Studio application snapshot",
    generatedAt: context.provenance.generatedAt,
    label: "Live Studio",
    status: "connected",
  },
};

function block<TKind extends StudioAssistantBlock["kind"]>(
  response: ReturnType<typeof resolveStudioAssistant>,
  kind: TKind,
) {
  return response.blocks.find((candidate): candidate is Extract<StudioAssistantBlock, { kind: TKind }> => candidate.kind === kind);
}

test("status resolves into current metrics with visible provenance", () => {
  const response = resolveStudioAssistant("What needs attention today?", context);
  assert.equal(response.intent, "RESOLVE");
  assert.equal(response.risk, "R0");
  assert.equal(response.provenance.label, "Scenario preview");
  assert.deepEqual(block(response, "metrics")?.items.map((item) => [item.label, item.value]), [
    ["Attention", 4],
    ["Available", 1],
    ["Live", 2],
    ["Orders", 1],
  ]);
});

test("entry context accepts one exact projected piece and rejects guesses", () => {
  const byEntity = resolveStudioAssistantEntryPiece(context.documents, "g-001");
  const bySku = resolveStudioAssistantEntryPiece(context.documents, "juw001");

  assert.equal(byEntity?.id, "piece:g-001");
  assert.equal(bySku?.id, "piece:g-001");
  assert.equal(resolveStudioAssistantEntryPiece(context.documents, "Coral Drift Dress"), null);
  assert.equal(resolveStudioAssistantEntryPiece(context.documents, "missing-piece"), null);
});

test("an exact record status outranks the global summary", () => {
  const response = resolveStudioAssistant("What is the status of JUW-001?", context);
  assert.equal(block(response, "metrics"), undefined);
  assert.equal(block(response, "answer")?.title, "Coral Drift Dress");
  assert.equal(block(response, "results")?.items[0].href, "/studio/wardrobe/g-001?scenario=lifecycle");
});

test("piece search accepts the common JUW separator variants", () => {
  for (const query of ["JUW-001", "juw001", "juw 001"]) {
    const response = resolveStudioAssistant(query, context);
    assert.equal(block(response, "results")?.items[0]?.href, "/studio/wardrobe/g-001?scenario=lifecycle", query);
  }
});

test("a description follow-up carries only one freshly revalidated piece target", () => {
  const followUp = contextualizeStudioAssistantQuery([
    { role: "user", text: "Publish JUW-001" },
    { role: "assistant", text: "Open the owning workflow." },
    { role: "user", text: "What's its description?" },
  ], context);

  assert.equal(followUp, "What's its description? JUW-001");
  assert.doesNotMatch(followUp, /publish/i);
  assert.equal(block(resolveStudioAssistant(followUp, context), "answer")?.body, "Coral Drift Dress detail");
});

test("description follow-ups fail closed for ambiguity, stale targets and mutations", () => {
  const current = { role: "user" as const, text: "What's its description?" };
  assert.equal(contextualizeStudioAssistantQuery([
    { role: "user", text: "JUW-001 and JUW-002" },
    current,
  ], context), current.text);
  assert.equal(contextualizeStudioAssistantQuery([
    { role: "user", text: "JUW-999" },
    current,
  ], context), current.text);
  assert.equal(contextualizeStudioAssistantQuery([
    { role: "user", text: "JUW-001" },
    { role: "user", text: "Delete its description" },
  ], context), "Delete its description");

  const explicitOverride = contextualizeStudioAssistantQuery([
    { role: "user", text: "JUW-001" },
    { role: "user", text: "What's JUW-002's description?" },
  ], context);
  assert.equal(explicitOverride, "What's JUW-002's description?");
});

test("description words in another product cannot steal the carried SKU", () => {
  const misleadingContext: StudioAssistantContext = {
    ...context,
    documents: [
      ...context.documents,
      document({
        detail: "Its description is intentionally token-heavy.",
        entityId: "g-003",
        id: "piece:g-003",
        identifiers: ["g-003", "JUW-003"],
        kind: "Piece",
        label: "Token Trap Dress",
        tokens: "g-003 juw-003 token trap dress its description",
      }),
    ],
  };
  assert.equal(contextualizeStudioAssistantQuery([
    { role: "user", text: "JUW-002" },
    { role: "user", text: "What is its description?" },
  ], misleadingContext), "What is its description? JUW-002");
});

test("an attention summary outranks a matching service alias", () => {
  const response = resolveStudioAssistant("What needs attention?", {
    ...context,
    documents: [
      ...context.documents,
      document({
        href: "/studio/operations",
        id: "service:operations",
        identifiers: ["operations", "attention", "what needs attention"],
        kind: "Service",
        label: "Operations",
      }),
    ],
  });
  assert.equal(block(response, "answer")?.title, "Studio now");
  assert.ok(block(response, "metrics"));
});

test("unavailable connected summary values render as unavailable", () => {
  const response = resolveStudioAssistant("Studio status", {
    ...context,
    provenance: { detail: "Connected source unavailable", generatedAt: null, label: "Local preview", status: "degraded" },
    summary: { ...context.summary, attention: null, available: null, live: null, orders: null, review: null },
  });
  assert.match(block(response, "answer")?.body ?? "", /unavailable/i);
  assert.deepEqual(block(response, "metrics")?.items.map((item) => item.value), ["—", "—", "—", "—"]);
});

test("price changes resolve an exact SKU and preserve domain confirmation", () => {
  const response = resolveStudioAssistant("Change JUW-001 price", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CHANGE");
  assert.equal(response.risk, "R2");
  assert.equal(handoff?.action.href, "/studio/wardrobe/g-001?action=price&scenario=lifecycle#garment-lifecycle");
  assert.match(handoff?.consequence ?? "", /unchanged until you confirm/i);
});

test("ambiguous price change asks for the piece instead of guessing", () => {
  const response = resolveStudioAssistant("Change the coral price", context);
  const clarification = block(response, "clarification");
  assert.equal(response.risk, "R2");
  assert.equal(clarification?.title, "Which piece?");
  assert.ok((clarification?.options.length ?? 0) >= 2);
  assert.ok(clarification?.options.every((option) => option.prompt?.startsWith("Change ")));
  assert.equal(block(response, "handoff"), undefined);
});

test("clarification choices continue the original price workflow in chat", () => {
  const first = resolveStudioAssistant("Change the coral price", context);
  const selection = block(first, "clarification")?.options.find((option) => option.label === "Coral Drift Dress");
  assert.equal(selection?.prompt, "Change JUW-001 price");

  const continued = resolveStudioAssistant(selection!.prompt!, context);
  assert.equal(block(continued, "handoff")?.action.href, "/studio/wardrobe/g-001?action=price&scenario=lifecycle#garment-lifecycle");
});

test("clarification ranking ignores generic action words", () => {
  const noisyContext: StudioAssistantContext = {
    ...context,
    documents: [
      ...context.documents,
      document({
        entityId: "g-003",
        href: "/studio/wardrobe/g-003",
        id: "piece:g-003",
        identifiers: ["g-003", "JUW-003"],
        kind: "Piece",
        label: "Black Column Dress",
        state: "READY",
        tokens: "g-003 juw-003 black column dress ready price change review",
      }),
    ],
  };
  const response = resolveStudioAssistant("Change the coral price", noisyContext);
  const labels = block(response, "clarification")?.options.map((option) => option.label) ?? [];
  assert.equal(labels.includes("Black Column Dress"), false);
});

test("piece intake is a private draft handoff", () => {
  const response = resolveStudioAssistant("Add a new dress", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CREATE");
  assert.equal(response.risk, "R1");
  assert.equal(handoff?.action.href, "/studio/wardrobe?intake=1&scenario=lifecycle");
  assert.match(handoff?.consequence ?? "", /until intake is saved/i);
});

test("capability guidance distinguishes navigation from unavailable mutations", () => {
  const queries = ["What can you do?", "What can you help with?"];
  const responses = queries.map((query) => resolveStudioAssistant(query, context));
  for (const response of responses) {
    assert.equal(response.intent, "UNDERSTAND");
    assert.equal(block(response, "answer")?.title, "Studio guide");
    assert.equal(block(response, "results")?.title, "Services");
  }
  const answer = block(responses[0], "answer");
  const services = block(responses[0], "results")?.items ?? [];
  const media = services.find((item) => item.id === "capability:atelier");
  const orders = services.find((item) => item.id === "capability:orders");

  assert.equal(answer?.body, "Find records, check current status, and open the workflow that owns each change.");
  assert.equal(media?.href, "/studio/media?scenario=lifecycle");
  assert.equal(media?.detail, "Review media");
  assert.equal(orders?.href, "/studio/orders?scenario=lifecycle");
  assert.equal(orders?.detail, "Orders and returns");

  const targeted = resolveStudioAssistant("What can you help with for JUW-001?", context);
  assert.equal(block(targeted, "results")?.items[0]?.label, "Coral Drift Dress");
});

test("workflow responses add bounded suggestions and stable device-private task drafts", () => {
  const dress = resolveStudioAssistantWorkflow("Add a new dress", context);
  const shirt = resolveStudioAssistantWorkflow("Create a new shirt", context);

  assert.equal(dress.schemaVersion, "studio-assistant-workflow/v1");
  assert.ok(dress.suggestions.length >= 2 && dress.suggestions.length <= 3);
  assert.equal(dress.taskDraft?.schemaVersion, "studio-assistant-task/v1");
  assert.equal(dress.taskDraft?.state, "PROPOSED");
  assert.equal(dress.taskDraft?.storage, "DEVICE_PRIVATE");
  assert.equal(dress.taskDraft?.requiresOwningWorkflowConfirmation, true);
  assert.equal(dress.taskDraft?.action.href, "/studio/wardrobe?intake=1&scenario=lifecycle");
  assert.equal(dress.taskDraft?.id, shirt.taskDraft?.id);
});

test("ambiguous requests offer bounded help but never create a task", () => {
  const workflow = resolveStudioAssistantWorkflow("Change the coral price", context);
  assert.equal(workflow.taskDraft, null);
  assert.equal(workflow.suggestions.length, 2);
  assert.ok(workflow.response.blocks.some((candidate) => candidate.kind === "clarification"));
});

test("task drafts reject external and path-traversing handoffs", () => {
  for (const href of ["https://example.com/private", "/studio/../api/private"]) {
    const unsafeContext: StudioAssistantContext = {
      ...context,
      documents: [document({ href, id: "piece:unsafe", identifiers: ["unsafe"], kind: "Piece", label: "Unsafe record" })],
    };
    const workflow = resolveStudioAssistantWorkflow("Delete unsafe", unsafeContext);
    assert.equal(workflow.taskDraft, null);
  }
});

test("workflow fallback prose is concise and deterministic", () => {
  const workflow = resolveStudioAssistantWorkflow("Change JUW-001 price", context);
  const first = studioAssistantFallbackText(workflow);
  assert.equal(first, studioAssistantFallbackText(workflow));
  assert.match(first, /Change price/);
  assert.match(first, /unchanged until you confirm/i);
  assert.ok(first.length < 400);
});

test("preview collection language stays read only without membership-write readiness", () => {
  const response = resolveStudioAssistant("Switch JUW-001 to another drop", context);
  const handoff = block(response, "handoff");
  assert.equal(handoff?.action.href, "/studio/wardrobe/g-001?scenario=lifecycle");
  assert.match(handoff?.body ?? "", /cannot prove collection-membership write readiness/i);
  assert.equal(response.risk, "R0");
});

test("drop creation opens the shared preview and receipt flow", () => {
  const response = resolveStudioAssistant("Create a new drop", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CREATE");
  assert.equal(response.risk, "R1");
  assert.equal(handoff?.action.href, "/studio/wardrobe?collection=choose&dropAction=create&scenario=lifecycle");
  assert.match(handoff?.consequence ?? "", /stays private/i);
});

test("suggestion icon families resolve from stable prompt actions rather than display copy", () => {
  assert.equal(studioAssistantSuggestionFamily("What needs attention?"), "PRIORITIES");
  assert.equal(studioAssistantSuggestionFamily("What can you help with?"), "CAPABILITIES");
  assert.equal(studioAssistantSuggestionFamily("Show private Wardrobe drafts"), "PRIVATE_DRAFTS");
  assert.equal(studioAssistantSuggestionFamily("Open orders requiring action"), "ORDERS");
  assert.equal(studioAssistantSuggestionFamily("Check blockers for: Add a new dress"), "BLOCKERS");
  assert.equal(studioAssistantSuggestionFamily("Check impact for: Refund ORD-001"), "IMPACT");
  assert.equal(studioAssistantSuggestionFamily("Explain the workflow for: Publish JUW-001"), "WORKFLOW");
  assert.equal(studioAssistantSuggestionFamily("Explain the safe next step for: Move JUW-001"), "SAFE_NEXT");
  assert.equal(studioAssistantSuggestionFamily("A future safe prompt"), "GENERAL");
});

test("preview drop routes preserve the active scenario instead of assuming lifecycle", () => {
  const intakeErrorContext: StudioAssistantContext = {
    ...context,
    provenance: { ...context.provenance, scenario: "intake-error" },
    documents: context.documents.map((candidate) => candidate.kind === "Collection"
      ? { ...candidate, href: "/studio/wardrobe?collection=drop-02&scenario=intake-error" }
      : candidate),
  };
  const response = resolveStudioAssistant("Create a new drop", intakeErrorContext);
  assert.equal(block(response, "handoff")?.action.href, "/studio/wardrobe?collection=choose&dropAction=create&scenario=intake-error");
});

test("every preview route stays inside the active simulator scenario", () => {
  const workflows = [
    resolveStudioAssistant("Review publication readiness", context),
    resolveStudioAssistant("Open media", context),
    resolveStudioAssistant("Open inventory", context),
    resolveStudioAssistant("What can you help with?", context),
    resolveStudioAssistant("A request Studio cannot resolve", context),
  ];
  const hrefs = workflows.flatMap((workflow) => workflow.blocks.flatMap((candidate) => {
    if (candidate.kind === "handoff") return [candidate.action.href];
    if (candidate.kind === "results" || candidate.kind === "metrics") return candidate.items.map((item) => item.href);
    if (candidate.kind === "clarification") return candidate.options.map((option) => option.href);
    if (candidate.kind === "recovery") return candidate.actions.map((action) => action.href);
    return [];
  }));
  assert.ok(hrefs.length > 0);
  assert.ok(hrefs.every((href) => new URL(href, "https://studio.invalid").searchParams.get("scenario") === "lifecycle"));
});

test("drop lifecycle commands resolve an exact drop without executing from chat", () => {
  const rename = resolveStudioAssistant("Rename Drop 02", context);
  assert.equal(rename.risk, "R2");
  assert.match(block(rename, "handoff")?.action.href ?? "", /dropAction=manage/);
  assert.match(block(rename, "handoff")?.consequence ?? "", /preview and confirmation/i);

  const activate = resolveStudioAssistant("Activate Drop 02", context);
  assert.equal(activate.risk, "R0");
  assert.equal(block(activate, "answer")?.title, "Drop already active");
  assert.equal(block(activate, "handoff"), undefined);

  const archive = resolveStudioAssistant("Archive Drop 02", context);
  assert.equal(archive.intent, "CHANGE");
  assert.equal(archive.risk, "R3");
  assert.match(block(archive, "handoff")?.title ?? "", /Archive drop/i);
});

test("publication is always a high-impact review handoff", () => {
  const response = resolveStudioAssistant("Publish JUW-001", context);
  const handoff = block(response, "handoff");
  assert.equal(response.risk, "R3");
  assert.equal(handoff?.action.href, "/studio/wardrobe/g-001?scenario=lifecycle");
  assert.match(handoff?.consequence ?? "", /nothing goes live/i);
});

test("publication reads stay read only while explicit publish language stays high impact", () => {
  for (const query of ["Show public listing for JUW-001", "Open shop preview for JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.response.intent, "RESOLVE", query);
    assert.equal(workflow.taskDraft, null, query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/wardrobe/g-001", query);
  }

  const publish = resolveStudioAssistantWorkflow("Publish JUW-001", connectedContext);
  assert.equal(publish.response.risk, "R3");
  assert.ok(publish.taskDraft);
});

test("polite help prefixes preserve the requested workflow instead of opening generic help", () => {
  const publish = resolveStudioAssistant("Help me publish JUW-001", connectedContext);
  assert.equal(publish.risk, "R3");
  assert.equal(block(publish, "handoff")?.title, "Publish Coral Drift Dress");

  const price = resolveStudioAssistant("Help me change JUW-001 price", connectedContext);
  assert.equal(price.risk, "R2");
  assert.equal(block(price, "handoff")?.action.href, "/studio/wardrobe/g-001?action=price#garment-lifecycle");
});

test("finding a new piece does not imply garment intake", () => {
  for (const query of ["Find a new piece", "Show new pieces"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.notEqual(workflow.response.intent, "CREATE", query);
    assert.equal(workflow.taskDraft, null, query);
    const hrefs = workflow.response.blocks.flatMap((candidate) => candidate.kind === "handoff"
      ? [candidate.action.href]
      : candidate.kind === "results"
        ? candidate.items.map((item) => item.href)
        : []);
    assert.equal(hrefs.some((href) => href.includes("intake=1")), false, query);
  }
});

test("drop mutations fail closed when the server capability is read only", () => {
  const readOnlyContext: StudioAssistantContext = {
    ...context,
    capabilities: context.capabilities.map((capability) => capability.id === "COLLECTIONS_WRITE"
      ? { ...capability, state: "UNAVAILABLE" }
      : capability),
  };

  for (const query of ["Create a new drop", "Rename Drop 02", "Activate Drop 02", "Archive Drop 02"]) {
    const response = resolveStudioAssistant(query, readOnlyContext);
    assert.equal(response.risk, "R0");
    assert.equal(block(response, "handoff"), undefined);
    assert.equal(block(response, "answer")?.title, "Drop changes unavailable");
  }
});

test("sold-out and archived-draft history never produce active piece handoffs", () => {
  const historicalContext: StudioAssistantContext = {
    ...context,
    documents: [
      ...context.documents,
      document({
        href: "/studio/wardrobe/history-015",
        id: "piece:history-015",
        identifiers: ["history-015", "JUW-015"],
        kind: "Piece",
        label: "Cocoa Cowl Gathered Midi Dress",
        state: "SOLD_OUT",
      }),
      document({
        href: "/studio/wardrobe/history-024",
        id: "piece:history-024",
        identifiers: ["history-024", "JUW-024"],
        kind: "Piece",
        label: "Pale Gathered Bandeau Top",
        state: "ARCHIVED_DRAFT",
      }),
    ],
  };

  const price = resolveStudioAssistant("Change JUW-015 price", historicalContext);
  assert.equal(price.intent, "RESOLVE");
  assert.equal(price.risk, "R0");
  assert.equal(block(price, "handoff"), undefined);
  assert.equal(block(price, "answer")?.title, "Sold out history");

  for (const query of ["Publish JUW-024", "Prepare media for JUW-024", "Archive JUW-024"]) {
    const archived = resolveStudioAssistant(query, historicalContext);
    assert.equal(archived.intent, "RESOLVE");
    assert.equal(archived.risk, "R0");
    assert.equal(block(archived, "handoff"), undefined);
    assert.equal(block(archived, "answer")?.title, "Archived draft");
  }
});

test("media work carries the resolved garment into Atelier", () => {
  const response = resolveStudioAssistant("Prepare a try-on for JUW-002", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CREATE");
  assert.equal(handoff?.action.href, "/studio/media/new?garment=wardrobe-002&scenario=lifecycle");
  assert.match(handoff?.body ?? "", /connected garment authority/i);
  assert.match(handoff?.consequence ?? "", /model generation unavailable/i);
  assert.match(handoff?.consequence ?? "", /no generation starts/i);
});

test("exact object domains outrank broad garment, publication, and media verbs", () => {
  for (const query of ["Upload garment photo for JUW-001", "Create image for dress JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.intent, "CREATE", query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/media/new?garment=wardrobe-001", query);
    assert.notEqual(block(workflow.response, "handoff")?.action.href, "/studio/wardrobe?intake=1", query);
  }

  for (const query of ["Publish order ORD-001", "Generate order receipt for ORD-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(block(workflow.response, "results")?.items[0].href, "/studio/orders/ORD-001", query);
    assert.equal(workflow.taskDraft, null, query);
  }
});

test("media work never falls through to a different garment without connected authority", () => {
  const withoutMediaAuthority: StudioAssistantContext = {
    ...context,
    documents: context.documents.map((candidate) => candidate.id === "piece:g-002"
      ? { ...candidate, mediaTargetId: undefined }
      : candidate),
  };
  const response = resolveStudioAssistant("Prepare a try-on for JUW-002", withoutMediaAuthority);
  const handoff = block(response, "handoff");
  assert.equal(handoff?.action.href, "/studio/wardrobe/g-002?scenario=lifecycle");
  assert.match(handoff?.consequence ?? "", /will not select or generate for a different garment/i);
});

test("model and order requests resolve their canonical records", () => {
  const model = resolveStudioAssistant("Show Lulu identity", context);
  assert.equal(block(model, "results")?.items[0].href, "/studio/models?view=authority&scenario=lifecycle");

  const order = resolveStudioAssistant("Open order ORD-001", context);
  assert.equal(block(order, "results")?.items[0].href, "/studio/orders/ORD-001?scenario=lifecycle");

  const navigatedOrder = resolveStudioAssistant("Take me to order ORD-001", context);
  assert.equal(block(navigatedOrder, "results")?.items[0].href, "/studio/orders/ORD-001?scenario=lifecycle");
});

test("exact media reads and model intake use canonical guarded routes", () => {
  const media = resolveStudioAssistantWorkflow("Open media media-001", connectedContext);
  assert.equal(media.response.risk, "R0");
  assert.equal(block(media.response, "results")?.items[0].href, "/studio/media/media-001");
  assert.equal(media.taskDraft, null);

  const model = resolveStudioAssistantWorkflow("Add a new model", connectedContext);
  assert.equal(model.response.risk, "R2");
  assert.equal(block(model.response, "handoff")?.action.href, "/studio/models?intake=model");
  assert.ok(model.taskDraft);

  const readOnlyModels: StudioAssistantContext = {
    ...connectedContext,
    capabilities: connectedContext.capabilities.map((capability) => capability.id === "MODELS_WRITE"
      ? { ...capability, state: "UNAVAILABLE" }
      : capability),
  };
  const blocked = resolveStudioAssistantWorkflow("Add a new model", readOnlyModels);
  assert.equal(blocked.response.risk, "R0");
  assert.equal(blocked.taskDraft, null);
});

test("customer-order creation outranks garment intake and opens the guarded order form", () => {
  const response = resolveStudioAssistant("Create an order for Coral Drift Dress", connectedContext);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CREATE");
  assert.equal(response.risk, "R3");
  assert.equal(handoff?.title, "New order for Coral Drift Dress");
  assert.equal(handoff?.action.href, "/studio/orders?action=create&piece=JUW-001");
  assert.match(handoff?.consequence ?? "", /no order or stock reservation is created/i);
});

test("order creation is target-bound in connected Studio and read only in preview", () => {
  const connected = resolveStudioAssistantWorkflow("Create a customer order for JUW-001", connectedContext);
  assert.equal(block(connected.response, "handoff")?.action.href, "/studio/orders?action=create&piece=JUW-001");
  assert.ok(connected.taskDraft);

  const preview = resolveStudioAssistantWorkflow("Create a customer order for JUW-001", context);
  assert.equal(preview.response.risk, "R0");
  assert.equal(block(preview.response, "answer")?.title, "Order creation unavailable in preview");
  assert.equal(preview.taskDraft, null);
});

test("existing-order language resolves positive work without inventing a later transition", () => {
  const prepare = resolveStudioAssistantWorkflow("Prepare order ORD-001 for dispatch", connectedContext);
  assert.equal(prepare.response.risk, "R2");
  assert.equal(block(prepare.response, "handoff")?.action.href, "/studio/orders/ORD-001#studio-order-next-action");
  assert.match(block(prepare.response, "handoff")?.body ?? "", /authoritative next action/i);
  assert.ok(prepare.taskDraft);

  const createReturn = resolveStudioAssistant("Create a return for order ORD-001", connectedContext);
  assert.equal(createReturn.risk, "R0");
  assert.equal(block(createReturn, "results")?.items[0].href, "/studio/orders/ORD-001");
  assert.equal(block(createReturn, "handoff"), undefined);
});

test("exact and unknown order references never expand into fuzzy substitutes", () => {
  const exact = resolveStudioAssistant("Open order ORD-001", connectedContext);
  assert.deepEqual(block(exact, "results")?.items.map((item) => item.label), ["Order ORD-001"]);

  const unknown = resolveStudioAssistant("Open order ORD-999", connectedContext);
  assert.equal(block(unknown, "answer")?.title, "Order not found");
  assert.equal(block(unknown, "handoff")?.action.href, "/studio/orders?search=ORD-999");
  assert.equal(block(unknown, "results"), undefined);

  const conflicting = resolveStudioAssistantWorkflow("Open order ORD-999 for JUW-001", connectedContext);
  assert.equal(block(conflicting.response, "answer")?.title, "Order not found");
  assert.equal(block(conflicting.response, "handoff")?.action.href, "/studio/orders?search=ORD-999");
  assert.equal(conflicting.taskDraft, null);
});

test("shared SKU aliases list every matching order instead of selecting a customer record", () => {
  const multipleOrders: StudioAssistantContext = {
    ...connectedContext,
    documents: [
      ...connectedContext.documents,
      document({
        availableActions: ["CANCEL_ORDER"],
        entityId: "ORD-002",
        href: "/studio/orders/ORD-002",
        id: "order:o-002",
        identifiers: ["o-002", "ORD-002", "JUW-001"],
        kind: "Order",
        label: "Order ORD-002",
        state: "ACTIVE",
        tokens: "o-002 ord-002 juw-001 order active",
      }),
    ],
  };
  const workflow = resolveStudioAssistantWorkflow("Open order for JUW-001", multipleOrders);
  assert.deepEqual(
    block(workflow.response, "results")?.items.map((item) => item.href).sort(),
    ["/studio/orders/ORD-001", "/studio/orders/ORD-002"],
  );
  assert.equal(workflow.taskDraft, null);
});

test("longer piece and order identifiers never bind to shorter records", () => {
  for (const query of [
    "Change JUW-0010 price",
    "Publish JUW-0010",
    "Prepare media for JUW-0010",
    "Hold JUW-0010",
    "Create customer order for JUW-0010",
    "Cancel JUW-0010",
  ]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(block(workflow.response, "answer")?.title, "Piece not found", query);
    assert.equal(workflow.taskDraft, null, query);
  }

  const orderRead = resolveStudioAssistantWorkflow("Open order ORD-0010", connectedContext);
  assert.equal(block(orderRead.response, "answer")?.title, "Order not found");
  assert.equal(orderRead.taskDraft, null);
  const orderCancel = resolveStudioAssistantWorkflow("Cancel order ORD-0010", connectedContext);
  assert.equal(block(orderCancel.response, "clarification")?.title, "Which exact order?");
  assert.equal(orderCancel.taskDraft, null);
});

test("degraded write readiness suppresses price, publication, media, order, and hold tasks", () => {
  const degraded: StudioAssistantContext = {
    ...connectedContext,
    capabilities: connectedContext.capabilities.map((capability) => (
      ["WARDROBE_WRITE", "MEDIA_WRITE", "ORDERS_CREATE", "HOLDS_WRITE"].includes(capability.id)
        ? { ...capability, state: "UNAVAILABLE" as const }
        : capability
    )),
    provenance: { ...connectedContext.provenance, detail: "Connected authority unavailable", label: "Studio snapshot", status: "degraded" },
  };
  for (const query of ["Change JUW-001 price", "Publish JUW-001", "Prepare media for JUW-001", "Create a customer order for JUW-001", "Hold JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, degraded);
    assert.equal(workflow.response.risk, "R0");
    assert.equal(block(workflow.response, "handoff"), undefined);
    assert.equal(workflow.taskDraft, null);
  }
});

test("piece and SKU aliases produce one clarification choice per canonical record", () => {
  const duplicated: StudioAssistantContext = {
    ...connectedContext,
    documents: [
      ...connectedContext.documents,
      document({
        entityId: "JUW-001",
        href: "/studio/wardrobe/g-001",
        id: "sku:JUW-001",
        identifiers: ["JUW-001", "Coral Drift Dress"],
        kind: "Piece",
        label: "JUW-001",
        mediaTargetId: "wardrobe-001",
        state: "READY",
        tokens: "juw-001 coral drift dress ready",
      }),
    ],
  };
  const options = block(resolveStudioAssistant("Change coral price", duplicated), "clarification")?.options ?? [];
  assert.equal(new Set(options.map((option) => option.href)).size, options.length);
});

test("media creation vocabulary stays in exact garment Media workflows", () => {
  for (const query of [
    "Create front view for garment JUW-001",
    "Create garment view 05 for JUW-001",
    "Generate front view for garment JUW-001",
    "Create catalogue shot for dress JUW-001",
    "Add product photos to JUW-001",
    "Create the front, back and detail photos in order for JUW-001",
    "Create order photos for JUW-001",
  ]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R2", query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/media/new?garment=wardrobe-001", query);
    assert.ok(workflow.taskDraft, query);
  }
});

test("collection media language never creates, archives, or reassigns a drop", () => {
  for (const query of ["Create photos for Drop 02", "Create collection image for Drop 02"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(block(workflow.response, "clarification")?.title, "Which piece?", query);
    assert.equal(workflow.taskDraft, null, query);
    assert.equal(block(workflow.response, "handoff"), undefined, query);
  }
  const archive = resolveStudioAssistantWorkflow("Archive images for Drop 02", connectedContext);
  assert.equal(archive.response.risk, "R0");
  assert.equal(block(archive.response, "handoff")?.action.href, "/studio/media");
  assert.equal(archive.taskDraft, null);
});

test("order-contained nouns never fall into garment or collection creation", () => {
  for (const query of [
    "Add item to order ORD-001",
    "Add product to order ORD-001",
    "Create collection for order ORD-001",
  ]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(block(workflow.response, "results")?.items[0].href, "/studio/orders/ORD-001", query);
    assert.equal(workflow.taskDraft, null, query);
  }
});

test("collection membership requests hand off to the guarded Piece change-drop flow", () => {
  for (const query of [
    "Add JUW-001 to Drop 02",
    "Add Coral Drift Dress to collection Drop 02",
    "Remove JUW-001 from Drop 02",
    "Release Coral Drift Dress from collection Drop 02",
  ]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R3", query);
    assert.equal(block(workflow.response, "handoff")?.title, "Change Coral Drift Dress drop", query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/wardrobe/g-001?action=drop", query);
    assert.match(block(workflow.response, "handoff")?.consequence ?? "", /nothing moves until/i, query);
    assert.ok(workflow.taskDraft, query);
  }
});

test("collection membership requests fail closed without exact write readiness", () => {
  const readOnlyContext: StudioAssistantContext = {
    ...connectedContext,
    capabilities: connectedContext.capabilities.map((capability) => (
      capability.id === "COLLECTION_MEMBERSHIP_WRITE"
        ? { ...capability, state: "UNAVAILABLE" as const }
        : capability
    )),
  };
  const workflow = resolveStudioAssistantWorkflow("Move JUW-001 to Drop 02", readOnlyContext);
  assert.equal(workflow.response.risk, "R0");
  assert.equal(block(workflow.response, "handoff")?.title, "Collection move unavailable");
  assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/wardrobe/g-001");
  assert.equal(workflow.taskDraft, null);
});

test("navigation containing new remains read only", () => {
  for (const query of ["Show new order", "Find new order", "Open new order", "Review new order"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }
  for (const query of ["Show new drop", "Find new collection", "Open new drop", "Review new collection"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }
});

test("listing reads stay read only unless sale publication is explicit", () => {
  for (const query of ["List all public pieces", "List published garments", "List items in Shop", "List JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }
  const publish = resolveStudioAssistantWorkflow("List JUW-001 for sale", connectedContext);
  assert.equal(publish.response.risk, "R3");
  assert.ok(publish.taskDraft);
});

test("clarifications expose only targets eligible for the requested action", () => {
  const eligibilityContext: StudioAssistantContext = {
    ...connectedContext,
    documents: [
      ...connectedContext.documents,
      document({ entityId: "g-sold", href: "/studio/wardrobe/g-sold", id: "piece:g-sold", identifiers: ["JUW-SOLD"], kind: "Piece", label: "Coral Sold Dress", state: "SOLD_OUT", tokens: "coral sold dress price hold" }),
      document({ availableActions: ["RELEASE_HOLD", "UPDATE_LOCATION"], entityId: "g-held", href: "/studio/wardrobe/g-held", id: "piece:g-held", identifiers: ["JUW-HELD"], kind: "Piece", label: "Coral Held Dress", state: "RESERVED", tokens: "coral held dress hold reservation" }),
      document({ entityId: "drop-draft", href: "/studio/wardrobe?collection=drop-draft", id: "collection:drop-draft", identifiers: ["drop-draft", "Draft Drop"], kind: "Collection", label: "Draft Drop", state: "DRAFT", tokens: "draft drop collection" }),
      document({ entityId: "drop-archived", href: "/studio/wardrobe?collection=drop-archived", id: "collection:drop-archived", identifiers: ["drop-archived", "Archived Drop"], kind: "Collection", label: "Archived Drop", state: "ARCHIVED", tokens: "archived drop collection" }),
    ],
  };

  const priceLabels = block(resolveStudioAssistant("Change coral price", eligibilityContext), "clarification")?.options.map((option) => option.label) ?? [];
  assert.equal(priceLabels.includes("Coral Sold Dress"), false);
  const holdLabels = block(resolveStudioAssistant("Hold coral", eligibilityContext), "clarification")?.options.map((option) => option.label) ?? [];
  assert.equal(holdLabels.includes("Coral Held Dress"), false);
  const releaseLabels = block(resolveStudioAssistant("Release hold for coral", eligibilityContext), "clarification")?.options.map((option) => option.label) ?? [];
  assert.deepEqual(releaseLabels, ["Coral Held Dress"]);
  const activateLabels = block(resolveStudioAssistant("Activate drop", eligibilityContext), "clarification")?.options.map((option) => option.label) ?? [];
  assert.deepEqual(activateLabels, ["Draft Drop"]);
  const archiveLabels = block(resolveStudioAssistant("Archive drop", eligibilityContext), "clarification")?.options.map((option) => option.label) ?? [];
  assert.equal(archiveLabels.includes("Archived Drop"), false);

  const archivedActivation = resolveStudioAssistantWorkflow("Activate drop-archived", eligibilityContext);
  assert.equal(archivedActivation.response.risk, "R0");
  assert.equal(archivedActivation.taskDraft, null);
  assert.equal(block(archivedActivation.response, "answer")?.title, "Drop cannot be activated");
});

test("destructive subresource language cannot authorize a whole-record reversal", () => {
  const exactMedia = resolveStudioAssistantWorkflow("Remove media media-001", connectedContext);
  assert.equal(exactMedia.response.risk, "R3");
  assert.equal(block(exactMedia.response, "handoff")?.action.href, "/studio/media/media-001");

  for (const query of ["Delete photo for JUW-001", "Archive media for JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }
  for (const query of ["Delete price for JUW-001", "Remove description from JUW-001", "Delete measurements for JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(block(workflow.response, "handoff")?.title, "Field removal unavailable", query);
    assert.equal(workflow.taskDraft, null, query);
  }
  for (const query of ["Remove item from order ORD-001", "Delete note for order ORD-001", "Delete payment receipt for order ORD-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(block(workflow.response, "results")?.items[0].href, "/studio/orders/ORD-001", query);
    assert.equal(workflow.taskDraft, null, query);
  }
  for (const query of ["Release stock for JUW-001", "Remove JUW-001 from inventory", "Delete stock count for JUW-001", "Withdraw JUW-001 from stock"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/operations?view=inventory&piece=JUW-001", query);
    assert.equal(workflow.taskDraft, null, query);
  }
});

test("location work requires exact per-piece Studio custody", () => {
  const move = resolveStudioAssistantWorkflow("Move JUW-001 to packing shelf", connectedContext);
  assert.equal(move.response.risk, "R2");
  assert.equal(block(move.response, "handoff")?.action.href, "/studio/operations?view=inventory&action=location&piece=JUW-001");
  assert.ok(move.taskDraft);

  const outsideCustody: StudioAssistantContext = {
    ...connectedContext,
    documents: connectedContext.documents.map((candidate) => candidate.id === "piece:g-001"
      ? { ...candidate, availableActions: ["CANCEL_ORDER"], detail: "With courier" }
      : candidate),
  };
  const blocked = resolveStudioAssistantWorkflow("Move JUW-001 to packing shelf", outsideCustody);
  assert.equal(blocked.response.risk, "R0");
  assert.equal(blocked.taskDraft, null);
  assert.equal(block(blocked.response, "handoff")?.title, "Location change not available");
});

test("targetless customer orders clarify to eligible pieces instead of opening an unsafe picker", () => {
  const workflow = resolveStudioAssistantWorkflow("Create customer order", connectedContext);
  assert.equal(block(workflow.response, "clarification")?.title, "Which piece?");
  assert.deepEqual(block(workflow.response, "clarification")?.options.map((option) => option.label), ["Coral Drift Dress"]);
  assert.equal(block(workflow.response, "handoff"), undefined);
  assert.equal(workflow.taskDraft, null);
});

test("targetless destructive requests cannot become saved tasks", () => {
  const workflow = resolveStudioAssistantWorkflow("Delete a Studio record", connectedContext);
  assert.equal(workflow.response.risk, "R3");
  assert.equal(block(workflow.response, "clarification")?.title, "Which exact record?");
  assert.equal(block(workflow.response, "handoff"), undefined);
  assert.equal(workflow.taskDraft, null);
});

test("inventory and hold requests deep-link the exact piece into guarded Operations", () => {
  const inventory = resolveStudioAssistant("Where is JUW-002 stock?", connectedContext);
  assert.equal(inventory.risk, "R0");
  assert.equal(block(inventory, "handoff")?.action.href, "/studio/operations?view=inventory&piece=JUW-002");

  const hold = resolveStudioAssistantWorkflow("Hold JUW-001", connectedContext);
  assert.equal(hold.response.risk, "R2");
  assert.equal(block(hold.response, "handoff")?.action.href, "/studio/operations?view=holds&action=hold&piece=JUW-001");
  assert.ok(hold.taskDraft);

  const previewHold = resolveStudioAssistantWorkflow("Hold JUW-001", context);
  assert.equal(previewHold.response.risk, "R0");
  assert.equal(previewHold.taskDraft, null);
});

test("hold status and release language never open the create-hold form", () => {
  const review = resolveStudioAssistantWorkflow("Show hold for JUW-001", connectedContext);
  assert.equal(review.response.risk, "R0");
  assert.equal(block(review.response, "handoff")?.action.href, "/studio/operations?view=holds&piece=JUW-001");
  assert.equal(review.taskDraft, null);

  const activeHoldContext: StudioAssistantContext = {
    ...connectedContext,
    documents: connectedContext.documents.map((candidate) => candidate.id === "piece:g-001"
      ? { ...candidate, availableActions: ["RELEASE_HOLD"], state: "RESERVED" }
      : candidate),
  };
  const release = resolveStudioAssistantWorkflow("Remove hold for JUW-001", activeHoldContext);
  assert.equal(release.response.risk, "R3");
  assert.equal(block(release.response, "handoff")?.action.href, "/studio/operations?view=holds&action=release&piece=JUW-001");
  assert.ok(release.taskDraft);
});

test("hold and order task drafts require exact projected eligibility", () => {
  const reservedWithoutHold: StudioAssistantContext = {
    ...connectedContext,
    documents: connectedContext.documents.map((candidate) => candidate.id === "piece:g-001"
      ? { ...candidate, availableActions: [], state: "RESERVED" }
      : candidate),
  };
  for (const query of ["Hold JUW-001", "Create a customer order for JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, reservedWithoutHold);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }

  const release = resolveStudioAssistantWorkflow("Remove hold for JUW-001", connectedContext);
  assert.equal(release.response.risk, "R0");
  assert.equal(block(release.response, "handoff")?.title, "No active hold to release");
  assert.equal(release.taskDraft, null);

  const mismatchedLocation: StudioAssistantContext = {
    ...connectedContext,
    documents: connectedContext.documents.map((candidate) => candidate.id === "piece:g-001"
      ? { ...candidate, availableActions: [], detail: "Dress · Coral · location mismatch", state: "AVAILABLE" }
      : candidate),
  };
  for (const query of ["Hold JUW-001", "Create a customer order for JUW-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, mismatchedLocation);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }
});

test("destructive order requests require one exact order reference", () => {
  const skuOnly = resolveStudioAssistantWorkflow("Cancel order for JUW-001", connectedContext);
  assert.equal(block(skuOnly.response, "clarification")?.title, "Which exact order?");
  assert.equal(block(skuOnly.response, "handoff"), undefined);
  assert.equal(skuOnly.taskDraft, null);

  const exact = resolveStudioAssistantWorkflow("Cancel order ORD-001", connectedContext);
  assert.equal(block(exact.response, "handoff")?.action.href, "/studio/orders/ORD-001");
  assert.equal(block(exact.response, "handoff")?.title, "Review order reversal");
  assert.ok(exact.taskDraft);
});

test("reservation, hold, and order language stays in its explicit domain", () => {
  const reserveOrder = resolveStudioAssistantWorkflow("Reserve order for JUW-001", connectedContext);
  assert.equal(reserveOrder.response.intent, "CREATE");
  assert.equal(block(reserveOrder.response, "handoff")?.action.href, "/studio/orders?action=create&piece=JUW-001");

  const cancelReservation = resolveStudioAssistantWorkflow("Cancel reservation for order ORD-001", connectedContext);
  assert.equal(cancelReservation.response.intent, "REVERSE");
  assert.equal(block(cancelReservation.response, "handoff")?.action.href, "/studio/orders/ORD-001");

  const showReservation = resolveStudioAssistantWorkflow("Show reservation for order ORD-001", connectedContext);
  assert.equal(showReservation.response.risk, "R0");
  assert.equal(block(showReservation.response, "results")?.items[0].href, "/studio/orders/ORD-001");

  const hold = resolveStudioAssistantWorkflow("Hold JUW-001 for pickup", connectedContext);
  assert.equal(block(hold.response, "handoff")?.action.href, "/studio/operations?view=holds&action=hold&piece=JUW-001");

  for (const query of ["Refund order ORD-001", "Cancel ORD-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    assert.equal(workflow.response.risk, "R3", query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/orders/ORD-001", query);
    assert.ok(workflow.taskDraft, query);
  }
});

test("terminal orders do not create cancellation or refund tasks", () => {
  const terminal: StudioAssistantContext = {
    ...connectedContext,
    documents: connectedContext.documents.map((candidate) => candidate.kind === "Order"
      ? { ...candidate, availableActions: [], state: "CANCELLED" }
      : candidate),
  };
  for (const query of ["Cancel order ORD-001", "Refund order ORD-001"]) {
    const workflow = resolveStudioAssistantWorkflow(query, terminal);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
    assert.equal(block(workflow.response, "handoff")?.action.href, "/studio/orders/ORD-001", query);
  }
});

test("the schema-approved workflow matrix stays bounded, canonical, and task-safe", () => {
  const queries = [
    "What needs attention?",
    "Find JUW-001",
    "Add a new dress",
    "Change JUW-001 price",
    "Create a new drop",
    "Rename Drop 02",
    "Activate Drop 02",
    "Archive Drop 02",
    "Publish JUW-001",
    "Prepare media for JUW-001",
    "Show Lulu identity",
    "Open order ORD-001",
    "Create a customer order for JUW-001",
    "Cancel order ORD-001",
    "Where is JUW-001 stock?",
    "Hold JUW-001",
    "Show hold for JUW-001",
    "Release hold for JUW-001",
    "Delete JUW-001",
  ];

  for (const query of queries) {
    const workflow = resolveStudioAssistantWorkflow(query, connectedContext);
    const handoffs = workflow.response.blocks.filter((candidate) => candidate.kind === "handoff");
    const clarifications = workflow.response.blocks.filter((candidate) => candidate.kind === "clarification");
    assert.equal(workflow.schemaVersion, "studio-assistant-workflow/v1", query);
    assert.ok(handoffs.length <= 1, query);
    assert.ok(workflow.suggestions.length >= 1 && workflow.suggestions.length <= 3, query);
    for (const handoff of handoffs) {
      assert.match(handoff.action.href, /^\/studio(?:\/|\?|$)/, query);
    }
    if (clarifications.length) assert.equal(workflow.taskDraft, null, query);
    if (workflow.taskDraft) {
      assert.ok(handoffs[0] && handoffs[0].risk !== "R0", query);
      assert.deepEqual(workflow.taskDraft.action, handoffs[0].action, query);
    }
  }
});

test("scenario capability truth suppresses every mutation task while keeping reads useful", () => {
  const scenarioReadOnly: StudioAssistantContext = {
    ...context,
    capabilities: context.capabilities.map((capability) => (
      ["WARDROBE_WRITE", "ORDERS_CREATE", "ORDERS_WRITE", "MODELS_WRITE", "MEDIA_WRITE", "HOLDS_WRITE", "LOCATIONS_WRITE", "OPERATIONS_WRITE", "COLLECTIONS_WRITE", "COLLECTION_MEMBERSHIP_WRITE"].includes(capability.id)
        ? { ...capability, state: "UNAVAILABLE" as const }
        : capability.id === "MODELS_READ"
          ? { ...capability, state: "UNAVAILABLE" as const }
          : capability
    )),
  };
  const mutationQueries = [
    "Add a new dress",
    "Change JUW-001 price",
    "Create a new drop",
    "Archive Drop 02",
    "Move JUW-001 to Drop 02",
    "Publish JUW-001",
    "Prepare media for JUW-001",
    "Create a customer order for JUW-001",
    "Hold JUW-001",
    "Release hold for JUW-001",
    "Cancel order ORD-001",
    "Delete JUW-001",
    "Remove media media-001",
    "Edit Lulu model",
  ];
  for (const query of mutationQueries) {
    const workflow = resolveStudioAssistantWorkflow(query, scenarioReadOnly);
    assert.equal(workflow.response.risk, "R0", query);
    assert.equal(workflow.taskDraft, null, query);
  }
  const read = resolveStudioAssistantWorkflow("Show hold for JUW-001", scenarioReadOnly);
  assert.equal(read.response.risk, "R0");
  assert.equal(block(read.response, "handoff")?.action.href, "/studio/operations?view=holds&piece=JUW-001&scenario=lifecycle");
});

test("generic payment guidance opens Orders without claiming reservation readiness", () => {
  const response = resolveStudioAssistant("Open payment work", {
    ...context,
    documents: context.documents.filter((candidate) => candidate.kind !== "Order"),
  });
  const handoff = block(response, "handoff");

  assert.equal(handoff?.action.href, "/studio/orders?scenario=lifecycle");
  assert.match(handoff?.body ?? "", /review existing payment evidence/i);
  assert.match(handoff?.consequence ?? "", /cannot create a payment reservation/i);
  assert.match(handoff?.consequence ?? "", /checkout must first show configured payment details/i);
  assert.match(handoff?.consequence ?? "", /no stock is reserved/i);
});

test("destructive language never executes from chat", () => {
  const preview = resolveStudioAssistantWorkflow("Delete JUW-001", context);
  assert.equal(preview.response.risk, "R0");
  assert.equal(block(preview.response, "answer")?.title, "Reversal unavailable in preview");
  assert.equal(preview.taskDraft, null);

  const connected = resolveStudioAssistant("Delete JUW-001", connectedContext);
  assert.equal(connected.intent, "REVERSE");
  assert.equal(connected.risk, "R3");
  assert.match(block(connected, "handoff")?.consequence ?? "", /never delete/i);
});

test("unknown requests recover into the four primary operating stacks", () => {
  const response = resolveStudioAssistant("make everything magical", context);
  const recovery = block(response, "recovery");
  assert.equal(response.intent, "ORCHESTRATE");
  assert.deepEqual(recovery?.actions.map((action) => action.label), ["Wardrobe", "Atelier", "Orders", "Operations"]);
});

test("follow-up suggestions preserve the workflow target and resolve usefully", () => {
  const price = resolveStudioAssistantWorkflow("Change JUW-001 price", context);
  const impact = price.suggestions.find((suggestion) => suggestion.label === "Check impact");
  assert.match(impact?.prompt ?? "", /JUW-001/);
  const impactResponse = resolveStudioAssistant(impact!.prompt, context);
  assert.equal(impactResponse.intent, "UNDERSTAND");
  assert.equal(block(impactResponse, "answer")?.title, "Before you confirm");
  assert.equal(block(impactResponse, "handoff")?.action.href, "/studio/wardrobe/g-001?action=price&scenario=lifecycle#garment-lifecycle");

  const status = resolveStudioAssistantWorkflow("What needs attention?", context);
  assert.equal(status.suggestions.find((suggestion) => suggestion.label === "Choose the next task")?.prompt, "What needs attention?");
});

test("the durable route replaces the fake modal modes and preserves keyboard and session recovery", () => {
  const commandCenter = readFileSync(`${root}/components/studio/navigation/studio-command-center.tsx`, "utf8");
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");
  const orders = readFileSync(`${root}/components/studio/connected-order-inbox.tsx`, "utf8");
  const operations = readFileSync(`${root}/components/studio/operations-desk.tsx`, "utf8");
  const ordersRoute = readFileSync(`${root}/app/api/studio/orders/route.ts`, "utf8");
  const models = readFileSync(`${root}/components/studio/model-atelier.tsx`, "utf8");
  const styles = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");
  const stack = readFileSync(`${root}/components/studio/navigation/studio-stack-context.tsx`, "utf8");
  const page = readFileSync(`${root}/app/(studio)/studio/ask/page.tsx`, "utf8");

  assert.match(commandCenter, /currentWardrobePieceId\(pathname\)/);
  assert.match(commandCenter, /`\/studio\/ask\?piece=\$\{encodeURIComponent\(currentPieceId\)\}`/);
  assert.match(commandCenter, /href=\{askHref\}/);
  assert.doesNotMatch(commandCenter, /askMode|aria-label="Ask Studio mode"|Read-only agent/);
  assert.match(surface, /window\.sessionStorage/);
  assert.match(surface, /map\(\(turn\) => turn\.query\)/);
  assert.match(surface, /resolveStudioAssistantWorkflow\(stored, context\)/);
  assert.match(surface, /useChat<StudioAssistantUIMessage>/);
  assert.match(surface, /new DefaultChatTransport<StudioAssistantUIMessage>/);
  assert.match(surface, /sendMessage\(\{[\s\S]*?id: active\.id,[\s\S]*?parts: \[\{ text: cleanQuery, type: "text" \}\],[\s\S]*?role: "user"/);
  assert.doesNotMatch(surface, /sendMessage\(\{ messageId: active\.id/);
  assert.match(surface, /if \(studio\.scenario\) \{[\s\S]*?addFallback\(active\)/);
  assert.match(surface, /contextualizeStudioAssistantQuery\([\s\S]*?conversation\.map\([\s\S]*?resolveStudioAssistantWorkflow\(contextualQuery, context\)/);
  assert.match(surface, /detail: document\.description\?\.trim\(\) \|\| document\.secondaryLabel/);
  assert.match(surface, /detail: garment\.publicDescription\?\.trim\(\)/);
  assert.match(surface, /detail: piece\.description\?\.trim\(\)/);
  assert.match(surface, /MessageResponse/);
  assert.match(surface, /StudioDecisionSheet/);
  assert.match(surface, /flightRef\.current/);
  assert.match(surface, /TASKS_STORAGE_KEY/);
  assert.doesNotMatch(surface, /window\.setTimeout/);
  assert.match(surface, /event\.key !== "Enter" \|\| event\.shiftKey/);
  assert.doesNotMatch(surface, /Changes finish in their owning stack/);
  assert.match(surface, /placeholder="Ask about Studio or find a record"/);
  assert.doesNotMatch(surface, /Change JUW-001 price|Prepare media for JUW-003/);
  assert.match(surface, /context\.continueAction/);
  assert.match(surface, /resolveStudioAssistantEntryPiece\(context\.documents, entryPieceTarget\)/);
  assert.match(surface, /const entryPieceAction = entryPiece && entryPieceReference/);
  assert.match(surface, /className=\{hasConversation \? "studio-ask-entry-context is-thread" : "studio-ask-entry-context"\}/);
  assert.match(surface, /\{hasConversation \? entryPieceAction : null\}/);
  assert.match(surface, /\{entryPieceAction\}/);
  assert.match(surface, /What can you help with for \$\{entryPieceReference\}\?/);
  assert.match(surface, /option\.prompt/);
  assert.match(orders, /searchParams\.get\("action"\) !== "create"/);
  assert.match(orders, /searchParams\.get\("piece"\)/);
  assert.match(orders, /searchParams\.get\("search"\)/);
  assert.match(orders, /resolveExactOrderHandoffPiece\(products, requestedPiece\)/);
  assert.match(operations, /searchParams\.get\("piece"\)/);
  assert.match(operations, /action === "hold"/);
  assert.match(operations, /action === "release"/);
  assert.match(operations, /action === "location"/);
  assert.match(operations, /holdPendingRef\.current/);
  assert.match(operations, /HOLD_INTENT_STORAGE_KEY/);
  assert.match(operations, /detailMutationPendingRef\.current/);
  assert.match(operations, /StudioDecisionSheet/);
  assert.match(operations, /Releasing this hold/);
  assert.match(operations, /LOCATION_INTENT_STORAGE_KEY/);
  assert.ok((operations.match(/await authority\.refresh\(\)\.catch/g) ?? []).length >= 3);
  assert.match(operations, /recovered\.status !== "ACTIVE"/);
  assert.match(operations, /hold\.expiresAt === submittedExpiresAt/);
  assert.match(operations, /Date\.parse\(hold\.createdAt\) >= intentStartedAt/);
  assert.match(operations, /Date\.parse\(recovered\.releasedAt\) >= releaseStartedAt/);
  assert.match(operations, /recovered\?\.expectedCustody === "STUDIO"/);
  assert.match(operations, /Date\.parse\(recovered\.observedAt\) >= intentStartedAt/);
  assert.match(operations, /Studio recovered/);
  assert.match(orders, /requestedPieceUnavailable/);
  assert.match(orders, /will not silently substitute another product/);
  assert.match(ordersRoute, /sku: product\.sku/);
  assert.match(ordersRoute, /listStudioOrderablePieceSkus/);
  assert.match(ordersRoute, /productsReady: eligibleResult\.ok/);
  assert.match(ordersRoute, /parseAssistedOrder\(body\)/);
  assert.match(orders, /productsReady/);
  assert.match(orders, /physically reconciled pieces/);
  assert.match(models, /requestedModelUnavailable/);
  assert.match(models, /Studio will not substitute Lulu, another model, or an archived record/);
  assert.doesNotMatch(models, /\?\? models\[0\]/);
  assert.match(models, /pendingRef\.current/);
  assert.match(models, /archivePendingRef\.current/);
  assert.match(styles, /\.studio-native-canvas \.studio-ask-form:focus-within/);
  assert.match(styles, /\.studio-native-canvas \.studio-ask-form textarea:focus-visible[\s\S]*?box-shadow: none;/);
  assert.match(surface, /<div className="studio-ask-end" ref=\{endRef\} \/>/);
  assert.match(surface, /const scroller = end\?\.closest\("main"\)/);
  assert.match(surface, /querySelector\("\.studio-ask-composer-dock"\)/);
  assert.match(surface, /const targetBottom = Math\.min\([\s\S]*?composer\.getBoundingClientRect\(\)\.top,[\s\S]*?\) - 12;/);
  assert.match(surface, /scroller\.scrollTo\(\{ behavior: "smooth", top: scroller\.scrollTop \+ delta \}\)/);
  assert.match(styles, /@media \(max-width: 620px\)[\s\S]*?studio-stack-shell\[data-studio-page="stack"\]:has\(\.studio-ask-page\) \.studio-command-header \{[\s\S]*?background: var\(--studio-stack-field\);/);
  assert.match(surface, /projected\.searchDocuments\.map/);
  assert.match(surface, /historicalDrop01Kind\(garment\) === null/);
  assert.match(commandCenter, /Find in Studio/);
  assert.match(commandCenter, /"Scenario find"/);
  assert.match(commandCenter, /"Studio index"/);
  assert.match(commandCenter, /application\.snapshot\.searchDocuments/);
  assert.match(commandCenter, /historicalDrop01Kind\(garment\) \?\? garment\.state/);
  assert.match(commandCenter, /READ_ONLY_COMPATIBILITY/);
  assert.match(surface, /Ask Studio is unavailable/);
  assert.match(stack, /pathname\.startsWith\("\/studio\/ask"\)/);
  assert.match(page, /<StudioAskSurface \/>/);
});

test("the Ask surface keeps prompts, fallbacks and private tasks consistent", () => {
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");
  const decisionSheet = readFileSync(`${root}/components/studio/atoms/studio-decision-sheet.tsx`, "utf8");
  const styles = readFileSync(`${root}/app/studio-stack-navigation.css`, "utf8");

  assert.match(surface, /const MAX_QUERY_LENGTH = 1_200/);
  assert.match(surface, /maxLength=\{MAX_QUERY_LENGTH\}/);
  assert.match(surface, /id: active\.id,[\s\S]*?role: "user"/);
  assert.doesNotMatch(surface, /messageId: active\.id/);
  assert.match(surface, /turn\.id === message\.id/);
  assert.match(surface, /TASK_RETENTION_MS = 30/);
  assert.match(surface, /Omit<StudioAssistantTaskDraft, "sourceQuery">/);
  assert.match(surface, /TASKS_STORAGE_KEY}:\$\{storageScope\}/);
  assert.match(surface, /operator\?\.storageScope/);
  assert.doesNotMatch(surface, /operator\?\.role \?\? "unknown"|operator\?\.displayName \?\? "unknown"/);
  assert.match(surface, /function deleteTask/);
  const fallbackStart = surface.indexOf("function AssistantFallbackMessage");
  const fallbackEnd = surface.indexOf("export function StudioAskSurface", fallbackStart);
  const fallbackSurface = surface.slice(fallbackStart, fallbackEnd);
  assert.match(fallbackSurface, /AssistantWorkflowCard/);
  assert.doesNotMatch(fallbackSurface, /studioAssistantFallbackText|<MessageResponse/);
  assert.match(fallbackSurface, /Scenario guidance · current simulator state/);
  assert.match(fallbackSurface, /scenario: boolean/);
  assert.match(surface, /function metricVisual\(href: string\)/);
  assert.match(surface, /metricVisual\(item\.href\)/);
  assert.match(surface, /suggestionVisual\(studioAssistantSuggestionFamily\(suggestion\.prompt\)\)/);
  assert.doesNotMatch(surface, /metricVisual\(item\.label\)|suggestionVisual\(suggestion\.label/);
  assert.match(surface, /destination\.pathname\.startsWith\("\/studio\/orders"\)[\s\S]*?icon: PackageCheck/);
  assert.match(surface, /destination\.pathname\.startsWith\("\/studio\/media"\)[\s\S]*?icon: Images/);
  assert.match(surface, /destination\.pathname\.startsWith\("\/studio\/wardrobe"\)[\s\S]*?icon: Shirt/);
  assert.match(surface, /destination\.pathname\.startsWith\("\/studio\/operations"\)[\s\S]*?icon: CircleGauge/);
  assert.match(surface, /destination\.pathname\.startsWith\("\/studio\/stocktake"\)[\s\S]*?destination\.pathname\.startsWith\("\/studio\/scan"\)[\s\S]*?icon: CircleGauge/);
  assert.match(surface, /<ul aria-label="Studio summary" className="studio-ask-metrics">/);
  assert.match(surface, /<ul aria-labelledby=\{titleId\}>/);
  assert.match(styles, /\.studio-ask-results li:not\(:last-child\) a::after \{[\s\S]*?left: 45px;/);
  assert.match(styles, /@media \(prefers-reduced-motion: reduce\) \{[\s\S]*?\.studio-ask-result,[\s\S]*?transition: none !important;/);
  assert.match(styles, /@media \(forced-colors: active\) \{[\s\S]*?\.studio-ask-metrics a,[\s\S]*?\.studio-ask-symbol[\s\S]*?border: 1px solid CanvasText/);
  assert.doesNotMatch(styles, /\.studio-ai-send:disabled svg/);
  assert.match(styles, /\.studio-ai-send\[data-busy="true"\] svg/);
  assert.doesNotMatch(decisionSheet, /useEffect/);
  assert.match(decisionSheet, /function dismiss\(\)/);
});
