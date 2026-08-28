import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  parentLockSchema,
  type AtelierStage,
  type ParentLock,
  type ParentRole,
} from "../lib/studio/atelier/contracts";
import {
  compileAtelierOperationWithReceiptsV1,
  resolveTrustedAtelierTruthBundle,
  type StudioAtelierDeclaration,
  validateStudioAtelierDeclaration,
} from "../lib/studio/atelier/declaration-compiler";
import { semanticOperationHash } from "../lib/studio/atelier/canonical";
import {
  createStudioAtelierProductionDeclarationService,
} from "../lib/server/studio-atelier-production-declarations";
import {
  createStudioAtelierProductionPorts,
  deriveStudioAtelierAdultLikenessAuthorityReceiptHash,
  isStudioAtelierProductionPortBlockedError,
  STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION,
  type StudioAtelierAdultLikenessAuthorityReceipt,
} from "../lib/server/studio-atelier-production-ports";
import {
  deriveStudioAtelierConsentReceiptHash,
  type StudioAtelierNonZdrConsentReceipt,
} from "../lib/server/studio-atelier-execution-service";
import {
  LULU_V4_AUTHORITY_REVISION,
  type LuluV4ResolvedAuthorityAsset,
} from "../lib/server/studio-lulu-v4-authority";
import {
  createStudioAtelierStageDeclarationFactory,
  type StudioAtelierPersistedWardrobeTruth,
} from "../lib/server/studio-atelier-stage-declaration-factory";
import type {
  StudioAtelierLockedProductionArtifact,
  StudioAtelierOwnedGarmentSource,
  StudioAtelierProductionImageRecord,
  StudioAtelierProductionOperationBundle,
  StudioAtelierProductionSourceRepository,
} from "../lib/server/studio-atelier-production-source-repository";

const OPERATOR = "operator-production-ports";
const ITEM = "00000000-0000-4000-8000-000000009301";
const INTAKE = "00000000-0000-4000-8000-000000009302";
const SOURCE = "00000000-0000-4000-8000-000000009303";
const FRONT = "00000000-0000-4000-8000-000000009304";
const OPERATION = "00000000-0000-4000-8000-000000009305";

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
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
} as const);

function parent(role: ParentRole): ParentLock {
  const policy = parentPolicy[role];
  return parentLockSchema.parse({
    role,
    assetId: `atelier/locked/${role.toLowerCase()}`,
    sha256: digest(`parent:${role}`),
    garmentId: `wardrobe:${ITEM}`,
    sourceStage: policy.sourceStage,
    sourceView: policy.sourceView,
    reviewState: "LOCKED",
    lockedLayer: policy.lockedLayer,
    privacyClass: policy.privacyClass,
  });
}

function requiredParents(stage: AtelierStage): readonly ParentLock[] {
  if (stage === "SUBJECT_A" || stage === "SUBJECT_B") {
    return Object.freeze([
      parent("GARMENT_FRONT_LOCK"),
      parent("GARMENT_BACK_LOCK"),
      parent("MANNEQUIN_FRONT_LOCK"),
      parent("FABRIC_DETAIL_LOCK"),
    ]);
  }
  if (stage === "ROOM_FINAL_05") return Object.freeze([parent("ACCEPTED_SUBJECT_LOCK")]);
  if (stage === "SIBLING_06" || stage === "SIBLING_07_CORE" || stage === "SIBLING_07_RECOVERY") {
    return Object.freeze([parent("ACCEPTED_05")]);
  }
  return Object.freeze([]);
}

function fashionNovaAdvisory() {
  return Object.freeze({
    operationId: "fashion-nova:operator-production-ports:room-05",
    publisher: "Fashion Nova" as const,
    officialUrl: "https://www.fashionnova.com/products/example-dress",
    resolvedOfficialUrl: "https://www.fashionnova.com/products/example-dress",
    pageTitle: "Example black dress",
    accessedOn: "2026-08-26",
    matchedGarmentFacts: ["black dress"],
    decision: "REFINE" as const,
    selectedStylingDirection: "Restrained black heels and minimal gold accessories.",
    authority: "ADVISORY_STYLING_ONLY" as const,
    passedAsImageReference: false as const,
  });
}

