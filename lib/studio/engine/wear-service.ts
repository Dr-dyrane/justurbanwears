import { get } from "@vercel/blob";
import { buildWearPrompt, generateWearImage, StudioGatewayError, studioGatewayPolicy } from "../../ai/studio-gateway";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import {
  addStudioAsset,
  appendDecision,
  claimGeneration,
  createOrReuseGeneration,
  createOrReuseStockModel,
  getGeneration,
  getOwnedAsset,
  getOwnedModelProfile,
  getOwnedWardrobeItem,
  listGenerationsForIntake,
  listOwnedModelProfiles,
  mapModelProfile,
  updateGeneration,
} from "../../server/studio-intake-repository";
import type { StudioOperator } from "../../server/studio-operator";
import type {
  OperatorSafeWearGeneration,
  OperatorSafeWearWorkspace,
  WearOperation,
} from "./contracts";
import { StudioEngineError } from "./errors";
import { generationFingerprint, sha256 } from "./fingerprint";
import { verifyStudioImage } from "./assets";

type PrivateImage = {
  bytes: Uint8Array;
  mimeType: string;
  pathname: string;
  sha256: string;
  width: number | null;
  height: number | null;
};

async function privateImage(pathname: string, expectedHash?: string): Promise<PrivateImage> {
  const result = await get(pathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "That private image is unavailable.", "Upload or restore it and try again.");
  }
  const verified = verifyStudioImage(new Uint8Array(await new Response(result.stream).arrayBuffer()), result.blob.contentType);
  const hash = sha256(verified.bytes);
  if (expectedHash && hash !== expectedHash) {
    throw new StudioEngineError("INVALID_ASSET", 503, "That private image did not verify.", "Restore the approved image and try again.");
  }
  return { ...verified, pathname, sha256: hash };
}

function assetUrl(wardrobeItemId: string, assetId: string) {
  return `/api/studio/wardrobe/${wardrobeItemId}/assets/${assetId}`;
}

function safeGeneration(generation: Awaited<ReturnType<typeof listGenerationsForIntake>>[number], wardrobeItemId: string): OperatorSafeWearGeneration | null {
  if (!(["MANNEQUIN_FRONT", "MODEL_TRY_ON", "EDITORIAL_MODEL"] as string[]).includes(generation.operation)) return null;
  const parameters = generation.parameters as { attempt?: unknown };
  const attempt = Number(parameters.attempt || 1);
  return {
    id: generation.id,
    operation: generation.operation as WearOperation,
    state: generation.state,
    modelProfileId: generation.modelProfileId,
    parentGenerationId: typeof (generation.parameters as { parentGenerationId?: unknown }).parentGenerationId === "string"
      ? (generation.parameters as { parentGenerationId: string }).parentGenerationId
      : null,
    outputAssetId: generation.outputAssetId,
    outputUrl: generation.outputAssetId ? assetUrl(wardrobeItemId, generation.outputAssetId) : null,
    retryAvailable: attempt < 2 && ["FAILED", "REJECTED"].includes(generation.state),
    createdAt: generation.createdAt.toISOString(),
  };
}

export async function getWearWorkspace(wardrobeItemId: string, operator: StudioOperator): Promise<OperatorSafeWearWorkspace> {
  const item = await getOwnedWardrobeItem(wardrobeItemId, operator.subject);
  if (!item.approvedAssetId) throw new StudioEngineError("INVALID_TRANSITION", 409, "Keep a garment image first.", "Return to garment intake.");
  const [models, generations] = await Promise.all([
    listOwnedModelProfiles(operator.subject),
    listGenerationsForIntake(item.intakeId),
  ]);
  return {
    wardrobeItemId,
    intakeId: item.intakeId,
    title: item.title,
    garmentAssetUrl: assetUrl(wardrobeItemId, item.approvedAssetId),
    models: models.map((profile) => mapModelProfile(profile, wardrobeItemId)),
    generations: generations.map((generation) => safeGeneration(generation, wardrobeItemId)).filter(Boolean) as OperatorSafeWearGeneration[],
    missingViews: ["GARMENT_BACK", "FABRIC_DETAIL"],
    publicationState: "PRIVATE_DRAFT",
  };
}

export async function addAuthorizedStockModel(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  name: string;
  licenseUrl: string;
  bytes: Uint8Array;
  declaredType?: string;
}) {
  await getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject);
  const verified = verifyStudioImage(input.bytes, input.declaredType);
  const hash = sha256(verified.bytes);
  const pathname = `studio/operators/${sha256(input.operator.subject).slice(0, 20)}/models/${hash}.${verified.extension}`;
  const existing = await get(pathname, { access: "private", token: getShopBlobToken("private"), useCache: false });
  if (existing) {
    await privateImage(pathname, hash);
  } else {
    await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: verified.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
  }
  const profile = await createOrReuseStockModel({
    operatorSubject: input.operator.subject,
    name: input.name,
    authorityId: `authorized-stock:${sha256(`${input.operator.subject}:${hash}:${input.licenseUrl}`)}`,
    blobPathname: pathname,
    mimeType: verified.mimeType,
    byteSize: verified.bytes.byteLength,
    width: verified.width,
    height: verified.height,
    sha256: hash,
    licenseUrl: input.licenseUrl,
  });
  return { model: mapModelProfile(profile, input.wardrobeItemId), workspace: await getWearWorkspace(input.wardrobeItemId, input.operator) };
}

