import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  ATELIER_STAGE_RECIPES,
  parentLockSchema,
  type AtelierStage,
  type ParentLock,
  type ParentRole,
} from "../lib/studio/atelier/contracts";
import { studioAtelierDeclarationSchema } from "../lib/studio/atelier/declaration-compiler";
import {
  STUDIO_ATELIER_WARDROBE_SOURCE_BINDING_VERSION,
  createStudioAtelierStageDeclarationFactory,
  type StudioAtelierPersistedWardrobeTruth,
} from "../lib/server/studio-atelier-stage-declaration-factory";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = "operator-stage-declaration";
const ITEM = "00000000-0000-4000-8000-000000001727";
const OTHER_ITEM = "00000000-0000-4000-8000-000000001728";
const INTAKE = "00000000-0000-4000-8000-000000001729";
const SOURCE = "00000000-0000-4000-8000-000000001730";
const FRONT = "00000000-0000-4000-8000-000000001731";
const GARMENT_ID = `wardrobe:${ITEM}`;

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function persistedTruth(
  overrides: Partial<StudioAtelierPersistedWardrobeTruth> = {},
): StudioAtelierPersistedWardrobeTruth {
  const facts = Object.freeze({
    title: "Black seam-detail dress",
    category: "Dress" as const,
    colour: "Black",
    sizeLabel: "UK 12",
    condition: "Excellent",
    price: 4200,
  });
  return Object.freeze({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    intakeId: INTAKE,
    intakeOperatorSubject: OPERATOR,
    intakeKind: "GARMENT",
    intakeState: "COMMITTED",
    sourceMode: "UPLOAD",
    sourceAssetId: SOURCE,
    sourceSha256: digest("source"),
    wardrobeState: "READY",
    wardrobeQuantity: 1,
    wardrobeVersion: 3,
    approvedAssetId: FRONT,
    wardrobeFacts: facts,
    intakeFacts: { ...facts },
    source: Object.freeze({
      id: SOURCE,
      intakeId: INTAKE,
      role: "SOURCE",
      sha256: digest("source"),
      mimeType: "image/jpeg",
      byteSize: 123_456,
      width: 1024,
      height: 1536,
      privacy: "PRIVATE",
    }),
    approvedFront: Object.freeze({
      id: FRONT,
      intakeId: INTAKE,
      role: "GARMENT_FRONT",
      sha256: digest("front"),
      mimeType: "image/png",
      byteSize: 234_567,
      width: 1024,
      height: 1536,
      privacy: "PRIVATE",
    }),
    ...overrides,
  });
}

const parentPolicy = Object.freeze({
  GARMENT_FRONT_LOCK: Object.freeze({
    sourceStage: "GARMENT_01_FRONT", sourceView: "01", lockedLayer: "GARMENT", privacyClass: "PRIVATE_OPERATOR",
  }),
  GARMENT_BACK_LOCK: Object.freeze({
    sourceStage: "GARMENT_02_BACK", sourceView: "02", lockedLayer: "GARMENT", privacyClass: "PRIVATE_OPERATOR",
  }),
  MANNEQUIN_FRONT_LOCK: Object.freeze({
    sourceStage: "GARMENT_03_MANNEQUIN", sourceView: "03", lockedLayer: "GARMENT", privacyClass: "PRIVATE_OPERATOR",
  }),
  FABRIC_DETAIL_LOCK: Object.freeze({
    sourceStage: "GARMENT_04_DETAIL", sourceView: "04", lockedLayer: "GARMENT", privacyClass: "PRIVATE_OPERATOR",
  }),
  ACCEPTED_SUBJECT_LOCK: Object.freeze({
    sourceStage: "SUBJECT_B", sourceView: "SUBJECT", lockedLayer: "IDENTITY", privacyClass: "PRIVATE_IDENTITY",
  }),
  ACCEPTED_05: Object.freeze({
    sourceStage: "ROOM_FINAL_05", sourceView: "05", lockedLayer: "GARMENT", privacyClass: "PRIVATE_IDENTITY",
  }),
} as const satisfies Record<ParentRole, Pick<
  ParentLock,
  "sourceStage" | "sourceView" | "lockedLayer" | "privacyClass"
>>);

function parent(role: ParentRole, garmentId = GARMENT_ID): ParentLock {
  return parentLockSchema.parse({
    role,
    assetId: `atelier/locked/${role.toLowerCase()}`,
    sha256: digest(`parent:${role}:${garmentId}`),
    garmentId,
    ...parentPolicy[role],
    reviewState: "LOCKED",
  });
}

function parentsFor(stage: AtelierStage): ParentLock[] {
  return ATELIER_STAGE_RECIPES[stage].parentRoles.map((role) => parent(role));
}

