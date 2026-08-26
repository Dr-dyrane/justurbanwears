import { z } from "zod";
import {
  adapterCapabilitiesSchema,
  attestedReferencePackSchema,
  physicalReferenceBindingSchema,
  privacyClassSchema,
  type AtelierAdapterCapabilities,
  type AtelierOperation,
  type AtelierStage,
  type AttestedReferencePack,
  type AuthorityRole,
  type LogicalReference,
  type PhysicalReferenceBinding,
  type ParentRole,
  type ReferencePackRole,
} from "./contracts";
import {
  canonicalAtelierOperation,
  deriveOperationId,
  semanticOperationHash,
} from "./canonical";

type PackRecipe = Readonly<{
  packRole: ReferencePackRole;
  method: AttestedReferencePack["method"];
  constituentRoles: readonly (AuthorityRole | ParentRole)[];
}>;

type LogicalRoleLocator =
  | Readonly<{ kind: "PARENT"; role: ParentRole }>
  | Readonly<{ kind: "AUTHORITY"; role: AuthorityRole }>;

/** Provider input order is explicit and is not inferred from object insertion. */
export const ATELIER_LOGICAL_REFERENCE_ORDER = Object.freeze({
  GARMENT_01_FRONT: Object.freeze([
    { kind: "AUTHORITY", role: "DIRECT_GARMENT_EVIDENCE" },
  ] as const),
  GARMENT_02_BACK: Object.freeze([
    { kind: "AUTHORITY", role: "DIRECT_GARMENT_EVIDENCE" },
  ] as const),
  GARMENT_03_MANNEQUIN: Object.freeze([
    { kind: "AUTHORITY", role: "DIRECT_GARMENT_EVIDENCE" },
  ] as const),
  GARMENT_04_DETAIL: Object.freeze([
    { kind: "AUTHORITY", role: "DIRECT_GARMENT_EVIDENCE" },
  ] as const),
  SUBJECT_A: Object.freeze([
    { kind: "PARENT", role: "GARMENT_FRONT_LOCK" },
    { kind: "PARENT", role: "GARMENT_BACK_LOCK" },
    { kind: "PARENT", role: "MANNEQUIN_FRONT_LOCK" },
    { kind: "PARENT", role: "FABRIC_DETAIL_LOCK" },
    { kind: "AUTHORITY", role: "REAL_FACE_OPERATION_BOARD" },
    { kind: "AUTHORITY", role: "V4_TRANSLATION_LOCK" },
    { kind: "AUTHORITY", role: "BODY_FRONT_CANON" },
    { kind: "AUTHORITY", role: "REAL_LULU_ANGLE_CONTACT" },
  ] as const),
  SUBJECT_B: Object.freeze([
    { kind: "AUTHORITY", role: "SUBJECT_A_TRANSLATION_DONOR" },
    { kind: "PARENT", role: "GARMENT_FRONT_LOCK" },
    { kind: "PARENT", role: "GARMENT_BACK_LOCK" },
    { kind: "PARENT", role: "MANNEQUIN_FRONT_LOCK" },
    { kind: "PARENT", role: "FABRIC_DETAIL_LOCK" },
    { kind: "AUTHORITY", role: "REAL_FACE_OPERATION_BOARD" },
    { kind: "AUTHORITY", role: "BODY_FRONT_CANON" },
    { kind: "AUTHORITY", role: "REAL_LULU_ANGLE_CONTACT" },
  ] as const),
  ROOM_FINAL_05: Object.freeze([
    { kind: "PARENT", role: "ACCEPTED_SUBJECT_LOCK" },
    { kind: "AUTHORITY", role: "GARMENT_FRONT_SAFEGUARD" },
    { kind: "AUTHORITY", role: "LOCKED_ATELIER_ROOM" },
  ] as const),
  SIBLING_06: Object.freeze([
    { kind: "PARENT", role: "ACCEPTED_05" },
    { kind: "AUTHORITY", role: "REAL_FACE_OPERATION_BOARD" },
    { kind: "AUTHORITY", role: "BODY_SIDE_CANON" },
    { kind: "AUTHORITY", role: "REAL_LULU_ANGLE_CONTACT" },
    { kind: "AUTHORITY", role: "LOCKED_ATELIER_ROOM" },
  ] as const),
  SIBLING_07_CORE: Object.freeze([
    { kind: "PARENT", role: "ACCEPTED_05" },
    { kind: "AUTHORITY", role: "REAL_FACE_OPERATION_BOARD" },
    { kind: "AUTHORITY", role: "BODY_BACK_CANON" },
    { kind: "AUTHORITY", role: "REAL_LULU_ANGLE_CONTACT" },
    { kind: "AUTHORITY", role: "LOCKED_ATELIER_ROOM" },
  ] as const),
  SIBLING_07_RECOVERY: Object.freeze([
    { kind: "PARENT", role: "ACCEPTED_05" },
    { kind: "AUTHORITY", role: "REAL_FACE_OPERATION_BOARD" },
    { kind: "AUTHORITY", role: "BODY_BACK_CANON" },
    { kind: "AUTHORITY", role: "REAL_LULU_ANGLE_CONTACT" },
    { kind: "AUTHORITY", role: "REAL_LULU_GYM_REAR_PROFILE" },
    { kind: "AUTHORITY", role: "LOCKED_ATELIER_ROOM" },
  ] as const),
} as const satisfies Record<AtelierStage, readonly LogicalRoleLocator[]>);

