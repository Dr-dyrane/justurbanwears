import { createUIMessageStream, type UIMessageStreamOnEndCallback } from "ai";
import type { StudioAssistantToolExecutor } from "../server/studio-assistant-tool-service";
import {
  type StudioAssistantToolName,
} from "../studio/assistant/tool-contracts";
import { normalizeStudioAssistantText } from "../studio/assistant/experience";
import type { StudioAssistantUIMessage } from "./studio-assistant-agent";

type StudioAssistantEnvironment = Partial<
  Record<"AI_GATEWAY_API_KEY" | "VERCEL_OIDC_TOKEN", string | undefined>
>;

type DeterministicPlan = {
  input: Record<string, unknown>;
  toolName: StudioAssistantToolName;
};

export function studioAssistantModelConnected(
  environment: StudioAssistantEnvironment = process.env as StudioAssistantEnvironment,
) {
  return Boolean(environment.AI_GATEWAY_API_KEY || environment.VERCEL_OIDC_TOKEN);
}

function explicitPieceReference(query: string) {
  const match = /\bjuw[\s_-]*([0-9]{3,})\b/i.exec(query);
  return match ? `JUW-${match[1]}` : undefined;
}

function destinationDrop(query: string) {
  const match = /\b(?:drop\s*)?0?([12])\b/i.exec(query);
  return match ? `Drop 0${match[1]}` : undefined;
}

function explicitOrderReference(query: string) {
  const match = /\bord[\s_-]*([0-9]+)\b/i.exec(query);
  return match ? `ORD-${match[1]}` : undefined;
}

function explicitModelReference(query: string) {
  return /\blulu(?:\s+v[0-9]+)?\b/i.exec(query)?.[0];
}

function implicitEditUsesFocus(query: string) {
  return /^\s*(?:change|edit|set|update)\s+(?:(?:this|that|the|its?)\s+)?(?:name|title|description|price)\b/i.test(query)
    || /^\s*rename\s+(?:it|this|that|the\s+(?:garment|piece|product|item)|current\s+(?:garment|piece|product|item))\s+to\b/i.test(query);
}

function editChanges(query: string) {
  const changes: { description?: string; name?: string; price?: number } = {};
  const description = /\bdescription\b\s*(?:to|as|=|:)\s*["“]?(.+?)["”]?\s*$/i.exec(query)?.[1]?.trim();
  const name = /\b(?:name|title)\b\s*(?:to|as|=|:)\s*["“]?(.+?)["”]?\s*$/i.exec(query)?.[1]?.trim()
    ?? /\brename\s+.+?\s+to\s+["“]?(.+?)["”]?\s*$/i.exec(query)?.[1]?.trim();
  const price = /\bprice\b\s*(?:to|at|=|:)\s*₦?\s*([0-9][0-9,]*)/i.exec(query)?.[1];
  if (description) changes.description = description;
  if (name) changes.name = name;
  if (price) changes.price = Number(price.replaceAll(",", ""));
  return changes;
}

function mutationUsesFocusedPiece(query: string) {
  return implicitEditUsesFocus(query)
    || /\b(?:it|its|this|that|current)\b/i.test(query)
    || /\bthe\s+(?:garment|piece|product|item|record)\b/i.test(query)
    || /^\s*(?:publish|go live|make public)\s+(?:the\s+)?(?:latest\s+|private\s+|current\s+)?(?:revision|changes?|edit|listing)\s*[?.!]*$/i.test(query);
}

function mutationPieceReference(input: {
  effectiveFocusType: ReturnType<typeof normalizeFocusType>;
  explicitReference?: string;
  focusReference?: string | null;
  rawQuery: string;
}) {
  if (input.explicitReference) return input.explicitReference;
  const hasPieceFocus = Boolean(
    input.focusReference
    && ["PIECE", "INVENTORY", "MEDIA"].includes(input.effectiveFocusType ?? ""),
  );
  if (hasPieceFocus && (/\b(?:it|its|this|that|current)\b/i.test(input.rawQuery)
    || /\bthe\s+(?:garment|piece|product|item|record)\b/i.test(input.rawQuery))) {
    return input.focusReference ?? undefined;
  }
  if (hasPieceFocus && implicitEditUsesFocus(input.rawQuery)) return undefined;
  if (hasPieceFocus && mutationUsesFocusedPiece(input.rawQuery)) return input.focusReference ?? undefined;
  return input.rawQuery.trim() || undefined;
}

function normalizeFocusType(
  focusEntityType?: "PIECE" | "DROP" | "ORDER" | "INVENTORY" | "MEDIA" | "MODEL" | "SERVICE" | null,
  focusReference?: string | null,
) {
  return focusEntityType ?? (focusReference ? "PIECE" : null);
}

