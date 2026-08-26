import { createHash } from "node:crypto";
import sharp from "sharp";
import { canonicalStringify } from "../studio/atelier/canonical";
import {
  DIRECT_GARMENT_EVIDENCE_PACK_COMPILER_VERSION,
  DIRECT_GARMENT_EVIDENCE_PACK_RECIPE_VERSION,
  DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
  DIRECT_GARMENT_EVIDENCE_RECEIPT_VERSION,
  directGarmentEvidenceReceiptSchema,
  type DirectGarmentEvidenceConstituent,
  type DirectGarmentEvidenceReceipt,
} from "../studio/atelier/contracts";

const PACK_MARGIN = 32;
const PACK_GAP = 16;
const PACK_BACKGROUND = "#ddd7cf";

type DirectGarmentPackPipeline = {
  metadata(): Promise<Readonly<{
    width?: number;
    height?: number;
    format?: string;
  }>>;
  rotate(): DirectGarmentPackPipeline;
  resize(width: number, height: number, options: Readonly<{
    fit: "contain";
    background: string;
    withoutEnlargement: boolean;
  }>): DirectGarmentPackPipeline;
  removeAlpha(): DirectGarmentPackPipeline;
  composite(items: readonly Readonly<{
    input: Uint8Array;
    left: number;
    top: number;
  }>[]): DirectGarmentPackPipeline;
  png(options: Readonly<{
    compressionLevel: number;
    adaptiveFiltering: boolean;
    palette: boolean;
    effort: number;
  }>): DirectGarmentPackPipeline;
  toBuffer(): Promise<Uint8Array>;
};

const createDirectGarmentPackPipeline = sharp as unknown as (input:
  | Uint8Array
  | Readonly<{
    create: Readonly<{
      width: number;
      height: number;
      channels: 3;
      background: string;
    }>;
  }>
) => DirectGarmentPackPipeline;

export type StudioAtelierDirectGarmentEvidenceSource = Readonly<{
  constituent: DirectGarmentEvidenceConstituent;
  bytes: Uint8Array;
}>;

export type StudioAtelierDirectGarmentEvidenceManifestAttestation =
  DirectGarmentEvidenceReceipt["sourceManifest"];

export type StudioAtelierDirectGarmentEvidencePack = Readonly<{
  receipt: DirectGarmentEvidenceReceipt;
  bytes: Uint8Array;
  mimeType: "image/png";
  width: typeof DIRECT_GARMENT_EVIDENCE_PACK_SIZE;
  height: typeof DIRECT_GARMENT_EVIDENCE_PACK_SIZE;
}>;

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function compareSources(
  left: StudioAtelierDirectGarmentEvidenceSource,
  right: StudioAtelierDirectGarmentEvidenceSource,
): number {
  if (left.constituent.assetId !== right.constituent.assetId) {
    return left.constituent.assetId < right.constituent.assetId ? -1 : 1;
  }
  if (left.constituent.sha256 !== right.constituent.sha256) {
    return left.constituent.sha256 < right.constituent.sha256 ? -1 : 1;
  }
  return 0;
}