/**
 * Packs are narrow, stage-specific and must be attested. This list is the only
 * place where several logical truths may share one provider image input.
 */
export const ATELIER_ALLOWED_PACKS = Object.freeze({
  GARMENT_01_FRONT: Object.freeze([]),
  GARMENT_02_BACK: Object.freeze([]),
  GARMENT_03_MANNEQUIN: Object.freeze([]),
  GARMENT_04_DETAIL: Object.freeze([]),
  SUBJECT_A: Object.freeze([
    {
      packRole: "GARMENT_SET_01_04_BOARD",
      method: "DETERMINISTIC_COMPOSITE_BOARD",
      constituentRoles: Object.freeze([
        "GARMENT_FRONT_LOCK",
        "GARMENT_BACK_LOCK",
        "MANNEQUIN_FRONT_LOCK",
        "FABRIC_DETAIL_LOCK",
      ] as const),
    },
    {
      packRole: "SUBJECT_A_TRANSLATION_FACE_BOARD",
      method: "DETERMINISTIC_COMPOSITE_BOARD",
      constituentRoles: Object.freeze([
        "V4_TRANSLATION_LOCK",
        "BODY_FRONT_CANON",
        "REAL_LULU_ANGLE_CONTACT",
      ] as const),
    },
  ]),
  SUBJECT_B: Object.freeze([
    {
      packRole: "GARMENT_SET_01_04_BOARD",
      method: "DETERMINISTIC_COMPOSITE_BOARD",
      constituentRoles: Object.freeze([
        "GARMENT_FRONT_LOCK",
        "GARMENT_BACK_LOCK",
        "MANNEQUIN_FRONT_LOCK",
        "FABRIC_DETAIL_LOCK",
      ] as const),
    },
    {
      packRole: "SUBJECT_B_TRANSLATION_FACE_BOARD",
      method: "DETERMINISTIC_COMPOSITE_BOARD",
      constituentRoles: Object.freeze([
        "BODY_FRONT_CANON",
        "REAL_LULU_ANGLE_CONTACT",
      ] as const),
    },
  ]),
  ROOM_FINAL_05: Object.freeze([]),
  SIBLING_06: Object.freeze([{
    packRole: "SIDE_BODY_ANGLE_BOARD",
    method: "DETERMINISTIC_COMPOSITE_BOARD",
    constituentRoles: Object.freeze([
      "BODY_SIDE_CANON",
      "REAL_LULU_ANGLE_CONTACT",
    ] as const),
  }]),
  SIBLING_07_CORE: Object.freeze([{
    packRole: "BACK_BODY_ANGLE_BOARD",
    method: "DETERMINISTIC_COMPOSITE_BOARD",
    constituentRoles: Object.freeze([
      "BODY_BACK_CANON",
      "REAL_LULU_ANGLE_CONTACT",
    ] as const),
  }]),
  SIBLING_07_RECOVERY: Object.freeze([{
    packRole: "FUSED_IDENTITY_REAR_RECOVERY_BOARD",
    method: "DETERMINISTIC_COMPOSITE_BOARD",
    constituentRoles: Object.freeze([
      "REAL_FACE_OPERATION_BOARD",
      "BODY_BACK_CANON",
      "REAL_LULU_ANGLE_CONTACT",
      "REAL_LULU_GYM_REAR_PROFILE",
    ] as const),
  }]),
} as const satisfies Record<AtelierStage, readonly PackRecipe[]>);

