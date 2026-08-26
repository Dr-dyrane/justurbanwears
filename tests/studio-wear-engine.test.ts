import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildWearPrompt, studioGatewayPolicy } from "../lib/ai/studio-gateway";
import { createModelProfileSchema, createWearGenerationSchema } from "../lib/studio/engine/contracts";
import {
  isTerminalWearRequestReplay,
  legacyWearRequiresNonZdrConsent,
  wearGenerationResponse,
} from "../lib/studio/engine/wear-service";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFile(new URL(path, root), "utf8");

test("Wear prompts preserve ordered authority and visible-front truth", () => {
  const prompt = buildWearPrompt({ operation: "MODEL_TRY_ON", facts: { title: "Black dress" }, modelName: "Lulu" });
  assert.match(prompt, /Source image 1 is garment-only construction authority/);
  assert.match(prompt, /Source image 2 is adult identity\/body\/pose authority/);
  assert.match(prompt, /Do not infer or show a back, closure, lining, pockets/);
  assert.equal(studioGatewayPolicy.wearPromptVersions.EDITORIAL_MODEL, "editorial-model-v2");
  assert.equal(studioGatewayPolicy.legacyImageModel, "openai/gpt-image-2");
  assert.equal(studioGatewayPolicy.legacyImageSize, "1024x1536");
  assert.equal(studioGatewayPolicy.legacyImageCostCapUsd, 0.10);
  assert.equal(studioGatewayPolicy.imageModel, "bfl/flux-2-klein-4b");
  assert.equal(studioGatewayPolicy.imageAspectRatio, "4:5");
  assert.equal(studioGatewayPolicy.imageCostCapUsd, 0.025);
});

test("legacy Wear fails closed for private identity until durable non-ZDR consent is resolved", () => {
  assert.equal(legacyWearRequiresNonZdrConsent("MANNEQUIN_FRONT"), false);
  assert.equal(legacyWearRequiresNonZdrConsent("MODEL_TRY_ON"), true);
  assert.equal(legacyWearRequiresNonZdrConsent("EDITORIAL_MODEL"), true);
});

test("an exact terminal Wear request replay returns its saved projection without another dispatch", () => {
  const requestId = "11111111-1111-4111-8111-111111111111";
  assert.equal(isTerminalWearRequestReplay({ state: "FAILED", requestId }, requestId), true);
  assert.equal(isTerminalWearRequestReplay({ state: "REJECTED", requestId }, requestId), true);
  assert.equal(isTerminalWearRequestReplay({ state: "PENDING", requestId }, requestId), false);
  assert.equal(isTerminalWearRequestReplay({ state: "FAILED", requestId: "22222222-2222-4222-8222-222222222222" }, requestId), false);
});

test("Editorial prompt replaces the backdrop while freezing the approved subject", () => {
  const prompt = buildWearPrompt({ operation: "EDITORIAL_MODEL", facts: { title: "Black dress" }, modelName: "Lulu" });
  assert.match(prompt, /supplied approved model try-on as the sole person and garment authority/);
  assert.match(prompt, /edit only pixels outside that silhouette/);
  assert.match(prompt, /visibly distinct restrained editorial interior/);
  assert.match(prompt, /matte warm-plaster wall, one shallow architectural arch, pale terracotta floor/);
  assert.match(prompt, /Do not retain the original neutral backdrop/);
  assert.doesNotMatch(prompt, /supplied approved garment front as the only garment-construction authority/);
});

test("Wear input requires model, approved parent, and explicit stock authority", () => {
  assert.equal(createWearGenerationSchema.safeParse({ operation: "MODEL_TRY_ON" }).success, false);
  assert.equal(createWearGenerationSchema.safeParse({ operation: "EDITORIAL_MODEL" }).success, false);
  assert.equal(createWearGenerationSchema.safeParse({
    requestId: "11111111-1111-4111-8111-111111111111",
    operation: "MODEL_TRY_ON",
    modelProfileId: "22222222-2222-4222-8222-222222222222",
  }).success, true);
  assert.equal(createModelProfileSchema.safeParse({ name: "Adult model", licenseUrl: "https://www.pexels.com/photo/1", authorityConfirmed: "false" }).success, false);
  assert.equal(createModelProfileSchema.safeParse({ name: "Adult model", licenseUrl: "https://www.pexels.com/photo/1", authorityConfirmed: "true" }).success, true);
});

