import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  createStudioAtelierGarmentSetBoard,
  STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE,
} from "../lib/server/studio-atelier-garment-reference-board";
import type { ParentLock } from "../lib/studio/atelier/contracts";

const roles = [
  ["GARMENT_FRONT_LOCK", "GARMENT_01_FRONT", "01"],
  ["GARMENT_BACK_LOCK", "GARMENT_02_BACK", "02"],
  ["MANNEQUIN_FRONT_LOCK", "GARMENT_03_MANNEQUIN", "03"],
  ["FABRIC_DETAIL_LOCK", "GARMENT_04_DETAIL", "04"],
] as const;

function digest(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function inputs() {
  return Promise.all(roles.map(async ([role, stage, view], index) => {
    const bytes = new Uint8Array(await sharp({
      create: {
        width: 320 + index,
        height: 480 + index,
        channels: 3,
        background: { r: 30 + index, g: 40 + index, b: 50 + index },
      },
    }).jpeg({ quality: 90 }).toBuffer());
    return {
      parent: {
        role,
        assetId: `garment/900/${view}`,
        sha256: digest(bytes),
        garmentId: "900",
        sourceStage: stage,
        sourceView: view,
        reviewState: "LOCKED",
        lockedLayer: "GARMENT",
        privacyClass: "PRIVATE_OPERATOR",
      } as ParentLock & { role: typeof role },
      bytes,
      mimeType: "image/jpeg" as const,
    };
  }));
}

test("01-04 locks produce one deterministic content-addressed attested board", async () => {
  const source = await inputs();
  const first = await createStudioAtelierGarmentSetBoard(source);
  const second = await createStudioAtelierGarmentSetBoard([...source].reverse());
  const metadata = await sharp(first.bytes).metadata();

  assert.equal(metadata.width, STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE);
  assert.equal(metadata.height, STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE);
  assert.equal(metadata.format, "png");
  assert.deepEqual(first.bytes, second.bytes);
  assert.equal(first.pack.sha256, digest(first.bytes));
  assert.match(first.pack.assetId, new RegExp(`${first.pack.sha256}$`));
  assert.deepEqual(
    first.pack.constituents.map((item) => item.role),
    roles.map(([role]) => role),
  );
});

test("a changed accepted byte creates a different board and attestation", async () => {
  const source = await inputs();
  const first = await createStudioAtelierGarmentSetBoard(source);
  const changedBytes = new Uint8Array(await sharp(source[3]!.bytes)
    .modulate({ brightness: 1.1 })
    .jpeg({ quality: 90 })
    .toBuffer());
  const changed = [...source];
  changed[3] = {
    ...source[3]!,
    parent: { ...source[3]!.parent, sha256: digest(changedBytes) },
    bytes: changedBytes,
  };
  const second = await createStudioAtelierGarmentSetBoard(changed);
  assert.notEqual(first.pack.sha256, second.pack.sha256);
  assert.notEqual(first.pack.assetId, second.pack.assetId);
});

test("missing, cross-garment, or hash-mismatched locks fail before packing", async () => {
  const source = await inputs();
  await assert.rejects(
    () => createStudioAtelierGarmentSetBoard(source.slice(0, 3)),
    /exactly four/i,
  );
  const crossGarment = [...source];
  crossGarment[1] = {
    ...source[1]!,
    parent: { ...source[1]!.parent, garmentId: "901" },
  };
  await assert.rejects(
    () => createStudioAtelierGarmentSetBoard(crossGarment),
    /cross-garment/i,
  );
  const mismatched = [...source];
  mismatched[0] = {
    ...source[0]!,
    parent: { ...source[0]!.parent, sha256: "0".repeat(64) },
  };
  await assert.rejects(
    () => createStudioAtelierGarmentSetBoard(mismatched),
    /exact accepted/i,
  );
});
