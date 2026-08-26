import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import manifest from "../lib/server/private-asset-manifests/lulu-v4.json";
import {
  describeLuluV4Authority,
  LULU_V4_AUTHORITY_ACCEPTANCE,
  LULU_V4_AUTHORITY_LOCKED_STATUS,
  LULU_V4_AUTHORITY_REVISION,
  parseLuluV4View,
  validateLuluV4AuthorityManifest,
} from "../lib/server/studio-lulu-v4-authority";
import {
  describeLuluV4OperationPack,
  LULU_V4_OPERATION_KINDS,
  parseLuluV4OperationKind,
} from "../lib/server/studio-lulu-v4-operation-packs";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Lulu V4 private authority manifest covers canonical 05, 06 and 07 stacks", () => {
  assert.equal(LULU_V4_AUTHORITY_REVISION, "LULU_V4_2026-08-25.7");
  assert.equal(manifest.schemaVersion, 3);
  assert.equal(manifest.privacy, "PRIVATE_PRODUCTION_ONLY");
  assert.equal(manifest.publishable, false);
  assert.equal(
    manifest.manifestPathname,
    "studio/model-authorities/lulu-v4/LULU_V4_2026-08-25.7/manifest.json",
  );
  assert.equal(manifest.assets.length, 11);
  assert.equal(new Set(manifest.assets.map((asset) => asset.id)).size, 11);
  for (const asset of manifest.assets) {
    assert.equal(asset.acceptance, LULU_V4_AUTHORITY_ACCEPTANCE);
    assert.equal(asset.lockedStatus, LULU_V4_AUTHORITY_LOCKED_STATUS);
    assert.equal(
      asset.pathname,
      `studio/model-authorities/lulu-v4/LULU_V4_2026-08-25.7/${asset.sha256}.${
        asset.mimeType === "image/png" ? "png" : "jpg"
      }`,
    );
  }
  for (const view of ["05", "06", "07"] as const) {
    const descriptor = describeLuluV4Authority(view);
    assert.equal(descriptor.stack.length, 4);
    assert.ok(descriptor.stack.some((asset) => asset.id === "lulu.face.operation-board.full.v1"));
    assert.ok(descriptor.stack.some((asset) => asset.id === "lulu.body.real.angle-contact.v4"));
    assert.ok(descriptor.stack.some((asset) => asset.id === "juw.atelier.empty-plate.v1"));
    assert.equal(descriptor.privacy, "PRIVATE_PRODUCTION_ONLY");
    assert.equal(descriptor.publishable, false);
    assert.ok(descriptor.stack.every(
      (asset) => asset.acceptance === LULU_V4_AUTHORITY_ACCEPTANCE
        && asset.lockedStatus === LULU_V4_AUTHORITY_LOCKED_STATUS,
    ));
  }
  assert.ok(describeLuluV4Authority("07").supplementalRoles.some(
    (asset) => asset.id === "lulu.body.rear.operation-board.full.v1",
  ));
});

