import { intakeFactsSchema, type IntakeFacts } from "../studio/engine/contracts";
import {
  getGarmentLifecycleWorkspace,
} from "../studio/engine/garment-lifecycle-service";
import type { GarmentLifecycleWorkspace } from "../studio/engine/garment-lifecycle-contracts";
import {
  scoreStudioAssistantDocument,
  type StudioAssistantContext,
  type StudioAssistantDocument,
} from "../studio/assistant/experience";
import { studioAssistantContextFromProjection } from "../studio/assistant/projection";
import {
  studioAssistantDropMoveInputSchema,
  studioAssistantMediaInputSchema,
  studioAssistantPieceEditInputSchema,
  studioAssistantReferenceInputSchema,
  studioAssistantSearchInputSchema,
  type StudioAssistantChange,
  type StudioAssistantOperationKind,
  type StudioAssistantOperationPreview,
  type StudioAssistantTarget,
  type StudioAssistantToolName,
  type StudioAssistantToolOutput,
  type StudioAssistantToolRecord,
} from "../studio/assistant/tool-contracts";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import {
  listStudioCollections,
  previewStudioCollectionCommand,
} from "./studio-collection-repository";
import { createOrReuseStudioAssistantOperation } from "./studio-assistant-operation-repository";
import { updateStudioAssistantThreadFocus } from "./studio-assistant-thread-repository";
import { getStudioApplicationProjection } from "./studio-application-projection";
import { getStudioAuthority } from "./studio-authority-repository";
import type { StudioOperator } from "./studio-operator";
import type { StudioAssistantFocus, StudioAssistantThreadDetail } from "../studio/assistant/threads";

type ToolExecutorInput = Readonly<{
  operator: StudioOperator;
  requestMessageId: string;
  thread: StudioAssistantThreadDetail;
}>;

export type StudioAssistantToolExecutor = (
  toolName: StudioAssistantToolName,
  input: unknown,
) => Promise<StudioAssistantToolOutput>;

const TOOL_SCHEMA_VERSION = "juw.studio-assistant-tool.v1" as const;

function generatedAt() {
  return new Date().toISOString();
}

function action(input: { href?: string | null; label: string; prompt?: string | null }) {
  return { href: input.href ?? null, label: input.label, prompt: input.prompt ?? null };
}

function output(input: Omit<StudioAssistantToolOutput, "generatedAt" | "schemaVersion">): StudioAssistantToolOutput {
  return { ...input, generatedAt: generatedAt(), schemaVersion: TOOL_SCHEMA_VERSION };
}

function blocked(tool: StudioAssistantToolName, title: string, summary: string): StudioAssistantToolOutput {
  return output({ actions: [], operation: null, outcome: "BLOCKED", records: [], summary, title, tool });
}

function clarification(
  tool: StudioAssistantToolName,
  title: string,
  summary: string,
  records: StudioAssistantToolRecord[],
): StudioAssistantToolOutput {
  return output({ actions: [], operation: null, outcome: "NEEDS_CLARIFICATION", records, summary, title, tool });
}

function canonicalReference(document: StudioAssistantDocument) {
  return document.identifiers.find((identifier) => /^JUW-[0-9]/i.test(identifier.trim()))
    ?? document.entityId
    ?? document.label;
}

function documentType(document: StudioAssistantDocument): StudioAssistantToolRecord["type"] {
  if (document.kind === "Piece") return "PIECE";
  if (document.kind === "Collection") return "DROP";
  if (document.kind === "Order") return "ORDER";
  if (document.kind === "Media") return "MEDIA";
  if (document.kind === "Model") return "MODEL";
  return "SERVICE";
}

function documentRecord(document: StudioAssistantDocument): StudioAssistantToolRecord {
  return {
    detail: document.detail,
    fields: [],
    href: document.href,
    id: document.entityId ?? document.id,
    label: document.label,
    media: [],
    reference: canonicalReference(document),
    state: document.state ?? null,
    type: documentType(document),
  };
}

function focusFromRecord(
  record: StudioAssistantToolRecord,
  lastKnownRevision: string | null = null,
): StudioAssistantFocus {
  return {
    canonicalId: record.id,
    entityType: record.type,
    label: record.label,
    lastKnownRevision,
    reference: record.reference ?? record.id,
    route: record.href,
    unresolvedCandidates: [],
  };
}

async function focusRecord(
  base: ToolExecutorInput,
  record: StudioAssistantToolRecord,
  lastKnownRevision: string | null = null,
) {
  await updateStudioAssistantThreadFocus({
    focus: focusFromRecord(record, lastKnownRevision),
    operator: base.operator,
    threadId: base.thread.id,
    turnMessageId: base.requestMessageId,
  });
}

async function focusCandidates(
  base: ToolExecutorInput,
  records: StudioAssistantToolRecord[],
) {
  await updateStudioAssistantThreadFocus({
    focus: {
      canonicalId: base.thread.focus?.canonicalId ?? null,
      entityType: base.thread.focus?.entityType ?? records[0]?.type ?? "PIECE",
      label: base.thread.focus?.label ?? null,
      lastKnownRevision: base.thread.focus?.lastKnownRevision ?? null,
      reference: base.thread.focus?.reference ?? null,
      route: base.thread.focus?.route ?? null,
      unresolvedCandidates: records.slice(0, 6).map((record) => ({
        canonicalId: record.id,
        entityType: record.type,
        label: record.label,
        reference: record.reference ?? record.id,
        route: record.href,
      })),
    },
    operator: base.operator,
    threadId: base.thread.id,
    turnMessageId: base.requestMessageId,
  });
}

