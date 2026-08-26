import { get } from "@vercel/blob";
import {
  buildMediaCompletionPrompt,
  generateMediaCompletionImage,
  StudioGatewayError,
  studioGatewayPolicy,
  validateMediaCompletionSource,
} from "../../ai/studio-gateway";
import {
  approveAndPromoteMediaCompletionJob,
  claimMediaCompletionJob,
  createOrReuseMediaCompletionJob,
  getOwnedMediaCompletionJob,
  hasRetainedMediaCompletionProviderResult,
  listMediaCompletionJobs,
  recoverStaleMediaCompletionJobs,
  requeueRetainedMediaCompletionResult,
  rejectMediaCompletionJob,
  updateRunningMediaCompletionJob,
  type MediaCompletionJobRow,
} from "../../server/studio-media-completion-repository";
import { getOwnedAsset, getOwnedWardrobeItem } from "../../server/studio-intake-repository";
import type { StudioOperator } from "../../server/studio-operator";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import type { IntakeFacts } from "./contracts";
import { verifyStudioImage } from "./assets";
import { StudioEngineError } from "./errors";
import { generationFingerprint, sha256 } from "./fingerprint";
import {
  assertMediaCompletionAuthority,
  assertMediaCompletionTruthConfirmation,
  mediaCompletionRoleSchema,
  mediaCompletionSourceModeSchema,
  type MediaCompletionDecision,
  type MediaCompletionResponse,
  type MediaCompletionRole,
  type MediaCompletionSourceMode,
  type MediaCompletionTargetKind,
  type OperatorSafeMediaCompletionJob,
} from "./media-completion-contracts";
import {
  getPendingCaptureWorkspace,
  getWardrobeCaptureWorkspace,
  requirePendingCaptureContract,
  wardrobeCaptureKey,
} from "./pending-capture-service";

type CompletionTarget = {
  kind: MediaCompletionTargetKind;
  key: string;
};

type ResolvedTarget = CompletionTarget & {
  captureKey: string;
  facts: Partial<IntakeFacts>;
  approvedFront?: {
    assetId: string;
    intakeId: string;
  };
};

type PrivateSource = {
  bytes: Uint8Array;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
  blobPathname: string;
};

type SharpPipeline = {
  rotate(): SharpPipeline;
  toColourspace(colourspace: string): SharpPipeline;
  webp(options: { quality: number; alphaQuality: number; effort: number }): SharpPipeline;
  toBuffer(): Promise<Uint8Array>;
};

async function normalizeGeneratedImage(bytes: Uint8Array) {
  const { default: sharp } = await import("sharp");
  const sharpImage = sharp as unknown as (input: Uint8Array) => SharpPipeline;
  return new Uint8Array(await sharpImage(bytes)
    .rotate()
    .toColourspace("srgb")
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toBuffer());
}

function intakeCategory(value: string): IntakeFacts["category"] {
  return (["Dress", "Shirt", "Set", "Knitwear", "Skirt", "Trousers", "Other"] as const)
    .find((category) => category === value) ?? "Other";
}

async function putPrivateContentAddressed(input: {
  pathname: string;
  bytes: Uint8Array;
  mimeType: string;
  expectedSha256: string;
  verifyAsStudioImage?: boolean;
}) {
  const readExact = async () => {
    const found = await get(input.pathname, {
      access: "private",
      token: getShopBlobToken("private"),
      useCache: false,
    });
    if (!found || found.statusCode !== 200) return null;
    const bytes = new Uint8Array(await new Response(found.stream).arrayBuffer());
    const verifiedBytes = input.verifyAsStudioImage === false
      ? bytes
      : verifyStudioImage(bytes, found.blob.contentType).bytes;
    return sha256(verifiedBytes) === input.expectedSha256
      ? found.blob.pathname
      : null;
  };
  const prior = await readExact();
  if (prior) return prior;
  try {
    const stored = await putShopBlob("private", input.pathname, Buffer.from(input.bytes), {
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: input.mimeType,
      cacheControlMaxAge: 31_536_000,
    });
    return stored.pathname;
  } catch (error) {
    // Concurrent identical requests may both observe the initial miss. Only
    // the exact content-addressed bytes written by the winner are accepted.
    const converged = await readExact();
    if (!converged) throw error;
    return converged;
  }
}

