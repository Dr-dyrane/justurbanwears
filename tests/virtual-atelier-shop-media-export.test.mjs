import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import {
  PARTIAL_PUBLIC_MEDIA_MAPPING,
  PUBLIC_MEDIA_MAPPING,
  SHOP_MEDIA_HEIGHT,
  SHOP_MEDIA_WIDTH,
  containedDimensions,
  renderShopDerivative,
  validateLockedManifest,
} from "../scripts/virtual-atelier/export-shop-media.mjs";

test("maps private semantic views to the historical public Shop filenames", () => {
  assert.deepEqual(
    PUBLIC_MEDIA_MAPPING.map(({ view, role, output }) => ({ view, role, output })),
    [
      { view: "01", role: "GARMENT_FRONT", output: "01-garment-front.webp" },
      { view: "02", role: "GARMENT_BACK", output: "02-garment-back.webp" },
      { view: "03", role: "MANNEQUIN_FRONT", output: "03-mannequin-front.webp" },
      { view: "05", role: "MODEL_FRONT", output: "04-model-front.webp" },
      { view: "07", role: "MODEL_REAR_THREE_QUARTER", output: "05-model-rear-three-quarter.webp" },
      { view: "04", role: "FABRIC_DETAIL", output: "06-fabric-detail.webp" },
      { view: "06", role: "MODEL_LEFT_PROFILE", output: "07-model-left-profile.webp" },
    ],
  );
});

test("maps an explicitly authorized partial 01-04 publication without model placeholders", () => {
  assert.deepEqual(
    PARTIAL_PUBLIC_MEDIA_MAPPING.map(({ view, role, output }) => ({ view, role, output })),
    [
      { view: "01", role: "GARMENT_FRONT", output: "01-garment-front.webp" },
      { view: "02", role: "GARMENT_BACK", output: "02-garment-back.webp" },
      { view: "03", role: "MANNEQUIN_FRONT", output: "03-mannequin-front.webp" },
      { view: "04", role: "FABRIC_DETAIL", output: "06-fabric-detail.webp" },
    ],
  );
});

test("preserves portrait aspect ratio inside the 1120x1400 Shop frame", async () => {
  assert.deepEqual(containedDimensions(1023, 1537), { width: 932, height: 1400 });
  const source = await sharp({
    create: { width: 600, height: 900, channels: 3, background: "#b9866b" },
  }).png().withMetadata({ orientation: 1 }).toBuffer();
  const rendered = await renderShopDerivative(source);
  const metadata = await sharp(rendered.bytes).metadata();
  assert.equal(metadata.format, "webp");
  assert.equal(metadata.width, SHOP_MEDIA_WIDTH);
  assert.equal(metadata.height, SHOP_MEDIA_HEIGHT);
  assert.equal(rendered.foregroundWidth, 933);
  assert.equal(rendered.foregroundHeight, 1400);
  assert.equal(metadata.hasAlpha, false);
  assert.equal(metadata.exif, undefined);
  assert.equal(metadata.icc, undefined);
  assert.equal(metadata.xmp, undefined);
});

test("refuses an incomplete private packet before any public export", () => {
  assert.throws(
    () => validateLockedManifest({ schemaVersion: 1, garmentId: "009", status: "01_04_LOCKED", views: {} }, "009"),
    /not complete and locked through 01–07/,
  );
});

test("accepts only an explicitly authorized partial 01-04 publication", () => {
  const views = Object.fromEntries(PARTIAL_PUBLIC_MEDIA_MAPPING.map(({ view, role }) => [view, {
    role,
    path: `${view}-accepted.png`,
    sha256: "a".repeat(64),
    status: "USER_ACCEPTED_LOCKED",
  }]));
  const manifest = {
    schemaVersion: 1,
    garmentId: "017",
    status: "PARTIAL_01_04_USER_ACCEPTED_LOCKED_FOR_AS_IS_PUBLICATION",
    authorization: { mode: "USER_AUTHORIZED_AS_IS_PARTIAL_PUBLICATION" },
    views,
  };
  assert.equal(validateLockedManifest(manifest, "017", { allowPartial: true }), manifest);
  assert.throws(() => validateLockedManifest(manifest, "017"), /not complete and locked through 01–07/);
});
