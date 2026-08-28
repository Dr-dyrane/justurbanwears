import { z } from "zod";
import {
  ATELIER_STAGE_RECIPES,
  atelierStageSchema,
  type AtelierStage,
} from "../studio/atelier/contracts";
import {
  STUDIO_ATELIER_ELIGIBILITY_SCHEMA_VERSION,
  studioAtelierEligibilityProjectionSchema,
  studioAtelierEligibilityStageSchema,
  type StudioAtelierCommandCapability,
  type StudioAtelierEligibilityBlocker,
  type StudioAtelierEligibilityBlockerCode,
  type StudioAtelierEligibilityProjection,
  type StudioAtelierEligibilityStage,
} from "../studio/atelier/eligibility-contracts";
import { StudioEngineError } from "../studio/engine/errors";

export const STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER = Object.freeze([
  "GARMENT_01_FRONT",
  "GARMENT_02_BACK",
  "GARMENT_03_MANNEQUIN",
  "GARMENT_04_DETAIL",
  "SUBJECT_A",
  "SUBJECT_B",
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
] as const satisfies readonly AtelierStage[]);

const finalSceneStages = new Set<AtelierStage>([
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
]);

const stageLabels = Object.freeze({
  GARMENT_01_FRONT: "Garment front",
  GARMENT_02_BACK: "Garment back",
  GARMENT_03_MANNEQUIN: "Mannequin",
  GARMENT_04_DETAIL: "Garment detail",
  SUBJECT_A: "Subject foundation",
  SUBJECT_B: "Subject refinement",
  ROOM_FINAL_05: "Front master",
  SIBLING_06: "Left profile",
  SIBLING_07_CORE: "Right rear three-quarter",
  SIBLING_07_RECOVERY: "Right rear recovery",
} as const satisfies Record<AtelierStage, string>);

const runtimeBlockerCodeSchema = z.enum([
  "QUALIFICATION_NOT_PASSED",
  "RUNTIME_NOT_INSTALLED",
  "ROOM_NOT_QUALIFIED",
]);

const operationEvidenceSchema = z.object({
  operationId: z.string().uuid(),
  state: z.enum([
    "DRAFT",
    "MATERIALIZED",
    "TECHNICAL_PASS",
    "TECHNICAL_FAIL",
    "SEMANTIC_PASS",
    "SEMANTIC_FAIL",
    "USER_APPROVED",
    "USER_REJECTED",
    "LOCKED",
    "BLOCKED_USER_DIRECTION",
    "SUPERSEDED",
  ]),
  candidateVisibility: z.enum(["HIDDEN", "REVIEWABLE"]),
  nextAction: z.enum([
    "GENERATE",
    "WAIT_FOR_MATERIALIZATION",
    "REVIEW",
    "LOCK_OR_REUSE",
    "USE_LOCKED",
    "RESUME_RECORDED_REVIEW",
    "GENERATE_CORRECTION",
    "USER_DIRECTION_REQUIRED",
    "NONE",
  ]),
  fixOneThingAvailable: z.boolean(),
}).strict();

const runtimeEvidenceSchema = z.discriminatedUnion("state", [
  z.object({ state: z.literal("READY"), blockerCode: z.null() }).strict(),
  z.object({
    state: z.literal("BLOCKED"),
    blockerCode: runtimeBlockerCodeSchema,
  }).strict(),
]);

const stageEvidenceSchema = z.object({
  stage: atelierStageSchema,
  source: z.enum(["VERIFIED", "MISSING", "UNAVAILABLE"]),
  presentLockedParents: z.number().int().nonnegative(),
  ownership: z.enum(["UNCLAIMED", "ATELIER", "LEGACY", "UNVERIFIED"]),
  declaration: z.enum(["SERVER_DERIVED", "BLOCKED"]),
  runtime: runtimeEvidenceSchema,
  operation: operationEvidenceSchema.nullable(),
}).strict();

