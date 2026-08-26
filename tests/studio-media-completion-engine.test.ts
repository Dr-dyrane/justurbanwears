import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertMediaCompletionAuthority,
  assertMediaCompletionTruthConfirmation,
  mediaCompletionDecisionSchema,
  mediaCompletionSourceModeSchema,
  requiredAuthorityStatement,
} from "../lib/studio/engine/media-completion-contracts";
import { buildMediaCompletionPrompt } from "../lib/ai/studio-gateway";
import { parseMediaCompletionRequest } from "../lib/studio/engine/media-completion-http";
import {
  classifyExpiredMediaCompletionClaim,
  hasRetainedMediaCompletionProviderResult,
  MEDIA_COMPLETION_0015_REQUIRED_COLUMNS,
  MEDIA_COMPLETION_0015_REQUIRED_CONSTRAINTS,
  missingMediaCompletionSchemaPrerequisites,
} from "../lib/server/studio-media-completion-repository";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("UI contracts expose one reviewable candidate and one retry", () => {
  assert.equal(mediaCompletionDecisionSchema.safeParse({ decision: "KEEP" }).success, true);
  assert.equal(mediaCompletionDecisionSchema.safeParse({ decision: "RETRY", correction: "Keep the hem." }).success, true);
  assert.equal(mediaCompletionDecisionSchema.safeParse({ decision: "EDIT" }).success, false);
  assert.equal(requiredAuthorityStatement("GARMENT_FRONT"), "full front");
  assert.equal(requiredAuthorityStatement("GARMENT_BACK"), "full back");
  assert.equal(requiredAuthorityStatement("FABRIC_DETAIL"), "fabric close-up");
  assert.throws(() => assertMediaCompletionAuthority("GARMENT_BACK", "false"), /full back/);
  assert.doesNotThrow(() => assertMediaCompletionAuthority("GARMENT_BACK", "true"));
  assert.equal(mediaCompletionSourceModeSchema.safeParse("APPROVED_FRONT").success, true);
  assert.throws(
    () => assertMediaCompletionTruthConfirmation("APPROVED_FRONT", "KEEP", false),
    /matches the real garment/,
  );
  assert.doesNotThrow(() => assertMediaCompletionTruthConfirmation("APPROVED_FRONT", "KEEP", true));
  assert.doesNotThrow(() => assertMediaCompletionTruthConfirmation("UPLOADED_AUTHORITY", "KEEP", undefined));
});

test("approved wardrobe fronts can request a private AI candidate without another upload", async () => {
  const parsed = await parseMediaCompletionRequest(new Request("https://example.test/completions", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ role: "GARMENT_BACK", sourceMode: "APPROVED_FRONT" }),
  }));
  assert.equal(parsed.role, "GARMENT_BACK");
  assert.equal(parsed.sourceMode, "APPROVED_FRONT");
  assert.equal("bytes" in parsed, false);
});

test("role prompts preserve the supplied authority and never infer missing construction", () => {
  const front = buildMediaCompletionPrompt({ role: "GARMENT_FRONT", facts: { title: "Dress" } });
  const back = buildMediaCompletionPrompt({ role: "GARMENT_BACK", facts: { title: "Dress" } });
  const detail = buildMediaCompletionPrompt({ role: "FABRIC_DETAIL", facts: { title: "Dress" } });
  assert.match(front, /full-front authority photo/);
  assert.match(front, /neckline through hem/);
  assert.match(back, /full-back authority photo/);
  assert.match(back, /visible closure/);
  assert.match(detail, /fabric close-up/);
  assert.match(detail, /Do not sharpen, regularize, extend, synthesize or replace/);
  for (const prompt of [front, back, detail]) {
    assert.match(prompt, /Never infer, invent, mirror, extrapolate, complete or reinterpret unseen/);
    assert.match(prompt, /Never add or alter closures, pockets, seams, lining/);
  }
});

