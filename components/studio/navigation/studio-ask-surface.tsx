"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  CircleAlert,
  ListTodo,
  LoaderCircle,
  RotateCcw,
  Save,
  Sparkles,
  Square,
  Trash2,
} from "lucide-react";
import { Message, MessageContent, MessageResponse } from "../../ai-elements/message";
import { Suggestion, Suggestions } from "../../ai-elements/suggestion";
import { Task, TaskContent, TaskItem, TaskTrigger } from "../../ai-elements/task";
import type { StudioAssistantUIMessage } from "../../../lib/ai/studio-assistant-agent";
import { studioOrderHasDueWork } from "../../../lib/shop/order-presentation";
import {
  normalizeStudioAssistantText,
  resolveStudioAssistantWorkflow,
  type StudioAssistantBlock,
  type StudioAssistantContext,
  type StudioAssistantDocument,
  type StudioAssistantResponse,
  type StudioAssistantTaskDraft,
  type StudioAssistantWorkflowResponse,
} from "../../../lib/studio/assistant/experience";
import type { StudioSearchDocument } from "../../../lib/studio/application/contracts";
import { STUDIO_SERVICES } from "../../../lib/studio/service-registry";
import { StudioDecisionSheet } from "../atoms/studio-decision-sheet";
import { StudioLoadingStage } from "../atoms/studio-loading-stage";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

type RestoredTurn = {
  id: string;
  query: string;
  workflow?: StudioAssistantWorkflowResponse;
  state: "complete" | "error";
};

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

const MAX_QUERY_LENGTH = 1_200;
const TASK_RETENTION_MS = 30 * 24 * 60 * 60 * 1_000;
const STORAGE_KEY = "juw.studio.ask.v2";
const TASKS_STORAGE_KEY = "juw.studio.ask.tasks.v2";
const STARTERS = [
  "What needs attention?",
  "Create a new drop",
  "Change JUW-001 price",
  "Prepare media for JUW-003",
] as const;

function assistantTokens(values: Array<string | null | undefined>) {
  return normalizeStudioAssistantText(values.filter(Boolean).join(" "));
}

function storedQuery(value: unknown) {
  if (typeof value === "string") return value.trim().slice(0, MAX_QUERY_LENGTH);
  if (!value || typeof value !== "object") return "";
  const candidate = value as { query?: unknown };
  return typeof candidate.query === "string" ? candidate.query.trim().slice(0, MAX_QUERY_LENGTH) : "";
}

function restoreQueries(storageKey: string) {
  try {
    const stored = window.sessionStorage.getItem(storageKey);
    if (!stored) return [];
    const value = JSON.parse(stored) as unknown;
    return Array.isArray(value) ? value.map(storedQuery).filter(Boolean).slice(-12) : [];
  } catch {
    return [];
  }
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
    && candidate.storage === "DEVICE_PRIVATE"
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
  return {
    detail: document.secondaryLabel,
    entityId,
    href: document.route,
    id: document.id,
    identifiers: [document.id, entityId, ...document.aliases],
    kind,
    label: document.primaryLabel,
    mediaTargetId: piece?.wardrobeItemId ?? undefined,
    state: document.lifecycleState,
    tokens: assistantTokens([
      document.id,
      document.primaryLabel,
      document.secondaryLabel,
      document.lifecycleState,
      ...document.aliases,
    ]),
  };
}

