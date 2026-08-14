import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  assertMediaCompletionAuthority,
  mediaCompletionDecisionSchema,
  requiredAuthorityStatement,
} from "../lib/studio/engine/media-completion-contracts";
import { buildMediaCompletionPrompt } from "../lib/ai/studio-gateway";

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

test("0008 stores append-only candidate lineage and keeps capture promotion explicit", async () => {
  const [migration, schema, repository] = await Promise.all([
    source("drizzle/shop-postgres/0008_studio_media_completions.sql"),
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
  assert.match(schema, /studio_media_completion_jobs_output_complete/);
  assert.match(schema, /studio_media_completion_jobs_execution_lease/);
  assert.match(repository, /recoverStaleMediaCompletionJobs/);
  assert.match(repository, /STALE_EXECUTION/);
  assert.match(repository, /eq\(studioMediaCompletionJobs\.executionToken, executionToken\)/);
  assert.match(repository, /with approved_job as/);
  assert.match(repository, /state = 'COMPLETE'/);
  assert.match(repository, /origin, completion_job_id/);
  assert.match(repository, /state = 'APPROVED'/);
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
  const execution = service.slice(service.indexOf("async function executeCompletion"));
  assert.ok(execution.indexOf("validateMediaCompletionSource") < execution.indexOf("generateMediaCompletionImage"));
  assert.ok(execution.indexOf("validationCostUsd") < execution.indexOf("generateMediaCompletionImage"));
  assert.match(service, /generated\.costUsd === null \|\| generated\.costUsd > studioGatewayPolicy\.imageCostCapUsd/);
  assert.match(service, /\.toColourspace\("srgb"\)/);
  assert.match(service, /\.webp\(/);
  assert.ok(service.indexOf("const outputHash = sha256(verified.bytes)") > service.indexOf(".webp("));
  assert.match(service, /Concurrent identical requests/);
  assert.match(service, /persisted by the slot/);
  assert.match(service, /recoverStaleMediaCompletionJobs/);
  assert.match(service, /pollAfterMs: 1_500/);
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
  assert.match(http, /private, no-store, max-age=0/);
  for (const route of routes.slice(0, 2)) {
    assert.ok(route.indexOf("requireStudioOperator()") < route.indexOf("parseMediaCompletionForm(request)"));
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
});