function persistedTruth(
  source: StudioAtelierProductionImageRecord,
  approvedFront: StudioAtelierProductionImageRecord,
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
    sourceSha256: source.sha256,
    wardrobeState: "READY",
    wardrobeQuantity: 1,
    wardrobeVersion: 6,
    approvedAssetId: FRONT,
    wardrobeFacts: facts,
    intakeFacts: facts,
    source: Object.freeze({
      id: SOURCE,
      intakeId: INTAKE,
      role: "SOURCE",
      sha256: source.sha256,
      mimeType: source.mimeType,
      byteSize: source.byteSize,
      width: source.width,
      height: source.height,
      privacy: "PRIVATE",
    }),
    approvedFront: Object.freeze({
      id: FRONT,
      intakeId: INTAKE,
      role: "GARMENT_FRONT",
      sha256: approvedFront.sha256,
      mimeType: approvedFront.mimeType,
      byteSize: approvedFront.byteSize,
      width: approvedFront.width,
      height: approvedFront.height,
      privacy: "PRIVATE",
    }),
  });
}

function imageRecord(input: Readonly<{
  assetId: string;
  bytes: Uint8Array;
  width: number;
  height: number;
}>): StudioAtelierProductionImageRecord {
  return Object.freeze({
    assetId: input.assetId,
    sha256: digest(input.bytes),
    mimeType: "image/png",
    byteSize: input.bytes.byteLength,
    width: input.width,
    height: input.height,
    blobPathname: `private/${input.assetId}.png`,
  });
}

function lockedArtifact(
  lock: ParentLock,
  bytes: Uint8Array,
): StudioAtelierLockedProductionArtifact {
  return Object.freeze({
    operationId: `operation:${lock.role.toLowerCase()}`,
    semanticHash: digest(`operation:${lock.role}`),
    parent: lock,
    image: Object.freeze({
      assetId: lock.assetId,
      sha256: lock.sha256,
      mimeType: "image/png",
      byteSize: bytes.byteLength,
      width: 8,
      height: 12,
      blobPathname: `private/${lock.role.toLowerCase()}.png`,
    }),
  });
}

function operationBundle(
  operation: CompiledOperation,
  overrides: Readonly<{
    correctionAuthorized?: boolean;
    events?: readonly unknown[];
  }> = {},
): StudioAtelierProductionOperationBundle {
  return Object.freeze({
    row: {
      id: OPERATION,
      wardrobeItemId: operation.wardrobeItemId ?? null,
      semanticHash: semanticOperationHash(operation),
      correctionOrdinal: 0,
    },
    operation,
    projection: {
      correctionAuthorized: overrides.correctionAuthorized ?? false,
    },
    events: overrides.events ?? [],
    correction: null,
  }) as unknown as StudioAtelierProductionOperationBundle;
}

type CompiledOperation = ReturnType<typeof compileAtelierOperationWithReceiptsV1>["operation"];

