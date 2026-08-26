import { get } from "@vercel/blob";
import {
  analyzeGarmentFacts,
  assertStudioAnalysisBudget,
  assertStudioImageBudget,
  buildGarmentAnalysisPrompt,
  buildGarmentFrontPrompt,
  generateGarmentFront,
  studioGatewayPolicy,
} from "../../ai/studio-gateway";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import {
  addStudioAsset,
  applyStudioIntakeDecisionAtomic,
  assertStudioCorrectionDecisionReceipt,
  checkpointPaidGenerationResult,
  claimPaidGeneration,
  commitStudioIntakeAtomic,
  createOrReuseGeneration,
  finalGenerationDecisionReceipt,
  findGenerationByFingerprint,
  getGeneration,
  getIntakeSnapshot,
  getOwnedAsset,
  getOwnedIntakeRow,
  listGenerationsForIntake,
  listLatestDecisionReceiptsForIntake,
  listOwnedAssets,
  markPaidGenerationIndeterminate,
  markPaidGenerationInvocationStarted,
  quarantinePaidGenerationResult,
  recoverPaidGenerationWithoutDispatch,
  resolveBoundStudioSource,
  studioInFlightCommandVersionMatches,
  studioIntakeDecisionTransition,
  transitionGenerationState,
  updateIntakeVersioned,
} from "../../server/studio-intake-repository";
import type { StudioOperator } from "../../server/studio-operator";
import {
  executeStudioPaidGeneration,
  studioPaidAccountingQuarantineReason,
  studioPaidProviderEvidenceQuarantineReason,
  StudioPaidGenerationIndeterminateError,
} from "../../server/studio-generation-execution";
import {
  persistStudioGenerationProviderResult,
  readStudioGenerationProviderResult,
} from "../../server/studio-generation-result-store";
import { intakeFactsSchema, type IntakeFacts } from "./contracts";
import { StudioEngineError } from "./errors";
import { generationFingerprint, sha256 } from "./fingerprint";
import { verifyStudioImage } from "./assets";

const GARMENT_ANALYSIS_PROMPT_VERSION = "garment-analysis-v1";

function indeterminateGenerationError(): StudioEngineError {
  return new StudioEngineError(
    "GENERATION_FAILED",
    409,
    "Studio cannot confirm whether the paid provider call returned.",
    "Ask an administrator to reconcile this attempt. Starting another paid attempt is blocked.",
  );
}

async function failIndeterminateIntake(input: {
  id: string;
  subject: string;
}): Promise<void> {
  const current = await getOwnedIntakeRow(input.id, input.subject);
  if (!(["ANALYZING", "GENERATING"] as string[]).includes(current.state)) return;
  await updateIntakeVersioned({
    id: input.id,
    subject: input.subject,
    expectedVersion: current.version,
    state: "FAILED",
    errorCode: "INDETERMINATE_PROVIDER_RESULT",
  }).catch(() => undefined);
}

async function privateAssetBytes(
  blobPathname: string,
  expectedSha256: string,
): Promise<{ bytes: Uint8Array; mimeType: string }> {
  const result = await get(blobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The source image is unavailable.", "Upload the image again.");
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (sha256(bytes) !== expectedSha256) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The immutable source image did not verify.",
      "Restore the exact saved source before running Studio.",
    );
  }
  return { bytes, mimeType: result.blob.contentType };
}