function rankedDocuments(
  context: StudioAssistantContext,
  query: string,
  kinds?: StudioAssistantDocument["kind"][],
) {
  const seen = new Set<string>();
  return context.documents
    .filter((document) => !kinds?.length || kinds.includes(document.kind))
    .map((document) => ({ document, score: scoreStudioAssistantDocument(document, query) }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.document.label.localeCompare(right.document.label))
    .filter(({ document }) => {
      const key = document.kind === "Piece" ? document.href : document.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

function resolveDocument(input: {
  context: StudioAssistantContext;
  focusReference?: string | null;
  kinds: StudioAssistantDocument["kind"][];
  reference?: string;
}) {
  const reference = input.reference?.trim() || input.focusReference?.trim() || "";
  if (!reference) return { candidates: [] as StudioAssistantDocument[], document: null };
  const ranked = rankedDocuments(input.context, reference, input.kinds);
  if (!ranked.length) return { candidates: [] as StudioAssistantDocument[], document: null };
  const top = ranked[0]!;
  const close = ranked.filter(({ score }) => score >= Math.max(12, top.score - 12)).slice(0, 6);
  const exact = top.score >= 150 || (top.score >= 100 && (close.length === 1 || top.score > close[1]!.score));
  return exact || close.length === 1
    ? { candidates: [] as StudioAssistantDocument[], document: top.document }
    : { candidates: close.map(({ document }) => document), document: null };
}

function wardrobeItemId(document: StudioAssistantDocument) {
  if (document.mediaTargetId) return document.mediaTargetId;
  const match = /^\/studio\/wardrobe\/([^/?#]+)/.exec(document.href);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return null;
  }
}

function pieceTarget(document: StudioAssistantDocument): StudioAssistantTarget | null {
  const id = wardrobeItemId(document);
  if (!id) return null;
  return {
    href: document.href,
    id,
    label: document.label,
    reference: canonicalReference(document),
    type: "PIECE",
  };
}

function can(context: StudioAssistantContext, capability: StudioAssistantContext["capabilities"][number]["id"]) {
  return context.capabilities.some((candidate) => (
    candidate.id === capability && candidate.state === "AVAILABLE"
  ));
}

function naira(value: number) {
  return `₦${new Intl.NumberFormat("en-NG", { maximumFractionDigits: 0 }).format(value)}`;
}

function display(value: string | undefined) {
  return value?.trim() || "Not set";
}

function factsEqual(left: IntakeFacts, right: IntakeFacts) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function pieceRecord(input: {
  collectionLabel: string;
  document: StudioAssistantDocument;
  workspace: GarmentLifecycleWorkspace;
}): StudioAssistantToolRecord {
  const target = pieceTarget(input.document);
  const facts = input.workspace.editableFacts;
  return {
    detail: display(facts.description),
    fields: [
      { label: "Name", value: facts.title },
      { label: "Description", value: display(facts.description) },
      { label: "Price", value: naira(facts.price) },
      { label: "Status", value: input.workspace.state.toLocaleLowerCase("en-NG") },
      { label: "Drop", value: input.collectionLabel },
      { label: "Private revision", value: input.workspace.draft ? `Revision ${input.workspace.draft.revisionNumber}` : "None" },
      { label: "Media", value: input.workspace.live?.media.length ? `${input.workspace.live.media.length} approved views` : "Private media" },
    ],
    href: target?.href ?? input.document.href,
    id: target?.id ?? input.document.id,
    label: facts.title,
    media: (input.workspace.live?.media ?? []).slice(0, 8).map((media) => ({ alt: media.label, src: media.src })),
    reference: canonicalReference(input.document),
    state: input.workspace.state,
    type: "PIECE",
  };
}

function operationIdentity(input: {
  expectedRevision?: string | null;
  expectedVersion?: number | null;
  kind: StudioAssistantOperationKind;
  payload: Record<string, unknown>;
  requestMessageId: string;
  target: StudioAssistantTarget;
  threadId: string;
}) {
  const requestFingerprint = sha256(JSON.stringify({
    expectedRevision: input.expectedRevision ?? null,
    expectedVersion: input.expectedVersion ?? null,
    kind: input.kind,
    payload: input.payload,
    target: input.target,
  }));
  return {
    idempotencyKey: `ask.${input.kind.toLocaleLowerCase("en-US")}.${sha256(`${input.threadId}:${input.requestMessageId}:${requestFingerprint}`).slice(0, 48)}`,
    requestFingerprint,
  };
}

async function freshContext(operator: StudioOperator) {
  const projection = await getStudioApplicationProjection(operator);
  return { context: studioAssistantContextFromProjection(projection), projection };
}

async function resolvedPiece(input: {
  base?: ToolExecutorInput;
  context: StudioAssistantContext;
  focusReference?: string | null;
  reference?: string;
  tool: StudioAssistantToolName;
}) {
  const resolved = resolveDocument({
    context: input.context,
    focusReference: input.focusReference,
    kinds: ["Piece"],
    reference: input.reference,
  });
  if (resolved.document) {
    const target = pieceTarget(resolved.document);
    if (!target) return { output: blocked(input.tool, "Piece is read-only here", "That result has no connected Wardrobe record."), piece: null };
    if (input.base) {
      await updateStudioAssistantThreadFocus({
        focus: {
          canonicalId: target.id,
          entityType: "PIECE",
          label: target.label,
          lastKnownRevision: input.base.thread.focus?.lastKnownRevision ?? null,
          reference: target.reference,
          route: target.href,
          unresolvedCandidates: [],
        },
        operator: input.base.operator,
        threadId: input.base.thread.id,
        turnMessageId: input.base.requestMessageId,
      });
    }
    return { output: null, piece: { document: resolved.document, target } };
  }
  if (resolved.candidates.length) {
    if (input.base) {
      await updateStudioAssistantThreadFocus({
        focus: {
          canonicalId: input.base.thread.focus?.canonicalId ?? null,
          entityType: "PIECE",
          label: input.base.thread.focus?.label ?? null,
          lastKnownRevision: input.base.thread.focus?.lastKnownRevision ?? null,
          reference: input.base.thread.focus?.reference ?? null,
          route: input.base.thread.focus?.route ?? null,
          unresolvedCandidates: resolved.candidates.flatMap((document) => {
            const target = pieceTarget(document);
            return target ? [{
              canonicalId: target.id,
              entityType: "PIECE" as const,
              label: target.label,
              reference: target.reference,
              route: target.href,
            }] : [];
          }).slice(0, 6),
        },
        operator: input.base.operator,
        threadId: input.base.thread.id,
        turnMessageId: input.base.requestMessageId,
      });
    }
    return {
      output: clarification(
        input.tool,
        "Which piece?",
        "Choose the exact garment before Ask Studio reads or prepares a change.",
        resolved.candidates.map(documentRecord),
      ),
      piece: null,
    };
  }
  return {
    output: clarification(input.tool, "Choose a piece", "Name the garment or enter its JUW reference.", []),
    piece: null,
  };
}

function kindMap(kind: StudioAssistantToolRecord["type"]): StudioAssistantDocument["kind"][] {
  if (kind === "PIECE" || kind === "INVENTORY") return ["Piece"];
  if (kind === "DROP") return ["Collection"];
  if (kind === "ORDER") return ["Order"];
  if (kind === "MEDIA") return ["Media"];
  if (kind === "MODEL") return ["Model"];
  return ["Service"];
}

async function searchStudio(
  base: ToolExecutorInput,
  rawInput: unknown,
): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantSearchInputSchema.parse(rawInput);
  const { context } = await freshContext(base.operator);
  const kinds = input.kinds?.flatMap(kindMap);
  const ranked = rankedDocuments(context, input.query, kinds).slice(0, 8);
  const records = ranked.map(({ document }) => documentRecord(document));
  if (records.length === 1) {
    await focusRecord(base, records[0]!);
  } else if (records.length > 1) {
    await focusCandidates(base, records);
  }
  return records.length
    ? output({
        actions: [],
        operation: null,
        outcome: records.length > 1 ? "NEEDS_CLARIFICATION" : "OK",
        records,
        summary: records.length === 1 ? "One current Studio record matched." : "Choose a result to focus this conversation.",
        title: records.length === 1 ? "Found" : `${records.length} matches`,
        tool: "searchStudio",
      })
    : clarification("searchStudio", "No matching Studio record", "Try a JUW reference, order reference, garment name, drop, model, or media role.", []);
}

async function getPiece(
  base: ToolExecutorInput,
  rawInput: unknown,
): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const { context, projection } = await freshContext(base.operator);
  const resolved = await resolvedPiece({
    base,
    context,
    focusReference: base.thread.focus?.reference,
    reference: input.reference,
    tool: "getPiece",
  });
  if (!resolved.piece) return resolved.output!;
  const workspace = await getGarmentLifecycleWorkspace(resolved.piece.target.id, base.operator);
  const sku = canonicalReference(resolved.piece.document);
  const collection = projection.collectionScopes.find((scope) => scope.memberSkus.includes(sku));
  const record = pieceRecord({
    collectionLabel: collection?.label ?? "Not assigned",
    document: resolved.piece.document,
    workspace,
  });
  await focusRecord(
    base,
    record,
    workspace.draft?.expectedRevision ?? String(workspace.itemVersion),
  );
  return output({
    actions: [action({ href: record.href, label: "Open piece" })],
    operation: null,
    outcome: "OK",
    records: [record],
    summary: `${record.reference ?? "This piece"} is ${workspace.state.toLocaleLowerCase("en-NG")}. These facts were refreshed from its owning Wardrobe record.`,
    title: record.label,
    tool: "getPiece",
  });
}

async function getDrop(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const { scopes, generatedAt: readAt } = await listStudioCollections();
  const requestedReference = input.reference?.trim()
    || (base.thread.focus?.entityType === "DROP" ? base.thread.focus.reference : null)
    || "";
  const normalized = requestedReference.toLocaleLowerCase("en-NG");
  const matches = normalized
    ? scopes.filter((scope) => [scope.id, scope.key, scope.label, `drop ${scope.ordinal}`]
        .some((candidate) => candidate.toLocaleLowerCase("en-NG").includes(normalized)))
    : scopes;
  const records: StudioAssistantToolRecord[] = matches.map((scope) => ({
    detail: `${scope.counts.pieces ?? "—"} pieces · ${scope.state.toLocaleLowerCase("en-NG")}`,
    fields: [
      { label: "State", value: scope.state.toLocaleLowerCase("en-NG") },
      { label: "Pieces", value: String(scope.counts.pieces ?? "—") },
      { label: "Published", value: String(scope.counts.published ?? "—") },
      { label: "Available", value: String(scope.counts.available ?? "—") },
      { label: "Current Shop", value: scope.isCurrent ? "Yes" : "No" },
    ],
    href: scope.nextAction,
    id: scope.id,
    label: scope.label,
    media: [],
    reference: scope.key,
    state: scope.state,
    type: "DROP",
  }));
  if (records.length === 1) await focusRecord(base, records[0]!, String(matches[0]!.version));
  else if (normalized && records.length > 1) await focusCandidates(base, records);
  return records.length
    ? { ...output({ actions: [], operation: null, outcome: records.length === 1 ? "OK" : "NEEDS_CLARIFICATION", records, summary: `Drop truth refreshed at ${readAt}.`, title: records.length === 1 ? records[0]!.label : "Studio drops", tool: "getDrop" }), generatedAt: readAt }
    : clarification("getDrop", "Drop not found", "Choose one of the current Studio drops.", []);
}

async function getOrder(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const authority = await getStudioAuthority(base.operator);
  const requestedReference = input.reference?.trim()
    || (base.thread.focus?.entityType === "ORDER" ? base.thread.focus.reference : null)
    || "";
  const reference = requestedReference.toLocaleLowerCase("en-NG");
  const orders = reference
    ? authority.orders.filter((order) => [order.reference, ...order.lines.flatMap((line) => [line.sku, line.name])]
        .some((candidate) => candidate.toLocaleLowerCase("en-NG").includes(reference)))
    : authority.orders;
  const records: StudioAssistantToolRecord[] = orders.slice(0, 8).map((order) => ({
    detail: order.lines.map((line) => line.name).join(" · "),
    fields: [
      { label: "Lifecycle", value: order.lifecycleStatus },
      { label: "Payment review", value: order.paymentReviewStatus },
      { label: "Funds", value: order.fundsConfirmationStatus },
      { label: "Fulfillment", value: order.fulfillmentStatus },
      { label: "Total", value: naira(order.total) },
      { label: "Version", value: String(order.version) },
    ],
    href: `/studio/orders/${encodeURIComponent(order.reference)}`,
    id: order.id,
    label: order.reference,
    media: [],
    reference: order.reference,
    state: order.lifecycleStatus,
    type: "ORDER",
  }));
  if (records.length === 1) await focusRecord(base, records[0]!, String(orders[0]!.version));
  else if (reference && records.length > 1) await focusCandidates(base, records);
  return records.length
    ? output({ actions: [], operation: null, outcome: records.length === 1 ? "OK" : "NEEDS_CLARIFICATION", records, summary: records.length === 1 ? "Current order truth." : "Choose the order to continue.", title: records.length === 1 ? records[0]!.label : "Orders", tool: "getOrder" })
    : clarification("getOrder", "Order not found", "Enter an order reference or a garment on the order.", []);
}

async function getInventory(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const [{ context }, authority] = await Promise.all([freshContext(base.operator), getStudioAuthority(base.operator)]);
  const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: input.reference, tool: "getInventory" });
  if (!resolved.piece) return resolved.output!;
  const reference = canonicalReference(resolved.piece.document);
  const piece = authority.pieces.find((candidate) => (
    candidate.wardrobeItemId === resolved.piece!.target.id
    || candidate.pieceKey === resolved.piece!.document.entityId
    || candidate.sku === reference
  ));
  if (!piece) return blocked("getInventory", "Inventory record unavailable", "The Wardrobe piece exists, but no current physical inventory record was found.");
  const record: StudioAssistantToolRecord = {
    detail: piece.hasLocationMismatch ? "Expected and last-confirmed locations do not match." : "Physical custody truth is aligned.",
    fields: [
      { label: "Availability", value: piece.availability },
      { label: "Expected", value: piece.expectedLocationLabel },
      { label: "Last confirmed", value: piece.observedLocationLabel ?? "Not confirmed" },
      { label: "Custody", value: piece.expectedCustody },
      { label: "Hold", value: piece.activeHold ? "Active customer hold" : "None" },
      { label: "Location version", value: String(piece.locationVersion) },
    ],
    href: `/studio/operations?view=inventory&piece=${encodeURIComponent(piece.pieceKey)}`,
    id: piece.pieceKey,
    label: piece.title,
    media: piece.imageSrc ? [{ alt: piece.title, src: piece.imageSrc }] : [],
    reference: piece.sku ?? piece.pieceKey,
    state: piece.availability,
    type: "INVENTORY",
  };
  await focusRecord(base, record, String(piece.locationVersion));
  return output({ actions: [action({ href: record.href, label: "Open inventory" })], operation: null, outcome: "OK", records: [record], summary: record.detail, title: `${record.reference} inventory`, tool: "getInventory" });
}

async function getMedia(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantMediaInputSchema.parse(rawInput);
  const authority = await getStudioAuthority(base.operator);
  let media = authority.media;
  let catalogueRecords: StudioAssistantToolRecord[] = [];
  const pieceReference = input.pieceReference
    || (["PIECE", "INVENTORY"].includes(base.thread.focus?.entityType ?? "")
      ? base.thread.focus?.reference ?? undefined
      : undefined);
  if (pieceReference) {
    const { context } = await freshContext(base.operator);
    const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: pieceReference, tool: "getMedia" });
    if (!resolved.piece) return resolved.output!;
    media = media.filter((candidate) => candidate.wardrobeItemId === resolved.piece!.target.id);
    const workspace = await getGarmentLifecycleWorkspace(resolved.piece.target.id, base.operator);
    catalogueRecords = (workspace.live?.media ?? []).map((candidate) => ({
      detail: "Approved Shop catalogue view",
      fields: [
        { label: "Role", value: candidate.slot.replaceAll("_", " ") },
        { label: "State", value: "APPROVED" },
        { label: "Model", value: "Not applicable" },
        { label: "Updated", value: workspace.live!.receipt.publishedAt },
      ],
      href: resolved.piece!.target.href,
      id: `${workspace.live!.receipt.publicationId}:${candidate.slot}`,
      label: `${resolved.piece!.target.reference} · ${candidate.label}`,
      media: [{ alt: candidate.label, src: candidate.src }],
      reference: resolved.piece!.target.reference,
      state: "APPROVED",
      type: "MEDIA",
    }));
  } else if (base.thread.focus?.entityType === "MEDIA") {
    const focus = base.thread.focus;
    const normalized = (focus.reference ?? focus.canonicalId ?? "").toLocaleLowerCase("en-NG");
    media = media.filter((candidate) => (
      candidate.id === focus.canonicalId
      || candidate.id.toLocaleLowerCase("en-NG") === normalized
      || candidate.sku?.toLocaleLowerCase("en-NG") === normalized
      || candidate.title.toLocaleLowerCase("en-NG").includes(normalized)
    ));
  }
  const atelierRecords: StudioAssistantToolRecord[] = media.slice(0, 12).map((candidate) => ({
    detail: [candidate.operation.replaceAll("_", " "), candidate.modelName].filter(Boolean).join(" · "),
    fields: [
      { label: "Role", value: candidate.operation.replaceAll("_", " ") },
      { label: "State", value: candidate.state },
      { label: "Model", value: candidate.modelName ?? "Not applicable" },
      { label: "Updated", value: candidate.updatedAt },
    ],
    href: `/studio/media?piece=${encodeURIComponent(candidate.wardrobeItemId)}`,
    id: candidate.id,
    label: candidate.sku ? `${candidate.sku} · ${candidate.title}` : candidate.title,
    media: candidate.outputUrl ? [{ alt: `${candidate.title} ${candidate.operation}`, src: candidate.outputUrl }] : [],
    reference: candidate.sku,
    state: candidate.state,
    type: "MEDIA",
  }));
  const atelierSources = new Set(atelierRecords.flatMap((record) => record.media.map((candidate) => candidate.src)));
  const records = [
    ...atelierRecords,
    ...catalogueRecords.filter((record) => record.media.every((candidate) => !atelierSources.has(candidate.src))),
  ].slice(0, 12);
  if (!pieceReference && records.length === 1) {
    await focusRecord(base, records[0]!, media[0]?.updatedAt ?? records[0]!.fields.find((field) => field.label === "Updated")?.value ?? null);
  } else if (!pieceReference && base.thread.focus?.entityType === "MEDIA" && records.length > 1) {
    await focusCandidates(base, records);
  }
  return records.length
    ? output({ actions: [action({ href: records[0]!.href, label: "Open media" })], operation: null, outcome: "OK", records, summary: `${records.length} current media record${records.length === 1 ? "" : "s"}.`, title: "Media", tool: "getMedia" })
    : blocked("getMedia", "No media yet", "No retained Studio media matches this piece.");
}