test("Wear generation responses bind the exact durable generation", () => {
  const workspace = { generations: [{ id: "newer-cross-tab-generation" }] };
  assert.deepEqual(wearGenerationResponse({
    generationId: "command-owned-generation",
    workspace,
    reused: true,
  }), {
    generationId: "command-owned-generation",
    workspace,
    reused: true,
  });
});

test("migration and service enforce durable private generation lineage", async () => {
  const [migration, snapshot, service, route, modelRoute, seed] = await Promise.all([
    source("drizzle/shop-postgres/0004_fixed_betty_ross.sql"),
    source("drizzle/shop-postgres/meta/0004_snapshot.json"),
    source("lib/studio/engine/wear-service.ts"),
    source("app/api/studio/wardrobe/[id]/wear/route.ts"),
    source("app/api/studio/wardrobe/[id]/models/route.ts"),
    source("scripts/studio-models/seed-lulu-v3.mjs"),
  ]);
  assert.match(migration, /EDITORIAL_MODEL/);
  assert.match(migration, /studio_model_profiles/);
  assert.match(snapshot, /studio_generations_model_profile_id_studio_model_profiles_id_fk/);
  const serviceBody = service.slice(service.indexOf("export async function generateWearCandidate"));
  const semanticParameters = serviceBody.slice(
    serviceBody.indexOf("const parameters = {"),
    serviceBody.indexOf("const fingerprint = generationFingerprint"),
  );
  const persistedGeneration = serviceBody.slice(
    serviceBody.indexOf("createOrReuseGeneration({"),
    serviceBody.indexOf("if (generation.outputAssetId"),
  );
  assert.doesNotMatch(semanticParameters, /requestId/u);
  assert.match(persistedGeneration, /requestId: input\.requestId/u);
  assert.ok(serviceBody.indexOf("createOrReuseGeneration") < serviceBody.indexOf("generateWearImage"));
  assert.ok(serviceBody.indexOf("persistStudioGenerationProviderResult") < serviceBody.indexOf("legacyImageCostCapUsd"));
  assert.ok(serviceBody.indexOf("checkpointPaidGenerationResult") < serviceBody.indexOf("legacyImageCostCapUsd"));
  assert.ok(serviceBody.indexOf("legacyImageCostCapUsd") < serviceBody.indexOf("outputAssetId: output.id"));
  assert.match(service, /sourceReferences/);
  assert.match(service, /claimGenerationDecision/);
  assert.match(service, /appendDecisionOnce/);
  const generationBody = serviceBody.slice(0, serviceBody.indexOf("export async function decideWearCandidate"));
  assert.equal((generationBody.match(/return wearGenerationResponse\(/g) ?? []).length, 9);
  assert.ok(generationBody.indexOf("legacyWearRequiresNonZdrConsent") < generationBody.indexOf("createOrReuseGeneration({"));
  assert.ok(service.indexOf("const effectiveModelProfileId = model?.id ?? null") < service.indexOf("const prior ="));
  assert.match(service, /decision: "RETRY"/);
  assert.match(route, /requireStudioOperator/);
  assert.match(route, /force-dynamic/);
  assert.match(modelRoute, /bytes\.byteLength > 12 \* 1024 \* 1024/);
  assert.match(seed, /const readback = existing \?\?/);
  assert.match(seed, /IDENTITY_MASTER_USER_APPROVED/);
});

test("Wear sheet recovers running work, exposes one retry, and avoids nested sheets", async () => {
  const [sheet, intake, workbench, css] = await Promise.all([
    source("components/studio/garment-intake/wear-sheet.tsx"),
    source("components/studio/garment-intake/garment-intake-sheet.tsx"),
    source("components/studio/wardrobe-workbench.tsx"),
    source("app/foundation.css"),
  ]);
  assert.match(sheet, /\["PENDING", "RUNNING"\]/);
  assert.match(sheet, /setTimeout/);
  assert.match(sheet, />Try once</);
  assert.match(sheet, /aria-live="assertive"/);
  assert.match(sheet, /parentGenerationId/);
  assert.doesNotMatch(intake, /<WearSheet/);
  assert.match(workbench, /onOpenWear=\{studio\.scenario \? undefined : \(id\) => \{\s*finishIntake\(\)/);
  assert.match(css, /min-height: 44px/);
  assert.doesNotMatch(sheet, /<select/);
});