async function persistPrivateImage(input: {
  pathname: string;
  bytes: Uint8Array;
  mimeType: string;
  sha256: string;
}): Promise<{ pathname: string; url: string }> {
  const existing = await get(input.pathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: false,
  });
  if (existing?.statusCode === 200) {
    const bytes = new Uint8Array(await new Response(existing.stream).arrayBuffer());
    if (sha256(bytes) !== input.sha256 || existing.blob.contentType !== input.mimeType) {
      throw new Error("A different Studio image already occupies the content-addressed output path.");
    }
    return { pathname: existing.blob.pathname, url: existing.blob.url };
  }
  try {
    const blob = await putShopBlob("private", input.pathname, Buffer.from(input.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
    return { pathname: blob.pathname, url: blob.url };
  } catch (error) {
    const raced = await get(input.pathname, {
      access: "private",
      token: getShopBlobToken("private"),
      useCache: false,
    }).catch(() => null);
    if (!raced || raced.statusCode !== 200) throw error;
    const bytes = new Uint8Array(await new Response(raced.stream).arrayBuffer());
    if (sha256(bytes) !== input.sha256 || raced.blob.contentType !== input.mimeType) throw error;
    return { pathname: raced.blob.pathname, url: raced.blob.url };
  }
}

export async function analyzeStudioIntake(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  description?: string;
  recoveryOnly?: boolean;
}) {
  const intake = await getOwnedIntakeRow(input.id, input.operator.subject);
  if (!(["DRAFT", "FAILED", "ANALYZING"] as string[]).includes(intake.state)) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This intake is not ready to read.", "Return to its current step.");
  }
  const assets = await listOwnedAssets(input.id, input.operator.subject);
  const priorAnalyses = (await listGenerationsForIntake(input.id)).filter((generation) =>
    generation.operation === "GARMENT_ANALYSIS"
  );
  if (priorAnalyses.some((generation) => generation.state === "INDETERMINATE")) {
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }
  const source = resolveBoundStudioSource(intake, assets);
  if (intake.sourceMode !== "DESCRIBE" && !source) {
    throw new StudioEngineError("INVALID_ASSET", 409, "The immutable intake source is missing.", "Restore the saved source before analysis.");
  }
  const sourceBytes = source ? await privateAssetBytes(source.blobPathname, source.sha256) : undefined;
  const description = input.description ?? intake.description ?? "";
  if (!description && !sourceBytes) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Add a photo or description first.", "Choose Camera, Photos or Describe.");
  }
  const analysisAttempt = 1 + priorAnalyses.filter((generation) => generation.state === "FAILED").length;
  if (analysisAttempt > 2) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "The analysis retry has already been used.", "Start a new intake with corrected evidence.");
  }
  const descriptionSha256 = sha256(description);
  const latestFailedAnalysis = [...priorAnalyses].reverse().find((generation) => generation.state === "FAILED") ?? null;
  if (
    analysisAttempt > 1
    && latestFailedAnalysis
    && (latestFailedAnalysis.parameters as { descriptionSha256?: unknown }).descriptionSha256 === descriptionSha256
    && latestFailedAnalysis.sourceHashes[0] === source?.sha256
  ) {
    throw new StudioEngineError("INVALID_REQUEST", 409, "The failed analysis evidence has not changed.", "Edit the description or start a new intake with clearer source evidence.");
  }
  const prompt = buildGarmentAnalysisPrompt({ description });
  const parameters = {
    attempt: analysisAttempt,
    descriptionSha256,
    sourcePresent: Boolean(source),
  };
  const fingerprint = generationFingerprint({
    sourceHashes: source ? [source.sha256] : [],
    facts: parameters,
    operation: "GARMENT_ANALYSIS",
    promptVersion: GARMENT_ANALYSIS_PROMPT_VERSION,
    model: studioGatewayPolicy.textModel,
    parameters,
  });
  const existingAnalysis = await findGenerationByFingerprint({ intakeId: input.id, fingerprint });
  if (
    intake.state === "ANALYZING"
    && !studioInFlightCommandVersionMatches({
      currentVersion: intake.version,
      expectedVersion: input.expectedVersion,
      exactCommandExists: Boolean(existingAnalysis),
    })
  ) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This intake changed in another window.", `Reload the intake at version ${intake.version}.`);
  }
  if (input.recoveryOnly && !existingAnalysis) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no saved analysis command to recover.", "Start analysis explicitly when you are ready to allow a paid dispatch.");
  }
  const analyzing = intake.state === "ANALYZING"
    ? intake
    : await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      state: "ANALYZING",
      ...(input.description !== undefined ? { description: input.description } : {}),
      errorCode: null,
    });
  const generation = existingAnalysis ?? await createOrReuseGeneration({
    intakeId: input.id,
    operation: "GARMENT_ANALYSIS",
    state: "PENDING",
    model: studioGatewayPolicy.textModel,
    promptVersion: GARMENT_ANALYSIS_PROMPT_VERSION,
    promptHash: sha256(prompt),
    sourceAssetIds: source ? [source.id] : [],
    sourceHashes: source ? [source.sha256] : [],
    fingerprint,
    parameters,
  });

  if (input.recoveryOnly) {
    const recovery = await recoverPaidGenerationWithoutDispatch(generation.id);
    if (recovery.kind === "READY_TO_DISPATCH" || recovery.kind === "JOINED") {
      return getIntakeSnapshot(input.id, input.operator.subject);
    }
    if (recovery.kind === "INDETERMINATE") {
      await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
      throw indeterminateGenerationError();
    }
  }

  let execution;
  if (!generation.providerInvocationStartedAt && !generation.providerResultReceivedAt) {
    assertStudioAnalysisBudget();
  }
  try {
    execution = await executeStudioPaidGeneration({
      claim: () => claimPaidGeneration(generation.id),
      markInvocationStarted: (executionToken) => markPaidGenerationInvocationStarted({
        id: generation.id,
        executionToken,
      }),
      invoke: async () => {
        const analyzed = await analyzeGarmentFacts({
          description,
          prompt,
          ...(sourceBytes ? { sourceDataUrl: `data:${sourceBytes.mimeType};base64,${Buffer.from(sourceBytes.bytes).toString("base64")}` } : {}),
        });
        return {
          bytes: new TextEncoder().encode(analyzed.rawText),
          mimeType: "application/json",
          usage: analyzed.usage,
          costUsd: analyzed.costUsd,
          providerEvidence: analyzed.providerEvidence,
        };
      },
      persistResult: (result) => persistStudioGenerationProviderResult({
        intakeId: input.id,
        generationId: generation.id,
        result,
      }),
      readRetainedResult: () => readStudioGenerationProviderResult({
        intakeId: input.id,
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
    if (error instanceof StudioPaidGenerationIndeterminateError) {
      await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
      throw indeterminateGenerationError();
    }
    throw error;
  }

  if (execution.kind === "JOINED") return getIntakeSnapshot(input.id, input.operator.subject);
  if (execution.kind === "INDETERMINATE") {
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }
  let analysisResult;
  if (execution.kind === "TERMINAL") {
    if (execution.row.state !== "COMPLETE") {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "This analysis attempt is closed.", "Change the garment evidence before trying again.");
    }
    if (analyzing.state === "REVIEW") return getIntakeSnapshot(input.id, input.operator.subject);
    analysisResult = await readStudioGenerationProviderResult({
      intakeId: input.id,
      generationId: generation.id,
    });
    if (!analysisResult) throw indeterminateGenerationError();
  } else {
    analysisResult = execution.result;
  }

  const analysisEvidenceReason = execution.kind === "READY"
    ? studioPaidProviderEvidenceQuarantineReason(
      analysisResult,
      studioGatewayPolicy.textModel,
      studioGatewayPolicy.textModel.split("/", 1)[0],
    )
    : null;
  const analysisAccountingReason = studioPaidAccountingQuarantineReason(
    analysisResult.costUsd,
    studioGatewayPolicy.analysisCostCapUsd,
  );
  if (
    execution.kind === "READY"
    && (analysisEvidenceReason || analysisAccountingReason)
  ) {
    await quarantinePaidGenerationResult({
      id: generation.id,
      executionToken: execution.executionToken,
      errorCode: analysisAccountingReason ?? analysisEvidenceReason!,
    });
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }

  try {
    if (analysisResult.mimeType !== "application/json") throw new Error("Unexpected analysis result type.");
    const facts = intakeFactsSchema.parse(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(analysisResult.bytes)));
    if (execution.kind === "READY") {
      const transitioned = await transitionGenerationState({
        id: generation.id,
        expectedState: "RUNNING",
        executionToken: execution.executionToken,
        state: "COMPLETE",
      });
      if (!transitioned) return getIntakeSnapshot(input.id, input.operator.subject);
    }
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: analyzing.version,
      state: "REVIEW",
      facts,
    });
    return getIntakeSnapshot(input.id, input.operator.subject);
  } catch (error) {
    if (error instanceof StudioEngineError && error.code === "VERSION_CONFLICT") throw error;
    if (execution.kind === "READY") {
      const failed = await transitionGenerationState({
        id: generation.id,
        expectedState: "RUNNING",
        executionToken: execution.executionToken,
        state: "FAILED",
        update: { errorCode: "INVALID_PROVIDER_RESULT" },
      }).catch(() => false);
      if (failed) {
        await updateIntakeVersioned({
          id: input.id,
          subject: input.operator.subject,
          expectedVersion: analyzing.version,
          state: "FAILED",
          errorCode: "GENERATION_FAILED",
        }).catch(() => undefined);
      }
    }
    throw new StudioEngineError("GENERATION_FAILED", 502, "The garment details were not valid.", "Edit the description or use a clearer photo.");
  }
}

