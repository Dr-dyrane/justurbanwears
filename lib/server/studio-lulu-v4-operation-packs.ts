import { createHash } from "node:crypto";
import sharp from "sharp";
import manifestJson from "./private-asset-manifests/lulu-v4.json";
import {
  LULU_V4_AUTHORITY_REVISION,
  resolveLuluV4AuthorityAssets,
  type LuluV4AuthorityAsset,
  type LuluV4ResolvedAuthorityAsset,
  type LuluV4View,
} from "./studio-lulu-v4-authority";
import { verifyStudioImage } from "../studio/engine/assets";
import { StudioEngineError } from "../studio/engine/errors";

export const LULU_V4_OPERATION_KINDS = Object.freeze([
  "SUBJECT_A",
  "SUBJECT_B",
  "ROOM_FINAL_05",
  "SIBLING_06",
  "SIBLING_07_CORE",
  "SIBLING_07_RECOVERY",
] as const);

export type LuluV4OperationKind = (typeof LULU_V4_OPERATION_KINDS)[number];
export type LuluV4OperationView = "SUBJECT" | LuluV4View;

export type LuluV4DynamicReferenceSlot =
  | "GARMENT_FRONT_LOCK"
  | "ELIGIBLE_PASS_A_PARENT"
  | "ACCEPTED_SUBJECT_LOCK"
  | "ACCEPTED_CURRENT_GARMENT_05";

type ManifestAssetReference = {
  kind: "ASSET";
  assetId: string;
};

type ManifestCompositeReference = {
  kind: "COMPOSITE_BOARD";
  id: string;
  role: string;
  authority: LuluV4AuthorityAsset["authority"];
  componentAssetIds: string[];
};

type ManifestAttestedReference = {
  kind: "ATTESTED_ASSET";
  assetId: string;
  role: string;
  authority: LuluV4AuthorityAsset["authority"];
  constituents: Array<{ assetId: string; sha256: string }>;
};

type ManifestSourceAttestation = {
  assetId: string;
  sha256: string;
  constituents: Array<{ assetId: string; sha256: string }>;
};

type ManifestFusedAttestedReference = {
  kind: "FUSED_ATTESTED_BOARD";
  id: string;
  role: string;
  authority: LuluV4AuthorityAsset["authority"];
  boardSpec: {
    version: string;
    width: number;
    height: number;
    background: string;
    faceCell: { left: number; top: number; width: number; height: number };
    rearCell: { left: number; top: number; width: number; height: number };
    mimeType: "image/png";
    expectedSha256: string;
    expectedByteSize: number;
  };
  sourceAttestations: ManifestSourceAttestation[];
};

type ManifestStaticReference =
  | ManifestAssetReference
  | ManifestCompositeReference
  | ManifestAttestedReference
  | ManifestFusedAttestedReference;

type ManifestOperationPack = {
  view: LuluV4OperationView;
  dynamicReferenceSlots: LuluV4DynamicReferenceSlot[];
  staticReferences: ManifestStaticReference[];
};

type OperationPackManifest = {
  schemaVersion: 3;
  authorityRevision: string;
  maxPhysicalReferences: number;
  assets: LuluV4AuthorityAsset[];
  operationPacks: Record<LuluV4OperationKind, ManifestOperationPack>;
};

export type LuluV4PackedComponent = Readonly<{
  id: string;
  sha256: string;
}>;

export type LuluV4NestedAttestation = Readonly<{
  id: string;
  sha256: string;
  constituents: readonly LuluV4PackedComponent[];
}>;

type LuluV4StaticPhysicalReferenceBase = Readonly<{
  id: string;
  role: string;
  authority: LuluV4AuthorityAsset["authority"];
  bytes: Uint8Array;
  mimeType: "image/jpeg" | "image/png";
  sha256: string;
  width: number;
  height: number;
  packedComponents: readonly LuluV4PackedComponent[];
}>;

