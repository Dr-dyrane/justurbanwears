import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION,
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
} from "../lib/studio/atelier/publication-adoption-contracts";
import {
  createStudioAtelierShopAdoptionReviewService,
  createStudioAtelierShopAdoptionService,
  type StudioAtelierShopAdoptionCommitInput,
} from "../lib/server/studio-atelier-publication-adoption";
import type { StudioAtelierLockedPublicationCandidate } from
  "../lib/server/studio-atelier-publication-adoption-repository";
import type { StudioAtelierShopAdoptionReceipt } from
  "../lib/studio/atelier/publication-adoption-contracts";
import { StudioEngineError } from "../lib/studio/engine/errors";

const root = fileURLToPath(new URL("..", import.meta.url));
const OPERATOR = "atelier-shop-operator";
const WARDROBE_ITEM_ID = "10000000-0000-4000-8000-000000000001";
const GARMENT_ID = `wardrobe:${WARDROBE_ITEM_ID}`;
const operator = {
  subject: OPERATOR,
  email: "atelier-shop@example.com",
  displayName: "Atelier Shop",
  role: "operator" as const,
};

const listingFacts = Object.freeze({
  title: "Coral atelier dress",
  description: "A coral atelier dress with a softly draped finish.",
  category: "Dresses" as const,
  colour: "Coral",
  sizeLabel: "M",
  condition: "Excellent",
  price: 12_500,
});

function publicationAuthority(
  expectedItemVersion = 9,
  description = listingFacts.description,
) {
  return Object.freeze({
    expectedItemVersion,
    listingFacts: Object.freeze({ ...listingFacts, description }),
  });
}

const stages = [
  ["GARMENT_FRONT", "GARMENT_01_FRONT", "01"],
  ["GARMENT_BACK", "GARMENT_02_BACK", "02"],
  ["MANNEQUIN_FRONT", "GARMENT_03_MANNEQUIN", "03"],
  ["FABRIC_DETAIL", "GARMENT_04_DETAIL", "04"],
  ["MODEL_FRONT", "ROOM_FINAL_05", "05"],
  ["MODEL_LEFT_PROFILE", "SIBLING_06", "06"],
  ["MODEL_REAR_THREE_QUARTER", "SIBLING_07_CORE", "07"],
] as const;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function uuid(index: number, suffix = 1): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-8000-${suffix
    .toString(16).padStart(12, "0")}`;
}

function lockedSet() {
  const bytes = new Map<string, Uint8Array>();
  const rows = stages.map(([role, stage, view], index) => {
    const content = new Uint8Array([index + 1, index + 21, index + 41]);
    const sha256 = digest(content);
    const operationId = uuid(index + 1);
    const artifactId = uuid(index + 21);
    const executionId = uuid(index + 41);
    const assetId = `atelier.lock/${role.toLowerCase()}/${sha256}`;
    bytes.set(artifactId, content);
    return {
      operationId,
      operatorSubject: OPERATOR,
      wardrobeItemId: WARDROBE_ITEM_ID,
      garmentId: GARMENT_ID,
      view,
      stage,
      semanticHash: digest(new TextEncoder().encode(`semantic-${role}`)),
      rootSemanticHash: digest(new TextEncoder().encode(`root-${role}`)),
      canonicalOperation: {
        wardrobeItemId: WARDROBE_ITEM_ID,
        garmentId: GARMENT_ID,
        stage,
        view,
        parentLocks: [],
      },
      operationState: "COMPLETE",
      projectionVersion: index + 4,
      projectionState: "LOCKED",
      technicalDecision: "PASS",
      semanticDecision: "PASS",
      userDecision: "APPROVED",
      materializedExecutionId: executionId,
      materializedArtifactId: artifactId,
      materializedArtifactSha256: sha256,
      lockedArtifactId: artifactId,
      lockedAssetId: assetId,
      lockedArtifactSha256: sha256,
      executionState: "COMPLETE",
      artifact: {
        id: artifactId,
        executionId,
        ordinal: 0,
        kind: index === 4 ? "COMPOSITE" : "NORMALIZED",
        role: "REVIEW_ARTIFACT",
        state: "STORED",
        blobPathname: `atelier/${sha256}.png`,
        blobUrl: `https://private.invalid/${sha256}.png`,
        mimeType: "image/png",
        byteSize: content.byteLength,
        width: 1024,
        height: 1536,
        sha256,
        metadata: {},
        quarantineReason: null,
        privacy: "PRIVATE",
        createdAt: new Date("2026-08-27T12:00:00Z"),
      },
    } as StudioAtelierLockedPublicationCandidate;
  });
  const front = rows[4];
  for (const sibling of [rows[5], rows[6]]) {
    sibling.canonicalOperation.parentLocks = [{
      role: "ACCEPTED_05",
      assetId: front.lockedAssetId,
      sha256: front.lockedArtifactSha256,
      garmentId: GARMENT_ID,
      sourceStage: "ROOM_FINAL_05",
      sourceView: "05",
      reviewState: "LOCKED",
      lockedLayer: "COMPOSITION",
      privacyClass: "PRIVATE_GENERATED",
    }];
  }
  return { rows, bytes };
}