function normalizedCorrection(value?: string) {
  const correction = value?.trim();
  if (correction && correction.length > 500) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "That note is too long.", "Use 500 characters or fewer.");
  }
  return correction || undefined;
}

async function resolveTarget(
  target: CompletionTarget,
  role: MediaCompletionRole,
  operator: StudioOperator,
): Promise<ResolvedTarget> {
  if (target.kind === "PENDING_PRODUCT") {
    const contract = requirePendingCaptureContract(target.key, role);
    return {
      kind: target.kind,
      key: contract.sku,
      captureKey: contract.sku,
      facts: {
        title: contract.garment.title,
        category: contract.garment.category,
        colour: contract.garment.color,
        sizeLabel: contract.garment.sizeLabel,
        condition: contract.garment.condition,
        price: contract.garment.price,
      },
    };
  }
  const item = await getOwnedWardrobeItem(target.key, operator.subject);
  if (role === "GARMENT_FRONT") {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      400,
      "The kept intake already supplies the product front.",
      "Choose product back or fabric detail.",
    );
  }
  return {
    kind: target.kind,
    key: item.id,
    captureKey: wardrobeCaptureKey(item.id),
    facts: {
      title: item.title,
      category: intakeCategory(item.category),
      colour: item.colour,
      sizeLabel: item.sizeLabel,
      condition: item.condition,
      price: item.price,
    },
    ...(item.approvedAssetId ? {
      approvedFront: { assetId: item.approvedAssetId, intakeId: item.intakeId },
    } : {}),
  };
}

async function storeAuthoritySource(input: {
  operator: StudioOperator;
  bytes: Uint8Array;
  declaredType?: string;
}): Promise<PrivateSource> {
  const verified = verifyStudioImage(input.bytes, input.declaredType);
  const hash = sha256(verified.bytes);
  const operatorKey = sha256(input.operator.subject).slice(0, 20);
  const pathname = `studio/operators/${operatorKey}/media-completions/sources/${hash}.${verified.extension}`;
  const storedPathname = await putPrivateContentAddressed({
    pathname,
    bytes: verified.bytes,
    mimeType: verified.mimeType,
    expectedSha256: hash,
  });
  return {
    bytes: verified.bytes,
    mimeType: verified.mimeType,
    byteSize: verified.bytes.byteLength,
    width: verified.width,
    height: verified.height,
    sha256: hash,
    blobPathname: storedPathname,
  };
}

async function readApprovedWardrobeFront(
  target: ResolvedTarget,
  operator: StudioOperator,
): Promise<PrivateSource> {
  if (target.kind !== "WARDROBE_ITEM" || !target.approvedFront) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "This piece has no approved product front.",
      "Add or keep a product front first.",
    );
  }
  const asset = await getOwnedAsset({
    intakeId: target.approvedFront.intakeId,
    assetId: target.approvedFront.assetId,
    subject: operator.subject,
  });
  if (asset.role !== "GARMENT_FRONT") {
    throw new StudioEngineError(
      "INVALID_ASSET",
      409,
      "The approved image is not a product front.",
      "Keep a product front first.",
    );
  }
  const result = await get(asset.blobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The approved product front is unavailable.", "Open the piece again.");
  }
  const verified = verifyStudioImage(
    new Uint8Array(await new Response(result.stream).arrayBuffer()),
    result.blob.contentType ?? asset.mimeType,
  );
  const hash = sha256(verified.bytes);
  if (hash !== asset.sha256 || verified.bytes.byteLength !== asset.byteSize) {
    throw new StudioEngineError("INVALID_ASSET", 503, "The approved product front did not verify.", "Open the piece again.");
  }
  return {
    bytes: verified.bytes,
    mimeType: verified.mimeType,
    byteSize: verified.bytes.byteLength,
    width: verified.width,
    height: verified.height,
    sha256: hash,
    blobPathname: asset.blobPathname,
  };
}