function mimeTypeForFormat(format: string | undefined): DirectGarmentEvidenceConstituent["mimeType"] | null {
  if (format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return null;
}

async function validateAndOrderSources(
  rawSources: readonly StudioAtelierDirectGarmentEvidenceSource[],
): Promise<readonly StudioAtelierDirectGarmentEvidenceSource[]> {
  if (rawSources.length < 1 || rawSources.length > 32) {
    throw new Error("Direct garment evidence requires between one and 32 attested source captures.");
  }
  const sources = [...rawSources].sort(compareSources);
  const assetIds = sources.map((source) => source.constituent.assetId);
  if (new Set(assetIds).size !== sources.length) {
    throw new Error("Every direct garment source capture must have one unique manifest asset ID.");
  }
  await Promise.all(sources.map(async ({ constituent, bytes }) => {
    if (
      bytes.byteLength === 0
      || bytes.byteLength !== constituent.byteSize
      || sha256(bytes) !== constituent.sha256
    ) {
      throw new Error(`Direct garment source ${constituent.assetId} does not match its manifest tuple.`);
    }
    const metadata = await createDirectGarmentPackPipeline(bytes).metadata();
    if (
      metadata.width !== constituent.width
      || metadata.height !== constituent.height
      || mimeTypeForFormat(metadata.format) !== constituent.mimeType
    ) {
      throw new Error(`Direct garment source ${constituent.assetId} does not match its attested media metadata.`);
    }
  }));
  return Object.freeze(sources);
}

async function renderCell(input: Readonly<{
  source: StudioAtelierDirectGarmentEvidenceSource;
  width: number;
  height: number;
}>): Promise<Uint8Array> {
  const bytes = await createDirectGarmentPackPipeline(input.source.bytes)
    .rotate()
    .resize(input.width, input.height, {
      fit: "contain",
      background: PACK_BACKGROUND,
      withoutEnlargement: false,
    })
    .removeAlpha()
    .png({
      compressionLevel: 9,
      adaptiveFiltering: false,
      palette: false,
      effort: 10,
    })
    .toBuffer();
  return new Uint8Array(bytes);
}

/**
 * Creates the single physical provider reference for garment 01-04. The
 * receipt remains semantic truth and binds every manifest constituent; the
 * board is transport only and is rebuilt from exact bytes before paid intent.
 */
export async function createStudioAtelierDirectGarmentEvidencePack(input: Readonly<{
  sourceManifest: StudioAtelierDirectGarmentEvidenceManifestAttestation;
  sources: readonly StudioAtelierDirectGarmentEvidenceSource[];
  expectedReceipt?: DirectGarmentEvidenceReceipt;
}>): Promise<StudioAtelierDirectGarmentEvidencePack> {
  const sources = await validateAndOrderSources(input.sources);
  const columns = Math.ceil(Math.sqrt(sources.length));
  const rows = Math.ceil(sources.length / columns);
  const cellWidth = Math.floor(
    (DIRECT_GARMENT_EVIDENCE_PACK_SIZE - (PACK_MARGIN * 2) - (PACK_GAP * (columns - 1)))
      / columns,
  );
  const cellHeight = Math.floor(
    (DIRECT_GARMENT_EVIDENCE_PACK_SIZE - (PACK_MARGIN * 2) - (PACK_GAP * (rows - 1)))
      / rows,
  );
  const cells = await Promise.all(sources.map((source) => renderCell({
    source,
    width: cellWidth,
    height: cellHeight,
  })));
  const composites = cells.map((bytes, index) => ({
    input: bytes,
    left: PACK_MARGIN + ((index % columns) * (cellWidth + PACK_GAP)),
    top: PACK_MARGIN + (Math.floor(index / columns) * (cellHeight + PACK_GAP)),
  }));
  const bytes = new Uint8Array(await createDirectGarmentPackPipeline({
    create: {
      width: DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
      height: DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
      channels: 3,
      background: PACK_BACKGROUND,
    },
  }).composite(composites).png({
    compressionLevel: 9,
    adaptiveFiltering: false,
    palette: false,
    effort: 10,
  }).toBuffer());
  const outputSha256 = sha256(bytes);
  const receipt = directGarmentEvidenceReceiptSchema.parse({
    schemaVersion: DIRECT_GARMENT_EVIDENCE_RECEIPT_VERSION,
    sourceManifest: input.sourceManifest,
    recipeVersion: DIRECT_GARMENT_EVIDENCE_PACK_RECIPE_VERSION,
    compilerVersion: DIRECT_GARMENT_EVIDENCE_PACK_COMPILER_VERSION,
    constituents: sources.map((source) => source.constituent),
    output: {
      assetId: `atelier.pack.direct-garment-evidence.${outputSha256}`,
      sha256: outputSha256,
      mimeType: "image/png",
      byteSize: bytes.byteLength,
      width: DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
      height: DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
    },
  });
  if (
    input.expectedReceipt
    && canonicalStringify(receipt) !== canonicalStringify(
      directGarmentEvidenceReceiptSchema.parse(input.expectedReceipt),
    )
  ) {
    throw new Error("The reconstructed direct garment evidence pack does not match its semantic receipt.");
  }
  return Object.freeze({
    receipt: Object.freeze(receipt),
    bytes,
    mimeType: "image/png" as const,
    width: DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
    height: DIRECT_GARMENT_EVIDENCE_PACK_SIZE,
  });
}