async function expectCode(action: () => Promise<unknown>, code: StudioEngineError["code"]) {
  await assert.rejects(action, (error: unknown) =>
    error instanceof StudioEngineError && error.code === code
  );
}

test("the review exposes one deterministic seven-role readiness shape and no private coordinates", async () => {
  const fixture = lockedSet();
  const review = createStudioAtelierShopAdoptionReviewService({
    readPublicationAuthority: async () => publicationAuthority(),
    listCandidates: async (input) => {
      assert.deepEqual(input, { operatorSubject: OPERATOR, wardrobeItemId: WARDROBE_ITEM_ID });
      return fixture.rows;
    },
  });
  const result = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.equal(result.state, "READY");
  if (result.state !== "READY") return;
  assert.deepEqual(result.roles, STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER);
  assert.match(result.expectedRevision, /^[0-9a-f]{64}$/);
  const serialized = JSON.stringify(result);
  assert.doesNotMatch(serialized, /blob|provider|pathname|private\.invalid|sha256/i);
});

test("review and adoption bind the exact listing facts and item version into one revision", async () => {
  const fixture = lockedSet();
  let authority = publicationAuthority();
  const review = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => fixture.rows,
    readPublicationAuthority: async () => authority,
  });
  const first = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.equal(first.state, "READY");
  if (first.state !== "READY") return;
  assert.deepEqual(first.listingFacts, listingFacts);

  authority = publicationAuthority(10, "A newly edited description.");
  const changed = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.equal(changed.state, "READY");
  if (changed.state !== "READY") return;
  assert.notEqual(changed.expectedRevision, first.expectedRevision);

  let authorityReads = 0;
  let commits = 0;
  const adopt = createStudioAtelierShopAdoptionService({
    dependencies: {
      listCandidates: async () => fixture.rows,
      readPublicationAuthority: async () => {
        authorityReads += 1;
        return authorityReads === 1
          ? publicationAuthority()
          : publicationAuthority(10, "A newly edited description.");
      },
      readArtifact: async (artifact) => fixture.bytes.get(artifact.id)!,
    },
    ledger: {
      findByIdempotencyKey: async () => null,
      commit: async (input) => {
        commits += 1;
        return input.receipt;
      },
    },
  });
  await expectCode(
    () => adopt({
      operator,
      command: {
        wardrobeItemId: WARDROBE_ITEM_ID,
        expectedRevision: first.expectedRevision,
        idempotencyKey: "atelier-shop:test:facts-change",
        confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
      },
    }),
    "VERSION_CONFLICT",
  );
  assert.equal(commits, 0);
});

