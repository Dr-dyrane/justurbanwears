import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STUDIO_ATELIER_FASHION_NOVA_ADVISORY_VERSION,
  STUDIO_ATELIER_FASHION_NOVA_FETCH_POLICY_REVISION,
  deriveStudioAtelierFashionNovaAdvisoryHash,
  deriveStudioAtelierFashionNovaRequestFingerprint,
  isOfficialStudioAtelierFashionNovaUrl,
  projectStudioAtelierFashionNovaCheck,
  studioAtelierFashionNovaAdvisoryWriteSchema,
  type StudioAtelierFashionNovaAdvisoryBody,
  type StudioAtelierFashionNovaAdvisoryWrite,
} from "../lib/server/studio-atelier-fashion-nova-advisory-repository";
import { sha256Text } from "../lib/studio/atelier/canonical";

const ITEM = "00000000-0000-4000-8000-000000001911";
const EVIDENCE_SHA = sha256Text("official fetched Fashion Nova HTML");

function write(
  overrides: Partial<StudioAtelierFashionNovaAdvisoryWrite> = {},
): StudioAtelierFashionNovaAdvisoryWrite {
  return {
    schemaVersion: STUDIO_ATELIER_FASHION_NOVA_ADVISORY_VERSION,
    operatorSubject: "operator:advisory",
    wardrobeItemId: ITEM,
    wardrobeVersion: 3,
    sourceBindingSha256: sha256Text("source binding"),
    garmentTruthRevision: `wardrobe-truth:${ITEM}:v3`,
    garmentTruthSourceHash: sha256Text("garment truth"),
    publisher: "Fashion Nova",
    officialUrl: "https://www.fashionnova.com/collections/dresses",
    resolvedOfficialUrl: "https://www.fashionnova.com/collections/dresses",
    pageTitle: "Dresses",
    accessedAt: "2026-08-27T12:10:00.000Z",
    evidenceKind: "OFFICIAL_PAGE_FETCH",
    evidenceBlobPathname: `studio/atelier/advisories/${EVIDENCE_SHA}.html`,
    evidenceMimeType: "text/html",
    evidenceByteSize: 12_345,
    evidenceSha256: EVIDENCE_SHA,
    searchScope: ["https://www.fashionnova.com/collections/dresses"],
    matchedGarmentFacts: ["Black dress", "Close fitted silhouette"],
    decision: "KEEP",
    noCloseMatchReason: null,
    selectedStylingDirection: "Keep restrained black heels and minimal gold accessories.",
    authority: "ADVISORY_STYLING_ONLY",
    passedAsImageReference: false,
    fetchPolicyRevision: STUDIO_ATELIER_FASHION_NOVA_FETCH_POLICY_REVISION,
    idempotencyKey: "fashion-nova:wardrobe:one",
    ...overrides,
  };
}

function body(
  overrides: Partial<StudioAtelierFashionNovaAdvisoryBody> = {},
): StudioAtelierFashionNovaAdvisoryBody {
  const { idempotencyKey, ...value } = write();
  void idempotencyKey;
  return {
    ...value,
    createdAt: "2026-08-27T12:11:00.000Z",
    ...overrides,
  };
}

test("only exact HTTPS Fashion Nova hosts are eligible", () => {
  assert.equal(isOfficialStudioAtelierFashionNovaUrl("https://www.fashionnova.com/collections/dresses"), true);
  assert.equal(isOfficialStudioAtelierFashionNovaUrl("https://fashionnova.com/products/example"), true);
  assert.equal(isOfficialStudioAtelierFashionNovaUrl("http://fashionnova.com/products/example"), false);
  assert.equal(isOfficialStudioAtelierFashionNovaUrl("https://fashionnova.com.example.test/products/example"), false);
  assert.equal(isOfficialStudioAtelierFashionNovaUrl("https://fashionnova.com@evil.example/products/example"), false);
});

test("advisory records bind official bytes, source binding, and garment truth", () => {
  const base = body();
  const hash = deriveStudioAtelierFashionNovaAdvisoryHash(base);
  assert.match(hash, /^[a-f0-9]{64}$/);
  assert.equal(deriveStudioAtelierFashionNovaAdvisoryHash({ ...base }), hash);
  assert.notEqual(
    deriveStudioAtelierFashionNovaAdvisoryHash({
      ...base,
      sourceBindingSha256: sha256Text("changed source"),
    }),
    hash,
  );
  assert.notEqual(
    deriveStudioAtelierFashionNovaAdvisoryHash({
      ...base,
      garmentTruthSourceHash: sha256Text("changed truth"),
    }),
    hash,
  );
});

