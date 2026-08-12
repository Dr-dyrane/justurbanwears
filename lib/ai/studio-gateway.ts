import { generateImage, generateText } from "ai";
import { z } from "zod";
import { intakeFactsSchema, type IntakeFacts } from "../studio/engine/contracts";
import { StudioEngineError } from "../studio/engine/errors";

const DEFAULT_TEXT_MODEL = "zai/glm-4.6v-flash";
const DEFAULT_IMAGE_MODEL = "bfl/flux-2-klein-4b";
const APPROVED_IMAGE_MODEL_CEILINGS_USD: Readonly<Record<string, number>> = Object.freeze({
  "bfl/flux-2-klein-4b": 0.02,
});

export const studioGatewayPolicy = {
  textModel: process.env.STUDIO_AI_TEXT_MODEL || DEFAULT_TEXT_MODEL,
  imageModel: process.env.STUDIO_AI_IMAGE_MODEL || DEFAULT_IMAGE_MODEL,
  imageCostCapUsd: Number(process.env.STUDIO_AI_IMAGE_COST_CAP_USD || "0.02"),
  promptVersion: "garment-front-v1",
} as const;

export function assertStudioImageBudget(): void {
  const modelCeiling = APPROVED_IMAGE_MODEL_CEILINGS_USD[studioGatewayPolicy.imageModel];
  if (modelCeiling === undefined || studioGatewayPolicy.imageCostCapUsd < modelCeiling) {
    throw new StudioEngineError(
      "GENERATION_FAILED",
      503,
      "The image model is outside the Studio budget.",
      "Ask an administrator to approve the image model and budget.",
    );
  }
}

export function buildGarmentFrontPrompt(input: {
  facts: Partial<IntakeFacts>;
  correction?: string;
}): string {
  return [
    "Create one clean product-only straight-on front catalogue image of the exact garment.",
    "Neutral warm-paper background, even soft light, complete visible edges, no person, mannequin, hanger, text, logo or invented closures.",
    `Confirmed facts: ${JSON.stringify(input.facts)}.`,
    input.correction ? `Operator correction: ${input.correction}.` : "",
  ].filter(Boolean).join(" ");
}

function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1);
  if (!candidate) throw new Error("No JSON object returned.");
  return JSON.parse(candidate);
}

export async function analyzeGarmentFacts(input: {
  description: string;
  sourceDataUrl?: string;
}): Promise<{ facts: IntakeFacts; usage: Record<string, unknown>; model: string }> {
  const instruction = [
    "Return one minified JSON object only.",
    "Schema: {title:string,category:one of Dress|Shirt|Set|Knitwear|Skirt|Trousers|Other,colour:string,sizeLabel:string,condition:string,price:integer}.",
    "Describe only visible or supplied garment truth. Use Size on request when unknown; use Excellent · real-worn wardrobe piece when condition is not supplied; use price 0 when unknown.",
    `Operator description: ${input.description || "No description supplied."}`,
  ].join("\n");
  try {
    const result = await generateText({
      model: studioGatewayPolicy.textModel,
      messages: [{
        role: "user",
        content: input.sourceDataUrl
          ? [{ type: "text", text: instruction }, { type: "image", image: input.sourceDataUrl }]
          : instruction,
      }],
      maxOutputTokens: 180,
      maxRetries: 1,
      abortSignal: AbortSignal.timeout(30_000),
      providerOptions: {
        gateway: { caching: "auto", sort: "cost" },
        zai: { thinking: { type: "disabled" } },
      },
    });
    return {
      facts: intakeFactsSchema.parse(extractJson(result.text)),
      usage: result.usage as unknown as Record<string, unknown>,
      model: studioGatewayPolicy.textModel,
    };
  } catch {
    throw new StudioEngineError(
      "GENERATION_FAILED",
      502,
      "The garment details could not be read safely.",
      "Edit the description or use a clearer photo.",
    );
  }
}

const gatewayCostSchema = z.union([z.string(), z.number()]).transform(Number);

export async function generateGarmentFront(input: {
  facts: Partial<IntakeFacts>;
  source?: { bytes: Uint8Array; mimeType: string };
  correction?: string;
  prompt?: string;
}) {
  const prompt = input.prompt ?? buildGarmentFrontPrompt(input);
  assertStudioImageBudget();
  try {
    const result = await generateImage({
      model: studioGatewayPolicy.imageModel,
      prompt: input.source
        ? { images: [input.source.bytes], text: prompt }
        : prompt,
      aspectRatio: "4:5",
      n: 1,
      maxRetries: 0,
      abortSignal: AbortSignal.timeout(60_000),
      providerOptions: { gateway: { sort: "cost" } },
    });
    const metadata = result.providerMetadata as Record<string, unknown>;
    const gateway = metadata.gateway && typeof metadata.gateway === "object"
      ? metadata.gateway as Record<string, unknown>
      : {};
    const parsedCost = gatewayCostSchema.safeParse(gateway.cost);
    const costUsd = parsedCost.success && Number.isFinite(parsedCost.data)
      ? parsedCost.data
      : null;
    return {
      bytes: result.image.uint8Array,
      mimeType: result.image.mediaType,
      usage: result.usage as unknown as Record<string, unknown>,
      costUsd,
      prompt,
    };
  } catch (error) {
    if (error instanceof StudioEngineError) throw error;
    throw new StudioEngineError(
      "GENERATION_FAILED",
      502,
      "The garment image was not created.",
      "Try once more or edit the garment details.",
    );
  }
}