async function getModel(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const authority = await getStudioAuthority(base.operator);
  const requestedReference = input.reference?.trim()
    || (base.thread.focus?.entityType === "MODEL" ? base.thread.focus.reference : null)
    || "";
  const query = requestedReference.toLocaleLowerCase("en-NG").replace(/[\s_-]+/g, "");
  const models = authority.models.filter((model) => !query || [model.id, model.name, model.authorityId ?? ""]
    .some((candidate) => candidate.toLocaleLowerCase("en-NG").replace(/[\s_-]+/g, "").includes(query)));
  const records: StudioAssistantToolRecord[] = models.map((model) => ({
    detail: model.kind === "LULU_V3" ? "Current Lulu authority" : "Authorized stock model",
    fields: [
      { label: "State", value: model.state },
      { label: "Authority", value: model.authorityId ?? "Recorded" },
      { label: "Confirmed", value: model.authorityConfirmedAt },
      { label: "Revision", value: model.authorityRevision ?? model.updatedAt },
    ],
    href: `/studio/models?view=authority&model=${encodeURIComponent(model.id)}`,
    id: model.id,
    label: model.name,
    media: [{ alt: model.name, src: model.previewAssetUrl ?? model.sourceAssetUrl }],
    reference: model.authorityId ?? model.id,
    state: model.state,
    type: "MODEL",
  }));
  if (records.length === 1) {
    await focusRecord(base, records[0]!, models[0]!.authorityRevision ?? models[0]!.updatedAt);
  } else if (query && records.length > 1) {
    await focusCandidates(base, records);
  }
  return records.length
    ? output({ actions: [], operation: null, outcome: records.length === 1 ? "OK" : "NEEDS_CLARIFICATION", records, summary: "Current authenticated model authority.", title: records.length === 1 ? records[0]!.label : "Studio models", tool: "getModel" })
    : clarification("getModel", "Model not found", "Choose a current Studio model.", []);
}