export type LuluV4StaticPhysicalReference =
  | (LuluV4StaticPhysicalReferenceBase & Readonly<{
      sourceKind: Exclude<ManifestStaticReference["kind"], "FUSED_ATTESTED_BOARD">;
    }>)
  | (LuluV4StaticPhysicalReferenceBase & Readonly<{
      sourceKind: "FUSED_ATTESTED_BOARD";
      transportVersion: string;
      nestedAttestations: readonly LuluV4NestedAttestation[];
    }>);

const manifest = manifestJson as OperationPackManifest;
const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
const MAX_PHYSICAL_REFERENCES = 4;
const BOARD_WIDTH = 1536;
const BOARD_HEIGHT = 1024;
const BOARD_MARGIN = 24;
const BOARD_GAP = 24;
const BOARD_BACKGROUND = "#eee9e1";
const FUSED_RECOVERY_BOARD_SPEC = Object.freeze({
  version: "LULU_FUSED_IDENTITY_REAR_RECOVERY_BOARD_V1",
  width: 1536,
  height: 2048,
  background: BOARD_BACKGROUND,
  faceCell: Object.freeze({ left: 32, top: 32, width: 1472, height: 1248 }),
  rearCell: Object.freeze({ left: 32, top: 1312, width: 1472, height: 704 }),
  mimeType: "image/png" as const,
});

type BoardCell = Readonly<{
  left: number;
  top: number;
  width: number;
  height: number;
}>;

type AuthorityBoardPipeline = {
  rotate(): AuthorityBoardPipeline;
  resize(width: number, height: number, options: {
    fit: "contain";
    background: string;
    withoutEnlargement: boolean;
  }): AuthorityBoardPipeline;
  removeAlpha(): AuthorityBoardPipeline;
  composite(overlays: Array<{ input: Uint8Array; left: number; top: number }>): AuthorityBoardPipeline;
  png(options: {
    compressionLevel: number;
    adaptiveFiltering: boolean;
    palette: boolean;
    effort: number;
  }): AuthorityBoardPipeline;
  toBuffer(): Promise<Uint8Array>;
};

type AuthorityBoardInput = Uint8Array | {
  create: {
    width: number;
    height: number;
    channels: 3;
    background: string;
  };
};

const createAuthorityBoardPipeline = sharp as unknown as (
  input: AuthorityBoardInput,
) => AuthorityBoardPipeline;

const expectedPackHeaders = Object.freeze({
  SUBJECT_A: { view: "SUBJECT", dynamic: ["GARMENT_FRONT_LOCK"] },
  SUBJECT_B: { view: "SUBJECT", dynamic: ["ELIGIBLE_PASS_A_PARENT", "GARMENT_FRONT_LOCK"] },
  ROOM_FINAL_05: { view: "05", dynamic: ["ACCEPTED_SUBJECT_LOCK", "GARMENT_FRONT_LOCK"] },
  SIBLING_06: { view: "06", dynamic: ["ACCEPTED_CURRENT_GARMENT_05"] },
  SIBLING_07_CORE: { view: "07", dynamic: ["ACCEPTED_CURRENT_GARMENT_05"] },
  SIBLING_07_RECOVERY: { view: "07", dynamic: ["ACCEPTED_CURRENT_GARMENT_05"] },
} as const satisfies Record<LuluV4OperationKind, {
  view: LuluV4OperationView;
  dynamic: readonly LuluV4DynamicReferenceSlot[];
}>);