export type AtelierPlanningErrorCode =
  | "INVALID_OPERATION"
  | "INVALID_REFERENCE_PACK"
  | "BLOCKED_CAPABILITY";

export class AtelierPlanningError extends Error {
  constructor(
    readonly code: AtelierPlanningErrorCode,
    message: string,
    readonly details: Readonly<Record<string, unknown>> = Object.freeze({}),
  ) {
    super(message);
    this.name = "AtelierPlanningError";
  }
}

function logicalKey(reference: Pick<LogicalReference, "kind" | "role">): string {
  return `${reference.kind}:${reference.role}`;
}

function exactReferenceKey(reference: LogicalReference): string {
  return `${logicalKey(reference)}:${reference.assetId}:${reference.sha256}`;
}

function referencesEqual(left: LogicalReference, right: LogicalReference): boolean {
  return left.kind === right.kind
    && left.role === right.role
    && left.assetId === right.assetId
    && left.sha256 === right.sha256;
}

function logicalReferences(operation: AtelierOperation): Array<LogicalReference & {
  privacyClass: z.infer<typeof privacyClassSchema>;
}> {
  const parents = new Map(operation.parentLocks.map((parent) => [parent.role, parent]));
  const authorities = new Map(operation.authorityStack.map((authority) => [authority.role, authority]));
  return ATELIER_LOGICAL_REFERENCE_ORDER[operation.stage].map((locator) => {
    if (locator.kind === "PARENT") {
      const parent = parents.get(locator.role);
      if (!parent) {
        throw new AtelierPlanningError("INVALID_OPERATION", `Missing parent ${locator.role}.`);
      }
      return {
        kind: "PARENT" as const,
        role: locator.role,
        assetId: parent.assetId,
        sha256: parent.sha256,
        privacyClass: parent.privacyClass,
      };
    }
    const authority = authorities.get(locator.role);
    if (!authority) {
      throw new AtelierPlanningError("INVALID_OPERATION", `Missing authority ${locator.role}.`);
    }
    return {
      kind: "AUTHORITY" as const,
      role: locator.role,
      assetId: authority.assetId,
      sha256: authority.sha256,
      privacyClass: authority.privacyClass,
    };
  });
}

function parseOperation(rawOperation: unknown): AtelierOperation {
  try {
    return canonicalAtelierOperation(rawOperation);
  } catch (error) {
    throw new AtelierPlanningError(
      "INVALID_OPERATION",
      "The canonical Atelier operation is invalid.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
}

function parseCapabilities(rawCapabilities: unknown): AtelierAdapterCapabilities {
  try {
    return adapterCapabilitiesSchema.parse(rawCapabilities);
  } catch (error) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      "The adapter capability declaration is invalid.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
}

function parsePacks(rawPacks: readonly unknown[]): AttestedReferencePack[] {
  try {
    return z.array(attestedReferencePackSchema).parse(rawPacks);
  } catch (error) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      "A reference pack is not fully attested.",
      Object.freeze({ reason: error instanceof Error ? error.message : "schema validation failed" }),
    );
  }
}

const privacyRank = Object.freeze({
  PUBLIC: 0,
  PRIVATE_OPERATOR: 1,
  PRIVATE_IDENTITY: 2,
} as const);

