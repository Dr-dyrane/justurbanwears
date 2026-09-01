import { createHash } from "node:crypto";
import {
  STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
  STUDIO_ATELIER_SHOP_STAGE_BINDINGS,
  studioAtelierShopAdoptionCommandSchema,
  type StudioAtelierShopAdoptionCommand,
  type StudioAtelierShopAdoptionMediaReceipt,
  type StudioAtelierShopAdoptionReceipt,
  type StudioAtelierShopAdoptionReview,
  type StudioAtelierShopListingFacts,
  type StudioAtelierShopMediaRole,
} from "../studio/atelier/publication-adoption-contracts";
import { canonicalStringify, sha256Text } from "../studio/atelier/canonical";
import { StudioEngineError } from "../studio/engine/errors";
import {
  listLockedStudioAtelierPublicationCandidates,
  type StudioAtelierLockedPublicationCandidate,
} from "./studio-atelier-publication-adoption-repository";
import { readAtelierArtifactBytes } from "./studio-atelier-artifact-readback";
import type { StudioOperator } from "./studio-operator";

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const SAFE_MIME_TYPES = new Set(["image/jpeg", "image/png"]);

type LockedRole = Readonly<{
  role: StudioAtelierShopMediaRole;
  candidate: StudioAtelierLockedPublicationCandidate;
}>;

type LockedPublicationSet = Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  garmentId: string;
  adoptionRevision: string;
  publicationAuthority?: StudioAtelierShopPublicationAuthority;
  roles: readonly LockedRole[];
  receipt: StudioAtelierShopAdoptionReceipt;
}>;

export type StudioAtelierShopAdoptionExactMedia = Readonly<
  StudioAtelierShopAdoptionMediaReceipt & { bytes: Uint8Array }
>;

export type StudioAtelierShopPublicationAuthority = Readonly<{
  expectedItemVersion: number;
  listingFacts: StudioAtelierShopListingFacts;
}>;

export type StudioAtelierShopAdoptionCommitInput = Readonly<{
  operatorSubject: string;
  idempotencyKey: string;
  expectedRevision: string;
  receipt: StudioAtelierShopAdoptionReceipt;
  publicationAuthority?: StudioAtelierShopPublicationAuthority;
  expectedLocks: readonly Readonly<{
    role: StudioAtelierShopMediaRole;
    operationId: string;
    expectedProjectionVersion: number;
    lockedArtifactId: string;
    lockedArtifactSha256: string;
  }>[];
  exactMedia: readonly StudioAtelierShopAdoptionExactMedia[];
}>;

/**
 * The later production adapter must implement both methods against the
 * dedicated adoption ledger. `commit` must lock all seven projections, compare
 * every expected version/artifact/hash, enforce operator + idempotency
 * uniqueness, write the immutable receipt and attach the exact bytes to the
 * Shop publication in one transaction. It may copy bytes; it may not decode,
 * resize, re-encode or otherwise transform them.
 */
export type StudioAtelierShopAdoptionLedgerPort = Readonly<{
  findByIdempotencyKey(input: Readonly<{
    operatorSubject: string;
    idempotencyKey: string;
  }>): Promise<StudioAtelierShopAdoptionReceipt | null>;
  commit(input: StudioAtelierShopAdoptionCommitInput): Promise<StudioAtelierShopAdoptionReceipt>;
}>;

type ReadDependencies = Readonly<{
  listCandidates: typeof listLockedStudioAtelierPublicationCandidates;
  readArtifact(
    artifact: StudioAtelierLockedPublicationCandidate["artifact"],
  ): Promise<Uint8Array>;
  readPublicationAuthority?(input: Readonly<{
    operatorSubject: string;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierShopPublicationAuthority>;
}>;

const defaultReadDependencies: ReadDependencies = Object.freeze({
  listCandidates: listLockedStudioAtelierPublicationCandidates,
  readArtifact: readAtelierArtifactBytes,
});

function invalidRequest(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_REQUEST",
    400,
    message,
    "Use the current authenticated Studio piece and its latest adoption review.",
  );
}

function unavailable(message: string): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    message,
    "Restore the exact seven LOCKED Atelier artifacts or install the durable adoption ledger before publishing.",
  );
}

function conflict(message: string): StudioEngineError {
  return new StudioEngineError(
    "VERSION_CONFLICT",
    409,
    message,
    "Reload the locked-media review before publishing.",
  );
}