async function prepareOperation(input: ToolExecutorInput & {
  expectedRevision?: string | null;
  expectedVersion?: number | null;
  kind: StudioAssistantOperationKind;
  payload: Record<string, unknown>;
  preview: StudioAssistantOperationPreview;
  target: StudioAssistantTarget;
  tool: StudioAssistantToolName;
}): Promise<StudioAssistantToolOutput> {
  const identity = operationIdentity({
    expectedRevision: input.expectedRevision,
    expectedVersion: input.expectedVersion,
    kind: input.kind,
    payload: input.payload,
    requestMessageId: input.requestMessageId,
    target: input.target,
    threadId: input.thread.id,
  });
  const operation = await createOrReuseStudioAssistantOperation({
    ...identity,
    expectedRevision: input.expectedRevision,
    expectedVersion: input.expectedVersion,
    kind: input.kind,
    operator: input.operator,
    payload: input.payload,
    preview: input.preview,
    target: input.target,
    threadId: input.thread.id,
  });
  return output({
    actions: [],
    operation,
    outcome: "OK",
    records: [],
    summary: input.preview.summary,
    title: input.preview.confirmationLabel,
    tool: input.tool,
  });
}

async function preparePieceEdit(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantPieceEditInputSchema.parse(rawInput);
  const { context } = await freshContext(base.operator);
  if (!can(context, "WARDROBE_WRITE")) return blocked("preparePieceEdit", "Editing unavailable", "Wardrobe editing is not available from current connected truth.");
  const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: input.reference, tool: "preparePieceEdit" });
  if (!resolved.piece) return resolved.output!;
  const workspace = await getGarmentLifecycleWorkspace(resolved.piece.target.id, base.operator);
  if (!workspace.allowedActions.includes("EDIT")) return blocked("preparePieceEdit", "This piece cannot be edited", `Its current state is ${workspace.state.toLocaleLowerCase("en-NG")}.`);
  const before = workspace.editableFacts;
  const editableFacts: Record<string, unknown> = {
    ...before,
    ...(input.changes.name !== undefined ? { title: input.changes.name } : {}),
    ...(input.changes.price !== undefined ? { price: input.changes.price } : {}),
  };
  if (input.changes.description === null) delete editableFacts.description;
  else if (input.changes.description !== undefined) editableFacts.description = input.changes.description;
  const after = intakeFactsSchema.parse(editableFacts);
  if (factsEqual(before, after)) return blocked("preparePieceEdit", "Nothing to change", "Those garment facts already match the current private truth.");
  const changes: StudioAssistantChange[] = [
    ...(before.title !== after.title ? [{ after: after.title, before: before.title, field: "title", label: "Name" }] : []),
    ...(before.description !== after.description ? [{ after: display(after.description), before: display(before.description), field: "description", label: "Description" }] : []),
    ...(before.price !== after.price ? [{ after: naira(after.price), before: naira(before.price), field: "price", label: "Price" }] : []),
  ];
  const published = Boolean(workspace.live);
  const preview: StudioAssistantOperationPreview = {
    changes,
    confirmationLabel: published ? "Save private revision" : "Save changes",
    consequence: published
      ? "The changes stay private until you separately review and publish the revision. The current Shop listing remains unchanged."
      : "The private garment facts will update. No Shop listing will be created.",
    destructive: false,
    risk: "R1",
    summary: `${changes.length} field${changes.length === 1 ? "" : "s"} will change on ${resolved.piece.target.reference}.`,
  };
  return prepareOperation({
    ...base,
    expectedVersion: workspace.draft?.version ?? workspace.itemVersion,
    kind: "PIECE_EDIT",
    payload: { facts: after },
    preview,
    target: resolved.piece.target,
    tool: "preparePieceEdit",
  });
}

