import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
  studioAtelierG004CalibrationViewForStage,
} from "../lib/studio/atelier/g004-calibration";
import {
  createStudioAtelierG004CalibrationResolver,
  type StudioAtelierG004CalibrationAssetReader,
} from "../lib/server/studio-atelier-g004-calibration";

const localReader: StudioAtelierG004CalibrationAssetReader = async (asset) => ({
  bytes: new Uint8Array(await readFile(
    new URL(`../public${asset.sourcePath}`, import.meta.url),
  )),
  mimeType: asset.mimeType,
});

test("version-locks the three G004 derivatives as exact container and decoded pixels", async () => {
  assert.equal(
    STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
    "451368db5dd7845fc716dbb661d7bd9153297a99802f6f8f1c441babda8aa635",
  );
  assert.equal(
    STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT.receiptSha256,
    "516438224ef2117c328baffde236fb7d8e3565ea6d8477147754b6de77773dc0",
  );
  assert.deepEqual(
    STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets.map((asset) => ({
      view: asset.view,
      sha256: asset.sha256,
      pixelSha256: asset.pixelSha256,
      size: asset.byteSize,
      dimensions: `${asset.width}x${asset.height}`,
    })),
    [
      {
        view: "05",
        sha256: "87761a70a863246f53290bb58f31bfa252300dbbb281b3640fd1329c227d980d",
        pixelSha256: "b1693a6395fa3d6eccfcc20d6bf96023ef9051819e6656295560d8d351dee42f",
        size: 188594,
        dimensions: "1120x1400",
      },
      {
        view: "06",
        sha256: "7fb2c3399598ae52b29abf66fde4942fd7f57a6b09a646f61b6e834a0fe3e5fb",
        pixelSha256: "f41a92191ffb07e7db6e4dba28a163af691df7b061a54d4c7f7240b3500a8633",
        size: 203824,
        dimensions: "1120x1400",
      },
      {
        view: "07",
        sha256: "1af3f21b3f84eb90b95a7b5f879a8eed550dd7946b9c96c26d72d43e8f481a59",
        pixelSha256: "995602801d33eee13412f6afe5f794199edd4e38ae624f2612488ccadeeb44ab",
        size: 212804,
        dimensions: "1120x1400",
      },
    ],
  );

  const resolved = await createStudioAtelierG004CalibrationResolver(localReader)();
  assert.deepEqual(resolved.receipt, STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT);
  assert.deepEqual(resolved.assets.map(({ binding }) => binding.view), ["05", "06", "07"]);
  assert.equal("sourcePath" in resolved.receipt, false);
  assert.equal("blobPathname" in resolved.receipt, false);
});

test("re-reads content-addressed calibration bytes instead of trusting an old cache", async () => {
  let reads = 0;
  const resolver = createStudioAtelierG004CalibrationResolver(async (asset) => {
    reads += 1;
    return localReader(asset);
  });
  await resolver();
  await resolver();
  assert.equal(reads, 6);
});

test("fails closed on substituted bytes or MIME before any comparison", async () => {
  const corrupt = createStudioAtelierG004CalibrationResolver(async (asset) => {
    const result = await localReader(asset);
    if (asset.view !== "06") return result;
    const bytes = new Uint8Array(result.bytes);
    bytes[0] = bytes[0]! ^ 0xff;
    return { ...result, bytes };
  });
  await assert.rejects(corrupt(), /exact container readback/i);

  const wrongMime = createStudioAtelierG004CalibrationResolver(async (asset) => ({
    ...(await localReader(asset)),
    mimeType: asset.view === "07" ? "image/png" : asset.mimeType,
  }));
  await assert.rejects(wrongMime(), /exact container readback/i);
});

test("maps only subject and 05-07 stages to the positive targets", () => {
  assert.equal(studioAtelierG004CalibrationViewForStage("GARMENT_01_FRONT"), null);
  assert.equal(studioAtelierG004CalibrationViewForStage("GARMENT_02_BACK"), null);
  assert.equal(studioAtelierG004CalibrationViewForStage("GARMENT_03_MANNEQUIN"), null);
  assert.equal(studioAtelierG004CalibrationViewForStage("GARMENT_04_DETAIL"), null);
  assert.equal(studioAtelierG004CalibrationViewForStage("SUBJECT_A"), "05");
  assert.equal(studioAtelierG004CalibrationViewForStage("SUBJECT_B"), "05");
  assert.equal(studioAtelierG004CalibrationViewForStage("ROOM_FINAL_05"), "05");
  assert.equal(studioAtelierG004CalibrationViewForStage("SIBLING_06"), "06");
  assert.equal(studioAtelierG004CalibrationViewForStage("SIBLING_07_CORE"), "07");
  assert.equal(studioAtelierG004CalibrationViewForStage("SIBLING_07_RECOVERY"), "07");
});
