import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION,
  STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
  type StudioAtelierShopAdoptionReceipt,
} from "../lib/studio/atelier/publication-adoption-contracts";
import type { StudioAtelierShopAdoptionCommitInput } from
  "../lib/server/studio-atelier-publication-adoption";
import {
  createStudioAtelierShopAdoptionHttpHandlers,
} from "../lib/server/studio-atelier-publication-adoption-http";
import {
  createStudioAtelierShopAdoptionProductionLedger,
} from "../lib/server/studio-atelier-publication-adoption-ledger";
import type {
  StudioAtelierPublishedMediaAuthorization,
  StudioAtelierShopAdoptionSqlRepository,
  StudioAtelierShopAdoptionTarget,
} from "../lib/server/studio-atelier-publication-adoption-ledger-repository";
import {
  createStudioAtelierPublishedMediaService,
} from "../lib/server/studio-atelier-publication-media";
import {
  createStudioAtelierPublishedMediaHttpHandlers,
} from "../lib/server/studio-atelier-publication-media-http";
import type { AtelierArtifactRow } from "../lib/server/studio-atelier-repository";
import { StudioEngineError } from "../lib/studio/engine/errors";

const root = fileURLToPath(new URL("..", import.meta.url));
const WARDROBE_ITEM_ID = "10000000-0000-4000-8000-000000000001";
const INTAKE_ID = "10000000-0000-4000-8000-000000000002";
const OPERATOR = "atelier-adoption-operator";