test("advisory writes are strict and cannot turn publisher media into provider authority", () => {
  const valid = write();
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse(valid).success, true);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    passedAsImageReference: true,
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    evidenceKind: "MANUAL_NOTE",
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    resolvedOfficialUrl: "https://example.test/dresses",
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    searchScope: ["https://fashionnova.com.example.test/dresses"],
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    evidenceBlobPathname: `https://private.example/${EVIDENCE_SHA}.html`,
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    evidenceMimeType: "application/json",
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...valid,
    browserDecision: "KEEP",
  }).success, false);
});

test("NO_CLOSE_MATCH needs official search scope and an explicit reason", () => {
  const noMatch = write({
    matchedGarmentFacts: [],
    decision: "NO_CLOSE_MATCH",
    noCloseMatchReason: "The recorded official collection search contained no close garment family.",
  });
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse(noMatch).success, true);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...noMatch,
    searchScope: [],
  }).success, false);
  assert.equal(studioAtelierFashionNovaAdvisoryWriteSchema.safeParse({
    ...noMatch,
    noCloseMatchReason: null,
  }).success, false);
});

test("idempotency fingerprints exclude the key but bind the evidence request", () => {
  const first = write();
  const second = { ...first, idempotencyKey: "fashion-nova:wardrobe:retry" };
  assert.equal(
    deriveStudioAtelierFashionNovaRequestFingerprint(first),
    deriveStudioAtelierFashionNovaRequestFingerprint(second),
  );
  assert.notEqual(
    deriveStudioAtelierFashionNovaRequestFingerprint(first),
    deriveStudioAtelierFashionNovaRequestFingerprint({
      ...first,
      evidenceSha256: sha256Text("other official bytes"),
      evidenceBlobPathname: `studio/atelier/advisories/${sha256Text("other official bytes")}.html`,
    }),
  );
});

test("official evidence fetch time cannot follow the immutable record time", () => {
  assert.throws(() => deriveStudioAtelierFashionNovaAdvisoryHash(body({
    accessedAt: "2026-08-27T12:12:00.000Z",
    createdAt: "2026-08-27T12:11:00.000Z",
  })));
});

test("the future operation projection remains advisory-only", () => {
  const record = {
    ...body(),
    id: "00000000-0000-4000-8000-000000001912",
    advisorySha256: deriveStudioAtelierFashionNovaAdvisoryHash(body()),
    idempotencyKey: "fashion-nova:wardrobe:one",
    requestFingerprint: deriveStudioAtelierFashionNovaRequestFingerprint(write()),
  };
  const projected = projectStudioAtelierFashionNovaCheck(record);
  assert.equal(projected.authority, "ADVISORY_STYLING_ONLY");
  assert.equal(projected.passedAsImageReference, false);
  assert.equal(projected.operationId, record.id);
  assert.equal("evidenceBlobPathname" in projected, false);
  assert.equal("evidenceSha256" in projected, false);
});

test("the advisory repository has no browser writer or external fetch side effect", () => {
  const repository = readFileSync(
    new URL("../lib/server/studio-atelier-fashion-nova-advisory-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repository, /Server-only persistence boundary for already-fetched official evidence/);
  assert.match(repository, /wardrobe\.version = \$\{body\.wardrobeVersion\}/);
  assert.match(repository, /advisory\.source_binding_sha256 = \$\{input\.sourceBindingSha256\}/);
  assert.match(repository, /advisory\.garment_truth_revision = \$\{input\.garmentTruthRevision\}/);
  assert.match(repository, /advisory\.garment_truth_source_hash = \$\{input\.garmentTruthSourceHash\}/);
  assert.match(repository, /export async function resolveStudioAtelierFashionNovaCheck/);
  assert.doesNotMatch(repository, /\bfetch\(|axios|passedAsImageReference:\s*true/);

  const routePath = new URL("../app/api/studio/settings/atelier-consent/route.ts", import.meta.url);
  const consentRoute = readFileSync(routePath, "utf8");
  assert.doesNotMatch(consentRoute, /FashionNova|recordStudioAtelierFashionNovaAdvisory/);
});
