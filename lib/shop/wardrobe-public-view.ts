import type {
  WardrobePublicMedia,
  WardrobePublicProduct,
  WardrobePublicViewSnapshot,
} from "../wardrobe-public-view/domain/entities";
import { createWardrobePublicViewMigrationSnapshot } from "../wardrobe-public-view/seeds";
import type {
  ProductMediaPresentation,
  ProductMediaView,
  ShopApprovedModelMedia,
  ShopProduct,
  ShopProductMedia,
} from "./domain/entities";

const mediaPresentation: Record<WardrobePublicMedia["slot"], ProductMediaPresentation> = {
  GARMENT_FRONT: "garment",
  GARMENT_BACK: "garment",
  MANNEQUIN_FRONT: "mannequin",
  MODEL_FRONT: "model",
  MODEL_LEFT_PROFILE: "model",
  MODEL_REAR_THREE_QUARTER: "model",
  MODEL_DETAIL: "model",
  FABRIC_DETAIL: "garment",
};

const mediaView: Record<WardrobePublicMedia["slot"], ProductMediaView> = {
  GARMENT_FRONT: "front",
  GARMENT_BACK: "back",
  MANNEQUIN_FRONT: "front",
  MODEL_FRONT: "front",
  MODEL_LEFT_PROFILE: "side",
  MODEL_REAR_THREE_QUARTER: "three-quarter",
  MODEL_DETAIL: "detail",
  FABRIC_DETAIL: "detail",
};

const mediaLabel: Record<WardrobePublicMedia["slot"], string> = {
  GARMENT_FRONT: "Garment front",
  GARMENT_BACK: "Garment back",
  MANNEQUIN_FRONT: "On mannequin",
  MODEL_FRONT: "On Lulu · front",
  MODEL_LEFT_PROFILE: "On Lulu · left profile",
  MODEL_REAR_THREE_QUARTER: "On Lulu · right rear three-quarter",
  MODEL_DETAIL: "On Lulu · styled detail",
  FABRIC_DETAIL: "Fabric detail",
};

function publicMedia(product: WardrobePublicProduct, item: WardrobePublicMedia): ShopProductMedia {
  const presentation = mediaPresentation[item.slot];
  const view = mediaView[item.slot];
  const label = mediaLabel[item.slot];
  const isModel = item.slot.startsWith("MODEL_");
  return {
    id: item.slot.toLowerCase().replaceAll("_", "-"),
    src: item.src,
    alt: `${product.name} · ${label.toLowerCase()}.`,
    label,
    presentation,
    view,
    width: isModel && product.slug === "ivory-tie-skirt" ? 971 : isModel ? 972 : 1122,
    height: isModel ? 1619 : 1402,
    modelAnchorId: isModel ? item.modelAnchorId : undefined,
  };
}

export function wardrobePublicProductToShopProduct(product: WardrobePublicProduct): ShopProduct {
  const media = product.media.map((item) => publicMedia(product, item));
  const modelFront = media.find((item): item is ShopApprovedModelMedia =>
    item.presentation === "model"
    && item.view === "front"
    && item.modelAnchorId === product.modelAnchor.id,
  );
  return {
    slug: product.slug,
    sku: product.sku,
    name: product.name,
    category: product.category,
    price: product.price,
    taggedSize: product.taggedSize,
    fit: product.fit,
    condition: product.condition,
    colour: product.colour,
    availability: product.availability,
    availabilityConfirmed: true,
    drop: product.drop,
    tone: product.tone,
    silhouette: product.silhouette,
    media: media.filter((item) => item.presentation !== "model" || item.view !== "front"),
    modelTryout: modelFront
      ? { modelStatus: "APPROVED", modelAnchorId: product.modelAnchor.id, frame: modelFront }
      : { modelStatus: "PENDING" },
    note: product.note,
    story: product.story,
    details: [...product.details],
    measurements: product.measurements.map((measurement) => ({ ...measurement })),
  };
}

export function createShopProductMigrationSeeds(): ShopProduct[] {
  return createWardrobePublicViewMigrationSnapshot().products.map(wardrobePublicProductToShopProduct);
}

export function mergeWardrobePublicView(
  migrationSeeds: readonly ShopProduct[],
  snapshot: WardrobePublicViewSnapshot,
): ShopProduct[] {
  const published = new Map(
    snapshot.products.map((product) => [product.slug, wardrobePublicProductToShopProduct(product)]),
  );
  const managed = new Set(snapshot.managedSlugs);
  const merged = migrationSeeds.flatMap((product) => {
    const replacement = published.get(product.slug);
    if (replacement) return [replacement];
    return managed.has(product.slug) ? [] : [product];
  });
  const migrationSlugs = new Set(migrationSeeds.map((product) => product.slug));
  for (const product of snapshot.products) {
    if (!migrationSlugs.has(product.slug)) merged.push(wardrobePublicProductToShopProduct(product));
  }
  return merged;
}