test("Lulu V4 schema v3 preserves the exact .6 asset byte contract and room mismatch", () => {
  assert.deepEqual(
    manifest.assets.map(({ id, sha256, byteSize, width, height, mimeType }) => ({
      id,
      sha256,
      byteSize,
      width,
      height,
      mimeType,
    })),
    [
      { id: "lulu.face.operation-board.full.v1", sha256: "2ad1a716ec59f65d66e3f83c8d391959696f9539befe520f50889fdd33aa931b", byteSize: 3053490, width: 1536, height: 2050, mimeType: "image/png" },
      { id: "lulu.face.v4.front.lock.v1", sha256: "99674cf5941a19093fd2152a3022cb72adf756ffcba15260abdb252a6323c723", byteSize: 1961596, width: 1122, height: 1402, mimeType: "image/png" },
      { id: "lulu.body.canon.v4", sha256: "c0f1b11473f7fe0d086fd845e3e53cd2e7302db4f0cacde18983d7b66eb629d9", byteSize: 1016787, width: 1022, height: 1536, mimeType: "image/png" },
      { id: "lulu.body.canon.v4.three-view", sha256: "cbbb130a6bd4dee99f9ef4d1dbc883f9a3ea0f6a72378ade685963b5c2130e14", byteSize: 873107, width: 1022, height: 1260, mimeType: "image/png" },
      { id: "lulu.body.canon.v4.front", sha256: "08bd144387d3a3be2f6e08d00c85318aee8942324388544bfdec9788f681febd", byteSize: 316111, width: 341, height: 1260, mimeType: "image/png" },
      { id: "lulu.body.canon.v4.side", sha256: "f046469a3bcc83fb4e6c0d588ee3c3d8a5813ab69f048d7e39fff77e799234ad", byteSize: 285036, width: 340, height: 1260, mimeType: "image/png" },
      { id: "lulu.body.canon.v4.back", sha256: "4758397a783dde383cb59fd7105197c41f08f278be4ca48915be38f5d60bc499", byteSize: 275206, width: 341, height: 1260, mimeType: "image/png" },
      { id: "lulu.body.real.angle-contact.v4", sha256: "7650b7996ded2c127e529c4b7af3874ab6e937b97c75efedcb68756c9d104c60", byteSize: 296366, width: 1080, height: 1040, mimeType: "image/jpeg" },
      { id: "lulu.body.real.gym-rear-profile.v4", sha256: "553c3801ff5479a7672cce58ec2e3052c1c09bed5d4f10f410e9b01a136b1ebe", byteSize: 84993, width: 360, height: 782, mimeType: "image/jpeg" },
      { id: "lulu.body.rear.operation-board.full.v1", sha256: "4deac0f9ac3dcfde9ec779bbc605f4ffc3c2334370feca7df79130ad0cabcb30", byteSize: 1540464, width: 1800, height: 900, mimeType: "image/png" },
      { id: "juw.atelier.empty-plate.v1", sha256: "0b591197d2de1b490c4305ac0aed4d1089564562c7b1005411a8340168aabb72", byteSize: 1144381, width: 1024, height: 1280, mimeType: "image/png" },
    ],
  );
  const room = manifest.assets.find((asset) => asset.id === "juw.atelier.empty-plate.v1");
  assert.deepEqual(room && { width: room.width, height: room.height }, { width: 1024, height: 1280 });
});

test("Lulu V4 manifest validation rejects missing or drifted per-asset lock fields", () => {
  const cases = [
    { field: "acceptance", value: undefined },
    { field: "lockedStatus", value: undefined },
    { field: "acceptance", value: "AVAILABLE_ONLY" },
    { field: "lockedStatus", value: "UNLOCKED" },
  ] as const;

  for (const { field, value } of cases) {
    const candidate = structuredClone(manifest) as unknown as {
      assets: Array<Record<string, unknown>>;
    };
    if (value === undefined) delete candidate.assets[0][field];
    else candidate.assets[0][field] = value;
    assert.throws(
      () => validateLuluV4AuthorityManifest(candidate),
      /private authority asset index is invalid/,
    );
  }
});

