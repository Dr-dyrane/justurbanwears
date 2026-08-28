import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createInitialStudioState } from "../lib/studio/domain/state";
import { studioReducer } from "../lib/studio/machines/studio-machine";
import {
  operatorSafePendingCapture,
  requirePendingCaptureContract,
} from "../lib/studio/engine/pending-capture-service";
import { StudioEngineError } from "../lib/studio/engine/errors";
import { getPendingWardrobeProductContract } from "../lib/studio/seeds/private-wardrobe-products";

const root = process.cwd();
const migration = readFileSync(`${root}/drizzle/shop-postgres/0005_dazzling_sister_grimm.sql`, "utf8");
const journal = JSON.parse(readFileSync(`${root}/drizzle/shop-postgres/meta/_journal.json`, "utf8")) as {
  entries: Array<{ idx: number; tag: string }>;
};
const snapshot = JSON.parse(readFileSync(`${root}/drizzle/shop-postgres/meta/0005_snapshot.json`, "utf8")) as {
  tables: Record<string, unknown>;
};
const route = readFileSync(`${root}/app/api/studio/pending-products/[sku]/captures/route.ts`, "utf8");
const assetRoute = readFileSync(`${root}/app/api/studio/pending-products/[sku]/captures/[captureId]/route.ts`, "utf8");
const service = readFileSync(`${root}/lib/studio/engine/pending-capture-service.ts`, "utf8");
const surface = readFileSync(`${root}/components/studio/draft-direct-captures.tsx`, "utf8");

test("canonical 0005 adds only private operator-approved pending captures", () => {
  assert.match(migration, /CREATE TABLE "studio_pending_product_captures"/);
  assert.match(migration, /operator_approved_at/);
  assert.match(migration, /privacy" = 'PRIVATE'/);
  assert.match(migration, /GARMENT_FRONT', 'GARMENT_BACK', 'FABRIC_DETAIL/);
  assert.match(migration, /operator_subject","sku","role/);
  assert.ok((journal.entries.at(-1)?.idx ?? -1) >= 5);
  assert.equal(journal.entries.find((entry) => entry.idx === 5)?.tag, "0005_dazzling_sister_grimm");
  assert.deepEqual(
    journal.entries.map((entry) => entry.idx),
    journal.entries.map((_, index) => index),
  );
  assert.ok(snapshot.tables["public.studio_pending_product_captures"]);
  assert.doesNotMatch(migration, /shop_catalogue|shop_inventory/i);
});

test("server accepts only canonical missing direct-capture roles", () => {
  const contract = requirePendingCaptureContract("JUW-017", "GARMENT_FRONT");
  assert.equal(contract.sku, "JUW-017");
  for (const [sku, role] of [
    ["DYN-097", "GARMENT_FRONT"],
    ["JUW-013", "GARMENT_FRONT"],
    ["JUW-017", "MODEL_FRONT"],
  ] as const) {
    assert.throws(
      () => requirePendingCaptureContract(sku, role),
      (error) => error instanceof StudioEngineError && [400, 404].includes(error.status),
    );
  }
});

test("operator-safe capture DTO exposes only its authenticated proxy", () => {
  const safe = operatorSafePendingCapture({
    id: "9cf436eb-2a3f-47c8-8df1-886f62e26bf0",
    operatorSubject: "operator-secret",
    sku: "JUW-017",
    role: "GARMENT_BACK",
    blobPathname: "studio/operators/secret/private.webp",
    mimeType: "image/webp",
    byteSize: 1234,
    width: 1122,
    height: 1402,
    sha256: "a".repeat(64),
    privacy: "PRIVATE",
    origin: "DIRECT",
    completionJobId: null,
    operatorApprovedAt: new Date("2026-08-13T00:00:00.000Z"),
    createdAt: new Date("2026-08-13T00:00:00.000Z"),
    updatedAt: new Date("2026-08-13T00:00:00.000Z"),
  });
  const serialized = JSON.stringify(safe);
  assert.match(safe.assetUrl, /^\/api\/studio\/pending-products\/JUW-017\/captures\//);
  assert.doesNotMatch(serialized, /operator-secret|blobPathname|sha256|private\.webp/);
});

test("durable capture sync is authoritative without publishing", () => {
  const contract = getPendingWardrobeProductContract("JUW-017");
  assert.ok(contract);
  let state = {
    ...createInitialStudioState(),
    garments: [{
      ...contract.garment,
      state: "READY" as const,
      canonState: "APPROVED" as const,
      mediaState: "READY" as const,
      references: [
        ...contract.garment.references.map((reference) => ({ ...reference })),
        { id: "pending-capture-stale", view: "FRONT" as const, quality: 100 },
      ],
    }],
  };

  state = studioReducer(state, {
    type: "GARMENT_PENDING_CAPTURES_SYNCED",
    id: contract.garment.id,
    references: [],
  });
  assert.equal(state.garments[0].references.some((reference) => reference.id === "pending-capture-stale"), false);
  assert.equal(state.garments[0].mediaState, contract.garment.references.length ? "DRAFT" : "EMPTY");
  assert.equal(state.garments[0].state, "DRAFT");
  assert.equal(state.garments[0].canonState, "DRAFT");

  state = studioReducer(state, {
    type: "GARMENT_PENDING_CAPTURES_SYNCED",
    id: contract.garment.id,
    references: [["front", "FRONT"], ["back", "BACK"], ["detail", "DETAIL"]].map(([id, view]) => ({
      id: `pending-capture-${id}`,
      view: view as "FRONT" | "BACK" | "DETAIL",
      quality: 100,
    })),
  });
  assert.equal(state.garments[0].mediaState, "READY");
  assert.equal(state.garments[0].state, "DRAFT");
  assert.equal(state.garments[0].canonState, "REVIEW");
  assert.deepEqual(state.listings, []);
});

test("capture route and UI preserve auth, limits, confirmation, and private delivery", () => {
  assert.match(route, /requireStudioOperator/);
  assert.match(route, /MAX_STUDIO_IMAGE_BYTES/);
  assert.match(service, /verifyStudioImage/);
  assert.match(service, /putShopBlob\("private"/);
  assert.match(assetRoute, /private, no-store, max-age=0/);
  assert.match(surface, /"Use photo"/);
  assert.match(surface, /capture="environment"/);
  assert.match(surface, />Replace/);
  assert.match(surface, /disabled=\{busy\}/);
  assert.match(surface, /syncPendingGarmentCaptures/);
  assert.match(surface, /saved privately/i);
  assert.doesNotMatch(surface, /shop\/products|publicSafeMedia|publishListing/);
});