const eligibilityEvidenceSchema = z.object({
  wardrobeItem: z.object({
    title: z.string().trim().min(1).max(240),
    state: z.enum(["DRAFT", "READY", "ARCHIVED"]),
    version: z.number().int().positive(),
  }).strict(),
  legacyIntakeAvailable: z.boolean(),
  installedCommands: z.object({
    prepare: z.boolean(),
    run: z.boolean(),
    decision: z.boolean(),
  }).strict(),
  stages: z.array(stageEvidenceSchema).length(STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.length),
}).strict().superRefine((evidence, context) => {
  const actual = evidence.stages.map((stage) => stage.stage);
  if (new Set(actual).size !== actual.length) {
    context.addIssue({
      code: "custom",
      path: ["stages"],
      message: "Every Atelier stage must appear exactly once.",
    });
  }
  for (const stage of STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER) {
    if (!actual.includes(stage)) {
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: `Missing Atelier stage ${stage}.`,
      });
    }
  }
  for (const [index, stage] of evidence.stages.entries()) {
    const required = ATELIER_STAGE_RECIPES[stage.stage].parentRoles.length;
    if (stage.presentLockedParents > required) {
      context.addIssue({
        code: "custom",
        path: ["stages", index, "presentLockedParents"],
        message: "Verified locked parents cannot exceed the canonical stage requirement.",
      });
    }
  }
});

export type StudioAtelierEligibilityEvidence = z.input<
  typeof eligibilityEvidenceSchema
>;

export type StudioAtelierEligibilityEvidenceResolver = (input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
}>) => Promise<unknown>;

export type StudioAtelierEligibilityService = Readonly<{
  read(
    operatorSubject: string,
    wardrobeItemId: string,
  ): Promise<StudioAtelierEligibilityProjection>;
}>;

const blockerCopy = Object.freeze({
  QUALIFICATION_NOT_PASSED: Object.freeze({
    title: "Atelier qualification is not installed",
    detail: "This stage stays recovery-only. No generation or decision can start.",
  }),
  RUNTIME_NOT_INSTALLED: Object.freeze({
    title: "Atelier runtime is not installed",
    detail: "This stage stays recovery-only until its server runtime is available.",
  }),
  ROOM_NOT_QUALIFIED: Object.freeze({
    title: "Atelier room is not qualified",
    detail: "Final-scene commands stay blocked until the approved room profile passes qualification.",
  }),
  COMMAND_NOT_INSTALLED: Object.freeze({
    title: "Command is not installed",
    detail: "This server has no callable command for that step.",
  }),
  ITEM_ARCHIVED: Object.freeze({
    title: "Garment is archived",
    detail: "Saved history remains readable, but new Atelier work cannot start.",
  }),
  SOURCE_NOT_VERIFIED: Object.freeze({
    title: "Garment source is not verified",
    detail: "Restore the required direct source before preparing this stage.",
  }),
  PARENTS_NOT_LOCKED: Object.freeze({
    title: "Earlier views are not locked",
    detail: "Keep every required parent before preparing this stage.",
  }),
  OWNED_BY_LEGACY: Object.freeze({
    title: "Continue in current Intake",
    detail: "This stage belongs to the saved legacy workflow and cannot switch engines.",
  }),
  OWNERSHIP_NOT_VERIFIED: Object.freeze({
    title: "Atelier ownership is not verified",
    detail: "Reload the saved garment before continuing this Atelier operation.",
  }),
  DECLARATION_NOT_DERIVED: Object.freeze({
    title: "Server declaration is unavailable",
    detail: "Studio could not derive the exact stage declaration from trusted garment truth.",
  }),
  STATE_NOT_ELIGIBLE: Object.freeze({
    title: "Command does not match saved state",
    detail: "Reread the saved operation and follow its current server action.",
  }),
} as const satisfies Record<StudioAtelierEligibilityBlockerCode, Readonly<{
  title: string;
  detail: string;
}>>);

function blocker(code: StudioAtelierEligibilityBlockerCode): StudioAtelierEligibilityBlocker {
  return Object.freeze({ code, ...blockerCopy[code] });
}

const available = Object.freeze({ state: "AVAILABLE", blocker: null } as const);
const notApplicable = Object.freeze({ state: "NOT_APPLICABLE", blocker: null } as const);

function blocked(code: StudioAtelierEligibilityBlockerCode): StudioAtelierCommandCapability {
  return Object.freeze({ state: "BLOCKED", blocker: blocker(code) });
}

function runtimeBlocker(
  runtime: z.infer<typeof runtimeEvidenceSchema>,
): StudioAtelierEligibilityBlockerCode | null {
  return runtime.state === "BLOCKED" ? runtime.blockerCode : null;
}

