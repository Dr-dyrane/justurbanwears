import { and, desc, eq, inArray, sql } from "drizzle-orm";
import {
  studioAssets,
  studioDecisions,
  studioGenerations,
  studioIntakes,
  studioModelProfiles,
  studioWardrobeItems,
} from "../../db/shop-postgres-schema";
import { getStudioDb } from "../../db/shop-postgres";
import type {
  IntakeFacts,
  OperatorSafeModelProfile,
  OperatorSafeIntake,
  OperatorSafeWardrobeItem,
} from "../studio/engine/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import type { StudioOperator } from "./studio-operator";

type IntakeRow = typeof studioIntakes.$inferSelect;
type AssetRow = typeof studioAssets.$inferSelect;
type GenerationRow = typeof studioGenerations.$inferSelect;
type ModelProfileRow = typeof studioModelProfiles.$inferSelect;

async function ownedIntake(id: string, subject: string): Promise<IntakeRow> {
  const [row] = await (await getStudioDb()).select().from(studioIntakes).where(and(
    eq(studioIntakes.id, id),
    eq(studioIntakes.operatorSubject, subject),
  )).limit(1);
  if (!row) {
    throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That intake was not found.", "Return to Wardrobe.");
  }
  return row;
}

export async function createOrReuseIntake(input: {
  operator: StudioOperator;
  kind: "GARMENT";
  sourceMode: "CAMERA" | "UPLOAD" | "DESCRIBE";
  description?: string;
  idempotencyKey: string;
}): Promise<OperatorSafeIntake> {
  const db = await getStudioDb();
  await db.insert(studioIntakes).values({
    operatorSubject: input.operator.subject,
    operatorEmail: input.operator.email,
    kind: input.kind,
    sourceMode: input.sourceMode,
    description: input.description || null,
    idempotencyKey: input.idempotencyKey,
  }).onConflictDoNothing();
  const [row] = await db.select({ id: studioIntakes.id }).from(studioIntakes).where(and(
    eq(studioIntakes.operatorSubject, input.operator.subject),
    eq(studioIntakes.idempotencyKey, input.idempotencyKey),
  )).limit(1);
  if (!row) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Studio could not start.", "Try again.");
  return getIntakeSnapshot(row.id, input.operator.subject);
}

export async function getIntakeSnapshot(id: string, subject: string): Promise<OperatorSafeIntake> {
  const db = await getStudioDb();
  const intake = await ownedIntake(id, subject);
  const [assets, generations, wardrobe] = await Promise.all([
    db.select().from(studioAssets).where(eq(studioAssets.intakeId, id)).orderBy(studioAssets.createdAt),
    db.select().from(studioGenerations).where(eq(studioGenerations.intakeId, id)).orderBy(desc(studioGenerations.createdAt)),
    db.select().from(studioWardrobeItems).where(eq(studioWardrobeItems.intakeId, id)).limit(1),
  ]);
  const candidate = generations.find((generation) =>
    generation.outputAssetId && ["COMPLETE", "APPROVED", "REJECTED"].includes(generation.state)
  );
  return {
    id: intake.id,
    kind: intake.kind,
    sourceMode: intake.sourceMode,
    state: intake.state,
    version: intake.version,
    description: intake.description,
    facts: intake.facts as Partial<IntakeFacts>,
    assets: assets.map((asset) => ({
      id: asset.id,
      role: asset.role,
      mimeType: asset.mimeType,
      width: asset.width,
      height: asset.height,
    })),
    ...(candidate && candidate.outputAssetId ? {
      candidate: {
        generationId: candidate.id,
        assetId: candidate.outputAssetId,
        status: candidate.state as "COMPLETE" | "APPROVED" | "REJECTED",
      },
    } : {}),
    ...(wardrobe[0] ? { wardrobeItemId: wardrobe[0].id } : {}),
  };
}

export async function listRecoverableIntakes(subject: string): Promise<OperatorSafeIntake[]> {
  const rows = await (await getStudioDb()).select({ id: studioIntakes.id }).from(studioIntakes).where(and(
    eq(studioIntakes.operatorSubject, subject),
    inArray(studioIntakes.state, ["DRAFT", "ANALYZING", "REVIEW", "GENERATING", "DECISION", "FAILED"]),
  )).orderBy(desc(studioIntakes.updatedAt)).limit(8);
  return Promise.all(rows.map((row) => getIntakeSnapshot(row.id, subject)));
}

