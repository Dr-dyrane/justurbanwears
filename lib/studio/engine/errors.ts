export type StudioEngineErrorCode =
  | "ENGINE_DISABLED"
  | "AUTH_REQUIRED"
  | "OPERATOR_FORBIDDEN"
  | "INVALID_REQUEST"
  | "INVALID_ASSET"
  | "INTAKE_NOT_FOUND"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "GENERATION_FAILED"
  | "ENGINE_UNAVAILABLE";

export class StudioEngineError extends Error {
  constructor(
    readonly code: StudioEngineErrorCode,
    readonly status: number,
    message: string,
    readonly recovery: string,
  ) {
    super(message);
  }
}

export function engineErrorResponse(error: unknown): Response {
  const known = error instanceof StudioEngineError
    ? error
    : new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "Studio could not complete that action.",
      "Try again in a moment.",
    );
  return Response.json(
    { error: { code: known.code, message: known.message, recovery: known.recovery } },
    { status: known.status, headers: { "cache-control": "no-store, max-age=0" } },
  );
}
