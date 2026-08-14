import { get } from "@vercel/blob";
import sharp from "sharp";
import { getOwnedAsset, getOwnedWardrobeItem } from "../../server/studio-intake-repository";
import {
  cataloguePublicationReceipt,
  findCataloguePublication,
  insertCataloguePublicationAtomically,
  type PublicPublicationMedia,
} from "../../server/studio-catalogue-publication-repository";
import { listPendingProductCaptures, type PendingCaptureRow } from "../../server/studio-pending-capture-repository";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import { invalidateServerShopCatalogue } from "../../shop/server-catalog";
import type { StudioOperator } from "../../server/studio-operator";
import { verifyStudioImage } from "./assets";
import type {
  PublicationMediaSlot,
  StudioPublicationPreviewMedia,
  StudioPublicationReceipt,
  StudioPublicationReview,
} from "./catalogue-publication-contracts";
import { StudioEngineError } from "./errors";
import { sha256 } from "./fingerprint";
import { wardrobeCaptureKey } from "./pending-capture-service";

type WardrobeItem = Awaited<ReturnType<typeof getOwnedWardrobeItem>>;
type StudioAsset = Awaited<ReturnType<typeof getOwnedAsset>>;

type PublicationSource = {
  id: string;
  slot: PublicationMediaSlot;
  label: string;
  blobPathname: string;
  mimeType: string;
  sha256: string;
  width: number | null;
  height: number | null;
  assetUrl: string;
};

type ReadyContext = {
  item: WardrobeItem;
  front: StudioAsset;
  back: PendingCaptureRow;
  detail: PendingCaptureRow;
  captureKey: string;
  sourceRevision: string;
  sources: PublicationSource[];
};

export function dynamicStudioSlug(item: Pick<WardrobeItem, "id" | "title">) {
  const base = item.title.toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72);
  return `${base || "wardrobe-piece"}-${item.id.replaceAll("-", "").toLowerCase()}`;
}

function shopCategory(category: WardrobeItem["category"]) {
  const categories: Record<string, string> = {
    Dress: "Dresses",
    Set: "Sets",
    Shirt: "Shirts",
    Knitwear: "Knitwear",
    Skirt: "Skirts",
    Trousers: "Trousers",
  };
  return categories[category];
}

function shopSilhouette(category: WardrobeItem["category"]) {
  return ({ Dress: "dress", Set: "set", Shirt: "shirt", Knitwear: "knit", Skirt: "skirt", Trousers: "trouser" } as const)[category as Exclude<WardrobeItem["category"], "Other">];
}

function presentationTone(colour: string) {
  const value = colour.toLowerCase();
  if (/coral|orange|red/.test(value)) return "coral";
  if (/salmon|pink|magenta/.test(value)) return "salmon";
  if (/blue|indigo|navy|purple/.test(value)) return "indigo";
  if (/green|moss|sage/.test(value)) return "moss";
  if (/ivory|white|cream|beige/.test(value)) return "ivory";
  return "cocoa";
}

function sourceRevision(item: WardrobeItem, sources: PublicationSource[]) {
  return sha256(JSON.stringify({
    wardrobeItemId: item.id,
    intakeId: item.intakeId,
    updatedAt: item.updatedAt.toISOString(),
    version: item.version,
    facts: {
      title: item.title,
      category: item.category,
      colour: item.colour,
      sizeLabel: item.sizeLabel,
      condition: item.condition,
      price: item.price,
      quantity: item.quantity,
    },
    media: sources.map(({ id, slot, sha256: hash, width, height }) => ({ id, slot, sha256: hash, width, height })),
  }));
}

export function studioPublicationBlockers(item: WardrobeItem, sources: PublicationSource[]) {
  const blockers: string[] = [];
  if (!item.title.trim()) blockers.push("Title");
  if (!shopCategory(item.category)) blockers.push("Category");
  if (!item.colour.trim()) blockers.push("Colour");
  if (!item.sizeLabel.trim()) blockers.push("Size");
  if (!item.condition.trim()) blockers.push("Condition");
  if (!Number.isSafeInteger(item.price) || item.price <= 0) blockers.push("Price");
  if (item.quantity !== 1 || item.state === "ARCHIVED") blockers.push("Available stock");
  for (const slot of ["GARMENT_FRONT", "GARMENT_BACK", "FABRIC_DETAIL"] as const) {
    const source = sources.find((candidate) => candidate.slot === slot);
    if (!source || !source.width || !source.height || source.width < 1 || source.height < 1) {
      blockers.push(slot === "GARMENT_FRONT" ? "Garment front" : slot === "GARMENT_BACK" ? "Garment back" : "Fabric detail");
    }
  }
  return [...new Set(blockers)];
}

