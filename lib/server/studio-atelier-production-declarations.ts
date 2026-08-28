import {
  canonicalStringify,
} from "../studio/atelier/canonical";
import {
  atelierStageSchema,
  type AtelierLayer,
  type AtelierStage,
} from "../studio/atelier/contracts";
import {
  studioAtelierDeclarationSchema,
  type StudioAtelierDeclaration,
  type StudioAtelierRegion,
} from "../studio/atelier/declaration-compiler";
import { StudioEngineError } from "../studio/engine/errors";
import type {
  StudioAtelierReviewDecision,
} from "./studio-atelier-engine-facade";
import {
  studioAtelierStageDeclarationFactory,
  type StudioAtelierStageDeclarationResult,
} from "./studio-atelier-stage-declaration-factory";
import type {
  StudioAtelierProductionBlockerCode,
  StudioAtelierProductionPorts,
  StudioAtelierProductionReadinessReport,
  StudioAtelierProductionScope,
} from "./studio-atelier-production-runtime";
import { canonicalStudioAtelierGarmentId } from "./studio-atelier-production-source-repository";

export const STUDIO_ATELIER_INSTALLED_CAPABILITY_VERSION =
  "juw.studio-atelier-installed-capability.v1" as const;

export type StudioAtelierCanonicalStageDeclarationInput = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  stage: AtelierStage;
}>;

export type StudioAtelierCanonicalStageDeclaration =
  StudioAtelierStageDeclarationResult;

export type ResolveStudioAtelierCanonicalStageDeclaration = (
  input: StudioAtelierCanonicalStageDeclarationInput,
) => Promise<StudioAtelierCanonicalStageDeclaration>;

export type StudioAtelierProductionDeclarationService = Readonly<{
  derive(
    input: StudioAtelierCanonicalStageDeclarationInput,
  ): Promise<StudioAtelierCanonicalStageDeclaration>;
  assertExact(input: Readonly<{
    operatorSubject: string;
    declaration: StudioAtelierDeclaration;
  }>): Promise<StudioAtelierCanonicalStageDeclaration>;
}>;

export type StudioAtelierInstalledCapabilityBlockerCode =
  | "RUNTIME_NOT_INSTALLED"
  | "LEDGER_0017_NOT_VERIFIED"
  | "PRODUCTION_PORT_NOT_INSTALLED"
  | "PRIVATE_STORE_NOT_VERIFIED"
  | "AI_POLICY_NOT_VERIFIED"
  | "PRIVATE_AUTHORITY_NOT_VERIFIED"
  | "G004_CALIBRATION_NOT_VERIFIED"
  | "QUALIFICATION_NOT_PASSED"
  | "FINAL_SCENE_ROOM_NOT_READY"
  | "PROVIDER_RETENTION_CONSENT_NOT_INSTALLED"
  | "ADULT_LIKENESS_AUTHORITY_NOT_INSTALLED"
  | "FASHION_NOVA_ADVISORY_NOT_INSTALLED";

export type StudioAtelierInstalledCapabilityBlocker = Readonly<{
  code: StudioAtelierInstalledCapabilityBlockerCode;
  scope: StudioAtelierProductionScope | "ALL";
  message: string;
}>;

export type StudioAtelierInstalledCapability = Readonly<{
  schemaVersion: typeof STUDIO_ATELIER_INSTALLED_CAPABILITY_VERSION;
  rootSubject: "READY" | "BLOCKED";
  finalScene: "READY" | "BLOCKED";
  blockers: readonly StudioAtelierInstalledCapabilityBlocker[];
}>;

export type StudioAtelierInstalledCapabilityInput = Readonly<{
  /** A previously constructed, sanitized report. This resolver never probes. */
  readiness: StudioAtelierProductionReadinessReport | null;
  ports: Partial<StudioAtelierProductionPorts> | null;
  resolveProviderRetentionConsent?: ((...args: never[]) => unknown) | null;
  resolveAdultLikenessAuthority?: ((...args: never[]) => unknown) | null;
  resolveFashionNovaAdvisory?: ((...args: never[]) => unknown) | null;
}>;