async function readAuthoritySource(job: MediaCompletionJobRow): Promise<PrivateSource> {
  const result = await get(job.sourceBlobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The authority photo is unavailable.", "Add the source again.");
  }
  const verified = verifyStudioImage(
    new Uint8Array(await new Response(result.stream).arrayBuffer()),
    result.blob.contentType ?? job.sourceMimeType,
  );
  if (sha256(verified.bytes) !== job.sourceSha256) {
    throw new StudioEngineError("INVALID_ASSET", 503, "The authority photo did not verify.", "Add the source again.");
  }
  return {
    bytes: verified.bytes,
    mimeType: verified.mimeType,
    byteSize: verified.bytes.byteLength,
    width: verified.width,
    height: verified.height,
    sha256: job.sourceSha256,
    blobPathname: job.sourceBlobPathname,
  };
}

type RetainedProviderResult = {
  bytes: Uint8Array;
  mimeType: string;
  usage: Record<string, unknown>;
  costUsd: number | null;
};

function providerResultExtension(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  return "bin";
}

function providerResultContentType(mimeType: string): string {
  return ["image/jpeg", "image/png", "image/webp"].includes(mimeType)
    ? mimeType
    : "application/octet-stream";
}

async function readRetainedProviderResult(job: MediaCompletionJobRow): Promise<RetainedProviderResult> {
  if (!hasRetainedMediaCompletionProviderResult(job)) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      "That paid result is incomplete.",
      "Ask an administrator to reconcile this view.",
    );
  }
  const pathname = job.providerResultBlobPathname!;
  const mimeType = job.providerResultMimeType!;
  const expectedByteSize = job.providerResultByteSize!;
  const expectedSha256 = job.providerResultSha256!;
  const result = await get(pathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: false,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      "The retained paid result is unavailable.",
      "Ask an administrator to reconcile this view.",
    );
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (bytes.byteLength !== expectedByteSize || sha256(bytes) !== expectedSha256) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The retained paid result did not verify.",
      "Ask an administrator to reconcile this view.",
    );
  }
  const parsedCost = job.costUsd === null ? null : Number(job.costUsd);
  return {
    bytes,
    mimeType,
    usage: job.usage ?? {},
    costUsd: parsedCost !== null && Number.isFinite(parsedCost) && parsedCost >= 0 ? parsedCost : null,
  };
}

function storedValidationEligibility(
  job: MediaCompletionJobRow,
  role: MediaCompletionRole,
): boolean | null {
  const validation = job.sourceValidation;
  if (
    !job.validationResultReceivedAt
    || !validation
    || validation.validationState !== "COMPLETE"
  ) return null;
  const expected = role === "GARMENT_FRONT"
    ? "FULL_FRONT"
    : role === "GARMENT_BACK" ? "FULL_BACK" : "FABRIC_CLOSEUP";
  if (validation.observedRole !== expected) return false;
  return role === "FABRIC_DETAIL"
    ? validation.surfaceResolved === true
    : validation.completeCoverage === true && validation.unobstructed === true;
}

function jobAssetUrl(job: MediaCompletionJobRow): string | undefined {
  if (
    !["COMPLETE", "APPROVED", "REJECTED"].includes(job.state)
    || job.errorCode === "PAID_RESULT_POLICY_BLOCKED"
    || !job.outputBlobPathname
  ) return undefined;
  const target = job.targetKind === "PENDING_PRODUCT"
    ? `/api/studio/pending-products/${encodeURIComponent(job.targetKey)}`
    : `/api/studio/wardrobe/${encodeURIComponent(job.targetKey)}`;
  return `${target}/completions/${job.id}/asset`;
}

function jobSourceMode(job: MediaCompletionJobRow): MediaCompletionSourceMode {
  const parsed = mediaCompletionSourceModeSchema.safeParse(job.sourceValidation?.sourceMode);
  return parsed.success ? parsed.data : "UPLOADED_AUTHORITY";
}