async function publicationContext(wardrobeItemId: string, operator: StudioOperator): Promise<{
  item: WardrobeItem;
  sources: PublicationSource[];
  ready?: ReadyContext;
  blockers: string[];
}> {
  const item = await getOwnedWardrobeItem(wardrobeItemId, operator.subject);
  const captureKey = wardrobeCaptureKey(item.id);
  const [front, captures] = await Promise.all([
    item.approvedAssetId
      ? getOwnedAsset({ intakeId: item.intakeId, assetId: item.approvedAssetId, subject: operator.subject })
      : Promise.resolve(null),
    listPendingProductCaptures({ operatorSubject: operator.subject, sku: captureKey }),
  ]);
  const back = captures.find((capture) => capture.role === "GARMENT_BACK");
  const detail = captures.find((capture) => capture.role === "FABRIC_DETAIL");
  const sources: PublicationSource[] = [
    ...(front && front.role === "GARMENT_FRONT" ? [{
      id: front.id,
      slot: "GARMENT_FRONT" as const,
      label: "Garment front",
      blobPathname: front.blobPathname,
      mimeType: front.mimeType,
      sha256: front.sha256,
      width: front.width,
      height: front.height,
      assetUrl: `/api/studio/intakes/${item.intakeId}/assets/${front.id}`,
    }] : []),
    ...(back ? [{
      id: back.id,
      slot: "GARMENT_BACK" as const,
      label: "Garment back",
      blobPathname: back.blobPathname,
      mimeType: back.mimeType,
      sha256: back.sha256,
      width: back.width,
      height: back.height,
      assetUrl: `/api/studio/wardrobe/${item.id}/captures/${back.id}`,
    }] : []),
    ...(detail ? [{
      id: detail.id,
      slot: "FABRIC_DETAIL" as const,
      label: "Fabric detail",
      blobPathname: detail.blobPathname,
      mimeType: detail.mimeType,
      sha256: detail.sha256,
      width: detail.width,
      height: detail.height,
      assetUrl: `/api/studio/wardrobe/${item.id}/captures/${detail.id}`,
    }] : []),
  ];
  const blockers = studioPublicationBlockers(item, sources);
  return {
    item,
    sources,
    blockers,
    ...(!blockers.length && front && back && detail ? {
      ready: { item, front, back, detail, captureKey, sources, sourceRevision: sourceRevision(item, sources) },
    } : {}),
  };
}

function previewMedia(sources: PublicationSource[]): StudioPublicationPreviewMedia[] {
  return sources.map(({ id, slot, label, assetUrl, width, height }) => ({
    id,
    slot,
    label,
    assetUrl,
    width: width ?? 0,
    height: height ?? 0,
  }));
}

export async function getStudioPublicationReview(
  wardrobeItemId: string,
  operator: StudioOperator,
): Promise<StudioPublicationReview> {
  const existing = await findCataloguePublication({ wardrobeItemId, operatorSubject: operator.subject });
  if (existing) return { state: "PUBLISHED", receipt: cataloguePublicationReceipt(existing) };
  const context = await publicationContext(wardrobeItemId, operator);
  if (!context.ready) return { state: "BLOCKED", wardrobeItemId, blockers: context.blockers };
  return {
    state: "READY",
    wardrobeItemId,
    expectedRevision: context.ready.sourceRevision,
    title: context.item.title,
    category: shopCategory(context.item.category)!,
    colour: context.item.colour,
    sizeLabel: context.item.sizeLabel,
    condition: context.item.condition,
    price: context.item.price,
    quantity: 1,
    media: previewMedia(context.sources),
  };
}