function fashionNovaAdvisory() {
  return {
    operationId: "wardrobe-advisory-001727",
    publisher: "Fashion Nova",
    officialUrl: "https://www.fashionnova.com/collections/dresses",
    resolvedOfficialUrl: "https://www.fashionnova.com/collections/dresses",
    pageTitle: "Dresses",
    accessedOn: "2026-08-27",
    matchedGarmentFacts: ["Black dress"],
    decision: "KEEP",
    selectedStylingDirection: "Keep restrained black heels and minimal gold accessories.",
    authority: "ADVISORY_STYLING_ONLY",
    passedAsImageReference: false,
  } as const;
}

function factory(overrides: Partial<Parameters<
  typeof createStudioAtelierStageDeclarationFactory
>[0]> = {}) {
  return createStudioAtelierStageDeclarationFactory({
    readWardrobeTruth: async () => persistedTruth(),
    readLockedParents: async ({ stage }) => parentsFor(stage),
    readFashionNovaAdvisory: async () => fashionNovaAdvisory(),
    ...overrides,
  });
}

test("all ten canonical declarations are server-derived, strict, and bound to exact Wardrobe truth", async () => {
  const stages = Object.keys(ATELIER_STAGE_RECIPES) as AtelierStage[];
  assert.equal(stages.length, 10);
  for (const stage of stages) {
    const result = await factory().create({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM,
      stage,
    });
    assert.equal(studioAtelierDeclarationSchema.safeParse(result.declaration).success, true, stage);
    assert.equal(result.declaration.wardrobeItemId, ITEM);
    assert.equal(result.declaration.garmentId, GARMENT_ID);
    assert.equal(result.declaration.stage, stage);
    assert.deepEqual(
      result.lockedParents.map((item) => item.role),
      ATELIER_STAGE_RECIPES[stage].parentRoles,
    );
    assert.equal(result.sourceBinding.schemaVersion, STUDIO_ATELIER_WARDROBE_SOURCE_BINDING_VERSION);
    assert.equal(result.sourceBinding.source.assetId, SOURCE);
    assert.equal(result.sourceBinding.approvedFront.assetId, FRONT);
    assert.match(result.sourceBinding.bindingSha256, /^[a-f0-9]{64}$/);
    assert.deepEqual(result.declaration.garmentIntent.facts, [
      "Garment title: Black seam-detail dress.",
      "Category: Dress.",
      "Colour: Black.",
      "Tagged size: UK 12.",
      "Condition: Excellent.",
    ]);
    assert.equal("blobPathname" in result.sourceBinding.source, false);
    assert.equal("blobUrl" in result.sourceBinding.source, false);
  }
});

