import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  STUDIO_GPT_IMAGE_2_COST_CAP_USD,
  STUDIO_GPT_IMAGE_2_MODEL,
  studioGptImage2Adapter,
  type StudioGptImage2Reference,
} from "../../lib/ai/studio-gpt-image-2-gateway";
import { StudioGatewayError } from "../../lib/ai/studio-gateway";
import { putVerifiedPrivateContentAddressedBlob } from "../../lib/server/private-content-addressed-blob";
import { resolveLuluV4OperationPack } from "../../lib/server/studio-lulu-v4-operation-packs";
import { verifyStudioImage } from "../../lib/studio/engine/assets";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outputRootDirectory = resolve(
  repositoryRoot,
  process.env.ATELIER_SHADOW_OUTPUT_DIRECTORY
    ?? "storage/virtual-atelier/experiments/g024-v07-gpt-image-2-engine-shadow",
);
const executionId = randomUUID();
const outputDirectory = resolve(outputRootDirectory, executionId);
const operationPath = resolve(outputDirectory, "operation.json");
const candidatePath = resolve(outputDirectory, "candidate-raw.jpg");
const parentPath = resolve(
  repositoryRoot,
  "public/shop/products/black-asymmetric-sculpted-shoulder-mini-dress/04-model-front.webp",
);
const goldPath = resolve(
  repositoryRoot,
  "public/shop/products/black-asymmetric-sculpted-shoulder-mini-dress/05-model-rear-three-quarter.webp",
);
const EXPECTED_PARENT_SHA256 = "89587d8d41d8b4135c07499ff2bd556a198cd10a576db08d34e3107210da8fe7";
const EXPECTED_GOLD_SHA256 = "f81386b0182a8fba623007d6408c57314b36373ff04c1f270103e9b11f8f2f6c";
const dryRun = process.argv.includes("--dry-run");
const explicitlyAuthorizedLiveRun = process.argv.includes("--live");