const runtimeBlockerMap = Object.freeze({
  MISSING_TYPED_PORT: "PRODUCTION_PORT_NOT_INSTALLED",
  DATABASE_NOT_VERIFIED: "LEDGER_0017_NOT_VERIFIED",
  PRIVATE_STORE_NOT_VERIFIED: "PRIVATE_STORE_NOT_VERIFIED",
  AI_POLICY_NOT_VERIFIED: "AI_POLICY_NOT_VERIFIED",
  PRIVATE_AUTHORITY_NOT_VERIFIED: "PRIVATE_AUTHORITY_NOT_VERIFIED",
  G004_CALIBRATION_NOT_VERIFIED: "G004_CALIBRATION_NOT_VERIFIED",
  QUALIFICATION_NOT_PASSED: "QUALIFICATION_NOT_PASSED",
  ROOM_READINESS_UNDECLARED: "FINAL_SCENE_ROOM_NOT_READY",
  FINAL_SCENE_ROOM_NOT_READY: "FINAL_SCENE_ROOM_NOT_READY",
  APPROVED_ROOM_INVALID: "FINAL_SCENE_ROOM_NOT_READY",
} as const satisfies Record<
  StudioAtelierProductionBlockerCode,
  StudioAtelierInstalledCapabilityBlockerCode
>);

function capabilityBlocker(
  code: StudioAtelierInstalledCapabilityBlockerCode,
  scope: StudioAtelierInstalledCapabilityBlocker["scope"],
  message: string,
): StudioAtelierInstalledCapabilityBlocker {
  return Object.freeze({ code, scope, message });
}

/**
 * Pure installed-capability projection for seller GETs. It consumes an already
 * sanitized runtime report and function presence only; it never calls the
 * private-store readiness probe, a provider, a database or an authority port.
 */
export function resolveStudioAtelierInstalledCapability(
  input: StudioAtelierInstalledCapabilityInput,
): StudioAtelierInstalledCapability {
  const blockers: StudioAtelierInstalledCapabilityBlocker[] = [];
  if (!input.readiness) {
    blockers.push(capabilityBlocker(
      "RUNTIME_NOT_INSTALLED",
      "ALL",
      "The durable Atelier runtime has not been installed on this server.",
    ));
  } else {
    for (const blocker of input.readiness.blockers) {
      const code = runtimeBlockerMap[blocker.code];
      const scope = blocker.scope === "FINAL_SCENE" ? "FINAL_SCENE" : "ALL";
      if (!blockers.some((candidate) => candidate.code === code && candidate.scope === scope)) {
        blockers.push(capabilityBlocker(code, scope, blocker.message));
      }
    }
  }

  const requiredPorts = [
    "resolveFileVerification",
    "resolveTrustedTruth",
    "resolveExecutionContext",
    "prepareCorrection",
    "resolveLockedRoom",
  ] as const satisfies readonly (keyof StudioAtelierProductionPorts)[];
  if (
    !input.ports
    || requiredPorts.some((name) => typeof input.ports?.[name] !== "function")
  ) {
    blockers.push(capabilityBlocker(
      "PRODUCTION_PORT_NOT_INSTALLED",
      "ALL",
      "The server-owned Atelier production ports are not all installed.",
    ));
  }
  if (typeof input.resolveProviderRetentionConsent !== "function") {
    blockers.push(capabilityBlocker(
      "PROVIDER_RETENTION_CONSENT_NOT_INSTALLED",
      "ALL",
      "Durable provider-retention consent authority is not installed.",
    ));
  }
  if (typeof input.resolveAdultLikenessAuthority !== "function") {
    blockers.push(capabilityBlocker(
      "ADULT_LIKENESS_AUTHORITY_NOT_INSTALLED",
      "ALL",
      "Verified-adult and likeness-use authority is not installed.",
    ));
  }
  if (typeof input.resolveFashionNovaAdvisory !== "function") {
    blockers.push(capabilityBlocker(
      "FASHION_NOVA_ADVISORY_NOT_INSTALLED",
      "FINAL_SCENE",
      "The trusted Fashion Nova styling advisory resolver is not installed.",
    ));
  }

  const rootSubject = blockers.some((blocker) => blocker.scope === "ALL")
    ? "BLOCKED" as const
    : "READY" as const;
  const finalScene = rootSubject === "READY"
    && !blockers.some((blocker) => blocker.scope === "FINAL_SCENE")
    ? "READY" as const
    : "BLOCKED" as const;
  return Object.freeze({
    schemaVersion: STUDIO_ATELIER_INSTALLED_CAPABILITY_VERSION,
    rootSubject,
    finalScene,
    blockers: Object.freeze(blockers),
  });
}

