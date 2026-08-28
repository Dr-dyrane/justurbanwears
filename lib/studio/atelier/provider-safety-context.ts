import { z } from "zod";
import { canonicalStringify, sha256Text } from "./canonical";
import {
  atelierStageSchema,
  sha256Schema,
  type AtelierStage,
} from "./contracts";

export const PROVIDER_SAFETY_CONTEXT_VERSION =
  "juw.atelier-provider-safety-context.v1" as const;
export const PROVIDER_SAFETY_RECEIPT_VERSION =
  "juw.atelier-provider-safety-context-receipt.v1" as const;

export const providerSafetyModeSchema = z.enum([
  "NO_REAL_PERSON_OUTPUT",
  "VERIFIED_ADULT_AUTHORIZED_LIKENESS",
]);

export type ProviderSafetyMode = z.infer<typeof providerSafetyModeSchema>;

const sharedClaimsShape = {
  purpose: z.literal("NON_SEXUAL_RETAIL_FASHION_CATALOGUE"),
  presentation: z.literal("FULLY_CLOTHED"),
  nudity: z.literal("FORBIDDEN"),
  sexualPresentation: z.literal("FORBIDDEN"),
  eroticPresentation: z.literal("FORBIDDEN"),
  fetishPresentation: z.literal("FORBIDDEN"),
} as const;

export const noRealPersonOutputClaimsSchema = z.object({
  ...sharedClaimsShape,
  realPersonOutput: z.literal("FORBIDDEN"),
}).strict();

export const verifiedAdultAuthorizedLikenessClaimsSchema = z.object({
  ...sharedClaimsShape,
  realPersonOutput: z.literal("VERIFIED_AUTHORIZED_LIKENESS_ONLY"),
  subjectAge: z.literal("VERIFIED_ADULT_18_PLUS"),
  subjectConsent: z.literal("VERIFIED_FOR_THIS_OPERATION"),
  likenessUse: z.literal("AUTHORIZED_FOR_THIS_OPERATION"),
}).strict();

const contextBaseShape = {
  schemaVersion: z.literal(PROVIDER_SAFETY_CONTEXT_VERSION),
  verificationAuthority: z.literal("JUW_SERVER_VERIFIED"),
  semanticOperationHash: sha256Schema,
  stage: atelierStageSchema,
} as const;

export const providerSafetyContextSchema = z.discriminatedUnion("mode", [
  z.object({
    ...contextBaseShape,
    mode: z.literal("NO_REAL_PERSON_OUTPUT"),
    claims: noRealPersonOutputClaimsSchema,
  }).strict(),
  z.object({
    ...contextBaseShape,
    mode: z.literal("VERIFIED_ADULT_AUTHORIZED_LIKENESS"),
    claims: verifiedAdultAuthorizedLikenessClaimsSchema,
  }).strict(),
]);

const safetyReceiptIdSchema = z.string().regex(
  /^atelier-provider-safety:[a-f0-9]{64}$/,
);

export const providerSafetyContextReceiptSchema = z.object({
  schemaVersion: z.literal(PROVIDER_SAFETY_RECEIPT_VERSION),
  receiptId: safetyReceiptIdSchema,
  receiptSha256: sha256Schema,
  context: providerSafetyContextSchema,
}).strict();

export type ProviderSafetyContext = z.infer<typeof providerSafetyContextSchema>;
export type ProviderSafetyContextReceipt = z.infer<
  typeof providerSafetyContextReceiptSchema
>;

export type ProviderSafetyContextErrorCode =
  | "INVALID_RECEIPT"
  | "HASH_MISMATCH"
  | "SEMANTIC_OPERATION_MISMATCH"
  | "STAGE_MISMATCH"
  | "MODE_MISMATCH";

export class ProviderSafetyContextError extends Error {
  constructor(
    readonly code: ProviderSafetyContextErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ProviderSafetyContextError";
  }
}

const GARMENT_STAGES = new Set<AtelierStage>([
  "GARMENT_01_FRONT",
  "GARMENT_02_BACK",
  "GARMENT_03_MANNEQUIN",
  "GARMENT_04_DETAIL",
]);

export function expectedProviderSafetyModeForStage(
  stage: AtelierStage,
): ProviderSafetyMode {
  return GARMENT_STAGES.has(stage)
    ? "NO_REAL_PERSON_OUTPUT"
    : "VERIFIED_ADULT_AUTHORIZED_LIKENESS";
}