async function preparePublishRevision(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const { context } = await freshContext(base.operator);
  if (!can(context, "WARDROBE_WRITE")) return blocked("preparePublishRevision", "Publishing unavailable", "Wardrobe publishing is not available from current connected truth.");
  const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: input.reference, tool: "preparePublishRevision" });
  if (!resolved.piece) return resolved.output!;
  const workspace = await getGarmentLifecycleWorkspace(resolved.piece.target.id, base.operator);
  if (!workspace.draft || !workspace.allowedActions.includes("PUBLISH_REVISION")) {
    return blocked("preparePublishRevision", "No private revision to publish", "Edit the piece first, then review its private diff before publishing.");
  }
  if (!workspace.live?.media.length) {
    return blocked(
      "preparePublishRevision",
      "Approved catalogue media unavailable",
      "Open the piece and restore its exact approved public photo set before preparing publication.",
    );
  }
  const preview: StudioAssistantOperationPreview = {
    changes: workspace.draft.diff.filter((change) => change.field !== "media").map((change) => ({ ...change })),
    confirmationLabel: "Publish revision",
    consequence: "The reviewed private facts will replace the current Shop listing facts. The approved catalogue photo set stays unchanged.",
    destructive: false,
    media: workspace.live.media.map((media) => ({
      id: `${workspace.live!.receipt.publicationId}:${media.slot}`,
      label: media.label,
      sourceRevision: workspace.live!.sourceRevision,
      src: media.src,
    })),
    risk: "R2",
    summary: `Publish private revision ${workspace.draft.revisionNumber} for ${resolved.piece.target.reference}.`,
  };
  return prepareOperation({
    ...base,
    expectedRevision: workspace.draft.expectedRevision,
    kind: "PUBLISH_REVISION",
    payload: { facts: workspace.draft.facts },
    preview,
    target: resolved.piece.target,
    tool: "preparePublishRevision",
  });
}