async function buildHarness(stage: AtelierStage) {
  const sourceBytes = new Uint8Array(await sharp({
    create: { width: 8, height: 12, channels: 3, background: "#171717" },
  }).png().toBuffer());
  const frontBytes = new Uint8Array(await sharp({
    create: { width: 8, height: 12, channels: 3, background: "#222222" },
  }).png().toBuffer());
  const roomBytes = new Uint8Array(await sharp({
    create: { width: 1024, height: 1280, channels: 3, background: "#ded8ce" },
  }).png().toBuffer());
  const source = imageRecord({ assetId: SOURCE, bytes: sourceBytes, width: 8, height: 12 });
  const approvedFront = imageRecord({ assetId: FRONT, bytes: frontBytes, width: 8, height: 12 });
  const garment: StudioAtelierOwnedGarmentSource = Object.freeze({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    garmentId: `wardrobe:${ITEM}`,
    intakeId: INTAKE,
    wardrobeVersion: 6,
    intakeVersion: 2,
    facts: Object.freeze({
      title: "Black seam-detail dress",
      category: "Dress",
      colour: "Black",
      sizeLabel: "UK 12",
      condition: "Excellent",
    }),
    source,
    approvedFront,
    directCaptures: Object.freeze([]),
  });
  const parents = requiredParents(stage);
  const allLocks = [
    ...parents,
    ...(stage === "ROOM_FINAL_05" ? [parent("GARMENT_FRONT_LOCK")] : []),
  ].map((lock) => lockedArtifact(lock, frontBytes));
  const imageBytes = new Map<string, Uint8Array>([
    [source.assetId, sourceBytes],
    [approvedFront.assetId, frontBytes],
    ...allLocks.map((lock) => [lock.image.assetId, frontBytes] as const),
  ]);
  let bundle: StudioAtelierProductionOperationBundle | null = null;
  const sourceRepository: StudioAtelierProductionSourceRepository = Object.freeze({
    resolveOwnedGarment: async () => garment,
    listLockedArtifacts: async () => Object.freeze(allLocks),
    resolveReviewableSubjectA: async () => null,
    resolveOperation: async ({ operationId }) => operationId === OPERATION ? bundle : null,
    resolveOperationBySemanticHash: async ({ semanticHash }) =>
      bundle?.row.semanticHash === semanticHash ? bundle : null,
    readVerifiedImage: async (image) => {
      const bytes = imageBytes.get(image.assetId);
      if (!bytes) throw new Error("missing test image");
      return Object.freeze({ bytes, mimeType: image.mimeType });
    },
  });
  const stageFactory = createStudioAtelierStageDeclarationFactory({
    readWardrobeTruth: async () => persistedTruth(source, approvedFront),
    readLockedParents: async () => parents,
    readFashionNovaAdvisory: async () =>
      stage === "ROOM_FINAL_05" ? fashionNovaAdvisory() : null,
  });
  const declarations = createStudioAtelierProductionDeclarationService({
    resolveCanonicalDeclaration: (input) => stageFactory.create(input),
  });
  let authorityReads = 0;
  const resolvePrivateAuthorityAssets = async (
    assetIds: readonly string[],
  ): Promise<readonly LuluV4ResolvedAuthorityAsset[]> => {
    authorityReads += 1;
    return Object.freeze(assetIds.map((id) => {
      const bytes = id === "juw.atelier.empty-plate.v1"
        ? roomBytes
        : new TextEncoder().encode(`verified-private-authority:${id}`);
      return Object.freeze({
        id,
        role: `fixture:${id}`,
        authority: id === "juw.atelier.empty-plate.v1" ? "atelier" as const : "body" as const,
        acceptance: "ACCEPTED_OPERATIONAL_AUTHORITY" as const,
        lockedStatus: "LOCKED_IMMUTABLE" as const,
        bytes,
        mimeType: "image/png" as const,
        sha256: digest(bytes),
        width: id === "juw.atelier.empty-plate.v1" ? 1024 : 8,
        height: id === "juw.atelier.empty-plate.v1" ? 1280 : 12,
      });
    }));
  };
  const basePortsInput = Object.freeze({
    sourceRepository,
    declarations,
    resolvePrivateAuthorityAssets,
    now: () => new Date("2026-08-27T08:00:00.000Z"),
  });
  const ports = createStudioAtelierProductionPorts(basePortsInput);
  const canonical = await declarations.derive({
    operatorSubject: OPERATOR,
    wardrobeItemId: ITEM,
    stage,
  });
  const fileVerification = await ports.resolveFileVerification({
    operatorSubject: OPERATOR,
    declaration: canonical.declaration,
  });
  const validated = validateStudioAtelierDeclaration(canonical.declaration, {
    resolveFileVerification: () => fileVerification,
  });
  const rawTruth = await ports.resolveTrustedTruth({
    operatorSubject: OPERATOR,
    declaration: canonical.declaration,
  });
  const trusted = resolveTrustedAtelierTruthBundle({ resolveTrustedTruth: () => rawTruth });
  const compiled = compileAtelierOperationWithReceiptsV1({
    validatedDeclaration: validated,
    truth: trusted,
  });
  bundle = operationBundle(compiled.operation);
  return {
    basePortsInput,
    ports,
    canonical,
    fileVerification,
    operation: compiled.operation,
    getBundle: () => bundle!,
    setBundle: (value: StudioAtelierProductionOperationBundle) => { bundle = value; },
    authorityReads: () => authorityReads,
    roomBytes,
  };
}