function invalidPack(message: string): never {
  throw new StudioEngineError(
    "INVALID_ASSET",
    503,
    message,
    "Restore and re-sync the approved Lulu V4 operation packs.",
  );
}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function sameOrderedValues(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

function staticReferenceAssetIds(reference: ManifestStaticReference): readonly string[] {
  if (reference.kind === "ASSET") return [reference.assetId];
  if (reference.kind === "COMPOSITE_BOARD") return reference.componentAssetIds;
  if (reference.kind === "ATTESTED_ASSET") {
    return [reference.assetId, ...reference.constituents.map((constituent) => constituent.assetId)];
  }
  return reference.sourceAttestations.flatMap((attestation) => [
    attestation.assetId,
    ...attestation.constituents.map((constituent) => constituent.assetId),
  ]);
}

function requireReferenceAsset(pack: ManifestOperationPack, assetId: string): void {
  if (!pack.staticReferences.some((reference) => staticReferenceAssetIds(reference).includes(assetId))) {
    invalidPack(`The Lulu V4 operation pack is missing ${assetId}.`);
  }
}

function requireComposite(
  pack: ManifestOperationPack,
  componentAssetIds: readonly string[],
  role: string,
): void {
  if (!pack.staticReferences.some((reference) => (
    reference.kind === "COMPOSITE_BOARD"
    && reference.role === role
    && reference.authority === "body"
    && sameOrderedValues(reference.componentAssetIds, componentAssetIds)
  ))) {
    invalidPack("The Lulu V4 operation pack has an invalid packaged authority board.");
  }
}

function matchesCell(
  actual: ManifestFusedAttestedReference["boardSpec"]["faceCell"],
  expected: BoardCell,
): boolean {
  return actual.left === expected.left
    && actual.top === expected.top
    && actual.width === expected.width
    && actual.height === expected.height;
}

function requireExactAssetAttestation(
  attestation: { assetId: string; sha256: string },
  expectedAssetId: string,
): void {
  const asset = assetsById.get(expectedAssetId);
  if (
    attestation.assetId !== expectedAssetId
    || !asset
    || attestation.sha256 !== asset.sha256
  ) {
    invalidPack(`The Lulu V4 fused recovery board does not attest ${expectedAssetId}.`);
  }
}

function validateFusedRecoveryReference(reference: ManifestFusedAttestedReference): void {
  const spec = reference.boardSpec;
  const [faceAttestation, rearAttestation] = reference.sourceAttestations;
  if (
    reference.id !== "lulu.pack.sibling-07.identity-rear-recovery.v1"
    || reference.role !== "FUSED_IDENTITY_REAR_RECOVERY_BOARD"
    || reference.authority !== "identity"
    || reference.sourceAttestations.length !== 2
    || spec.version !== FUSED_RECOVERY_BOARD_SPEC.version
    || spec.width !== FUSED_RECOVERY_BOARD_SPEC.width
    || spec.height !== FUSED_RECOVERY_BOARD_SPEC.height
    || spec.background !== FUSED_RECOVERY_BOARD_SPEC.background
    || spec.mimeType !== FUSED_RECOVERY_BOARD_SPEC.mimeType
    || !matchesCell(spec.faceCell, FUSED_RECOVERY_BOARD_SPEC.faceCell)
    || !matchesCell(spec.rearCell, FUSED_RECOVERY_BOARD_SPEC.rearCell)
    || !/^[a-f0-9]{64}$/.test(spec.expectedSha256)
    || !Number.isInteger(spec.expectedByteSize)
    || spec.expectedByteSize <= 0
    || !faceAttestation
    || !rearAttestation
  ) {
    invalidPack("The Lulu V4 fused identity/rear transport board declaration is invalid.");
  }

  requireExactAssetAttestation(faceAttestation, "lulu.face.operation-board.full.v1");
  requireExactAssetAttestation(rearAttestation, "lulu.body.rear.operation-board.full.v1");
  if (faceAttestation.constituents.length !== 0) {
    invalidPack("The fused recovery face input must be the exact complete operation board.");
  }
  const expectedRearConstituents = [
    "lulu.body.canon.v4.back",
    "lulu.body.real.angle-contact.v4",
    "lulu.body.real.gym-rear-profile.v4",
  ] as const;
  if (
    rearAttestation.constituents.length !== expectedRearConstituents.length
    || !rearAttestation.constituents.every((attestation, index) => {
      const expectedAssetId = expectedRearConstituents[index];
      const asset = assetsById.get(expectedAssetId);
      return attestation.assetId === expectedAssetId
        && asset?.sha256 === attestation.sha256;
    })
  ) {
    invalidPack("The fused recovery rear input lacks its exact nested constituent lineage.");
  }
}

function validateManifestPacks(): void {
  if (
    manifest.schemaVersion !== 3
    || manifest.authorityRevision !== LULU_V4_AUTHORITY_REVISION
    || manifest.maxPhysicalReferences !== MAX_PHYSICAL_REFERENCES
    || !sameOrderedValues(Object.keys(manifest.operationPacks), LULU_V4_OPERATION_KINDS)
  ) {
    invalidPack("The Lulu V4 operation-pack manifest is invalid.");
  }

  const referenceIds = new Set<string>();
  for (const kind of LULU_V4_OPERATION_KINDS) {
    const pack = manifest.operationPacks[kind];
    const expected = expectedPackHeaders[kind];
    if (
      !pack
      || pack.view !== expected.view
      || !sameOrderedValues(pack.dynamicReferenceSlots, expected.dynamic)
      || pack.staticReferences.length === 0
      || pack.dynamicReferenceSlots.length + pack.staticReferences.length > MAX_PHYSICAL_REFERENCES
    ) {
      invalidPack(`The Lulu V4 ${kind} operation pack exceeds or violates its declared contract.`);
    }

    for (const reference of pack.staticReferences) {
      if (reference.kind === "ASSET") {
        if (!assetsById.has(reference.assetId)) {
          invalidPack(`The Lulu V4 ${kind} operation pack references an unknown asset.`);
        }
        continue;
      }

      if (reference.kind === "COMPOSITE_BOARD") {
        if (
          referenceIds.has(reference.id)
          || reference.componentAssetIds.length < 2
          || reference.componentAssetIds.length > 3
          || new Set(reference.componentAssetIds).size !== reference.componentAssetIds.length
          || !reference.componentAssetIds.every((assetId) => assetsById.has(assetId))
        ) {
          invalidPack(`The Lulu V4 ${kind} composite authority is invalid.`);
        }
        referenceIds.add(reference.id);
        continue;
      }

      if (reference.kind === "ATTESTED_ASSET") {
        const board = assetsById.get(reference.assetId);
        if (
          !board
          || reference.assetId !== "lulu.body.rear.operation-board.full.v1"
          || reference.role !== "REAR_RECOVERY_BOARD"
          || reference.authority !== "body"
          || reference.constituents.length !== 3
          || new Set(reference.constituents.map((item) => item.assetId)).size !== 3
          || reference.constituents.some((item) => {
            const constituent = assetsById.get(item.assetId);
            return !constituent || constituent.sha256 !== item.sha256;
          })
        ) {
          invalidPack(`The Lulu V4 ${kind} attested authority is invalid.`);
        }
        continue;
      }

      if (referenceIds.has(reference.id)) {
        invalidPack(`The Lulu V4 ${kind} fused authority ID is duplicated.`);
      }
      referenceIds.add(reference.id);
      validateFusedRecoveryReference(reference);
    }
  }

  requireReferenceAsset(manifest.operationPacks.SUBJECT_A, "lulu.face.operation-board.full.v1");
  requireComposite(manifest.operationPacks.SUBJECT_A, [
    "lulu.face.v4.front.lock.v1",
    "lulu.body.canon.v4.front",
    "lulu.body.real.angle-contact.v4",
  ], "SUBJECT_A_TRANSLATION_FACE_BOARD");
  requireReferenceAsset(manifest.operationPacks.SUBJECT_B, "lulu.face.operation-board.full.v1");
  requireComposite(manifest.operationPacks.SUBJECT_B, [
    "lulu.body.canon.v4.front",
    "lulu.body.real.angle-contact.v4",
  ], "SUBJECT_B_TRANSLATION_FACE_BOARD");
  requireReferenceAsset(manifest.operationPacks.ROOM_FINAL_05, "juw.atelier.empty-plate.v1");
  requireReferenceAsset(manifest.operationPacks.SIBLING_06, "lulu.face.operation-board.full.v1");
  requireReferenceAsset(manifest.operationPacks.SIBLING_06, "juw.atelier.empty-plate.v1");
  requireComposite(manifest.operationPacks.SIBLING_06, [
    "lulu.body.canon.v4.side",
    "lulu.body.real.angle-contact.v4",
  ], "SIDE_BODY_ANGLE_BOARD");
  requireReferenceAsset(manifest.operationPacks.SIBLING_07_CORE, "lulu.face.operation-board.full.v1");
  requireReferenceAsset(manifest.operationPacks.SIBLING_07_CORE, "juw.atelier.empty-plate.v1");
  requireComposite(manifest.operationPacks.SIBLING_07_CORE, [
    "lulu.body.canon.v4.back",
    "lulu.body.real.angle-contact.v4",
  ], "BACK_BODY_ANGLE_BOARD");

  const recovery = manifest.operationPacks.SIBLING_07_RECOVERY;
  requireReferenceAsset(recovery, "juw.atelier.empty-plate.v1");
  const fused = recovery.staticReferences.find(
    (reference): reference is ManifestFusedAttestedReference => (
      reference.kind === "FUSED_ATTESTED_BOARD"
    ),
  );
  if (!fused || recovery.staticReferences.length !== 2) {
    invalidPack("The Lulu V4 recovery pack must contain only the fused authority and exact room.");
  }
}

validateManifestPacks();

function publicReferenceDescriptor(reference: ManifestStaticReference) {
  if (reference.kind === "ASSET") {
    const asset = assetsById.get(reference.assetId)!;
    return Object.freeze({
      id: asset.id,
      role: asset.role,
      authority: asset.authority,
      sourceKind: reference.kind,
      packedComponentIds: Object.freeze([] as string[]),
    });
  }
  if (reference.kind === "COMPOSITE_BOARD") {
    return Object.freeze({
      id: reference.id,
      role: reference.role,
      authority: reference.authority,
      sourceKind: reference.kind,
      packedComponentIds: Object.freeze([...reference.componentAssetIds]),
    });
  }
  if (reference.kind === "ATTESTED_ASSET") {
    const asset = assetsById.get(reference.assetId)!;
    return Object.freeze({
      id: asset.id,
      role: reference.role,
      authority: reference.authority,
      sourceKind: reference.kind,
      packedComponentIds: Object.freeze(reference.constituents.map((item) => item.assetId)),
    });
  }
  const [faceAttestation, rearAttestation] = reference.sourceAttestations;
  return Object.freeze({
    id: reference.id,
    role: reference.role,
    authority: reference.authority,
    sourceKind: reference.kind,
    transportVersion: reference.boardSpec.version,
    transportGeometry: Object.freeze({
      width: reference.boardSpec.width,
      height: reference.boardSpec.height,
    }),
    packedComponentIds: Object.freeze([
      faceAttestation!.assetId,
      ...rearAttestation!.constituents.map((item) => item.assetId),
    ]),
    nestedAttestationIds: Object.freeze(reference.sourceAttestations.map((attestation) => Object.freeze({
      id: attestation.assetId,
      constituentIds: Object.freeze(attestation.constituents.map((item) => item.assetId)),
    }))),
  });
}

export function parseLuluV4OperationKind(value: string): LuluV4OperationKind {
  if ((LULU_V4_OPERATION_KINDS as readonly string[]).includes(value)) {
    return value as LuluV4OperationKind;
  }
  throw new StudioEngineError(
    "INVALID_REQUEST",
    400,
    "Choose a supported Lulu V4 operation pack.",
    `Use one of: ${LULU_V4_OPERATION_KINDS.join(", ")}.`,
  );
}

/** Safe for operator/API responses: paths, bytes and hashes are excluded. */
export function describeLuluV4OperationPack(kind: LuluV4OperationKind) {
  const pack = manifest.operationPacks[kind];
  return Object.freeze({
    authorityId: "lulu-v4" as const,
    revision: manifest.authorityRevision,
    kind,
    view: pack.view,
    privacy: "PRIVATE_PRODUCTION_ONLY" as const,
    publishable: false as const,
    dynamicReferenceSlots: Object.freeze([...pack.dynamicReferenceSlots]),
    staticPhysicalReferenceCount: pack.staticReferences.length,
    physicalReferenceCount: pack.dynamicReferenceSlots.length + pack.staticReferences.length,
    maxPhysicalReferences: manifest.maxPhysicalReferences,
    staticReferences: Object.freeze(pack.staticReferences.map(publicReferenceDescriptor)),
  });
}

async function buildCompositeBoard(
  reference: ManifestCompositeReference,
  components: readonly LuluV4ResolvedAuthorityAsset[],
): Promise<LuluV4StaticPhysicalReference> {
  if (
    components.length !== reference.componentAssetIds.length
    || !components.every((component, index) => component.id === reference.componentAssetIds[index])
  ) {
    return invalidPack(`The Lulu V4 packaged authority ${reference.id} has unresolved components.`);
  }

  const cellWidth = Math.floor(
    (BOARD_WIDTH - (BOARD_MARGIN * 2) - (BOARD_GAP * (components.length - 1))) / components.length,
  );
  const cellHeight = BOARD_HEIGHT - (BOARD_MARGIN * 2);
  const tiles = await Promise.all(components.map(async (component, index) => ({
    input: await createAuthorityBoardPipeline(component.bytes)
      .rotate()
      .resize(cellWidth, cellHeight, {
        fit: "contain",
        background: BOARD_BACKGROUND,
        withoutEnlargement: false,
      })
      .removeAlpha()
      .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })
      .toBuffer(),
    left: BOARD_MARGIN + (index * (cellWidth + BOARD_GAP)),
    top: BOARD_MARGIN,
  })));
  const output = new Uint8Array(await createAuthorityBoardPipeline({
    create: {
      width: BOARD_WIDTH,
      height: BOARD_HEIGHT,
      channels: 3,
      background: BOARD_BACKGROUND,
    },
  })
    .composite(tiles)
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })
    .toBuffer());
  const verified = verifyStudioImage(output, "image/png");
  if (verified.width !== BOARD_WIDTH || verified.height !== BOARD_HEIGHT) {
    return invalidPack(`The Lulu V4 packaged authority ${reference.id} did not render deterministically.`);
  }
  return Object.freeze({
    id: reference.id,
    role: reference.role,
    authority: reference.authority,
    sourceKind: reference.kind,
    bytes: verified.bytes,
    mimeType: "image/png" as const,
    sha256: sha256(verified.bytes),
    width: BOARD_WIDTH,
    height: BOARD_HEIGHT,
    packedComponents: Object.freeze(components.map((component) => Object.freeze({
      id: component.id,
      sha256: component.sha256,
    }))),
  });
}

