import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  createStudioAtelierDirectGarmentEvidencePack,
  type StudioAtelierDirectGarmentEvidenceSource,
} from "../lib/server/studio-atelier-direct-garment-evidence-pack";
import {
  DIRECT_GARMENT_EVIDENCE_PACK_COMPILER_VERSION,
  DIRECT_GARMENT_EVIDENCE_PACK_RECIPE_VERSION,
  DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
  DIRECT_GARMENT_EVIDENCE_RECEIPT_VERSION,
} from "../lib/studio/atelier/contracts";

function digest(bytes: Uint8Array | string): string {
  return createHash("sha256").update(bytes).digest("hex");
}

const sourceManifest = Object.freeze({
  revision: "g025-source-manifest-v1",
  sha256: digest("g025-source-manifest-v1"),
  attestationId: "g025-source-manifest-attestation-v1",
  verificationStatus: "VERIFIED" as const,
});

async function sources(): Promise<StudioAtelierDirectGarmentEvidenceSource[]> {
  return Promise.all(["c", "a", "b"].map(async (suffix, index) => {
    const width = 320 + index;
    const height = 480 + index;
    const bytes = new Uint8Array(await sharp({
      create: {
        width,
        height,
        channels: 3,
        background: { r: 60 + index, g: 40 + index, b: 30 + index },
      },
    }).jpeg({ quality: 90 }).toBuffer());
    return {
      constituent: {
        assetId: `garment/025/source-${suffix}`,
        sha256: digest(bytes),
        mimeType: "image/jpeg" as const,
        byteSize: bytes.byteLength,
        width,
        height,
      },
      bytes,
    };
  }));
}

test("three attested source captures produce one deterministic constituent-complete pack", async () => {
  const input = await sources();
  const first = await createStudioAtelierDirectGarmentEvidencePack({
    sourceManifest,
    sources: input,
  });
  const reordered = await createStudioAtelierDirectGarmentEvidencePack({
    sourceManifest,
    sources: [...input].reverse(),
  });
  const metadata = await sharp(first.bytes).metadata();

  assert.deepEqual(first.bytes, reordered.bytes);
  assert.deepEqual(first.receipt, reordered.receipt);
  assert.deepEqual(
    first.receipt.constituents.map((item) => item.assetId),
    ["garment/025/source-a", "garment/025/source-b", "garment/025/source-c"],
  );
  assert.equal(first.receipt.schemaVersion, DIRECT_GARMENT_EVIDENCE_RECEIPT_VERSION);
  assert.equal(first.receipt.recipeVersion, DIRECT_GARMENT_EVIDENCE_PACK_RECIPE_VERSION);
  assert.equal(first.receipt.compilerVersion, DIRECT_GARMENT_EVIDENCE_PACK_COMPILER_VERSION);
  assert.deepEqual(first.receipt.sourceManifest, sourceManifest);
  assert.equal(first.receipt.output.sha256, digest(first.bytes));
  assert.equal(first.receipt.output.byteSize, first.bytes.byteLength);
  assert.equal(first.receipt.output.mimeType, "image/png");
  assert.equal(first.receipt.output.width, DIRECT_GARMENT_EVIDENCE_PACK_SIZE);
  assert.equal(first.receipt.output.height, DIRECT_GARMENT_EVIDENCE_PACK_SIZE);
  assert.equal(metadata.width, DIRECT_GARMENT_EVIDENCE_PACK_SIZE);
  assert.equal(metadata.height, DIRECT_GARMENT_EVIDENCE_PACK_SIZE);
});

test("changed, missing, mismatched, or unattested constituents cannot reuse a receipt", async () => {
  const input = await sources();
  const original = await createStudioAtelierDirectGarmentEvidencePack({
    sourceManifest,
    sources: input,
  });
  const changedBytes = new Uint8Array(await sharp(input[1]!.bytes)
    .modulate({ brightness: 1.1 })
    .jpeg({ quality: 90 })
    .toBuffer());
  const changed = [...input];
  changed[1] = {
    constituent: {
      ...input[1]!.constituent,
      sha256: digest(changedBytes),
      byteSize: changedBytes.byteLength,
    },
    bytes: changedBytes,
  };
  const changedPack = await createStudioAtelierDirectGarmentEvidencePack({
    sourceManifest: {
      ...sourceManifest,
      sha256: digest("g025-source-manifest-v2"),
    },
    sources: changed,
  });
  assert.notEqual(changedPack.receipt.output.sha256, original.receipt.output.sha256);

  await assert.rejects(
    () => createStudioAtelierDirectGarmentEvidencePack({
      sourceManifest,
      sources: input.slice(0, 2),
      expectedReceipt: original.receipt,
    }),
    /does not match its semantic receipt/i,
  );
  await assert.rejects(
    () => createStudioAtelierDirectGarmentEvidencePack({
      sourceManifest,
      sources: [{ ...input[0]!, bytes: changedBytes }, input[1]!, input[2]!],
      expectedReceipt: original.receipt,
    }),
    /does not match its manifest tuple/i,
  );
  await assert.rejects(
    () => createStudioAtelierDirectGarmentEvidencePack({
      sourceManifest,
      sources: [
        ...input,
        {
          ...input[0]!,
          constituent: {
            ...input[0]!.constituent,
            assetId: "garment/025/unattested-source",
          },
        },
      ],
      expectedReceipt: original.receipt,
    }),
    /does not match its semantic receipt/i,
  );
});