function preparationBlocker(input: Readonly<{
  itemState: "DRAFT" | "READY" | "ARCHIVED";
  stage: z.infer<typeof stageEvidenceSchema>;
  requiredLockedParents: number;
  commandInstalled: boolean;
}>): StudioAtelierEligibilityBlockerCode | null {
  if (input.itemState === "ARCHIVED") return "ITEM_ARCHIVED";
  if (input.stage.source !== "VERIFIED") return "SOURCE_NOT_VERIFIED";
  if (input.stage.presentLockedParents !== input.requiredLockedParents) return "PARENTS_NOT_LOCKED";
  if (input.stage.ownership === "LEGACY") return "OWNED_BY_LEGACY";
  if (input.stage.ownership === "UNVERIFIED") return "OWNERSHIP_NOT_VERIFIED";
  if (input.stage.declaration !== "SERVER_DERIVED") return "DECLARATION_NOT_DERIVED";
  if (!input.commandInstalled) return "COMMAND_NOT_INSTALLED";
  return runtimeBlocker(input.stage.runtime);
}

function existingMutationBlocker(input: Readonly<{
  itemState: "DRAFT" | "READY" | "ARCHIVED";
  stage: z.infer<typeof stageEvidenceSchema>;
  requiredLockedParents: number;
  commandInstalled: boolean;
}>): StudioAtelierEligibilityBlockerCode | null {
  if (input.itemState === "ARCHIVED") return "ITEM_ARCHIVED";
  if (input.stage.source !== "VERIFIED") return "SOURCE_NOT_VERIFIED";
  if (input.stage.presentLockedParents !== input.requiredLockedParents) return "PARENTS_NOT_LOCKED";
  if (input.stage.ownership === "LEGACY") return "OWNED_BY_LEGACY";
  if (input.stage.ownership !== "ATELIER") return "OWNERSHIP_NOT_VERIFIED";
  if (!input.commandInstalled) return "COMMAND_NOT_INSTALLED";
  return runtimeBlocker(input.stage.runtime);
}

function safeOperation(
  operation: z.infer<typeof operationEvidenceSchema>,
): NonNullable<StudioAtelierEligibilityStage["operation"]> {
  const state = operation.state === "DRAFT"
    ? "PREPARED"
    : operation.state === "MATERIALIZED" || operation.state === "TECHNICAL_PASS"
      ? "WORKING_PRIVATE"
      : operation.state === "SEMANTIC_PASS"
        ? "REVIEWABLE"
        : operation.state === "USER_APPROVED"
          ? "APPROVED"
          : operation.state === "LOCKED"
            ? "LOCKED"
            : operation.state === "USER_REJECTED" || operation.state === "SUPERSEDED"
              ? "ENDED"
              : "BLOCKED";
  const media = operation.candidateVisibility === "REVIEWABLE"
    && ["SEMANTIC_PASS", "USER_APPROVED", "LOCKED"].includes(operation.state)
    ? "REVIEWABLE"
    : "HIDDEN";
  return Object.freeze({
    state,
    media,
    recoveryHref: `/studio/media/atelier/${encodeURIComponent(operation.operationId)}`,
  });
}

