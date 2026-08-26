import { z } from "zod";
import { studioAtelierDeclarationSchema } from "../studio/atelier/declaration-compiler";
import { StudioEngineError, engineErrorResponse } from "../studio/engine/errors";
import { engineJson, parseEngineJson } from "../studio/engine/http";
import { studioAtelierReviewDecisionSchema } from "./studio-atelier-engine-facade";
import {
  studioAtelierRouteService,
  type StudioAtelierRouteService,
} from "./studio-atelier-route-service";
import type { StudioOperator } from "./studio-operator";

const EMPTY_COMMAND_MAXIMUM_BYTES = 2_048;
const emptyCommandSchema = z.object({}).strict();

type OperationContext = Readonly<{
  params: Promise<Readonly<{ operationId: string }>>;
}>;

type RequireStudioOperator = () => Promise<StudioOperator>;

function forbiddenOrigin(): StudioEngineError {
  return new StudioEngineError(
    "OPERATOR_FORBIDDEN",
    403,
    "Studio rejected a cross-origin mutation request.",
    "Use the signed-in Studio workspace to perform this action.",
  );
}

/**
 * Cookie-backed Studio mutations are same-origin only. Browser provenance
 * headers are checked when present; trusted non-browser callers without them
 * still pass through the normal authenticated operator allow-list.
 */
export function assertStudioAtelierMutationOrigin(request: Request): void {
  const fetchSite = request.headers.get("sec-fetch-site")?.trim().toLowerCase();
  if (fetchSite && !["same-origin", "same-site", "none"].includes(fetchSite)) {
    throw forbiddenOrigin();
  }

  const origin = request.headers.get("origin");
  if (!origin) return;
  let requestOrigin: string;
  try {
    requestOrigin = new URL(request.url).origin;
  } catch {
    throw forbiddenOrigin();
  }
  if (origin !== requestOrigin) throw forbiddenOrigin();
}

/**
 * Run has no caller-authored execution payload. Empty bodies and an exact `{}`
 * are accepted for ordinary fetch clients; provider/model/prompt/attempt/port
 * fields or any other body member fail closed before runtime loading.
 */
export async function parseStudioAtelierEmptyCommand(
  request: Request,
): Promise<Readonly<Record<string, never>>> {
  const declaredLength = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declaredLength) && declaredLength > EMPTY_COMMAND_MAXIMUM_BYTES) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      413,
      "That Atelier command is too large.",
      "Send only the operation ID in the route.",
    );
  }

  const raw = await request.text();
  if (raw.length > EMPTY_COMMAND_MAXIMUM_BYTES) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      413,
      "That Atelier command is too large.",
      "Send only the operation ID in the route.",
    );
  }
  if (raw.trim().length === 0) return Object.freeze({});

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "That Atelier command could not be read.",
      "Send an empty request body.",
    );
  }
  const result = emptyCommandSchema.safeParse(value);
  if (!result.success) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "That Atelier command contains server-owned fields.",
      "Send only the operation ID in the route.",
    );
  }
  return Object.freeze({});
}

function reviewMediaResponse(
  artifact: Awaited<ReturnType<StudioAtelierRouteService["readReviewMedia"]>>,
): Response {
  const body = new Uint8Array(artifact.bytes.byteLength);
  body.set(artifact.bytes);
  return new Response(body.buffer, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "content-length": String(artifact.byteSize),
      "content-type": artifact.mimeType,
      "cross-origin-resource-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}

export function createStudioAtelierHttpHandlers(input: Readonly<{
  service: StudioAtelierRouteService;
  requireOperator: RequireStudioOperator;
}>) {
  return Object.freeze({
    async prepare(request: Request): Promise<Response> {
      try {
        assertStudioAtelierMutationOrigin(request);
        const operator = await input.requireOperator();
        const declaration = await parseEngineJson(
          request,
          studioAtelierDeclarationSchema,
        );
        return engineJson({
          operation: await input.service.prepare(operator, declaration),
        });
      } catch (error) {
        return engineErrorResponse(error);
      }
    },

    async run(request: Request, context: OperationContext): Promise<Response> {
      try {
        assertStudioAtelierMutationOrigin(request);
        const [operator, { operationId }] = await Promise.all([
          input.requireOperator(),
          context.params,
          parseStudioAtelierEmptyCommand(request),
        ]);
        return engineJson({
          operation: await input.service.run(operator, operationId),
        });
      } catch (error) {
        return engineErrorResponse(error);
      }
    },

    async recover(
      _request: Request,
      context: OperationContext,
    ): Promise<Response> {
      try {
        const [operator, { operationId }] = await Promise.all([
          input.requireOperator(),
          context.params,
        ]);
        return engineJson({
          operation: await input.service.recover(operator, operationId),
        });
      } catch (error) {
        return engineErrorResponse(error);
      }
    },

    async reviewMedia(
      _request: Request,
      context: OperationContext,
    ): Promise<Response> {
      try {
        const [operator, { operationId }] = await Promise.all([
          input.requireOperator(),
          context.params,
        ]);
        return reviewMediaResponse(
          await input.service.readReviewMedia(operator, operationId),
        );
      } catch (error) {
        return engineErrorResponse(error);
      }
    },

    async decision(
      request: Request,
      context: OperationContext,
    ): Promise<Response> {
      try {
        assertStudioAtelierMutationOrigin(request);
        const [operator, { operationId }, decision] = await Promise.all([
          input.requireOperator(),
          context.params,
          parseEngineJson(request, studioAtelierReviewDecisionSchema),
        ]);
        return engineJson({
          operation: await input.service.decide(
            operator,
            operationId,
            decision,
          ),
        });
      } catch (error) {
        return engineErrorResponse(error);
      }
    },
  });
}

export const studioAtelierHttpHandlers = createStudioAtelierHttpHandlers({
  service: studioAtelierRouteService,
  requireOperator: async () => {
    const { requireStudioOperator } = await import("./studio-operator");
    return requireStudioOperator();
  },
});
