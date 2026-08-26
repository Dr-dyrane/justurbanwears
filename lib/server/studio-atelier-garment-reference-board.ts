import { createHash } from "node:crypto";
import sharp from "sharp";
import {
  attestedReferencePackSchema,
  type AttestedReferencePack,
  type ParentLock,
} from "../studio/atelier/contracts";

export const STUDIO_ATELIER_GARMENT_SET_BOARD_RECIPE =
  "garment-set-01-04-board-v1" as const;
export const STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE = 1536 as const;

const BOARD_MARGIN = 32;
const BOARD_GAP = 16;
const BOARD_CELL_SIZE = Math.floor(
  (STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE - (BOARD_MARGIN * 2) - BOARD_GAP) / 2,
);
const BOARD_BACKGROUND = "#ddd7cf";

type GarmentBoardPipeline = {
  rotate(): GarmentBoardPipeline;
  resize(width: number, height: number, options: Readonly<{
    fit: "contain";
    background: string;
    withoutEnlargement: boolean;
  }>): GarmentBoardPipeline;
  removeAlpha(): GarmentBoardPipeline;
  composite(items: readonly Readonly<{
    input: Uint8Array;
    left: number;
    top: number;
  }>[]): GarmentBoardPipeline;
  png(options: Readonly<{
    compressionLevel: number;
    adaptiveFiltering: boolean;
    palette: boolean;
    effort: number;
  }>): GarmentBoardPipeline;
  toBuffer(): Promise<Uint8Array>;
};

const createGarmentBoardPipeline = sharp as unknown as (input:
  | Uint8Array
  | Readonly<{
    create: Readonly<{
      width: number;
      height: number;
      channels: 3;
      background: string;
    }>;
  }>
) => GarmentBoardPipeline;

const EXPECTED_PARENTS = Object.freeze([
  { role: "GARMENT_FRONT_LOCK", stage: "GARMENT_01_FRONT", view: "01" },
  { role: "GARMENT_BACK_LOCK", stage: "GARMENT_02_BACK", view: "02" },
  { role: "MANNEQUIN_FRONT_LOCK", stage: "GARMENT_03_MANNEQUIN", view: "03" },
  { role: "FABRIC_DETAIL_LOCK", stage: "GARMENT_04_DETAIL", view: "04" },
] as const);

type GarmentSetParentRole = typeof EXPECTED_PARENTS[number]["role"];

export type StudioAtelierGarmentSetBoardInput = Readonly<{
  parent: ParentLock & { role: GarmentSetParentRole };
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}>;

export type StudioAtelierGarmentSetBoard = Readonly<{
  pack: AttestedReferencePack;
  bytes: Uint8Array;
  mimeType: "image/png";
  width: typeof STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE;
  height: typeof STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE;
}>;

function sha256(value: Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function privacyRank(value: ParentLock["privacyClass"]): number {
  return value === "PRIVATE_IDENTITY" ? 2 : value === "PRIVATE_OPERATOR" ? 1 : 0;
}

function validateInputs(
  inputs: readonly StudioAtelierGarmentSetBoardInput[],
): readonly StudioAtelierGarmentSetBoardInput[] {
  if (inputs.length !== EXPECTED_PARENTS.length) {
    throw new Error("The garment 01-04 board requires exactly four locked semantic views.");
  }
  const byRole = new Map(inputs.map((item) => [item.parent.role, item]));
  const ordered = EXPECTED_PARENTS.map((expected) => {
    const item = byRole.get(expected.role);
    if (
      !item
      || item.parent.sourceStage !== expected.stage
      || item.parent.sourceView !== expected.view
      || item.parent.reviewState !== "LOCKED"
      || item.parent.lockedLayer !== "GARMENT"
      || item.bytes.byteLength === 0
      || sha256(item.bytes) !== item.parent.sha256
    ) {
      throw new Error(`The ${expected.role} input is not the exact accepted garment lock.`);
    }
    return item;
  });
  if (
    byRole.size !== EXPECTED_PARENTS.length
    || new Set(ordered.map((item) => item.parent.garmentId)).size !== 1
  ) {
    throw new Error("The garment 01-04 board inputs are duplicated or cross-garment.");
  }
  return Object.freeze(ordered);
}

async function renderCell(input: StudioAtelierGarmentSetBoardInput): Promise<Uint8Array> {
  const output = await createGarmentBoardPipeline(input.bytes)
    .rotate()
    .resize(BOARD_CELL_SIZE, BOARD_CELL_SIZE, {
      fit: "contain",
      background: BOARD_BACKGROUND,
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
  return new Uint8Array(output);
}

/**
 * Packs the four independently accepted garment views into one deterministic
 * provider reference. The board is transport only: its attestation retains
 * every parent role/id/hash, and it never becomes a semantic garment parent.
 */
export async function createStudioAtelierGarmentSetBoard(
  rawInputs: readonly StudioAtelierGarmentSetBoardInput[],
): Promise<StudioAtelierGarmentSetBoard> {
  const inputs = validateInputs(rawInputs);
  const cells = await Promise.all(inputs.map(renderCell));
  const left = BOARD_MARGIN;
  const right = BOARD_MARGIN + BOARD_CELL_SIZE + BOARD_GAP;
  const top = BOARD_MARGIN;
  const bottom = BOARD_MARGIN + BOARD_CELL_SIZE + BOARD_GAP;
  const bytes = new Uint8Array(await createGarmentBoardPipeline({
    create: {
      width: STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE,
      height: STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE,
      channels: 3,
      background: BOARD_BACKGROUND,
    },
  }).composite([
    { input: cells[0]!, left, top },
    { input: cells[1]!, left: right, top },
    { input: cells[2]!, left, top: bottom },
    { input: cells[3]!, left: right, top: bottom },
  ]).png({
    compressionLevel: 9,
    adaptiveFiltering: false,
    palette: false,
    effort: 10,
  }).toBuffer());
  const boardSha256 = sha256(bytes);
  const privacyClass = inputs.reduce<ParentLock["privacyClass"]>(
    (current, item) => privacyRank(item.parent.privacyClass) > privacyRank(current)
      ? item.parent.privacyClass
      : current,
    "PUBLIC",
  );
  const pack = attestedReferencePackSchema.parse({
    packRole: "GARMENT_SET_01_04_BOARD",
    assetId: `atelier.pack.garment-01-04.${boardSha256}`,
    sha256: boardSha256,
    privacyClass,
    method: "DETERMINISTIC_COMPOSITE_BOARD",
    attestationId: `atelier.pack-recipe.${STUDIO_ATELIER_GARMENT_SET_BOARD_RECIPE}`,
    constituents: inputs.map(({ parent }) => ({
      kind: "PARENT" as const,
      role: parent.role,
      assetId: parent.assetId,
      sha256: parent.sha256,
    })),
  });
  return Object.freeze({
    pack: Object.freeze(pack),
    bytes,
    mimeType: "image/png" as const,
    width: STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE,
    height: STUDIO_ATELIER_GARMENT_SET_BOARD_SIZE,
  });
}