function stageProjection(input: Readonly<{
  itemState: "DRAFT" | "READY" | "ARCHIVED";
  installedCommands: z.infer<typeof eligibilityEvidenceSchema>["installedCommands"];
  stage: z.infer<typeof stageEvidenceSchema>;
}>): StudioAtelierEligibilityStage {
  const { stage } = input;
  const requiredLockedParents = ATELIER_STAGE_RECIPES[stage.stage].parentRoles.length;
  const operation = stage.operation;
  const recover = operation ? available : notApplicable;
  const prepareBlocker = preparationBlocker({
    itemState: input.itemState,
    stage,
    requiredLockedParents,
    commandInstalled: input.installedCommands.prepare,
  });
  const prepare = operation
    ? notApplicable
    : prepareBlocker
      ? blocked(prepareBlocker)
      : available;

  const runApplicable = operation?.nextAction === "GENERATE";
  const runBlocker = existingMutationBlocker({
    itemState: input.itemState,
    stage,
    requiredLockedParents,
    commandInstalled: input.installedCommands.run,
  });
  const run = !operation || !runApplicable
    ? notApplicable
    : runBlocker
      ? blocked(runBlocker)
      : available;

  const reviewable = Boolean(
    operation
    && operation.state === "SEMANTIC_PASS"
    && operation.candidateVisibility === "REVIEWABLE",
  );
  const keepApplicable = reviewable || operation?.state === "USER_APPROVED";
  const decisionBlocker = existingMutationBlocker({
    itemState: input.itemState,
    stage,
    requiredLockedParents,
    commandInstalled: input.installedCommands.decision,
  });
  const keep = !keepApplicable
    ? notApplicable
    : decisionBlocker
      ? blocked(decisionBlocker)
      : available;
  const reject = !reviewable
    ? notApplicable
    : decisionBlocker
      ? blocked(decisionBlocker)
      : available;
  const fixOneThing = !reviewable || !operation?.fixOneThingAvailable
    ? notApplicable
    : decisionBlocker
      ? blocked(decisionBlocker)
      : available;

  const primaryCommand = run.state === "AVAILABLE"
    ? "RUN"
    : keep.state === "AVAILABLE"
      ? "KEEP"
      : prepare.state === "AVAILABLE"
        ? "PREPARE"
        : recover.state === "AVAILABLE"
          ? "RECOVER"
          : "NONE";
  const status = operation
    ? "EXISTING"
    : prepare.state === "AVAILABLE"
      ? "ELIGIBLE"
      : "BLOCKED";

  return studioAtelierEligibilityStageSchema.parse({
    stage: stage.stage,
    view: ATELIER_STAGE_RECIPES[stage.stage].view,
    label: stageLabels[stage.stage],
    scope: finalSceneStages.has(stage.stage) ? "FINAL_SCENE" : "ROOT_SUBJECT",
    status,
    declaration: { state: stage.declaration },
    evidence: {
      source: stage.source,
      lockedParents: {
        required: requiredLockedParents,
        present: stage.presentLockedParents,
        state: stage.presentLockedParents === requiredLockedParents
          ? "COMPLETE"
          : "INCOMPLETE",
      },
      ownership: stage.ownership,
    },
    operation: operation ? safeOperation(operation) : null,
    commands: { recover, prepare, run, keep, fixOneThing, reject },
    primaryCommand,
  });
}

function unavailableProjection(): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    "Studio could not verify Atelier eligibility.",
    "Continue with current Intake while the server eligibility projection is restored.",
  );
}

export function projectStudioAtelierEligibility(
  rawEvidence: unknown,
): StudioAtelierEligibilityProjection {
  const parsed = eligibilityEvidenceSchema.safeParse(rawEvidence);
  if (!parsed.success) throw unavailableProjection();
  const stagesByName = new Map(parsed.data.stages.map((stage) => [stage.stage, stage]));
  const stages = STUDIO_ATELIER_ELIGIBILITY_STAGE_ORDER.map((stage) => stageProjection({
    itemState: parsed.data.wardrobeItem.state,
    installedCommands: parsed.data.installedCommands,
    stage: stagesByName.get(stage)!,
  }));
  const mutationAvailable = stages.some((stage) => [
    stage.commands.prepare,
    stage.commands.run,
    stage.commands.keep,
    stage.commands.fixOneThing,
    stage.commands.reject,
  ].some((command) => command.state === "AVAILABLE"));
  return studioAtelierEligibilityProjectionSchema.parse({
    schemaVersion: STUDIO_ATELIER_ELIGIBILITY_SCHEMA_VERSION,
    mode: mutationAvailable ? "COMMANDS_AVAILABLE" : "RECOVERY_ONLY",
    wardrobeItem: parsed.data.wardrobeItem,
    legacyIntake: { available: parsed.data.legacyIntakeAvailable },
    stages,
  });
}

export function createStudioAtelierEligibilityService(input: Readonly<{
  readEvidence: StudioAtelierEligibilityEvidenceResolver;
}>): StudioAtelierEligibilityService {
  return Object.freeze({
    async read(operatorSubject, wardrobeItemId) {
      const request = z.object({
        operatorSubject: z.string().trim().min(1).max(240),
        wardrobeItemId: z.string().uuid(),
      }).strict().safeParse({ operatorSubject, wardrobeItemId });
      if (!request.success) {
        throw new StudioEngineError(
          "INVALID_REQUEST",
          400,
          "That Atelier garment request is invalid.",
          "Open the exact garment from Wardrobe.",
        );
      }
      let evidence: unknown;
      try {
        evidence = await input.readEvidence(request.data);
      } catch (error) {
        if (error instanceof StudioEngineError) throw error;
        throw unavailableProjection();
      }
      return projectStudioAtelierEligibility(evidence);
    },
  });
}