test("approved-front cross-view prompts stay provisional until physical review", () => {
  const back = buildMediaCompletionPrompt({
    role: "GARMENT_BACK",
    sourceMode: "APPROVED_FRONT",
    facts: { title: "Dress" },
  });
  const detail = buildMediaCompletionPrompt({
    role: "FABRIC_DETAIL",
    sourceMode: "APPROVED_FRONT",
    facts: { title: "Dress" },
  });
  assert.match(back, /private, provisional straight-on back preview inferred/);
  assert.match(back, /not visible in the source/);
  assert.match(back, /never a factual record/);
  assert.match(detail, /private, provisional fabric-detail preview/);
  assert.match(detail, /do not invent fibre, weave, texture/);
  assert.match(detail, /never a factual material record/);
});

test("media completion migrations retain paid results and keep capture promotion explicit", async () => {
  const [migration, recoveryMigration, schema, repository] = await Promise.all([
    source("drizzle/shop-postgres/0008_studio_media_completions.sql"),
    source("drizzle/shop-postgres/0015_media_completion_dispatch_fence.sql"),
    source("db/shop-postgres-schema.ts"),
    source("lib/server/studio-media-completion-repository.ts"),
  ]);
  assert.match(migration, /CREATE TABLE "studio_media_completion_jobs"/);
  assert.match(migration, /source_validation/);
  assert.match(migration, /validation_usage/);
  assert.match(migration, /validation_cost_usd/);
  assert.match(migration, /output_blob_pathname/);
  assert.match(migration, /attempt_bounded/);
  assert.match(migration, /studio_media_completion_jobs_attempt_slot_unique/);
  assert.match(migration, /"operator_subject","target_kind","target_key","role","attempt"/);
  assert.match(migration, /execution_token/);
  assert.match(migration, /lease_expires_at/);
  assert.match(migration, /AI_DERIVED/);
  assert.match(migration, /completion_job_id/);
  assert.match(recoveryMigration, /validation_invocation_started_at/);
  assert.match(recoveryMigration, /provider_invocation_started_at/);
  assert.match(recoveryMigration, /provider_result_blob_pathname/);
  assert.match(recoveryMigration, /INDETERMINATE/);
  const providerColumns = recoveryMigration.indexOf('ADD COLUMN "provider_result_sha256"');
  const legacyReconciliation = recoveryMigration.indexOf('MIGRATED_RUNNING_RECONCILIATION');
  const checkpointConstraints = recoveryMigration.indexOf(
    'ADD CONSTRAINT "studio_media_completion_jobs_validation_checkpoints"',
  );
  assert.ok(providerColumns >= 0 && providerColumns < legacyReconciliation);
  assert.ok(legacyReconciliation < checkpointConstraints);
  assert.match(recoveryMigration, /"state" = 'RUNNING'[\s\S]*"error_code" = 'STALE_EXECUTION'/);
  assert.match(recoveryMigration, /MIGRATED_STALE_RECONCILIATION/);
  assert.match(schema, /studio_media_completion_jobs_output_complete/);
  assert.match(schema, /studio_media_completion_jobs_execution_lease/);
  assert.match(schema, /studio_media_completion_jobs_provider_checkpoints/);
  assert.match(repository, /recoverStaleMediaCompletionJobs/);
  assert.match(repository, /RECONCILIATION_REQUIRED/);
  assert.match(repository, /REQUEUE_PRE_DISPATCH/);
  assert.match(repository, /RESUME_RETAINED_RESULT/);
  assert.match(repository, /eq\(studioMediaCompletionJobs\.executionToken, executionToken\)/);
  assert.match(repository, /with approved_job as/);
  assert.match(repository, /state = 'COMPLETE'/);
  assert.match(repository, /operatorTruthConfirmed/);
  assert.match(repository, /source_validation->>'sourceMode' = 'APPROVED_FRONT'/);
  assert.match(repository, /origin, completion_job_id/);
  assert.match(repository, /state = 'APPROVED'/);
});

