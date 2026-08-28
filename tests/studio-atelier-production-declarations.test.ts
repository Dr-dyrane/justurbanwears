import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import type { StudioAtelierProductionPorts } from "../lib/server/studio-atelier-production-runtime";
import {
  buildStudioAtelierCorrectionDeclaration,
  createStudioAtelierProductionDeclarationService,
  resolveStudioAtelierInstalledCapability,
} from "../lib/server/studio-atelier-production-declarations";
import {
  createStudioAtelierStageDeclarationFactory,
  type StudioAtelierPersistedWardrobeTruth,
} from "../lib/server/studio-atelier-stage-declaration-factory";

const OPERATOR = "operator-production-declarations";
const ITEM = "00000000-0000-4000-8000-000000009201";
const INTAKE = "00000000-0000-4000-8000-000000009202";
const SOURCE = "00000000-0000-4000-8000-000000009203";
const FRONT = "00000000-0000-4000-8000-000000009204";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function persistedTruth(): StudioAtelierPersistedWardrobeTruth {
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
    wardrobeVersion: 4,
    approvedAssetId: FRONT,
    wardrobeFacts: facts,
    intakeFacts: facts,
    source: Object.freeze({
      id: SOURCE,
      intakeId: INTAKE,
      role: "SOURCE",
      sha256: digest("source"),
      mimeType: "image/jpeg",
      byteSize: 1_000,
      width: 800,
      height: 1200,
      privacy: "PRIVATE",
    }),
    approvedFront: Object.freeze({
      id: FRONT,
      intakeId: INTAKE,
      role: "GARMENT_FRONT",
      sha256: digest("front"),
      mimeType: "image/png",
      byteSize: 2_000,
      width: 1024,
      height: 1536,
      privacy: "PRIVATE",
    }),
  });
}

function declarationResolver() {
  const factory = createStudioAtelierStageDeclarationFactory({
    readWardrobeTruth: async () => persistedTruth(),
    readLockedParents: async () => Object.freeze([]),
    readFashionNovaAdvisory: async () => null,
  });
  return (input: Parameters<typeof factory.create>[0]) => factory.create(input);
}

test("canonical declaration service derives and rechecks the authenticated item", async () => {
  let calls = 0;
  const service = createStudioAtelierProductionDeclarationService({
    resolveCanonicalDeclaration: async (input) => {
      calls += 1;
      return declarationResolver()(input);
    },
  });
  const canonical = await service.derive({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "GARMENT_01_FRONT",
  });
  assert.equal(canonical.declaration.garmentId, `wardrobe:${ITEM}`);
  assert.equal(canonical.sourceBinding.intakeId, INTAKE);
  await service.assertExact({
    operatorSubject: OPERATOR,
    declaration: canonical.declaration,
  });
  assert.equal(calls, 2);

  await assert.rejects(
    service.assertExact({
      operatorSubject: OPERATOR,
      declaration: {
        ...canonical.declaration,
        garmentIntent: {
          ...canonical.declaration.garmentIntent,
          facts: ["Garment title: caller mutation."],
        },
      },
    }),
    /does not equal the current server-derived declaration/,
  );
});

test("bounded corrections preserve the declaration and admit only stage-mutable targets", async () => {
  const base = (await declarationResolver()({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage: "GARMENT_01_FRONT",
  })).declaration;
  const correction = buildStudioAtelierCorrectionDeclaration({
    base,
    sourceSemanticHash: digest("source-operation"),
    decision: {
      decision: "FIX_ONE_THING",
      reason: "WRONG_STAGE_VIEW",
      target: "CAMERA_ALIGNMENT",
    },
  });
  assert.equal(correction.correctionIntent.mode, "BOUNDED_ONE_THING");
  assert.equal(correction.correctionIntent.targetLayer, "CAMERA");
  assert.equal(correction.changes.length, 1);
  assert.deepEqual(correction.garmentIntent, base.garmentIntent);

  assert.throws(
    () => buildStudioAtelierCorrectionDeclaration({
      base,
      sourceSemanticHash: digest("source-operation"),
      decision: {
        decision: "FIX_ONE_THING",
        reason: "BODY_DRIFT",
        target: "BODY_GEOMETRY",
      },
    }),
    /not mutable in the source operation stage/,
  );
});

test("installed capability projection is pure and preserves exact zero-spend blockers", () => {
  let calls = 0;
  const neverCall = () => {
    calls += 1;
    throw new Error("must not run");
  };
  const ports = Object.freeze({
    resolveFileVerification: neverCall,
    resolveTrustedTruth: neverCall,
    resolveExecutionContext: neverCall,
    prepareCorrection: neverCall,
    resolveLockedRoom: neverCall,
  }) as unknown as StudioAtelierProductionPorts;
  const installed = resolveStudioAtelierInstalledCapability({
    readiness: Object.freeze({
      rootSubject: "READY",
      finalScene: "READY",
      constructionAllowed: true,
      blockers: Object.freeze([]),
    }),
    ports,
    resolveProviderRetentionConsent: neverCall,
    resolveAdultLikenessAuthority: neverCall,
    resolveFashionNovaAdvisory: neverCall,
  });
  assert.equal(calls, 0);
  assert.equal(installed.rootSubject, "READY");
  assert.equal(installed.finalScene, "READY");

  const blocked = resolveStudioAtelierInstalledCapability({
    readiness: Object.freeze({
      rootSubject: "BLOCKED",
      finalScene: "BLOCKED",
      constructionAllowed: false,
      blockers: Object.freeze([{
        code: "DATABASE_NOT_VERIFIED",
        scope: "ALL",
        dependency: "database",
        message: "Migration 0017 is not verified.",
      }]),
    }),
    ports,
  });
  assert.equal(blocked.rootSubject, "BLOCKED");
  assert.equal(blocked.finalScene, "BLOCKED");
  assert.deepEqual(
    blocked.blockers.map((item) => item.code),
    [
      "LEDGER_0017_NOT_VERIFIED",
      "PROVIDER_RETENTION_CONSENT_NOT_INSTALLED",
      "ADULT_LIKENESS_AUTHORITY_NOT_INSTALLED",
      "FASHION_NOVA_ADVISORY_NOT_INSTALLED",
    ],
  );
  assert.equal(calls, 0);
});