function uuid(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-8000-${index
    .toString(16).padStart(12, "0")}`;
}

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function fixture() {
  const exactMedia = STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.map((role, index) => {
    const bytes = new Uint8Array([index + 1, index + 11, index + 21]);
    return Object.freeze({
      role,
      operationId: uuid(index + 1),
      projectionVersion: index + 4,
      lockedArtifactSha256: digest(bytes),
      mimeType: "image/png" as const,
      byteSize: bytes.byteLength,
      width: 1024,
      height: 1536,
      bytes,
    });
  });
  const receiptBody = {
    schemaVersion: STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
    wardrobeItemId: WARDROBE_ITEM_ID,
    garmentId: `wardrobe:${WARDROBE_ITEM_ID}`,
    adoptionRevision: "a".repeat(64),
    media: exactMedia.map((media) => ({
      role: media.role,
      operationId: media.operationId,
      projectionVersion: media.projectionVersion,
      lockedArtifactSha256: media.lockedArtifactSha256,
      mimeType: media.mimeType,
      byteSize: media.byteSize,
      width: media.width,
      height: media.height,
    })),
  };
  const receipt = Object.freeze({
    ...receiptBody,
    receiptId: digest(new TextEncoder().encode(JSON.stringify(receiptBody))),
  }) as StudioAtelierShopAdoptionReceipt;
  const listingFacts = Object.freeze({
    title: "Coral atelier dress",
    description: "A coral atelier dress with a softly draped finish.",
    category: "Dresses" as const,
    colour: "Coral",
    sizeLabel: "M",
    condition: "Excellent",
    price: 12_500,
  });
  const commit = Object.freeze({
    operatorSubject: OPERATOR,
    idempotencyKey: "atelier-adoption:test:001",
    expectedRevision: receipt.adoptionRevision,
    receipt,
    publicationAuthority: Object.freeze({
      expectedItemVersion: 9,
      listingFacts,
    }),
    expectedLocks: Object.freeze(exactMedia.map((media, index) => Object.freeze({
      role: media.role,
      operationId: media.operationId,
      expectedProjectionVersion: media.projectionVersion,
      lockedArtifactId: uuid(index + 21),
      lockedArtifactSha256: media.lockedArtifactSha256,
    }))),
    exactMedia: Object.freeze(exactMedia),
  }) satisfies StudioAtelierShopAdoptionCommitInput;
  const target = Object.freeze({
    wardrobeItemId: WARDROBE_ITEM_ID,
    intakeId: INTAKE_ID,
    operatorSubject: OPERATOR,
    expectedVersion: 9,
    title: listingFacts.title,
    description: listingFacts.description,
    sourceCategory: "Dress",
    category: listingFacts.category,
    colour: listingFacts.colour,
    sizeLabel: listingFacts.sizeLabel,
    condition: listingFacts.condition,
    price: listingFacts.price,
    tone: "coral",
    silhouette: "dress",
    slug: `atelier-piece-${WARDROBE_ITEM_ID.replaceAll("-", "")}`,
  }) satisfies StudioAtelierShopAdoptionTarget;
  return { commit, receipt, target };
}

function repository(overrides: Partial<StudioAtelierShopAdoptionSqlRepository> = {}): StudioAtelierShopAdoptionSqlRepository {
  const value = fixture();
  return {
    assertReady: async () => undefined,
    findByIdempotencyKey: async () => null,
    loadPublishableTarget: async () => value.target,
    commitAtomically: async (input) => input.commit.receipt,
    readPublishedMediaAuthorization: async () => null,
    ...overrides,
  };
}

async function expectCode(action: () => Promise<unknown>, code: StudioEngineError["code"]) {
  await assert.rejects(action, (error: unknown) =>
    error instanceof StudioEngineError && error.code === code
  );
}

test("production ledger binds seven exact LOCKED tuples to safe same-origin media URLs in one repository atom", async () => {
  const value = fixture();
  let captured: Parameters<StudioAtelierShopAdoptionSqlRepository["commitAtomically"]>[0] | null = null;
  let readyChecks = 0;
  const ledger = createStudioAtelierShopAdoptionProductionLedger({
    repository: repository({
      assertReady: async () => { readyChecks += 1; },
      commitAtomically: async (input) => {
        captured = input;
        return input.commit.receipt;
      },
    }),
  });
  const receipt = await ledger.commit(value.commit);
  assert.deepEqual(receipt, value.receipt);
  assert.equal(readyChecks, 1);
  assert.ok(captured);
  assert.equal("exactMedia" in captured.commit, false);
  assert.deepEqual(captured.commit.publicationAuthority, value.commit.publicationAuthority);
  assert.deepEqual(captured.publicMedia.map((item) => item.role), STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER);
  captured.publicMedia.forEach((item, index) => {
    assert.equal(
      item.src,
      `/api/shop/atelier-media/${value.receipt.receiptId}/${item.role}`,
    );
    assert.equal(item.lockedArtifactId, value.commit.expectedLocks[index].lockedArtifactId);
    assert.equal(item.lockedArtifactSha256, value.commit.exactMedia[index].lockedArtifactSha256);
  });
  const serialized = JSON.stringify(captured.publicMedia);
  assert.doesNotMatch(serialized, /blob|provider|private|pathname|"bytes"/i);
});

test("production ledger rejects a target whose facts or item version differ from the reviewed authority", async () => {
  const value = fixture();
  let commits = 0;
  const ledger = createStudioAtelierShopAdoptionProductionLedger({
    repository: repository({
      loadPublishableTarget: async () => Object.freeze({
        ...value.target,
        description: "A description edited after confirmation.",
        expectedVersion: value.target.expectedVersion + 1,
      }),
      commitAtomically: async () => {
        commits += 1;
        return value.receipt;
      },
    }),
  });
  await expectCode(() => ledger.commit(value.commit), "VERSION_CONFLICT");
  assert.equal(commits, 0);
});

test("a concurrent exact claim is recovered by immutable receipt and a different claim fails closed", async () => {
  const value = fixture();
  let lookups = 0;
  const exactReplay = createStudioAtelierShopAdoptionProductionLedger({
    repository: repository({
      findByIdempotencyKey: async () => {
        lookups += 1;
        return value.receipt;
      },
      commitAtomically: async () => null,
    }),
  });
  assert.deepEqual(await exactReplay.commit(value.commit), value.receipt);
  assert.equal(lookups, 1);

  const different = {
    ...value.receipt,
    adoptionRevision: "b".repeat(64),
  } as StudioAtelierShopAdoptionReceipt;
  const conflict = createStudioAtelierShopAdoptionProductionLedger({
    repository: repository({
      findByIdempotencyKey: async () => different,
      commitAtomically: async () => null,
    }),
  });
  await expectCode(() => conflict.commit(value.commit), "VERSION_CONFLICT");
});

test("different idempotency keys for one piece converge on one publication and one exact conflict", async () => {
  const value = fixture();
  let claimed = false;
  let publications = 0;
  let arrivals = 0;
  let releaseBarrier: (() => void) | undefined;
  const barrier = new Promise<void>((resolve) => { releaseBarrier = resolve; });
  const sharedRepository = repository({
    commitAtomically: async (input) => {
      arrivals += 1;
      if (arrivals === 2) releaseBarrier?.();
      await barrier;
      if (claimed) return null;
      claimed = true;
      publications += 1;
      return input.commit.receipt;
    },
    findByIdempotencyKey: async () => null,
  });
  const ledger = createStudioAtelierShopAdoptionProductionLedger({ repository: sharedRepository });
  const otherKey = {
    ...value.commit,
    idempotencyKey: "atelier-adoption:test:different-key",
  } satisfies StudioAtelierShopAdoptionCommitInput;
  const results = await Promise.allSettled([
    ledger.commit(value.commit),
    ledger.commit(otherKey),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) =>
    result.status === "rejected"
    && result.reason instanceof StudioEngineError
    && result.reason.code === "VERSION_CONFLICT"
  ).length, 1);
  assert.equal(publications, 1);
});

test("missing publishable target reuses only an exact prior receipt and changed bytes never reach the repository atom", async () => {
  const value = fixture();
  let commits = 0;
  const replay = createStudioAtelierShopAdoptionProductionLedger({
    repository: repository({
      loadPublishableTarget: async () => null,
      findByIdempotencyKey: async () => value.receipt,
      commitAtomically: async () => { commits += 1; return value.receipt; },
    }),
  });
  assert.deepEqual(await replay.commit(value.commit), value.receipt);
  assert.equal(commits, 0);

  const changed = new Uint8Array(value.commit.exactMedia[0].bytes);
  changed[0] ^= 0xff;
  const invalidCommit = {
    ...value.commit,
    exactMedia: Object.freeze([
      Object.freeze({ ...value.commit.exactMedia[0], bytes: changed }),
      ...value.commit.exactMedia.slice(1),
    ]),
  } satisfies StudioAtelierShopAdoptionCommitInput;
  const guarded = createStudioAtelierShopAdoptionProductionLedger({
    repository: repository({
      commitAtomically: async () => { commits += 1; return value.receipt; },
    }),
  });
  await expectCode(() => guarded.commit(invalidCommit), "ENGINE_UNAVAILABLE");
  assert.equal(commits, 0);
});

function mediaAuthorization(bytes: Uint8Array): StudioAtelierPublishedMediaAuthorization {
  const sha256 = digest(bytes);
  const artifact = {
    id: uuid(21),
    executionId: uuid(31),
    ordinal: 0,
    kind: "NORMALIZED",
    role: "REVIEW_ARTIFACT",
    state: "STORED",
    blobPathname: `studio/atelier/private/${sha256}.png`,
    blobUrl: `private://${sha256}`,
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    width: 1024,
    height: 1536,
    sha256,
    metadata: {},
    quarantineReason: null,
    privacy: "PRIVATE",
    createdAt: new Date("2026-08-27T12:00:00.000Z"),
  } as AtelierArtifactRow;
  return Object.freeze({
    receiptId: "c".repeat(64),
    role: "GARMENT_FRONT",
    operatorSubject: OPERATOR,
    wardrobeItemId: WARDROBE_ITEM_ID,
    garmentId: `wardrobe:${WARDROBE_ITEM_ID}`,
    adoptionRevision: "d".repeat(64),
    publicationId: uuid(41),
    publicationState: "PUBLISHED",
    publicationSourceRevision: "d".repeat(64),
    operationId: uuid(1),
    projectionVersion: 4,
    lockedArtifactId: artifact.id,
    lockedArtifactSha256: sha256,
    mimeType: "image/png",
    byteSize: bytes.byteLength,
    width: 1024,
    height: 1536,
    artifact,
  });
}