async function generatedSource(input: {
  wardrobeItemId: string;
  assetId: string;
  operator: StudioOperator;
}) {
  const item = await getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject);
  const asset = await getOwnedAsset({ intakeId: item.intakeId, assetId: input.assetId, subject: input.operator.subject });
  const image = await privateImage(asset.blobPathname, asset.sha256);
  return { item, asset, image };
}

export async function generateWearCandidate(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  operation: WearOperation;
  modelProfileId?: string;
  parentGenerationId?: string;
  correction?: string;
}) {
  const item = await getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject);
  if (!item.approvedAssetId) throw new StudioEngineError("INVALID_TRANSITION", 409, "Keep a garment image first.", "Return to garment intake.");
  const garment = await generatedSource({ wardrobeItemId: input.wardrobeItemId, assetId: item.approvedAssetId, operator: input.operator });
  let model = null;
  let parent = null;
  if (input.operation === "MODEL_TRY_ON") {
    if (!input.modelProfileId) throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a model.", "Select Lulu or add a model.");
    model = await getOwnedModelProfile(input.modelProfileId, input.operator.subject);
  }
  if (input.operation === "EDITORIAL_MODEL") {
    if (!input.parentGenerationId) throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a model view.", "Keep a try-on first.");
    parent = await getGeneration(input.parentGenerationId, item.intakeId);
    if (!parent || parent.operation !== "MODEL_TRY_ON" || parent.state !== "APPROVED" || !parent.outputAssetId) {
      throw new StudioEngineError("INVALID_REQUEST", 400, "Keep a try-on first.", "Approve a model view before changing its background.");
    }
    model = parent.modelProfileId ? await getOwnedModelProfile(parent.modelProfileId, input.operator.subject) : null;
  }

  const effectiveModelProfileId = model?.id ?? null;
  const prior = (await listGenerationsForIntake(item.intakeId)).filter((generation) =>
    generation.operation === input.operation
    && (generation.modelProfileId ?? null) === effectiveModelProfileId
  );
  const attempt = 1 + prior.filter((generation) => ["FAILED", "REJECTED"].includes(generation.state)).length;
  if (attempt > 2) throw new StudioEngineError("INVALID_TRANSITION", 409, "The retry has already been used.", "Keep the last view or choose another model.");

  const modelImage = model ? await privateImage(model.sourceBlobPathname, model.sourceSha256) : null;
  const parentImage = parent?.outputAssetId
    ? (await generatedSource({ wardrobeItemId: input.wardrobeItemId, assetId: parent.outputAssetId, operator: input.operator })).image
    : null;
  const sources = input.operation === "EDITORIAL_MODEL"
    ? [parentImage!]
    : [garment.image, ...(modelImage ? [modelImage] : [])];
  const sourceAssetIds = input.operation === "EDITORIAL_MODEL"
    ? [parent!.outputAssetId!]
    : [garment.asset.id];
  const sourceHashes = sources.map((source) => source.sha256);
  const promptVersion = studioGatewayPolicy.wearPromptVersions[input.operation];
  const prompt = buildWearPrompt({
    operation: input.operation,
    facts: {
      title: item.title,
      category: item.category,
      colour: item.colour,
      sizeLabel: item.sizeLabel,
      condition: item.condition,
      price: item.price,
    },
    modelName: model?.name,
    correction: input.correction,
  });
  const parameters = {
    aspectRatio: "4:5",
    attempt,
    correction: input.correction || null,
    modelAuthority: model?.authorityId || null,
    modelProfileId: model?.id || null,
    modelSourceSha256: model?.sourceSha256 || null,
    parentGenerationId: parent?.id || null,
    sourceReferences: input.operation === "EDITORIAL_MODEL"
      ? [{ kind: "STUDIO_ASSET", id: parent!.outputAssetId!, sha256: parentImage!.sha256 }]
      : [
        { kind: "STUDIO_ASSET", id: garment.asset.id, sha256: garment.image.sha256 },
        ...(model ? [{ kind: "MODEL_PROFILE", id: model.id, sha256: model.sourceSha256, authorityId: model.authorityId }] : []),
      ],
  };
  const fingerprint = generationFingerprint({
    sourceHashes,
    facts: item,
    operation: input.operation,
    promptVersion,
    model: studioGatewayPolicy.imageModel,
    parameters,
  });
  const generation = await createOrReuseGeneration({
    intakeId: item.intakeId,
    modelProfileId: model?.id || null,
    operation: input.operation,
    state: "PENDING",
    model: studioGatewayPolicy.imageModel,
    promptVersion,
    promptHash: sha256(prompt),
    sourceAssetIds,
    sourceHashes,
    fingerprint,
    parameters,
  });
  if (generation.outputAssetId && ["COMPLETE", "APPROVED"].includes(generation.state)) {
    return { workspace: await getWearWorkspace(input.wardrobeItemId, input.operator), reused: true };
  }
  if (!(await claimGeneration(generation.id))) return { workspace: await getWearWorkspace(input.wardrobeItemId, input.operator), reused: true };
  try {
    const generated = await generateWearImage({ prompt, sources });
    await updateGeneration(generation.id, {
      usage: generated.usage,
      costUsd: generated.costUsd === null ? null : generated.costUsd.toFixed(6),
    });
    if (generated.costUsd === null || generated.costUsd > studioGatewayPolicy.imageCostCapUsd) {
      throw new StudioEngineError("GENERATION_FAILED", 502, "The image exceeded the Studio cost policy.", "Ask an administrator to review the image budget.");
    }
    const verified = verifyStudioImage(generated.bytes, generated.mimeType);
    const outputHash = sha256(verified.bytes);
    const pathname = `studio/intakes/${item.intakeId}/generations/${generation.id}/${outputHash}.${verified.extension}`;
    const blob = await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: verified.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
    const role = input.operation === "EDITORIAL_MODEL" ? "EDITORIAL_MODEL" : input.operation;
    const output = await addStudioAsset({
      intakeId: item.intakeId,
      role,
      blobPathname: blob.pathname,
      blobUrl: blob.url,
      mimeType: verified.mimeType,
      byteSize: verified.bytes.byteLength,
      width: verified.width,
      height: verified.height,
      sha256: outputHash,
    });
    await updateGeneration(generation.id, { state: "COMPLETE", outputAssetId: output.id });
    return { workspace: await getWearWorkspace(input.wardrobeItemId, input.operator), reused: false };
  } catch (error) {
    const accounting = error instanceof StudioGatewayError ? error.accounting : null;
    await updateGeneration(generation.id, {
      state: "FAILED",
      errorCode: error instanceof StudioEngineError ? error.code : "GENERATION_FAILED",
      ...(accounting?.usage ? { usage: accounting.usage } : {}),
      ...(accounting?.costUsd !== null && accounting?.costUsd !== undefined ? { costUsd: accounting.costUsd.toFixed(6) } : {}),
    });
    throw error;
  }
}