export function operatorSafeMediaCompletionJob(job: MediaCompletionJobRow): OperatorSafeMediaCompletionJob {
  const retainedResultCanResume = job.state === "FAILED"
    && job.errorCode !== "PAID_RESULT_POLICY_BLOCKED"
    && hasRetainedMediaCompletionProviderResult(job);
  const newAttemptAllowed = job.errorCode !== "PAID_RESULT_POLICY_BLOCKED"
    && job.attempt < 2
    && ["COMPLETE", "REJECTED", "FAILED"].includes(job.state);
  return {
    id: job.id,
    role: job.role as MediaCompletionRole,
    sourceMode: jobSourceMode(job),
    state: job.state as OperatorSafeMediaCompletionJob["state"],
    ...(jobAssetUrl(job) ? { assetUrl: jobAssetUrl(job) } : {}),
    attempt: job.attempt as 1 | 2,
    canRetry: retainedResultCanResume || newAttemptAllowed,
    requiresReconciliation: job.state === "INDETERMINATE",
    createdAt: job.createdAt.toISOString(),
    updatedAt: job.updatedAt.toISOString(),
    ...(["PENDING", "RUNNING"].includes(job.state) ? { pollAfterMs: 1_500 } : {}),
  };
}

async function executeCompletion(input: {
  target: ResolvedTarget;
  role: MediaCompletionRole;
  operator: StudioOperator;
  source: PrivateSource;
  sourceMode: MediaCompletionSourceMode;
  correction?: string;
  attempt: 1 | 2;
}): Promise<MediaCompletionJobRow> {
  const correction = normalizedCorrection(input.correction);
  const proposedPrompt = buildMediaCompletionPrompt({
    role: input.role,
    facts: input.target.facts,
    correction,
    sourceMode: input.sourceMode,
  });
  const promptVersion = studioGatewayPolicy.mediaCompletionPromptVersions[input.role];
  const fingerprint = generationFingerprint({
    sourceHashes: [input.source.sha256],
    facts: input.target.facts,
    operation: input.role,
    promptVersion,
    model: studioGatewayPolicy.imageModel,
    parameters: {
      targetKind: input.target.kind,
      targetKey: input.target.key,
      aspectRatio: "4:5",
      authorityConfirmed: input.sourceMode === "UPLOADED_AUTHORITY",
      approvedFrontSelected: input.sourceMode === "APPROVED_FRONT",
      sourceMode: input.sourceMode,
      attempt: input.attempt,
      correction: correction ?? null,
    },
  });
  const existingJobs = await listMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: input.target.kind,
    targetKey: input.target.key,
    role: input.role,
  });
  const latest = existingJobs[0];
  if (latest && latest.fingerprint !== fingerprint && !["FAILED", "REJECTED"].includes(latest.state)) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      latest.state === "APPROVED" ? "That view is already saved." : "Review the current AI view first.",
      latest.state === "APPROVED" ? "Replace it with a direct photo if needed." : "Keep, retry or reject the current view.",
    );
  }
  const job = await createOrReuseMediaCompletionJob({
    operatorSubject: input.operator.subject,
    targetKind: input.target.kind,
    targetKey: input.target.key,
    role: input.role,
    attempt: input.attempt,
    model: studioGatewayPolicy.imageModel,
    promptVersion,
    promptHash: sha256(proposedPrompt),
    fingerprint,
    correction: correction ?? null,
    sourceBlobPathname: input.source.blobPathname,
    sourceMimeType: input.source.mimeType,
    sourceByteSize: input.source.byteSize,
    sourceWidth: input.source.width,
    sourceHeight: input.source.height,
    sourceSha256: input.source.sha256,
    authorityConfirmedAt: new Date(),
    sourceValidation: {
      authorityRole: input.sourceMode === "APPROVED_FRONT" ? "GARMENT_FRONT" : input.role,
      sourceMode: input.sourceMode,
      targetRole: input.role,
      validationState: "PENDING",
    },
  });
  if (job.state !== "PENDING") return job;
  const executionToken = await claimMediaCompletionJob(job.id);
  if (!executionToken) {
    return getOwnedMediaCompletionJob({ id: job.id, operatorSubject: input.operator.subject });
  }
  let validationDispatchStarted = Boolean(job.validationInvocationStartedAt);
  let validationResultCheckpointed = Boolean(job.validationResultReceivedAt);
  let providerDispatchStarted = Boolean(job.providerInvocationStartedAt);
  let providerResultCheckpointed = hasRetainedMediaCompletionProviderResult(job);
  let paidResultPolicyBlocked = false;
  try {
    // A different-source concurrent request can only reuse this attempt slot.
    // Once claimed, execute the authority and correction persisted by the slot
    // winner, never the losing request's in-memory input.
    const source = job.sourceSha256 === input.source.sha256
      && job.sourceBlobPathname === input.source.blobPathname
      ? input.source
      : await readAuthoritySource(job);
    const sourceMode = jobSourceMode(job);
    const persistedCorrection = normalizedCorrection(job.correction ?? undefined);
    const prompt = buildMediaCompletionPrompt({
      role: input.role,
      facts: input.target.facts,
      correction: persistedCorrection,
      sourceMode,
    });
    if (sha256(prompt) !== job.promptHash) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "That AI view can no longer run safely.",
        "Start the next available attempt.",
      );
    }
    const validationRole = sourceMode === "APPROVED_FRONT" ? "GARMENT_FRONT" : input.role;
    let sourceEligible = storedValidationEligibility(job, validationRole);
    if (providerResultCheckpointed) sourceEligible = true;
    if (sourceEligible === null) {
      if (validationDispatchStarted && !validationResultCheckpointed) {
        throw new StudioEngineError(
          "INVALID_TRANSITION",
          409,
          "The source check needs reconciliation.",
          "Ask an administrator to reconcile this view.",
        );
      }
      const validationInvocationStartedAt = new Date();
      if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
        validationInvocationStartedAt,
      }))) {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
      }
      validationDispatchStarted = true;
      const sourceCheck = await validateMediaCompletionSource({
        role: validationRole,
        source: { bytes: source.bytes, mimeType: source.mimeType },
      });
      if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
        validationResultReceivedAt: new Date(),
        sourceValidation: {
          ...sourceCheck.validation,
          authorityRole: validationRole,
          sourceMode,
          targetRole: input.role,
          validationState: "COMPLETE",
        },
        validationUsage: sourceCheck.usage,
        validationCostUsd: sourceCheck.costUsd === null ? null : sourceCheck.costUsd.toFixed(6),
      }))) {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
      }
      validationResultCheckpointed = true;
      sourceEligible = sourceCheck.eligible;
    }
    if (!sourceEligible) {
      const needed = validationRole === "GARMENT_FRONT"
        ? "a clear full-front photo"
        : validationRole === "GARMENT_BACK" ? "a clear full-back photo" : "a clear fabric close-up";
      throw new StudioEngineError(
        "INVALID_ASSET",
        422,
        `This source does not show ${needed}.`,
        sourceMode === "APPROVED_FRONT" ? "Keep a clearer product front first." : "Choose a role-matching source photo.",
      );
    }
    let providerResult: RetainedProviderResult;
    if (providerResultCheckpointed) {
      providerResult = await readRetainedProviderResult(job);
    } else {
      if (providerDispatchStarted) {
        throw new StudioEngineError(
          "INVALID_TRANSITION",
          409,
          "The paid image request needs reconciliation.",
          "Ask an administrator to reconcile this view.",
        );
      }
      if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
        providerInvocationStartedAt: new Date(),
      }))) {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
      }
      providerDispatchStarted = true;
      const generated = await generateMediaCompletionImage({
        prompt,
        source: { bytes: source.bytes, mimeType: source.mimeType },
      });

      // Persist the exact provider bytes before decode, normalization or cost
      // policy. A crash after this checkpoint resumes only local work.
      const rawHash = sha256(generated.bytes);
      const operatorKey = sha256(input.operator.subject).slice(0, 20);
      const rawMimeType = providerResultContentType(generated.mimeType);
      const rawPathname = `studio/operators/${operatorKey}/media-completions/${job.id}/provider-raw/${rawHash}.${providerResultExtension(rawMimeType)}`;
      const storedRawPathname = await putPrivateContentAddressed({
        pathname: rawPathname,
        bytes: generated.bytes,
        mimeType: rawMimeType,
        expectedSha256: rawHash,
        verifyAsStudioImage: false,
      });
      if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
        providerResultReceivedAt: new Date(),
        providerResultBlobPathname: storedRawPathname,
        providerResultMimeType: rawMimeType,
        providerResultByteSize: generated.bytes.byteLength,
        providerResultSha256: rawHash,
        usage: generated.usage,
        costUsd: generated.costUsd === null ? null : generated.costUsd.toFixed(6),
      }))) {
        throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
      }
      providerResultCheckpointed = true;
      providerResult = {
        bytes: generated.bytes,
        mimeType: rawMimeType,
        usage: generated.usage,
        costUsd: generated.costUsd,
      };
    }

    const normalizedBytes = await normalizeGeneratedImage(providerResult.bytes);
    const verified = verifyStudioImage(normalizedBytes, "image/webp");
    const outputHash = sha256(verified.bytes);
    const operatorKey = sha256(input.operator.subject).slice(0, 20);
    const pathname = `studio/operators/${operatorKey}/media-completions/${job.id}/${outputHash}.${verified.extension}`;
    const storedPathname = await putPrivateContentAddressed({
      pathname,
      bytes: verified.bytes,
      mimeType: verified.mimeType,
      expectedSha256: outputHash,
    });
    if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
      outputBlobPathname: storedPathname,
      outputMimeType: verified.mimeType,
      outputByteSize: verified.bytes.byteLength,
      outputWidth: verified.width,
      outputHeight: verified.height,
      outputSha256: outputHash,
      errorCode: null,
    }))) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
    }
    // Materialize the paid result before enforcing accounting policy. Missing
    // or excessive cost then leaves a private failed/quarantined record with
    // recoverable bytes instead of silently losing the provider output.
    if (providerResult.costUsd === null || providerResult.costUsd > studioGatewayPolicy.imageCostCapUsd) {
      paidResultPolicyBlocked = true;
      throw new StudioEngineError(
        "GENERATION_FAILED",
        502,
        "The AI view exceeded the Studio cost policy.",
        "Use the source photo instead.",
      );
    }
    if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
      state: "COMPLETE",
      executionToken: null,
      startedAt: null,
      leaseExpiresAt: null,
    }))) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
    }
  } catch (error) {
    const accounting = error instanceof StudioGatewayError ? error.accounting : null;
    const validationFailure = error instanceof StudioGatewayError && error.upstream.stage === "analysis";
    const requiresReconciliation = (validationDispatchStarted && !validationResultCheckpointed)
      || (providerDispatchStarted && !providerResultCheckpointed);
    await updateRunningMediaCompletionJob(job.id, executionToken, {
      state: requiresReconciliation ? "INDETERMINATE" : "FAILED",
      executionToken: null,
      startedAt: null,
      leaseExpiresAt: null,
      errorCode: requiresReconciliation
        ? "RECONCILIATION_REQUIRED"
        : paidResultPolicyBlocked
          ? "PAID_RESULT_POLICY_BLOCKED"
          : error instanceof StudioEngineError ? error.code : "GENERATION_FAILED",
      ...(accounting?.usage
        ? validationFailure ? { validationUsage: accounting.usage } : { usage: accounting.usage }
        : {}),
      ...(accounting?.costUsd !== null && accounting?.costUsd !== undefined
        ? validationFailure
          ? { validationCostUsd: accounting.costUsd.toFixed(6) }
          : { costUsd: accounting.costUsd.toFixed(6) }
        : {}),
    });
    throw error;
  }
  return getOwnedMediaCompletionJob({ id: job.id, operatorSubject: input.operator.subject });
}