test("public media reauthorizes current PUBLISHED state before and after exact private readback", async () => {
  const bytes = new Uint8Array([1, 2, 3, 4]);
  const authorization = mediaAuthorization(bytes);
  let authorizationReads = 0;
  let artifactReads = 0;
  const read = createStudioAtelierPublishedMediaService({
    repository: repository({
      readPublishedMediaAuthorization: async (identity) => {
        authorizationReads += 1;
        assert.deepEqual(identity, { receiptId: authorization.receiptId, role: authorization.role });
        return authorization;
      },
    }),
    readArtifact: async (artifact) => {
      artifactReads += 1;
      assert.equal(artifact.blobPathname, authorization.artifact.blobPathname);
      return bytes;
    },
  });
  const result = await read({ receiptId: authorization.receiptId, role: authorization.role });
  assert.deepEqual(result.bytes, bytes);
  assert.equal(result.sha256, authorization.lockedArtifactSha256);
  assert.equal(authorizationReads, 2);
  assert.equal(artifactReads, 1);

  let reads = 0;
  const unpublishedMidRead = createStudioAtelierPublishedMediaService({
    repository: repository({
      readPublishedMediaAuthorization: async () => (++reads === 1 ? authorization : null),
    }),
    readArtifact: async () => bytes,
  });
  await expectCode(
    () => unpublishedMidRead({ receiptId: authorization.receiptId, role: authorization.role }),
    "INVALID_ASSET",
  );
});

