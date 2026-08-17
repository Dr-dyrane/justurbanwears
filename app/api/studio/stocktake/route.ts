import { requireStudioOperator } from "../../../../lib/server/studio-operator";
import {
  closeStocktake,
  getPhysicalPiece,
  getStocktakeWorkspace,
  observePhysicalPiece,
  startStocktake,
  stocktakeCommandSchema,
} from "../../../../lib/server/studio-stocktake-repository";
import { engineErrorResponse } from "../../../../lib/studio/engine/errors";
import { engineJson, parseEngineJson } from "../../../../lib/studio/engine/http";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const key = new URL(request.url).searchParams.get("key")?.trim();
    const [workspace, piece] = await Promise.all([
      getStocktakeWorkspace(operator),
      key ? getPhysicalPiece(operator, key) : Promise.resolve(null),
    ]);
    return engineJson({ ...workspace, piece });
  } catch (error) {
    return engineErrorResponse(error);
  }
}

export async function POST(request: Request): Promise<Response> {
  try {
    const operator = await requireStudioOperator();
    const input = await parseEngineJson(request, stocktakeCommandSchema);
    if (input.command === "START_COUNT") {
      const session = await startStocktake({ operator, ...input });
      return engineJson({ receipt: {
        consequence: `${session.expectedPieces.length} pieces are expected here.`,
        customerVisible: false,
        kind: "COUNT_STARTED",
        next: "Scan each piece.",
      }, session }, { status: 201 });
    }
    if (input.command === "OBSERVE") {
      const result = await observePhysicalPiece({ operator, ...input });
      return engineJson({ ...result, receipt: {
        consequence: result.observation.result === "MATCH"
          ? `${result.observation.observedLocationLabel} is now physically confirmed.`
          : `Expected ${result.observation.expectedLocationLabel}; observed ${result.observation.observedLocationLabel}.`,
        customerVisible: false,
        kind: result.observation.result === "MATCH" ? "PIECE_CONFIRMED" : "MISMATCH_RECORDED",
        next: result.observation.result === "MATCH"
          ? result.session ? "Continue the count." : "No commerce state changed."
          : result.observation.orderReference ? "Review the linked order." : "Review this piece in Wardrobe.",
      } }, { status: 201 });
    }
    const session = await closeStocktake({ operator, ...input });
    return engineJson({ receipt: {
      consequence: `${session.expectedPieces.length} pieces confirmed at ${session.locationLabel.toLowerCase()}.`,
      customerVisible: false,
      kind: "COUNT_CLOSED",
      next: "Start another location when ready.",
    }, session });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
