import { createHash } from "node:crypto";
import {
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
  type StudioAtelierShopAdoptionReceipt,
  type StudioAtelierShopMediaRole,
} from "../studio/atelier/publication-adoption-contracts";
import { canonicalStringify } from "../studio/atelier/canonical";
import { StudioEngineError } from "../studio/engine/errors";
import type {
  StudioAtelierShopAdoptionCommitInput,
  StudioAtelierShopAdoptionLedgerPort,
} from "./studio-atelier-publication-adoption";
import {
  studioAtelierShopAdoptionSqlRepository,
  type StudioAtelierShopAdoptionPublicMedia,
  type StudioAtelierShopAdoptionSqlRepository,
  type StudioAtelierShopAdoptionTarget,
} from "./studio-atelier-publication-adoption-ledger-repository";

function conflict(message: string): StudioEngineError {
  return new StudioEngineError(
    "VERSION_CONFLICT",
    409,
    message,
    "Reload the locked-media review and keep the same idempotency key only for the same command.",
  );
}

function unavailable(message: string): StudioEngineError {
  return new StudioEngineError(
    "ENGINE_UNAVAILABLE",
    503,
    message,
    "Restore the exact seven LOCKED artifacts and the verified 0020 adoption ledger before publishing.",
  );
}

function invalidTransition(message: string): StudioEngineError {
  return new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    message,
    "Use a private, unarchived Wardrobe piece that has not already been published.",
  );
}

function sameReceipt(
  left: StudioAtelierShopAdoptionReceipt,
  right: StudioAtelierShopAdoptionReceipt,
): boolean {
  return canonicalStringify(left) === canonicalStringify(right);
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function targetMatchesReviewedAuthority(
  target: StudioAtelierShopAdoptionTarget,
  commit: StudioAtelierShopAdoptionCommitInput,
): boolean {
  const authority = commit.publicationAuthority;
  if (!authority || authority.expectedItemVersion !== target.expectedVersion) return false;
  return canonicalStringify(authority.listingFacts) === canonicalStringify({
    title: target.title,
    description: target.description,
    category: target.category,
    colour: target.colour,
    sizeLabel: target.sizeLabel,
    condition: target.condition,
    price: target.price,
  });
}

function publicMediaFor(input: StudioAtelierShopAdoptionCommitInput): readonly StudioAtelierShopAdoptionPublicMedia[] {
  if (
    input.expectedLocks.length !== STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length
    || input.exactMedia.length !== STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.length
  ) throw unavailable("The adoption commit did not contain exactly seven ordered LOCKED media roles.");

  const expectedLocks = new Map(input.expectedLocks.map((item) => [item.role, item]));
  const seen = new Set<StudioAtelierShopMediaRole>();
  return Object.freeze(STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.map((role, ordinal) => {
    const media = input.exactMedia[ordinal];
    const lock = expectedLocks.get(role);
    if (
      !media
      || media.role !== role
      || seen.has(role)
      || !lock
      || media.operationId !== lock.operationId
      || media.projectionVersion !== lock.expectedProjectionVersion
      || media.lockedArtifactSha256 !== lock.lockedArtifactSha256
      || media.bytes.byteLength !== media.byteSize
      || sha256(media.bytes) !== media.lockedArtifactSha256
    ) throw unavailable(`The ${role} adoption media no longer matches its exact LOCKED receipt.`);
    seen.add(role);
    return Object.freeze({
      role,
      src: `/api/shop/atelier-media/${input.receipt.receiptId}/${role}`,
      operationId: media.operationId,
      projectionVersion: media.projectionVersion,
      lockedArtifactId: lock.lockedArtifactId,
      lockedArtifactSha256: media.lockedArtifactSha256,
      mimeType: media.mimeType,
      byteSize: media.byteSize,
      width: media.width,
      height: media.height,
    });
  }));
}

export function createStudioAtelierShopAdoptionProductionLedger(input: Readonly<{
  repository?: StudioAtelierShopAdoptionSqlRepository;
}> = {}): StudioAtelierShopAdoptionLedgerPort {
  const repository = input.repository ?? studioAtelierShopAdoptionSqlRepository;
  return Object.freeze({
    async findByIdempotencyKey(key) {
      await repository.assertReady();
      return repository.findByIdempotencyKey(key);
    },

    async commit(commit) {
      await repository.assertReady();
      const target = await repository.loadPublishableTarget({
        operatorSubject: commit.operatorSubject,
        wardrobeItemId: commit.receipt.wardrobeItemId,
      });
      if (!target) {
        const replay = await repository.findByIdempotencyKey({
          operatorSubject: commit.operatorSubject,
          idempotencyKey: commit.idempotencyKey,
        });
        if (replay) {
          if (!sameReceipt(replay, commit.receipt)) {
            throw conflict("That adoption idempotency key belongs to different locked media.");
          }
          return replay;
        }
        throw invalidTransition("This Wardrobe piece cannot begin a new Atelier Shop adoption.");
      }
      if (!targetMatchesReviewedAuthority(target, commit)) {
        throw conflict("The reviewed Shop listing changed before publication.");
      }

      const committed = await repository.commitAtomically({
        commit: Object.freeze({
          operatorSubject: commit.operatorSubject,
          idempotencyKey: commit.idempotencyKey,
          expectedRevision: commit.expectedRevision,
          receipt: commit.receipt,
          publicationAuthority: commit.publicationAuthority,
          expectedLocks: commit.expectedLocks,
        }),
        target,
        publicMedia: publicMediaFor(commit),
      });
      if (committed) {
        if (!sameReceipt(committed, commit.receipt)) {
          throw unavailable("The 0020 adoption ledger committed a receipt for different locked media.");
        }
        return committed;
      }

      // A concurrent exact replay can lose the unique insert race after both
      // callers completed private readback. Re-read the immutable receipt;
      // never repeat or synthesize the transaction.
      const replay = await repository.findByIdempotencyKey({
        operatorSubject: commit.operatorSubject,
        idempotencyKey: commit.idempotencyKey,
      });
      if (!replay || !sameReceipt(replay, commit.receipt)) {
        throw conflict("The Wardrobe piece or its adoption receipt changed during publication.");
      }
      return replay;
    },
  });
}

export const studioAtelierShopAdoptionProductionLedger =
  createStudioAtelierShopAdoptionProductionLedger();
