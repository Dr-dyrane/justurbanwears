import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { GetBlobResult, PutBlobResult } from "@vercel/blob";
import {
  putVerifiedPrivateContentAddressedBlob,
  type PrivateContentAddressedBlobStore,
} from "../lib/server/private-content-addressed-blob";
import {
  areAtelierDeclarationReceiptsCompatible,
  areAtelierTruthReceiptsCompatible,
  assertAtelierProviderFailureManifest,
  assertAtelierLifecycleTransition,
  createAtelierProviderFailureManifest,
  sanitizeAtelierProviderResponses,
} from "../lib/server/studio-atelier-repository";
import { ATELIER_STAGE_RECIPES } from "../lib/studio/atelier/contracts";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

type StoredObject = { bytes: Uint8Array; contentType: string };

class MemoryPrivateBlobStore implements PrivateContentAddressedBlobStore {
  readonly objects = new Map<string, StoredObject>();
  puts = 0;

  async get(pathname: string): Promise<GetBlobResult | null> {
    const object = this.objects.get(pathname);
    if (!object) return null;
    const bytes = object.bytes.slice();
    return {
      statusCode: 200,
      stream: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(bytes);
          controller.close();
        },
      }),
      headers: new Headers(),
      blob: {
        url: `https://private.example/${pathname}`,
        downloadUrl: `https://private.example/${pathname}?download=1`,
        pathname,
        contentDisposition: "inline",
        cacheControl: "public, max-age=31536000, immutable",
        uploadedAt: new Date("2026-08-25T00:00:00.000Z"),
        etag: "test-etag",
        contentType: object.contentType,
        size: bytes.byteLength,
      },
    };
  }

  async put(input: {
    pathname: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<PutBlobResult> {
    this.puts += 1;
    if (this.objects.has(input.pathname)) throw new Error("immutable conflict");
    this.objects.set(input.pathname, { bytes: input.body.slice(), contentType: input.contentType });
    return {
      url: `https://private.example/${input.pathname}`,
      downloadUrl: `https://private.example/${input.pathname}?download=1`,
      pathname: input.pathname,
      contentType: input.contentType,
      contentDisposition: "inline",
      etag: "test-etag",
    };
  }
}

test("private content-addressed outputs are immutable, deduplicated and verified by read-back", async () => {
  const store = new MemoryPrivateBlobStore();
  const bytes = new TextEncoder().encode("paid provider artifact");
  const expectedHash = createHash("sha256").update(bytes).digest("hex");
  const first = await putVerifiedPrivateContentAddressedBlob({
    bytes,
    mimeType: "image/png",
    namespace: "studio/atelier/test",
    store,
  });
  const second = await putVerifiedPrivateContentAddressedBlob({
    bytes,
    mimeType: "image/png",
    namespace: "studio/atelier/test",
    store,
  });

  assert.equal(first.sha256, expectedHash);
  assert.match(first.pathname, new RegExp(`${expectedHash}[.]png$`));
  assert.deepEqual(second, first);
  assert.equal(store.puts, 1, "an identical artifact reuses its verified immutable object");

  store.objects.set(first.pathname, {
    bytes: new TextEncoder().encode("corrupted bytes"),
    contentType: "image/png",
  });
  await assert.rejects(
    putVerifiedPrivateContentAddressedBlob({ bytes, mimeType: "image/png", namespace: "studio/atelier/test", store }),
    /failed verification/,
  );
  assert.equal(store.puts, 1, "a hash-path mismatch is never overwritten");
});

test("a concurrent immutable upload race converges only after exact read-back", async () => {
  const store = new MemoryPrivateBlobStore();
  const originalPut = store.put.bind(store);
  store.put = async (input) => {
    await originalPut(input);
    throw new Error("simulated create race");
  };
  const bytes = new TextEncoder().encode("race-safe output");
  const result = await putVerifiedPrivateContentAddressedBlob({
    bytes,
    mimeType: "image/webp",
    store,
  });
  assert.equal(result.byteSize, bytes.byteLength);
  assert.equal(store.puts, 1);
});

test("an anomalous paid MIME can be retained as opaque private bytes", async () => {
  const store = new MemoryPrivateBlobStore();
  const bytes = new TextEncoder().encode("paid bytes with an untrusted provider type");
  const result = await putVerifiedPrivateContentAddressedBlob({
    bytes,
    mimeType: "image/provider-surprise",
    allowOpaqueFallback: true,
    namespace: "studio/atelier/raw-fallback",
    store,
  });

  assert.equal(result.mimeType, "application/octet-stream");
  assert.match(result.pathname, /[.]bin$/);
  assert.equal(result.byteSize, bytes.byteLength);
});

test("provider response persistence retains request diagnostics but strips credentials", () => {
  const sanitized = sanitizeAtelierProviderResponses([{
    modelId: "openai/gpt-image-2",
    timestamp: "2026-08-25T01:02:03.000Z",
    headers: {
      authorization: "Bearer must-not-persist",
      cookie: "session=must-not-persist",
      "set-cookie": "must-not-persist",
      "x-request-id": "req_openai_123",
      "x-vercel-id": "sfo1::iad1::gateway",
    },
  }]);
  assert.deepEqual(sanitized.requestIds, ["req_openai_123"]);
  assert.deepEqual(sanitized.responses, [{
    modelId: "openai/gpt-image-2",
    timestamp: "2026-08-25T01:02:03.000Z",
    headers: {
      "x-request-id": "req_openai_123",
      "x-vercel-id": "sfo1::iad1::gateway",
    },
  }]);
  assert.doesNotMatch(JSON.stringify(sanitized), /Bearer|cookie|session/);
});

test("repeat prepare accepts a fresh verification timestamp but never a different truth bundle", () => {
  const existing = {
    sourceHash: "a".repeat(64),
    schemaVersion: "juw.studio-atelier-declaration.v1",
    validatorRevision: "validator-v1",
    fileVerification: {
      status: "PASS",
      receiptHash: "b".repeat(64),
      verifiedAssetCount: 3,
      verifiedAt: "2026-08-26T00:00:00.000Z",
      manifestHash: "c".repeat(64),
    },
  };
  const repeated = {
    ...existing,
    fileVerification: {
      ...existing.fileVerification,
      receiptHash: "d".repeat(64),
      verifiedAssetCount: 4,
      verifiedAt: "2026-08-26T01:00:00.000Z",
    },
  };
  assert.equal(areAtelierDeclarationReceiptsCompatible(existing, repeated), true);
  assert.equal(areAtelierDeclarationReceiptsCompatible(existing, {
    ...repeated,
    fileVerification: {
      ...repeated.fileVerification,
      manifestHash: "9".repeat(64),
    },
  }), false);
  assert.equal(areAtelierDeclarationReceiptsCompatible({
    ...existing,
    fileVerification: {
      ...existing.fileVerification,
      manifestHash: undefined,
    },
  }, repeated), false);

  const truth = {
    bundleVersion: "atelier-truth-v1",
    stateFileHash: "e".repeat(64),
    manifestRevision: "authority-v6",
    manifestHash: "f".repeat(64),
    garmentTruthRevision: "garment-024-v1",
    garmentTruthSourceHash: "8".repeat(64),
  };
  assert.equal(areAtelierTruthReceiptsCompatible(truth, truth), true);
  assert.equal(areAtelierTruthReceiptsCompatible(truth, {
    ...truth,
    stateFileHash: "0".repeat(64),
  }), false);
  assert.equal(areAtelierTruthReceiptsCompatible(truth, {
    ...truth,
    garmentTruthSourceHash: "7".repeat(64),
  }), false);
});

test("review transitions fail closed before semantic approval and correction authorization", () => {
  const projection = (state: string, correctionAuthorized = false) => ({
    state,
    correctionAuthorized,
  });
  const command = (eventType: string, reasonCode?: string) => ({ eventType, reasonCode });
  assert.doesNotThrow(() => assertAtelierLifecycleTransition(
    projection("MATERIALIZED") as never,
    command("TECHNICAL_FAIL", "GEOMETRY_MISMATCH") as never,
  ));
  assert.throws(() => assertAtelierLifecycleTransition(
    projection("TECHNICAL_FAIL") as never,
    command("SEMANTIC_PASS") as never,
  ), /cannot follow/);
  assert.throws(() => assertAtelierLifecycleTransition(
    projection("TECHNICAL_PASS") as never,
    command("USER_APPROVED") as never,
  ), /cannot follow/);
  assert.doesNotThrow(() => assertAtelierLifecycleTransition(
    projection("SEMANTIC_PASS") as never,
    command("USER_APPROVED") as never,
  ));
  assert.throws(() => assertAtelierLifecycleTransition(
    projection("USER_REJECTED") as never,
    command("LOCKED") as never,
  ), /cannot follow/);
  assert.doesNotThrow(() => assertAtelierLifecycleTransition(
    projection("USER_APPROVED") as never,
    command("LOCKED") as never,
  ));
  assert.doesNotThrow(() => assertAtelierLifecycleTransition(
    projection("SEMANTIC_FAIL") as never,
    command("CORRECTION_AUTHORIZED") as never,
  ));
  assert.throws(() => assertAtelierLifecycleTransition(
    projection("SEMANTIC_FAIL", true) as never,
    command("CORRECTION_AUTHORIZED") as never,
  ), /already authorized/);
  assert.doesNotThrow(() => assertAtelierLifecycleTransition(
    projection("DRAFT") as never,
    {
      eventType: "BLOCKED_USER_DIRECTION",
      actorSubject: "system:atelier-execution",
      executionId: "00000000-0000-4000-8000-000000000001",
      reasonCode: "EXECUTION_INDETERMINATE:LEASE_EXPIRED_AFTER_DISPATCH",
    } as never,
  ));
  assert.throws(() => assertAtelierLifecycleTransition(
    projection("DRAFT") as never,
    {
      eventType: "BLOCKED_USER_DIRECTION",
      actorSubject: "operator",
      executionId: "00000000-0000-4000-8000-000000000001",
      reasonCode: "EXECUTION_INDETERMINATE:LEASE_EXPIRED_AFTER_DISPATCH",
    } as never,
  ), /only by a bound terminal execution/);
});

test("durable parent resolution preserves all four exact garment locks and their source lineage", async () => {
  assert.deepEqual(ATELIER_STAGE_RECIPES.SUBJECT_A.parentRoles, [
    "GARMENT_FRONT_LOCK",
    "GARMENT_BACK_LOCK",
    "MANNEQUIN_FRONT_LOCK",
    "FABRIC_DETAIL_LOCK",
  ]);
  const repository = await source("lib/server/studio-atelier-repository.ts");
  const start = repository.indexOf("export async function resolveAtelierParentLocks");
  const end = repository.indexOf("export async function finalizeAtelierExecution", start);
  assert.ok(start >= 0 && end > start, "the durable parent resolver must remain a named boundary");
  const resolver = repository.slice(start, end);

  assert.match(resolver, /for \(const request of input\.requested\)/);
  assert.match(resolver, /eq\(studioAtelierOperationProjections\.state, "LOCKED"\)/);
  assert.match(resolver, /eq\(studioAtelierOperationProjections\.lockedAssetId, request\.assetId\)/);
  assert.match(resolver, /eq\(studioAtelierOperationProjections\.lockedArtifactSha256, request\.sha256\)/);
  assert.match(resolver, /role: request\.role/);
  assert.match(resolver, /sourceStage: match\.operation\.stage/);
  assert.match(resolver, /sourceView: match\.operation\.view/);
  assert.match(resolver, /reviewState: "LOCKED"/);
  assert.match(resolver, /lockedLayer: descriptor\.lockedLayer/);
  assert.match(resolver, /return resolved/);
});

test("provider moderation failure evidence is strict, hash-bound and atomically terminalized", async () => {
  const manifest = createAtelierProviderFailureManifest({
    requestedModel: "openai/gpt-image-2",
    moderationStage: "output",
    categories: ["sexual"],
    gatewayGenerationId: "gen-moderated",
    requestId: "req-moderated",
  });
  assert.doesNotThrow(() => assertAtelierProviderFailureManifest(manifest));
  assert.equal(manifest.outcome, "NO_OUTPUT");
  assert.equal(manifest.manifestSha256.length, 64);
  assert.deepEqual(manifest.moderation, {
    stage: "output",
    categories: ["sexual"],
    noOutput: true,
  });
  assert.equal(Object.hasOwn(manifest, "images"), false);

  assert.throws(
    () => assertAtelierProviderFailureManifest({
      ...manifest,
      moderation: { ...manifest.moderation, stage: "input" },
    }),
    /hash is invalid/i,
  );
  assert.throws(
    () => assertAtelierProviderFailureManifest({
      ...manifest,
      rawResponse: "must not persist",
    } as never),
    /manifest is invalid/i,
  );

  const repository = await source("lib/server/studio-atelier-repository.ts");
  const start = repository.indexOf("export async function finalizeAtelierExecution");
  const end = repository.indexOf("export async function recoverExpiredAtelierExecutions", start);
  assert.ok(start >= 0 && end > start, "execution finalization must remain a named atomic boundary");
  const finalizer = repository.slice(start, end);
  assert.match(finalizer, /provider_result_received_at = case/);
  assert.match(finalizer, /provider_result_manifest = case/);
  assert.match(finalizer, /set state = \$\{input\.state\}/);
  assert.match(finalizer, /execution\.provider_invocation_started_at is not null/);
  assert.match(finalizer, /execution\.provider_result_received_at is null/);
  assert.match(finalizer, /execution\.provider_result_manifest is null/);
  assert.match(finalizer, /not exists \(\s*select 1 from studio_atelier_artifacts artifact/);
});

test("0016 adds an isolated, fenced and lossless Atelier persistence contract", async () => {
  const [schema, migration, snapshot, repository, executionService, blobHelper] = await Promise.all([
    source("db/shop-postgres-schema.ts"),
    source("drizzle/shop-postgres/0016_studio_atelier_ledger.sql"),
    source("drizzle/shop-postgres/meta/0016_snapshot.json"),
    source("lib/server/studio-atelier-repository.ts"),
    source("lib/server/studio-atelier-execution-service.ts"),
    source("lib/server/private-content-addressed-blob.ts"),
  ]);

  for (const table of [
    "studio_atelier_operations",
    "studio_atelier_executions",
    "studio_atelier_artifacts",
    "studio_atelier_operation_projections",
    "studio_atelier_events",
  ]) {
    assert.match(migration, new RegExp(`CREATE TABLE "${table}"`));
  }
  assert.match(schema, /compiledPrompt: text\("compiled_prompt"\)/);
  assert.match(schema, /orderedBindings: jsonb\("ordered_bindings"\)/);
  assert.match(schema, /contractVersion: varchar\("contract_version"/);
  assert.match(schema, /workflowRevision: varchar\("workflow_revision"/);
  assert.match(schema, /canonicalOperation: jsonb\("canonical_operation"\)/);
  assert.match(schema, /declarationReceipt: jsonb\("declaration_receipt"\)/);
  assert.match(schema, /truthReceipt: jsonb\("truth_receipt"\)/);
  assert.match(schema, /sanitizedResponses: jsonb\("sanitized_responses"\)/);
  assert.match(schema, /requestIds: jsonb\("request_ids"\)/);
  assert.match(schema, /durationMs: integer\("duration_ms"\)/);
  assert.match(schema, /studio_atelier_operations_change_array/);
  assert.match(schema, /studio_atelier_operations_immutable_array/);
  assert.match(schema, /'QUARANTINED', 'INDETERMINATE'/);
  assert.match(migration, /studio_atelier_executions_lease/);
  assert.match(migration, /studio_atelier_artifacts_content_addressed/);
  assert.match(migration, /studio_atelier_artifacts_execution_kind_ordinal_unique/);
  assert.match(migration, /"execution_id","kind","ordinal"/);
  assert.match(schema, /studio_atelier_executions_active_operation_unique/);
  assert.match(schema, /\.where\(sql`\$\{table\.state\} in \('RUNNING', 'PERSISTING'\)`\)/);
  assert.match(migration, /studio_atelier_executions_active_operation_unique/);
  assert.match(migration, /WHERE "studio_atelier_executions"\."state" in \('RUNNING', 'PERSISTING'\)/);
  assert.match(snapshot, /studio_atelier_executions_active_operation_unique/);
  assert.match(repository, /createAtelierExecutionIntent/);
  assert.match(repository, /lease_fence = \$\{input\.lease\.leaseFence\}/);
  assert.match(repository, /on conflict \(execution_id, kind, ordinal\) do nothing/);
  assert.match(repository, /eq\(studioAtelierArtifacts\.kind, input\.kind\)/);
  assert.match(repository, /execution\.lease_expires_at > now\(\)/);
  assert.match(repository, /SAFE_PRE_DISPATCH_REQUEUE/);
  assert.match(repository, /UNCERTAIN_PROVIDER_INVOCATION/);
  assert.match(repository, /COMPLETE_RAW_RESUME/);
  assert.match(repository, /INCOMPLETE_MATERIALIZATION/);
  assert.match(repository, /getLatestAtelierExecutionForOperation/);
  assert.match(repository, /studioAtelierOperations\.operatorSubject, input\.operatorSubject/);
  assert.match(repository, /DRAFT block is not bound to a terminal execution/);
  assert.match(repository, /checkpointAtelierProviderInvocationStarted/);
  assert.match(repository, /checkpointAtelierProviderResult/);
  assert.match(repository, /blob: VerifiedPrivateBlob/);
  assert.match(repository, /expected->'blob'->>'pathname'/);
  assert.match(schema, /fileVerification'->>'manifestHash'/);
  assert.match(migration, /fileVerification'->>'manifestHash'/);
  assert.match(schema, /garmentTruthRevision/);
  assert.match(schema, /garmentTruthSourceHash/);
  assert.match(migration, /garmentTruthRevision/);
  assert.match(migration, /garmentTruthSourceHash/);
  assert.match(repository, /isActiveExecutionUniqueConflict/);
  assert.match(repository, /parseDatabaseTimestamp/);
  assert.match(repository, /byOperationKey/);
  assert.match(repository, /bySemanticHash/);
  assert.match(repository, /operation\.state <> 'COMPLETE'/);
  assert.match(repository, /artifact\.kind = 'PROVIDER_RAW'/);
  assert.match(repository, /artifact\.kind in \('NORMALIZED', 'COMPOSITE'\)/);
  assert.match(repository, /\? "COMPOSITE"\s*: "NORMALIZED"/);
  assert.doesNotMatch(repository, /recordApprovedAtelierComposite/);
  assert.match(repository, /set state = 'QUARANTINED', quarantine_reason = \$\{errorCode\}/);
  assert.match(repository, /when operation\.state = 'COMPLETE' or projection\.state = 'COMPLETE'/);
  assert.match(repository, /when operation\.state = 'QUARANTINED' or projection\.state = 'QUARANTINED'/);
  assert.match(repository, /when operation\.state = 'INDETERMINATE' or projection\.state = 'INDETERMINATE'/);
  assert.match(repository, /where projection\.operation_id = \$\{input\.operationId\}::uuid/);
  assert.match(repository, /and projection\.version = \$\{input\.expectedVersion\}/);
  assert.match(executionService, /await dependencies\.recoverExpiredExecutions\(/);
  assert.match(schema, /studio_atelier_operations_one_correction_per_root_unique/);
  assert.match(migration, /studio_atelier_operations_one_correction_per_root_unique/);
  assert.match(migration, /'SUBJECT_LAYER', 'COMPOSITE'/);
  assert.match(migration, /'TECHNICAL_PASS', 'TECHNICAL_FAIL'/);
  for (const identityField of [
    "semanticOperationHash",
    "adapterId",
    "adapterVersion",
    "provider",
    "model",
    "modelRevision",
    "preprocessingVersion",
    "seed",
    "sampler",
    "providerPolicyRevision",
  ]) {
    assert.match(executionService, new RegExp(`${identityField}:`));
  }
  assert.match(blobHelper, /allowOverwrite: false/);
  assert.match(blobHelper, /addRandomSuffix: false/);
  assert.match(blobHelper, /readVerified/);

  assert.doesNotMatch(repository, /studioGenerations|studioMediaCompletionJobs/);
  assert.doesNotMatch(schema.slice(schema.indexOf("studioAtelierOperations")), /references\(\(\) => studioGenerations/);
});

test("migration snapshots isolate the media and Atelier deltas with exact ancestry", async () => {
  const [snapshot14, snapshot15, snapshot16] = await Promise.all([
    source("drizzle/shop-postgres/meta/0014_snapshot.json"),
    source("drizzle/shop-postgres/meta/0015_snapshot.json"),
    source("drizzle/shop-postgres/meta/0016_snapshot.json"),
  ]);
  const snapshots = [snapshot14, snapshot15, snapshot16].map((value) => JSON.parse(value)) as Array<{
    id: string;
    prevId: string;
    [key: string]: unknown;
  }>;
  const [legacy, media, atelier] = snapshots;
  assert.equal(legacy.id, "6505bedf-132c-4488-9d09-50456217457f");
  assert.equal(legacy.prevId, "c804301c-05b8-4c38-880a-6edf8a2f7d17");
  assert.equal(media.prevId, legacy.id);
  assert.equal(atelier.prevId, media.id);

  const deltaPaths = (left: unknown, right: unknown, path = ""): string[] => {
    if (JSON.stringify(left) === JSON.stringify(right)) return [];
    if (
      left !== null
      && right !== null
      && typeof left === "object"
      && typeof right === "object"
      && !Array.isArray(left)
      && !Array.isArray(right)
    ) {
      const leftRecord = left as Record<string, unknown>;
      const rightRecord = right as Record<string, unknown>;
      return [...new Set([...Object.keys(leftRecord), ...Object.keys(rightRecord)])]
        .sort()
        .flatMap((key) => deltaPaths(
          leftRecord[key],
          rightRecord[key],
          path ? `${path}.${key}` : key,
        ));
    }
    const change = left === undefined ? "ADDED" : right === undefined ? "REMOVED" : "CHANGED";
    return [`${change} ${path}`];
  };

  assert.deepEqual(deltaPaths(legacy, media), [
    "CHANGED id",
    "CHANGED prevId",
    "CHANGED tables.public.studio_media_completion_jobs.checkConstraints.studio_media_completion_jobs_output_complete.value",
    "ADDED tables.public.studio_media_completion_jobs.checkConstraints.studio_media_completion_jobs_provider_checkpoints",
    "CHANGED tables.public.studio_media_completion_jobs.checkConstraints.studio_media_completion_jobs_state_known.value",
    "ADDED tables.public.studio_media_completion_jobs.checkConstraints.studio_media_completion_jobs_validation_checkpoints",
    "ADDED tables.public.studio_media_completion_jobs.columns.provider_invocation_started_at",
    "ADDED tables.public.studio_media_completion_jobs.columns.provider_result_blob_pathname",
    "ADDED tables.public.studio_media_completion_jobs.columns.provider_result_byte_size",
    "ADDED tables.public.studio_media_completion_jobs.columns.provider_result_mime_type",
    "ADDED tables.public.studio_media_completion_jobs.columns.provider_result_received_at",
    "ADDED tables.public.studio_media_completion_jobs.columns.provider_result_sha256",
    "ADDED tables.public.studio_media_completion_jobs.columns.validation_invocation_started_at",
    "ADDED tables.public.studio_media_completion_jobs.columns.validation_result_received_at",
  ]);
  assert.deepEqual(deltaPaths(media, atelier), [
    "CHANGED id",
    "CHANGED prevId",
    "ADDED tables.public.studio_atelier_artifacts",
    "ADDED tables.public.studio_atelier_events",
    "ADDED tables.public.studio_atelier_executions",
    "ADDED tables.public.studio_atelier_operation_projections",
    "ADDED tables.public.studio_atelier_operations",
  ]);
});