export async function getOwnedIntakeRow(id: string, subject: string): Promise<IntakeRow> {
  return ownedIntake(id, subject);
}

export async function updateIntakeVersioned(input: {
  id: string;
  subject: string;
  expectedVersion: number;
  state?: IntakeRow["state"];
  facts?: Record<string, string | number | null>;
  description?: string;
  errorCode?: string | null;
}): Promise<IntakeRow> {
  const nextVersion = input.expectedVersion + 1;
  const [updated] = await (await getStudioDb()).update(studioIntakes).set({
    ...(input.state ? { state: input.state } : {}),
    ...(input.facts ? { facts: input.facts } : {}),
    ...(input.description !== undefined ? { description: input.description } : {}),
    ...(input.errorCode !== undefined ? { errorCode: input.errorCode } : {}),
    version: nextVersion,
    updatedAt: new Date(),
  }).where(and(
    eq(studioIntakes.id, input.id),
    eq(studioIntakes.operatorSubject, input.subject),
    eq(studioIntakes.version, input.expectedVersion),
  )).returning();
  if (updated) return updated;
  const current = await ownedIntake(input.id, input.subject);
  throw new StudioEngineError(
    "VERSION_CONFLICT",
    409,
    "This intake changed in another window.",
    `Reload the intake at version ${current.version}.`,
  );
}

export async function addStudioAsset(input: {
  intakeId: string;
  role: AssetRow["role"];
  blobPathname: string;
  blobUrl: string;
  mimeType: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  sha256: string;
}): Promise<AssetRow> {
  const db = await getStudioDb();
  await db.insert(studioAssets).values(input).onConflictDoNothing();
  const [asset] = await db.select().from(studioAssets).where(and(
    eq(studioAssets.intakeId, input.intakeId),
    eq(studioAssets.sha256, input.sha256),
    eq(studioAssets.role, input.role),
  )).limit(1);
  if (!asset) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The image could not be saved.", "Try again.");
  return asset;
}

export async function getOwnedAsset(input: {
  intakeId: string;
  assetId: string;
  subject: string;
}): Promise<AssetRow> {
  await ownedIntake(input.intakeId, input.subject);
  const [asset] = await (await getStudioDb()).select().from(studioAssets).where(and(
    eq(studioAssets.id, input.assetId),
    eq(studioAssets.intakeId, input.intakeId),
  )).limit(1);
  if (!asset) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That image was not found.", "Return to the intake.");
  return asset;
}

export async function listOwnedAssets(intakeId: string, subject: string): Promise<AssetRow[]> {
  await ownedIntake(intakeId, subject);
  return (await getStudioDb()).select().from(studioAssets).where(eq(studioAssets.intakeId, intakeId));
}

export async function createOrReuseGeneration(input: typeof studioGenerations.$inferInsert): Promise<GenerationRow> {
  const db = await getStudioDb();
  await db.insert(studioGenerations).values(input).onConflictDoNothing();
  const [row] = await db.select().from(studioGenerations).where(and(
    eq(studioGenerations.intakeId, input.intakeId),
    eq(studioGenerations.fingerprint, input.fingerprint),
  )).limit(1);
  if (!row) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Generation could not start.", "Try again.");
  return row;
}

export async function claimGeneration(id: string): Promise<boolean> {
  const rows = await (await getStudioDb()).update(studioGenerations).set({
    state: "RUNNING",
    updatedAt: new Date(),
  }).where(and(
    eq(studioGenerations.id, id),
    eq(studioGenerations.state, "PENDING"),
  )).returning({ id: studioGenerations.id });
  return rows.length === 1;
}

export async function updateGeneration(id: string, update: Partial<typeof studioGenerations.$inferInsert>): Promise<void> {
  await (await getStudioDb()).update(studioGenerations).set({ ...update, updatedAt: new Date() }).where(eq(studioGenerations.id, id));
}

export async function appendDecision(input: {
  intakeId: string;
  generationId?: string | null;
  actorSubject: string;
  decision: "KEEP" | "EDIT" | "REJECT" | "RETRY";
  note?: string;
}): Promise<void> {
  await (await getStudioDb()).insert(studioDecisions).values({ ...input, generationId: input.generationId || null });
}