async function prepareDropMove(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantDropMoveInputSchema.parse(rawInput);
  const [{ context }, collectionRead] = await Promise.all([freshContext(base.operator), listStudioCollections()]);
  if (!can(context, "COLLECTION_MEMBERSHIP_WRITE")) return blocked("prepareDropMove", "Drop movement unavailable", "Published drop membership changes require connected admin authority.");
  const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: input.pieceReference, tool: "prepareDropMove" });
  if (!resolved.piece) return resolved.output!;
  const sku = canonicalReference(resolved.piece.document);
  if (!/^JUW-[0-9]{3,}$/i.test(sku)) return blocked("prepareDropMove", "This piece has no published SKU", "Only published or historically published JUW pieces can use the guarded drop correction.");
  const destinationQuery = input.destination.toLocaleLowerCase("en-NG");
  const destinations = collectionRead.scopes.filter((scope) => [scope.id, scope.key, scope.label, `drop ${scope.ordinal}`]
    .some((candidate) => candidate.toLocaleLowerCase("en-NG") === destinationQuery));
  if (destinations.length !== 1) {
    const records: StudioAssistantToolRecord[] = collectionRead.scopes.map((scope) => ({
      detail: scope.isCurrent ? "Current Shop drop" : scope.state.toLocaleLowerCase("en-NG"),
      fields: [],
      href: scope.nextAction,
      id: scope.id,
      label: scope.label,
      media: [],
      reference: scope.key,
      state: scope.state,
      type: "DROP",
    }));
    return clarification("prepareDropMove", "Which destination drop?", "Choose the exact destination before reviewing impact.", records);
  }
  const destination = destinations[0]!;
  const intent = {
    collectionId: destination.id,
    command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP" as const,
    expectedVersion: destination.version,
    sku: sku.toUpperCase(),
  };
  const domainPreview = await previewStudioCollectionCommand(base.operator, intent);
  const target: StudioAssistantTarget = {
    ...resolved.piece.target,
    label: `${resolved.piece.target.reference} · ${resolved.piece.target.label}`,
  };
  return prepareOperation({
    ...base,
    expectedRevision: domainPreview.expectedRevision,
    expectedVersion: destination.version,
    kind: "DROP_MOVE",
    payload: { intent },
    preview: {
      changes: domainPreview.changes.map((change) => ({ ...change, field: change.label.toLocaleLowerCase("en-NG").replaceAll(" ", "_") })),
      confirmationLabel: "Publish drop change",
      consequence: domainPreview.consequence,
      destructive: false,
      risk: "R2",
      summary: domainPreview.title,
    },
    target,
    tool: "prepareDropMove",
  });
}

