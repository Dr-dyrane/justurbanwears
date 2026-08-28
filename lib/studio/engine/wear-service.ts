import { get } from "@vercel/blob";
import {
  assertStudioImageBudget,
  buildWearPrompt,
  generateWearImage,
  studioGatewayPolicy,
} from "../../ai/studio-gateway";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import {
  addStudioAsset,
  appendDecisionOnce,
  assertNoConflictingActiveStudioGeneration,
  assertStudioCorrectionDecisionReceipt,
  assertStudioGenerationRequestIdentity,
  checkpointPaidGenerationResult,
  claimGenerationDecision,
  claimPaidGeneration,
  createOrReuseGeneration,
  createOrReuseStockModel,
  finalGenerationDecisionReceipt,
  findGenerationByFingerprint,
  findGenerationByRequestId,
  getGeneration,
  getOwnedAsset,
  getOwnedModelProfile,
  getOwnedWardrobeItem,
  listGenerationsForIntake,
  listLatestDecisionReceiptsForIntake,
  listOwnedModelProfiles,
  mapModelProfile,
  markPaidGenerationIndeterminate,
  markPaidGenerationInvocationStarted,
  quarantinePaidGenerationResult,
  recoverPaidGenerationWithoutDispatch,
  transitionGenerationState,
} from "../../server/studio-intake-repository";
import {
  executeStudioPaidGeneration,
  studioPaidAccountingQuarantineReason,
  studioPaidProviderEvidenceQuarantineReason,
  StudioPaidGenerationIndeterminateError,
} from "../../server/studio-generation-execution";
import {
  persistStudioGenerationOutput,
  persistStudioGenerationProviderResult,
  readStudioGenerationProviderResult,
} from "../../server/studio-generation-result-store";
import type { StudioOperator } from "../../server/studio-operator";
import {
  claimLegacyStudioEngineWork,
  legacyStageFamilyForWearOperation,
} from "../../server/studio-engine-work-ownership-service";
import {
  intakeFactsSchema,
  type OperatorSafeDecisionReceipt,
  type OperatorSafeWearGeneration,
  type OperatorSafeWearWorkspace,
  type WearOperation,
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

function indeterminateWearError(): StudioEngineError {
  return new StudioEngineError(
    "GENERATION_FAILED",
    409,
    "Studio cannot confirm whether the paid Wear call returned.",
    "Ask an administrator to reconcile this attempt. Starting another paid attempt is blocked.",
  );
}

export function wearGenerationResponse<T>(input: {
  generationId: string;
  workspace: T;
  reused: boolean;
}) {
  return input;
}

export function legacyWearRequiresNonZdrConsent(operation: WearOperation): boolean {
  return operation === "MODEL_TRY_ON" || operation === "EDITORIAL_MODEL";
}

export function isTerminalWearRequestReplay(input: {
  state: string;
  requestId: string | null;
}, requestId: string): boolean {
  return input.requestId === requestId && (input.state === "FAILED" || input.state === "REJECTED");
}

function missingLegacyWearConsentError(): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    "Private identity cannot be sent to this image provider yet.",
    "Use the durable Atelier flow after its exact provider-retention consent receipt is available. No paid call was started.",
  );
}

function safeGeneration(
  generation: Awaited<ReturnType<typeof listGenerationsForIntake>>[number],
  wardrobeItemId: string,
  decisionReceipt: OperatorSafeDecisionReceipt | null,
): OperatorSafeWearGeneration | null {
  if (!(["MANNEQUIN_FRONT", "MODEL_TRY_ON", "EDITORIAL_MODEL"] as string[]).includes(generation.operation)) return null;
  const parameters = generation.parameters as { attempt?: unknown };
  const attempt = Number(parameters.attempt || 1);
  return {
    id: generation.id,
    requestId: generation.requestId ?? generation.id,
    operation: generation.operation as WearOperation,
    state: generation.state,
    modelProfileId: generation.modelProfileId,
    parentGenerationId: typeof (generation.parameters as { parentGenerationId?: unknown }).parentGenerationId === "string"
      ? (generation.parameters as { parentGenerationId: string }).parentGenerationId
      : null,
    outputAssetId: generation.outputAssetId,
    outputUrl: generation.outputAssetId ? assetUrl(wardrobeItemId, generation.outputAssetId) : null,
    retryAvailable: attempt < 2 && ["FAILED", "REJECTED"].includes(generation.state),
    requiresReconciliation: generation.state === "INDETERMINATE",
    decisionReceipt,
    createdAt: generation.createdAt.toISOString(),
  };
}

