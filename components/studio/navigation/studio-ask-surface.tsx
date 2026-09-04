"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useSearchParams } from "next/navigation";
import { Fragment, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Archive,
  Bell,
  Boxes,
  Check,
  Circle,
  CircleAlert,
  CircleGauge,
  Clock3,
  Compass,
  FilePenLine,
  House,
  Images,
  Layers3,
  LayoutGrid,
  ListTodo,
  LoaderCircle,
  MapPin,
  PackageCheck,
  Pencil,
  Plus,
  RotateCcw,
  Route,
  Save,
  ShieldCheck,
  Shirt,
  Sparkles,
  Square,
  Store,
  Tag,
  Trash2,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { Message, MessageContent, MessageResponse } from "../../ai-elements/message";
import { Suggestion, Suggestions } from "../../ai-elements/suggestion";
import { Task, TaskContent, TaskItem, TaskTrigger } from "../../ai-elements/task";
import type { StudioAssistantUIMessage } from "../../../lib/ai/studio-assistant-agent";
import {
  createStudioAssistantThread,
  listStudioAssistantOperations,
  listStudioAssistantThreads,
  readStudioAssistantThread,
  reconcileStudioAssistantReply,
  updateStudioAssistantOperation,
  updateStudioAssistantThread,
} from "../../../lib/studio/services/studio-assistant-client";
import type {
  StudioAssistantThreadDetail,
  StudioAssistantThreadSummary,
  StudioAssistantThreadTask,
} from "../../../lib/studio/assistant/threads";
import {
  STUDIO_ASSISTANT_TOOL_NAMES,
  studioAssistantToolOutputSchema,
  type StudioAssistantConfirmOperationCommand,
  type StudioAssistantOperation,
} from "../../../lib/studio/assistant/tool-contracts";
import { SHOP_COLLECTION_COMPATIBILITY } from "../../../lib/shop/collection-compatibility";
import { studioOrderHasDueWork } from "../../../lib/shop/order-presentation";
import {
  contextualizeStudioAssistantQuery,
  normalizeStudioAssistantText,
  resolveStudioAssistantEntryPiece,
  resolveStudioAssistantWorkflow,
  studioAssistantSuggestionFamily,
  type StudioAssistantBlock,
  type StudioAssistantContext,
  type StudioAssistantDocument,
  type StudioAssistantResponse,
  type StudioAssistantSuggestionFamily,
  type StudioAssistantTaskDraft,
  type StudioAssistantWorkflowResponse,
} from "../../../lib/studio/assistant/experience";
import type { StudioSearchDocument } from "../../../lib/studio/application/contracts";
import { selectStudioProjectionFreshness } from "../../../lib/studio/application/projection-freshness";
import { selectStudioWorkProjection } from "../../../lib/studio/application/work-projection";
import {
  clearSessionCommandKey,
  getOrCreateSessionCommandKey,
} from "../../../lib/studio/idempotency/session-command-key";
import { STUDIO_SERVICES } from "../../../lib/studio/service-registry";
import { studioScenarioHref } from "../../../lib/studio/simulator";
import {
  actionableStudioDraftCount,
  historicalDrop01Kind,
} from "../../../lib/studio/projections/piece-workspace";
import { StudioDecisionSheet } from "../atoms/studio-decision-sheet";
import { StudioLoadingStage } from "../atoms/studio-loading-stage";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";
import {
  StudioAssistantToolPending,
  StudioAssistantToolResult,
} from "./studio-assistant-tool-result";

type FallbackTurn = {
  id: string;
  query: string;
  workflow: StudioAssistantWorkflowResponse;
};

type StoredStudioAssistantTask = Omit<StudioAssistantTaskDraft, "sourceQuery"> & {
  createdAt: string;
  expiresAt: string;
  status: "DONE" | "OPEN";
};

type DisplayStudioAssistantTask = StoredStudioAssistantTask | StudioAssistantThreadTask;
type WithoutThreadCommandFields<T> = T extends unknown ? Omit<T, "expectedVersion" | "idempotencyKey"> : never;
type StudioAssistantThreadMutation = WithoutThreadCommandFields<Parameters<typeof updateStudioAssistantThread>[1]>;
type StudioAskTransportFailure = Readonly<{
  code: string | null;
  message: string;
  recovery: string | null;
}>;

function studioAskTransportFailure(error: Error): StudioAskTransportFailure | null {
  try {
    const parsed = JSON.parse(error.message) as {
      error?: { code?: unknown; message?: unknown; recovery?: unknown };
    };
    if (!parsed.error || typeof parsed.error.message !== "string") return null;
    return {
      code: typeof parsed.error.code === "string" ? parsed.error.code : null,
      message: parsed.error.message,
      recovery: typeof parsed.error.recovery === "string" ? parsed.error.recovery : null,
    };
  } catch {
    return null;
  }
}

function confirmationForOperation(
  operation: StudioAssistantOperation,
): StudioAssistantConfirmOperationCommand {
  if (operation.kind === "PIECE_EDIT") {
    return { action: "CONFIRM", confirmation: "SAVE_PRIVATE_REVISION", expectedVersion: operation.version };
  }
  if (operation.kind === "PUBLISH_REVISION") {
    return {
      action: "CONFIRM",
      confirmation: "PUBLISH_REVISION",
      expectedVersion: operation.version,
      publicMediaConfirmed: true,
    };
  }
  if (operation.kind === "DROP_MOVE") {
    return { action: "CONFIRM", confirmation: "MOVE_DROP", expectedVersion: operation.version };
  }
  if (operation.kind === "ARCHIVE") {
    return { action: "CONFIRM", confirmation: "ARCHIVE", expectedVersion: operation.version };
  }
  return { action: "CONFIRM", confirmation: "DELETE_PERMANENTLY", expectedVersion: operation.version };
}

const MAX_QUERY_LENGTH = 1_200;
const TASK_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const TASKS_STORAGE_KEY = "juw.studio.ask.tasks.v2";
const SCENARIO_CAPABILITIES: StudioAssistantContext["capabilities"] = [
  { id: "PROJECTION", state: "AVAILABLE" },
  { id: "SEARCH", state: "AVAILABLE" },
  { id: "ASK_READ", state: "AVAILABLE" },
  { id: "WARDROBE_READ", state: "AVAILABLE" },
  { id: "WARDROBE_WRITE", state: "UNAVAILABLE" },
  { id: "ORDERS_READ", state: "AVAILABLE" },
  { id: "ORDERS_CREATE", state: "UNAVAILABLE" },
  { id: "ORDERS_WRITE", state: "UNAVAILABLE" },
  { id: "MODELS_READ", state: "UNAVAILABLE" },
  { id: "MODELS_WRITE", state: "UNAVAILABLE" },
  { id: "MEDIA_READ", state: "AVAILABLE" },
  { id: "MEDIA_WRITE", state: "UNAVAILABLE" },
  { id: "OPERATIONS_READ", state: "AVAILABLE" },
  { id: "HOLDS_WRITE", state: "UNAVAILABLE" },
  { id: "LOCATIONS_WRITE", state: "UNAVAILABLE" },
  { id: "OPERATIONS_WRITE", state: "UNAVAILABLE" },
  { id: "COLLECTIONS_READ", state: "AVAILABLE" },
  { id: "COLLECTIONS_WRITE", state: "UNAVAILABLE" },
  { id: "COLLECTION_MEMBERSHIP_WRITE", state: "UNAVAILABLE" },
];

const STUDIO_ASSISTANT_TOOL_PART_TYPES = new Set(
  STUDIO_ASSISTANT_TOOL_NAMES.map((name) => `tool-${name}`),
);

type StudioAssistantToolPart = {
  output?: unknown;
  state: "input-available" | "input-streaming" | "output-available" | "output-error" | "output-denied";
  type: string;
};

function assistantToolPart(value: StudioAssistantUIMessage["parts"][number]): StudioAssistantToolPart | null {
  if (!STUDIO_ASSISTANT_TOOL_PART_TYPES.has(value.type)) return null;
  return value as unknown as StudioAssistantToolPart;
}

function formatMessageTime(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(date);
}

function assistantTokens(values: Array<string | null | undefined>) {
  return normalizeStudioAssistantText(values.filter(Boolean).join(" "));
}

function messageText(message: StudioAssistantUIMessage) {
  return message.parts
    .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
    .map((part) => part.text)
    .join("\n")
    .trim();
}

function requestTextMessages(messages: StudioAssistantUIMessage[]) {
  return messages
    .filter((message) => message.role === "user" || message.role === "assistant")
    .map((message) => ({
      id: message.id,
      parts: message.parts
        .filter((part): part is Extract<typeof part, { type: "text" }> => part.type === "text")
        .map((part) => ({ text: part.text.slice(0, MAX_QUERY_LENGTH), type: "text" as const })),
      role: message.role,
    }))
    .filter((message) => message.parts.some((part) => part.text.trim()))
    .slice(-8);
}

function latestUserMessage(messages: StudioAssistantUIMessage[]) {
  return [...messages].reverse().find((message) => message.role === "user") ?? null;
}

function isSafeStudioHref(href: string) {
  try {
    const origin = "https://studio.invalid";
    const parsed = new URL(href, origin);
    return parsed.origin === origin
      && `${parsed.pathname}${parsed.search}${parsed.hash}` === href
      && (parsed.pathname === "/studio" || parsed.pathname.startsWith("/studio/"));
  } catch {
    return false;
  }
}

function isStudioAssistantTaskDraft(value: unknown): value is StudioAssistantTaskDraft {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudioAssistantTaskDraft>;
  return candidate.schemaVersion === "studio-assistant-task/v1"
    && candidate.state === "PROPOSED"
    && (candidate.storage === "DEVICE_PRIVATE" || candidate.storage === "SHARED_CONVERSATION")
    && candidate.requiresOwningWorkflowConfirmation === true
    && typeof candidate.id === "string" && candidate.id.length <= 160
    && typeof candidate.title === "string" && candidate.title.length <= 240
    && typeof candidate.objective === "string" && candidate.objective.length <= 1_200
    && typeof candidate.consequence === "string" && candidate.consequence.length <= 1_200
    && typeof candidate.sourceQuery === "string" && candidate.sourceQuery.length <= MAX_QUERY_LENGTH
    && (candidate.risk === "R0" || candidate.risk === "R1" || candidate.risk === "R2" || candidate.risk === "R3")
    && Boolean(candidate.action)
    && typeof candidate.action?.label === "string" && candidate.action.label.length <= 240
    && typeof candidate.action?.href === "string"
    && isSafeStudioHref(candidate.action.href)
    && Array.isArray(candidate.steps) && candidate.steps.length > 0 && candidate.steps.length <= 8
    && candidate.steps.every((step) => Boolean(
      step
      && typeof step.id === "string" && step.id.length <= 160
      && typeof step.label === "string" && step.label.length <= 500,
    ));
}

function isStoredStudioAssistantTask(value: unknown): value is StoredStudioAssistantTask {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredStudioAssistantTask> & { sourceQuery?: unknown };
  return candidate.schemaVersion === "studio-assistant-task/v1"
    && candidate.state === "PROPOSED"
    && candidate.storage === "DEVICE_PRIVATE"
    && candidate.requiresOwningWorkflowConfirmation === true
    && candidate.sourceQuery === undefined
    && typeof candidate.id === "string" && candidate.id.length <= 160
    && typeof candidate.title === "string" && candidate.title.length <= 240
    && typeof candidate.objective === "string" && candidate.objective.length <= 1_200
    && typeof candidate.consequence === "string" && candidate.consequence.length <= 1_200
    && (candidate.risk === "R0" || candidate.risk === "R1" || candidate.risk === "R2" || candidate.risk === "R3")
    && Boolean(candidate.action)
    && typeof candidate.action?.label === "string" && candidate.action.label.length <= 240
    && typeof candidate.action?.href === "string"
    && isSafeStudioHref(candidate.action.href)
    && Array.isArray(candidate.steps) && candidate.steps.length > 0 && candidate.steps.length <= 8
    && candidate.steps.every((step) => Boolean(
      step
      && typeof step.id === "string" && step.id.length <= 160
      && typeof step.label === "string" && step.label.length <= 500,
    ))
    && typeof candidate.createdAt === "string" && Number.isFinite(Date.parse(candidate.createdAt))
    && typeof candidate.expiresAt === "string" && Date.parse(candidate.expiresAt) > Date.now()
    && (candidate.status === "OPEN" || candidate.status === "DONE");
}

function restoreTasks(storageKey: string) {
  try {
    const stored = window.localStorage.getItem(storageKey);
    if (!stored) return [];
    const value = JSON.parse(stored) as unknown;
    if (!Array.isArray(value)) return [];
    const tasks = value.filter(isStoredStudioAssistantTask).slice(-24);
    if (tasks.length !== value.length) {
      window.localStorage.setItem(storageKey, JSON.stringify(tasks));
    }
    return tasks;
  } catch {
    return [];
  }
}

function persistTasks(storageKey: string, tasks: StoredStudioAssistantTask[]) {
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(tasks.slice(-24)));
    return true;
  } catch {
    // Device storage can be unavailable; the current conversation stays usable.
    return false;
  }
}