async function prepareArchive(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const { context } = await freshContext(base.operator);
  if (!can(context, "WARDROBE_WRITE")) return blocked("prepareArchive", "Archiving unavailable", "Wardrobe writing is not available from current connected truth.");
  const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: input.reference, tool: "prepareArchive" });
  if (!resolved.piece) return resolved.output!;
  const workspace = await getGarmentLifecycleWorkspace(resolved.piece.target.id, base.operator);
  if (!workspace.allowedActions.includes("ARCHIVE")) return blocked("prepareArchive", "This piece cannot be archived", "Check that it is not already archived, reserved, or sold.");
  return prepareOperation({
    ...base,
    expectedVersion: workspace.itemVersion,
    kind: "ARCHIVE",
    payload: {},
    preview: {
      changes: [{ after: "Archived", before: workspace.state.toLocaleLowerCase("en-NG"), field: "state", label: "Wardrobe state" }],
      confirmationLabel: "Archive piece",
      consequence: "The garment will leave active Wardrobe and Shop workflows. Its eligible history remains in Archived Wardrobe.",
      destructive: true,
      risk: "R2",
      summary: `Archive ${resolved.piece.target.reference} · ${workspace.editableFacts.title}.`,
    },
    target: resolved.piece.target,
    tool: "prepareArchive",
  });
}

