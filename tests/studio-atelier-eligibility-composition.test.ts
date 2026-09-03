import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  createStudioAtelierEligibilityEvidenceResolver,
  type StudioAtelierEligibilityCompositionPorts,
} from "../lib/server/studio-atelier-eligibility-composition";
import {
  createStudioAtelierEligibilityService,
  STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER,
} from "../lib/server/studio-atelier-eligibility-service";
import type { AtelierStage } from "../lib/studio/atelier/contracts";
import { StudioEngineError } from "../lib/studio/engine/errors";

const WARDROBE_ITEM_ID = "638e744d-2639-4e0d-8775-35d09f027dd3";
const OPERATION_ID = "5a76103b-9d57-4fe9-97b1-7a45b67af562";
const OPERATOR = "operator-eligibility-composition";

test("read-only eligibility excludes paid runtime and image composition imports", async () => {
  const [composition, projectionReader, productionScope, qualificationResolver] = await Promise.all([
    readFile(
      new URL("../lib/server/studio-atelier-eligibility-composition.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/server/studio-atelier-durable-projection-reader.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/server/studio-atelier-production-scope.ts", import.meta.url),
      "utf8",
    ),
    readFile(
      new URL("../lib/server/studio-atelier-qualified-evaluator-resolver.ts", import.meta.url),
      "utf8",
    ),
  ]);

  assert.doesNotMatch(composition, /from "\.\/studio-atelier-durable-engine"/);
  assert.match(composition, /import type \{ StudioAtelierProductionRuntime \}/);
  assert.match(composition, /from "\.\/studio-atelier-durable-projection-reader"/);
  assert.match(composition, /from "\.\/studio-atelier-production-scope"/);
  assert.match(composition, /from "\.\/studio-atelier-qualified-evaluator-resolver"/);
  assert.doesNotMatch(projectionReader, /sharp|lock-service|execution-service|production-runtime/);
  assert.doesNotMatch(productionScope, /sharp|lock-service|execution-service|production-runtime/);
  assert.doesNotMatch(qualificationResolver, /sharp|lock-service|execution-service|production-runtime/);
});

function runtimeEvidence() {
  return Object.fromEntries(STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map((stage) => [
    stage,
    { state: "BLOCKED" as const, blockerCode: "QUALIFICATION_NOT_PASSED" as const },
  ])) as Readonly<Record<AtelierStage, Readonly<{
    state: "BLOCKED";
    blockerCode: "QUALIFICATION_NOT_PASSED";
  }>>>;
}

function ports(
  overrides: Partial<StudioAtelierEligibilityCompositionPorts> = {},
): Partial<StudioAtelierEligibilityCompositionPorts> {
  return {
    async readWardrobeItem(operatorSubject, wardrobeItemId) {
      assert.equal(operatorSubject, OPERATOR);
      assert.equal(wardrobeItemId, WARDROBE_ITEM_ID);
      return {
        id: WARDROBE_ITEM_ID,
        title: "Lulu emerald dress",
        state: "DRAFT",
        version: 4,
        approvedAssetId: null,
      };
    },
    async readSourceContext() {
      return { status: "MISSING", garmentId: null, truth: null, lockedParents: [] };
    },
    async readCurrentOperations() {
      return [{
        operationId: OPERATION_ID,
        stage: "GARMENT_01_FRONT",
        correctionUsed: false,
      }];
    },
    async readProjection(operatorSubject, operationId) {
      assert.equal(operatorSubject, OPERATOR);
      assert.equal(operationId, OPERATION_ID);
      return {
        operationId,
        stage: "GARMENT_01_FRONT",
        view: "01",
        state: "DRAFT",
        version: 1,
        candidateVisibility: "HIDDEN",
        nextAction: "GENERATE",
        reused: true,
      };
    },
    async readOwnership(input) {
      assert.equal(input.operatorSubject, OPERATOR);
      assert.equal(input.wardrobeItemId, WARDROBE_ITEM_ID);
      return { state: "OWNED", owner: "ATELIER" };
    },
    async readRuntime() {
      return runtimeEvidence();
    },
    async canDeriveDeclaration() {
      return false;
    },
    ...overrides,
  };
}

test("composition binds every read to the authenticated item and keeps all ten stages ordered", async () => {
  const service = createStudioAtelierEligibilityService({
    readEvidence: createStudioAtelierEligibilityEvidenceResolver(ports()),
  });

  const projection = await service.read(OPERATOR, WARDROBE_ITEM_ID);

  assert.deepEqual(
    projection.stages.map((stage) => stage.stage),
    STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER,
  );
  assert.equal(projection.mode, "RECOVERY_ONLY");
  assert.equal(projection.stages[0].primaryCommand, "RECOVER");
  assert.equal(
    projection.stages[0].operation?.recoveryHref,
    `/studio/media/atelier/${OPERATION_ID}`,
  );
  assert.equal(projection.legacyIntake.available, true);
  assert.equal(projection.stages.some((stage) => stage.commands.run.state === "AVAILABLE"), false);
});

test("composition fails closed when the authorized row and durable projection do not match", async () => {
  const service = createStudioAtelierEligibilityService({
    readEvidence: createStudioAtelierEligibilityEvidenceResolver(ports({
      async readProjection(_operatorSubject, operationId) {
        return {
          operationId,
          stage: "GARMENT_02_BACK",
          view: "02",
          state: "DRAFT",
          version: 1,
          candidateVisibility: "HIDDEN",
          nextAction: "GENERATE",
          reused: true,
        };
      },
    })),
  });

  await assert.rejects(
    service.read(OPERATOR, WARDROBE_ITEM_ID),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE",
  );
});

test("an unavailable operation ledger never degrades into a fresh-work projection", async () => {
  const service = createStudioAtelierEligibilityService({
    readEvidence: createStudioAtelierEligibilityEvidenceResolver(ports({
      async readCurrentOperations() {
        throw new Error("operation ledger unavailable");
      },
    })),
  });

  await assert.rejects(
    service.read(OPERATOR, WARDROBE_ITEM_ID),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE",
  );
});
