import type { ZodType } from "zod";
import { StudioEngineError } from "./errors";

export const noStoreJsonHeaders = { "cache-control": "no-store, max-age=0" } as const;

export async function parseEngineJson<T>(request: Request, schema: ZodType<T>): Promise<T> {
  const length = Number(request.headers.get("content-length") || "0");
  if (Number.isFinite(length) && length > 16_384) {
    throw new StudioEngineError("INVALID_REQUEST", 413, "That request is too large.", "Shorten the garment details.");
  }
  let value: unknown;
  try { value = await request.json(); } catch {
    throw new StudioEngineError("INVALID_REQUEST", 400, "That request could not be read.", "Try the action again.");
  }
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Check the highlighted details.", "Correct the details and continue.");
  }
  return result.data;
}

export function engineJson(value: unknown, init?: ResponseInit): Response {
  return Response.json(value, {
    ...init,
    headers: { ...noStoreJsonHeaders, ...init?.headers },
  });
}