async function renderFusedRecoveryCell(
  component: LuluV4ResolvedAuthorityAsset,
  cell: BoardCell,
): Promise<Uint8Array> {
  return new Uint8Array(await createAuthorityBoardPipeline(component.bytes)
    .rotate()
    .resize(cell.width, cell.height, {
      fit: "contain",
      background: FUSED_RECOVERY_BOARD_SPEC.background,
      withoutEnlargement: false,
    })
    .removeAlpha()
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })
    .toBuffer());
}

async function buildFusedRecoveryBoard(
  reference: ManifestFusedAttestedReference,
  faceBoard: LuluV4ResolvedAuthorityAsset,
  rearBoard: LuluV4ResolvedAuthorityAsset,
  rearConstituents: readonly LuluV4ResolvedAuthorityAsset[],
): Promise<LuluV4StaticPhysicalReference> {
  const [faceAttestation, rearAttestation] = reference.sourceAttestations;
  if (
    !faceAttestation
    || !rearAttestation
    || faceBoard.id !== faceAttestation.assetId
    || faceBoard.sha256 !== faceAttestation.sha256
    || rearBoard.id !== rearAttestation.assetId
    || rearBoard.sha256 !== rearAttestation.sha256
    || rearConstituents.length !== rearAttestation.constituents.length
    || !rearConstituents.every((component, index) => {
      const attestation = rearAttestation.constituents[index];
      return component.id === attestation?.assetId && component.sha256 === attestation.sha256;
    })
  ) {
    return invalidPack("The Lulu V4 fused recovery board failed its nested source attestation.");
  }

  const [faceCell, rearCell] = await Promise.all([
    renderFusedRecoveryCell(faceBoard, FUSED_RECOVERY_BOARD_SPEC.faceCell),
    renderFusedRecoveryCell(rearBoard, FUSED_RECOVERY_BOARD_SPEC.rearCell),
  ]);
  const output = new Uint8Array(await createAuthorityBoardPipeline({
    create: {
      width: FUSED_RECOVERY_BOARD_SPEC.width,
      height: FUSED_RECOVERY_BOARD_SPEC.height,
      channels: 3,
      background: FUSED_RECOVERY_BOARD_SPEC.background,
    },
  })
    .composite([
      {
        input: faceCell,
        left: FUSED_RECOVERY_BOARD_SPEC.faceCell.left,
        top: FUSED_RECOVERY_BOARD_SPEC.faceCell.top,
      },
      {
        input: rearCell,
        left: FUSED_RECOVERY_BOARD_SPEC.rearCell.left,
        top: FUSED_RECOVERY_BOARD_SPEC.rearCell.top,
      },
    ])
    .png({ compressionLevel: 9, adaptiveFiltering: false, palette: false, effort: 10 })
    .toBuffer());
  const verified = verifyStudioImage(output, FUSED_RECOVERY_BOARD_SPEC.mimeType);
  if (
    verified.width !== reference.boardSpec.width
    || verified.height !== reference.boardSpec.height
    || verified.bytes.byteLength !== reference.boardSpec.expectedByteSize
    || sha256(verified.bytes) !== reference.boardSpec.expectedSha256
  ) {
    return invalidPack(
      "The Lulu V4 fused recovery board bytes do not match the versioned geometry/hash contract.",
    );
  }

  const rearPackedComponents = rearConstituents.map((component) => Object.freeze({
    id: component.id,
    sha256: component.sha256,
  }));
  return Object.freeze({
    id: reference.id,
    role: reference.role,
    authority: reference.authority,
    sourceKind: reference.kind,
    bytes: verified.bytes,
    mimeType: FUSED_RECOVERY_BOARD_SPEC.mimeType,
    sha256: reference.boardSpec.expectedSha256,
    width: reference.boardSpec.width,
    height: reference.boardSpec.height,
    packedComponents: Object.freeze([
      Object.freeze({ id: faceBoard.id, sha256: faceBoard.sha256 }),
      ...rearPackedComponents,
    ]),
    transportVersion: reference.boardSpec.version,
    nestedAttestations: Object.freeze([
      Object.freeze({
        id: faceBoard.id,
        sha256: faceBoard.sha256,
        constituents: Object.freeze([]),
      }),
      Object.freeze({
        id: rearBoard.id,
        sha256: rearBoard.sha256,
        constituents: Object.freeze(rearPackedComponents),
      }),
    ]),
  });
}

