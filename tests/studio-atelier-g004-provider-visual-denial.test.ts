import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import sharp from "sharp";
import {
  STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST,
  STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
  studioAtelierG004VisualDuplicate,
  verifyStudioAtelierG004VisualDenialTargets,
} from "../lib/server/studio-atelier-g004-provider-visual-denial";
import {
  resolveStudioAtelierG004Calibration,
  verifyStudioAtelierG004Calibration,
} from "../lib/server/studio-atelier-g004-calibration";
import {
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST,
  STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  STUDIO_ATELIER_G004_CALIBRATION_REVISION,
} from "../lib/studio/atelier/g004-calibration";

async function assetBytes(sourcePath: string): Promise<Uint8Array> {
  return new Uint8Array(await readFile(
    new URL(`../public${sourcePath}`, import.meta.url),
  ));
}

async function verifiedTargets() {
  const calibration = await verifyStudioAtelierG004Calibration(
    await resolveStudioAtelierG004Calibration(),
  );
  return verifyStudioAtelierG004VisualDenialTargets(calibration.assets);
}

test("the provider visual-denial policy is bound to the derivative-only G004 calibration", () => {
  assert.equal(
    STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
    "g004-provider-visual-denial-2026-08-26.1",
  );
  assert.equal(
    STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
    "360cbf8ab42d7ca344c4296d87d28f112f809ce6952069ab664731044c0ad1d3",
  );
  assert.equal(
    STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.sourceCalibrationRevision,
    STUDIO_ATELIER_G004_CALIBRATION_REVISION,
  );
  assert.equal(
    STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.sourceCalibrationManifestSha256,
    STUDIO_ATELIER_G004_CALIBRATION_MANIFEST_SHA256,
  );
  assert.equal(
    STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.canonicalOriginalsStatus,
    "UNAVAILABLE",
  );
  assert.equal(STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.role, "PROVIDER_DENIAL_ONLY");
  assert.equal(STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.providerReferenceAllowed, false);
  assert.match(STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST.nonClaim, /does not claim/i);
});

test("normalized denial targets bind all three exact verified G004 derivatives", async () => {
  const targets = await verifiedTargets();
  assert.deepEqual(targets.map((target) => target.view), ["05", "06", "07"]);

  for (const target of STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets) {
    const duplicate = await studioAtelierG004VisualDuplicate(
      await assetBytes(target.sourcePath),
      targets,
    );
    assert.deepEqual(duplicate, {
      revision: STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION,
      manifestSha256: STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
      view: target.view,
      transform: "IDENTITY",
      offsetX: 0,
      offsetY: 0,
      nccPpm: 1_000_000,
      rgbMaePpm: 0,
    });
  }
});

test("an incomplete or substituted target set cannot activate visual denial", async () => {
  const calibration = await verifyStudioAtelierG004Calibration(
    await resolveStudioAtelierG004Calibration(),
  );
  await assert.rejects(
    verifyStudioAtelierG004VisualDenialTargets(calibration.assets.slice(0, 2)),
    /complete G004 visual-denial target set/i,
  );

  const substituted = calibration.assets.map((asset, index) => index === 0
    ? Object.freeze({
        ...asset,
        binding: Object.freeze({ ...asset.binding, id: "substituted.g004.target" }),
      })
    : asset);
  await assert.rejects(
    verifyStudioAtelierG004VisualDenialTargets(substituted),
    /G004\/05 visual-denial target is missing/i,
  );
});

test("lossy codecs and small full-frame transforms cannot launder G004", async (t) => {
  const target = STUDIO_ATELIER_G004_CALIBRATION_MANIFEST.assets[0]!;
  const original = await assetBytes(target.sourcePath);
  const decoded = await sharp(original)
    .toColorspace("srgb")
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  decoded.data[0] = (decoded.data[0]! + 1) % 256;
  const cropX = Math.floor(target.width * 0.03);
  const cropY = Math.floor(target.height * 0.03);

  const variants = [
    {
      name: "JPEG quality 100",
      bytes: await sharp(original).jpeg({ quality: 100 }).toBuffer(),
    },
    {
      name: "JPEG quality 40",
      bytes: await sharp(original).jpeg({ quality: 40 }).toBuffer(),
    },
    {
      name: "JPEG quality 1",
      bytes: await sharp(original).jpeg({ quality: 1 }).toBuffer(),
    },
    {
      name: "lossy WebP",
      bytes: await sharp(original).webp({ quality: 25 }).toBuffer(),
    },
    {
      name: "one decoded pixel changed",
      bytes: await sharp(decoded.data, { raw: decoded.info }).png().toBuffer(),
    },
    {
      name: "three-percent crop and rescale",
      bytes: await sharp(original)
        .extract({
          left: cropX,
          top: cropY,
          width: target.width - cropX * 2,
          height: target.height - cropY * 2,
        })
        .resize(target.width, target.height)
        .webp({ quality: 70 })
        .toBuffer(),
    },
    {
      name: "three-percent translation",
      bytes: await sharp(original)
        .extend({
          left: cropX,
          top: cropY,
          right: 0,
          bottom: 0,
          background: "#ffffff",
        })
        .extract({ left: 0, top: 0, width: target.width, height: target.height })
        .png()
        .toBuffer(),
    },
    {
      name: "one-degree rotation",
      bytes: await sharp(original)
        .rotate(1, { background: "#ffffff" })
        .resize(target.width, target.height, { fit: "fill" })
        .png()
        .toBuffer(),
    },
    {
      name: "horizontal mirror",
      bytes: await sharp(original).flop().png().toBuffer(),
    },
    {
      name: "blur",
      bytes: await sharp(original).blur(2).jpeg({ quality: 70 }).toBuffer(),
    },
    {
      name: "brightness change",
      bytes: await sharp(original).modulate({ brightness: 1.12 }).png().toBuffer(),
    },
    {
      name: "grayscale",
      bytes: await sharp(original).grayscale().png().toBuffer(),
    },
    {
      name: "tint",
      bytes: await sharp(original).tint({ r: 242, g: 225, b: 210 }).png().toBuffer(),
    },
  ] as const;

  const targets = await verifiedTargets();
  for (const variant of variants) {
    await t.test(variant.name, async () => {
      const duplicate = await studioAtelierG004VisualDuplicate(variant.bytes, targets);
      assert.equal(duplicate?.view, "05");
      assert.equal(duplicate?.revision, STUDIO_ATELIER_G004_VISUAL_DENIAL_REVISION);
      assert.equal(
        duplicate?.manifestSha256,
        STUDIO_ATELIER_G004_VISUAL_DENIAL_MANIFEST_SHA256,
      );
    });
  }
});

test("v1 remains a calibrated full-frame gate rather than an arbitrary-content classifier", async () => {
  const unrelated = await sharp({
    create: {
      width: 1120,
      height: 1400,
      channels: 3,
      background: { r: 24, g: 72, b: 112 },
    },
  }).png().toBuffer();
  assert.equal(
    await studioAtelierG004VisualDuplicate(unrelated, await verifiedTargets()),
    null,
  );
});
