import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  resolveStudioAssistant,
  type StudioAssistantBlock,
  type StudioAssistantContext,
  type StudioAssistantDocument,
} from "../lib/studio/assistant/experience";

const root = process.cwd();

function document(input: Partial<StudioAssistantDocument> & Pick<StudioAssistantDocument, "id" | "kind" | "label">): StudioAssistantDocument {
  const identifiers = input.identifiers ?? [input.id.replace(/^[^:]+:/, "")];
  return {
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
  documents: [
    document({ href: "/studio/wardrobe", id: "service:wardrobe", identifiers: ["wardrobe", "garment", "piece"], kind: "Service", label: "Wardrobe" }),
    document({ href: "/studio/media", id: "service:atelier", identifiers: ["atelier", "media", "image"], kind: "Service", label: "Atelier" }),
    document({ entityId: "g-001", href: "/studio/wardrobe/g-001", id: "piece:g-001", identifiers: ["g-001", "JUW-001"], kind: "Piece", label: "Coral Drift Dress", mediaTargetId: "wardrobe-001", state: "READY", tokens: "g-001 juw-001 coral drift dress ready available dress coral" }),
    document({ entityId: "g-002", href: "/studio/wardrobe/g-002", id: "piece:g-002", identifiers: ["g-002", "JUW-002"], kind: "Piece", label: "Coral Mini Set", mediaTargetId: "wardrobe-002", state: "DRAFT", tokens: "g-002 juw-002 coral mini set draft private set coral" }),
    document({ entityId: "ORD-001", href: "/studio/orders/ORD-001", id: "order:o-001", identifiers: ["o-001", "ORD-001", "JUW-001"], kind: "Order", label: "Order ORD-001", state: "ACTIVE", tokens: "o-001 ord-001 juw-001 order active payment delivery" }),
    document({ entityId: "lulu-v3", href: "/studio/models?view=authority", id: "model:lulu-v3", identifiers: ["lulu-v3", "Lulu", "LULU_V3"], kind: "Model", label: "Lulu", state: "READY", tokens: "lulu lulu-v3 identity face body canon consent styling ready" }),
    document({ entityId: "media-001", href: "/studio/media/media-001", id: "media:media-001", identifiers: ["media-001"], kind: "Media", label: "Coral front", state: "COMPLETE", tokens: "media-001 coral front complete garment front juw-001" }),
  ],
  provenance: {
    detail: "Lifecycle simulator · in-memory state",
    generatedAt: "2026-08-23T12:00:00.000Z",
    label: "Scenario preview",
    status: "preview",
  },
  summary: { attention: 4, available: 1, drafts: 2, live: 2, orders: 1, review: 1 },
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

test("an exact record status outranks the global summary", () => {
  const response = resolveStudioAssistant("What is the status of JUW-001?", context);
  assert.equal(block(response, "metrics"), undefined);
  assert.equal(block(response, "answer")?.title, "Coral Drift Dress");
  assert.equal(block(response, "results")?.items[0].href, "/studio/wardrobe/g-001");
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
  assert.equal(handoff?.action.href, "/studio/wardrobe/g-001?action=price#garment-lifecycle");
  assert.match(handoff?.consequence ?? "", /unchanged until you confirm/i);
});

test("ambiguous price change asks for the piece instead of guessing", () => {
  const response = resolveStudioAssistant("Change the coral price", context);
  const clarification = block(response, "clarification");
  assert.equal(response.risk, "R2");
  assert.equal(clarification?.title, "Which piece?");
  assert.ok((clarification?.options.length ?? 0) >= 2);
  assert.equal(block(response, "handoff"), undefined);
});

test("piece intake is a private draft handoff", () => {
  const response = resolveStudioAssistant("Add a new dress", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CREATE");
  assert.equal(response.risk, "R1");
  assert.equal(handoff?.action.href, "/studio/wardrobe?intake=1");
  assert.match(handoff?.consequence ?? "", /until intake is saved/i);
});

test("collection language opens collection scope without claiming a drop mutation", () => {
  const response = resolveStudioAssistant("Switch JUW-001 to another drop", context);
  const handoff = block(response, "handoff");
  assert.equal(handoff?.action.href, "/studio/wardrobe?collection=choose");
  assert.match(handoff?.body ?? "", /does not infer a drop/i);
});

test("publication is always a high-impact review handoff", () => {
  const response = resolveStudioAssistant("Publish JUW-001", context);
  const handoff = block(response, "handoff");
  assert.equal(response.risk, "R3");
  assert.equal(handoff?.action.href, "/studio/wardrobe?view=publishing&garment=g-001");
  assert.match(handoff?.consequence ?? "", /nothing goes live/i);
});

test("media work carries the resolved garment into Atelier", () => {
  const response = resolveStudioAssistant("Prepare a try-on for JUW-002", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "CREATE");
  assert.equal(handoff?.action.href, "/studio/media/new?garment=wardrobe-002");
  assert.match(handoff?.consequence ?? "", /operation preview/i);
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
  assert.equal(handoff?.action.href, "/studio/wardrobe/g-002");
  assert.match(handoff?.consequence ?? "", /will not select or generate for a different garment/i);
});

test("model and order requests resolve their canonical records", () => {
  const model = resolveStudioAssistant("Show Lulu identity", context);
  assert.equal(block(model, "results")?.items[0].href, "/studio/models?view=authority");

  const order = resolveStudioAssistant("Open order ORD-001", context);
  assert.equal(block(order, "results")?.items[0].href, "/studio/orders/ORD-001");
});

test("destructive language never executes from chat", () => {
  const response = resolveStudioAssistant("Delete JUW-001", context);
  const handoff = block(response, "handoff");
  assert.equal(response.intent, "REVERSE");
  assert.equal(response.risk, "R3");
  assert.match(handoff?.consequence ?? "", /never delete/i);
});

test("unknown requests recover into the four primary operating stacks", () => {
  const response = resolveStudioAssistant("make everything magical", context);
  const recovery = block(response, "recovery");
  assert.equal(response.intent, "ORCHESTRATE");
  assert.deepEqual(recovery?.actions.map((action) => action.label), ["Wardrobe", "Atelier", "Orders", "Operations"]);
});

test("the durable route replaces the fake modal modes and preserves keyboard and session recovery", () => {
  const commandCenter = readFileSync(`${root}/components/studio/navigation/studio-command-center.tsx`, "utf8");
  const surface = readFileSync(`${root}/components/studio/navigation/studio-ask-surface.tsx`, "utf8");
  const stack = readFileSync(`${root}/components/studio/navigation/studio-stack-context.tsx`, "utf8");
  const page = readFileSync(`${root}/app/(studio)/studio/ask/page.tsx`, "utf8");

  assert.match(commandCenter, /href="\/studio\/ask"/);
  assert.doesNotMatch(commandCenter, /askMode|aria-label="Ask Studio mode"|Read-only agent/);
  assert.match(surface, /window\.sessionStorage/);
  assert.match(surface, /map\(\(turn\) => turn\.query\)/);
  assert.match(surface, /resolveStudioAssistant\(stored, context\)/);
  assert.match(surface, /provenanceTime\(turn\.response\.provenance\.generatedAt\)/);
  assert.match(surface, /event\.key !== "Enter" \|\| event\.shiftKey/);
  assert.match(surface, /Changes finish in their owning stack/);
  assert.match(surface, /placeholder="Ask about Studio or find a record"/);
  assert.match(surface, /projected\.searchDocuments\.map/);
  assert.match(commandCenter, /Find in Studio/);
  assert.match(commandCenter, /"Scenario find"/);
  assert.match(commandCenter, /"Studio index"/);
  assert.match(commandCenter, /application\.snapshot\.searchDocuments/);
  assert.match(commandCenter, /READ_ONLY_COMPATIBILITY/);
  assert.match(surface, /Ask Studio is unavailable/);
  assert.match(stack, /pathname\.startsWith\("\/studio\/ask"\)/);
  assert.match(page, /<StudioAskSurface \/>/);
});