function resolvedAssetReference(
  sourceKind: "ASSET" | "ATTESTED_ASSET",
  asset: LuluV4ResolvedAuthorityAsset,
  constituents: readonly LuluV4ResolvedAuthorityAsset[] = [],
  role: string = asset.role,
  authority: LuluV4AuthorityAsset["authority"] = asset.authority,
): LuluV4StaticPhysicalReference {
  return Object.freeze({
    id: asset.id,
    role,
    authority,
    sourceKind,
    bytes: asset.bytes,
    mimeType: asset.mimeType,
    sha256: asset.sha256,
    width: asset.width,
    height: asset.height,
    packedComponents: Object.freeze(constituents.map((constituent) => Object.freeze({
      id: constituent.id,
      sha256: constituent.sha256,
    }))),
  });
}

/**
 * Resolves every source needed by one exact operation pack. The returned
 * static references are in provider order. Dynamic parents remain explicit
 * slots and must be bound by the engine before invocation.
 */
export async function resolveLuluV4OperationPack(kind: LuluV4OperationKind) {
  const pack = manifest.operationPacks[kind];
  const requestedAssetIds = [...new Set(pack.staticReferences.flatMap(staticReferenceAssetIds))];
  const verifiedAssets = await resolveLuluV4AuthorityAssets(requestedAssetIds);
  const verifiedById = new Map(verifiedAssets.map((asset) => [asset.id, asset]));

  const staticReferences = await Promise.all(pack.staticReferences.map(async (reference) => {
    if (reference.kind === "ASSET") {
      return resolvedAssetReference("ASSET", verifiedById.get(reference.assetId)!);
    }
    if (reference.kind === "COMPOSITE_BOARD") {
      const components = reference.componentAssetIds.map((assetId) => verifiedById.get(assetId)!);
      return buildCompositeBoard(reference, components);
    }

    if (reference.kind === "ATTESTED_ASSET") {
      const asset = verifiedById.get(reference.assetId)!;
      const constituents = reference.constituents.map((attestation) => {
        const constituent = verifiedById.get(attestation.assetId);
        if (!constituent || constituent.sha256 !== attestation.sha256) {
          return invalidPack("The Lulu V4 rear recovery authority failed constituent attestation.");
        }
        return constituent;
      });
      return resolvedAssetReference(
        "ATTESTED_ASSET",
        asset,
        constituents,
        reference.role,
        reference.authority,
      );
    }

    const [faceAttestation, rearAttestation] = reference.sourceAttestations;
    if (!faceAttestation || !rearAttestation) {
      return invalidPack("The Lulu V4 fused recovery source attestations are incomplete.");
    }
    const faceBoard = verifiedById.get(faceAttestation.assetId)!;
    const rearBoard = verifiedById.get(rearAttestation.assetId)!;
    const rearConstituents = rearAttestation.constituents.map((attestation) => {
      const constituent = verifiedById.get(attestation.assetId);
      if (!constituent || constituent.sha256 !== attestation.sha256) {
        return invalidPack("The Lulu V4 fused recovery rear lineage failed attestation.");
      }
      return constituent;
    });
    return buildFusedRecoveryBoard(reference, faceBoard, rearBoard, rearConstituents);
  }));

  return Object.freeze({
    authorityId: "lulu-v4" as const,
    revision: manifest.authorityRevision,
    kind,
    view: pack.view,
    privacy: "PRIVATE_PRODUCTION_ONLY" as const,
    publishable: false as const,
    status: "STATIC_AUTHORITIES_VERIFIED" as const,
    dynamicReferenceSlots: Object.freeze([...pack.dynamicReferenceSlots]),
    staticReferences: Object.freeze(staticReferences),
    staticPhysicalReferenceCount: staticReferences.length,
    physicalReferenceCount: pack.dynamicReferenceSlots.length + staticReferences.length,
    maxPhysicalReferences: manifest.maxPhysicalReferences,
    verifiedSourceAssetCount: verifiedAssets.length,
  });
}
