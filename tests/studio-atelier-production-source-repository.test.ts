import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  canonicalStudioAtelierGarmentId,
  createStudioAtelierProductionSourceRepository,
  resolveExactLockedArtifact,
  resolveExactReviewableSubjectA,
  type StudioAtelierLockedProductionArtifact,
  type StudioAtelierProductionImageRecord,
  type StudioAtelierReviewableProductionArtifact,
} from "../lib/server/studio-atelier-production-source-repository";

const ITEM = "00000000-0000-4000-8000-000000009101";

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function image(assetId: string): StudioAtelierProductionImageRecord {
  return Object.freeze({
    assetId,
    sha256: digest(assetId),
    mimeType: "image/png",
    byteSize: 100,
    width: 10,
    height: 10,
    blobPathname: `private/${assetId}.png`,
  });
}

function locked(assetId = "locked-front"): StudioAtelierLockedProductionArtifact {
  const exact = image(assetId);
  return Object.freeze({
    operationId: "00000000-0000-4000-8000-000000009102",
    semanticHash: digest("operation"),
    parent: Object.freeze({
      role: "GARMENT_FRONT_LOCK",
      assetId: exact.assetId,
      sha256: exact.sha256,
      garmentId: `wardrobe:${ITEM}`,
      sourceStage: "GARMENT_01_FRONT",
      sourceView: "01",
      reviewState: "LOCKED",
      lockedLayer: "GARMENT",
      privacyClass: "PRIVATE_OPERATOR",
    }),
    image: exact,
  });
}

test("canonical garment identity is UUID-bound and normalized", () => {
  assert.equal(
    canonicalStudioAtelierGarmentId(ITEM.toUpperCase()),
    `wardrobe:${ITEM}`,
  );
  assert.throws(
    () => canonicalStudioAtelierGarmentId("seller-supplied-garment"),
    /Wardrobe identity is invalid/,
  );
});

test("exact locked artifacts fail closed on missing or ambiguous tuples", () => {
  const candidate = locked();
  assert.equal(resolveExactLockedArtifact([candidate], candidate.parent), candidate);
  assert.throws(
    () => resolveExactLockedArtifact([], candidate.parent),
    /could not be resolved unambiguously/,
  );
  assert.throws(
    () => resolveExactLockedArtifact([candidate, candidate], candidate.parent),
    /could not be resolved unambiguously/,
  );
});

test("Subject A donor resolution permits only the exact semantic-pass or locked artifact", () => {
  const exact = image("subject-a");
  const donor: StudioAtelierReviewableProductionArtifact = Object.freeze({
    operationId: "00000000-0000-4000-8000-000000009103",
    semanticHash: digest("subject-a-operation"),
    stage: "SUBJECT_A",
    reviewState: "GATE_PASS_PRIVATE",
    image: exact,
  });
  assert.equal(resolveExactReviewableSubjectA(donor, exact), donor);
  assert.throws(
    () => resolveExactReviewableSubjectA(null, exact),
    /not eligible for refinement/,
  );
  assert.throws(
    () => resolveExactReviewableSubjectA(
      { ...donor, reviewState: "REJECTED" as never },
      exact,
    ),
    /not eligible for refinement/,
  );
});

test("repository construction is inert and uses an injected read-only implementation", async () => {
  let reads = 0;
  const candidate = locked();
  const repository = createStudioAtelierProductionSourceRepository({
    listLockedArtifacts: async () => {
      reads += 1;
      return Object.freeze([candidate]);
    },
  });
  assert.equal(reads, 0);
  assert.deepEqual(await repository.listLockedArtifacts({
    operatorSubject: "operator-production-source",
    wardrobeItemId: ITEM,
  }), [candidate]);
  assert.equal(reads, 1);
});
