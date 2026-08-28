import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioAtelierEligibilityService,
  projectStudioAtelierEligibility,
  STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER,
  type StudioAtelierEligibilityEvidence,
} from "../lib/server/studio-atelier-eligibility-service";
import { ATELIER_STAGE_RECIPES } from "../lib/studio/atelier/contracts";
import { StudioEngineError } from "../lib/studio/engine/errors";

const WARDROBE_ITEM_ID = "638e744d-2639-4e0d-8775-35d09f027dd3";
const OPERATION_ID = "5a76103b-9d57-4fe9-97b1-7a45b67af562";

type StageEvidence = StudioAtelierEligibilityEvidence["stages"][number];

function evidence(input: Readonly<{
  runtimeReady?: boolean;
  stages?: Readonly<Partial<Record<StageEvidence["stage"], Partial<StageEvidence>>>>;
  itemState?: "DRAFT" | "READY" | "ARCHIVED";
  installedCommands?: Partial<StudioAtelierEligibilityEvidence["installedCommands"]>;
}> = {}): StudioAtelierEligibilityEvidence {
  return {
    wardrobeItem: {
      title: "Lulu emerald dress",
      state: input.itemState ?? "DRAFT",
      version: 8,
    },
    legacyIntakeAvailable: true,
    installedCommands: {
      prepare: input.installedCommands?.prepare ?? true,
      run: input.installedCommands?.run ?? true,
      decision: input.installedCommands?.decision ?? true,
    },
    stages: STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map((stage) => ({
      stage,
      source: "VERIFIED" as const,
      presentLockedParents: ATELIER_STAGE_RECIPES[stage].parentRoles.length,
      ownership: "UNCLAIMED" as const,
      declaration: "SERVER_DERIVED" as const,
      runtime: input.runtimeReady
        ? { state: "READY" as const, blockerCode: null }
        : {
            state: "BLOCKED" as const,
            blockerCode: "QUALIFICATION_NOT_PASSED" as const,
          },
      operation: null,
      ...input.stages?.[stage],
    })),
  };
}

function operation(
  overrides: Partial<NonNullable<StageEvidence["operation"]>> = {},
): NonNullable<StageEvidence["operation"]> {
  return {
    operationId: OPERATION_ID,
    state: "DRAFT",
    candidateVisibility: "HIDDEN",
    nextAction: "GENERATE",
    fixOneThingAvailable: false,
    ...overrides,
  };
}

function commandStates(stage: ReturnType<typeof projectStudioAtelierEligibility>["stages"][number]) {
  return Object.fromEntries(
    Object.entries(stage.commands).map(([name, capability]) => [name, capability.state]),
  );
}

test("qualification absence yields a truthful recovery-only, zero-command projection", () => {
  const projection = projectStudioAtelierEligibility(evidence());

  assert.equal(projection.mode, "RECOVERY_ONLY");
  assert.deepEqual(projection.legacyIntake, { available: true });
  assert.equal(projection.stages.length, 10);
  for (const stage of projection.stages) {
    assert.equal(stage.status, "BLOCKED");
    assert.equal(stage.primaryCommand, "NONE");
    assert.equal(stage.operation, null);
    assert.equal(stage.commands.recover.state, "NOT_APPLICABLE");
    assert.equal(stage.commands.prepare.state, "BLOCKED");
    assert.equal(stage.commands.prepare.blocker?.code, "QUALIFICATION_NOT_PASSED");
    assert.equal(
      Object.values(stage.commands).some((capability) => capability.state === "AVAILABLE"),
      false,
    );
  }
});

test("a durable operation remains recoverable while every mutation fails closed", () => {
  const firstStage = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER[0];
  const projection = projectStudioAtelierEligibility(evidence({
    stages: {
      [firstStage]: {
        ownership: "ATELIER",
        operation: operation(),
      },
    },
  }));
  const stage = projection.stages[0];

  assert.equal(projection.mode, "RECOVERY_ONLY");
  assert.equal(stage.status, "EXISTING");
  assert.equal(stage.operation?.state, "PREPARED");
  assert.equal(stage.operation?.media, "HIDDEN");
  assert.equal(stage.operation?.recoveryHref, `/studio/media/atelier/${OPERATION_ID}`);
  assert.equal(stage.primaryCommand, "RECOVER");
  assert.deepEqual(commandStates(stage), {
    recover: "AVAILABLE",
    prepare: "NOT_APPLICABLE",
    run: "BLOCKED",
    keep: "NOT_APPLICABLE",
    fixOneThing: "NOT_APPLICABLE",
    reject: "NOT_APPLICABLE",
  });
  assert.equal(stage.commands.run.blocker?.code, "QUALIFICATION_NOT_PASSED");
});

test("commands become available only from explicit installed, eligible server evidence", () => {
  const firstStage = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER[0];
  const ready = projectStudioAtelierEligibility(evidence({ runtimeReady: true }));
  assert.equal(ready.mode, "COMMANDS_AVAILABLE");
  assert.equal(ready.stages[0].commands.prepare.state, "AVAILABLE");
  assert.equal(ready.stages[0].primaryCommand, "PREPARE");

  const notInstalled = projectStudioAtelierEligibility(evidence({
    runtimeReady: true,
    installedCommands: { prepare: false },
  }));
  assert.equal(notInstalled.mode, "RECOVERY_ONLY");
  assert.equal(notInstalled.stages[0].commands.prepare.blocker?.code, "COMMAND_NOT_INSTALLED");

  const unverified = projectStudioAtelierEligibility(evidence({
    runtimeReady: true,
    stages: { [firstStage]: { source: "MISSING" } },
  }));
  assert.equal(unverified.stages[0].commands.prepare.blocker?.code, "SOURCE_NOT_VERIFIED");
});