function assertPack(
  operation: AtelierOperation,
  pack: AttestedReferencePack,
  expectedReferences: readonly ReturnType<typeof logicalReferences>[number][],
): void {
  const recipe = ATELIER_ALLOWED_PACKS[operation.stage]
    .find((candidate) => candidate.packRole === pack.packRole);
  if (!recipe) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      `${pack.packRole} is not an approved pack for ${operation.stage}.`,
    );
  }
  if (pack.method !== recipe.method) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      `${pack.packRole} requires ${recipe.method}.`,
    );
  }
  if (pack.constituents.length !== recipe.constituentRoles.length) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      `${pack.packRole} must contain its complete approved authority set.`,
    );
  }

  const expectedByRole = new Map(expectedReferences.map((reference) => [logicalKey(reference), reference]));
  pack.constituents.forEach((constituent, index) => {
    const requiredRole = recipe.constituentRoles[index];
    const required = expectedReferences.find((reference) => reference.role === requiredRole);
    if (!required
      || constituent.kind !== required.kind
      || constituent.role !== required.role) {
      throw new AtelierPlanningError(
        "INVALID_REFERENCE_PACK",
        `${pack.packRole} constituents must preserve the declared order: ${recipe.constituentRoles.join(", ")}.`,
      );
    }
    const expected = expectedByRole.get(logicalKey(constituent));
    if (!expected || !referencesEqual(constituent, expected)) {
      throw new AtelierPlanningError(
        "INVALID_REFERENCE_PACK",
        `${pack.packRole} does not attest the exact ${constituent.role} bytes.`,
      );
    }
  });

  const constituentAssetKeys = new Set(pack.constituents.map((item) => `${item.assetId}:${item.sha256}`));
  if (constituentAssetKeys.has(`${pack.assetId}:${pack.sha256}`)) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      `${pack.packRole} must identify independently hashed packed bytes.`,
    );
  }
  const requiredPrivacy = Math.max(...pack.constituents.map((constituent) => {
    const expected = expectedByRole.get(logicalKey(constituent));
    return expected ? privacyRank[expected.privacyClass] : 0;
  }));
  if (privacyRank[pack.privacyClass] < requiredPrivacy) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      `${pack.packRole} weakens the privacy class of its constituents.`,
    );
  }
}

/**
 * Compile logical authority into ordered provider inputs. With no packs this is
 * a one-to-one binding and a five/six-reference operation remains five/six.
 */
export function compileAtelierReferenceBindings(
  rawOperation: unknown,
  rawPacks: readonly unknown[] = [],
): PhysicalReferenceBinding[] {
  const operation = parseOperation(rawOperation);
  const expectedReferences = logicalReferences(operation);
  const packs = parsePacks(rawPacks);
  if (new Set(packs.map((pack) => pack.packRole)).size !== packs.length) {
    throw new AtelierPlanningError("INVALID_REFERENCE_PACK", "A pack role may be bound only once.");
  }
  if (new Set(packs.map((pack) => `${pack.assetId}:${pack.sha256}`)).size !== packs.length) {
    throw new AtelierPlanningError("INVALID_REFERENCE_PACK", "Packed physical bytes may be bound only once.");
  }
  packs.forEach((pack) => assertPack(operation, pack, expectedReferences));

  const packsByConstituent = new Map<string, AttestedReferencePack>();
  for (const pack of packs) {
    for (const constituent of pack.constituents) {
      const key = exactReferenceKey(constituent);
      if (packsByConstituent.has(key)) {
        throw new AtelierPlanningError(
          "INVALID_REFERENCE_PACK",
          `${constituent.role} is claimed by more than one pack.`,
        );
      }
      packsByConstituent.set(key, pack);
    }
  }

  const emittedPacks = new Set<ReferencePackRole>();
  const bindings: PhysicalReferenceBinding[] = [];
  for (const reference of expectedReferences) {
    const logical: LogicalReference = {
      kind: reference.kind,
      role: reference.role,
      assetId: reference.assetId,
      sha256: reference.sha256,
    } as LogicalReference;
    const pack = packsByConstituent.get(exactReferenceKey(logical));
    if (pack) {
      if (!emittedPacks.has(pack.packRole)) {
        emittedPacks.add(pack.packRole);
        bindings.push(physicalReferenceBindingSchema.parse({
          slot: bindings.length + 1,
          physicalRole: pack.packRole,
          assetId: pack.assetId,
          sha256: pack.sha256,
          privacyClass: pack.privacyClass,
          packing: {
            method: pack.method,
            packRole: pack.packRole,
            attestationId: pack.attestationId,
          },
          constituents: pack.constituents,
        }));
      }
      continue;
    }
    bindings.push(physicalReferenceBindingSchema.parse({
      slot: bindings.length + 1,
      physicalRole: logical.role,
      assetId: logical.assetId,
      sha256: logical.sha256,
      privacyClass: reference.privacyClass,
      packing: null,
      constituents: [logical],
    }));
  }
  const physicalAssetKeys = bindings.map((binding) => `${binding.assetId}:${binding.sha256}`);
  if (new Set(physicalAssetKeys).size !== physicalAssetKeys.length) {
    throw new AtelierPlanningError(
      "INVALID_REFERENCE_PACK",
      "One physical input cannot occupy more than one ordered reference slot.",
    );
  }
  return bindings;
}