test("SEMANTIC_PASS or missing locks are never presented as publishable", async () => {
  const fixture = lockedSet();
  const semanticOnly = fixture.rows.filter((row) => row.stage !== "SIBLING_06");
  const review = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => semanticOnly,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  const result = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.deepEqual(result, {
    state: "BLOCKED",
    wardrobeItemId: WARDROBE_ITEM_ID,
    blockers: ["MODEL_LEFT_PROFILE is not locked"],
  });

  const includedButNotLocked = lockedSet();
  includedButNotLocked.rows[5].projectionState = "SEMANTIC_PASS";
  const malformedReview = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => includedButNotLocked.rows,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  await expectCode(
    () => malformedReview({ operator, wardrobeItemId: WARDROBE_ITEM_ID }),
    "ENGINE_UNAVAILABLE",
  );
});

test("cross-garment sets, duplicate roles, and sibling chains that do not bind exact 05 fail closed", async () => {
  const crossGarment = lockedSet();
  crossGarment.rows[3].garmentId = "wardrobe:different";
  crossGarment.rows[3].canonicalOperation.garmentId = "wardrobe:different";
  const crossReview = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => crossGarment.rows,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  await expectCode(
    () => crossReview({ operator, wardrobeItemId: WARDROBE_ITEM_ID }),
    "ENGINE_UNAVAILABLE",
  );

  const duplicate = lockedSet();
  const duplicateReview = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => [...duplicate.rows, duplicate.rows[0]],
    readPublicationAuthority: async () => publicationAuthority(),
  });
  await expectCode(
    () => duplicateReview({ operator, wardrobeItemId: WARDROBE_ITEM_ID }),
    "ENGINE_UNAVAILABLE",
  );

  const chained = lockedSet();
  const wrongParent = chained.rows[6].canonicalOperation.parentLocks[0] as Record<string, unknown>;
  wrongParent.assetId = chained.rows[5].lockedAssetId;
  wrongParent.sha256 = chained.rows[5].lockedArtifactSha256;
  const chainedReview = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => chained.rows,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  await expectCode(
    () => chainedReview({ operator, wardrobeItemId: WARDROBE_ITEM_ID }),
    "ENGINE_UNAVAILABLE",
  );
});

test("adoption reauthorizes every exact private byte before and after read and commits without transformation", async () => {
  const fixture = lockedSet();
  let listCalls = 0;
  let readCalls = 0;
  let committed: StudioAtelierShopAdoptionCommitInput | null = null;
  const review = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => fixture.rows,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  const ready = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.equal(ready.state, "READY");
  if (ready.state !== "READY") return;
  const adopt = createStudioAtelierShopAdoptionService({
    dependencies: {
      listCandidates: async () => {
        listCalls += 1;
        return fixture.rows;
      },
      readPublicationAuthority: async () => publicationAuthority(),
      readArtifact: async (artifact) => {
        readCalls += 1;
        return fixture.bytes.get(artifact.id)!;
      },
    },
    ledger: {
      findByIdempotencyKey: async () => null,
      commit: async (input) => {
        committed = input;
        return input.receipt;
      },
    },
  });
  const receipt = await adopt({
    operator,
    command: {
      wardrobeItemId: WARDROBE_ITEM_ID,
      expectedRevision: ready.expectedRevision,
      idempotencyKey: "atelier-shop:test:001",
      confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
    },
  });
  assert.equal(listCalls, 16);
  assert.equal(readCalls, 7);
  assert.ok(committed);
  assert.deepEqual(committed.exactMedia.map((item) => item.role), STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER);
  committed.exactMedia.forEach((item, index) => {
    assert.deepEqual(item.bytes, fixture.bytes.get(fixture.rows[index].artifact.id));
    assert.equal(digest(item.bytes), item.lockedArtifactSha256);
  });
  assert.deepEqual(receipt, committed.receipt);
  const serialized = JSON.stringify(receipt);
  assert.doesNotMatch(serialized, /blob|provider|pathname|url|private\.invalid/i);
});