function storedTaskFromDraft(task: StudioAssistantTaskDraft): StoredStudioAssistantTask {
  const createdAt = new Date().toISOString();
  return {
    action: task.action,
    consequence: task.consequence,
    createdAt,
    expiresAt: new Date(Date.now() + TASK_RETENTION_MS).toISOString(),
    id: task.id,
    objective: task.objective,
    requiresOwningWorkflowConfirmation: true,
    risk: task.risk,
    schemaVersion: "studio-assistant-task/v1",
    state: "PROPOSED",
    status: "OPEN",
    steps: task.steps,
    storage: "DEVICE_PRIVATE",
    title: task.title,
  };
}

function pieceDetail(input: { availability?: string; category: string; colour?: string; state?: string }) {
  return [input.category, input.colour, input.availability ?? input.state]
    .filter(Boolean)
    .join(" · ");
}

function assistantHistoryState(
  garment: Parameters<typeof historicalDrop01Kind>[0],
): "SOLD_OUT" | "ARCHIVED_DRAFT" | null {
  return historicalDrop01Kind(garment);
}

function assistantDocumentKind(kind: StudioSearchDocument["kind"]): StudioAssistantDocument["kind"] {
  if (kind === "SERVICE") return "Service";
  if (kind === "COLLECTION") return "Collection";
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
  const projectedState = document.lifecycleState;
  const historicalState = projectedState === "SOLD_OUT" || projectedState === "ARCHIVED_DRAFT"
    ? projectedState
    : null;
  return {
    availableActions: document.availableActions ? [...document.availableActions] : undefined,
    detail: document.description?.trim() || document.secondaryLabel,
    entityId,
    href: document.route,
    id: document.id,
    identifiers: [document.id, entityId, ...document.aliases],
    kind,
    label: document.primaryLabel,
    mediaTargetId: historicalState ? undefined : piece?.wardrobeItemId ?? undefined,
    state: projectedState,
    tokens: assistantTokens([
      document.id,
      document.primaryLabel,
      document.description,
      document.secondaryLabel,
      projectedState,
      ...document.aliases,
    ]),
  };
}