if (!dryRun && !explicitlyAuthorizedLiveRun) {
  throw new Error("Refusing a paid shadow invocation without the explicit --live flag.");
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeRecord(record: Record<string, unknown>): Promise<void> {
  const temporaryPath = `${operationPath}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await rename(temporaryPath, operationPath);
}

const prompt = [
  "Create one private photorealistic full-body fashion catalogue image of the same adult woman and the same black asymmetric sculpted-shoulder mini dress, now in a soft RIGHT REAR THREE-QUARTER view. This is an independent sibling transformation from the supplied accepted front presentation, not a new person or garment.",
  "REFERENCE ORDER AND AUTHORITY: Image 1 is the same-garment accepted view-05 public derivative and controls the specific subject, dress, shoes, styling, scale and overall photographic treatment. Image 2 is the deterministic, hash-attested fused identity-and-rear authority board: its upper section is the complete real-Lulu identity board and controls facial identity, skin tone, slick low bun and natural human detail; its lower section is the complete rear-operation board and controls the approved balanced silhouette, posture and direct rear/profile evidence. Treat both sections as one authority package without blending their layouts into the output. Preserve the whole person naturally; do not slim, widen or exaggerate any individual feature. Image 3 is the exact empty JUW atelier plate and controls the room, small wall icon, vase, rail, garments, ottoman, rug, warm-neutral palette, perspective and light.",
  "POSE AND CAMERA: rotate the whole person naturally into a right rear three-quarter stance, with the head turned gently enough toward camera to verify identity. Keep her head-to-toe in frame, level camera, believable 70-85 mm catalogue perspective, grounded feet and natural weight distribution. This must not be a straight complete back view and must not crop the feet.",
  "GARMENT TRUTH: preserve the black smooth stretch-knit bodycon mini length, both full-length sleeves, asymmetric sculpted neckline, layered flounce on the wearer's right shoulder and lower off-shoulder attachment on the wearer's left. The supplied evidence is front-family only, so continue the rear conservatively and plainly. Do not invent zips, seams, cut-outs, labels, pockets, fasteners, trim or ornament. Preserve opaque black material, realistic tension, subtle folds and source-supported surface behaviour without plastic sheen.",
  "IMMUTABLES: same Lulu identity and hair; same approved overall proportions; same garment; same minimal black ankle-strap heels, tiny earrings and restrained bracelet; exact JUW room layout and icon. No change to the model's shape, no anatomy distortion, extra fingers or limbs, waxy skin, CGI sheen, text, watermark or logo changes.",
  "OUTPUT: exactly one realistic opaque portrait JPEG. Prioritize natural skin texture, plausible garment drape, clean hands and feet, matched subject/room lighting and quiet premium catalogue realism.",
].join("\n\n");

await mkdir(outputDirectory, { recursive: true });
const [parentBytes, goldBytes, pack] = await Promise.all([
  readFile(parentPath).then((bytes) => new Uint8Array(bytes)),
  readFile(goldPath).then((bytes) => new Uint8Array(bytes)),
  resolveLuluV4OperationPack("SIBLING_07_RECOVERY"),
]);

if (sha256(parentBytes) !== EXPECTED_PARENT_SHA256 || sha256(goldBytes) !== EXPECTED_GOLD_SHA256) {
  throw new Error("The fixed G024 shadow parent or gold comparison derivative changed.");
}
if (
  pack.dynamicReferenceSlots.length !== 1
  || pack.dynamicReferenceSlots[0] !== "ACCEPTED_CURRENT_GARMENT_05"
  || pack.staticReferences.length !== 2
  || pack.staticReferences[0]?.role !== "FUSED_IDENTITY_REAR_RECOVERY_BOARD"
  || pack.staticReferences[1]?.id !== "juw.atelier.empty-plate.v1"
  || pack.physicalReferenceCount !== 3
) {
  throw new Error("The G024 rear-recovery authority pack no longer matches the fused three-reference contract.");
}

const approvalRecordedAt = new Date().toISOString();
const references: StudioGptImage2Reference[] = [
  {
    slot: "IMAGE_1",
    role: "ACCEPTED_05_PUBLIC_DERIVATIVE_SHADOW_ONLY",
    assetId: "garment.024.view.05.accepted.public-derivative",
    sha256: EXPECTED_PARENT_SHA256,
    bytes: parentBytes,
    mimeType: "image/webp",
  },
  ...pack.staticReferences.map((reference, index) => ({
    slot: `IMAGE_${index + 2}`,
    role: reference.role,
    assetId: reference.id,
    sha256: reference.sha256,
    bytes: reference.bytes,
    mimeType: reference.mimeType,
  })),
];
const intent = {
  schemaVersion: 1,
  operationId: `g024-v07-gpt-image-2-engine-shadow-${executionId}`,
  executionId,
  garmentId: "024",
  view: "07",
  stage: "SIBLING_07_RECOVERY",
  status: "INTENT_PERSISTED",
  promotionAllowed: false,
  nonPromotableReason: "The exact locked private G024/05 master is unavailable locally; Image 1 is a Shop derivative.",
  model: STUDIO_GPT_IMAGE_2_MODEL,
  provider: "openai-via-vercel-ai-gateway",
  zeroDataRetention: false,
  privacyApproval: {
    providerRetentionAcknowledged: true,
    approvalRecordedAt,
    basis: "User explicitly authorized testing the private Lulu V4 authorities with OpenAI GPT Image 2 through Vercel AI Gateway in this Codex task.",
  },
  authorityRevision: pack.revision,
  orderedReferences: references.map((reference, index) => ({
    slot: index + 1,
    role: reference.role,
    assetId: reference.assetId,
    sha256: reference.sha256,
  })),
  goldComparison: {
    assetId: "garment.024.view.07.accepted.public-derivative",
    sha256: EXPECTED_GOLD_SHA256,
    generationReference: false,
  },
  prompt,
  promptSha256: sha256(new TextEncoder().encode(prompt)),
  createdAt: approvalRecordedAt,
};
await writeRecord(intent);

if (dryRun) {
  console.log(JSON.stringify({
    status: "DRY_RUN_READY",
    operationPath,
    physicalReferenceCount: references.length,
    authorityRevision: pack.revision,
  }, null, 2));
  process.exit(0);
}

try {
  const result = await studioGptImage2Adapter.invoke({
    executionId,
    garmentId: "024",
    view: "07",
    operationType: "SIBLING_07_RECOVERY",
    prompt,
    references,
    operatorSubject: process.env.ATELIER_SHADOW_OPERATOR_SUBJECT ?? "codex-user-authorized-g024-shadow",
    privacy: {
      containsPrivateIdentity: true,
      providerRetentionAcknowledged: true,
      approvalRecordedAt,
    },
  });

  const raw = result.images[0];
  if (!raw) throw new Error("Gateway returned no image bytes.");

  // Every returned paid byte becomes immutable private evidence before cost,
  // warning, model, decode, geometry or visual policy is evaluated.
  const rawArtifacts = await Promise.all(result.images.map(async (image) => {
    const blob = await putVerifiedPrivateContentAddressedBlob({
      bytes: image.bytes,
      mimeType: image.mimeType,
      namespace: `studio/atelier/shadow/g024-v07/${executionId}/raw`,
      maximumBytes: 128 * 1024 * 1024,
      allowOpaqueFallback: true,
    });
    const localPath = image.ordinal === 0
      ? candidatePath
      : resolve(outputDirectory, `candidate-raw-${image.ordinal}.bin`);
    await writeFile(localPath, image.bytes);
    return {
      ordinal: image.ordinal,
      sha256: sha256(image.bytes),
      providerMimeType: image.mimeType,
      storedMimeType: blob.mimeType,
      privateBlobPathname: blob.pathname,
      byteSize: blob.byteSize,
      localPath,
    };
  }));

  const gateFailures: string[] = [];
  if (result.images.length !== 1) gateFailures.push("IMAGE_COUNT_MISMATCH");
  if (result.costUsd === null) gateFailures.push("MISSING_GATEWAY_COST");
  if (result.costUsd !== null && result.costUsd > STUDIO_GPT_IMAGE_2_COST_CAP_USD) {
    gateFailures.push("COST_CAP_EXCEEDED");
  }
  if (!result.usage || Object.keys(result.usage).length === 0) {
    gateFailures.push("MISSING_GATEWAY_USAGE");
  }
  if (result.warnings.length > 0) gateFailures.push("PROVIDER_WARNING");
  if (result.servedModels.length === 0 || result.servedModels.some((model) => model !== STUDIO_GPT_IMAGE_2_MODEL)) {
    gateFailures.push("SERVED_MODEL_MISMATCH");
  }

  let technical: Record<string, unknown>;
  try {
    const verified = verifyStudioImage(raw.bytes, raw.mimeType);
    technical = {
      sha256: sha256(raw.bytes),
      mimeType: verified.mimeType,
      width: verified.width,
      height: verified.height,
    };
    if (verified.mimeType !== "image/jpeg" || verified.width !== 1024 || verified.height !== 1536) {
      gateFailures.push("OUTPUT_CONTRACT_MISMATCH");
    }
  } catch {
    technical = { sha256: sha256(raw.bytes), decode: "FAILED" };
    gateFailures.push("INVALID_PROVIDER_IMAGE");
  }

  const terminal = {
    ...intent,
    status: gateFailures.length === 0 ? "READY_FOR_PRIVATE_VISUAL_REVIEW" : "QUARANTINED",
    completedAt: new Date().toISOString(),
    paidOutputRetainedBeforePolicy: true,
    rawArtifact: {
      ...technical,
      ...rawArtifacts[0],
    },
    rawArtifacts,
    accounting: {
      costUsd: result.costUsd,
      usage: result.usage,
      durationMs: result.durationMs,
    },
    providerEvidence: {
      requestedModel: result.requestedModel,
      servedModels: result.servedModels,
      warnings: result.warnings,
      responses: result.responses,
      gatewayGenerationId: result.gatewayGenerationId,
      requestId: result.requestId,
    },
    gateFailures,
    visualReview: null,
  };
  await writeRecord(terminal);
  console.log(JSON.stringify({
    status: terminal.status,
    operationPath,
    candidatePath,
    outputSha256: technical.sha256,
    costUsd: result.costUsd,
    gateFailures,
  }, null, 2));
} catch (error) {
  const gatewayFailure = error instanceof StudioGatewayError ? {
    upstream: error.upstream,
    accounting: error.accounting,
    durationMs: error.durationMs,
  } : null;
  await writeRecord({
    ...intent,
    status: "INDETERMINATE_PROVIDER_RESULT",
    failedAt: new Date().toISOString(),
    automaticRetryAllowed: false,
    failureClass: error instanceof Error ? error.name : "UnknownError",
    gatewayFailure,
  });
  throw error;
}
