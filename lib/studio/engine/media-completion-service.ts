import { get } from "@vercel/blob";
import sharp from "sharp";
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
  listMediaCompletionJobs,
  recoverStaleMediaCompletionJobs,
  rejectMediaCompletionJob,
  updateRunningMediaCompletionJob,
  type MediaCompletionJobRow,
} from "../../server/studio-media-completion-repository";
import { getOwnedWardrobeItem } from "../../server/studio-intake-repository";
import type { StudioOperator } from "../../server/studio-operator";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import type { IntakeFacts } from "./contracts";
import { verifyStudioImage } from "./assets";
import { StudioEngineError } from "./errors";
import { generationFingerprint, sha256 } from "./fingerprint";
import {
  assertMediaCompletionAuthority,
  mediaCompletionRoleSchema,
  type MediaCompletionDecision,
  type MediaCompletionResponse,
  type MediaCompletionRole,
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

const sharpImage = sharp as unknown as (bytes: Uint8Array) => SharpPipeline;

function intakeCategory(value: string): IntakeFacts["category"] {
  return (["Dress", "Shirt", "Set", "Knitwear", "Skirt", "Trousers", "Other"] as const)
    .find((category) => category === value) ?? "Other";
}

async function putPrivateContentAddressed(input: {
  pathname: string;
  bytes: Uint8Array;
  mimeType: string;
  expectedSha256: string;
}) {
  const readExact = async () => {
    const found = await get(input.pathname, {
      access: "private",
      token: getShopBlobToken("private"),
      useCache: false,
    });
    if (!found || found.statusCode !== 200) return null;
    const bytes = new Uint8Array(await new Response(found.stream).arrayBuffer());
    return sha256(verifyStudioImage(bytes, found.blob.contentType).bytes) === input.expectedSha256
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

function jobAssetUrl(job: MediaCompletionJobRow): string | undefined {
  if (!job.outputBlobPathname) return undefined;
  const target = job.targetKind === "PENDING_PRODUCT"
    ? `/api/studio/pending-products/${encodeURIComponent(job.targetKey)}`
    : `/api/studio/wardrobe/${encodeURIComponent(job.targetKey)}`;
  return `${target}/completions/${job.id}/asset`;
}

export function operatorSafeMediaCompletionJob(job: MediaCompletionJobRow): OperatorSafeMediaCompletionJob {
  return {
    id: job.id,
    role: job.role as MediaCompletionRole,
    state: job.state as OperatorSafeMediaCompletionJob["state"],
    ...(jobAssetUrl(job) ? { assetUrl: jobAssetUrl(job) } : {}),
    attempt: job.attempt as 1 | 2,
    canRetry: job.attempt < 2 && ["COMPLETE", "REJECTED", "FAILED"].includes(job.state),
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
  correction?: string;
  attempt: 1 | 2;
}): Promise<MediaCompletionJobRow> {
  const correction = normalizedCorrection(input.correction);
  const proposedPrompt = buildMediaCompletionPrompt({ role: input.role, facts: input.target.facts, correction });
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
      authorityConfirmed: true,
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
  });
  if (job.state !== "PENDING") return job;
  const executionToken = await claimMediaCompletionJob(job.id);
  if (!executionToken) {
    return getOwnedMediaCompletionJob({ id: job.id, operatorSubject: input.operator.subject });
  }
  try {
    // A different-source concurrent request can only reuse this attempt slot.
    // Once claimed, execute the authority and correction persisted by the slot
    // winner, never the losing request's in-memory input.
    const source = job.sourceSha256 === input.source.sha256
      && job.sourceBlobPathname === input.source.blobPathname
      ? input.source
      : await readAuthoritySource(job);
    const persistedCorrection = normalizedCorrection(job.correction ?? undefined);
    const prompt = buildMediaCompletionPrompt({
      role: input.role,
      facts: input.target.facts,
      correction: persistedCorrection,
    });
    if (sha256(prompt) !== job.promptHash) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "That AI view can no longer run safely.",
        "Start the next available attempt.",
      );
    }
    const sourceCheck = await validateMediaCompletionSource({
      role: input.role,
      source: { bytes: source.bytes, mimeType: source.mimeType },
    });
    if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
      sourceValidation: sourceCheck.validation,
      validationUsage: sourceCheck.usage,
      validationCostUsd: sourceCheck.costUsd === null ? null : sourceCheck.costUsd.toFixed(6),
    }))) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
    }
    if (!sourceCheck.eligible) {
      const needed = input.role === "GARMENT_FRONT"
        ? "a clear full-front photo"
        : input.role === "GARMENT_BACK" ? "a clear full-back photo" : "a clear fabric close-up";
      throw new StudioEngineError(
        "INVALID_ASSET",
        422,
        `This source does not show ${needed}.`,
        "Choose a role-matching source photo.",
      );
    }
    const generated = await generateMediaCompletionImage({
      prompt,
      source: { bytes: source.bytes, mimeType: source.mimeType },
    });
    if (!(await updateRunningMediaCompletionJob(job.id, executionToken, {
      usage: generated.usage,
      costUsd: generated.costUsd === null ? null : generated.costUsd.toFixed(6),
    }))) {
      throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view stopped safely.", "Open the latest view.");
    }
    if (generated.costUsd === null || generated.costUsd > studioGatewayPolicy.imageCostCapUsd) {
      throw new StudioEngineError(
        "GENERATION_FAILED",
        502,
        "The AI view exceeded the Studio cost policy.",
        "Use the source photo instead.",
      );
    }
    const normalizedBytes = new Uint8Array(await sharpImage(generated.bytes)
      .rotate()
      .toColourspace("srgb")
      .webp({ quality: 92, alphaQuality: 100, effort: 4 })
      .toBuffer());
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
      state: "COMPLETE",
      executionToken: null,
      startedAt: null,
      leaseExpiresAt: null,
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
  } catch (error) {
    const accounting = error instanceof StudioGatewayError ? error.accounting : null;
    const validationFailure = error instanceof StudioGatewayError && error.upstream.stage === "analysis";
    await updateRunningMediaCompletionJob(job.id, executionToken, {
      state: "FAILED",
      executionToken: null,
      startedAt: null,
      leaseExpiresAt: null,
      errorCode: error instanceof StudioEngineError ? error.code : "GENERATION_FAILED",
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

export async function createMediaCompletion(input: {
  target: CompletionTarget;
  role: unknown;
  authorityConfirmed: unknown;
  correction?: string;
  operator: StudioOperator;
  bytes: Uint8Array;
  declaredType?: string;
}): Promise<MediaCompletionResponse> {
  const parsedRole = mediaCompletionRoleSchema.safeParse(input.role);
  if (!parsedRole.success) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "Choose a missing product view.", "Choose product front, back or fabric detail.");
  }
  const role = parsedRole.data;
  assertMediaCompletionAuthority(role, input.authorityConfirmed);
  const target = await resolveTarget(input.target, role, input.operator);
  await recoverStaleMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: target.kind,
    targetKey: target.key,
    role,
  });
  const source = await storeAuthoritySource({
    operator: input.operator,
    bytes: input.bytes,
    declaredType: input.declaredType,
  });
  const prior = await listMediaCompletionJobs({
    operatorSubject: input.operator.subject,
    targetKind: target.kind,
    targetKey: target.key,
    role,
  });
  const latest = prior[0];
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
  return { job: jobs[0] ? operatorSafeMediaCompletionJob(jobs[0]) : null };
}

export async function decideMediaCompletion(input: {
  target: CompletionTarget;
  jobId: string;
  operator: StudioOperator;
  decision: MediaCompletionDecision["decision"];
  correction?: string;
}): Promise<MediaCompletionResponse> {
  const job = await getOwnedMediaCompletionJob({ id: input.jobId, operatorSubject: input.operator.subject });
  const role = mediaCompletionRoleSchema.parse(job.role);
  const target = await resolveTarget(input.target, role, input.operator);
  if (job.targetKind !== target.kind || job.targetKey !== target.key) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That AI view was not found.", "Open the piece again.");
  }
  if (input.decision === "KEEP") {
    const approved = await approveAndPromoteMediaCompletionJob({
      id: job.id,
      operatorSubject: input.operator.subject,
      captureKey: target.captureKey,
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
  if (job.attempt >= 2 || !["COMPLETE", "FAILED", "REJECTED"].includes(job.state)) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "That AI view cannot be retried.", "Use the source photo instead.");
  }
  if (job.state === "COMPLETE") {
    await rejectMediaCompletionJob({ id: job.id, operatorSubject: input.operator.subject });
  }
  const source = await readAuthoritySource(job);
  const retried = await executeCompletion({
    target,
    role,
    operator: input.operator,
    source,
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
