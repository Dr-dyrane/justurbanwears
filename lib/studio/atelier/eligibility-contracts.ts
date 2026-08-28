import { z } from "zod";
import { atelierStageSchema } from "./contracts";

export const STUDIO_ATELIER_ELIGIBILITY_SCHEMA_VERSION =
  "juw.studio-atelier-eligibility.v2" as const;

const studioAtelierRecoveryHrefSchema = z.string().regex(
  /^\/studio\/media\/atelier\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
);

export const studioAtelierEligibilityBlockerCodeSchema = z.enum([
  "QUALIFICATION_NOT_PASSED",
  "RUNTIME_NOT_INSTALLED",
  "ROOM_NOT_QUALIFIED",
  "COMMAND_NOT_INSTALLED",
  "ITEM_ARCHIVED",
  "SOURCE_NOT_VERIFIED",
  "PARENTS_NOT_LOCKED",
  "OWNED_BY_LEGACY",
  "OWNERSHIP_NOT_VERIFIED",
  "DECLARATION_NOT_DERIVED",
  "STATE_NOT_ELIGIBLE",
]);

export type StudioAtelierEligibilityBlockerCode = z.infer<
  typeof studioAtelierEligibilityBlockerCodeSchema
>;

export const studioAtelierEligibilityBlockerSchema = z.object({
  code: studioAtelierEligibilityBlockerCodeSchema,
  title: z.string().trim().min(1).max(120),
  detail: z.string().trim().min(1).max(320),
}).strict();

export type StudioAtelierEligibilityBlocker = z.infer<
  typeof studioAtelierEligibilityBlockerSchema
>;

export const studioAtelierCommandCapabilitySchema = z.discriminatedUnion("state", [
  z.object({
    state: z.literal("AVAILABLE"),
    blocker: z.null(),
  }).strict(),
  z.object({
    state: z.literal("BLOCKED"),
    blocker: studioAtelierEligibilityBlockerSchema,
  }).strict(),
  z.object({
    state: z.literal("NOT_APPLICABLE"),
    blocker: z.null(),
  }).strict(),
]);

export type StudioAtelierCommandCapability = z.infer<
  typeof studioAtelierCommandCapabilitySchema
>;

const commandCapabilitiesSchema = z.object({
  recover: studioAtelierCommandCapabilitySchema,
  prepare: studioAtelierCommandCapabilitySchema,
  run: studioAtelierCommandCapabilitySchema,
  keep: studioAtelierCommandCapabilitySchema,
  fixOneThing: studioAtelierCommandCapabilitySchema,
  reject: studioAtelierCommandCapabilitySchema,
}).strict();

const safeOperationStateSchema = z.enum([
  "PREPARED",
  "WORKING_PRIVATE",
  "REVIEWABLE",
  "APPROVED",
  "LOCKED",
  "BLOCKED",
  "ENDED",
]);

export const studioAtelierEligibilityStageSchema = z.object({
  stage: atelierStageSchema,
  view: z.enum(["01", "02", "03", "04", "SUBJECT", "05", "06", "07"]),
  label: z.string().trim().min(1).max(80),
  scope: z.enum(["ROOT_SUBJECT", "FINAL_SCENE"]),
  status: z.enum(["EXISTING", "ELIGIBLE", "BLOCKED"]),
  declaration: z.object({
    state: z.enum(["SERVER_DERIVED", "BLOCKED"]),
  }).strict(),
  evidence: z.object({
    source: z.enum(["VERIFIED", "MISSING", "UNAVAILABLE"]),
    lockedParents: z.object({
      required: z.number().int().nonnegative(),
      present: z.number().int().nonnegative(),
      state: z.enum(["COMPLETE", "INCOMPLETE"]),
    }).strict(),
    ownership: z.enum(["UNCLAIMED", "ATELIER", "LEGACY", "UNVERIFIED"]),
  }).strict(),
  operation: z.object({
    state: safeOperationStateSchema,
    media: z.enum(["HIDDEN", "REVIEWABLE"]),
    recoveryHref: studioAtelierRecoveryHrefSchema,
  }).strict().nullable(),
  commands: commandCapabilitiesSchema,
  primaryCommand: z.enum([
    "RECOVER",
    "PREPARE",
    "RUN",
    "KEEP",
    "FIX_ONE_THING",
    "REJECT",
    "NONE",
  ]),
}).strict().superRefine((stage, context) => {
  if (stage.evidence.lockedParents.present > stage.evidence.lockedParents.required) {
    context.addIssue({
      code: "custom",
      path: ["evidence", "lockedParents", "present"],
      message: "Present locked parents cannot exceed the required count.",
    });
  }
  const expectedParentState = stage.evidence.lockedParents.present
    === stage.evidence.lockedParents.required
    ? "COMPLETE"
    : "INCOMPLETE";
  if (stage.evidence.lockedParents.state !== expectedParentState) {
    context.addIssue({
      code: "custom",
      path: ["evidence", "lockedParents", "state"],
      message: "Locked-parent state must match the safe counts.",
    });
  }
});

export type StudioAtelierEligibilityStage = z.infer<
  typeof studioAtelierEligibilityStageSchema
>;

export const studioAtelierEligibilityProjectionSchema = z.object({
  schemaVersion: z.literal(STUDIO_ATELIER_ELIGIBILITY_SCHEMA_VERSION),
  mode: z.enum(["RECOVERY_ONLY", "COMMANDS_AVAILABLE"]),
  wardrobeItem: z.object({
    title: z.string().trim().min(1).max(240),
    state: z.enum(["DRAFT", "READY", "ARCHIVED"]),
    version: z.number().int().positive(),
  }).strict(),
  legacyIntake: z.object({
    available: z.boolean(),
  }).strict(),
  stages: z.array(studioAtelierEligibilityStageSchema).length(10),
}).strict();

export type StudioAtelierEligibilityProjection = z.infer<
  typeof studioAtelierEligibilityProjectionSchema
>;
