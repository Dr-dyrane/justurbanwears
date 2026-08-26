import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import manifest from "../lib/server/private-asset-manifests/lulu-v4.json";
import {
  describeLuluV4Authority,
  LULU_V4_AUTHORITY_REVISION,
  parseLuluV4View,
} from "../lib/server/studio-lulu-v4-authority";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Lulu V4 private authority manifest covers canonical 05, 06 and 07 stacks", () => {
  assert.equal(LULU_V4_AUTHORITY_REVISION, "LULU_V4_2026-08-25.4");
  assert.equal(manifest.privacy, "PRIVATE_PRODUCTION_ONLY");
  assert.equal(manifest.publishable, false);
  assert.equal(manifest.assets.length, 11);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 11);
  for (const view of ["05", "06", "07"] as const) {
    const descriptor = describeLuluV4Authority(view);
    assert.equal(descriptor.stack.length, 4);
    assert.ok(descriptor.stack.some((asset) => asset.id === "lulu.face.operation-board.full.v1"));
    assert.ok(descriptor.stack.some((asset) => asset.id === "lulu.body.real.angle-contact.v4"));
    assert.ok(descriptor.stack.some((asset) => asset.id === "juw.atelier.empty-plate.v1"));
    assert.equal(descriptor.privacy, "PRIVATE_PRODUCTION_ONLY");
    assert.equal(descriptor.publishable, false);
  }
  assert.ok(describeLuluV4Authority("07").supplementalRoles.some(
    (asset) => asset.id === "lulu.body.rear.operation-board.full.v1",
  ));
});

test("Lulu V4 authority route is operator-protected and never returns Blob coordinates", async () => {
  assert.equal(parseLuluV4View("05"), "05");
  assert.throws(() => parseLuluV4View("08"));
  const [route, resolver] = await Promise.all([
    read("app/api/studio/models/lulu-v4/authority/route.ts"),
    read("lib/server/studio-lulu-v4-authority.ts"),
  ]);
  assert.match(route, /requireStudioOperator/);
  assert.match(route, /resolveLuluV4AuthorityStack/);
  assert.doesNotMatch(route, /pathname|sha256|blob\.vercel-storage|PRIVATE_BLOB_READ_WRITE_TOKEN/);
  assert.match(resolver, /getShopBlob\("private"/);
  assert.doesNotMatch(JSON.stringify(describeLuluV4Authority("07")), /pathname|sha256|blob\.vercel-storage/);
});

test("Lulu V4 sync is private, immutable and verifies every read-back", async () => {
  const source = await read("scripts/studio-models/sync-lulu-v4-authority.mjs");
  assert.match(source, /access: "private"/);
  assert.match(source, /allowOverwrite: false/);
  assert.match(source, /addRandomSuffix: false/);
  assert.match(source, /Private Blob read-back failed/);
  assert.doesNotMatch(source, /access: "public"|PUBLIC_BLOB_READ_WRITE_TOKEN/);
});