test("expired media claims requeue only before dispatch and never retry an uncertain paid call", () => {
  const beforeDispatch = {
    validationInvocationStartedAt: null,
    validationResultReceivedAt: null,
    providerInvocationStartedAt: null,
    providerResultReceivedAt: null,
    providerResultBlobPathname: null,
    providerResultMimeType: null,
    providerResultByteSize: null,
    providerResultSha256: null,
  };
  assert.equal(classifyExpiredMediaCompletionClaim(beforeDispatch), "REQUEUE_PRE_DISPATCH");

  const validationReturned = {
    ...beforeDispatch,
    validationInvocationStartedAt: new Date("2026-08-26T00:00:00Z"),
    validationResultReceivedAt: new Date("2026-08-26T00:00:01Z"),
  };
  assert.equal(classifyExpiredMediaCompletionClaim(validationReturned), "REQUEUE_PRE_DISPATCH");
  assert.equal(classifyExpiredMediaCompletionClaim({
    ...beforeDispatch,
    validationInvocationStartedAt: new Date("2026-08-26T00:00:00Z"),
  }), "INDETERMINATE_RECONCILIATION");
  assert.equal(classifyExpiredMediaCompletionClaim({
    ...validationReturned,
    providerInvocationStartedAt: new Date("2026-08-26T00:00:02Z"),
  }), "INDETERMINATE_RECONCILIATION");

  const retained = {
    ...validationReturned,
    providerInvocationStartedAt: new Date("2026-08-26T00:00:02Z"),
    providerResultReceivedAt: new Date("2026-08-26T00:00:03Z"),
    providerResultBlobPathname: "studio/private/raw.png",
    providerResultMimeType: "image/png",
    providerResultByteSize: 12,
    providerResultSha256: "a".repeat(64),
  };
  assert.equal(hasRetainedMediaCompletionProviderResult(retained), true);
  assert.equal(classifyExpiredMediaCompletionClaim(retained), "RESUME_RETAINED_RESULT");
});

test("media completion schema readiness requires the complete 0015 contract", async () => {
  const complete = [
    ...MEDIA_COMPLETION_0015_REQUIRED_COLUMNS.map((name) => ({ kind: "COLUMN" as const, name })),
    ...MEDIA_COMPLETION_0015_REQUIRED_CONSTRAINTS.map((name) => ({ kind: "CONSTRAINT" as const, name })),
  ];
  assert.equal(MEDIA_COMPLETION_0015_REQUIRED_COLUMNS.length, 8);
  assert.equal(MEDIA_COMPLETION_0015_REQUIRED_CONSTRAINTS.length, 4);
  assert.deepEqual(missingMediaCompletionSchemaPrerequisites(complete), []);
  assert.deepEqual(missingMediaCompletionSchemaPrerequisites(complete.slice(1)), [
    "COLUMN:validation_invocation_started_at",
  ]);

  const repository = await source("lib/server/studio-media-completion-repository.ts");
  const queryStart = repository.indexOf("from information_schema.columns");
  const queryEnd = repository.indexOf("const rows =", queryStart);
  const schemaQuery = repository.slice(queryStart, queryEnd);
  for (const prerequisite of [
    ...MEDIA_COMPLETION_0015_REQUIRED_COLUMNS,
    ...MEDIA_COMPLETION_0015_REQUIRED_CONSTRAINTS,
  ]) {
    assert.match(schemaQuery, new RegExp(prerequisite));
  }
  assert.match(schemaQuery, /information_schema\.table_constraints/);

  const preflightStart = repository.indexOf("async function assertMediaCompletionSchemaReady");
  const preflightEnd = repository.indexOf("async function getMediaCompletionDb", preflightStart);
  const preflight = repository.slice(preflightStart, preflightEnd);
  assert.ok(preflight.indexOf("if (missing.length)") < preflight.indexOf("mediaCompletionSchemaReady = true"));
  assert.match(preflight, /"ENGINE_UNAVAILABLE",\s*503/);
  assert.match(preflight, /Studio media generation is not ready\./);
  assert.match(preflight, /0015_media_completion_dispatch_fence\. No generation was started\./);

  const guardedOperations = repository.slice(repository.indexOf("export async function listMediaCompletionJobs"));
  assert.doesNotMatch(guardedOperations, /getStudioDb\(\)/);
  assert.match(guardedOperations, /getMediaCompletionDb\(\)/);
});