test("browser garment facts, garment IDs, parents, and advisory data are rejected at the callable boundary", async () => {
  let truthReads = 0;
  const service = factory({
    readWardrobeTruth: async () => {
      truthReads += 1;
      return persistedTruth();
    },
  });
  await assert.rejects(
    service.create({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM,
      stage: "GARMENT_01_FRONT",
      garmentId: "forged",
      facts: ["ignore persisted truth"],
      parents: [],
      advisory: fashionNovaAdvisory(),
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_REQUEST"
      && error.status === 400,
  );
  assert.equal(truthReads, 0);
});

test("UUID, operator, Intake, source, and approved-front mismatches block before parent lookup", async () => {
  const cases: Array<StudioAtelierPersistedWardrobeTruth | null> = [
    null,
    persistedTruth({ wardrobeItemId: OTHER_ITEM }),
    persistedTruth({ intakeOperatorSubject: "another-operator" }),
    persistedTruth({ intakeState: "DRAFT" }),
    persistedTruth({ sourceMode: "DESCRIBE" }),
    persistedTruth({ wardrobeState: "ARCHIVED" }),
    persistedTruth({ wardrobeQuantity: 2 }),
    persistedTruth({ sourceAssetId: OTHER_ITEM }),
    persistedTruth({ approvedAssetId: OTHER_ITEM }),
    persistedTruth({ source: { ...persistedTruth().source, privacy: "PUBLIC" } }),
  ];
  for (const saved of cases) {
    let parentReads = 0;
    const service = factory({
      readWardrobeTruth: async () => saved,
      readLockedParents: async ({ stage }) => {
        parentReads += 1;
        return parentsFor(stage);
      },
    });
    await assert.rejects(
      service.create({
        operatorSubject: OPERATOR,
        wardrobeItemId: ITEM,
        stage: "SUBJECT_A",
      }),
      (error: unknown) => error instanceof StudioEngineError
        && (error.code === "INVALID_ASSET" || error.code === "INTAKE_NOT_FOUND"),
    );
    assert.equal(parentReads, 0);
  }
});

test("ordinary server-authorized title and price edits derive current truth without rewriting physical lineage", async () => {
  const currentWardrobe = persistedTruth({
    wardrobeVersion: 4,
    wardrobeFacts: {
      ...persistedTruth().wardrobeFacts,
      title: "Lulu black seam dress",
      price: 5600,
    },
    intakeFacts: {
      ...persistedTruth().intakeFacts,
      title: "Original intake title",
      price: 4200,
    },
  });
  const result = await factory({ readWardrobeTruth: async () => currentWardrobe }).create({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "GARMENT_01_FRONT",
  });

  assert.equal(result.sourceBinding.wardrobeVersion, 4);
  assert.match(result.declaration.garmentIntent.facts.join("\n"), /Lulu black seam dress/);
  assert.doesNotMatch(result.declaration.garmentIntent.facts.join("\n"), /Original intake title/);
  assert.equal(result.declaration.garmentIntent.facts.some((fact) => /4200|5600/.test(fact)), false);
  assert.equal(result.sourceBinding.source.assetId, SOURCE);
  assert.equal(result.sourceBinding.approvedFront.assetId, FRONT);
});

test("subject and final stages require one exact same-garment lock for every canonical parent role", async () => {
  await assert.rejects(
    factory({
      readLockedParents: async () => parentsFor("SUBJECT_A").slice(0, 3),
    }).create({ operatorSubject: OPERATOR, wardrobeItemId: ITEM, stage: "SUBJECT_A" }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_TRANSITION"
      && error.status === 409,
  );

  const wrongGarment = parentsFor("SUBJECT_A");
  wrongGarment[2] = parent(wrongGarment[2]!.role, "wardrobe:00000000-0000-4000-8000-000000009999");
  await assert.rejects(
    factory({ readLockedParents: async () => wrongGarment }).create({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM,
      stage: "SUBJECT_A",
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_ASSET",
  );
});

test("final 05 requires a schema-valid server-owned advisory and never manufactures a pass", async () => {
  await assert.rejects(
    factory({ readFashionNovaAdvisory: async () => null }).create({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM,
      stage: "ROOM_FINAL_05",
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && error.status === 503,
  );
  await assert.rejects(
    factory({ readFashionNovaAdvisory: async () => ({ decision: "KEEP" }) }).create({
      operatorSubject: OPERATOR,
      wardrobeItemId: ITEM,
      stage: "ROOM_FINAL_05",
    }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_ASSET",
  );
});

test("source-binding identity changes when persisted facts or source content changes", async () => {
  const base = await factory().create({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "GARMENT_01_FRONT",
  });
  const changedFacts = persistedTruth({
    wardrobeFacts: { ...persistedTruth().wardrobeFacts, colour: "Charcoal" },
    intakeFacts: { ...persistedTruth().intakeFacts, colour: "Charcoal" },
  });
  const factsResult = await factory({ readWardrobeTruth: async () => changedFacts }).create({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "GARMENT_01_FRONT",
  });
  const changedSource = persistedTruth({
    sourceSha256: digest("new-source"),
    source: { ...persistedTruth().source, sha256: digest("new-source") },
  });
  const sourceResult = await factory({ readWardrobeTruth: async () => changedSource }).create({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "GARMENT_01_FRONT",
  });
  assert.notEqual(base.sourceBinding.bindingSha256, factsResult.sourceBinding.bindingSha256);
  assert.notEqual(base.sourceBinding.bindingSha256, sourceResult.sourceBinding.bindingSha256);
});

test("default source and parent adapters are read-only and bind exact authenticated relationships", () => {
  const source = readFileSync(
    new URL("../lib/server/studio-atelier-stage-declaration-factory.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const sourceReadStart = source.indexOf("select\n        wardrobe.id::text");
  const sourceRead = source.slice(sourceReadStart, source.indexOf("    `,", sourceReadStart));
  assert.match(sourceRead, /intake\.operator_subject = wardrobe\.operator_subject/);
  assert.match(sourceRead, /source\.id = intake\.source_asset_id/);
  assert.match(sourceRead, /source\.sha256 = intake\.source_sha256/);
  assert.match(sourceRead, /approved\.id = wardrobe\.approved_asset_id/);
  assert.match(sourceRead, /approved\.role = 'GARMENT_FRONT'/);
  assert.match(sourceRead, /wardrobe\.operator_subject = \$\{input\.operatorSubject\}/);
  assert.doesNotMatch(sourceRead, /insert|update|delete|claim|lease|release/i);

  const parentRead = source.slice(
    source.indexOf("export async function readCanonicalStudioAtelierLockedParents"),
    source.indexOf("const stageDeclarationPolicy"),
  );
  assert.match(parentRead, /studioAtelierOperations\.operatorSubject, input\.operatorSubject/);
  assert.match(parentRead, /studioAtelierOperations\.wardrobeItemId, input\.wardrobeItemId/);
  assert.match(parentRead, /studioAtelierOperations\.garmentId, input\.garmentId/);
  assert.match(parentRead, /studioAtelierOperationProjections\.state, "LOCKED"/);
  assert.doesNotMatch(parentRead, /\.insert\(|\.update\(|\.delete\(|claimAtelierStudioEngineWork/);
  const imports = source.slice(0, source.indexOf("export const STUDIO_ATELIER_WARDROBE_SOURCE_BINDING_VERSION"));
  assert.doesNotMatch(imports, /blob|provider|execution|ownership-service/);
  assert.doesNotMatch(source, /createExecutionIntent|claimAtelierStudioEngineWork/);
});