function invalidAsset(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_ASSET",
    503,
    message,
    "Restore and verify the exact content-addressed LOCKED artifact before publishing.",
  );
}

function parseOperator(operator: StudioOperator): string {
  const subject = operator?.subject?.trim();
  if (!subject || subject.length > 240) {
    throw invalidRequest("The Studio operator identity is invalid.");
  }
  return subject;
}

function parseCommand(command: unknown): StudioAtelierShopAdoptionCommand {
  const parsed = studioAtelierShopAdoptionCommandSchema.safeParse(command);
  if (!parsed.success) {
    throw invalidRequest("The Atelier Shop adoption command is invalid.");
  }
  return parsed.data;
}

function bindingFor(candidate: StudioAtelierLockedPublicationCandidate) {
  return STUDIO_ATELIER_SHOP_STAGE_BINDINGS.find((binding) =>
    binding.view === candidate.view
    && (binding.stages as readonly string[]).includes(candidate.stage)
  );
}

function canonicalParentLocks(candidate: StudioAtelierLockedPublicationCandidate): unknown[] {
  const operation = candidate.canonicalOperation;
  if (
    operation.wardrobeItemId !== candidate.wardrobeItemId
    || operation.garmentId !== candidate.garmentId
    || operation.stage !== candidate.stage
    || operation.view !== candidate.view
    || !Array.isArray(operation.parentLocks)
  ) {
    throw unavailable("A LOCKED Atelier operation no longer matches its canonical declaration.");
  }
  return operation.parentLocks;
}

function assertCandidateTuple(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  candidate: StudioAtelierLockedPublicationCandidate;
}>): StudioAtelierShopMediaRole {
  const { operatorSubject, wardrobeItemId, candidate } = input;
  const binding = bindingFor(candidate);
  const artifact = candidate.artifact;
  if (
    !binding
    || candidate.operatorSubject !== operatorSubject
    || candidate.wardrobeItemId !== wardrobeItemId
    || !candidate.garmentId.trim()
    || candidate.operationState !== "COMPLETE"
    || candidate.executionState !== "COMPLETE"
    || candidate.projectionState !== "LOCKED"
    || candidate.technicalDecision !== "PASS"
    || candidate.semanticDecision !== "PASS"
    || candidate.userDecision !== "APPROVED"
    || !Number.isSafeInteger(candidate.projectionVersion)
    || candidate.projectionVersion < 1
    || !candidate.materializedExecutionId
    || !candidate.materializedArtifactId
    || !candidate.materializedArtifactSha256
    || !candidate.lockedArtifactId
    || !candidate.lockedAssetId?.trim()
    || !candidate.lockedArtifactSha256
    || candidate.materializedExecutionId !== artifact.executionId
    || candidate.materializedArtifactId !== artifact.id
    || candidate.lockedArtifactId !== artifact.id
    || candidate.materializedArtifactSha256 !== artifact.sha256
    || candidate.lockedArtifactSha256 !== artifact.sha256
    || !SHA256_PATTERN.test(candidate.semanticHash)
    || !SHA256_PATTERN.test(candidate.rootSemanticHash)
    || !SHA256_PATTERN.test(artifact.sha256)
    || artifact.state !== "STORED"
    || artifact.privacy !== "PRIVATE"
    || !["NORMALIZED", "COMPOSITE"].includes(artifact.kind)
    || !SAFE_MIME_TYPES.has(artifact.mimeType)
    || !Number.isSafeInteger(artifact.byteSize)
    || artifact.byteSize < 1
    || !Number.isSafeInteger(artifact.width)
    || !Number.isSafeInteger(artifact.height)
    || (artifact.width ?? 0) < 1
    || (artifact.height ?? 0) < 1
  ) {
    throw unavailable("The durable Atelier lock set contains an invalid publication artifact.");
  }
  canonicalParentLocks(candidate);
  return binding.role;
}

function parentRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function assertSiblingLineage(
  sibling: LockedRole,
  front: LockedRole,
  garmentId: string,
): void {
  const parentLocks = canonicalParentLocks(sibling.candidate).map(parentRecord);
  const accepted05 = parentLocks.filter((parent) => parent?.role === "ACCEPTED_05");
  const parent = accepted05[0];
  if (
    accepted05.length !== 1
    || !parent
    || parent.assetId !== front.candidate.lockedAssetId
    || parent.sha256 !== front.candidate.lockedArtifactSha256
    || parent.garmentId !== garmentId
    || parent.sourceStage !== "ROOM_FINAL_05"
    || parent.sourceView !== "05"
    || parent.reviewState !== "LOCKED"
  ) {
    throw unavailable("The locked 06/07 sibling does not bind the exact same-garment locked 05 parent.");
  }
}