test("only exact semantic-pass review media enables bounded human decisions", () => {
  const firstStage = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER[0];
  const reviewable = projectStudioAtelierEligibility(evidence({
    runtimeReady: true,
    stages: {
      [firstStage]: {
        ownership: "ATELIER",
        operation: operation({
          state: "SEMANTIC_PASS",
          candidateVisibility: "REVIEWABLE",
          nextAction: "REVIEW",
          fixOneThingAvailable: true,
        }),
      },
    },
  })).stages[0];

  assert.deepEqual(reviewable.operation, {
    state: "REVIEWABLE",
    media: "REVIEWABLE",
    recoveryHref: `/studio/media/atelier/${OPERATION_ID}`,
  });
  assert.equal(reviewable.primaryCommand, "KEEP");
  assert.equal(reviewable.commands.keep.state, "AVAILABLE");
  assert.equal(reviewable.commands.fixOneThing.state, "AVAILABLE");
  assert.equal(reviewable.commands.reject.state, "AVAILABLE");

  const inconsistent = projectStudioAtelierEligibility(evidence({
    runtimeReady: true,
    stages: {
      [firstStage]: {
        ownership: "ATELIER",
        operation: operation({
          state: "TECHNICAL_PASS",
          candidateVisibility: "REVIEWABLE",
          nextAction: "REVIEW",
          fixOneThingAvailable: true,
        }),
      },
    },
  })).stages[0];
  assert.deepEqual(inconsistent.operation, {
    state: "WORKING_PRIVATE",
    media: "HIDDEN",
    recoveryHref: `/studio/media/atelier/${OPERATION_ID}`,
  });
  assert.equal(inconsistent.commands.keep.state, "NOT_APPLICABLE");
  assert.equal(inconsistent.commands.fixOneThing.state, "NOT_APPLICABLE");
  assert.equal(inconsistent.commands.reject.state, "NOT_APPLICABLE");
});

test("unverified ownership blocks mutation without mislabeling it as legacy work", () => {
  const firstStage = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER[0];
  const stage = projectStudioAtelierEligibility(evidence({
    runtimeReady: true,
    stages: {
      [firstStage]: {
        ownership: "UNCLAIMED",
        operation: operation(),
      },
    },
  })).stages[0];

  assert.equal(stage.commands.recover.state, "AVAILABLE");
  assert.equal(stage.commands.run.state, "BLOCKED");
  assert.equal(stage.commands.run.blocker?.code, "OWNERSHIP_NOT_VERIFIED");
});

test("locked work is recovery-first and does not expose a decorative Keep command", () => {
  const firstStage = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER[0];
  const stage = projectStudioAtelierEligibility(evidence({
    runtimeReady: true,
    stages: {
      [firstStage]: {
        ownership: "ATELIER",
        operation: operation({
          state: "LOCKED",
          candidateVisibility: "REVIEWABLE",
          nextAction: "USE_LOCKED",
        }),
      },
    },
  })).stages[0];

  assert.deepEqual(stage.operation, {
    state: "LOCKED",
    media: "REVIEWABLE",
    recoveryHref: `/studio/media/atelier/${OPERATION_ID}`,
  });
  assert.equal(stage.commands.keep.state, "NOT_APPLICABLE");
  assert.equal(stage.primaryCommand, "RECOVER");
});

test("invalid or incomplete server evidence fails closed with a fixed public error", () => {
  const invalid = evidence();
  invalid.stages = invalid.stages.slice(0, -1);

  assert.throws(
    () => projectStudioAtelierEligibility(invalid),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && error.status === 503,
  );
});

test("the public projection contains no identifiers, hashes, locators, or provider policy", () => {
  const projection = projectStudioAtelierEligibility(evidence());
  const serialized = JSON.stringify(projection);

  assert.doesNotMatch(serialized, /operationId|wardrobeItemId|garmentId|assetId/i);
  assert.doesNotMatch(serialized, /sha256|contentHash|artifactHash|receiptHash/i);
  assert.doesNotMatch(serialized, /https?:|blob:|file:|pathname|locator/i);
  assert.doesNotMatch(serialized, /provider|modelId|prompt|costPolicy|authorityStack/i);
});

test("recovery exposes only the opaque app-owned route for an exact authorized operation", () => {
  const firstStage = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER[0];
  const projection = projectStudioAtelierEligibility(evidence({
    stages: {
      [firstStage]: {
        ownership: "ATELIER",
        operation: operation(),
      },
    },
  }));
  const serialized = JSON.stringify(projection);

  assert.equal(
    projection.stages[0].operation?.recoveryHref,
    `/studio/media/atelier/${OPERATION_ID}`,
  );
  assert.doesNotMatch(serialized, /"operationId"|https?:|blob:|file:|pathname|locator/i);
});

test("the injected service passes only operator/item identity and normalizes resolver failure", async () => {
  const calls: unknown[] = [];
  const service = createStudioAtelierEligibilityService({
    async readEvidence(input) {
      calls.push(input);
      return evidence();
    },
  });
  const projection = await service.read("operator-eligibility", WARDROBE_ITEM_ID);

  assert.equal(projection.mode, "RECOVERY_ONLY");
  assert.deepEqual(calls, [{
    operatorSubject: "operator-eligibility",
    wardrobeItemId: WARDROBE_ITEM_ID,
  }]);

  const failing = createStudioAtelierEligibilityService({
    async readEvidence() {
      throw new Error("sensitive repository detail");
    },
  });
  await assert.rejects(
    failing.read("operator-eligibility", WARDROBE_ITEM_ID),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && !error.message.includes("sensitive"),
  );
});