function buildContext(studio: ReturnType<typeof useStudio>): StudioAssistantContext {
  const connected = studio.authority.snapshot;
  const projected = studio.scenario ? null : studio.application.snapshot;
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
  const knownPieceKeys = new Set<string>();
  for (const garment of studio.garments) {
    knownPieceKeys.add(garment.sku.toLocaleLowerCase("en-NG"));
    knownPieceKeys.add(garment.id.toLocaleLowerCase("en-NG"));
    if (garment.privateWardrobeItemId) knownPieceKeys.add(garment.privateWardrobeItemId.toLocaleLowerCase("en-NG"));
    documents.push({
      detail: pieceDetail({ availability: garment.availability, category: garment.category, colour: garment.color }),
      entityId: garment.id,
      href: `/studio/wardrobe/${encodeURIComponent(garment.id)}`,
      id: `piece:${garment.id}`,
      identifiers: [garment.id, garment.sku, garment.privateWardrobeItemId ?? ""],
      kind: "Piece",
      label: garment.title,
      mediaTargetId: garment.privateWardrobeItemId ?? (studio.scenario ? garment.id : undefined),
      state: garment.state,
      tokens: assistantTokens([
        garment.id,
        garment.sku,
        garment.title,
        garment.category,
        garment.color,
        garment.condition,
        garment.state,
        garment.availability,
        garment.dynamicPublication?.drop,
      ]),
    });
  }

  for (const piece of connected?.pieces ?? []) {
    const keys = [piece.sku, piece.wardrobeItemId, piece.pieceKey].filter(Boolean) as string[];
    if (keys.some((key) => knownPieceKeys.has(key.toLocaleLowerCase("en-NG")))) continue;
    const entityId = piece.wardrobeItemId ?? piece.pieceKey;
    documents.push({
      detail: pieceDetail({ availability: piece.availability, category: piece.category, colour: piece.colour }),
      entityId,
      href: piece.wardrobeItemId
        ? `/studio/wardrobe/${encodeURIComponent(piece.wardrobeItemId)}`
        : "/studio/operations?view=inventory",
      id: `piece:${entityId}`,
      identifiers: keys,
      kind: "Piece",
      label: piece.title,
      mediaTargetId: piece.wardrobeItemId ?? undefined,
      state: piece.availability,
      tokens: assistantTokens([
        ...keys,
        piece.title,
        piece.category,
        piece.colour,
        piece.condition,
        piece.sizeLabel,
        piece.availability,
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

  for (const model of connected?.models ?? []) {
    documents.push({
      detail: `${model.kind.replaceAll("_", " ")} · ${model.state.toLocaleLowerCase("en-NG")}`,
      entityId: model.id,
      href: "/studio/models?view=authority",
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

  const projectedAttention = connected
    ? Math.max(
        connected.notifications.length,
        connected.pieces.filter((piece) => piece.availability === "PRIVATE" || piece.hasLocationMismatch).length
          + connected.orders.filter(studioOrderHasDueWork).length,
      )
    : studio.scenario
      ? studio.garments.filter((garment) => garment.state === "DRAFT" || garment.state === "ERROR").length
      : null;
  const localLive = studio.garments.filter((garment) => garment.dynamicPublication?.state === "PUBLISHED").length
    || studio.listings.filter((listing) => listing.state === "PUBLISHED").length;

  return {
    continueAction: studio.application.snapshot?.continueAction
      ? {
          href: studio.application.snapshot.continueAction.href,
          label: studio.application.snapshot.continueAction.label,
        }
      : null,
    documents,
    provenance: projected
      ? {
          detail: projected.degradedSources.length
            ? `${projected.degradedSources.length} source${projected.degradedSources.length === 1 ? "" : "s"} limited`
            : "Connected Studio application snapshot",
          generatedAt: projected.generatedAt,
          label: projected.degradedSources.length ? "Studio snapshot" : "Live Studio",
          status: projected.degradedSources.length ? "degraded" : "connected",
        }
      : studio.scenario
      ? {
          detail: "Lifecycle simulator · in-memory state",
          generatedAt: connected?.generatedAt ?? null,
          label: "Scenario preview",
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
        : connected?.pieces.filter((piece) => piece.availability === "AVAILABLE").length
          ?? (studio.scenario ? studio.garments.filter((garment) => garment.availability === "AVAILABLE").length : null),
      drafts: projected
        ? null
        : connected?.pieces.filter((piece) => piece.availability === "PRIVATE").length
          ?? (studio.scenario ? studio.garments.filter((garment) => garment.state === "DRAFT").length : null),
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

function AssistantBlock({ block }: { block: StudioAssistantBlock }) {
  if (block.kind === "answer") {
    return <div className="studio-ask-answer"><strong>{block.title}</strong><p>{block.body}</p></div>;
  }
  if (block.kind === "metrics") {
    return (
      <div aria-label="Studio summary" className="studio-ask-metrics">
        {block.items.map((item) => <Link href={item.href} key={item.label}><strong>{item.value}</strong><small>{item.label}</small></Link>)}
      </div>
    );
  }
  if (block.kind === "results") {
    return (
      <div className="studio-ask-results">
        <small>{block.title}</small>
        <div>{block.items.map((item) => (
          <Link href={item.href} key={item.id}>
            <span><strong>{item.label}</strong><small>{item.kind} · {item.detail}</small></span>
            {item.state ? <em>{item.state.replaceAll("_", " ")}</em> : null}
            <ArrowRight aria-hidden="true" size={17} />
          </Link>
        ))}</div>
      </div>
    );
  }
  if (block.kind === "clarification") {
    return (
      <div className="studio-ask-clarification">
        <strong>{block.title}</strong><p>{block.body}</p>
        <div>{block.options.map((option) => <Link href={option.href} key={`${option.href}:${option.label}`}>{option.label}<ArrowRight aria-hidden="true" size={15} /></Link>)}</div>
      </div>
    );
  }
  if (block.kind === "handoff") {
    return (
      <div className="studio-ask-handoff">
        <small>{riskLabel(block.risk)}</small>
        <strong>{block.title}</strong>
        <p>{block.body}</p>
        <span>{block.consequence}</span>
        <Link className="button button-primary" href={block.action.href}>{block.action.label}<ArrowRight aria-hidden="true" size={15} /></Link>
      </div>
    );
  }
  return (
    <div className="studio-ask-recovery">
      <CircleAlert aria-hidden="true" size={19} />
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
        <AssistantBlock block={block} key={`${block.kind}:${index}`} />
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
                  <Check aria-hidden="true" size={14} />{step.label}
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
          {workflow.suggestions.map((suggestion) => (
            <Suggestion
              className="studio-ask-suggestion"
              disabled={busy}
              key={suggestion.id}
              onClick={onPrompt}
              suggestion={suggestion.prompt}
            >
              {suggestion.label}
            </Suggestion>
          ))}
        </Suggestions>
      ) : null}

      <small
        className={`studio-ask-provenance is-${workflow.response.provenance.status}`}
        title={workflow.response.provenance.generatedAt ?? undefined}
      >
        {workflow.response.provenance.label} · {workflow.response.provenance.detail}
        {provenanceTime(workflow.response.provenance.generatedAt)
          ? ` · ${provenanceTime(workflow.response.provenance.generatedAt)}`
          : ""}
      </small>
    </div>
  );
}

function AssistantFallbackMessage({
  busy,
  onPrompt,
  onSaveTask,
  savedTaskIds,
  turn,
}: {
  busy: boolean;
  onPrompt(prompt: string): void;
  onSaveTask(task: StudioAssistantTaskDraft, returnFocus: HTMLElement): void;
  savedTaskIds: Set<string>;
  turn: FallbackTurn;
}) {
  return (
    <Message className="studio-ask-message" from="assistant">
      <MessageContent className="studio-ask-message-content">
        <small className="studio-ask-fallback-label">Safe local guidance · agent connection unavailable</small>
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
  const studio = useStudio();
  const askCapability = studio.scenario
    ? "AVAILABLE"
    : studio.application.snapshot?.capabilities.find((capability) => capability.id === "ASK_READ")?.state ?? "UNAVAILABLE";
  const context = useMemo(() => buildContext(studio), [studio]);
  const operator = studio.application.snapshot?.operator;
  const storageScope = encodeURIComponent((studio.scenario
    ? `scenario:${studio.scenario}:${operator?.storageScope ?? "unavailable"}`
    : `connected:${operator?.storageScope ?? "unavailable"}`
  ));
  const sessionStorageKey = `${STORAGE_KEY}:${storageScope}`;
  const tasksStorageKey = `${TASKS_STORAGE_KEY}:${storageScope}`;
  const [query, setQuery] = useState("");
  const [queryError, setQueryError] = useState("");
  const [restoredTurns, setRestoredTurns] = useState<RestoredTurn[]>([]);
  const [fallbackTurns, setFallbackTurns] = useState<FallbackTurn[]>([]);
  const [tasks, setTasks] = useState<StoredStudioAssistantTask[]>([]);
  const [taskStorageError, setTaskStorageError] = useState("");
  const [selectedTask, setSelectedTask] = useState<StudioAssistantTaskDraft | null>(null);
  const [taskReturnFocus, setTaskReturnFocus] = useState<HTMLElement | null>(null);
  const [tasksOpen, setTasksOpen] = useState(false);
  const [restored, setRestored] = useState(false);
  const [restoreQueue, setRestoreQueue] = useState<string[] | null>(null);
  const flightRef = useRef(false);
  const pendingRef = useRef<{ id: string; query: string } | null>(null);
  const messagesRef = useRef<StudioAssistantUIMessage[]>([]);
  const endRef = useRef<HTMLDivElement>(null);
  const [inputElement, setInputElement] = useState<HTMLTextAreaElement | null>(null);
  const [tasksButtonElement, setTasksButtonElement] = useState<HTMLButtonElement | null>(null);

  const transport = useMemo(() => new DefaultChatTransport<StudioAssistantUIMessage>({
    api: "/api/studio/ask",
    prepareSendMessagesRequest: ({ messages }) => ({
      body: {
        messages: requestTextMessages(messages),
        ...(studio.scenario ? { scenario: studio.scenario } : {}),
      },
    }),
  }), [studio.scenario]);

  const addFallback = useCallback((active: { id: string; query: string }) => {
    const lastUserIndex = messagesRef.current.findLastIndex((message) => message.role === "user");
    const freshAssistantMessages = messagesRef.current.slice(lastUserIndex + 1);
    const alreadyHasWorkflow = freshAssistantMessages.some((message) => message.parts.some((part) => (
      part.type === "tool-resolveStudioRequest" && part.state === "output-available"
    )));
    if (alreadyHasWorkflow) return;
    setFallbackTurns((current) => current.some((turn) => turn.id === active.id)
      ? current
      : [...current, {
          id: active.id,
          query: active.query,
          workflow: resolveStudioAssistantWorkflow(active.query, context),
        }].slice(-12));
  }, [context]);

  const {
    clearError,
    error,
    messages,
    sendMessage,
    setMessages,
    status,
    stop,
  } = useChat<StudioAssistantUIMessage>({
    id: `studio-ask-${studio.scenario ?? "connected"}`,
    onError: () => {
      if (pendingRef.current) addFallback(pendingRef.current);
      pendingRef.current = null;
      flightRef.current = false;
    },
    onFinish: ({ isAbort, isError }) => {
      if (isError && pendingRef.current) addFallback(pendingRef.current);
      if (!isAbort || pendingRef.current) pendingRef.current = null;
      flightRef.current = false;
    },
    transport,
  });
  const busy = status === "submitted" || status === "streaming";
  const savedTaskIds = useMemo(() => new Set(tasks.map((task) => task.id)), [tasks]);
  const openTaskCount = tasks.filter((task) => task.status === "OPEN").length;
  const hasConversation = restoredTurns.length > 0 || messages.length > 0 || fallbackTurns.length > 0;

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setFallbackTurns([]);
      setMessages([]);
      setRestored(false);
      setRestoredTurns([]);
      setRestoreQueue(restoreQueries(sessionStorageKey));
      setTasks(restoreTasks(tasksStorageKey));
      setTaskStorageError("");
    });
    return () => window.cancelAnimationFrame(frame);
  }, [sessionStorageKey, setMessages, tasksStorageKey]);

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    if (restored || restoreQueue === null) return;
    if (!restoreQueue.length) {
      const frame = window.requestAnimationFrame(() => {
        setRestored(true);
        setRestoreQueue(null);
      });
      return () => window.cancelAnimationFrame(frame);
    }
    const applicationSettled = Boolean(studio.scenario)
      || studio.application.status === "ready"
      || studio.application.status === "error";
    if (!applicationSettled) return;
    const nextTurns = restoreQueue.map((stored, index) => {
      try {
        return {
          id: `restored-${index}`,
          query: stored,
          workflow: resolveStudioAssistantWorkflow(stored, context),
          state: "complete" as const,
        };
      } catch {
        return { id: `restored-${index}`, query: stored, state: "error" as const };
      }
    });
    const frame = window.requestAnimationFrame(() => {
      setRestoredTurns(nextTurns);
      setRestored(true);
      setRestoreQueue(null);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [context, restoreQueue, restored, studio.application.status, studio.scenario]);

  useEffect(() => {
    if (!restored) return;
    const liveQueries = messages
      .filter((message) => message.role === "user")
      .map(messageText)
      .filter(Boolean);
    try {
      window.sessionStorage.setItem(sessionStorageKey, JSON.stringify(
        [...restoredTurns.filter((turn) => turn.state === "complete").map((turn) => turn.query), ...liveQueries].slice(-12),
      ));
    } catch {
      // A private browsing policy may disable session storage; chat remains usable.
    }
  }, [messages, restored, restoredTurns, sessionStorageKey]);

  useEffect(() => {
    if (!hasConversation) return;
    endRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
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
    if (status === "error") clearError();
    setQueryError("");
    setQuery("");
    void sendMessage({ messageId: active.id, text: cleanQuery }).catch(() => {
      addFallback(active);
      pendingRef.current = null;
      flightRef.current = false;
    });
  }, [addFallback, clearError, sendMessage, status]);

  function resetConversation() {
    if (busy) void stop();
    flightRef.current = false;
    pendingRef.current = null;
    setMessages([]);
    setRestoredTurns([]);
    setFallbackTurns([]);
    setQuery("");
    setQueryError("");
    clearError();
    try { window.sessionStorage.removeItem(sessionStorageKey); } catch { /* Keep the UI usable. */ }
    window.requestAnimationFrame(() => inputElement?.focus({ preventScroll: true }));
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
    const existing = tasks.find((task) => task.id === selectedTask.id);
    const next = existing
      ? tasks
      : [...tasks, storedTaskFromDraft(selectedTask)].slice(-24);
    if (!persistTasks(tasksStorageKey, next)) {
      return { error: "This browser did not allow device storage. The Studio workflow was not changed.", ok: false as const };
    }
    setTaskStorageError("");
    setTasks(next);
    return { ok: true as const };
  }

  function setTaskStatus(taskId: string, taskStatus: StoredStudioAssistantTask["status"]) {
    const next = tasks.map((task) => task.id === taskId ? { ...task, status: taskStatus } : task);
    if (persistTasks(tasksStorageKey, next)) {
      setTaskStorageError("");
      setTasks(next);
      return;
    }
    setTaskStorageError("This browser could not update the saved task. No Studio record changed.");
  }

  function deleteTask(taskId: string) {
    const next = tasks.filter((task) => task.id !== taskId);
    if (persistTasks(tasksStorageKey, next)) {
      setTaskStorageError("");
      setTasks(next);
      return;
    }
    setTaskStorageError("This browser could not remove the saved task. No Studio record changed.");
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
      <div aria-live="polite" className="studio-ask-thread">
        <div className="studio-ask-session-tools">
          {hasConversation ? (
            <button onClick={resetConversation} type="button"><RotateCcw aria-hidden="true" size={15} />New</button>
          ) : null}
          <button onClick={() => setTasksOpen(true)} ref={setTasksButtonElement} type="button">
            <ListTodo aria-hidden="true" size={15} />Tasks{openTaskCount ? <span>{openTaskCount}</span> : null}
          </button>
          {busy ? (
            <button onClick={() => void stop()} type="button"><Square aria-hidden="true" size={13} />Stop</button>
          ) : null}
        </div>

        {!hasConversation ? (
          <div className="studio-ask-welcome">
            <Sparkles aria-hidden="true" size={24} />
            <h1>What needs doing?</h1>
            <p>Ask naturally. Studio will answer, surface the right next action, and prepare safe task options.</p>
            <div>{STARTERS.map((starter) => <button disabled={busy} key={starter} onClick={() => submit(starter)} type="button">{starter}</button>)}</div>
          </div>
        ) : (
          <>
            {restoredTurns.map((turn) => (
              <article className="studio-ask-turn" key={turn.id}>
                <p className="studio-ask-operator">{turn.query}</p>
                {turn.state === "error" ? (
                  <div className="studio-ask-error" role="alert">
                    <CircleAlert aria-hidden="true" size={18} />
                    <span><strong>Studio could not restore that request.</strong><small>No Studio change was applied.</small></span>
                    <button onClick={() => submit(turn.query)} type="button">Try again</button>
                  </div>
                ) : turn.workflow ? (
                  <>
                    <small className="studio-ask-restored">Refreshed against current Studio truth</small>
                    <AssistantWorkflowCard
                      busy={busy}
                      onPrompt={submit}
                      onSaveTask={prepareTaskSave}
                      savedTaskIds={savedTaskIds}
                      workflow={turn.workflow}
                    />
                  </>
                ) : null}
              </article>
            ))}

            {messages.map((message) => (
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
                    if (part.type !== "tool-resolveStudioRequest") return null;
                    if (part.state === "input-streaming" || part.state === "input-available") {
                      return (
                        <div className="studio-ask-resolving" key={`${message.id}:tool:${partIndex}`} role="status">
                          <LoaderCircle aria-hidden="true" size={17} />Reading Studio
                        </div>
                      );
                    }
                    if (part.state === "output-available") {
                      return (
                        <AssistantWorkflowCard
                          busy={busy}
                          key={`${message.id}:tool:${partIndex}`}
                          onPrompt={submit}
                          onSaveTask={prepareTaskSave}
                          savedTaskIds={savedTaskIds}
                          workflow={part.output}
                        />
                      );
                    }
                    if (part.state === "output-error") {
                      return (
                        <div className="studio-ask-error" key={`${message.id}:tool:${partIndex}`} role="alert">
                          <CircleAlert aria-hidden="true" size={18} />
                          <span><strong>Studio truth could not be read.</strong><small>No Studio change was applied.</small></span>
                        </div>
                      );
                    }
                    return null;
                  })}
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
                    turn={turn}
                  />
                )) : null}
              </Fragment>
            ))}
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
        <div ref={endRef} />
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
              disabled={busy}
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
            disabled={!query.trim() || busy}
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
        busyLabel="Saving task on this device"
        confirmLabel="Save task"
        consequence="This saves a private task plan on this device. It does not run the workflow or change any Studio record."
        fallbackFocus={inputElement}
        onConfirm={confirmTaskSave}
        onDismiss={() => setSelectedTask(null)}
        open={Boolean(selectedTask)}
        receiptDetail="The task is available under My tasks for 30 days on this device. No Wardrobe, Shop, Order, stock, media, or approval state changed."
        receiptTitle="Task saved privately"
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

      <StudioTaskSheet
        className="studio-ask-tasks-sheet"
        eyebrow="Device private · 30 days"
        fallbackFocus={inputElement}
        onDismiss={() => setTasksOpen(false)}
        open={tasksOpen}
        returnFocus={tasksButtonElement}
        title="My tasks"
      >
        {taskStorageError ? (
          <div className="studio-ask-error" role="alert">
            <CircleAlert aria-hidden="true" size={18} />
            <span><strong>Saved task update paused.</strong><small>{taskStorageError}</small></span>
            <button onClick={() => setTaskStorageError("")} type="button">Dismiss</button>
          </div>
        ) : null}
        {tasks.length ? (
          <div className="studio-ask-task-list">
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