function consent(operationId: string): StudioAtelierNonZdrConsentReceipt {
  const body = Object.freeze({
    schemaVersion: "juw.atelier-non-zdr-consent.v1" as const,
    receiptId: `atelier-consent:${operationId}`,
    operatorSubject: OPERATOR,
    operationId,
    provider: "openai" as const,
    model: "openai/gpt-image-2" as const,
    zeroDataRetention: false as const,
    providerRetentionAcknowledged: true as const,
    recordedAt: "2026-08-27T08:00:00.000Z",
  });
  return Object.freeze({
    ...body,
    receiptSha256: deriveStudioAtelierConsentReceiptHash(body),
  });
}

function adultAuthority(
  bundle: StudioAtelierProductionOperationBundle,
): StudioAtelierAdultLikenessAuthorityReceipt {
  const body = Object.freeze({
    schemaVersion: STUDIO_ATELIER_ADULT_LIKENESS_AUTHORITY_VERSION,
    operatorSubjectSha256: digest(OPERATOR),
    operationId: bundle.row.id,
    semanticOperationHash: bundle.row.semanticHash,
    stage: bundle.operation.stage,
    authorityRevision: LULU_V4_AUTHORITY_REVISION,
    subjectAuthorityId: "lulu-v4" as const,
    subjectAge: "VERIFIED_ADULT_18_PLUS" as const,
    subjectConsent: "VERIFIED_FOR_THIS_OPERATION" as const,
    likenessUse: "AUTHORIZED_FOR_THIS_OPERATION" as const,
    purpose: "NON_SEXUAL_RETAIL_FASHION_CATALOGUE" as const,
    recordedAt: "2026-08-27T08:00:00.000Z",
  });
  const receiptSha256 = deriveStudioAtelierAdultLikenessAuthorityReceiptHash(body);
  return Object.freeze({
    ...body,
    receiptId: `atelier-adult-likeness:${receiptSha256}`,
    receiptSha256,
  });
}

function expectBlocker(code: string) {
  return (error: unknown) => {
    assert.equal(isStudioAtelierProductionPortBlockedError(error), true);
    assert.equal((error as { code?: string }).code, code);
    assert.equal(JSON.stringify(error).includes("private/"), false);
    return true;
  };
}

test("garment file/truth ports bind exact direct source bytes and exclude approved-front substitutions", async () => {
  const harness = await buildHarness("GARMENT_01_FRONT");
  assert.equal(harness.fileVerification.status, "PASS");
  assert.equal(harness.fileVerification.verifiedAssetCount, 1);
  assert.equal(harness.fileVerification.directGarmentEvidence?.constituents[0]?.assetId, SOURCE);
  assert.equal(
    harness.fileVerification.directGarmentEvidence?.constituents.some((item) => item.assetId === FRONT),
    false,
  );
  assert.equal(harness.operation.directGarmentEvidence?.output.sha256.length, 64);
  assert.equal(harness.operation.authorityStack[0]?.role, "DIRECT_GARMENT_EVIDENCE");
  assert.equal(harness.authorityReads(), 0);
});