function invalidDeclaration(message: string): never {
  throw new StudioEngineError(
    "INVALID_REQUEST",
    409,
    message,
    "Reload the server-derived Atelier declaration for this exact garment and stage.",
  );
}

function parseDeclaration(value: unknown): StudioAtelierDeclaration {
  const parsed = studioAtelierDeclarationSchema.safeParse(value);
  if (!parsed.success) {
    return invalidDeclaration("The canonical Atelier declaration factory returned invalid data.");
  }
  return Object.freeze(parsed.data);
}

export function createStudioAtelierProductionDeclarationService(input: Readonly<{
  resolveCanonicalDeclaration: ResolveStudioAtelierCanonicalStageDeclaration;
}>): StudioAtelierProductionDeclarationService {
  if (typeof input.resolveCanonicalDeclaration !== "function") {
    throw new Error("A server-owned canonical Atelier declaration resolver is required.");
  }
  const derive = async (
    raw: StudioAtelierCanonicalStageDeclarationInput,
  ): Promise<StudioAtelierCanonicalStageDeclaration> => {
    const stage = atelierStageSchema.parse(raw.stage);
    const expectedGarmentId = canonicalStudioAtelierGarmentId(raw.wardrobeItemId);
    const resolved = await input.resolveCanonicalDeclaration({
      operatorSubject: raw.operatorSubject,
      wardrobeItemId: raw.wardrobeItemId,
      stage,
    });
    const declaration = parseDeclaration(resolved.declaration);
    if (
      declaration.wardrobeItemId !== raw.wardrobeItemId
      || declaration.garmentId !== expectedGarmentId
      || declaration.stage !== stage
    ) {
      return invalidDeclaration(
        "The canonical Atelier declaration does not bind the authenticated Wardrobe item and stage.",
      );
    }
    return Object.freeze({ ...resolved, declaration });
  };
  return Object.freeze({
    derive,
    async assertExact({ operatorSubject, declaration }) {
      const parsed = parseDeclaration(declaration);
      if (!parsed.wardrobeItemId) {
        return invalidDeclaration(
          "Production Atelier declarations must bind an authenticated Wardrobe item.",
        );
      }
      const canonical = await derive({
        operatorSubject,
        wardrobeItemId: parsed.wardrobeItemId,
        stage: parsed.stage,
      });
      if (canonicalStringify(canonical.declaration) !== canonicalStringify(parsed)) {
        return invalidDeclaration(
          "The submitted Atelier declaration does not equal the current server-derived declaration.",
        );
      }
      return canonical;
    },
  });
}

type CorrectionDecision = Extract<
  StudioAtelierReviewDecision,
  { decision: "FIX_ONE_THING" }
>;

