import { get } from "@vercel/blob";
import { buildGarmentFrontPrompt, generateGarmentFront, studioGatewayPolicy } from "../../ai/studio-gateway";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import {
  addStudioAsset,
  appendDecision,
  claimGeneration,
  commitWardrobeItem,
  createOrReuseGeneration,
  getIntakeSnapshot,
  getOwnedAsset,
  getOwnedIntakeRow,
  latestGenerationForIntake,
  listGenerationsForIntake,
  listOwnedAssets,
  updateGeneration,
  updateIntakeVersioned,
} from "../../server/studio-intake-repository";
import type { StudioOperator } from "../../server/studio-operator";
import type { IntakeFacts } from "./contracts";
import { StudioEngineError } from "./errors";
import { generationFingerprint, sha256 } from "./fingerprint";
import { assertIntakeTransition } from "./state";
import { verifyStudioImage } from "./assets";
import { analyzeGarmentFacts } from "../../ai/studio-gateway";

async function privateAssetBytes(blobPathname: string): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const result = await get(blobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The source image is unavailable.", "Upload the image again.");
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  return { bytes, mimeType: result.blob.contentType };
}

export async function analyzeStudioIntake(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  description?: string;
}) {
  const intake = await getOwnedIntakeRow(input.id, input.operator.subject);
  if (!(["DRAFT", "FAILED"] as const).includes(intake.state as "DRAFT" | "FAILED")) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This intake is not ready to read.", "Return to its current step.");
  }
  assertIntakeTransition(intake.state, "ANALYZING");
  const analyzing = await updateIntakeVersioned({
    id: input.id,
    subject: input.operator.subject,
    expectedVersion: input.expectedVersion,
    state: "ANALYZING",
    ...(input.description !== undefined ? { description: input.description } : {}),
    errorCode: null,
  });
  try {
    const assets = await listOwnedAssets(input.id, input.operator.subject);
    const source = assets.find((asset) => asset.role === "SOURCE");
    const sourceBytes = source ? await privateAssetBytes(source.blobPathname) : undefined;
    const description = input.description ?? intake.description ?? "";
    if (!description && !sourceBytes) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "Add a photo or description first.", "Choose Camera, Photos or Describe.");
    }
    const analyzed = await analyzeGarmentFacts({
      description,
      ...(sourceBytes ? { sourceDataUrl: `data:${sourceBytes.mimeType};base64,${Buffer.from(sourceBytes.bytes).toString("base64")}` } : {}),
    });
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: analyzing.version,
      state: "REVIEW",
      facts: analyzed.facts,
    });
    return getIntakeSnapshot(input.id, input.operator.subject);
  } catch (error) {
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: analyzing.version,
      state: "FAILED",
      errorCode: error instanceof StudioEngineError ? error.code : "GENERATION_FAILED",
    }).catch(() => undefined);
    throw error;
  }
}