async function verifiedPrivateSource(source: PublicationSource) {
  const result = await get(source.blobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: false,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("INVALID_ASSET", 409, `${source.label} is unavailable.`, "Add that photo again.");
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const verified = verifyStudioImage(bytes, result.blob.contentType ?? source.mimeType);
  if (
    sha256(verified.bytes) !== source.sha256
    || !verified.width
    || !verified.height
    || verified.width !== source.width
    || verified.height !== source.height
  ) {
    throw new StudioEngineError("INVALID_ASSET", 409, `${source.label} did not verify.`, "Add that photo again.");
  }
  return verified;
}

export async function normalizeStudioPublicationImage(bytes: Uint8Array) {
  const normalizedBytes = new Uint8Array(await sharp(bytes)
    .rotate()
    .toColourspace("srgb")
    .webp({ quality: 92, alphaQuality: 100, effort: 4 })
    .toBuffer());
  return verifyStudioImage(normalizedBytes, "image/webp");
}

async function publishMedia(slug: string, source: PublicationSource): Promise<PublicPublicationMedia> {
  const sourceImage = await verifiedPrivateSource(source);
  const normalized = await normalizeStudioPublicationImage(sourceImage.bytes);
  if (!normalized.width || !normalized.height) {
    throw new StudioEngineError("INVALID_ASSET", 409, `${source.label} could not be normalized.`, "Add that photo again.");
  }
  const publicSha256 = sha256(normalized.bytes);
  const pathname = `shop/studio/${slug}/${source.slot.toLowerCase()}/${publicSha256}.webp`;
  const prior = await get(pathname, {
    access: "public",
    token: getShopBlobToken("public"),
    useCache: false,
  });
  let src: string;
  if (prior && prior.statusCode === 200) {
    const priorBytes = new Uint8Array(await new Response(prior.stream).arrayBuffer());
    if (sha256(priorBytes) !== publicSha256) {
      throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "Public media did not verify.", "Try publishing again.");
    }
    src = prior.blob.url;
  } else {
    try {
      const stored = await putShopBlob("public", pathname, Buffer.from(normalized.bytes), {
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: normalized.mimeType,
        cacheControlMaxAge: 31_536_000,
      });
      src = stored.url;
    } catch (error) {
      // Two identical confirmations may both observe a cache miss. The loser
      // accepts only the exact content-addressed bytes written by the winner.
      const converged = await get(pathname, {
        access: "public",
        token: getShopBlobToken("public"),
        useCache: false,
      });
      if (!converged || converged.statusCode !== 200) throw error;
      const convergedBytes = new Uint8Array(await new Response(converged.stream).arrayBuffer());
      if (sha256(convergedBytes) !== publicSha256) throw error;
      src = converged.blob.url;
    }
  }
  return {
    slot: source.slot,
    src,
    pathname,
    sourceSha256: source.sha256,
    sha256: publicSha256,
    mimeType: normalized.mimeType,
    width: normalized.width,
    height: normalized.height,
  };
}

export async function publishStudioPiece(input: {
  wardrobeItemId: string;
  operator: StudioOperator;
  expectedRevision: string;
  idempotencyKey: string;
}): Promise<StudioPublicationReceipt> {
  const existing = await findCataloguePublication({
    wardrobeItemId: input.wardrobeItemId,
    operatorSubject: input.operator.subject,
  });
  if (existing) {
    if (existing.idempotencyKey === input.idempotencyKey) return cataloguePublicationReceipt(existing);
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This piece is already published.", "Open its Shop page.");
  }
  const context = await publicationContext(input.wardrobeItemId, input.operator);
  if (!context.ready) {
    throw new StudioEngineError("INVALID_TRANSITION", 409, "This piece is not ready.", context.blockers.join(", "));
  }
  if (context.ready.sourceRevision !== input.expectedRevision) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed during review.", "Review it again before publishing.");
  }
  const slug = dynamicStudioSlug(context.item);
  const media = await Promise.all(context.sources.map((source) => publishMedia(slug, source)));
  const current = await publicationContext(input.wardrobeItemId, input.operator);
  if (!current.ready || current.ready.sourceRevision !== input.expectedRevision) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed during review.", "Review it again before publishing.");
  }
  try {
    const row = await insertCataloguePublicationAtomically({
      wardrobeItemId: current.item.id,
      intakeId: current.item.intakeId,
      operatorSubject: input.operator.subject,
      idempotencyKey: input.idempotencyKey,
      sourceRevision: input.expectedRevision,
      expectedVersion: current.item.version,
      approvedAssetId: current.ready.front.id,
      approvedAssetSha256: current.ready.front.sha256,
      captureKey: current.ready.captureKey,
      backCaptureId: current.ready.back.id,
      backCaptureSha256: current.ready.back.sha256,
      detailCaptureId: current.ready.detail.id,
      detailCaptureSha256: current.ready.detail.sha256,
      slug,
      title: current.item.title,
      sourceCategory: current.item.category,
      category: shopCategory(current.item.category)!,
      price: current.item.price,
      taggedSize: current.item.sizeLabel,
      condition: current.item.condition,
      colour: current.item.colour,
      tone: presentationTone(current.item.colour),
      silhouette: shopSilhouette(current.item.category)!,
      facts: {
        title: current.item.title,
        category: shopCategory(current.item.category),
        colour: current.item.colour,
        sizeLabel: current.item.sizeLabel,
        condition: current.item.condition,
        price: current.item.price,
        quantity: 1,
      },
      media,
    });
    if (!row) {
      throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece changed during publishing.", "Review it again.");
    }
    invalidateServerShopCatalogue();
    return cataloguePublicationReceipt(row);
  } catch (error) {
    const concurrent = await findCataloguePublication({
      wardrobeItemId: input.wardrobeItemId,
      operatorSubject: input.operator.subject,
    });
    if (concurrent?.idempotencyKey === input.idempotencyKey) {
      invalidateServerShopCatalogue();
      return cataloguePublicationReceipt(concurrent);
    }
    if (error instanceof StudioEngineError) throw error;
    throw new StudioEngineError("VERSION_CONFLICT", 409, "This piece could not be published once.", "Review it and try again.");
  }
}