const correctionTarget = Object.freeze({
  FACE_TRANSLATION: Object.freeze({
    layer: "IDENTITY",
    region: Object.freeze({ kind: "NAMED_REGION", code: "FACE_TRANSLATION" }),
  }),
  BODY_GEOMETRY: Object.freeze({
    layer: "BODY",
    region: Object.freeze({ kind: "WHOLE_LAYER" }),
  }),
  GARMENT_CONSTRUCTION: Object.freeze({
    layer: "GARMENT",
    region: Object.freeze({ kind: "NAMED_REGION", code: "GARMENT_CONSTRUCTION" }),
  }),
  GARMENT_SURFACE: Object.freeze({
    layer: "GARMENT",
    region: Object.freeze({ kind: "NAMED_REGION", code: "GARMENT_SURFACE" }),
  }),
  HAIR: Object.freeze({
    layer: "HAIR",
    region: Object.freeze({ kind: "NAMED_REGION", code: "HAIR" }),
  }),
  LEFT_HAND: Object.freeze({
    layer: "HANDS",
    region: Object.freeze({ kind: "NAMED_REGION", code: "LEFT_HAND" }),
  }),
  RIGHT_HAND: Object.freeze({
    layer: "HANDS",
    region: Object.freeze({ kind: "NAMED_REGION", code: "RIGHT_HAND" }),
  }),
  FOOTWEAR: Object.freeze({
    layer: "FOOTWEAR",
    region: Object.freeze({ kind: "NAMED_REGION", code: "FOOTWEAR" }),
  }),
  POSE_ALIGNMENT: Object.freeze({
    layer: "POSE",
    region: Object.freeze({ kind: "NAMED_REGION", code: "POSE_ALIGNMENT" }),
  }),
  CAMERA_ALIGNMENT: Object.freeze({
    layer: "CAMERA",
    region: Object.freeze({ kind: "NAMED_REGION", code: "CAMERA_ALIGNMENT" }),
  }),
  LIGHTING_INTEGRATION: Object.freeze({
    layer: "LIGHTING",
    region: Object.freeze({ kind: "NAMED_REGION", code: "LIGHTING_INTEGRATION" }),
  }),
  OUTPUT_GEOMETRY: Object.freeze({
    layer: "OUTPUT_GEOMETRY",
    region: Object.freeze({ kind: "NAMED_REGION", code: "OUTPUT_GEOMETRY" }),
  }),
} as const satisfies Record<
  CorrectionDecision["target"],
  Readonly<{ layer: AtelierLayer; region: StudioAtelierRegion }>
>);

/** Build only the one typed correction authorized by a durable review event. */
export function buildStudioAtelierCorrectionDeclaration(input: Readonly<{
  base: StudioAtelierDeclaration;
  sourceSemanticHash: string;
  decision: CorrectionDecision;
}>): StudioAtelierDeclaration {
  const base = parseDeclaration(input.base);
  const target = correctionTarget[input.decision.target];
  const candidate = {
    ...base,
    changes: [{
      layer: target.layer,
      action: "CORRECT" as const,
      region: target.region,
      deltaCode: "CORRECT_AUTHORIZED_GATE_ONLY" as const,
    }],
    poseIntent: {
      ...base.poseIntent,
      adjustments: target.layer === "POSE" ? ["STANCE" as const] : [],
    },
    correctionIntent: {
      mode: "BOUNDED_ONE_THING" as const,
      correctionOf: input.sourceSemanticHash,
      failedGate: input.decision.reason,
      targetLayer: target.layer,
      targetRegion: target.region,
      ordinal: 1 as const,
    },
  };
  const parsed = studioAtelierDeclarationSchema.safeParse(candidate);
  if (!parsed.success) {
    return invalidDeclaration(
      "That requested correction target is not mutable in the source operation stage.",
    );
  }
  return Object.freeze(parsed.data);
}

/** Default read-only declaration composition; calling it performs SELECTs only. */
export const studioAtelierProductionDeclarationService =
  createStudioAtelierProductionDeclarationService({
    resolveCanonicalDeclaration: (input) =>
      studioAtelierStageDeclarationFactory.create(input),
  });
