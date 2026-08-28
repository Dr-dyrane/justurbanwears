import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  atelierStageFamily,
  createStudioEngineWorkOwnershipService,
  legacyStageFamilyForGarmentSetSlot,
  legacyStageFamilyForMediaCompletionRole,
  legacyStageFamilyForWearOperation,
  studioEngineOwnershipSemanticHash,
} from "../lib/server/studio-engine-work-ownership-service";
import type {
  ClaimStudioEngineWorkOwnershipInput,
  StudioEngineWorkOwnershipRow,
} from "../lib/server/studio-engine-work-ownership-repository";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = "operator-engine-ownership-test";
const ITEM_A = "00000000-0000-4000-8000-000000001701";
const ITEM_B = "00000000-0000-4000-8000-000000001702";

function createAtomicRepository() {
  const rows = new Map<string, StudioEngineWorkOwnershipRow>();
  const keyFor = (input: Pick<
    ClaimStudioEngineWorkOwnershipInput,
    "operatorSubject" | "wardrobeItemId" | "stageFamily"
  >) => `${input.operatorSubject}\n${input.wardrobeItemId}\n${input.stageFamily}`;

  return {
    rows,
    repository: {
      async claim(input: ClaimStudioEngineWorkOwnershipInput) {
        const key = keyFor(input);
        const existing = rows.get(key);
        if (existing) return { ...existing, reused: true };
        const now = new Date("2026-08-27T12:00:00.000Z");
        const created = Object.freeze({
          ...input,
          createdAt: now,
          updatedAt: now,
          reused: false,
        });
        rows.set(key, created);
        return created;
      },
    },
  };
}

function isOwnershipConflict(error: unknown): boolean {
  return error instanceof StudioEngineError
    && error.code === "INVALID_TRANSITION"
    && error.status === 409
    && /already owned/i.test(error.message);
}

test("the first engine claim wins atomically and same-owner retry reuses it", async () => {
  const memory = createAtomicRepository();
  const service = createStudioEngineWorkOwnershipService(memory.repository);
  assert.deepEqual(Object.keys(service).sort(), ["claimAtelier", "claimLegacy"]);
  const key = {
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM_A,
    stageFamily: "SUBJECT" as const,
  };

  const [legacy, atelier] = await Promise.allSettled([
    service.claimLegacy(key),
    service.claimAtelier(key),
  ]);

  assert.equal(legacy.status, "fulfilled");
  assert.equal(legacy.status === "fulfilled" && legacy.value.reused, false);
  assert.equal(atelier.status, "rejected");
  assert.equal(atelier.status === "rejected" && isOwnershipConflict(atelier.reason), true);

  const retry = await service.claimLegacy(key);
  assert.equal(retry.reused, true);
  assert.equal(retry.semanticHash, studioEngineOwnershipSemanticHash(key));
  assert.equal(memory.rows.size, 1);
  assert.equal([...memory.rows.values()][0]?.owner, "LEGACY");
});

test("unrelated items and semantic stage families can have independent owners", async () => {
  const memory = createAtomicRepository();
  const service = createStudioEngineWorkOwnershipService(memory.repository);

  await Promise.all([
    service.claimLegacy({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM_A,
      stageFamily: "GARMENT_FRONT",
    }),
    service.claimAtelier({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM_A,
      stageFamily: "GARMENT_BACK",
    }),
    service.claimAtelier({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM_B,
      stageFamily: "GARMENT_FRONT",
    }),
  ]);

  assert.equal(memory.rows.size, 3);
});

test("an old or uncertain claim remains owned and cannot silently transfer", async () => {
  const memory = createAtomicRepository();
  const service = createStudioEngineWorkOwnershipService(memory.repository);
  const key = {
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM_A,
    stageFamily: "ROOM_FINAL" as const,
  };
  await service.claimLegacy(key);
  const storedKey = [...memory.rows.keys()][0]!;
  const stored = memory.rows.get(storedKey)!;
  memory.rows.set(storedKey, {
    ...stored,
    createdAt: new Date("2000-01-01T00:00:00.000Z"),
    updatedAt: new Date("2000-01-01T00:00:00.000Z"),
  });

  await assert.rejects(service.claimAtelier(key), isOwnershipConflict);
  assert.equal(memory.rows.get(storedKey)?.owner, "LEGACY");
});