export async function generateStudioCandidate(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  operation: "GARMENT_FRONT";
  correction?: string;
}) {
  const intake = await getOwnedIntakeRow(input.id, input.operator.subject);
  if (intake.state !== "REVIEW" && intake.state !== "FAILED") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This intake is not ready to make an image.", "Review the garment details first.");
  }
  const assets = await listOwnedAssets(input.id, input.operator.subject);
  const priorGenerations = await listGenerationsForIntake(input.id);
  // Completed/running duplicate clicks remain attempt one and therefore reuse
  // the same fingerprint. Only a terminal rejected/failed candidate spends
  // the one bounded correction.
  const attempt = 1 + priorGenerations.filter((generation) =>
    generation.state === "REJECTED" || generation.state === "FAILED"
  ).length;
  if (attempt > 2) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "The retry has already been used.", "Edit the garment or start a new intake.");
  }
  const source = assets.find((asset) => asset.role === "SOURCE");
  const facts = intake.facts as Partial<IntakeFacts>;
  const parameters = { aspectRatio: "4:5", attempt, correction: input.correction || null };
  const prompt = buildGarmentFrontPrompt({ facts, correction: input.correction });
  const promptHash = sha256(prompt);
  const sourceHashes = source ? [source.sha256] : [];
  const fingerprint = generationFingerprint({
    sourceHashes,
    facts,
    operation: input.operation,
    promptVersion: studioGatewayPolicy.promptVersion,
    model: studioGatewayPolicy.imageModel,
    parameters,
  });
  const existing = await createOrReuseGeneration({
    intakeId: input.id,
    operation: input.operation,
    state: "PENDING",
    model: studioGatewayPolicy.imageModel,
    promptVersion: studioGatewayPolicy.promptVersion,
    promptHash,
    sourceAssetIds: source ? [source.id] : [],
    sourceHashes,
    fingerprint,
    parameters,
  });
  if (existing.outputAssetId && ["COMPLETE", "APPROVED"].includes(existing.state)) {
    return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
  }
  const claimed = await claimGeneration(existing.id);
  if (!claimed) {
    return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
  }
  let generating;
  try {
    generating = await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      state: "GENERATING",
      errorCode: null,
    });
  } catch (error) {
    await updateGeneration(existing.id, { state: "FAILED", errorCode: "VERSION_CONFLICT" });
    throw error;
  }
  try {
    const sourceBytes = source ? await privateAssetBytes(source.blobPathname) : undefined;
    const generated = await generateGarmentFront({ facts, source: sourceBytes, correction: input.correction, prompt });
    await updateGeneration(existing.id, {
      usage: generated.usage,
      costUsd: generated.costUsd === null ? null : generated.costUsd.toFixed(6),
    });
    if (generated.costUsd === null || generated.costUsd > studioGatewayPolicy.imageCostCapUsd) {
      throw new StudioEngineError(
        "GENERATION_FAILED",
        502,
        "The image exceeded the Studio cost policy.",
        "Ask an administrator to review the image budget.",
      );
    }
    const verified = verifyStudioImage(generated.bytes, generated.mimeType);
    const outputHash = sha256(verified.bytes);
    const pathname = `studio/intakes/${input.id}/generations/${existing.id}/${outputHash}.${verified.extension}`;
    const blob = await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: verified.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
    const output = await addStudioAsset({
      intakeId: input.id,
      role: "GARMENT_FRONT",
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      mimeType: verified.mimeType,
      byteSize: verified.bytes.byteLength,
      width: verified.width,
      height: verified.height,
      sha256: outputHash,
    });
    await updateGeneration(existing.id, {
      state: "COMPLETE",
      outputAssetId: output.id,
    });
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: generating.version,
      state: "DECISION",
    });
    return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: false };
  } catch (error) {
    const code = error instanceof StudioEngineError ? error.code : "GENERATION_FAILED";
    await Promise.all([
      updateGeneration(existing.id, { state: "FAILED", errorCode: code }),
      updateIntakeVersioned({
        id: input.id,
        subject: input.operator.subject,
        expectedVersion: generating.version,
        state: "FAILED",
        errorCode: code,
      }),
    ]).catch(() => undefined);
    throw error;
  }
}

export async function decideStudioCandidate(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}) {
  const intake = await getOwnedIntakeRow(input.id, input.operator.subject);
  if (intake.state !== "DECISION") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no candidate awaiting a decision.", "Return to the current step.");
  }
  const generation = await latestGenerationForIntake(input.id);
  if (!generation || !generation.outputAssetId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no candidate to review.", "Make a garment image first.");
  }
  await appendDecision({
    intakeId: input.id,
    generationId: generation.id,
    actorSubject: input.operator.subject,
    decision: input.decision,
    note: input.note,
  });
  if (input.decision === "KEEP") {
    await updateGeneration(generation.id, { state: "APPROVED" });
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      state: "DECISION",
    });
  } else if (input.decision === "REJECT") {
    await updateGeneration(generation.id, { state: "REJECTED" });
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      state: "ARCHIVED",
    });
  } else {
    await updateGeneration(generation.id, { state: "REJECTED" });
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      state: "REVIEW",
    });
  }
  return getIntakeSnapshot(input.id, input.operator.subject);
}

export async function commitStudioIntake(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  facts: IntakeFacts;
}) {
  const intake = await getOwnedIntakeRow(input.id, input.operator.subject);
  if (intake.state !== "DECISION") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This garment is not ready to save.", "Keep a candidate first.");
  }
  const generation = await latestGenerationForIntake(input.id);
  if (!generation?.outputAssetId || generation.state !== "APPROVED") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "Keep the garment image before saving.", "Choose Keep.");
  }
  const wardrobeItem = await commitWardrobeItem({
    intakeId: input.id,
    operatorSubject: input.operator.subject,
    facts: input.facts,
    approvedAssetId: generation.outputAssetId,
  });
  await updateIntakeVersioned({
    id: input.id,
    subject: input.operator.subject,
    expectedVersion: input.expectedVersion,
    state: "COMMITTED",
    facts: input.facts,
  });
  return { intake: await getIntakeSnapshot(input.id, input.operator.subject), wardrobeItem };
}

export async function readPrivateAsset(intakeId: string, assetId: string, operator: StudioOperator) {
  const asset = await getOwnedAsset({ intakeId, assetId, subject: operator.subject });
  const result = await get(asset.blobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That image was not found.", "Return to the intake.");
  }
  return { stream: result.stream, mimeType: asset.mimeType, byteSize: asset.byteSize };
}