test("Lulu V4 operation packs budget dynamic parents inside GPT Image 2's four-reference limit", () => {
  assert.deepEqual(LULU_V4_OPERATION_KINDS, [
    "SUBJECT_A",
    "SUBJECT_B",
    "ROOM_FINAL_05",
    "SIBLING_06",
    "SIBLING_07_CORE",
    "SIBLING_07_RECOVERY",
  ]);
  assert.equal(manifest.maxPhysicalReferences, 4);
  assert.equal(parseLuluV4OperationKind("SIBLING_06"), "SIBLING_06");
  assert.throws(() => parseLuluV4OperationKind("07"));

  const expectedCounts = {
    SUBJECT_A: 3,
    SUBJECT_B: 4,
    ROOM_FINAL_05: 3,
    SIBLING_06: 4,
    SIBLING_07_CORE: 4,
    SIBLING_07_RECOVERY: 3,
  } as const;
  for (const kind of LULU_V4_OPERATION_KINDS) {
    const descriptor = describeLuluV4OperationPack(kind);
    assert.equal(descriptor.physicalReferenceCount, expectedCounts[kind]);
    assert.ok(descriptor.physicalReferenceCount <= descriptor.maxPhysicalReferences);
    assert.equal(
      descriptor.physicalReferenceCount,
      descriptor.dynamicReferenceSlots.length + descriptor.staticReferences.length,
    );
    assert.doesNotMatch(
      JSON.stringify(descriptor),
      /pathname|sha256|blob\.vercel-storage|PRIVATE_BLOB_READ_WRITE_TOKEN|"bytes"/,
    );
  }
  assert.deepEqual(describeLuluV4OperationPack("SUBJECT_A").dynamicReferenceSlots, [
    "GARMENT_FRONT_LOCK",
  ]);
  assert.equal(describeLuluV4OperationPack("SUBJECT_A").view, "SUBJECT");
  assert.deepEqual(describeLuluV4OperationPack("SUBJECT_B").dynamicReferenceSlots, [
    "ELIGIBLE_PASS_A_PARENT",
    "GARMENT_FRONT_LOCK",
  ]);
  assert.deepEqual(describeLuluV4OperationPack("ROOM_FINAL_05").dynamicReferenceSlots, [
    "ACCEPTED_SUBJECT_LOCK",
    "GARMENT_FRONT_LOCK",
  ]);
});

test("sibling packs retain face, exact room and angle-specific body authority", () => {
  const side = describeLuluV4OperationPack("SIBLING_06");
  const rear = describeLuluV4OperationPack("SIBLING_07_CORE");
  const recovery = describeLuluV4OperationPack("SIBLING_07_RECOVERY");

  for (const descriptor of [side, rear, recovery]) {
    assert.deepEqual(descriptor.dynamicReferenceSlots, ["ACCEPTED_CURRENT_GARMENT_05"]);
    assert.ok(descriptor.staticReferences.some(
      (reference) => reference.id === "juw.atelier.empty-plate.v1",
    ));
  }
  for (const descriptor of [side, rear]) {
    assert.ok(descriptor.staticReferences.some(
      (reference) => reference.id === "lulu.face.operation-board.full.v1",
    ));
  }
  assert.deepEqual(
    side.staticReferences.find((reference) => reference.sourceKind === "COMPOSITE_BOARD")
      ?.packedComponentIds,
    ["lulu.body.canon.v4.side", "lulu.body.real.angle-contact.v4"],
  );
  assert.deepEqual(
    rear.staticReferences.find((reference) => reference.sourceKind === "COMPOSITE_BOARD")
      ?.packedComponentIds,
    ["lulu.body.canon.v4.back", "lulu.body.real.angle-contact.v4"],
  );
  const fused = recovery.staticReferences.find(
    (reference) => reference.sourceKind === "FUSED_ATTESTED_BOARD",
  );
  assert.ok(fused && fused.sourceKind === "FUSED_ATTESTED_BOARD");
  assert.equal(fused.id, "lulu.pack.sibling-07.identity-rear-recovery.v1");
  assert.equal(fused.role, "FUSED_IDENTITY_REAR_RECOVERY_BOARD");
  assert.equal(fused.transportVersion, "LULU_FUSED_IDENTITY_REAR_RECOVERY_BOARD_V1");
  assert.deepEqual(fused.transportGeometry, { width: 1536, height: 2048 });
  assert.deepEqual(
    fused.packedComponentIds,
    [
      "lulu.face.operation-board.full.v1",
      "lulu.body.canon.v4.back",
      "lulu.body.real.angle-contact.v4",
      "lulu.body.real.gym-rear-profile.v4",
    ],
  );
  assert.deepEqual(fused.nestedAttestationIds, [{
    id: "lulu.face.operation-board.full.v1",
    constituentIds: [],
  }, {
    id: "lulu.body.rear.operation-board.full.v1",
    constituentIds: [
      "lulu.body.canon.v4.back",
      "lulu.body.real.angle-contact.v4",
      "lulu.body.real.gym-rear-profile.v4",
    ],
  }]);
  assert.equal(recovery.staticPhysicalReferenceCount, 2);
  assert.equal(recovery.physicalReferenceCount, 3);
});