test("GET, HEAD, and conditional 304 all execute the media authorization service and never become positively fresh", async () => {
  const bytes = new Uint8Array([8, 9, 10]);
  const sha256 = digest(bytes);
  const authorization = mediaAuthorization(bytes);
  let authorizationReads = 0;
  let artifactReads = 0;
  const secureRead = createStudioAtelierPublishedMediaService({
    repository: repository({
      readPublishedMediaAuthorization: async () => {
        authorizationReads += 1;
        return authorization;
      },
    }),
    readArtifact: async () => {
      artifactReads += 1;
      return bytes;
    },
  });
  const handlers = createStudioAtelierPublishedMediaHttpHandlers({
    readMedia: secureRead,
  });
  const context = { params: Promise.resolve({ receiptId: authorization.receiptId, role: authorization.role }) };
  const get = await handlers.GET(new Request("https://www.justurbanwears.com/api/shop/atelier-media/x/y"), context);
  assert.equal(get.status, 200);
  assert.equal(get.headers.get("cache-control"), "public, no-cache, must-revalidate");
  assert.equal(get.headers.get("etag"), `"sha256-${sha256}"`);
  assert.deepEqual(new Uint8Array(await get.arrayBuffer()), bytes);

  const head = await handlers.HEAD(new Request("https://www.justurbanwears.com/api/shop/atelier-media/x/y", { method: "HEAD" }), context);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");

  const conditional = await handlers.GET(new Request(
    "https://www.justurbanwears.com/api/shop/atelier-media/x/y",
    { headers: { "if-none-match": `"sha256-${sha256}"` } },
  ), context);
  assert.equal(conditional.status, 304);
  assert.equal(await conditional.text(), "");
  assert.equal(authorizationReads, 6);
  assert.equal(artifactReads, 3);
  assert.doesNotMatch(get.headers.get("cache-control") ?? "", /max-age=[1-9]|immutable/);
});