test("missing or foreign wardrobe items fail closed", async () => {
  const service = createStudioEngineWorkOwnershipService({
    claim: async () => null,
  });

  await assert.rejects(
    service.claimLegacy({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM_A,
      stageFamily: "GARMENT_FRONT",
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INTAKE_NOT_FOUND"
      && error.status === 404,
  );
});

test("legacy and Atelier stages map onto the same semantic ownership families", () => {
  assert.equal(legacyStageFamilyForGarmentSetSlot("GARMENT_FRONT"), "GARMENT_FRONT");
  assert.equal(legacyStageFamilyForGarmentSetSlot("GARMENT_BACK"), "GARMENT_BACK");
  assert.equal(legacyStageFamilyForGarmentSetSlot("MANNEQUIN_FRONT"), "GARMENT_MANNEQUIN");
  assert.equal(legacyStageFamilyForGarmentSetSlot("FABRIC_DETAIL"), "GARMENT_DETAIL");
  assert.equal(legacyStageFamilyForGarmentSetSlot("LULU_TRY_ON"), "SUBJECT");
  assert.equal(legacyStageFamilyForMediaCompletionRole("GARMENT_FRONT"), "GARMENT_FRONT");
  assert.equal(legacyStageFamilyForMediaCompletionRole("GARMENT_BACK"), "GARMENT_BACK");
  assert.equal(legacyStageFamilyForMediaCompletionRole("FABRIC_DETAIL"), "GARMENT_DETAIL");
  assert.equal(legacyStageFamilyForWearOperation("MANNEQUIN_FRONT"), "GARMENT_MANNEQUIN");
  assert.equal(legacyStageFamilyForWearOperation("MODEL_TRY_ON"), "SUBJECT");
  assert.equal(legacyStageFamilyForWearOperation("EDITORIAL_MODEL"), "ROOM_FINAL");
  assert.equal(atelierStageFamily("GARMENT_01_FRONT"), "GARMENT_FRONT");
  assert.equal(atelierStageFamily("GARMENT_02_BACK"), "GARMENT_BACK");
  assert.equal(atelierStageFamily("GARMENT_03_MANNEQUIN"), "GARMENT_MANNEQUIN");
  assert.equal(atelierStageFamily("GARMENT_04_DETAIL"), "GARMENT_DETAIL");
  assert.equal(atelierStageFamily("SUBJECT_A"), "SUBJECT");
  assert.equal(atelierStageFamily("SUBJECT_B"), "SUBJECT");
  assert.equal(atelierStageFamily("MASTER_05"), "ROOM_FINAL");
  assert.equal(atelierStageFamily("PROFILE_06"), "ROOM_FINAL");
  assert.equal(atelierStageFamily("REAR_3Q_07"), "ROOM_FINAL");
});

test("manual Intake commits its approved legacy front and ownership in one idempotent SQL boundary", () => {
  const repository = readFileSync(
    new URL("../lib/server/studio-intake-repository.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const commit = repository.slice(
    repository.indexOf("export async function commitStudioIntakeAtomic"),
    repository.indexOf("export async function getCommittedWardrobeItem"),
  );

  const itemInsert = commit.indexOf("inserted_item as");
  const ownershipItem = commit.indexOf("ownership_item as");
  const ownershipClaim = commit.indexOf("ownership_claim as");
  const eventInsert = commit.indexOf("inserted_event as");
  assert.ok(itemInsert >= 0 && itemInsert < ownershipItem);
  assert.ok(ownershipItem < ownershipClaim && ownershipClaim < eventInsert);
  assert.match(commit, /insert into studio_engine_work_ownership/);
  assert.match(commit, /'GARMENT_FRONT', 'LEGACY'/);
  assert.match(commit, /'juw\.studio-engine-work-ownership\.v1' \|\| E'\\n'/);
  assert.match(commit, /existing\.operator_subject = \$\{input\.operatorSubject\}/);
  assert.match(commit, /existing\.approved_asset_id = \$\{input\.approvedAssetId\}::uuid/);
  assert.match(commit, /not exists \(select 1 from committed_item\)/);
  assert.match(commit, /studio_engine_work_ownership\.owner = 'LEGACY'/);
  assert.match(commit, /studio_engine_work_ownership\.semantic_hash = excluded\.semantic_hash/);
  assert.match(commit, /exists\(select 1 from ownership_claim\) as ownership_claimed/);
  assert.match(commit, /if \(!ownershipClaimed\)/);
});

test("the migration and repository make ownership permanent, atomic, and operator scoped", () => {
  const migration = readFileSync(
    new URL("../drizzle/shop-postgres/0017_studio_engine_work_ownership.sql", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const repository = readFileSync(
    new URL("../lib/server/studio-engine-work-ownership-repository.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");

  assert.match(migration, /PRIMARY KEY\("operator_subject","wardrobe_item_id","stage_family"\)/);
  assert.match(migration, /ON CONFLICT \(operator_subject, wardrobe_item_id, stage_family\) DO NOTHING/);
  assert.match(migration, /generation\.operation IN \('GARMENT_FRONT', 'MANNEQUIN_FRONT', 'MODEL_TRY_ON', 'EDITORIAL_MODEL'\)/);
  assert.match(migration, /completion\.role IN \('GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL'\)/);
  assert.doesNotMatch(migration, /lease_expires_at|state in \(|delete from studio_engine_work_ownership/i);
  assert.match(repository, /wardrobe\.operator_subject = \$\{input\.operatorSubject\}/);
  assert.match(repository, /on conflict \(operator_subject, wardrobe_item_id, stage_family\)/);
  assert.match(repository, /do update set updated_at = studio_engine_work_ownership\.updated_at/);
  assert.doesNotMatch(repository, /delete|release|expiresAt|leaseExpiresAt/i);

  type SnapshotTable = Readonly<{
    columns: Record<string, unknown>;
    indexes: Record<string, unknown>;
    foreignKeys: Record<string, unknown>;
    compositePrimaryKeys: Record<string, { columns: string[] }>;
  }>;
  type Snapshot = Readonly<{
    id: string;
    prevId: string;
    version: string;
    dialect: string;
    tables: Record<string, SnapshotTable>;
  }>;
  const snapshot16 = JSON.parse(readFileSync(
    new URL("../drizzle/shop-postgres/meta/0016_snapshot.json", import.meta.url),
    "utf8",
  )) as Snapshot;
  const snapshot17 = JSON.parse(readFileSync(
    new URL("../drizzle/shop-postgres/meta/0017_snapshot.json", import.meta.url),
    "utf8",
  )) as Snapshot;
  assert.equal(snapshot17.prevId, snapshot16.id);
  assert.equal(snapshot17.version, "7");
  assert.equal(snapshot17.dialect, "postgresql");
  assert.deepEqual(
    Object.keys(snapshot17.tables).filter((name) => !(name in snapshot16.tables)),
    ["public.studio_engine_work_ownership"],
  );
  assert.deepEqual(
    Object.keys(snapshot17.tables).filter((name) =>
      name in snapshot16.tables
      && JSON.stringify(snapshot17.tables[name]) !== JSON.stringify(snapshot16.tables[name])),
    ["public.studio_atelier_operations"],
  );
  const ownership = snapshot17.tables["public.studio_engine_work_ownership"]!;
  assert.deepEqual(
    ownership.compositePrimaryKeys[
      "studio_engine_work_ownership_operator_subject_wardrobe_item_id_stage_family_pk"
    ]?.columns,
    ["operator_subject", "wardrobe_item_id", "stage_family"],
  );
  const atelier = snapshot17.tables["public.studio_atelier_operations"]!;
  assert.ok(atelier.columns.wardrobe_item_id);
  assert.ok(atelier.indexes.studio_atelier_operations_wardrobe_stage_idx);
  assert.ok(
    atelier.foreignKeys[
      "studio_atelier_operations_wardrobe_item_id_studio_wardrobe_items_id_fk"
    ],
  );
});

test("every engine asserts ownership before creating intent, claiming work, or invoking a provider", () => {
  const garmentSet = readFileSync(
    new URL("../lib/studio/engine/garment-set-service.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const wear = readFileSync(
    new URL("../lib/studio/engine/wear-service.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const durable = readFileSync(
    new URL("../lib/server/studio-atelier-durable-engine.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const mediaCompletion = readFileSync(
    new URL("../lib/studio/engine/media-completion-service.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");

  const garmentCommand = garmentSet.slice(garmentSet.indexOf("export async function commandGarmentSet"));
  const garmentClaim = garmentCommand.indexOf("await claimLegacyStudioEngineWork");
  assert.ok(garmentClaim >= 0);
  assert.ok(garmentClaim < garmentCommand.indexOf("await createOrReuseGeneration"));
  assert.ok(garmentClaim < garmentCommand.indexOf("await claimGenerationCommand"));

  const wearCommand = wear.slice(wear.indexOf("export async function generateWearCandidate"));
  const wearClaim = wearCommand.indexOf("await claimLegacyStudioEngineWork");
  assert.ok(wearClaim >= 0);
  assert.ok(wearClaim < wearCommand.indexOf("await createOrReuseGeneration"));
  assert.ok(wearClaim < wearCommand.indexOf("await executeStudioPaidGeneration"));

  const completionCreate = mediaCompletion.slice(
    mediaCompletion.indexOf("export async function createMediaCompletion"),
    mediaCompletion.indexOf("export async function readLatestMediaCompletion"),
  );
  const completionClaim = completionCreate.indexOf("await claimWardrobeCompletionOwnership");
  assert.ok(completionClaim >= 0);
  assert.ok(completionClaim < completionCreate.indexOf("recoverStaleMediaCompletionJobs"));
  assert.ok(completionClaim < completionCreate.indexOf("storeAuthoritySource"));
  assert.ok(completionClaim < completionCreate.indexOf("executeCompletion"));
  const completionDecision = mediaCompletion.slice(
    mediaCompletion.indexOf("export async function decideMediaCompletion"),
    mediaCompletion.indexOf("export async function readMediaCompletionAsset"),
  );
  const decisionClaim = completionDecision.indexOf("await claimWardrobeCompletionOwnership");
  assert.ok(decisionClaim > completionDecision.indexOf("job.targetKind !== target.kind"));
  assert.ok(decisionClaim < completionDecision.lastIndexOf("executeCompletion"));
  const completionOwnership = mediaCompletion.slice(
    mediaCompletion.indexOf("async function claimWardrobeCompletionOwnership"),
    mediaCompletion.indexOf("function storedValidationEligibility"),
  );
  assert.match(completionOwnership, /target\.kind !== "WARDROBE_ITEM"\) return/);
  assert.match(completionOwnership, /claimLegacyStudioEngineWork/);

  const prepare = durable.slice(durable.indexOf("async prepareCompiledOperation"));
  const prepareClaim = prepare.indexOf("await dependencies.claimOwnership");
  assert.ok(prepareClaim >= 0);
  assert.ok(prepareClaim < prepare.indexOf("await dependencies.createOperation"));
  const materialize = durable.slice(durable.indexOf("async materializeOnce"));
  const materializeClaim = materialize.indexOf("await dependencies.claimOwnership");
  assert.ok(materializeClaim >= 0);
  assert.ok(materializeClaim < materialize.indexOf("await input.materializeOnce"));
});