function mediaReceipt(role: LockedRole): StudioAtelierShopAdoptionMediaReceipt {
  const { candidate } = role;
  return Object.freeze({
    role: role.role,
    operationId: candidate.operationId,
    projectionVersion: candidate.projectionVersion,
    lockedArtifactSha256: candidate.lockedArtifactSha256!,
    mimeType: candidate.artifact.mimeType as "image/jpeg" | "image/png",
    byteSize: candidate.artifact.byteSize,
    width: candidate.artifact.width!,
    height: candidate.artifact.height!,
  });
}

function receiptFor(input: Readonly<{
  wardrobeItemId: string;
  garmentId: string;
  adoptionRevision: string;
  media: readonly StudioAtelierShopAdoptionMediaReceipt[];
}>): StudioAtelierShopAdoptionReceipt {
  const body = Object.freeze({
    schemaVersion: STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
    wardrobeItemId: input.wardrobeItemId,
    garmentId: input.garmentId,
    adoptionRevision: input.adoptionRevision,
    media: input.media,
  });
  return Object.freeze({
    ...body,
    receiptId: sha256Text(`juw.studio-atelier-shop-adoption-receipt.v1\n${canonicalStringify(body)}`),
  });
}

function assembleLockedSet(input: Readonly<{
  operatorSubject: string;
  wardrobeItemId: string;
  candidates: readonly StudioAtelierLockedPublicationCandidate[];
  publicationAuthority?: StudioAtelierShopPublicationAuthority;
}>): LockedPublicationSet | null {
  const byRole = new Map<StudioAtelierShopMediaRole, LockedRole>();
  let garmentId: string | null = null;
  for (const candidate of input.candidates) {
    const role = assertCandidateTuple({ ...input, candidate });
    if (byRole.has(role)) {
      throw unavailable(`The LOCKED Atelier set has more than one current ${role} artifact.`);
    }
    if (garmentId !== null && garmentId !== candidate.garmentId) {
      throw unavailable("The LOCKED Atelier publication set crosses garment identity.");
    }
    garmentId = candidate.garmentId;
    byRole.set(role, Object.freeze({ role, candidate }));
  }
  if (byRole.size !== STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length || !garmentId) {
    return null;
  }
  const roles = STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.map((role) => byRole.get(role)!);
  for (const role of roles.slice(0, 4)) {
    if (canonicalParentLocks(role.candidate).length !== 0) {
      throw unavailable("A garment 01-04 publication lock is not an independent root operation.");
    }
  }
  const front = byRole.get("MODEL_FRONT")!;
  assertSiblingLineage(byRole.get("MODEL_LEFT_PROFILE")!, front, garmentId);
  assertSiblingLineage(byRole.get("MODEL_REAR_THREE_QUARTER")!, front, garmentId);

  const adoptionRevision = sha256Text(canonicalStringify({
    schemaVersion: STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
    operatorSubject: input.operatorSubject,
    wardrobeItemId: input.wardrobeItemId,
    garmentId,
    publicationAuthority: input.publicationAuthority ?? null,
    locks: roles.map(({ role, candidate }) => ({
      role,
      stage: candidate.stage,
      view: candidate.view,
      operationId: candidate.operationId,
      semanticHash: candidate.semanticHash,
      rootSemanticHash: candidate.rootSemanticHash,
      projectionVersion: candidate.projectionVersion,
      lockedAssetId: candidate.lockedAssetId,
      lockedArtifactId: candidate.lockedArtifactId,
      lockedArtifactSha256: candidate.lockedArtifactSha256,
      mimeType: candidate.artifact.mimeType,
      byteSize: candidate.artifact.byteSize,
      width: candidate.artifact.width,
      height: candidate.artifact.height,
    })),
  }));
  const media = Object.freeze(roles.map(mediaReceipt));
  return Object.freeze({
    operatorSubject: input.operatorSubject,
    wardrobeItemId: input.wardrobeItemId,
    garmentId,
    adoptionRevision,
    ...(input.publicationAuthority
      ? { publicationAuthority: input.publicationAuthority }
      : {}),
    roles: Object.freeze(roles),
    receipt: receiptFor({
      wardrobeItemId: input.wardrobeItemId,
      garmentId,
      adoptionRevision,
      media,
    }),
  });
}