export async function getWearWorkspace(wardrobeItemId: string, operator: StudioOperator): Promise<OperatorSafeWearWorkspace> {
  const item = await getOwnedWardrobeItem(wardrobeItemId, operator.subject);
  if (!item.approvedAssetId) throw new StudioEngineError("INVALID_TRANSITION", 409, "Keep a garment image first.", "Return to garment intake.");
  const [models, generations, decisionReceipts] = await Promise.all([
    listOwnedModelProfiles(operator.subject),
    listGenerationsForIntake(item.intakeId),
    listLatestDecisionReceiptsForIntake(item.intakeId),
  ]);
  return {
    wardrobeItemId,
    intakeId: item.intakeId,
    title: item.title,
    garmentAssetUrl: assetUrl(wardrobeItemId, item.approvedAssetId),
    models: models.map((profile) => mapModelProfile(profile, wardrobeItemId)),
    generations: generations.map((generation) => safeGeneration(
      generation,
      wardrobeItemId,
      decisionReceipts.get(generation.id) ?? finalGenerationDecisionReceipt(generation),
    )).filter(Boolean) as OperatorSafeWearGeneration[],
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
  requestId: string;
  operation: WearOperation;
  modelProfileId?: string;
  parentGenerationId?: string;
  correction?: string;
  correctionGenerationId?: string;
  decisionReceiptId?: string;
  recoveryOnly?: boolean;
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
  const requestGeneration = await findGenerationByRequestId({
    intakeId: item.intakeId,
    requestId: input.requestId,
  });
  if (
    requestGeneration
    && (
      requestGeneration.operation !== input.operation
      || (requestGeneration.modelProfileId ?? null) !== effectiveModelProfileId
      || (
        input.operation === "EDITORIAL_MODEL"
        && (requestGeneration.parameters as { parentGenerationId?: unknown }).parentGenerationId !== parent?.id
      )
    )
  ) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "That Wear request key already belongs to a different command.",
      "Resume the saved command or start a new Wear intent.",
    );
  }
  const prior = (await listGenerationsForIntake(item.intakeId)).filter((generation) =>
    generation.operation === input.operation
    && (input.operation !== "MODEL_TRY_ON" || (generation.modelProfileId ?? null) === effectiveModelProfileId)
    && (
      input.operation !== "EDITORIAL_MODEL"
      || (generation.parameters as { parentGenerationId?: unknown }).parentGenerationId === parent?.id
    )
  );
  if (prior.some((generation) => generation.state === "INDETERMINATE")) {
    throw indeterminateWearError();
  }
  const requestAttempt = Number((requestGeneration?.parameters as { attempt?: unknown } | undefined)?.attempt ?? 0);
  const attempt = requestGeneration
    ? requestAttempt
    : 1 + prior.filter((generation) => ["FAILED", "REJECTED"].includes(generation.state)).length;
  if (!Number.isInteger(attempt) || attempt < 1) {
    throw new StudioEngineError("INVALID_REQUEST", 409, "The saved Wear request has an invalid attempt.", "Ask an administrator to reconcile the saved command.");
  }
  if (attempt > 2) throw new StudioEngineError("INVALID_TRANSITION", 409, "The retry has already been used.", "Keep the last view or choose another model.");
  const savedCorrectionGenerationId = requestGeneration
    && typeof (requestGeneration.parameters as { correctionGenerationId?: unknown }).correctionGenerationId === "string"
    ? (requestGeneration.parameters as { correctionGenerationId: string }).correctionGenerationId
    : null;
  const correctionGeneration = requestGeneration
    ? savedCorrectionGenerationId
      ? prior.find((generation) => generation.id === savedCorrectionGenerationId)
        ?? await getGeneration(savedCorrectionGenerationId, item.intakeId)
      : null
    : [...prior].reverse().find((generation) =>
      generation.state === "FAILED" || generation.state === "REJECTED"
    ) ?? null;
  if (attempt > 1) {
    if (!correctionGeneration) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "The correction source is unavailable.", "Reload Wear before trying again.");
    }
    const receipts = await listLatestDecisionReceiptsForIntake(item.intakeId);
    assertStudioCorrectionDecisionReceipt({
      expectedGenerationId: input.correctionGenerationId,
      expectedReceiptId: input.decisionReceiptId,
      expectedCorrection: input.correction,
      generationId: correctionGeneration.id,
      receipt: receipts.get(correctionGeneration.id) ?? finalGenerationDecisionReceipt(correctionGeneration),
    });
  } else if (input.correction || input.correctionGenerationId || input.decisionReceiptId) {
    throw new StudioEngineError("INVALID_REQUEST", 409, "This first attempt cannot use a correction receipt.", "Start from the current Wear authority.");
  }

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
  const garmentFacts = {
    title: item.title,
    category: intakeFactsSchema.shape.category.parse(item.category),
    colour: item.colour,
    sizeLabel: item.sizeLabel,
    condition: item.condition,
    price: item.price,
  };
  const prompt = buildWearPrompt({
    operation: input.operation,
    facts: garmentFacts,
    modelName: model?.name,
    correction: input.correction,
  });
  const parameters = {
    size: studioGatewayPolicy.legacyImageSize,
    attempt,
    correction: input.correction || null,
    modelAuthority: model?.authorityId || null,
    modelProfileId: model?.id || null,
    modelSourceSha256: model?.sourceSha256 || null,
    parentGenerationId: parent?.id || null,
    correctionGenerationId: correctionGeneration?.id ?? null,
    decisionReceiptId: input.decisionReceiptId ?? null,
    sourceReferences: input.operation === "EDITORIAL_MODEL"
      ? [{ kind: "STUDIO_ASSET", id: parent!.outputAssetId!, sha256: parentImage!.sha256 }]
      : [
        { kind: "STUDIO_ASSET", id: garment.asset.id, sha256: garment.image.sha256 },
        ...(model ? [{ kind: "MODEL_PROFILE", id: model.id, sha256: model.sourceSha256, authorityId: model.authorityId }] : []),
      ],
  };
  const fingerprint = generationFingerprint({
    sourceHashes,
    facts: garmentFacts,
    operation: input.operation,
    promptVersion,
    model: studioGatewayPolicy.legacyImageModel,
    parameters,
  });
  if (requestGeneration) assertStudioGenerationRequestIdentity(requestGeneration, fingerprint);
  await claimLegacyStudioEngineWork({
    operatorSubject: input.operator.subject,
    wardrobeItemId: input.wardrobeItemId,
    stageFamily: legacyStageFamilyForWearOperation(input.operation),
  });
  if (requestGeneration && isTerminalWearRequestReplay(requestGeneration, input.requestId)) {
    return wearGenerationResponse({
      generationId: requestGeneration.id,
      workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
      reused: true,
    });
  }
  if (requestGeneration?.outputAssetId && ["COMPLETE", "APPROVED"].includes(requestGeneration.state)) {
    return wearGenerationResponse({
      generationId: requestGeneration.id,
      workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
      reused: true,
    });
  }
  const reusable = requestGeneration ? null : prior.find((candidate) => {
    const candidateAttempt = Number((candidate.parameters as { attempt?: unknown }).attempt ?? 1);
    return candidateAttempt === attempt
      && Boolean(candidate.outputAssetId)
      && (candidate.state === "COMPLETE" || candidate.state === "APPROVED");
  });
  if (reusable) {
    assertNoConflictingActiveStudioGeneration(reusable, fingerprint);
    return wearGenerationResponse({
      generationId: reusable.id,
      workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
      reused: true,
    });
  }
  const existingGeneration = requestGeneration
    ?? await findGenerationByFingerprint({ intakeId: item.intakeId, fingerprint });
  if (
    legacyWearRequiresNonZdrConsent(input.operation)
    && !existingGeneration?.providerInvocationStartedAt
    && !existingGeneration?.providerResultReceivedAt
  ) {
    throw missingLegacyWearConsentError();
  }
  if (input.recoveryOnly && !existingGeneration) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no saved Wear command to recover.", "Start generation explicitly when you are ready to allow a paid dispatch.");
  }
  const generation = existingGeneration ?? await createOrReuseGeneration({
    intakeId: item.intakeId,
    requestId: input.requestId,
    modelProfileId: model?.id || null,
    operation: input.operation,
    state: "PENDING",
    model: studioGatewayPolicy.legacyImageModel,
    promptVersion,
    promptHash: sha256(prompt),
    sourceAssetIds,
    sourceHashes,
    fingerprint,
    parameters,
  });
  if (generation.outputAssetId && ["COMPLETE", "APPROVED"].includes(generation.state)) {
    return wearGenerationResponse({
      generationId: generation.id,
      workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
      reused: true,
    });
  }
  if (input.recoveryOnly) {
    const recovery = await recoverPaidGenerationWithoutDispatch(generation.id);
    if (recovery.kind === "READY_TO_DISPATCH" || recovery.kind === "JOINED") {
      return wearGenerationResponse({
        generationId: generation.id,
        workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
        reused: true,
      });
    }
    if (recovery.kind === "INDETERMINATE") throw indeterminateWearError();
  }
  if (!generation.providerInvocationStartedAt && !generation.providerResultReceivedAt) assertStudioImageBudget();
  let execution;
  try {
    execution = await executeStudioPaidGeneration({
      claim: () => claimPaidGeneration(generation.id),
      markInvocationStarted: (executionToken) => markPaidGenerationInvocationStarted({
        id: generation.id,
        executionToken,
      }),
      invoke: async () => {
        const generated = await generateWearImage({ prompt, sources });
        return {
          bytes: generated.bytes,
          mimeType: generated.mimeType,
          usage: generated.usage,
          costUsd: generated.costUsd,
          providerEvidence: generated.providerEvidence,
        };
      },
      persistResult: (result) => persistStudioGenerationProviderResult({
        intakeId: item.intakeId,
        generationId: generation.id,
        result,
      }),
      readRetainedResult: () => readStudioGenerationProviderResult({
        intakeId: item.intakeId,
        generationId: generation.id,
      }),
      checkpointResult: (executionToken, result) => checkpointPaidGenerationResult({
        id: generation.id,
        executionToken,
        result,
      }),
      markIndeterminate: (executionToken) => markPaidGenerationIndeterminate({
        id: generation.id,
        executionToken,
      }),
      markResultConflictIndeterminate: (executionToken) => quarantinePaidGenerationResult({
        id: generation.id,
        executionToken,
        errorCode: "PROVIDER_RESULT_CONFLICT",
      }),
    });
  } catch (error) {
    if (error instanceof StudioPaidGenerationIndeterminateError) throw indeterminateWearError();
    throw error;
  }
  if (execution.kind === "JOINED") {
    return wearGenerationResponse({
      generationId: generation.id,
      workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
      reused: true,
    });
  }
  if (execution.kind === "INDETERMINATE") throw indeterminateWearError();
  if (execution.kind === "TERMINAL") {
    if (execution.row.outputAssetId && ["COMPLETE", "APPROVED"].includes(execution.row.state)) {
      return wearGenerationResponse({
        generationId: generation.id,
        workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
        reused: true,
      });
    }
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This Wear attempt is closed.", "Review the current Wear state.");
  }

  const providerEvidenceReason = studioPaidProviderEvidenceQuarantineReason(
    execution.result,
    studioGatewayPolicy.legacyImageModel,
    "openai",
  );
  const accountingReason = studioPaidAccountingQuarantineReason(
    execution.result.costUsd,
    studioGatewayPolicy.legacyImageCostCapUsd,
  );
  if (providerEvidenceReason || accountingReason) {
    await quarantinePaidGenerationResult({
      id: generation.id,
      executionToken: execution.executionToken,
      errorCode: accountingReason ?? providerEvidenceReason!,
    });
    throw indeterminateWearError();
  }

  let verified: ReturnType<typeof verifyStudioImage>;
  try {
    verified = verifyStudioImage(execution.result.bytes, execution.result.mimeType);
  } catch {
    await quarantinePaidGenerationResult({
      id: generation.id,
      executionToken: execution.executionToken,
      errorCode: "INVALID_PROVIDER_IMAGE",
    });
    throw indeterminateWearError();
  }
  if (verified.mimeType !== "image/jpeg" || verified.width !== 1024 || verified.height !== 1536) {
    await quarantinePaidGenerationResult({
      id: generation.id,
      executionToken: execution.executionToken,
      errorCode: "OUTPUT_CONTRACT_MISMATCH",
    });
    throw indeterminateWearError();
  }

  try {
    const outputHash = sha256(verified.bytes);
    const pathname = `studio/intakes/${item.intakeId}/generations/${generation.id}/${outputHash}.${verified.extension}`;
    const blob = await persistStudioGenerationOutput({
      pathname,
      bytes: verified.bytes,
      mimeType: verified.mimeType,
      sha256: outputHash,
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
    const transitioned = await transitionGenerationState({
      id: generation.id,
      expectedState: "RUNNING",
      executionToken: execution.executionToken,
      state: "COMPLETE",
      update: { outputAssetId: output.id },
    });
    if (!transitioned) {
      return wearGenerationResponse({
        generationId: generation.id,
        workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
        reused: true,
      });
    }
    return wearGenerationResponse({
      generationId: generation.id,
      workspace: await getWearWorkspace(input.wardrobeItemId, input.operator),
      reused: false,
    });
  } catch (error) {
    if (error instanceof StudioEngineError) {
      await transitionGenerationState({
        id: generation.id,
        expectedState: "RUNNING",
        executionToken: execution.executionToken,
        state: "FAILED",
        update: { errorCode: error.code },
      }).catch(() => undefined);
    }
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
  if (input.decision === "EDIT" && !input.note?.trim()) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Name the one correction to make.", "Enter one bounded correction before choosing Edit.");
  }
  const item = await getOwnedWardrobeItem(input.wardrobeItemId, input.operator.subject);
  const generation = await getGeneration(input.generationId, item.intakeId);
  if (!generation) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Open the latest Wear view.");
  }
  if (generation.state === "INDETERMINATE") throw indeterminateWearError();
  if (input.decision === "RETRY") {
    if (!(generation.state === "FAILED" || generation.state === "REJECTED")) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That view does not need a retry.", "Review the current view.");
    }
    await appendDecisionOnce({
      intakeId: item.intakeId,
      generationId: generation.id,
      actorSubject: input.operator.subject,
      decision: "RETRY",
      note: input.note,
    });
    return getWearWorkspace(input.wardrobeItemId, input.operator);
  }
  if (!generation.outputAssetId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view is not awaiting review.", "Open the latest completed Wear view.");
  }
  const decisionClaim = await claimGenerationDecision({
    id: generation.id,
    expectedState: "COMPLETE",
    state: input.decision === "KEEP" ? "APPROVED" : "REJECTED",
    decision: input.decision,
    note: input.note,
  });
  if (decisionClaim === "CONFLICT") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That view already has a different decision.", "Reload the current Wear state.");
  }
  await appendDecisionOnce({
    intakeId: item.intakeId,
    generationId: generation.id,
    actorSubject: input.operator.subject,
    decision: input.decision,
    note: input.note,
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