async function resumeRetainedCompletion(input: {
  job: MediaCompletionJobRow;
  target: ResolvedTarget;
  role: MediaCompletionRole;
  operator: StudioOperator;
}): Promise<MediaCompletionJobRow> {
  if (
    !hasRetainedMediaCompletionProviderResult(input.job)
    || input.job.errorCode === "PAID_RESULT_POLICY_BLOCKED"
  ) return input.job;
  if (input.job.state === "FAILED") {
    const requeued = await requeueRetainedMediaCompletionResult({
      id: input.job.id,
      operatorSubject: input.operator.subject,
    });
    if (!requeued) {
      return getOwnedMediaCompletionJob({ id: input.job.id, operatorSubject: input.operator.subject });
    }
  } else if (input.job.state !== "PENDING") {
    return input.job;
  }
  return executeCompletion({
    target: input.target,
    role: input.role,
    operator: input.operator,
    source: await readAuthoritySource(input.job),
    sourceMode: jobSourceMode(input.job),
    correction: input.job.correction ?? undefined,
    attempt: input.job.attempt as 1 | 2,
  });
}

export async function createMediaCompletion(input: {
  target: CompletionTarget;
  role: unknown;
  authorityConfirmed?: unknown;
  correction?: string;
  operator: StudioOperator;
  sourceMode?: unknown;
  bytes?: Uint8Array;
  declaredType?: string;
}): Promise<MediaCompletionResponse> {
  const parsedRole = mediaCompletionRoleSchema.safeParse(input.role);
  if (!parsedRole.success) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a missing product view.", "Choose product front, back or fabric detail.");
  }
  const role = parsedRole.data;
  const parsedSourceMode = mediaCompletionSourceModeSchema.safeParse(input.sourceMode ?? "UPLOADED_AUTHORITY");
  if (!parsedSourceMode.success) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a garment source.", "Open the piece again.");
  }
  const sourceMode = parsedSourceMode.data;
  if (sourceMode === "APPROVED_FRONT" && input.target.kind !== "WARDROBE_ITEM") {
    throw new StudioEngineError("INVALID_REQUEST", 400, "This draft has no approved product front.", "Use Camera or Photos.");
  }
  if (sourceMode === "UPLOADED_AUTHORITY") {
    assertMediaCompletionAuthority(role, input.authorityConfirmed);
    if (!input.bytes) {
      throw new StudioEngineError("INVALID_ASSET", 415, "Choose one authority photo.", "Use Camera or Photos.");
    }
  }
  const target = await resolveTarget(input.target, role, input.operator);
  await recoverStaleMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: target.kind,
    targetKey: target.key,
    role,
  });
  const source = sourceMode === "APPROVED_FRONT"
    ? await readApprovedWardrobeFront(target, input.operator)
    : await storeAuthoritySource({
      operator: input.operator,
      bytes: input.bytes!,
      declaredType: input.declaredType,
    });
  const prior = await listMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: target.kind,
    targetKey: target.key,
    role,
  });
  const latest = prior[0];
  if (
    latest
    && ["PENDING", "FAILED"].includes(latest.state)
    && hasRetainedMediaCompletionProviderResult(latest)
  ) {
    const resumed = await resumeRetainedCompletion({
      job: latest,
      target,
      role,
      operator: input.operator,
    });
    return { job: operatorSafeMediaCompletionJob(resumed) };
  }
  const attempt = latest && ["FAILED", "REJECTED"].includes(latest.state)
    ? latest.attempt + 1
    : latest?.attempt ?? 1;
  if (attempt > 2) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "The retry has already been used.", "Use the source photo instead.");
  }
  const job = await executeCompletion({
    target,
    role,
    operator: input.operator,
    source,
    sourceMode,
    correction: input.correction,
    attempt: attempt as 1 | 2,
  });
  return { job: operatorSafeMediaCompletionJob(job) };
}