export async function commitWardrobeItem(input: {
  intakeId: string;
  operatorSubject: string;
  facts: IntakeFacts;
  approvedAssetId: string;
}): Promise<OperatorSafeWardrobeItem> {
  const db = await getStudioDb();
  await db.insert(studioWardrobeItems).values({
    intakeId: input.intakeId,
    operatorSubject: input.operatorSubject,
    ...input.facts,
    approvedAssetId: input.approvedAssetId,
  }).onConflictDoNothing();
  const [item] = await db.select().from(studioWardrobeItems).where(eq(studioWardrobeItems.intakeId, input.intakeId)).limit(1);
  if (!item) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The garment could not be saved.", "Try again.");
  await db.execute(sql`
    insert into studio_garment_events (
      wardrobe_item_id, operator_subject, event_type, summary, details, occurred_at
    )
    select ${item.id}::uuid, ${input.operatorSubject}, 'COMMITTED', 'Saved to Wardrobe',
      jsonb_build_object('intakeId', ${input.intakeId}), ${item.createdAt}
    where not exists (
      select 1 from studio_garment_events
      where wardrobe_item_id = ${item.id}::uuid and event_type = 'COMMITTED'
    )
  `);
  return mapWardrobeItem(item);
}

export async function listWardrobeItems(subject: string): Promise<OperatorSafeWardrobeItem[]> {
  const rows = await (await getStudioDb()).select().from(studioWardrobeItems).where(
    eq(studioWardrobeItems.operatorSubject, subject),
  ).orderBy(desc(studioWardrobeItems.updatedAt));
  return rows.map(mapWardrobeItem);
}

export async function getOwnedWardrobeItem(id: string, subject: string) {
  const [item] = await (await getStudioDb()).select().from(studioWardrobeItems).where(and(
    eq(studioWardrobeItems.id, id),
    eq(studioWardrobeItems.operatorSubject, subject),
  )).limit(1);
  if (!item) throw new StudioEngineError("INTAKE_NOT_FOUND", 404, "That garment was not found.", "Return to Wardrobe.");
  return item;
}

export async function ensureLuluV3Profile(input: {
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
}): Promise<ModelProfileRow> {
  if (
    input.sha256 !== "ef88e65e78780101693720fd872c23857e4311412900acb28fdc139b08a373b8"
    || input.width !== 972
    || input.height !== 1619
  ) {
    throw new StudioEngineError("INVALID_ASSET", 503, "Lulu authority did not verify.", "Ask an administrator to restore the approved V3 master.");
  }
  const db = await getStudioDb();
  await db.insert(studioModelProfiles).values({
    operatorSubject: null,
    name: "Lulu",
    authorityId: "lulu-v3",
    kind: "LULU_V3",
    sourceBlobPathname: input.blobPathname,
    sourceMimeType: input.mimeType,
    sourceByteSize: input.byteSize,
    sourceWidth: input.width,
    sourceHeight: input.height,
    sourceSha256: input.sha256,
    licenseUrl: null,
    authority: {
      canonVersion: "3.0.0",
      approvalState: "IDENTITY_MASTER_USER_APPROVED",
      approvedOn: "2026-08-10",
      approvedBy: "user",
      privacy: "PRIVATE_PRODUCTION_ONLY",
      publishable: false,
      allowedUse: "Private justurban wears Studio try-on generation.",
      restrictedUse: "Never expose the identity master or publish it as product media.",
    },
    authorityConfirmedAt: new Date("2026-08-10T00:00:00.000Z"),
  }).onConflictDoNothing();
  const [profile] = await db.select().from(studioModelProfiles).where(eq(studioModelProfiles.authorityId, "lulu-v3")).limit(1);
  if (!profile) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Lulu is unavailable.", "Choose another model.");
  if (
    profile.kind !== "LULU_V3"
    || profile.sourceSha256 !== input.sha256
    || profile.sourceWidth !== input.width
    || profile.sourceHeight !== input.height
  ) {
    throw new StudioEngineError("INVALID_ASSET", 503, "Lulu authority did not verify.", "Ask an administrator to restore the approved V3 master.");
  }
  return profile;
}