export async function generateStudioCandidate(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  operation: "GARMENT_FRONT";
  correction?: string;
  correctionGenerationId?: string;
  decisionReceiptId?: string;
  recoveryOnly?: boolean;
}) {
  const intake = await getOwnedIntakeRow(input.id, input.operator.subject);
  if (!(["REVIEW", "FAILED", "GENERATING"] as string[]).includes(intake.state)) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This intake is not ready to make an image.", "Review the garment details first.");
  }
  const assets = await listOwnedAssets(input.id, input.operator.subject);
  const priorGenerations = await listGenerationsForIntake(input.id);
  if (priorGenerations.some((generation) =>
    generation.operation === input.operation && generation.state === "INDETERMINATE"
  )) {
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }
  // Completed/running duplicate clicks remain attempt one and therefore reuse
  // the same fingerprint. Only a terminal rejected/failed candidate spends
  // the one bounded correction.
  const attempt = 1 + priorGenerations.filter((generation) =>
    generation.operation === input.operation
    && (generation.state === "REJECTED" || generation.state === "FAILED")
  ).length;
  if (attempt > 2) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "The retry has already been used.", "Edit the garment or start a new intake.");
  }
  const correctionGeneration = [...priorGenerations].reverse().find((generation) =>
    generation.operation === input.operation
    && (generation.state === "REJECTED" || generation.state === "FAILED")
  ) ?? null;
  if (attempt > 1) {
    if (!correctionGeneration) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "The correction source is unavailable.", "Reload the intake before trying again.");
    }
    const receipts = await listLatestDecisionReceiptsForIntake(input.id);
    assertStudioCorrectionDecisionReceipt({
      expectedGenerationId: input.correctionGenerationId,
      expectedReceiptId: input.decisionReceiptId,
      expectedCorrection: input.correction,
      generationId: correctionGeneration.id,
      receipt: receipts.get(correctionGeneration.id) ?? finalGenerationDecisionReceipt(correctionGeneration),
    });
  } else if (input.correction || input.correctionGenerationId || input.decisionReceiptId) {
    throw new StudioEngineError("INVALID_REQUEST", 409, "This first attempt cannot use a correction receipt.", "Start from the current garment evidence.");
  }
  const source = resolveBoundStudioSource(intake, assets);
  if (intake.sourceMode !== "DESCRIBE" && !source) {
    throw new StudioEngineError("INVALID_ASSET", 409, "The immutable intake source is missing.", "Restore the saved source before generation.");
  }
  const facts = intake.facts as Partial<IntakeFacts>;
  const parameters = {
    size: studioGatewayPolicy.legacyImageSize,
    attempt,
    correction: input.correction || null,
    correctionGenerationId: correctionGeneration?.id ?? null,
    decisionReceiptId: input.decisionReceiptId ?? null,
  };
  const prompt = buildGarmentFrontPrompt({ facts, correction: input.correction });
  const promptHash = sha256(prompt);
  const sourceHashes = source ? [source.sha256] : [];
  const fingerprint = generationFingerprint({
    sourceHashes,
    facts,
    operation: input.operation,
    promptVersion: studioGatewayPolicy.promptVersion,
    model: studioGatewayPolicy.legacyImageModel,
    parameters,
  });
  const existingGeneration = await findGenerationByFingerprint({ intakeId: input.id, fingerprint });
  if (
    intake.state === "GENERATING"
    && !studioInFlightCommandVersionMatches({
      currentVersion: intake.version,
      expectedVersion: input.expectedVersion,
      exactCommandExists: Boolean(existingGeneration),
    })
  ) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This intake changed in another window.", `Reload the intake at version ${intake.version}.`);
  }
  if (input.recoveryOnly && !existingGeneration) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no saved garment command to recover.", "Start generation explicitly when you are ready to allow a paid dispatch.");
  }
  if (existingGeneration?.outputAssetId && ["COMPLETE", "APPROVED"].includes(existingGeneration.state)) {
    if (intake.state === "GENERATING") {
      await updateIntakeVersioned({
        id: input.id,
        subject: input.operator.subject,
        expectedVersion: intake.version,
        state: "DECISION",
      }).catch(() => undefined);
    }
    return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
  }
  const generating = intake.state === "GENERATING"
    ? intake
    : await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: input.expectedVersion,
      state: "GENERATING",
      errorCode: null,
    });
  const existing = existingGeneration ?? await createOrReuseGeneration({
    intakeId: input.id,
    operation: input.operation,
    state: "PENDING",
    model: studioGatewayPolicy.legacyImageModel,
    promptVersion: studioGatewayPolicy.promptVersion,
    promptHash,
    sourceAssetIds: source ? [source.id] : [],
    sourceHashes,
    fingerprint,
    parameters,
  });

  if (input.recoveryOnly) {
    const recovery = await recoverPaidGenerationWithoutDispatch(existing.id);
    if (recovery.kind === "READY_TO_DISPATCH" || recovery.kind === "JOINED") {
      return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
    }
    if (recovery.kind === "INDETERMINATE") {
      await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
      throw indeterminateGenerationError();
    }
  }

  const sourceBytes = source ? await privateAssetBytes(source.blobPathname, source.sha256) : undefined;
  if (!existing.providerInvocationStartedAt && !existing.providerResultReceivedAt) assertStudioImageBudget();
  let execution;
  try {
    execution = await executeStudioPaidGeneration({
      claim: () => claimPaidGeneration(existing.id),
      markInvocationStarted: (executionToken) => markPaidGenerationInvocationStarted({
        id: existing.id,
        executionToken,
      }),
      invoke: async () => {
        const generated = await generateGarmentFront({ facts, source: sourceBytes, correction: input.correction, prompt });
        return {
          bytes: generated.bytes,
          mimeType: generated.mimeType,
          usage: generated.usage,
          costUsd: generated.costUsd,
          providerEvidence: generated.providerEvidence,
        };
      },
      persistResult: (result) => persistStudioGenerationProviderResult({
        intakeId: input.id,
        generationId: existing.id,
        result,
      }),
      readRetainedResult: () => readStudioGenerationProviderResult({
        intakeId: input.id,
        generationId: existing.id,
      }),
      checkpointResult: (executionToken, result) => checkpointPaidGenerationResult({
        id: existing.id,
        executionToken,
        result,
      }),
      markIndeterminate: (executionToken) => markPaidGenerationIndeterminate({
        id: existing.id,
        executionToken,
      }),
      markResultConflictIndeterminate: (executionToken) => quarantinePaidGenerationResult({
        id: existing.id,
        executionToken,
        errorCode: "PROVIDER_RESULT_CONFLICT",
      }),
    });
  } catch (error) {
    if (error instanceof StudioPaidGenerationIndeterminateError) {
      await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
      throw indeterminateGenerationError();
    }
    throw error;
  }
  if (execution.kind === "JOINED") {
    return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
  }
  if (execution.kind === "INDETERMINATE") {
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }
  if (execution.kind === "TERMINAL") {
    if (execution.row.outputAssetId && ["COMPLETE", "APPROVED"].includes(execution.row.state)) {
      if (generating.state === "GENERATING") {
        await updateIntakeVersioned({
          id: input.id,
          subject: input.operator.subject,
          expectedVersion: generating.version,
          state: "DECISION",
        }).catch(() => undefined);
      }
      return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
    }
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This generation attempt is closed.", "Review the current garment state.");
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
      id: existing.id,
      executionToken: execution.executionToken,
      errorCode: accountingReason ?? providerEvidenceReason!,
    });
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }

  let verified: ReturnType<typeof verifyStudioImage>;
  try {
    verified = verifyStudioImage(execution.result.bytes, execution.result.mimeType);
  } catch {
    await quarantinePaidGenerationResult({
      id: existing.id,
      executionToken: execution.executionToken,
      errorCode: "INVALID_PROVIDER_IMAGE",
    });
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }
  if (verified.mimeType !== "image/jpeg" || verified.width !== 1024 || verified.height !== 1536) {
    await quarantinePaidGenerationResult({
      id: existing.id,
      executionToken: execution.executionToken,
      errorCode: "OUTPUT_CONTRACT_MISMATCH",
    });
    await failIndeterminateIntake({ id: input.id, subject: input.operator.subject });
    throw indeterminateGenerationError();
  }

  try {
    const outputHash = sha256(verified.bytes);
    const pathname = `studio/intakes/${input.id}/generations/${existing.id}/${outputHash}.${verified.extension}`;
    const blob = await persistPrivateImage({
      pathname,
      bytes: verified.bytes,
      mimeType: verified.mimeType,
      sha256: outputHash,
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
    const transitioned = await transitionGenerationState({
      id: existing.id,
      expectedState: "RUNNING",
      executionToken: execution.executionToken,
      state: "COMPLETE",
      update: { outputAssetId: output.id },
    });
    if (!transitioned) {
      return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: true };
    }
    await updateIntakeVersioned({
      id: input.id,
      subject: input.operator.subject,
      expectedVersion: generating.version,
      state: "DECISION",
    });
    return { intake: await getIntakeSnapshot(input.id, input.operator.subject), reused: false };
  } catch (error) {
    if (error instanceof StudioEngineError && error.code !== "VERSION_CONFLICT") {
      const code = error.code;
      const failed = await transitionGenerationState({
        id: existing.id,
        expectedState: "RUNNING",
        executionToken: execution.executionToken,
        state: "FAILED",
        update: { errorCode: code },
      }).catch(() => false);
      if (failed) {
        updateIntakeVersioned({
          id: input.id,
          subject: input.operator.subject,
          expectedVersion: generating.version,
          state: "FAILED",
          errorCode: code,
        }).catch(() => undefined);
      }
    }
    throw error;
  }
}