function missingRoleBlockers(
  candidates: readonly StudioAtelierLockedPublicationCandidate[],
): readonly string[] {
  const present = new Set(candidates.map(bindingFor).filter(Boolean).map((binding) => binding!.role));
  return Object.freeze(STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER
    .filter((role) => !present.has(role))
    .map((role) => `${role} is not locked`));
}

async function loadLockedSet(input: Readonly<{
  dependencies: ReadDependencies;
  operatorSubject: string;
  wardrobeItemId: string;
}>): Promise<LockedPublicationSet | null> {
  const identity = {
    operatorSubject: input.operatorSubject,
    wardrobeItemId: input.wardrobeItemId,
  };
  const [candidates, publicationAuthority] = await Promise.all([
    input.dependencies.listCandidates(identity),
    input.dependencies.readPublicationAuthority?.(identity),
  ]);
  return assembleLockedSet({ ...input, candidates, publicationAuthority });
}

function sameReceipt(
  left: StudioAtelierShopAdoptionReceipt,
  right: StudioAtelierShopAdoptionReceipt,
): boolean {
  return canonicalStringify(left) === canonicalStringify(right);
}

function assertReusableReceipt(
  receipt: StudioAtelierShopAdoptionReceipt,
  command: StudioAtelierShopAdoptionCommand,
): void {
  const validMedia = Array.isArray(receipt.media)
    && receipt.media.length === STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length
    && receipt.media.every((item, index) =>
      item.role === STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER[index]
      && typeof item.operationId === "string"
      && item.operationId.length > 0
      && Number.isSafeInteger(item.projectionVersion)
      && item.projectionVersion > 0
      && SHA256_PATTERN.test(item.lockedArtifactSha256)
      && SAFE_MIME_TYPES.has(item.mimeType)
      && Number.isSafeInteger(item.byteSize)
      && item.byteSize > 0
      && Number.isSafeInteger(item.width)
      && item.width > 0
      && Number.isSafeInteger(item.height)
      && item.height > 0
    );
  const reconstructed = receiptFor({
    wardrobeItemId: receipt.wardrobeItemId,
    garmentId: receipt.garmentId,
    adoptionRevision: receipt.adoptionRevision,
    media: receipt.media,
  });
  if (
    receipt.schemaVersion !== STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION
    || receipt.wardrobeItemId !== command.wardrobeItemId
    || receipt.adoptionRevision !== command.expectedRevision
    || !receipt.garmentId?.trim()
    || !SHA256_PATTERN.test(receipt.adoptionRevision)
    || !validMedia
    || !sameReceipt(receipt, reconstructed)
  ) {
    throw conflict("That adoption idempotency key belongs to different or invalid locked media.");
  }
}

function assertSameSet(initial: LockedPublicationSet, latest: LockedPublicationSet | null): void {
  if (!latest || latest.adoptionRevision !== initial.adoptionRevision) {
    throw conflict("The LOCKED Atelier media changed during private readback.");
  }
}

/** Safe, no-byte readiness projection for the seller review surface. */
export function createStudioAtelierShopAdoptionReviewService(
  overrides: Partial<ReadDependencies> = {},
) {
  const dependencies = Object.freeze({ ...defaultReadDependencies, ...overrides });
  return async function review(input: Readonly<{
    operator: StudioOperator;
    wardrobeItemId: string;
  }>): Promise<StudioAtelierShopAdoptionReview> {
    const operatorSubject = parseOperator(input.operator);
    const parsed = studioAtelierShopAdoptionCommandSchema.shape.wardrobeItemId.safeParse(
      input.wardrobeItemId,
    );
    if (!parsed.success) throw invalidRequest("The Wardrobe item ID is invalid.");
    const identity = { operatorSubject, wardrobeItemId: parsed.data };
    const [candidates, publicationAuthority] = await Promise.all([
      dependencies.listCandidates(identity),
      dependencies.readPublicationAuthority?.(identity),
    ]);
    const locked = assembleLockedSet({
      operatorSubject,
      wardrobeItemId: parsed.data,
      candidates,
      publicationAuthority,
    });
    if (!locked) return Object.freeze({
      state: "BLOCKED",
      wardrobeItemId: parsed.data,
      blockers: missingRoleBlockers(candidates),
    });
    if (!locked.publicationAuthority) return Object.freeze({
      state: "BLOCKED",
      wardrobeItemId: parsed.data,
      blockers: Object.freeze(["The exact Shop listing facts are unavailable"]),
    });
    return Object.freeze({
      state: "READY",
      wardrobeItemId: locked.wardrobeItemId,
      garmentId: locked.garmentId,
      expectedRevision: locked.adoptionRevision,
      roles: STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
      listingFacts: locked.publicationAuthority.listingFacts,
    });
  };
}