export async function readLatestMediaCompletion(input: {
  target: CompletionTarget;
  role: unknown;
  operator: StudioOperator;
}) {
  const parsedRole = mediaCompletionRoleSchema.safeParse(input.role);
  if (!parsedRole.success) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a missing product view.", "Choose product front, back or fabric detail.");
  }
  const target = await resolveTarget(input.target, parsedRole.data, input.operator);
  await recoverStaleMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: target.kind,
    targetKey: target.key,
    role: parsedRole.data,
  });
  const jobs = await listMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: target.kind,
    targetKey: target.key,
    role: parsedRole.data,
  });
  const latest = jobs[0];
  if (latest?.state === "PENDING" && hasRetainedMediaCompletionProviderResult(latest)) {
    const resumed = await resumeRetainedCompletion({
      job: latest,
      target,
      role: parsedRole.data,
      operator: input.operator,
    });
    return { job: operatorSafeMediaCompletionJob(resumed) };
  }
  return { job: latest ? operatorSafeMediaCompletionJob(latest) : null };
}

export async function decideMediaCompletion(input: {
  target: CompletionTarget;
  jobId: string;
  operator: StudioOperator;
  decision: MediaCompletionDecision["decision"];
  correction?: string;
  truthConfirmed?: boolean;
}): Promise<MediaCompletionResponse> {
  const job = await getOwnedMediaCompletionJob({ id: input.jobId, operatorSubject: input.operator.subject });
  const role = mediaCompletionRoleSchema.parse(job.role);
  const target = await resolveTarget(input.target, role, input.operator);
  if (job.targetKind !== target.kind || job.targetKey !== target.key) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That AI view was not found.", "Open the piece again.");
  }
  if (input.decision === "KEEP") {
    const sourceMode = jobSourceMode(job);
    assertMediaCompletionTruthConfirmation(sourceMode, input.decision, input.truthConfirmed);
    const approved = await approveAndPromoteMediaCompletionJob({
      id: job.id,
      operatorSubject: input.operator.subject,
      captureKey: target.captureKey,
      truthConfirmed: input.truthConfirmed === true,
    });
    const workspace = target.kind === "PENDING_PRODUCT"
      ? await getPendingCaptureWorkspace(target.key, input.operator)
      : await getWardrobeCaptureWorkspace(target.key, input.operator);
    return { job: operatorSafeMediaCompletionJob(approved), workspace };
  }
  if (input.decision === "REJECT") {
    return {
      job: operatorSafeMediaCompletionJob(await rejectMediaCompletionJob({
        id: job.id,
        operatorSubject: input.operator.subject,
      })),
    };
  }
  if (job.state === "FAILED" && hasRetainedMediaCompletionProviderResult(job)) {
    if (job.errorCode === "PAID_RESULT_POLICY_BLOCKED") {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "That retained result is blocked by Studio policy.",
        "Ask an administrator to reconcile this view.",
      );
    }
    const resumed = await resumeRetainedCompletion({ job, target, role, operator: input.operator });
    return { job: operatorSafeMediaCompletionJob(resumed) };
  }
  if (job.attempt >= 2 || !["COMPLETE", "FAILED", "REJECTED"].includes(job.state)) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view cannot be retried.", "Use the source photo instead.");
  }
  if (job.state === "COMPLETE") {
    await rejectMediaCompletionJob({ id: job.id, operatorSubject: input.operator.subject });
  }
  const source = await readAuthoritySource(job);
  const sourceMode = jobSourceMode(job);
  const retried = await executeCompletion({
    target,
    role,
    operator: input.operator,
    source,
    sourceMode,
    correction: input.correction,
    attempt: 2,
  });
  return { job: operatorSafeMediaCompletionJob(retried) };
}

export async function readMediaCompletionAsset(input: {
  target: CompletionTarget;
  jobId: string;
  operator: StudioOperator;
}) {
  const job = await getOwnedMediaCompletionJob({ id: input.jobId, operatorSubject: input.operator.subject });
  const role = mediaCompletionRoleSchema.parse(job.role);
  const target = await resolveTarget(input.target, role, input.operator);
  if (
    job.targetKind !== target.kind
    || job.targetKey !== target.key
    || !["COMPLETE", "APPROVED", "REJECTED"].includes(job.state)
    || job.errorCode === "PAID_RESULT_POLICY_BLOCKED"
    || !job.outputBlobPathname
    || !job.outputMimeType
    || !job.outputByteSize
  ) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That AI view was not found.", "Open the piece again.");
  }
  const result = await get(job.outputBlobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "That AI view is unavailable.", "Open the piece again.");
  }
  return { stream: result.stream, mimeType: job.outputMimeType, byteSize: job.outputByteSize };
}