async function preparePermanentDelete(base: ToolExecutorInput, rawInput: unknown): Promise<StudioAssistantToolOutput> {
  const input = studioAssistantReferenceInputSchema.parse(rawInput);
  const { context } = await freshContext(base.operator);
  if (!can(context, "WARDROBE_WRITE")) return blocked("preparePermanentDelete", "Permanent deletion unavailable", "Wardrobe writing is not available from current connected truth.");
  const resolved = await resolvedPiece({ base, context, focusReference: base.thread.focus?.reference, reference: input.reference, tool: "preparePermanentDelete" });
  if (!resolved.piece) return resolved.output!;
  const workspace = await getGarmentLifecycleWorkspace(resolved.piece.target.id, base.operator);
  if (!workspace.permanentDelete.eligible) {
    return blocked("preparePermanentDelete", "This piece cannot be permanently deleted", workspace.permanentDelete.blockers.join(" ") || "Archive the piece first and remove its retained history.");
  }
  return prepareOperation({
    ...base,
    expectedVersion: workspace.itemVersion,
    kind: "PERMANENT_DELETE",
    payload: {},
    preview: {
      changes: [{ after: "Permanently deleted", before: "Archived", field: "record", label: "Wardrobe record" }],
      confirmationLabel: "Delete permanently",
      consequence: "The eligible archived garment and its private intake record will be irreversibly removed. This cannot be undone.",
      destructive: true,
      risk: "R3",
      summary: `Permanently delete ${resolved.piece.target.reference} · ${workspace.editableFacts.title}.`,
    },
    target: resolved.piece.target,
    tool: "preparePermanentDelete",
  });
}

export function createStudioAssistantToolExecutor(base: ToolExecutorInput): StudioAssistantToolExecutor {
  return async (toolName, rawInput) => {
    if (toolName === "searchStudio") return searchStudio(base, rawInput);
    if (toolName === "getPiece") return getPiece(base, rawInput);
    if (toolName === "getDrop") return getDrop(base, rawInput);
    if (toolName === "getOrder") return getOrder(base, rawInput);
    if (toolName === "getInventory") return getInventory(base, rawInput);
    if (toolName === "getMedia") return getMedia(base, rawInput);
    if (toolName === "getModel") return getModel(base, rawInput);
    if (toolName === "preparePieceEdit") return preparePieceEdit(base, rawInput);
    if (toolName === "preparePublishRevision") return preparePublishRevision(base, rawInput);
    if (toolName === "prepareDropMove") return prepareDropMove(base, rawInput);
    if (toolName === "prepareArchive") return prepareArchive(base, rawInput);
    if (toolName === "preparePermanentDelete") return preparePermanentDelete(base, rawInput);
    throw new StudioEngineError("INVALID_REQUEST", 400, "Ask Studio does not know that tool.", "Try a current Studio action.");
  };
}

/**
 * Scenario mode exercises the same typed UI contract without crossing a
 * connected write or database boundary.
 */
export function createScenarioStudioAssistantToolExecutor(
  context: StudioAssistantContext,
  focusReference?: string | null,
): StudioAssistantToolExecutor {
  return async (toolName, rawInput) => {
    if (toolName.startsWith("prepare")) {
      return blocked(
        toolName,
        "Preview only",
        "This scenario can explain and render the review flow, but it cannot prepare or execute a connected Studio change.",
      );
    }
    if (toolName === "searchStudio") {
      const input = studioAssistantSearchInputSchema.parse(rawInput);
      const kinds = input.kinds?.flatMap(kindMap);
      const records = rankedDocuments(context, input.query, kinds).slice(0, 8).map(({ document }) => documentRecord(document));
      return records.length
        ? output({ actions: [], operation: null, outcome: records.length === 1 ? "OK" : "NEEDS_CLARIFICATION", records, summary: "Scenario records use the current simulator snapshot.", title: records.length === 1 ? "Found" : "Scenario matches", tool: toolName })
        : clarification(toolName, "No scenario match", "Try a current scenario reference.", []);
    }
    const referenceInput = toolName === "getMedia"
      ? studioAssistantMediaInputSchema.parse(rawInput).pieceReference
      : studioAssistantReferenceInputSchema.parse(rawInput).reference;
    const kind: StudioAssistantDocument["kind"] = toolName === "getDrop"
      ? "Collection"
      : toolName === "getOrder"
        ? "Order"
        : toolName === "getMedia"
          ? "Media"
          : toolName === "getModel"
            ? "Model"
            : "Piece";
    const reference = referenceInput || (kind === "Piece" || kind === "Media" ? focusReference ?? undefined : undefined);
    const ranked = reference
      ? rankedDocuments(context, reference, [kind])
      : context.documents.filter((document) => document.kind === kind).map((document) => ({ document, score: 1 }));
    const records = ranked.slice(0, 8).map(({ document }) => ({
      ...documentRecord(document),
      ...(toolName === "getInventory" ? { type: "INVENTORY" as const } : {}),
    }));
    return records.length
      ? output({
          actions: [],
          operation: null,
          outcome: records.length === 1 ? "OK" : "NEEDS_CLARIFICATION",
          records,
          summary: "Scenario guidance uses current simulated truth and cannot mutate connected Studio.",
          title: records.length === 1 ? records[0]!.label : "Choose a scenario record",
          tool: toolName,
        })
      : clarification(toolName, "Choose a record", "Name the scenario record you want to inspect.", []);
  };
}