test("lost-response replay returns only the exact immutable receipt without rereading private bytes", async () => {
  const fixture = lockedSet();
  let stored: StudioAtelierShopAdoptionReceipt | null = null;
  let reads = 0;
  let commits = 0;
  const review = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => fixture.rows,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  const ready = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.equal(ready.state, "READY");
  if (ready.state !== "READY") return;
  const adopt = createStudioAtelierShopAdoptionService({
    dependencies: {
      listCandidates: async () => fixture.rows,
      readPublicationAuthority: async () => publicationAuthority(),
      readArtifact: async (artifact) => {
        reads += 1;
        return fixture.bytes.get(artifact.id)!;
      },
    },
    ledger: {
      findByIdempotencyKey: async () => stored,
      commit: async (input) => {
        commits += 1;
        stored = input.receipt;
        return input.receipt;
      },
    },
  });
  const command = {
    wardrobeItemId: WARDROBE_ITEM_ID,
    expectedRevision: ready.expectedRevision,
    idempotencyKey: "atelier-shop:test:replay",
    confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
  } as const;
  const first = await adopt({ operator, command });
  const second = await adopt({ operator, command });
  assert.deepEqual(second, first);
  assert.equal(commits, 1);
  assert.equal(reads, 7);
});

test("a lock change or byte mismatch during readback prevents the adoption commit", async () => {
  const fixture = lockedSet();
  const review = createStudioAtelierShopAdoptionReviewService({
    listCandidates: async () => fixture.rows,
    readPublicationAuthority: async () => publicationAuthority(),
  });
  const ready = await review({ operator, wardrobeItemId: WARDROBE_ITEM_ID });
  assert.equal(ready.state, "READY");
  if (ready.state !== "READY") return;
  let listCalls = 0;
  let commits = 0;
  const adoptChanged = createStudioAtelierShopAdoptionService({
    dependencies: {
      listCandidates: async () => {
        listCalls += 1;
        if (listCalls >= 3) {
          const changed = lockedSet().rows;
          changed[0].projectionVersion += 1;
          return changed;
        }
        return fixture.rows;
      },
      readPublicationAuthority: async () => publicationAuthority(),
      readArtifact: async (artifact) => fixture.bytes.get(artifact.id)!,
    },
    ledger: {
      findByIdempotencyKey: async () => null,
      commit: async (input) => {
        commits += 1;
        return input.receipt;
      },
    },
  });
  await expectCode(
    () => adoptChanged({
      operator,
      command: {
        wardrobeItemId: WARDROBE_ITEM_ID,
        expectedRevision: ready.expectedRevision,
        idempotencyKey: "atelier-shop:test:changed",
        confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
      },
    }),
    "VERSION_CONFLICT",
  );
  assert.equal(commits, 0);

  const badBytes = createStudioAtelierShopAdoptionService({
    dependencies: {
      listCandidates: async () => fixture.rows,
      readPublicationAuthority: async () => publicationAuthority(),
      readArtifact: async () => new Uint8Array([9, 9, 9]),
    },
    ledger: {
      findByIdempotencyKey: async () => null,
      commit: async (input) => input.receipt,
    },
  });
  await expectCode(
    () => badBytes({
      operator,
      command: {
        wardrobeItemId: WARDROBE_ITEM_ID,
        expectedRevision: ready.expectedRevision,
        idempotencyKey: "atelier-shop:test:bad-bytes",
        confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
      },
    }),
    "INVALID_ASSET",
  );
});

test("the production reader is SELECT-only and the migration hold is explicit", () => {
  assert.equal(
    STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION,
    "0020_studio_atelier_shop_adoption_receipts",
  );
  const repository = readFileSync(
    `${root}/lib/server/studio-atelier-publication-adoption-repository.ts`,
    "utf8",
  );
  const service = readFileSync(
    `${root}/lib/server/studio-atelier-publication-adoption.ts`,
    "utf8",
  );
  assert.match(repository, /operatorSubject/);
  assert.match(repository, /wardrobeItemId/);
  assert.match(repository, /eq\(studioAtelierOperationProjections\.state, "LOCKED"\)/);
  assert.doesNotMatch(repository, /\.insert\(|\.update\(|\.delete\(|insert into|update .* set|delete from/i);
  assert.match(service, /There is intentionally no default ledger port/);
  assert.match(service, /expectedProjectionVersion/);
  assert.match(service, /It may copy bytes; it may not decode/);
  assert.doesNotMatch(service, /studio-atelier-lock-service/);
  assert.match(service, /studio-atelier-artifact-readback/);
});