function buildContext(studio: ReturnType<typeof useStudio>): StudioAssistantContext {
  const connected = studio.authority.snapshot;
  const projected = studio.scenario ? null : studio.application.snapshot;
  const applicationFreshness = selectStudioProjectionFreshness({
    error: studio.application.error,
    generatedAt: projected?.generatedAt ?? null,
    status: studio.application.status,
  });
  const localGarmentsById = new Map(studio.garments.map((garment) => [garment.id, garment]));
  const localGarmentsBySku = new Map(studio.garments.map((garment) => [garment.sku, garment]));
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

  if (studio.scenario && studio.application.snapshot) {
    documents.push(...studio.application.snapshot.searchDocuments
      .filter((document) => document.kind === "COLLECTION")
      .map((document) => projectedAssistantDocument(document, connected)));
  }

  if (!projected) {
  if (studio.scenario) {
    documents.push(...SHOP_COLLECTION_COMPATIBILITY.map((collection) => ({
      detail: `${collection.state.toLowerCase()} collection · ${collection.skus.length} pieces · read-only compatibility truth`,
      entityId: collection.id,
      href: studioScenarioHref(`/studio/wardrobe?collection=${encodeURIComponent(collection.key)}`, studio.scenario!),
      id: `collection:${collection.id}`,
      identifiers: [collection.id, collection.key, collection.label, ...(collection.isCurrent ? ["current drop"] : [])],
      kind: "Collection" as const,
      label: collection.label,
      state: collection.state,
      tokens: assistantTokens([collection.id, collection.key, collection.label, collection.state, collection.isCurrent ? "current drop" : "history"]),
    })));
  }
  const knownPieceKeys = new Set<string>();
  for (const garment of studio.garments) {
    const historicalState = assistantHistoryState(garment);
    const projectedState = historicalState ?? garment.state;
    knownPieceKeys.add(garment.sku.toLocaleLowerCase("en-NG"));
    knownPieceKeys.add(garment.id.toLocaleLowerCase("en-NG"));
    if (garment.privateWardrobeItemId) knownPieceKeys.add(garment.privateWardrobeItemId.toLocaleLowerCase("en-NG"));
    documents.push({
      availableActions: garment.availability === "AVAILABLE"
        ? ["CREATE_HOLD", "CREATE_ORDER"]
        : undefined,
      detail: garment.publicDescription?.trim()
        || pieceDetail({ availability: garment.availability, category: garment.category, colour: garment.color }),
      entityId: garment.id,
      href: `/studio/wardrobe/${encodeURIComponent(garment.id)}`,
      id: `piece:${garment.id}`,
      identifiers: [garment.id, garment.sku, garment.privateWardrobeItemId ?? ""],
      kind: "Piece",
      label: garment.title,
      mediaTargetId: historicalState ? undefined : garment.privateWardrobeItemId ?? (studio.scenario ? garment.id : undefined),
      state: projectedState,
      tokens: assistantTokens([
        garment.id,
        garment.sku,
        garment.title,
        garment.publicDescription,
        garment.category,
        garment.color,
        garment.condition,
        projectedState,
        garment.availability,
        garment.dynamicPublication?.drop,
      ]),
    });
  }

  for (const piece of connected?.pieces ?? []) {
    const keys = [piece.sku, piece.wardrobeItemId, piece.pieceKey].filter(Boolean) as string[];
    if (keys.some((key) => knownPieceKeys.has(key.toLocaleLowerCase("en-NG")))) continue;
    const entityId = piece.wardrobeItemId ?? piece.pieceKey;
    const historicalState = piece.sku ? assistantHistoryState({ id: entityId, sku: piece.sku }) : null;
    const projectedState = historicalState ?? piece.availability;
    documents.push({
      availableActions: piece.activeHold
        ? ["RELEASE_HOLD"]
        : piece.availability === "AVAILABLE" && piece.sku
          ? ["CREATE_HOLD", "CREATE_ORDER"]
          : undefined,
      detail: piece.description?.trim()
        || pieceDetail({ availability: piece.availability, category: piece.category, colour: piece.colour }),
      entityId,
      href: piece.wardrobeItemId
        ? `/studio/wardrobe/${encodeURIComponent(piece.wardrobeItemId)}`
        : "/studio/operations?view=inventory",
      id: `piece:${entityId}`,
      identifiers: keys,
      kind: "Piece",
      label: piece.title,
      mediaTargetId: historicalState ? undefined : piece.wardrobeItemId ?? undefined,
      state: projectedState,
      tokens: assistantTokens([
        ...keys,
        piece.title,
        piece.description,
        piece.category,
        piece.colour,
        piece.condition,
        piece.sizeLabel,
        projectedState,
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

  for (const model of connected?.models.filter((candidate) => candidate.state === "READY") ?? []) {
    documents.push({
      detail: `${model.kind.replaceAll("_", " ")} · ${model.state.toLocaleLowerCase("en-NG")}`,
      entityId: model.id,
      href: `/studio/models?view=authority&model=${encodeURIComponent(model.id)}`,
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

  const projectedAttention = studio.scenario
    ? studio.garments.filter((garment) => (
        garment.state === "ERROR" && historicalDrop01Kind(garment) === null
      )).length + (connected?.orders.filter(studioOrderHasDueWork).length ?? 0)
    : connected
      ? selectStudioWorkProjection(connected).attentionCount
      : null;
  const localLive = studio.garments.filter((garment) => (
    garment.dynamicPublication?.state === "PUBLISHED"
    && historicalDrop01Kind(garment) === null
  )).length || studio.listings.filter((listing) => {
    if (listing.state !== "PUBLISHED") return false;
    const garment = localGarmentsById.get(listing.garmentId);
    return !garment || historicalDrop01Kind(garment) === null;
  }).length;
  const scenarioDrafts = studio.scenario ? actionableStudioDraftCount(studio.garments) : 0;
  const scenarioContinueAction = studio.scenario
    ? studio.returns.length
      ? {
          href: studioScenarioHref("/studio/orders?filter=RETURNS", studio.scenario),
          label: `Review ${studio.returns.length} return${studio.returns.length === 1 ? "" : "s"}`,
        }
      : scenarioDrafts
        ? {
            href: studioScenarioHref("/studio/wardrobe", studio.scenario),
            label: `Finish ${scenarioDrafts} draft${scenarioDrafts === 1 ? "" : "s"}`,
          }
        : {
            href: studioScenarioHref("/studio/wardrobe?intake=1", studio.scenario),
            label: "Add the next piece",
          }
    : null;

  return {
    capabilities: studio.application.snapshot?.capabilities.map((capability) => ({
      id: capability.id,
      state: capability.state,
    })) ?? (studio.scenario ? SCENARIO_CAPABILITIES : []),
    continueAction: studio.application.snapshot?.continueAction
      ? {
          href: studio.application.snapshot.continueAction.href,
          label: studio.application.snapshot.continueAction.label,
        }
      : scenarioContinueAction,
    documents,
    provenance: projected
      ? {
          detail: applicationFreshness.state === "STALE"
            ? studio.application.error || "Refresh failed. Read answers will verify current Studio truth again."
            : projected.degradedSources.length
            ? `${projected.degradedSources.length} source${projected.degradedSources.length === 1 ? "" : "s"} limited`
            : "Connected Studio application snapshot",
          generatedAt: projected.generatedAt,
          label: applicationFreshness.state === "STALE"
            ? "Last-known Studio"
            : projected.degradedSources.length ? "Studio snapshot" : "Live Studio",
          status: applicationFreshness.state === "STALE" || projected.degradedSources.length
            ? "degraded"
            : "connected",
        }
      : studio.scenario
      ? {
          detail: "Lifecycle simulator · in-memory state",
           generatedAt: connected?.generatedAt ?? null,
           label: "Scenario preview",
           scenario: studio.scenario,
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
        : connected?.pieces.filter((piece) => {
            if (piece.availability !== "AVAILABLE") return false;
            const garment = piece.sku ? localGarmentsBySku.get(piece.sku) : undefined;
            return !garment || historicalDrop01Kind(garment) === null;
          }).length
          ?? (studio.scenario
            ? studio.garments.filter((garment) => (
                garment.availability === "AVAILABLE"
                && historicalDrop01Kind(garment) === null
              )).length
            : null),
      drafts: projected
        ? projected.summary.drafts.value
        : studio.scenario
          ? actionableStudioDraftCount(studio.garments)
          : connected?.pieces.filter((piece) => piece.availability === "PRIVATE").length ?? null,
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

type AssistantVisual = {
  icon: LucideIcon;
  tone: "atelier" | "attention" | "available" | "neutral" | "operations" | "orders" | "wardrobe";
};

function studioHref(href: string) {
  try {
    return new URL(href, "https://studio.invalid");
  } catch {
    return new URL("/studio", "https://studio.invalid");
  }
}

function destinationVisual(href: string): AssistantVisual {
  const destination = studioHref(href);
  const view = destination.searchParams.get("view");
  const action = destination.searchParams.get("action");
  if (destination.pathname.startsWith("/studio/orders") || view === "orders") {
    return { icon: PackageCheck, tone: "orders" };
  }
  if (destination.pathname.startsWith("/studio/media")) {
    return { icon: Images, tone: "atelier" };
  }
  if (destination.pathname.startsWith("/studio/models")) {
    return { icon: UserRound, tone: "atelier" };
  }
  if (destination.pathname.startsWith("/studio/stocktake") || destination.pathname.startsWith("/studio/scan")) {
    return { icon: CircleGauge, tone: "operations" };
  }
  if (destination.pathname.startsWith("/studio/wardrobe") && view === "publishing") {
    return { icon: Store, tone: "wardrobe" };
  }
  if (destination.pathname.startsWith("/studio/wardrobe")
    && (destination.searchParams.has("collection") || destination.searchParams.has("dropAction"))) {
    return { icon: Layers3, tone: "wardrobe" };
  }
  if (destination.pathname.startsWith("/studio/wardrobe") && action === "price") {
    return { icon: Tag, tone: "wardrobe" };
  }
  if (destination.pathname.startsWith("/studio/wardrobe")) {
    return { icon: Shirt, tone: "wardrobe" };
  }
  if (destination.pathname.startsWith("/studio/operations") && view === "holds") {
    return { icon: Clock3, tone: "operations" };
  }
  if (destination.pathname.startsWith("/studio/operations") && action === "location") {
    return { icon: MapPin, tone: "operations" };
  }
  if (destination.pathname.startsWith("/studio/operations") && view === "inventory") {
    return { icon: Boxes, tone: "operations" };
  }
  if (destination.pathname.startsWith("/studio/operations")) return { icon: CircleGauge, tone: "operations" };
  if (destination.pathname === "/studio") return { icon: House, tone: "neutral" };
  return { icon: Compass, tone: "neutral" };
}

function metricVisual(href: string): AssistantVisual {
  const destination = studioHref(href);
  const view = destination.searchParams.get("view");
  if (destination.pathname === "/studio/operations" && !view) return { icon: Bell, tone: "attention" };
  if (destination.pathname === "/studio/operations" && view === "inventory") return { icon: Boxes, tone: "available" };
  if (destination.pathname === "/studio/wardrobe" && view === "publishing") return { icon: Store, tone: "wardrobe" };
  if (destination.pathname === "/studio/orders" || view === "orders") return { icon: PackageCheck, tone: "orders" };
  return destinationVisual(href);
}

function resultVisual(
  item: Extract<StudioAssistantBlock, { kind: "results" }>["items"][number],
): AssistantVisual {
  if (item.kind === "Service") return destinationVisual(item.href);
  if (item.kind === "Alert") return { icon: CircleAlert, tone: "attention" };
  if (item.kind === "Collection") return { icon: Layers3, tone: "wardrobe" };
  if (item.kind === "Media") return { icon: Images, tone: "atelier" };
  if (item.kind === "Model") return { icon: UserRound, tone: "atelier" };
  if (item.kind === "Order") return { icon: PackageCheck, tone: "orders" };
  return { icon: Shirt, tone: "wardrobe" };
}

function suggestionVisual(family: StudioAssistantSuggestionFamily): AssistantVisual {
  if (family === "PRIORITIES") return { icon: Bell, tone: "attention" };
  if (family === "CAPABILITIES") return { icon: LayoutGrid, tone: "neutral" };
  if (family === "PRIVATE_DRAFTS") return { icon: FilePenLine, tone: "wardrobe" };
  if (family === "ORDERS") return { icon: PackageCheck, tone: "orders" };
  if (family === "BLOCKERS" || family === "IMPACT" || family === "SAFE_NEXT") {
    return { icon: ShieldCheck, tone: "operations" };
  }
  if (family === "WORKFLOW") return { icon: Route, tone: "neutral" };
  return { icon: Sparkles, tone: "neutral" };
}

function AssistantBlock({
  block,
  busy,
  onPrompt,
}: {
  block: StudioAssistantBlock;
  busy: boolean;
  onPrompt(prompt: string): void;
}) {
  const titleId = useId();
  if (block.kind === "answer") {
    return <div className="studio-ask-answer"><strong>{block.title}</strong><p>{block.body}</p></div>;
  }
  if (block.kind === "metrics") {
    return (
      <ul aria-label="Studio summary" className="studio-ask-metrics">
        {block.items.map((item) => {
          const visual = metricVisual(item.href);
          const Icon = visual.icon;
          return (
            <li key={item.label}>
              <Link href={item.href}>
                <span className={`studio-ask-symbol is-${visual.tone}`}><Icon aria-hidden="true" size={17} /></span>
                <span className="studio-ask-metric-copy"><strong>{item.value}</strong><small>{item.label}</small></span>
              </Link>
            </li>
          );
        })}
      </ul>
    );
  }
  if (block.kind === "results") {
    return (
      <div className="studio-ask-results">
        <small id={titleId}>{block.title}</small>
        <ul aria-labelledby={titleId}>{block.items.map((item) => {
          const visual = resultVisual(item);
          const Icon = visual.icon;
          return (
            <li key={item.id}>
              <Link className={`studio-ask-result is-${visual.tone}`} href={item.href}>
                <span className={`studio-ask-symbol is-${visual.tone}`}><Icon aria-hidden="true" size={17} /></span>
                <span className="studio-ask-result-copy">
                  <strong>{item.label}</strong>
                  <small>{item.kind === "Service" ? item.detail : `${item.kind} · ${item.detail}`}</small>
                </span>
                {item.state ? <em>{item.state.replaceAll("_", " ")}</em> : null}
                <ArrowRight aria-hidden="true" size={16} />
              </Link>
            </li>
          );
        })}</ul>
      </div>
    );
  }
  if (block.kind === "clarification") {
    return (
      <div className="studio-ask-clarification">
        <strong>{block.title}</strong><p>{block.body}</p>
        <div>{block.options.map((option) => option.prompt ? (
          <button aria-busy={busy || undefined} disabled={busy} key={`${option.href}:${option.label}`} onClick={() => onPrompt(option.prompt!)} type="button">
            {option.label}<ArrowRight aria-hidden="true" size={15} />
          </button>
        ) : (
          <Link href={option.href} key={`${option.href}:${option.label}`}>{option.label}<ArrowRight aria-hidden="true" size={15} /></Link>
        ))}</div>
      </div>
    );
  }
  if (block.kind === "handoff") {
    const visual = destinationVisual(block.action.href);
    const Icon = visual.icon;
    return (
      <div className="studio-ask-handoff">
        <div className="studio-ask-handoff-heading">
          <span className={`studio-ask-symbol is-${visual.tone}`}><Icon aria-hidden="true" size={18} /></span>
          <span><small>{riskLabel(block.risk)}</small><strong>{block.title}</strong></span>
        </div>
        <p>{block.body}</p>
        <span className={block.risk === "R0" ? "sr-only" : undefined}>{block.consequence}</span>
        <Link className="button button-primary" href={block.action.href}>{block.action.label}<ArrowRight aria-hidden="true" size={15} /></Link>
      </div>
    );
  }
  return (
    <div className="studio-ask-recovery">
      <span className="studio-ask-symbol is-attention"><CircleAlert aria-hidden="true" size={18} /></span>
      <div><strong>{block.title}</strong><p>{block.body}</p></div>
      <div>{block.actions.map((action) => <Link href={action.href} key={`${action.href}:${action.label}`}>{action.label}</Link>)}</div>
    </div>
  );
}

function AssistantWorkflowCard({
  busy,
  onPrompt,
  onSaveTask,
  savedTaskIds,
  workflow,
}: {
  busy: boolean;
  onPrompt(prompt: string): void;
  onSaveTask(task: StudioAssistantTaskDraft, returnFocus: HTMLElement): void;
  savedTaskIds: Set<string>;
  workflow: StudioAssistantWorkflowResponse;
}) {
  const task = workflow.taskDraft;
  const saved = Boolean(task && savedTaskIds.has(task.id));
  return (
    <div className="studio-ask-response">
      {workflow.response.blocks.map((block, index) => (
        <AssistantBlock block={block} busy={busy} key={`${block.kind}:${index}`} onPrompt={onPrompt} />
      ))}

      {task ? (
        <section className="studio-ask-task-draft">
          <Task defaultOpen={false}>
            <TaskTrigger className="studio-ask-task-trigger" title={task.title}>
              <span><ListTodo aria-hidden="true" size={17} />Suggested task</span>
              <strong>{task.title}</strong>
              <small>{riskLabel(task.risk)} · saved only on this device</small>
            </TaskTrigger>
            <TaskContent className="studio-ask-task-content">
              {task.steps.map((step) => (
                <TaskItem className="studio-ask-task-step" key={step.id}>
                  <Circle aria-hidden="true" size={12} />{step.label}
                </TaskItem>
              ))}
            </TaskContent>
          </Task>
          <div className="studio-ask-task-actions">
            <button
              className="button button-secondary"
              disabled={busy || saved}
              onClick={(event) => onSaveTask(task, event.currentTarget)}
              type="button"
            >
              {saved ? <Check aria-hidden="true" size={15} /> : <Save aria-hidden="true" size={15} />}
              {saved ? "Task saved" : "Save task"}
            </button>
            <small>This does not run the workflow.</small>
          </div>
        </section>
      ) : null}

      {workflow.suggestions.length ? (
        <Suggestions className="studio-ask-suggestions" aria-label="Suggested follow-up questions">
          {workflow.suggestions.map((suggestion) => {
            const visual = suggestionVisual(studioAssistantSuggestionFamily(suggestion.prompt));
            const Icon = visual.icon;
            return (
              <Suggestion
                className={`studio-ask-suggestion is-${visual.tone}`}
                disabled={busy}
                key={suggestion.id}
                onClick={onPrompt}
                suggestion={suggestion.prompt}
              >
                <Icon aria-hidden="true" size={15} />
                <span>{suggestion.label}</span>
              </Suggestion>
            );
          })}
        </Suggestions>
      ) : null}

      <small
        className={`studio-ask-provenance is-${workflow.response.provenance.status}`}
        title={[workflow.response.provenance.label, workflow.response.provenance.detail, workflow.response.provenance.generatedAt]
          .filter(Boolean)
          .join(" · ")}
      >
        {workflow.response.provenance.label}
        {provenanceTime(workflow.response.provenance.generatedAt)
          ? ` · ${provenanceTime(workflow.response.provenance.generatedAt)}`
          : ""}
        <span className="sr-only"> · {workflow.response.provenance.detail}</span>
      </small>
    </div>
  );
}

function AssistantFallbackMessage({
  busy,
  onPrompt,
  onSaveTask,
  savedTaskIds,
  scenario,
  turn,
}: {
  busy: boolean;
  onPrompt(prompt: string): void;
  onSaveTask(task: StudioAssistantTaskDraft, returnFocus: HTMLElement): void;
  savedTaskIds: Set<string>;
  scenario: boolean;
  turn: FallbackTurn;
}) {
  return (
    <Message className="studio-ask-message" from="assistant">
      <MessageContent className="studio-ask-message-content">
        <small className="studio-ask-fallback-label">{scenario ? "Scenario guidance · current simulator state" : "Safe local guidance · agent connection unavailable"}</small>
        <AssistantWorkflowCard
          busy={busy}
          onPrompt={onPrompt}
          onSaveTask={onSaveTask}
          savedTaskIds={savedTaskIds}
          workflow={turn.workflow}
        />
      </MessageContent>
    </Message>
  );
}

export function StudioAskSurface() {
  const searchParams = useSearchParams();
  const studio = useStudio();
  const askCapability = studio.scenario
    ? "AVAILABLE"
    : studio.application.snapshot?.capabilities.find((capability) => capability.id === "ASK_READ")?.state ?? "UNAVAILABLE";
  const context = useMemo(() => buildContext(studio), [studio]);
  const entryPieceTarget = searchParams.get("piece");
  const entryPiece = useMemo(
    () => resolveStudioAssistantEntryPiece(context.documents, entryPieceTarget),
    [context.documents, entryPieceTarget],
  );
  const entryPieceReference = entryPiece
    ? entryPiece.identifiers.find((identifier) => /^JUW-[0-9]/i.test(identifier.trim()))
      ?? entryPiece.entityId
      ?? entryPiece.id.replace(/^piece:/, "")
    : null;
  const starters = useMemo(() => {
    const available = (id: StudioAssistantContext["capabilities"][number]["id"]) => (
      context.capabilities.some((capability) => capability.id === id && capability.state === "AVAILABLE")
    );
    return [
      "What needs attention?",
      available("WARDROBE_WRITE") ? "Add a new piece" : "Find a piece",
      available("COLLECTIONS_WRITE") ? "Create a new drop" : "Show the current drop",
      "What can you help with?",
    ];
  }, [context.capabilities]);
  const operator = studio.application.snapshot?.operator;
  const storageScope = encodeURIComponent((studio.scenario
    ? `scenario:${studio.scenario}:${operator?.storageScope ?? "unavailable"}`
    : `connected:${operator?.storageScope ?? "unavailable"}`
  ));
  const tasksStorageKey = `${TASKS_STORAGE_KEY}:${storageScope}`;
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState("");
  const [fallbackTurns, setFallbackTurns] = useState<FallbackTurn[]>([]);
  const [tasks, setTasks] = useState<DisplayStudioAssistantTask[]>([]);
  const [taskStorageError, setTaskStorageError] = useState("");
  const [selectedTask, setSelectedTask] = useState<StudioAssistantTaskDraft | null>(null);
  const [taskReturnFocus, setTaskReturnFocus] = useState<HTMLElement | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [threads, setThreads] = useState<StudioAssistantThreadSummary[]>([]);
  const [activeThread, setActiveThread] = useState<StudioAssistantThreadDetail | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [threadBusy, setThreadBusy] = useState(false);
  const [olderMessagesBusy, setOlderMessagesBusy] = useState(false);
  const [threadError, setThreadError] = useState("");
  const [threadRefreshToken, setThreadRefreshToken] = useState(0);
  const [renameTarget, setRenameTarget] = useState<StudioAssistantThreadSummary | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [archiveTarget, setArchiveTarget] = useState<StudioAssistantThreadSummary | null>(null);
  const [threadActionReturnFocus, setThreadActionReturnFocus] = useState<HTMLElement | null>(null);
  const [operationsById, setOperationsById] = useState<Record<string, StudioAssistantOperation>>({});
  const [selectedOperation, setSelectedOperation] = useState<StudioAssistantOperation | null>(null);
  const [publicMediaReviewed, setPublicMediaReviewed] = useState(false);
  const [operationReturnFocus, setOperationReturnFocus] = useState<HTMLElement | null>(null);
  const flightRef = useRef(false);
  const operationFlightRef = useRef(false);
  const replyFlightRef = useRef(false);
  const threadActionFlightRef = useRef(false);
  const olderMessagesFlightRef = useRef(false);
  const skipNextAutoScrollRef = useRef(false);
  const pendingRef = useRef<{ id: string; query: string } | null>(null);
  const initializedScopeRef = useRef("");
  const messagesRef = useRef<StudioAssistantUIMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const [inputElement, setInputElement] = useState<HTMLTextAreaElement | null>(null);
  const [tasksButtonElement, setTasksButtonElement] = useState<HTMLButtonElement | null>(null);
  const [historyButtonElement, setHistoryButtonElement] = useState<HTMLButtonElement | null>(null);
  const [replyCheckingId, setReplyCheckingId] = useState<string | null>(null);
  const [replyNotices, setReplyNotices] = useState<Record<string, string>>({});
  const [replyAnnouncement, setReplyAnnouncement] = useState("");

  const transport = useMemo(() => new DefaultChatTransport<StudioAssistantUIMessage>({
    api: "/api/studio/ask",
    prepareSendMessagesRequest: ({ messages }) => {
      const message = latestUserMessage(requestTextMessages(messages) as StudioAssistantUIMessage[]);
      return {
        body: {
          message,
          ...(studio.scenario ? { scenario: studio.scenario } : { threadId: activeThread?.id }),
        },
      };
    },
  }), [activeThread?.id, studio.scenario]);

  const addFallback = useCallback((active: { id: string; query: string }) => {
    const lastUserIndex = messagesRef.current.findLastIndex((message) => message.role === "user");
    const freshAssistantMessages = messagesRef.current.slice(lastUserIndex + 1);
    const alreadyHasWorkflow = freshAssistantMessages.some((message) => message.parts.some((part) => (
      assistantToolPart(part)?.state === "output-available"
    )));
    if (alreadyHasWorkflow) return;
    const conversation = [
      ...fallbackTurns.map((turn) => turn.query),
      ...messagesRef.current
        .filter((message) => message.role === "user")
        .map(messageText)
        .filter(Boolean),
    ];
    if (conversation.at(-1) !== active.query) conversation.push(active.query);
    const contextualQuery = contextualizeStudioAssistantQuery(
      conversation.map((text) => ({ role: "user" as const, text })),
      context,
    );
    setFallbackTurns((current) => current.some((turn) => turn.id === active.id)
      ? current
      : [...current, {
          id: active.id,
          query: active.query,
          workflow: resolveStudioAssistantWorkflow(contextualQuery, context),
        }].slice(-12));
  }, [context, fallbackTurns]);

  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<StudioAssistantUIMessage>({
    id: studio.scenario ? `studio-ask-scenario-${studio.scenario}` : activeThread?.id ?? "studio-ask-opening",
    messages: studio.scenario ? [] : activeThread?.messages.map((stored) => stored.message) ?? [],
    onError: (chatError) => {
      const failure = studioAskTransportFailure(chatError);
      const pending = pendingRef.current;
      if (studio.scenario && pendingRef.current) addFallback(pendingRef.current);
      if (!studio.scenario && failure?.code === "THREAD_BUSY" && pending) {
        setQuery(pending.query);
        setThreadError([failure.message, failure.recovery].filter(Boolean).join(" "));
        setThreadRefreshToken((value) => value + 1);
        window.requestAnimationFrame(() => inputElement?.focus({ preventScroll: true }));
      } else if (!studio.scenario) {
        setThreadError("Ask Studio could not finish that reply. Your question remains in this shared conversation.");
      }
      setReplyAnnouncement("Ask Studio could not finish the reply.");
      pendingRef.current = null;
      flightRef.current = false;
    },
    onFinish: ({ isAbort, isError }) => {
      if (studio.scenario && isError && pendingRef.current) addFallback(pendingRef.current);
      setReplyAnnouncement(isAbort
        ? "Ask Studio reply stopped."
        : isError
          ? "Ask Studio could not finish the reply."
          : "Ask Studio reply ready.");
      if (!isAbort || pendingRef.current) pendingRef.current = null;
      flightRef.current = false;
      if (!studio.scenario) setThreadRefreshToken((value) => value + 1);
    },
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const savedTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const pendingOperations = Object.values(operationsById).filter((operation) => (
    operation.state === "PREPARED" || operation.state === "EXECUTING"
  ));
  const openTaskCount = tasks.filter((task) => task.status === "OPEN").length + pendingOperations.length;
  const hasConversation = messages.length > 0 || fallbackTurns.length > 0;
  const storedMessageById = useMemo(() => new Map(
    (activeThread?.messages ?? []).map((stored) => [stored.message.id, stored]),
  ), [activeThread?.messages]);

  useEffect(() => {
    if (!studio.scenario) return;
    const frame = window.requestAnimationFrame(() => {
      setFallbackTurns([]);
      setMessages([]);
      setTasks(restoreTasks(tasksStorageKey));
      setTaskStorageError("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [setMessages, studio.scenario, tasksStorageKey]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (studio.scenario || studio.application.status !== "ready") return;
    const scope = operator?.storageScope ?? "unavailable";
    if (initializedScopeRef.current === scope) return;
    initializedScopeRef.current = scope;
    const controller = new AbortController();
    setThreadBusy(true);
    setThreadError("");
    void (async () => {
      try {
        const available = await listStudioAssistantThreads(controller.signal);
        if (controller.signal.aborted) return;
        setThreads(available);
        const requestedId = searchParams.get("thread");
        const chosen = (requestedId ? available.find((thread) => thread.id === requestedId) : null)
          ?? available.find((thread) => thread.state === "OPEN");
        let detail: StudioAssistantThreadDetail;
        if (chosen) {
          detail = await readStudioAssistantThread(chosen.id, controller.signal);
        } else {
          const commandScope = `ask-thread-bootstrap:${scope}`;
          const commandRevision = entryPieceReference ?? "no-piece";
          const idempotencyKey = getOrCreateSessionCommandKey({
            keyPrefix: "ask.thread.create",
            revision: commandRevision,
            scope: commandScope,
          });
          detail = await createStudioAssistantThread({
            idempotencyKey,
            ...(entryPieceReference ? { pieceReference: entryPieceReference } : {}),
          });
          clearSessionCommandKey({ key: idempotencyKey, revision: commandRevision, scope: commandScope });
        }
        if (controller.signal.aborted) return;
        setActiveThread(detail);
        setTasks(detail.pendingWork);
        setMessages(detail.messages.map((stored) => stored.message));
        setThreads((current) => current.some((thread) => thread.id === detail.id)
          ? current.map((thread) => thread.id === detail.id ? detail : thread)
          : [detail, ...current]);
      } catch (threadLoadError) {
        if (!controller.signal.aborted) {
          setThreadError(threadLoadError instanceof Error ? threadLoadError.message : "Conversation history is unavailable.");
        }
      } finally {
        if (!controller.signal.aborted) setThreadBusy(false);
      }
    })();
    return () => controller.abort();
  }, [entryPieceReference, operator?.storageScope, searchParams, setMessages, studio.application.status, studio.scenario]);

  const activeThreadId = activeThread?.id;
  useEffect(() => {
    if (studio.scenario || !activeThreadId) {
      setOperationsById({});
      return;
    }
    const controller = new AbortController();
    void listStudioAssistantOperations(activeThreadId, controller.signal).then((operations) => {
      if (controller.signal.aborted) return;
      setOperationsById(Object.fromEntries(operations.map((operation) => [operation.id, operation])));
    }).catch((operationError) => {
      if (!controller.signal.aborted) {
        setThreadError(operationError instanceof Error ? operationError.message : "Prepared changes could not refresh.");
      }
    });
    return () => controller.abort();
  }, [activeThreadId, studio.scenario, threadRefreshToken]);

  useEffect(() => {
    if (studio.scenario || !activeThreadId || !threadRefreshToken) return;
    let cancelled = false;
    void readStudioAssistantThread(activeThreadId).then((detail) => {
      if (cancelled) return;
      setActiveThread(detail);
      setTasks(detail.pendingWork);
      setMessages(detail.messages.map((stored) => stored.message));
      setThreads((current) => current.map((thread) => thread.id === detail.id ? detail : thread));
    }).catch((threadLoadError) => {
      if (!cancelled) setThreadError(threadLoadError instanceof Error ? threadLoadError.message : "Conversation history could not refresh.");
    });
    return () => { cancelled = true; };
  }, [activeThreadId, setMessages, studio.scenario, threadRefreshToken]);

  useEffect(() => {
    if (!hasConversation) return;
    if (skipNextAutoScrollRef.current) {
      skipNextAutoScrollRef.current = false;
      return;
    }
    const end = endRef.current;
    const scroller = end?.closest("main");
    const composer = end?.closest(".studio-ask-page")?.querySelector(".studio-ask-composer-dock");
    if (!end || !(scroller instanceof HTMLElement) || !(composer instanceof HTMLElement)) {
      end?.scrollIntoView({ behavior: "smooth", block: "end" });
      return;
    }
    const targetBottom = Math.min(
      scroller.getBoundingClientRect().bottom,
      composer.getBoundingClientRect().top,
    ) - 12;
    const delta = end.getBoundingClientRect().bottom - targetBottom;
    if (delta <= 0) return;
    scroller.scrollTo({ behavior: "smooth", top: scroller.scrollTop + delta });
  }, [fallbackTurns, hasConversation, messages, status]);

  const submit = useCallback((requestedQuery: string) => {
    const cleanQuery = requestedQuery.trim();
    if (!cleanQuery || flightRef.current || status === "submitted" || status === "streaming") return;
    if (cleanQuery.length > MAX_QUERY_LENGTH) {
      setQueryError(`Keep the request to ${MAX_QUERY_LENGTH.toLocaleString("en-NG")} characters or fewer.`);
      return;
    }
    const active = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, query: cleanQuery };
    flightRef.current = true;
    pendingRef.current = active;
    setReplyAnnouncement("");
    if (status === "error") clearError();
    setQueryError("");
    setQuery("");
    if (!studio.scenario && !activeThread) {
      flightRef.current = false;
      pendingRef.current = null;
      setThreadError("Ask Studio is still opening this shared conversation.");
      return;
    }
    void sendMessage({
      id: active.id,
      parts: [{ text: cleanQuery, type: "text" }],
      role: "user",
    }).catch(() => {
      setThreadError("Ask Studio could not send that question. No Studio record changed.");
      pendingRef.current = null;
      flightRef.current = false;
    });
  }, [activeThread, addFallback, clearError, sendMessage, status, studio.scenario]);

  function reuseQuestion(question: string) {
    if (!question.trim() || busy) return;
    setQuery(question);
    setQueryError("");
    window.requestAnimationFrame(() => inputElement?.focus({ preventScroll: true }));
  }

  async function reconcileReply(messageId: string) {
    if (studio.scenario || !activeThread || replyFlightRef.current) return;
    replyFlightRef.current = true;
    setReplyCheckingId(messageId);
    setReplyNotices((current) => ({ ...current, [messageId]: "" }));
    try {
      const result = await reconcileStudioAssistantReply(
        activeThread.id,
        messageId,
        activeThread.version,
      );
      setActiveThread(result.thread);
      setTasks(result.thread.pendingWork);
      setMessages(result.thread.messages.map((stored) => stored.message));
      setThreads((current) => current.map((thread) => (
        thread.id === result.thread.id ? result.thread : thread
      )));
      setReplyNotices((current) => ({
        ...current,
        [messageId]: result.outcome === "RUNNING"
          ? "The original reply is still running. Check again shortly; Ask Studio will not start it twice."
          : result.outcome === "RECOVERED"
            ? "No saved reply was recovered. The question remains above; use it again only when you are ready."
            : "The saved reply is already reconciled.",
      }));
    } catch (replyError) {
      setReplyNotices((current) => ({
        ...current,
        [messageId]: replyError instanceof Error ? replyError.message : "That reply could not be checked.",
      }));
    } finally {
      replyFlightRef.current = false;
      setReplyCheckingId(null);
    }
  }

  const entryPieceAction = entryPiece && entryPieceReference ? (
    <button
      aria-label={`Ask about ${entryPiece.label}`}
      className={hasConversation ? "studio-ask-entry-context is-thread" : "studio-ask-entry-context"}
      disabled={busy}
      onClick={() => submit(`What can you help with for ${entryPieceReference}?`)}
      type="button"
    >
      <Shirt aria-hidden="true" size={18} />
      <span><small>Current piece · {entryPieceReference}</small><strong>{entryPiece.label}</strong></span>
      <ArrowRight aria-hidden="true" size={17} />
    </button>
  ) : null;

  async function resetConversation(forceCreate = false) {
    if (busy) void stop();
    flightRef.current = false;
    pendingRef.current = null;
    if (studio.scenario) {
      setMessages([]);
      setFallbackTurns([]);
      setQuery("");
      setQueryError("");
      clearError();
      window.requestAnimationFrame(() => inputElement?.focus({ preventScroll: true }));
      return;
    }
    if (!forceCreate && activeThread && activeThread.messages.length === 0 && messages.length === 0) {
      setHistoryOpen(false);
      window.requestAnimationFrame(() => inputElement?.focus({ preventScroll: true }));
      return;
    }
    if (threadActionFlightRef.current) return;
    threadActionFlightRef.current = true;
    setThreadBusy(true);
    const commandScope = `ask-thread-new:${storageScope}`;
    const commandRevision = `${activeThread?.id ?? "none"}:${entryPieceReference ?? "no-piece"}`;
    const idempotencyKey = getOrCreateSessionCommandKey({
      keyPrefix: "ask.thread.create",
      revision: commandRevision,
      scope: commandScope,
    });
    try {
      const detail = await createStudioAssistantThread({
        idempotencyKey,
        ...(entryPieceReference ? { pieceReference: entryPieceReference } : {}),
      });
      clearSessionCommandKey({ key: idempotencyKey, revision: commandRevision, scope: commandScope });
      setActiveThread(detail);
      setTasks(detail.pendingWork);
      setMessages([]);
      setFallbackTurns([]);
      setQuery("");
      setQueryError("");
      clearError();
      setThreads((current) => current.some((thread) => thread.id === detail.id)
        ? current.map((thread) => thread.id === detail.id ? detail : thread)
        : [detail, ...current]);
      setThreadError("");
      setHistoryOpen(false);
    } catch (threadCreateError) {
      setThreadError(threadCreateError instanceof Error ? threadCreateError.message : "Ask Studio could not create a conversation. Your current conversation is unchanged.");
    } finally {
      threadActionFlightRef.current = false;
      setThreadBusy(false);
    }
    window.requestAnimationFrame(() => inputElement?.focus({ preventScroll: true }));
  }

  async function openConversation(threadId: string) {
    if (busy || threadActionFlightRef.current) return;
    threadActionFlightRef.current = true;
    setThreadBusy(true);
    setThreadError("");
    try {
      const detail = await readStudioAssistantThread(threadId);
      setActiveThread(detail);
      setTasks(detail.pendingWork);
      setMessages(detail.messages.map((stored) => stored.message));
      setFallbackTurns([]);
      setHistoryOpen(false);
    } catch (threadLoadError) {
      setThreadError(threadLoadError instanceof Error ? threadLoadError.message : "That conversation could not open.");
    } finally {
      threadActionFlightRef.current = false;
      setThreadBusy(false);
    }
  }

  async function loadEarlierMessages() {
    const oldestSequence = activeThread?.messagePage.oldestSequence;
    if (
      !activeThread
      || !activeThread.messagePage.hasOlderMessages
      || !oldestSequence
      || olderMessagesFlightRef.current
      || busy
    ) return;
    olderMessagesFlightRef.current = true;
    setOlderMessagesBusy(true);
    setThreadError("");
    const scroller = endRef.current?.closest("main");
    const previousHeight = scroller instanceof HTMLElement ? scroller.scrollHeight : 0;
    const previousTop = scroller instanceof HTMLElement ? scroller.scrollTop : 0;
    try {
      const page = await readStudioAssistantThread(activeThread.id, undefined, {
        beforeSequence: oldestSequence,
        limit: 60,
      });
      skipNextAutoScrollRef.current = true;
      setActiveThread((current) => current?.id === page.id
        ? { ...page, messages: [...page.messages, ...current.messages] }
        : current);
      setMessages((current) => [...page.messages.map((stored) => stored.message), ...current]);
      window.requestAnimationFrame(() => {
        if (scroller instanceof HTMLElement) {
          scroller.scrollTop = previousTop + Math.max(0, scroller.scrollHeight - previousHeight);
        }
      });
    } catch (historyError) {
      setThreadError(historyError instanceof Error ? historyError.message : "Earlier messages could not be loaded.");
    } finally {
      olderMessagesFlightRef.current = false;
      setOlderMessagesBusy(false);
    }
  }

  function reviewOperation(operation: StudioAssistantOperation, returnFocus: HTMLElement) {
    setThreadError("");
    setTasksOpen(false);
    setPublicMediaReviewed(false);
    setOperationReturnFocus(returnFocus.closest(".studio-ask-tasks-sheet") ? tasksButtonElement : returnFocus);
    setSelectedOperation(operationsById[operation.id] ?? operation);
  }

  async function cancelOperation(operation: StudioAssistantOperation) {
    const current = operationsById[operation.id] ?? operation;
    if (operationFlightRef.current || current.state !== "PREPARED") return;
    operationFlightRef.current = true;
    try {
      const updated = await updateStudioAssistantOperation(current.id, {
        action: "CANCEL",
        expectedVersion: current.version,
      });
      setOperationsById((existing) => ({ ...existing, [updated.id]: updated }));
      if (selectedOperation?.id === updated.id) setSelectedOperation(updated);
    } catch (operationError) {
      setThreadError(operationError instanceof Error ? operationError.message : "That prepared change could not be cancelled.");
    } finally {
      operationFlightRef.current = false;
    }
  }

  async function confirmOperation() {
    if (!selectedOperation) return { error: "Choose a prepared change.", ok: false as const };
    const current = operationsById[selectedOperation.id] ?? selectedOperation;
    if (operationFlightRef.current) return { error: "This change is already being handled.", ok: false as const };
    if (current.state === "SUCCEEDED") return { ok: true as const };
    if (current.state !== "PREPARED" && current.state !== "EXECUTING") {
      return { error: "This prepared change is no longer available to confirm.", ok: false as const };
    }
    operationFlightRef.current = true;
    try {
      if (current.state === "PREPARED" && current.kind === "PUBLISH_REVISION" && !publicMediaReviewed) {
        return { error: "Review and confirm the exact public media set before publishing.", ok: false as const };
      }
      const updated = current.state === "EXECUTING"
        ? await updateStudioAssistantOperation(current.id, {
            action: "RECONCILE",
            expectedVersion: current.version,
          })
        : await updateStudioAssistantOperation(current.id, confirmationForOperation(current));
      setOperationsById((existing) => ({ ...existing, [updated.id]: updated }));
      setSelectedOperation(updated);
      setThreadRefreshToken((value) => value + 1);
      if (updated.state === "SUCCEEDED") return { ok: true as const };
      if (updated.state === "FAILED") {
        return { error: updated.lastError?.message ?? "The owning Studio workflow rejected that change.", ok: false as const };
      }
      return {
        error: "Studio has not proved the final outcome yet. Keep this conversation and use Reconcile rather than confirming again.",
        ok: false as const,
      };
    } catch (operationError) {
      return {
        error: operationError instanceof Error ? operationError.message : "Studio could not prove whether that change finished.",
        ok: false as const,
      };
    } finally {
      operationFlightRef.current = false;
    }
  }

  async function mutateThread(
    target: StudioAssistantThreadSummary,
    action: StudioAssistantThreadMutation,
  ) {
    const lifecycle = action.action === "RENAME" || action.action === "ARCHIVE" || action.action === "RESTORE";
    if (lifecycle && threadActionFlightRef.current) {
      throw new Error("That conversation action is already being handled.");
    }
    if (lifecycle) {
      threadActionFlightRef.current = true;
      setThreadBusy(true);
    }
    try {
      const detail = lifecycle
        ? await (async () => {
            const commandScope = `ask-thread-${action.action.toLowerCase()}:${target.id}`;
            const commandRevision = JSON.stringify({ action, version: target.version });
            const idempotencyKey = getOrCreateSessionCommandKey({
              keyPrefix: `ask.thread.${action.action.toLowerCase()}`,
              revision: commandRevision,
              scope: commandScope,
            });
            const updated = await updateStudioAssistantThread(target.id, {
              ...action,
              expectedVersion: target.version,
              idempotencyKey,
            });
            clearSessionCommandKey({ key: idempotencyKey, revision: commandRevision, scope: commandScope });
            return updated;
          })()
        : await (async () => {
            const fresh = await readStudioAssistantThread(target.id);
            return updateStudioAssistantThread(target.id, { ...action, expectedVersion: fresh.version });
          })();
      setThreads((current) => current.map((thread) => thread.id === detail.id ? detail : thread));
      if (activeThread?.id === detail.id) {
        setActiveThread(detail);
        setTasks(detail.pendingWork);
      }
      return detail;
    } finally {
      if (lifecycle) {
        threadActionFlightRef.current = false;
        setThreadBusy(false);
      }
    }
  }

  function prepareTaskSave(task: StudioAssistantTaskDraft, returnFocus: HTMLElement) {
    if (!isStudioAssistantTaskDraft(task)) {
      setTaskStorageError("That task draft is incomplete. Ask Studio to prepare it again.");
      setTasksOpen(true);
      return;
    }
    setTaskStorageError("");
    setTaskReturnFocus(returnFocus);
    setSelectedTask(task);
  }

  async function confirmTaskSave() {
    if (!selectedTask) return { error: "Choose a task to save.", ok: false as const };
    if (!studio.scenario && activeThread) {
      try {
        const task: StudioAssistantThreadTask = {
          action: { href: selectedTask.action.href, label: selectedTask.action.label },
          consequence: selectedTask.consequence,
          createdAt: new Date().toISOString(),
          id: selectedTask.id,
          objective: selectedTask.objective,
          risk: selectedTask.risk,
          status: "OPEN",
          steps: selectedTask.steps,
          title: selectedTask.title,
        };
        const detail = await mutateThread(activeThread, { action: "SAVE_TASK", task });
        setTasks(detail.pendingWork);
        setTaskStorageError("");
        return { ok: true as const };
      } catch (taskError) {
        return { error: taskError instanceof Error ? taskError.message : "That task could not be saved.", ok: false as const };
      }
    }
    const existing = tasks.find((task) => task.id === selectedTask.id);
    const next = existing ? tasks : [...tasks, storedTaskFromDraft(selectedTask)].slice(-24);
    if (!persistTasks(tasksStorageKey, next as StoredStudioAssistantTask[])) {
      return { error: "This browser did not allow scenario storage. The Studio workflow was not changed.", ok: false as const };
    }
    setTaskStorageError("");
    setTasks(next);
    return { ok: true as const };
  }

  function setTaskStatus(taskId: string, taskStatus: StoredStudioAssistantTask["status"]) {
    if (!studio.scenario && activeThread) {
      void mutateThread(activeThread, { action: "SET_TASK_STATUS", status: taskStatus, taskId })
        .then((detail) => setTasks(detail.pendingWork))
        .catch((taskError) => setTaskStorageError(taskError instanceof Error ? taskError.message : "That task could not update."));
      return;
    }
    const next = tasks.map((task) => task.id === taskId ? { ...task, status: taskStatus } : task);
    if (persistTasks(tasksStorageKey, next as StoredStudioAssistantTask[])) {
      setTaskStorageError("");
      setTasks(next);
      return;
    }
    setTaskStorageError("This browser could not update the saved task. No Studio record changed.");
  }

  function deleteTask(taskId: string) {
    if (!studio.scenario && activeThread) {
      void mutateThread(activeThread, { action: "DELETE_TASK", taskId })
        .then((detail) => setTasks(detail.pendingWork))
        .catch((taskError) => setTaskStorageError(taskError instanceof Error ? taskError.message : "That task could not be removed."));
      return;
    }
    const next = tasks.filter((task) => task.id !== taskId);
    if (persistTasks(tasksStorageKey, next as StoredStudioAssistantTask[])) {
      setTaskStorageError("");
      setTasks(next);
      return;
    }
    setTaskStorageError("This browser could not remove the saved task. No Studio record changed.");
  }

  async function confirmRenameThread() {
    if (!renameTarget || !renameTitle.trim()) {
      return { error: "Enter a conversation name.", ok: false as const };
    }
    try {
      await mutateThread(renameTarget, { action: "RENAME", title: renameTitle.trim() });
      setRenameTarget(null);
      setRenameTitle("");
      return { ok: true as const };
    } catch (renameError) {
      return { error: renameError instanceof Error ? renameError.message : "That conversation could not be renamed.", ok: false as const };
    }
  }

  async function confirmArchiveThread() {
    if (!archiveTarget) return { error: "Choose a conversation.", ok: false as const };
    try {
      const detail = await mutateThread(archiveTarget, { action: "ARCHIVE" });
      setArchiveTarget(null);
      if (activeThread?.id === detail.id) await resetConversation(true);
      return { ok: true as const };
    } catch (archiveError) {
      return { error: archiveError instanceof Error ? archiveError.message : "That conversation could not be archived.", ok: false as const };
    }
  }

  function restoreConversation(target: StudioAssistantThreadSummary) {
    void mutateThread(target, { action: "RESTORE" })
      .then((detail) => {
        setActiveThread(detail);
        setTasks(detail.pendingWork);
        setMessages(detail.messages.map((stored) => stored.message));
        setFallbackTurns([]);
        setHistoryOpen(false);
        setThreadError("");
      })
      .catch((restoreError) => setThreadError(restoreError instanceof Error ? restoreError.message : "That conversation could not be restored."));
  }

  if (!studio.scenario && (studio.application.status === "idle" || studio.application.status === "loading")) {
    return <StudioLoadingStage label="Opening Ask Studio…" />;
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
      <div className="studio-ask-thread">
        <span aria-live="polite" className="sr-only" role="status">
          {busy
            ? "Ask Studio is reading current Studio truth."
            : threadBusy
              ? "Shared conversation is updating."
              : replyAnnouncement}
        </span>
        <div className="studio-ask-session-tools">
          <button disabled={threadBusy} onClick={() => void resetConversation()} type="button"><Plus aria-hidden="true" size={15} />New</button>
          {!studio.scenario ? (
            <button disabled={threadBusy} onClick={() => setHistoryOpen(true)} ref={setHistoryButtonElement} type="button">
              <Clock3 aria-hidden="true" size={15} />History{threads.length ? <span>{threads.length}</span> : null}
            </button>
          ) : null}
          <button onClick={() => setTasksOpen(true)} ref={setTasksButtonElement} type="button">
            <ListTodo aria-hidden="true" size={15} />Tasks{openTaskCount ? <span>{openTaskCount}</span> : null}
          </button>
          {busy ? (
            <button onClick={() => void stop()} type="button"><Square aria-hidden="true" size={13} />Stop</button>
          ) : null}
        </div>

        {!studio.scenario && activeThread ? (
          <header className="studio-ask-thread-heading">
            <span>{activeThread.title}</span>
            {activeThread.focus?.reference ? <small>Focused on {activeThread.focus.reference}</small> : <small>Shared Studio worklane</small>}
          </header>
        ) : null}

        {threadError ? (
          <div className="studio-ask-error" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <span><strong>Conversation update paused.</strong><small>{threadError}</small></span>
            <button onClick={() => setThreadError("")} type="button">Dismiss</button>
          </div>
        ) : null}

        {threadBusy && !activeThread ? <div className="studio-ask-resolving" role="status"><LoaderCircle aria-hidden="true" size={17} />Opening shared history</div> : null}

        {hasConversation ? entryPieceAction : null}

        {!hasConversation ? (
          <div className="studio-ask-welcome">
            <Sparkles aria-hidden="true" size={24} />
            <h1>What needs doing?</h1>
            <p>Ask naturally. Studio will answer, surface the right next action, and prepare safe task options.</p>
            {context.continueAction ? (
              <Link className="studio-ask-welcome-primary" href={context.continueAction.href}>
                <span>Continue current work</span>
                <strong>{context.continueAction.label}</strong>
                <ArrowRight aria-hidden="true" size={17} />
              </Link>
            ) : null}
            {entryPieceAction}
            <div>{starters.map((starter) => <button disabled={busy} key={starter} onClick={() => submit(starter)} type="button">{starter}</button>)}</div>
          </div>
        ) : (
          <>
            {activeThread?.messagePage.hasOlderMessages ? (
              <div className="studio-ask-older-messages">
                <button disabled={olderMessagesBusy || busy} onClick={() => void loadEarlierMessages()} type="button">
                  {olderMessagesBusy ? <LoaderCircle aria-hidden="true" size={15} /> : <Clock3 aria-hidden="true" size={15} />}
                  {olderMessagesBusy ? "Loading earlier messages…" : "Load earlier messages"}
                </button>
              </div>
            ) : activeThread?.historySummary ? (
              <p className="studio-ask-history-boundary">Earlier worklane context is preserved in this conversation.</p>
            ) : null}
            {messages.map((message, messageIndex) => {
              const stored = storedMessageById.get(message.id);
              const preservedQuestion = message.role === "assistant"
                ? messages.slice(0, messageIndex).findLast((candidate) => candidate.role === "user")
                : null;
              const preservedQuestionText = preservedQuestion ? messageText(preservedQuestion) : "";
              return (
              <Fragment key={message.id}>
              <Message className="studio-ask-message" from={message.role}>
                <MessageContent className="studio-ask-message-content">
                  {message.parts.map((part, partIndex) => {
                    if (part.type === "text") {
                      if (!part.text.trim()) return null;
                      return message.role === "user" ? (
                        <p className="studio-ask-operator" key={`${message.id}:text:${partIndex}`}>{part.text}</p>
                      ) : (
                        <MessageResponse
                          className="studio-ask-model-response"
                          isAnimating={part.state === "streaming"}
                          key={`${message.id}:text:${partIndex}`}
                        >
                          {part.text}
                        </MessageResponse>
                      );
                    }
                    const toolPart = assistantToolPart(part);
                    if (!toolPart) return null;
                    if (toolPart.state === "input-streaming" || toolPart.state === "input-available") {
                      return <StudioAssistantToolPending key={`${message.id}:tool:${partIndex}`} />;
                    }
                    if (toolPart.state === "output-available") {
                      const parsed = studioAssistantToolOutputSchema.safeParse(toolPart.output);
                      if (!parsed.success) {
                        return (
                          <div className="studio-ask-error" key={`${message.id}:tool:${partIndex}`} role="alert">
                            <CircleAlert aria-hidden="true" size={18} />
                            <span><strong>Studio returned an incomplete result.</strong><small>No Studio change was applied.</small></span>
                          </div>
                        );
                      }
                      const operation = parsed.data.operation
                        ? operationsById[parsed.data.operation.id] ?? parsed.data.operation
                        : null;
                      return (
                        <StudioAssistantToolResult
                          busy={busy || operationFlightRef.current}
                          key={`${message.id}:tool:${partIndex}`}
                          onCancel={(candidate) => void cancelOperation(candidate)}
                          onPrompt={submit}
                          onReview={reviewOperation}
                          operation={operation}
                          output={parsed.data}
                        />
                      );
                    }
                    if (toolPart.state === "output-error" || toolPart.state === "output-denied") {
                      return (
                        <div className="studio-ask-error" key={`${message.id}:tool:${partIndex}`} role="alert">
                          <CircleAlert aria-hidden="true" size={18} />
                          <span><strong>Studio truth could not be read.</strong><small>No Studio change was applied.</small></span>
                        </div>
                      );
                    }
                    return null;
                  })}
                  {stored && stored.status !== "COMPLETE" && message.parts.length === 0 ? (
                    <div className="studio-ask-error" role="status">
                      <CircleAlert aria-hidden="true" size={18} />
                      <span>
                        <strong>{stored.status === "PENDING" ? "Reply interrupted" : "Reply paused"}</strong>
                        <small>
                          {replyNotices[message.id] || (stored.status === "PENDING"
                            ? "Your question is preserved. Check the original reply before deciding whether to ask again."
                            : "No complete reply was saved. Review the preserved question before using it again.")}
                        </small>
                      </span>
                      {stored.status === "PENDING" ? (
                        <button
                          disabled={replyCheckingId === message.id}
                          onClick={() => void reconcileReply(message.id)}
                          type="button"
                        >{replyCheckingId === message.id ? "Checking…" : "Check reply"}</button>
                      ) : preservedQuestionText ? (
                        <button onClick={() => reuseQuestion(preservedQuestionText)} type="button">Use question again</button>
                      ) : null}
                    </div>
                  ) : null}
                  {stored ? (
                    <small className="studio-ask-message-meta">
                      {message.role === "assistant" ? "Ask Studio" : stored.author.displayName}
                      {formatMessageTime(stored.createdAt) ? ` · ${formatMessageTime(stored.createdAt)}` : ""}
                      {stored.status === "PENDING" ? " · Interrupted, ready to reconcile" : ""}
                      {stored.status === "ERROR" || stored.status === "ABORTED" ? " · Reply paused" : ""}
                    </small>
                  ) : null}
                </MessageContent>
              </Message>
              {message.role === "user" ? fallbackTurns
                .filter((turn) => turn.id === message.id)
                .map((turn) => (
                  <AssistantFallbackMessage
                    busy={busy}
                    key={`fallback:${turn.id}`}
                    onPrompt={submit}
                    onSaveTask={prepareTaskSave}
                    savedTaskIds={savedTaskIds}
                    scenario={Boolean(studio.scenario)}
                    turn={turn}
                  />
                )) : null}
              </Fragment>
              );
            })}
            {fallbackTurns.filter((turn) => !messages.some((message) => message.id === turn.id)).map((turn) => (
              <Fragment key={`unmatched-fallback:${turn.id}`}>
                <Message className="studio-ask-message" from="user">
                  <MessageContent className="studio-ask-message-content">
                    <p className="studio-ask-operator">{turn.query}</p>
                  </MessageContent>
                </Message>
                <AssistantFallbackMessage
                  busy={busy}
                  onPrompt={submit}
                  onSaveTask={prepareTaskSave}
                  savedTaskIds={savedTaskIds}
                  scenario={Boolean(studio.scenario)}
                  turn={turn}
                />
              </Fragment>
            ))}

            {error ? (
              <div className="studio-ask-error" role="alert">
                <CircleAlert aria-hidden="true" size={18} />
                <span><strong>The conversational reply paused.</strong><small>Trusted Studio actions above remain safe; no change was applied.</small></span>
              </div>
            ) : null}
          </>
        )}
        <div className="studio-ask-end" ref={endRef} />
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
              aria-describedby={queryError ? "studio-ask-query-error" : undefined}
              aria-invalid={queryError ? true : undefined}
              disabled={busy || (!studio.scenario && (!activeThread || threadBusy))}
              maxLength={MAX_QUERY_LENGTH}
              onChange={(event) => {
                setQuery(event.target.value);
                if (queryError) setQueryError("");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
                event.preventDefault();
                submit(query);
              }}
              placeholder="Ask about Studio or find a record"
              ref={setInputElement}
              rows={1}
              value={query}
            />
          </label>
          <button
            aria-label="Send to Ask Studio"
            className="studio-ai-send"
            data-busy={busy || undefined}
            disabled={!query.trim() || busy || (!studio.scenario && (!activeThread || threadBusy))}
            type="submit"
          >
            {busy ? <LoaderCircle aria-hidden="true" size={18} /> : <ArrowRight aria-hidden="true" size={18} />}
          </button>
        </form>
        {queryError ? <p className="studio-ask-query-error" id="studio-ask-query-error" role="alert">{queryError}</p> : null}
        {askCapability === "READ_ONLY_COMPATIBILITY"
          ? <p>Service guidance only while connected records are unavailable.</p>
          : null}
      </div>

      <StudioDecisionSheet
        busyLabel={selectedOperation?.state === "EXECUTING" ? "Reconciling this change" : "Applying this change"}
        confirmDisabled={selectedOperation?.state === "PREPARED" && selectedOperation.kind === "PUBLISH_REVISION" && !publicMediaReviewed}
        confirmLabel={selectedOperation?.state === "EXECUTING" ? "Reconcile" : selectedOperation?.preview.confirmationLabel ?? "Confirm change"}
        consequence={selectedOperation?.preview.consequence ?? "Studio will use the owning workflow and return a durable receipt."}
        destructive={selectedOperation?.preview.destructive}
        eyebrow={selectedOperation ? `${selectedOperation.target.reference} · ${selectedOperation.preview.risk}` : "Review"}
        fallbackFocus={inputElement}
        onConfirm={confirmOperation}
        onDismiss={() => {
          setSelectedOperation(null);
          setPublicMediaReviewed(false);
        }}
        open={Boolean(selectedOperation)}
        receiptDetail={selectedOperation?.receipt?.detail ?? "The owning Studio workflow finished and reconciled current truth."}
        receiptTitle={selectedOperation?.receipt?.title ?? "Studio change complete"}
        returnFocus={operationReturnFocus}
        summary={selectedOperation?.preview.summary ?? "Review the exact change before confirmation."}
        title={selectedOperation?.kind === "PERMANENT_DELETE" ? "Permanently delete" : "Review change"}
      >
        {selectedOperation?.kind === "PUBLISH_REVISION" && selectedOperation.preview.media?.length ? (
          <section className="studio-ask-public-media-review">
            <header><strong>Approved public photos</strong><small>{selectedOperation.preview.media.length} exact view{selectedOperation.preview.media.length === 1 ? "" : "s"}</small></header>
            <div>
              {selectedOperation.preview.media.map((media) => (
                <figure key={media.id}>
                  <img alt={media.label} src={media.src} />
                  <figcaption>{media.label}</figcaption>
                </figure>
              ))}
            </div>
            <label>
              <input
                checked={publicMediaReviewed}
                onChange={(event) => setPublicMediaReviewed(event.currentTarget.checked)}
                type="checkbox"
              />
              <span>I checked these exact public photos.</span>
            </label>
          </section>
        ) : null}
        {selectedOperation?.preview.changes.length ? (
          <dl className="studio-decision-diff">
            {selectedOperation.preview.changes.map((change) => (
              <div key={`${change.field}:${change.after}`}>
                <dt>{change.label}</dt><dd>{change.before}</dd><span aria-hidden="true">→</span><dd>{change.after}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </StudioDecisionSheet>

      <StudioDecisionSheet
        busyLabel={studio.scenario ? "Saving scenario task" : "Saving shared task"}
        confirmLabel="Save task"
        consequence={studio.scenario
          ? "This saves a private scenario task on this device. It does not run the workflow or change any Studio record."
          : "This saves the proposed task in this shared conversation. It does not run the workflow or change a garment."}
        fallbackFocus={inputElement}
        onConfirm={confirmTaskSave}
        onDismiss={() => setSelectedTask(null)}
        open={Boolean(selectedTask)}
        receiptDetail={studio.scenario
          ? "The scenario task is available on this device for 30 days."
          : "The task is available to both Studio admins in this conversation. No garment, Shop, Order, stock, media, or approval state changed."}
        receiptTitle={studio.scenario ? "Scenario task saved" : "Shared task saved"}
        returnFocus={taskReturnFocus}
        summary={selectedTask ? `${selectedTask.title}: ${selectedTask.objective}` : "Review this task before saving it."}
        title={selectedTask?.title ?? "Save task"}
      >
        {selectedTask ? (
          <Task defaultOpen>
            <TaskTrigger title="Task steps" />
            <TaskContent>
              {selectedTask.steps.map((step) => <TaskItem key={step.id}>{step.label}</TaskItem>)}
            </TaskContent>
          </Task>
        ) : null}
      </StudioDecisionSheet>

      {!studio.scenario ? (
        <StudioTaskSheet
          busy={threadBusy}
          busyLabel="Opening conversation"
          className="studio-ask-history-sheet"
          eyebrow="JUW Studio · shared"
          fallbackFocus={inputElement}
          footer={() => (
            <button className="button button-primary" disabled={threadBusy} onClick={() => void resetConversation()} type="button">
              <Plus aria-hidden="true" size={16} />New conversation
            </button>
          )}
          onDismiss={() => setHistoryOpen(false)}
          open={historyOpen}
          returnFocus={historyButtonElement}
          title="Conversation history"
        >
          <div className="studio-ask-history-list">
            {threads.length ? threads.map((thread) => (
              <article className={thread.id === activeThread?.id ? "is-current" : ""} key={thread.id}>
                <button
                  aria-current={thread.id === activeThread?.id ? "page" : undefined}
                  className="studio-ask-history-main"
                  disabled={threadBusy}
                  onClick={() => void openConversation(thread.id)}
                  type="button"
                >
                  <span>
                    <strong>{thread.title}</strong>
                    <small>{thread.focus?.reference ? `${thread.focus.reference} · ` : ""}{thread.state === "ARCHIVED" ? "Archived" : `Updated by ${thread.updatedBy.displayName}`}</small>
                  </span>
                  <ArrowRight aria-hidden="true" size={17} />
                </button>
                <div className="studio-ask-history-actions">
                  {thread.state === "ARCHIVED" ? (
                    <button disabled={threadBusy} onClick={() => restoreConversation(thread)} type="button"><RotateCcw aria-hidden="true" size={15} />Restore</button>
                  ) : (
                    <>
                      <button
                        aria-label={`Rename ${thread.title}`}
                        disabled={threadBusy}
                        onClick={(event) => {
                          setThreadActionReturnFocus(event.currentTarget);
                          setRenameTarget(thread);
                          setRenameTitle(thread.title);
                        }}
                        type="button"
                      ><Pencil aria-hidden="true" size={15} />Rename</button>
                      <button
                        aria-label={`Archive ${thread.title}`}
                        disabled={threadBusy}
                        onClick={(event) => {
                          setThreadActionReturnFocus(event.currentTarget);
                          setArchiveTarget(thread);
                        }}
                        type="button"
                      ><Archive aria-hidden="true" size={15} />Archive</button>
                    </>
                  )}
                </div>
              </article>
            )) : (
              <div className="studio-quiet-empty"><Clock3 aria-hidden="true" size={21} /><div><strong>No conversations yet</strong><p>Start a worklane and it will appear here for both Studio admins.</p></div></div>
            )}
          </div>
        </StudioTaskSheet>
      ) : null}

      <StudioDecisionSheet
        busyLabel="Renaming conversation"
        confirmLabel="Save name"
        consequence="The new name will appear in shared History for both Studio admins. Messages and garment focus stay unchanged."
        fallbackFocus={historyButtonElement}
        onConfirm={confirmRenameThread}
        onDismiss={() => { setRenameTarget(null); setRenameTitle(""); }}
        open={Boolean(renameTarget)}
        receiptDetail="The shared conversation name is updated."
        receiptTitle="Conversation renamed"
        returnFocus={threadActionReturnFocus}
        summary="Use a short name that makes this worklane easy to resume."
        title="Rename conversation"
      >
        <label className="studio-field">
          <span>Conversation name</span>
          <input maxLength={120} onChange={(event) => setRenameTitle(event.target.value)} value={renameTitle} />
        </label>
      </StudioDecisionSheet>

      <StudioDecisionSheet
        busyLabel="Archiving conversation"
        confirmLabel="Archive"
        consequence="The conversation leaves active History but remains available to restore. No garment or task is deleted."
        destructive
        fallbackFocus={historyButtonElement}
        onConfirm={confirmArchiveThread}
        onDismiss={() => setArchiveTarget(null)}
        open={Boolean(archiveTarget)}
        receiptDetail="The conversation is archived and can be restored from History."
        receiptTitle="Conversation archived"
        returnFocus={threadActionReturnFocus}
        summary={archiveTarget ? `Archive “${archiveTarget.title}”?` : "Archive this conversation?"}
        title="Archive conversation"
      />

      <StudioTaskSheet
        className="studio-ask-tasks-sheet"
        eyebrow={studio.scenario ? "Scenario · this device" : "Current conversation · shared"}
        fallbackFocus={inputElement}
        onDismiss={() => setTasksOpen(false)}
        open={tasksOpen}
        returnFocus={tasksButtonElement}
        title={studio.scenario ? "Scenario tasks" : "Conversation tasks"}
      >
        {taskStorageError ? (
          <div className="studio-ask-error" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <span><strong>Saved task update paused.</strong><small>{taskStorageError}</small></span>
            <button onClick={() => setTaskStorageError("")} type="button">Dismiss</button>
          </div>
        ) : null}
        {tasks.length || pendingOperations.length ? (
          <div className="studio-ask-task-list">
            {pendingOperations.map((operation) => (
              <article className="studio-ask-operation-task" key={operation.id}>
                <header>
                  <strong>{operation.preview.confirmationLabel}</strong>
                  <small>{operation.state === "EXECUTING" ? "Reconcile" : operation.preview.risk}</small>
                </header>
                <p>{operation.preview.summary}</p>
                <div>
                  <button
                    className="button button-primary"
                    onClick={(event) => reviewOperation(operation, event.currentTarget)}
                    type="button"
                  >
                    {operation.state === "EXECUTING" ? "Reconcile" : "Review"}<ArrowRight aria-hidden="true" size={15} />
                  </button>
                </div>
              </article>
            ))}
            {tasks.map((task) => (
              <article className={task.status === "DONE" ? "is-done" : ""} key={task.id}>
                <header><strong>{task.title}</strong><small>{task.status === "DONE" ? "Done" : riskLabel(task.risk)}</small></header>
                <p>{task.objective}</p>
                <div>
                  <Link className="button button-primary" href={task.action.href}>Continue<ArrowRight aria-hidden="true" size={15} /></Link>
                  <button
                    className="button button-secondary"
                    onClick={() => setTaskStatus(task.id, task.status === "DONE" ? "OPEN" : "DONE")}
                    type="button"
                  >
                    {task.status === "DONE" ? "Reopen" : "Mark done"}
                  </button>
                  <button
                    aria-label={`Delete ${task.title}`}
                    className="studio-ask-task-remove"
                    onClick={() => deleteTask(task.id)}
                    type="button"
                  >
                    <Trash2 aria-hidden="true" size={15} />Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="studio-quiet-empty"><ListTodo aria-hidden="true" size={21} /><div><strong>No saved tasks</strong><p>Ask Studio for a workflow, then save its suggested task here.</p></div></div>
        )}
      </StudioTaskSheet>
    </section>
  );
}