export async function decideStudioCandidate(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  generationId: string;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}) {
  if (input.decision === "EDIT" && !input.note?.trim()) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Name the one correction to make.", "Enter one bounded correction before choosing Edit.");
  }
  const generation = await getGeneration(input.generationId, input.id);
  if (!generation || generation.operation !== "GARMENT_FRONT") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no candidate to review.", "Make a garment image first.");
  }
  if (generation.state === "INDETERMINATE") throw indeterminateGenerationError();
  if (input.decision === "RETRY" && generation.state === "COMPLETE" && !generation.outputAssetId) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "There is no completed candidate to retry.", "Reload the current garment state.");
  }
  const transition = studioIntakeDecisionTransition({ generation, decision: input.decision });
  await applyStudioIntakeDecisionAtomic({
    intakeId: input.id,
    generationId: generation.id,
    actorSubject: input.operator.subject,
    expectedVersion: input.expectedVersion,
    expectedIntakeState: transition.expectedIntakeState,
    intakeState: transition.intakeState,
    expectedGenerationState: transition.expectedGenerationState,
    generationState: transition.generationState,
    decision: input.decision,
    note: input.note,
  });
  return getIntakeSnapshot(input.id, input.operator.subject);
}

export async function commitStudioIntake(input: {
  id: string;
  operator: StudioOperator;
  expectedVersion: number;
  generationId: string;
  facts: IntakeFacts;
}) {
  const generation = await getGeneration(input.generationId, input.id);
  if (!generation?.outputAssetId || generation.state !== "APPROVED") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "Keep the exact garment image before saving.", "Reload the approved candidate.");
  }
  const committed = await commitStudioIntakeAtomic({
    intakeId: input.id,
    operatorSubject: input.operator.subject,
    expectedVersion: input.expectedVersion,
    generationId: generation.id,
    facts: input.facts,
    approvedAssetId: generation.outputAssetId,
  });
  return {
    intake: await getIntakeSnapshot(input.id, input.operator.subject),
    wardrobeItem: committed.wardrobeItem,
    reused: committed.repeated,
  };
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
