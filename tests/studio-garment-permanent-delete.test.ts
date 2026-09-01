import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { garmentPermanentDeleteSchema } from "../lib/studio/engine/garment-lifecycle-contracts";

const root = process.cwd();
const route = readFileSync(`${root}/app/api/studio/wardrobe/[id]/deletion/route.ts`, "utf8");
const repository = readFileSync(`${root}/lib/server/studio-garment-lifecycle-repository.ts`, "utf8");
const lockContract = readFileSync(`${root}/lib/server/studio-wardrobe-item-lock.ts`, "utf8");
const mediaRepository = readFileSync(`${root}/lib/server/studio-media-completion-repository.ts`, "utf8");
const captureRepository = readFileSync(`${root}/lib/server/studio-pending-capture-repository.ts`, "utf8");
const captureService = readFileSync(`${root}/lib/studio/engine/pending-capture-service.ts`, "utf8");
const service = readFileSync(`${root}/lib/studio/engine/garment-lifecycle-service.ts`, "utf8");
const panel = readFileSync(`${root}/components/studio/garment-lifecycle-panel.tsx`, "utf8");
const workbench = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
const migration = readFileSync(`${root}/drizzle/shop-postgres/0023_whole_timeslip.sql`, "utf8");

test("permanent deletion requires exact destructive intent and stable command identity", () => {
  assert.equal(garmentPermanentDeleteSchema.safeParse({
    confirmation: "DELETE_PERMANENTLY",
    expectedVersion: 3,
    idempotencyKey: "delete:wardrobe:one",
  }).success, true);
  assert.equal(garmentPermanentDeleteSchema.safeParse({
    confirmation: "DELETE",
    expectedVersion: 3,
    idempotencyKey: "delete:wardrobe:one",
  }).success, false);
  assert.equal(garmentPermanentDeleteSchema.safeParse({
    confirmation: "DELETE_PERMANENTLY",
    expectedVersion: 0,
    idempotencyKey: "delete:wardrobe:one",
  }).success, false);
});

test("the server deletes only an archived draft with no durable business history", () => {
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /for update/);
  assert.match(repository, /state = 'ARCHIVED'/);
  assert.match(repository, /version = \$\{input\.expectedVersion\}/);
  assert.match(repository, /studio_catalogue_publications/);
  assert.match(repository, /revision\.state in \('PUBLISHED', 'SUPERSEDED'\)/);
  assert.match(repository, /'REVISION_PUBLISHED', 'PUBLISHED', 'UNPUBLISHED', 'REPUBLISHED'/);
  assert.match(repository, /studio_engine_work_ownership/);
  assert.match(repository, /studio_atelier_operations/);
  assert.match(repository, /studio_atelier_shop_adoption_receipts/);
  assert.match(repository, /studio_physical_observations/);
  assert.match(repository, /studio_piece_custody_commands/);
  assert.match(repository, /studio_stocktakes/);
  assert.match(repository, /studio_media_completion_jobs/);
  assert.match(repository, /studio_pending_product_captures/);
  assert.match(repository, /on conflict do nothing/);
  assert.match(repository, /'VERSION_CONFLICT' as result_kind/);
  assert.match(repository, /'INELIGIBLE' as result_kind/);
});

test("media writers serialize with permanent deletion before creating logical history", () => {
  assert.match(lockContract, /studio_garment_delete:/);
  assert.match(repository, /studioWardrobeItemLockKey\(input\.operatorSubject, input\.wardrobeItemId\)/);
  assert.match(mediaRepository, /studioWardrobeItemLockKey\(input\.operatorSubject, input\.targetKey\)/);
  assert.match(mediaRepository, /pg_advisory_xact_lock/);
  assert.match(mediaRepository, /item\.state <> 'ARCHIVED'/);
  assert.match(mediaRepository, /insert into studio_media_completion_jobs/);
  assert.match(mediaRepository, /from owned_piece/);
  assert.match(captureRepository, /studioWardrobeItemLockKey\(input\.operatorSubject, input\.wardrobeItemId\)/);
  assert.match(captureRepository, /pg_advisory_xact_lock/);
  assert.match(captureRepository, /item\.state <> 'ARCHIVED'/);
  assert.match(captureRepository, /insert into studio_pending_product_captures/);
  assert.match(captureRepository, /from owned_piece/);
  assert.match(captureService, /wardrobeItemId: contract\.item\.id/);
});

test("the operation removes the Wardrobe projection but retains private engine evidence", () => {
  assert.match(repository, /delete from studio_garment_events/);
  assert.match(repository, /delete from studio_garment_revisions/);
  assert.match(repository, /revision\.state in \('DRAFT', 'DISCARDED'\)/);
  assert.match(repository, /delete from studio_wardrobe_items/);
  assert.doesNotMatch(repository, /delete from studio_intakes/i);
  assert.doesNotMatch(repository, /delete from studio_assets/i);
  assert.doesNotMatch(repository, /delete from studio_generations/i);
  assert.doesNotMatch(repository, /delete from studio_decisions/i);
  assert.doesNotMatch(repository, /del\(|blob.*delete|delete.*blob/i);
  assert.match(migration, /CREATE TABLE "studio_garment_deletions"/);
  assert.match(migration, /"actor_subject" text NOT NULL/);
  assert.match(migration, /studio_garment_deletions_operator_idempotency_unique/);
  assert.match(migration, /studio_garment_deletions_wardrobe_unique/);
  assert.doesNotMatch(migration, /FOREIGN KEY/);
});

test("Archived is a dedicated Wardrobe place with reviewed deletion and receipt reconciliation", () => {
  assert.match(workbench, /type WardrobeCollectionScope = "all" \| "archived" \| "private"/);
  assert.match(workbench, /collectionScope === "archived"/);
  assert.match(workbench, /label: "Archived"/);
  assert.match(workbench, /garment\.state !== "ARCHIVED"/);
  assert.match(panel, /Delete this piece permanently\?/);
  assert.match(panel, /<StudioDecisionSheet/);
  assert.match(panel, /workspace\.state === "ARCHIVED" && workspace\.permanentDelete\.eligible/);
  assert.match(panel, /commandInFlightRef\.current/);
  assert.match(panel, /getOrCreateSessionCommandKey/);
  assert.match(panel, /\/deletion\?idempotencyKey=/);
  assert.doesNotMatch(panel, /window\.confirm/);
  assert.match(route, /export async function GET/);
  assert.match(route, /export async function POST/);
  assert.match(route, /requireStudioOperator/);
  assert.match(service, /actorSubject: input\.operator\.actorSubject/);
  assert.match(service, /operatorSubject: input\.operator\.subject/);
});