export function planDeterministicStudioAssistantTool(
  rawQuery: string,
  focusReference?: string | null,
  focusEntityType?: "PIECE" | "DROP" | "ORDER" | "INVENTORY" | "MEDIA" | "MODEL" | "SERVICE" | null,
): DeterministicPlan {
  const query = normalizeStudioAssistantText(rawQuery);
  const effectiveFocusType = normalizeFocusType(focusEntityType, focusReference);
  const explicitReference = explicitPieceReference(query);
  const explicitDrop = destinationDrop(query);
  const explicitOrder = explicitOrderReference(query);
  const explicitModel = explicitModelReference(query);
  const followsCurrentFocus = /\b(it|its|this|that|current|details?|more)\b/i.test(query);
  const focusedPieceReference = followsCurrentFocus
    && ["PIECE", "INVENTORY", "MEDIA"].includes(effectiveFocusType ?? "")
    ? focusReference ?? undefined
    : undefined;
  const reference = explicitReference ?? focusedPieceReference;
  const mutationReference = mutationPieceReference({
    effectiveFocusType,
    explicitReference,
    focusReference,
    rawQuery,
  });
  if (/\b(permanently delete|delete(?:\s+(?:it|this|that|the\s+(?:garment|piece|product|item)))?\s+permanently|hard delete|erase forever)\b/i.test(query)) {
    return { input: { ...(mutationReference ? { reference: mutationReference } : {}) }, toolName: "preparePermanentDelete" };
  }
  if (/\b(change|edit|rename|set|update)\b/i.test(query)) {
    const changes = editChanges(rawQuery);
    if (Object.keys(changes).length) {
      return {
        input: {
          changes,
          ...(mutationReference
            ? { reference: mutationReference }
            : {}),
        },
        toolName: "preparePieceEdit",
      };
    }
  }
  if (/\barchive\b/i.test(query) && !/\b(conversation|thread|chat)\b/i.test(query)) {
    return { input: { ...(mutationReference ? { reference: mutationReference } : {}) }, toolName: "prepareArchive" };
  }
  if (/\b(move|change)\b/i.test(query) && /\bdrop\b/i.test(query)) {
    const destination = destinationDrop(query);
    return destination
      ? { input: { destination, ...(mutationReference ? { pieceReference: mutationReference } : {}) }, toolName: "prepareDropMove" }
      : { input: { query: rawQuery, kinds: ["DROP", "PIECE"] }, toolName: "searchStudio" };
  }
  if (/\b(publish|go live|make public)\b/i.test(query)) {
    return { input: { ...(mutationReference ? { reference: mutationReference } : {}) }, toolName: "preparePublishRevision" };
  }
  if (/\b(media|image|images|photo|photos|view|views)\b/i.test(query)) {
    return { input: { ...(reference ? { pieceReference: reference } : {}) }, toolName: "getMedia" };
  }
  if (/\b(inventory|stock|location|custody|hold|where is)\b/i.test(query)) {
    return { input: { ...(reference ? { reference } : {}) }, toolName: "getInventory" };
  }
  if (/\border\b|\bord-[a-z0-9-]+\b/i.test(query)) {
    return {
      input: explicitOrder
        ? { reference: explicitOrder }
        : effectiveFocusType === "ORDER" && focusReference && followsCurrentFocus
          ? {}
          : { reference: rawQuery },
      toolName: "getOrder",
    };
  }
  if (/\b(model|lulu|authority)\b/i.test(query)) {
    return {
      input: explicitModel
        ? { reference: explicitModel }
        : effectiveFocusType === "MODEL" && focusReference && followsCurrentFocus
          ? {}
          : { reference: rawQuery },
      toolName: "getModel",
    };
  }
  if (/\bdrop\b/i.test(query) && !explicitReference) {
    return {
      input: explicitDrop
        ? { reference: explicitDrop }
        : effectiveFocusType === "DROP" && focusReference && followsCurrentFocus
          ? {}
          : { reference: rawQuery },
      toolName: "getDrop",
    };
  }
  if (focusReference && /\b(it|its|this|that|current|status|state|details?|more)\b/i.test(query)) {
    if (effectiveFocusType === "DROP") return { input: {}, toolName: "getDrop" };
    if (effectiveFocusType === "ORDER") return { input: {}, toolName: "getOrder" };
    if (effectiveFocusType === "INVENTORY") return { input: {}, toolName: "getInventory" };
    if (effectiveFocusType === "MEDIA") return { input: {}, toolName: "getMedia" };
    if (effectiveFocusType === "MODEL") return { input: {}, toolName: "getModel" };
    if (effectiveFocusType === "PIECE") {
      return { input: { reference: focusReference }, toolName: "getPiece" };
    }
  }
  if (explicitReference || /\b(description|price|status|state|name|title|garment|piece|dress|shirt|set|skirt|trouser)\b/i.test(query)) {
    return {
      input: { reference: explicitReference ?? (focusedPieceReference || rawQuery) },
      toolName: "getPiece",
    };
  }
  return { input: { query: rawQuery }, toolName: "searchStudio" };
}

export function createDeterministicStudioAssistantStream(input: {
  executeTool: StudioAssistantToolExecutor;
  focusEntityType?: "PIECE" | "DROP" | "ORDER" | "INVENTORY" | "MEDIA" | "MODEL" | "SERVICE" | null;
  focusReference?: string | null;
  onEnd?: UIMessageStreamOnEndCallback<StudioAssistantUIMessage>;
  originalMessages?: StudioAssistantUIMessage[];
  query: string;
  responseMessageId?: string;
  runId?: string;
}) {
  const plan = planDeterministicStudioAssistantTool(
    input.query,
    input.focusReference,
    input.focusEntityType,
  );
  const toolCallId = `studio-${input.runId ?? crypto.randomUUID()}`;

  return createUIMessageStream<StudioAssistantUIMessage>({
    async execute({ writer }) {
      writer.write({
        input: plan.input,
        toolCallId,
        toolName: plan.toolName,
        type: "tool-input-available",
      });
      const result = await input.executeTool(plan.toolName, plan.input);
      writer.write({
        output: result,
        toolCallId,
        type: "tool-output-available",
      });
    },
    onEnd: input.onEnd,
    originalMessages: input.originalMessages,
    ...(input.responseMessageId ? { generateId: () => input.responseMessageId! } : {}),
  });
}