export const reviewStudioAtelierShopAdoption =
  createStudioAtelierShopAdoptionReviewService();

/**
 * Exact-byte adoption executor. There is intentionally no default ledger port:
 * production must stay fail-closed until the 0020 adoption receipt/CAS schema
 * and its atomic Shop adapter are installed.
 */
export function createStudioAtelierShopAdoptionService(input: Readonly<{
  ledger: StudioAtelierShopAdoptionLedgerPort;
  dependencies?: Partial<ReadDependencies>;
}>) {
  const dependencies = Object.freeze({
    ...defaultReadDependencies,
    ...(input.dependencies ?? {}),
  });
  return async function adopt(rawInput: Readonly<{
    operator: StudioOperator;
    command: unknown;
  }>): Promise<StudioAtelierShopAdoptionReceipt> {
    const operatorSubject = parseOperator(rawInput.operator);
    const command = parseCommand(rawInput.command);
    const existing = await input.ledger.findByIdempotencyKey({
      operatorSubject,
      idempotencyKey: command.idempotencyKey,
    });
    if (existing) {
      assertReusableReceipt(existing, command);
      return existing;
    }
    const initial = await loadLockedSet({
      dependencies,
      operatorSubject,
      wardrobeItemId: command.wardrobeItemId,
    });
    if (!initial) {
      throw new StudioEngineError(
        "INVALID_TRANSITION",
        409,
        "All seven Atelier views must be explicitly approved and LOCKED before Shop adoption.",
        "Finish and lock 01-07 for this garment before publishing.",
      );
    }
    if (initial.adoptionRevision !== command.expectedRevision) {
      throw conflict("The LOCKED Atelier media changed after review.");
    }

    const exactMedia: StudioAtelierShopAdoptionExactMedia[] = [];
    for (const role of initial.roles) {
      const before = await loadLockedSet({
        dependencies,
        operatorSubject,
        wardrobeItemId: command.wardrobeItemId,
      });
      assertSameSet(initial, before);
      const bytes = new Uint8Array(await dependencies.readArtifact(role.candidate.artifact));
      if (
        bytes.byteLength !== role.candidate.artifact.byteSize
        || createHash("sha256").update(bytes).digest("hex")
          !== role.candidate.lockedArtifactSha256
      ) {
        throw invalidAsset(`The ${role.role} LOCKED artifact failed exact-byte readback.`);
      }
      const after = await loadLockedSet({
        dependencies,
        operatorSubject,
        wardrobeItemId: command.wardrobeItemId,
      });
      assertSameSet(initial, after);
      exactMedia.push(Object.freeze({ ...mediaReceipt(role), bytes }));
    }

    const final = await loadLockedSet({
      dependencies,
      operatorSubject,
      wardrobeItemId: command.wardrobeItemId,
    });
    assertSameSet(initial, final);
    const committed = await input.ledger.commit(Object.freeze({
      operatorSubject,
      idempotencyKey: command.idempotencyKey,
      expectedRevision: command.expectedRevision,
      receipt: initial.receipt,
      ...(initial.publicationAuthority
        ? { publicationAuthority: initial.publicationAuthority }
        : {}),
      expectedLocks: Object.freeze(initial.roles.map(({ role, candidate }) => Object.freeze({
        role,
        operationId: candidate.operationId,
        expectedProjectionVersion: candidate.projectionVersion,
        lockedArtifactId: candidate.lockedArtifactId!,
        lockedArtifactSha256: candidate.lockedArtifactSha256!,
      }))),
      exactMedia: Object.freeze(exactMedia),
    }));
    if (!sameReceipt(committed, initial.receipt)) {
      throw unavailable("The durable adoption ledger returned a receipt for different locked media.");
    }
    return committed;
  };
}