test("fused recovery board pins geometry, output hash and nested source hashes", () => {
  const recovery = manifest.operationPacks.SIBLING_07_RECOVERY.staticReferences.find(
    (reference) => reference.kind === "FUSED_ATTESTED_BOARD",
  );
  assert.ok(recovery && recovery.kind === "FUSED_ATTESTED_BOARD");
  assert.deepEqual(recovery.boardSpec, {
    version: "LULU_FUSED_IDENTITY_REAR_RECOVERY_BOARD_V1",
    width: 1536,
    height: 2048,
    background: "#eee9e1",
    faceCell: { left: 32, top: 32, width: 1472, height: 1248 },
    rearCell: { left: 32, top: 1312, width: 1472, height: 704 },
    mimeType: "image/png",
    expectedSha256: "1befdabdaa954722730e98209a40703c64e829c5a794448e8b708024060c0824",
    expectedByteSize: 3415602,
  });
  for (const source of recovery.sourceAttestations) {
    const sourceAsset = manifest.assets.find((candidate) => candidate.id === source.assetId);
    assert.equal(source.sha256, sourceAsset?.sha256);
    for (const constituent of source.constituents) {
      const asset = manifest.assets.find((candidate) => candidate.id === constituent.assetId);
      assert.equal(constituent.sha256, asset?.sha256);
    }
  }
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
  assert.match(resolver, /supplementalAssets/);
  assert.doesNotMatch(JSON.stringify(describeLuluV4Authority("07")), /pathname|sha256|blob\.vercel-storage/);
});

test("operation resolver verifies all sources before packing and keeps dynamic bindings explicit", async () => {
  const source = await read("lib/server/studio-lulu-v4-operation-packs.ts");
  assert.match(source, /resolveLuluV4AuthorityAssets\(requestedAssetIds\)/);
  assert.match(source, /STATIC_AUTHORITIES_VERIFIED/);
  assert.match(source, /dynamicReferenceSlots/);
  assert.match(source, /buildCompositeBoard/);
  assert.match(source, /buildFusedRecoveryBoard/);
  assert.match(source, /fused recovery board bytes do not match the versioned geometry\/hash contract/);
  assert.match(source, /fused recovery rear lineage failed attestation/);
  assert.doesNotMatch(source, /status:\s*"READY"/);
});

test("Lulu V4 sync is private, immutable and verifies every read-back", async () => {
  const source = await read("scripts/studio-models/sync-lulu-v4-authority.mjs");
  assert.match(source, /access: "private"/);
  assert.match(source, /allowOverwrite: false/);
  assert.match(source, /addRandomSuffix: false/);
  assert.match(source, /Private Blob read-back failed/);
  assert.match(source, /verified-private-predecessor/);
  assert.match(source, /previousAuthorityRevision/);
  assert.match(source, /LULU_V4_2026-08-25\.6/);
  assert.match(source, /schemaVersion !== 3/);
  assert.match(source, /ACCEPTED_OPERATIONAL_AUTHORITY/);
  assert.match(source, /LOCKED_IMMUTABLE/);
  assert.match(source, /does not exactly preserve its \.6 byte contract/);
  assert.doesNotMatch(source, /access: "public"|PUBLIC_BLOB_READ_WRITE_TOKEN/);
});