export type AtelierExecutionPlan = Readonly<{
  operation: AtelierOperation;
  operationId: string;
  semanticOperationHash: string;
  adapter: AtelierAdapterCapabilities;
  orderedReferences: readonly PhysicalReferenceBinding[];
  physicalReferenceCount: number;
}>;

export function planAtelierOperation(input: {
  operation: unknown;
  adapter: unknown;
  packs?: readonly unknown[];
}): AtelierExecutionPlan {
  const operation = parseOperation(input.operation);
  const adapter = parseCapabilities(input.adapter);
  if (!adapter.supportedStages.includes(operation.stage)) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${adapter.adapterId} does not support ${operation.stage}.`,
      Object.freeze({ stage: operation.stage, adapterId: adapter.adapterId }),
    );
  }
  const output = operation.outputContract;
  if (!adapter.supportedOutputModes.includes(output.mode)) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${adapter.adapterId} does not support output mode ${output.mode}.`,
      Object.freeze({ outputMode: output.mode, adapterId: adapter.adapterId }),
    );
  }
  if (!adapter.supportedGeneratedArtifactFormats.includes(output.generatedArtifact.format)) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${adapter.adapterId} cannot generate ${output.generatedArtifact.format} artifacts.`,
      Object.freeze({
        generatedArtifactFormat: output.generatedArtifact.format,
        adapterId: adapter.adapterId,
      }),
    );
  }
  if (!adapter.supportedFinalFormats.includes(output.finalFormat)) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${adapter.adapterId} cannot materialize ${output.finalFormat} final output.`,
      Object.freeze({ finalFormat: output.finalFormat, adapterId: adapter.adapterId }),
    );
  }
  if (output.generatedArtifact.alpha === "REQUIRED" && !adapter.supportsRequiredAlpha) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${adapter.adapterId} cannot provide required transparent alpha.`,
      Object.freeze({ outputMode: output.mode, adapterId: adapter.adapterId }),
    );
  }
  const orderedReferences = compileAtelierReferenceBindings(operation, input.packs ?? []);
  if (orderedReferences.length > adapter.maxPhysicalReferences) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${operation.stage} resolves to ${orderedReferences.length} physical references; ${adapter.adapterId} allows ${adapter.maxPhysicalReferences}.`,
      Object.freeze({
        requiredPhysicalReferences: orderedReferences.length,
        maxPhysicalReferences: adapter.maxPhysicalReferences,
      }),
    );
  }
  const unsupportedPrivacy = orderedReferences.find((reference) =>
    !adapter.acceptedPrivacyClasses.includes(reference.privacyClass)
  );
  if (unsupportedPrivacy) {
    throw new AtelierPlanningError(
      "BLOCKED_CAPABILITY",
      `${adapter.adapterId} cannot receive ${unsupportedPrivacy.privacyClass} authority.`,
      Object.freeze({
        physicalRole: unsupportedPrivacy.physicalRole,
        privacyClass: unsupportedPrivacy.privacyClass,
      }),
    );
  }

  const semanticHash = semanticOperationHash(operation);
  return Object.freeze({
    operation,
    operationId: deriveOperationId(operation),
    semanticOperationHash: semanticHash,
    adapter,
    orderedReferences: Object.freeze(orderedReferences),
    physicalReferenceCount: orderedReferences.length,
  });
}