function claimsForMode(mode: ProviderSafetyMode) {
  const shared = {
    purpose: "NON_SEXUAL_RETAIL_FASHION_CATALOGUE" as const,
    presentation: "FULLY_CLOTHED" as const,
    nudity: "FORBIDDEN" as const,
    sexualPresentation: "FORBIDDEN" as const,
    eroticPresentation: "FORBIDDEN" as const,
    fetishPresentation: "FORBIDDEN" as const,
  };
  return mode === "NO_REAL_PERSON_OUTPUT"
    ? {
      ...shared,
      realPersonOutput: "FORBIDDEN" as const,
    }
    : {
      ...shared,
      realPersonOutput: "VERIFIED_AUTHORIZED_LIKENESS_ONLY" as const,
      subjectAge: "VERIFIED_ADULT_18_PLUS" as const,
      subjectConsent: "VERIFIED_FOR_THIS_OPERATION" as const,
      likenessUse: "AUTHORIZED_FOR_THIS_OPERATION" as const,
    };
}

export function deriveProviderSafetyContextReceiptHash(
  context: ProviderSafetyContext,
): string {
  return sha256Text(canonicalStringify(providerSafetyContextSchema.parse(context)));
}

export function createProviderSafetyContextReceipt(input: Readonly<{
  semanticOperationHash: string;
  stage: AtelierStage;
  mode: ProviderSafetyMode;
}>): ProviderSafetyContextReceipt {
  const expectedMode = expectedProviderSafetyModeForStage(input.stage);
  if (input.mode !== expectedMode) {
    throw new ProviderSafetyContextError(
      "MODE_MISMATCH",
      `Provider safety mode ${input.mode} is incompatible with stage ${input.stage}.`,
    );
  }
  const context = providerSafetyContextSchema.parse({
    schemaVersion: PROVIDER_SAFETY_CONTEXT_VERSION,
    verificationAuthority: "JUW_SERVER_VERIFIED",
    semanticOperationHash: input.semanticOperationHash,
    stage: input.stage,
    mode: input.mode,
    claims: claimsForMode(input.mode),
  });
  const receiptSha256 = deriveProviderSafetyContextReceiptHash(context);
  return Object.freeze(providerSafetyContextReceiptSchema.parse({
    schemaVersion: PROVIDER_SAFETY_RECEIPT_VERSION,
    receiptId: `atelier-provider-safety:${receiptSha256}`,
    receiptSha256,
    context,
  }));
}

export function validateProviderSafetyContextReceipt(
  value: unknown,
  expected: Readonly<{
    semanticOperationHash: string;
    stage: AtelierStage;
  }>,
): ProviderSafetyContextReceipt {
  const parsed = providerSafetyContextReceiptSchema.safeParse(value);
  if (!parsed.success) {
    throw new ProviderSafetyContextError(
      "INVALID_RECEIPT",
      "The provider safety context receipt is missing, malformed, or contains undeclared fields.",
    );
  }
  const receipt = parsed.data;
  const derivedHash = deriveProviderSafetyContextReceiptHash(receipt.context);
  if (
    receipt.receiptSha256 !== derivedHash
    || receipt.receiptId !== `atelier-provider-safety:${derivedHash}`
  ) {
    throw new ProviderSafetyContextError(
      "HASH_MISMATCH",
      "The provider safety context receipt failed its canonical content hash.",
    );
  }
  if (receipt.context.semanticOperationHash !== expected.semanticOperationHash) {
    throw new ProviderSafetyContextError(
      "SEMANTIC_OPERATION_MISMATCH",
      "The provider safety context receipt does not bind the canonical operation.",
    );
  }
  if (receipt.context.stage !== expected.stage) {
    throw new ProviderSafetyContextError(
      "STAGE_MISMATCH",
      "The provider safety context receipt does not bind the canonical stage.",
    );
  }
  if (receipt.context.mode !== expectedProviderSafetyModeForStage(expected.stage)) {
    throw new ProviderSafetyContextError(
      "MODE_MISMATCH",
      "The provider safety context mode is incompatible with the canonical stage.",
    );
  }
  return Object.freeze(receipt);
}

export function providerSafetyContextPromptLines(
  value: ProviderSafetyContextReceipt,
): readonly string[] {
  const receipt = validateProviderSafetyContextReceipt(value, {
    semanticOperationHash: value.context.semanticOperationHash,
    stage: value.context.stage,
  });
  const binding = `- receipt=${receipt.receiptId}; sha256=${receipt.receiptSha256}; mode=${receipt.context.mode}.`;
  if (receipt.context.mode === "NO_REAL_PERSON_OUTPUT") {
    return Object.freeze([
      "SERVER-VERIFIED PROVIDER SAFETY CONTEXT",
      binding,
      "- This operation creates no real-person output. Its purpose is a non-sexual retail-fashion catalogue presentation, and every permitted presentation is fully clothed. Nudity and sexual, erotic, or fetish presentation are forbidden.",
    ]);
  }
  return Object.freeze([
    "SERVER-VERIFIED PROVIDER SAFETY CONTEXT",
    binding,
    "- The subject is a verified adult whose likeness use is consented and authorized for this operation. Its purpose is a non-sexual retail-fashion catalogue presentation, and the subject must be fully clothed. Nudity and sexual, erotic, or fetish presentation are forbidden.",
  ]);
}