test("Studio surfaces an uncertain paid result as a zero-spend reconciliation blocker", async () => {
  const [directCaptures, garmentSet, garmentSetUi] = await Promise.all([
    source("components/studio/draft-direct-captures.tsx"),
    source("lib/studio/engine/garment-set-service.ts"),
    source("components/studio/garment-set-builder.tsx"),
  ]);

  assert.match(directCaptures, /"INDETERMINATE"/);
  assert.match(directCaptures, /candidate\.requiresReconciliation === true \|\| candidate\.state === "INDETERMINATE"/);
  assert.match(directCaptures, /No retry was started/);
  assert.match(directCaptures, /disabled=\{busy \|\| !aiFlow\.job\?\.canRetry \|\| aiFlow\.job\?\.requiresReconciliation\}/);
  assert.match(garmentSet, /requiresReconciliation: back\.requiresReconciliation/);
  assert.match(garmentSet, /requiresReconciliation: detail\.requiresReconciliation/);
  assert.match(garmentSet, /no retry will run/);
  assert.match(garmentSetUi, /Provider result uncertain/);
  assert.match(garmentSetUi, /Reconciliation required/);
});

test("service validates visible role coverage before paid image generation", async () => {
  const [gateway, service] = await Promise.all([
    source("lib/ai/studio-gateway.ts"),
    source("lib/studio/engine/media-completion-service.ts"),
  ]);
  assert.match(gateway, /sourceValidationModel:[\s\S]*STUDIO_AI_TEXT_MODEL[\s\S]*DEFAULT_TEXT_MODEL/);
  assert.match(gateway, /observedRole/);
  assert.match(gateway, /FULL_FRONT/);
  assert.match(gateway, /FULL_BACK/);
  assert.match(gateway, /FABRIC_CLOSEUP/);
  assert.match(gateway, /maxRetries: 0/);
  assert.match(gateway, /GARMENT_BACK: "media-full-back-v2"/);
  assert.match(gateway, /FABRIC_DETAIL: "media-fabric-detail-v2"/);
  const execution = service.slice(service.indexOf("async function executeCompletion"));
  assert.ok(execution.indexOf("listMediaCompletionJobs") < execution.indexOf("generateMediaCompletionImage"));
  assert.ok(execution.indexOf("validateMediaCompletionSource") < execution.indexOf("generateMediaCompletionImage"));
  assert.ok(execution.indexOf("validationCostUsd") < execution.indexOf("generateMediaCompletionImage"));
  assert.match(service, /providerResult\.costUsd === null \|\| providerResult\.costUsd > studioGatewayPolicy\.imageCostCapUsd/);
  assert.ok(execution.indexOf("providerInvocationStartedAt") < execution.indexOf("generateMediaCompletionImage"));
  assert.ok(execution.indexOf("generateMediaCompletionImage") < execution.indexOf("providerResultReceivedAt"));
  assert.ok(execution.indexOf("providerResultBlobPathname") < execution.lastIndexOf("providerResult.costUsd === null"));
  assert.ok(execution.indexOf("outputBlobPathname: storedPathname") < execution.lastIndexOf("providerResult.costUsd === null"));
  assert.match(execution, /state: requiresReconciliation \? "INDETERMINATE" : "FAILED"/);
  assert.ok(execution.indexOf("if (providerResultCheckpointed)") < execution.indexOf("generateMediaCompletionImage"));
  assert.ok(execution.indexOf("readRetainedProviderResult(job)") < execution.indexOf("generateMediaCompletionImage"));
  assert.match(service, /readApprovedWardrobeFront/);
  assert.match(service, /getOwnedAsset/);
  assert.match(service, /asset\.role !== "GARMENT_FRONT"/);
  assert.match(service, /sourceMode: input\.sourceMode/);
  assert.match(service, /approvedFrontSelected: input\.sourceMode === "APPROVED_FRONT"/);
  assert.match(service, /sourceMode === "APPROVED_FRONT" \? "GARMENT_FRONT" : input\.role/);
  assert.match(service, /\.toColourspace\("srgb"\)/);
  assert.match(service, /\.webp\(/);
  assert.ok(service.indexOf("const outputHash = sha256(verified.bytes)") > service.indexOf(".webp("));
  assert.match(service, /Concurrent identical requests/);
  assert.match(service, /persisted by the slot/);
  assert.match(service, /recoverStaleMediaCompletionJobs/);
  assert.match(service, /pollAfterMs: 1_500/);
  const create = service.slice(
    service.indexOf("export async function createMediaCompletion"),
    service.indexOf("export async function readLatestMediaCompletion"),
  );
  assert.ok(create.indexOf("recoverStaleMediaCompletionJobs") < create.indexOf("storeAuthoritySource"));
});

test("private completion media is addressable only in reviewable lifecycle states", async () => {
  const [service, authorityRepository] = await Promise.all([
    source("lib/studio/engine/media-completion-service.ts"),
    source("lib/server/studio-authority-repository.ts"),
  ]);
  const projectionStart = service.indexOf("function jobAssetUrl");
  const projectionEnd = service.indexOf("function jobSourceMode", projectionStart);
  const projection = service.slice(projectionStart, projectionEnd);
  const reader = service.slice(service.indexOf("export async function readMediaCompletionAsset"));

  assert.match(projection, /!\["COMPLETE", "APPROVED", "REJECTED"\]\.includes\(job\.state\)/);
  assert.match(projection, /job\.errorCode === "PAID_RESULT_POLICY_BLOCKED"/);
  assert.match(reader, /!\["COMPLETE", "APPROVED", "REJECTED"\]\.includes\(job\.state\)/);
  assert.match(reader, /job\.errorCode === "PAID_RESULT_POLICY_BLOCKED"/);
  assert.match(authorityRepository, /job\.state not in \('COMPLETE', 'APPROVED', 'REJECTED'\)/);
  assert.match(authorityRepository, /job\.error_code = 'PAID_RESULT_POLICY_BLOCKED'/);
});

test("operator routes require auth, private source files, and explicit decisions", async () => {
  const paths = [
    "app/api/studio/pending-products/[sku]/completions/route.ts",
    "app/api/studio/wardrobe/[id]/completions/route.ts",
    "app/api/studio/pending-products/[sku]/completions/[jobId]/decision/route.ts",
    "app/api/studio/wardrobe/[id]/completions/[jobId]/decision/route.ts",
    "app/api/studio/pending-products/[sku]/completions/[jobId]/asset/route.ts",
    "app/api/studio/wardrobe/[id]/completions/[jobId]/asset/route.ts",
  ];
  const routes = await Promise.all(paths.map(source));
  for (const route of routes) {
    assert.match(route, /requireStudioOperator/);
    assert.match(route, /force-dynamic/);
  }
  const http = await source("lib/studio/engine/media-completion-http.ts");
  assert.match(http, /MAX_STUDIO_IMAGE_BYTES/);
  assert.match(http, /authorityConfirmed/);
  assert.match(http, /application\/json/);
  assert.match(http, /APPROVED_FRONT/);
  assert.match(http, /private, no-store, max-age=0/);
  for (const route of routes.slice(0, 2)) {
    assert.ok(route.indexOf("requireStudioOperator()") < route.indexOf("parseMediaCompletionRequest(request)"));
  }
});

test("publication rejects AI captures without matching approved lineage", async () => {
  const [review, atomic, directRepository] = await Promise.all([
    source("lib/studio/engine/catalogue-publication-service.ts"),
    source("lib/server/studio-catalogue-publication-repository.ts"),
    source("lib/server/studio-pending-capture-repository.ts"),
  ]);
  assert.match(review, /captureHasApprovedMediaLineage/);
  assert.match(atomic, /capture\.origin = 'AI_DERIVED'/);
  assert.match(atomic, /job\.state = 'APPROVED'/);
  assert.match(atomic, /job\.output_sha256 = capture\.sha256/);
  assert.match(directRepository, /origin: "DIRECT"/);
  assert.match(directRepository, /completionJobId: null/);
  assert.match(directRepository, /onConflictDoUpdate/);
});