test("authenticated adoption HTTP enforces route identity, same-origin mutation, and replay-safe command shape", async () => {
  const value = fixture();
  let reviewCalls = 0;
  let adoptionCalls = 0;
  const handlers = createStudioAtelierShopAdoptionHttpHandlers({
    requireOperator: async () => ({
      subject: OPERATOR,
      email: "atelier@example.com",
      displayName: "Atelier",
      role: "operator",
    }),
    service: {
      review: async () => {
        reviewCalls += 1;
        return {
          state: "READY",
          wardrobeItemId: WARDROBE_ITEM_ID,
          garmentId: value.receipt.garmentId,
          expectedRevision: value.receipt.adoptionRevision,
          roles: STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
          listingFacts: value.commit.publicationAuthority!.listingFacts,
        };
      },
      adopt: async () => {
        adoptionCalls += 1;
        return value.receipt;
      },
    },
  });
  const context = { params: Promise.resolve({ id: WARDROBE_ITEM_ID }) };
  const review = await handlers.GET(new Request(`https://studio.test/api/studio/wardrobe/${WARDROBE_ITEM_ID}/atelier/adoption`), context);
  assert.equal(review.status, 200);
  assert.equal(reviewCalls, 1);

  const command = {
    wardrobeItemId: WARDROBE_ITEM_ID,
    expectedRevision: value.receipt.adoptionRevision,
    idempotencyKey: "atelier-adoption:http:001",
    confirmation: "ADOPT_LOCKED_ATELIER_MEDIA",
  } as const;
  const adoption = await handlers.POST(new Request(
    `https://studio.test/api/studio/wardrobe/${WARDROBE_ITEM_ID}/atelier/adoption`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://studio.test" },
      body: JSON.stringify(command),
    },
  ), context);
  assert.equal(adoption.status, 200);
  assert.equal(adoptionCalls, 1);
  assert.doesNotMatch(await adoption.text(), /blob|provider|pathname|private/i);

  const mismatch = await handlers.POST(new Request(
    `https://studio.test/api/studio/wardrobe/${WARDROBE_ITEM_ID}/atelier/adoption`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://studio.test" },
      body: JSON.stringify({ ...command, wardrobeItemId: uuid(99) }),
    },
  ), context);
  assert.equal(mismatch.status, 400);
  assert.equal(adoptionCalls, 1);

  const crossOrigin = await handlers.POST(new Request(
    `https://studio.test/api/studio/wardrobe/${WARDROBE_ITEM_ID}/atelier/adoption`,
    {
      method: "POST",
      headers: { "content-type": "application/json", origin: "https://evil.test" },
      body: JSON.stringify(command),
    },
  ), context);
  assert.equal(crossOrigin.status, 403);
  assert.equal(adoptionCalls, 1);
});

test("production sources are 0020-bound, one-statement CAS-based, route-scoped, and contain no public Blob write", () => {
  assert.equal(
    STUDIO_ATELIER_SHOP_ADOPTION_REQUIRED_MIGRATION,
    "0020_studio_atelier_shop_adoption_receipts",
  );
  const repositorySource = readFileSync(
    `${root}/lib/server/studio-atelier-publication-adoption-ledger-repository.ts`,
    "utf8",
  );
  const ledgerSource = readFileSync(
    `${root}/lib/server/studio-atelier-publication-adoption-ledger.ts`,
    "utf8",
  );
  const mediaSource = readFileSync(
    `${root}/lib/server/studio-atelier-publication-media.ts`,
    "utf8",
  );
  const shopRoute = readFileSync(
    `${root}/app/api/shop/atelier-media/[receiptId]/[role]/route.ts`,
    "utf8",
  );
  assert.match(repositorySource, /studio_atelier_shop_adoption_receipts/);
  assert.match(repositorySource, /studio_atelier_shop_adoption_media/);
  assert.match(repositorySource, /pg_advisory_xact_lock\(hashtextextended\(/);
  assert.match(repositorySource, /for update of projection/);
  assert.match(repositorySource, /order by expected\.ordinal asc, operation\.id asc/);
  assert.match(repositorySource, /on conflict do nothing/);
  assert.match(repositorySource, /publication\.state = 'PUBLISHED'/);
  assert.match(repositorySource, /publication\.source_revision = receipt\.adoption_revision/);
  assert.match(repositorySource, /count\(\*\) = 7/);
  assert.match(ledgerSource, /\/api\/shop\/atelier-media\//);
  assert.doesNotMatch(`${repositorySource}\n${ledgerSource}`, /putShopBlob|PUBLIC_BLOB_READ_WRITE_TOKEN/);
  assert.match(mediaSource, /readPublishedMediaAuthorization/g);
  assert.match(mediaSource, /authorizationIdentity\(after\) !== beforeIdentity/);
  assert.match(shopRoute, /export function GET/);
  assert.match(shopRoute, /export function HEAD/);
  const gate = repositorySource.indexOf("piece_gate as materialized");
  const projections = repositorySource.indexOf("current_locks as materialized");
  const claim = repositorySource.indexOf("claim as (");
  const catalogue = repositorySource.indexOf("catalogue as (");
  assert.ok(gate >= 0 && gate < projections && projections < claim && claim < catalogue);
});