export async function decideWearCandidate(input: {
  wardrobeItemId: string;
  generationId: string;
  operator: StudioOperator;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}) {
  const item = await getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject);
  const generation = await getGeneration(input.generationId, item.intakeId);
  if (!generation) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Open the latest Wear view.");
  }
  if (input.decision === "RETRY") {
    if (!(generation.state === "FAILED" || generation.state === "REJECTED")) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That view does not need a retry.", "Review the current view.");
    }
    await appendDecision({
      intakeId: item.intakeId,
      generationId: generation.id,
      actorSubject: input.operator.subject,
      decision: "RETRY",
      note: input.note,
    });
    return getWearWorkspace(input.wardrobeItemId, input.operator);
  }
  if (generation.state !== "COMPLETE" || !generation.outputAssetId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Open the latest completed Wear view.");
  }
  await appendDecision({
    intakeId: item.intakeId,
    generationId: generation.id,
    actorSubject: input.operator.subject,
    decision: input.decision,
    note: input.note,
  });
  await updateGeneration(generation.id, {
    state: input.decision === "KEEP" ? "APPROVED" : "REJECTED",
  });
  return getWearWorkspace(input.wardrobeItemId, input.operator);
}

export async function readWearAsset(input: {
  wardrobeItemId: string;
  assetId: string;
  operator: StudioOperator;
}) {
  const { asset } = await generatedSource(input);
  const result = await get(asset.blobPathname, { access: "private", token: getShopBlobToken("private"), useCache: true });
  if (!result || result.statusCode !== 200) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That image was not found.", "Return to Wear.");
  return { stream: result.stream, mimeType: asset.mimeType, byteSize: asset.byteSize };
}

export async function readModelAuthority(input: {
  wardrobeItemId: string;
  modelProfileId: string;
  operator: StudioOperator;
}) {
  await getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject);
  const profile = await getOwnedModelProfile(input.modelProfileId, input.operator.subject);
  const result = await get(profile.sourceBlobPathname, { access: "private", token: getShopBlobToken("private"), useCache: true });
  if (!result || result.statusCode !== 200) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That model image was not found.", "Choose another model.");
  return { stream: result.stream, mimeType: profile.sourceMimeType, byteSize: profile.sourceByteSize };
}