test("execution fails before bytes or provider work when retention consent is absent", async () => {
  const harness = await buildHarness("GARMENT_01_FRONT");
  await assert.rejects(
    harness.ports.resolveExecutionContext({
      operatorSubject: OPERATOR,
      operationId: OPERATION,
      requestedParentLocks: Object.freeze([]),
      dynamicReferenceSlots: Object.freeze([]),
      directGarmentEvidence: harness.operation.directGarmentEvidence ?? null,
      provider: "openai",
      model: "openai/gpt-image-2",
      zeroDataRetention: false,
    }),
    expectBlocker("PROVIDER_RETENTION_CONSENT_MISSING"),
  );
});

test("garment execution accepts an exact durable consent receipt and returns no-person safety context", async () => {
  const harness = await buildHarness("GARMENT_01_FRONT");
  const ports = createStudioAtelierProductionPorts({
    ...harness.basePortsInput,
    resolveProviderRetentionConsent: async () => consent(OPERATION),
  });
  const context = await ports.resolveExecutionContext({
    operatorSubject: OPERATOR,
    operationId: OPERATION,
    requestedParentLocks: Object.freeze([]),
    dynamicReferenceSlots: Object.freeze([]),
    directGarmentEvidence: harness.operation.directGarmentEvidence ?? null,
    provider: "openai",
    model: "openai/gpt-image-2",
    zeroDataRetention: false,
  });
  assert.equal(context.providerSafetyContext.context.mode, "NO_REAL_PERSON_OUTPUT");
  assert.equal(context.directGarmentEvidence?.sources.length, 1);
  assert.equal(context.directGarmentEvidence?.sources[0]?.constituent.assetId, SOURCE);
});

test("subject execution distinguishes missing verified-adult likeness authority", async () => {
  const harness = await buildHarness("SUBJECT_A");
  const ports = createStudioAtelierProductionPorts({
    ...harness.basePortsInput,
    resolveProviderRetentionConsent: async () => consent(OPERATION),
  });
  await assert.rejects(
    ports.resolveExecutionContext({
      operatorSubject: OPERATOR,
      operationId: OPERATION,
      requestedParentLocks: harness.operation.parentLocks.map(({ role, assetId, sha256 }) => ({
        role, assetId, sha256,
      })),
      dynamicReferenceSlots: Object.freeze([]),
      directGarmentEvidence: null,
      provider: "openai",
      model: "openai/gpt-image-2",
      zeroDataRetention: false,
    }),
    expectBlocker("ADULT_LIKENESS_AUTHORITY_MISSING"),
  );

  const readyPorts = createStudioAtelierProductionPorts({
    ...harness.basePortsInput,
    resolveProviderRetentionConsent: async () => consent(OPERATION),
    resolveAdultLikenessAuthority: async () => adultAuthority(harness.getBundle()),
  });
  const context = await readyPorts.resolveExecutionContext({
    operatorSubject: OPERATOR,
    operationId: OPERATION,
    requestedParentLocks: harness.operation.parentLocks.map(({ role, assetId, sha256 }) => ({
      role, assetId, sha256,
    })),
    dynamicReferenceSlots: Object.freeze([]),
    directGarmentEvidence: null,
    provider: "openai",
    model: "openai/gpt-image-2",
    zeroDataRetention: false,
  });
  assert.equal(context.providerSafetyContext.context.mode, "VERIFIED_ADULT_AUTHORIZED_LIKENESS");
});