export async function createOrReuseStockModel(input: {
  operatorSubject: string;
  name: string;
  authorityId: string;
  blobPathname: string;
  mimeType: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  sha256: string;
  licenseUrl: string;
}): Promise<ModelProfileRow> {
  const db = await getStudioDb();
  await db.insert(studioModelProfiles).values({
    operatorSubject: input.operatorSubject,
    name: input.name,
    authorityId: input.authorityId,
    kind: "AUTHORIZED_STOCK",
    sourceBlobPathname: input.blobPathname,
    sourceMimeType: input.mimeType,
    sourceByteSize: input.byteSize,
    sourceWidth: input.width,
    sourceHeight: input.height,
    sourceSha256: input.sha256,
    licenseUrl: input.licenseUrl,
    authority: {
      adultConfirmed: true,
      operatorAuthorityConfirmed: true,
      sourceUrl: input.licenseUrl,
      licenseUrl: input.licenseUrl,
      privacy: "PRIVATE_PRODUCTION_ONLY",
      publishable: false,
      allowedUse: "Private Studio try-on generation.",
      restrictedUse: "No publication without a separate public-media approval.",
    },
    authorityConfirmedAt: new Date(),
  }).onConflictDoNothing();
  const [profile] = await db.select().from(studioModelProfiles).where(and(
    eq(studioModelProfiles.authorityId, input.authorityId),
    eq(studioModelProfiles.operatorSubject, input.operatorSubject),
  )).limit(1);
  if (!profile) throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "The model could not be saved.", "Try again.");
  return profile;
}

export async function listOwnedModelProfiles(subject: string): Promise<ModelProfileRow[]> {
  return (await getStudioDb()).select().from(studioModelProfiles).where(
    sql`${studioModelProfiles.operatorSubject} = ${subject} or ${studioModelProfiles.kind} = 'LULU_V3'`,
  ).orderBy(studioModelProfiles.createdAt);
}

export async function getOwnedModelProfile(id: string, subject: string): Promise<ModelProfileRow> {
  const [profile] = await (await getStudioDb()).select().from(studioModelProfiles).where(and(
    eq(studioModelProfiles.id, id),
    sql`(${studioModelProfiles.operatorSubject} = ${subject} or ${studioModelProfiles.kind} = 'LULU_V3')`,
    eq(studioModelProfiles.state, "READY"),
  )).limit(1);
  if (!profile) throw new StudioEngineError("INVALID_REQUEST", 400, "Choose an approved model.", "Add or select a ready model.");
  return profile;
}

export function mapModelProfile(profile: ModelProfileRow, wardrobeItemId: string): OperatorSafeModelProfile {
  return {
    id: profile.id,
    name: profile.name,
    kind: profile.kind as OperatorSafeModelProfile["kind"],
    state: "READY",
    sourceAssetUrl: `/api/studio/wardrobe/${wardrobeItemId}/models/${profile.id}/asset`,
  };
}

function mapWardrobeItem(item: typeof studioWardrobeItems.$inferSelect): OperatorSafeWardrobeItem {
  return {
    id: item.id,
    intakeId: item.intakeId,
    title: item.title,
    category: item.category as IntakeFacts["category"],
    colour: item.colour,
    sizeLabel: item.sizeLabel,
    condition: item.condition,
    price: item.price,
    quantity: 1,
    state: item.state as "DRAFT" | "READY" | "ARCHIVED",
    approvedAssetId: item.approvedAssetId,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
  };
}

export async function latestGenerationForIntake(intakeId: string): Promise<GenerationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(eq(studioGenerations.intakeId, intakeId)).orderBy(desc(studioGenerations.createdAt)).limit(1);
  return row ?? null;
}

export async function listGenerationsForIntake(intakeId: string): Promise<GenerationRow[]> {
  return (await getStudioDb()).select().from(studioGenerations).where(
    eq(studioGenerations.intakeId, intakeId),
  ).orderBy(studioGenerations.createdAt);
}

export async function getGeneration(id: string, intakeId: string): Promise<GenerationRow | null> {
  const [row] = await (await getStudioDb()).select().from(studioGenerations).where(and(
    eq(studioGenerations.id, id),
    eq(studioGenerations.intakeId, intakeId),
  )).limit(1);
  return row ?? null;
}

export async function getAssetsByIds(ids: string[]): Promise<AssetRow[]> {
  return ids.length ? (await getStudioDb()).select().from(studioAssets).where(inArray(studioAssets.id, ids)) : [];
}