test("execution reports a specific styling-advisory blocker before accepting an invalid final-05 row", async () => {
  const harness = await buildHarness("SUBJECT_A");
  const invalidFinal = Object.freeze({
    ...harness.getBundle(),
    operation: Object.freeze({
      ...harness.operation,
      stage: "ROOM_FINAL_05",
      fashionNovaCheck: undefined,
    }),
  }) as unknown as StudioAtelierProductionOperationBundle;
  harness.setBundle(invalidFinal);
  await assert.rejects(
    harness.ports.resolveExecutionContext({
      operatorSubject: OPERATOR,
      operationId: OPERATION,
      requestedParentLocks: Object.freeze([]),
      dynamicReferenceSlots: Object.freeze([]),
      directGarmentEvidence: null,
      provider: "openai",
      model: "openai/gpt-image-2",
      zeroDataRetention: false,
    }),
    expectBlocker("FASHION_NOVA_ADVISORY_MISSING"),
  );
});

test("locked room resolver reauthorizes the exact canonical room and native 4:5 profile", async () => {
  const harness = await buildHarness("ROOM_FINAL_05");
  const room = harness.operation.authorityStack.find((authority) =>
    authority.role === "LOCKED_ATELIER_ROOM"
  );
  assert.ok(room);
  const resolved = await harness.ports.resolveLockedRoom({
    operatorSubject: OPERATOR,
    operationId: OPERATION,
    expected: { assetId: room.assetId, sha256: room.sha256 },
  });
  assert.equal(resolved.width, 1024);
  assert.equal(resolved.height, 1280);
  assert.equal(digest(resolved.bytes), room.sha256);
  assert.equal(resolved.manifestRevision, LULU_V4_AUTHORITY_REVISION);
});

test("correction preparation replays only the exact durable review decision", async () => {
  const harness = await buildHarness("GARMENT_01_FRONT");
  const decision = Object.freeze({
    decision: "FIX_ONE_THING" as const,
    reason: "WRONG_STAGE_VIEW" as const,
    target: "CAMERA_ALIGNMENT" as const,
  });
  const source = Object.freeze({
    ...harness.getBundle(),
    projection: Object.freeze({ correctionAuthorized: true }),
    events: Object.freeze([{
      eventType: "CORRECTION_AUTHORIZED",
      payload: { evidence: { reviewDecision: decision } },
    }]),
  }) as unknown as StudioAtelierProductionOperationBundle;
  harness.setBundle(source);
  let preparedCorrectionOf: string | null = null;
  let preparedDeclaration: StudioAtelierDeclaration | null = null;
  const ports = createStudioAtelierProductionPorts({
    ...harness.basePortsInput,
    prepareDeclaration: async ({ declaration }) => {
      preparedDeclaration = declaration;
      preparedCorrectionOf = declaration.correctionIntent.mode === "BOUNDED_ONE_THING"
        ? declaration.correctionIntent.correctionOf
        : null;
      return Object.freeze({ operationId: "00000000-0000-4000-8000-000000009399" });
    },
  });
  const prepared = await ports.prepareCorrection({
    operatorSubject: OPERATOR,
    sourceOperationId: OPERATION,
    decision,
  });
  assert.equal(prepared.operationId, "00000000-0000-4000-8000-000000009399");
  assert.equal(preparedCorrectionOf, source.row.semanticHash);
  assert.ok(preparedDeclaration);
  const correctionFileVerification = await ports.resolveFileVerification({
    operatorSubject: OPERATOR,
    declaration: preparedDeclaration,
  });
  const correctionTruth = await ports.resolveTrustedTruth({
    operatorSubject: OPERATOR,
    declaration: preparedDeclaration,
  });
  assert.equal(correctionFileVerification.status, "PASS");
  assert.equal(
    correctionTruth.dynamicLockedTruth.correctionAuthorization?.correctionOf,
    source.row.semanticHash,
  );

  await assert.rejects(
    ports.prepareCorrection({
      operatorSubject: OPERATOR,
      sourceOperationId: OPERATION,
      decision: { ...decision, target: "OUTPUT_GEOMETRY" },
    }),
    expectBlocker("CORRECTION_AUTHORITY_MISMATCH"),
  );
});
