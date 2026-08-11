import {
  WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
  type StoredWardrobePublicView,
  type WardrobePublicMedia,
  type WardrobePublicMediaSlot,
  type WardrobePublicProduct,
  type WardrobePublicViewSnapshot,
} from "../domain/entities";
import {
  getApprovedModelAnchorId,
  getApprovedModelSupplementalSlots,
  getWardrobePublicModelAnchor,
  WARDROBE_APPROVED_MODEL_FRONT_SLUGS,
} from "../seeds";
import { canonicalCatalogueSku } from "../sku";
import type { WardrobePublicViewRepository } from "../services/contracts";

export const WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v18";
export const WARDROBE_PUBLIC_VIEW_CHANGE_EVENT = "justurban-wears:wardrobe-public-view:changed";
export const PREVIOUS_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v17";
export const OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v16";
export const THIRD_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v15";
export const FOURTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v14";
export const FIFTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v13";
export const SIXTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v12";
export const SEVENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v11";
export const EIGHTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v10";
export const NINTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v9";
export const TENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v8";
export const ELEVENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v7";
export const TWELFTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v6";
export const THIRTEENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v5";
export const EARLIEST_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v4";
export const LEGACY_PUBLIC_CATALOG_STORAGE_KEY = "justurban-wears:catalog-projections:v2";

type UnknownRecord = Record<string, unknown>;

const categories = new Set(["Dresses", "Sets", "Shirts", "Knitwear", "Skirts", "Trousers"]);
const availabilities = new Set(["AVAILABLE", "RESERVED", "SOLD"]);
const tones = new Set(["coral", "indigo", "moss", "ivory", "cocoa", "salmon"]);
const silhouettes = new Set(["dress", "set", "shirt", "knit", "skirt", "trouser"]);
const requiredMediaSlots: WardrobePublicMediaSlot[] = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
];
const mediaFiles: Record<WardrobePublicMediaSlot, string> = {
  GARMENT_FRONT: "01-garment-front.webp",
  GARMENT_BACK: "02-garment-back.webp",
  MANNEQUIN_FRONT: "03-mannequin-front.webp",
  MODEL_FRONT: "04-model-front.webp",
  MODEL_LEFT_PROFILE: "07-model-left-profile.webp",
  MODEL_REAR_THREE_QUARTER: "05-model-rear-three-quarter.webp",
  MODEL_REAR_MIRROR: "09-model-rear-mirror.webp",
  MODEL_DETAIL: "08-model-detail.webp",
  CONSTRUCTION_DETAIL: "08-construction-detail.webp",
  FABRIC_DETAIL: "06-fabric-detail.webp",
};
const approvedModelFrontSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_FRONT_SLUGS);
const revokedModelFrontSlugs = new Set([
  "sage-asymmetric-ruched-maxi-dress",
  "silver-off-shoulder-mermaid-dress",
]);
const supplementalModelSlots = [
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
  "MODEL_REAR_MIRROR",
  "MODEL_DETAIL",
] as const satisfies readonly WardrobePublicMediaSlot[];

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function safeText(value: unknown, maximum = 500) {
  return typeof value === "string" && value.trim() && value.length <= maximum
    ? value.trim()
    : null;
}

function safeSlug(value: unknown) {
  const slug = safeText(value, 100);
  return slug && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) ? slug : null;
}

function parseMedia(value: unknown, slug: string): WardrobePublicMedia | null {
  if (!isRecord(value) || typeof value.slot !== "string" || !(value.slot in mediaFiles)) return null;
  const slot = value.slot as WardrobePublicMediaSlot;
  if (slot === "MODEL_FRONT" && !approvedModelFrontSlugs.has(slug)) return null;
  if (
    supplementalModelSlots.includes(slot as (typeof supplementalModelSlots)[number])
    && !getApprovedModelSupplementalSlots(slug).includes(
      slot as (typeof supplementalModelSlots)[number],
    )
  ) return null;
  const src = safeText(value.src, 240);
  const expected = `/shop/products/${slug}/${mediaFiles[slot]}`;
  const expectedModelAnchorId = getApprovedModelAnchorId(slug, slot);
  const modelAnchorId = safeText(value.modelAnchorId, 40);
  if (src !== expected) return null;
  if (expectedModelAnchorId) {
    return modelAnchorId === expectedModelAnchorId
      ? { slot, src, modelAnchorId: expectedModelAnchorId }
      : null;
  }
  return value.modelAnchorId === undefined ? { slot, src } : null;
}

interface ParseProductOptions {
  stripLegacyModelBack?: boolean;
  migrateModelContract?: boolean;
}

function migrateApprovedModelContract(media: unknown[], slug: string) {
  const migrated = media.map((item) => {
    if (!isRecord(item) || typeof item.slot !== "string" || !(item.slot in mediaFiles)) return item;
    const slot = item.slot as WardrobePublicMediaSlot;
    const modelAnchorId = getApprovedModelAnchorId(slug, slot);
    const rest = Object.fromEntries(
      Object.entries(item).filter(([key]) => key !== "modelAnchorId"),
    );
    return modelAnchorId ? { ...rest, modelAnchorId } : rest;
  });
  if (
    approvedModelFrontSlugs.has(slug)
    && !migrated.some((item) => isRecord(item) && item.slot === "MODEL_FRONT")
  ) {
    const front = {
      slot: "MODEL_FRONT",
      src: `/shop/products/${slug}/${mediaFiles.MODEL_FRONT}`,
      modelAnchorId: getApprovedModelAnchorId(slug, "MODEL_FRONT"),
    };
    const detailIndex = migrated.findIndex(
      (item) => isRecord(item) && ["FABRIC_DETAIL", "CONSTRUCTION_DETAIL"].includes(String(item.slot)),
    );
    migrated.splice(detailIndex < 0 ? migrated.length : detailIndex, 0, front);
  }
  const approvedSupplementalSlots = getApprovedModelSupplementalSlots(slug);
  const canonicalMedia = migrated.filter((item) =>
    !isRecord(item)
    || !approvedSupplementalSlots.includes(
      item.slot as (typeof approvedSupplementalSlots)[number],
    )
  );
  for (const slot of approvedSupplementalSlots) {
    canonicalMedia.push({
      slot,
      src: `/shop/products/${slug}/${mediaFiles[slot]}`,
      modelAnchorId: getApprovedModelAnchorId(slug, slot),
    });
  }
  return canonicalMedia;
}

function parseProduct(
  value: unknown,
  options: ParseProductOptions = {},
): WardrobePublicProduct | null {
  if (!isRecord(value)) return null;
  const slug = safeSlug(value.slug);
  const rawSku = safeText(value.sku, 80);
  const sku = rawSku ? canonicalCatalogueSku(rawSku) : null;
  const name = safeText(value.name, 160);
  const taggedSize = safeText(value.taggedSize, 80);
  const fit = safeText(value.fit, 160);
  const condition = safeText(value.condition, 160);
  const colour = safeText(value.colour, 100);
  const drop = safeText(value.drop, 100);
  const note = safeText(value.note, 500);
  const story = safeText(value.story, 1200);
  const price = typeof value.price === "number" && Number.isFinite(value.price) && value.price >= 0
    ? value.price
    : null;
  const expectedModelAnchor = getWardrobePublicModelAnchor(slug ?? "");
  const modelAnchor = options.migrateModelContract
    ? expectedModelAnchor
    : isRecord(value.modelAnchor)
      && value.modelAnchor.id === expectedModelAnchor.id
      && (
        expectedModelAnchor.id === "lulu-v3"
          ? value.modelAnchor.src === undefined
          : value.modelAnchor.src === expectedModelAnchor.src
      )
        ? expectedModelAnchor
        : null;
  const details = Array.isArray(value.details)
    ? value.details.flatMap((detail) => {
        const parsed = safeText(detail, 180);
        return parsed ? [parsed] : [];
      }).slice(0, 12)
    : [];
  const measurements = Array.isArray(value.measurements)
    ? value.measurements.flatMap((measurement) => {
        if (!isRecord(measurement)) return [];
        const label = safeText(measurement.label, 80);
        const measurementValue = safeText(measurement.value, 100);
        return label && measurementValue ? [{ label, value: measurementValue }] : [];
      }).slice(0, 20)
    : [];

  if (
    !slug
    || !sku
    || !name
    || !taggedSize
    || !fit
    || !condition
    || !colour
    || !drop
    || !note
    || !story
    || price === null
    || !categories.has(String(value.category))
    || !availabilities.has(String(value.availability))
    || !tones.has(String(value.tone))
    || !silhouettes.has(String(value.silhouette))
    || !modelAnchor
    || !Array.isArray(value.media)
  ) {
    return null;
  }

  if (!options.stripLegacyModelBack && value.media.some((item) => isRecord(item) && item.slot === "MODEL_BACK")) {
    return null;
  }
  const revokedModelSafeMedia = revokedModelFrontSlugs.has(slug)
    ? value.media.filter((item) => !(isRecord(item) && item.slot === "MODEL_FRONT"))
    : value.media;
  if (
    !approvedModelFrontSlugs.has(slug)
    && revokedModelSafeMedia.some((item) => isRecord(item) && item.slot === "MODEL_FRONT")
  ) {
    return null;
  }
  const legacySafeMedia = options.stripLegacyModelBack
    ? revokedModelSafeMedia.filter((item) => !(isRecord(item) && item.slot === "MODEL_BACK"))
    : revokedModelSafeMedia;
  const mediaCandidates = options.migrateModelContract
    ? migrateApprovedModelContract(legacySafeMedia, slug)
    : legacySafeMedia;
  const media = mediaCandidates.flatMap((item) => {
    const parsed = parseMedia(item, slug);
    return parsed ? [parsed] : [];
  });
  if (media.length !== mediaCandidates.length) return null;
  const uniqueSlots = new Set(media.map((item) => item.slot));
  const hasRequiredFrames = requiredMediaSlots.every((slot) => uniqueSlots.has(slot));
  const hasTruthfulDetail = uniqueSlots.has("FABRIC_DETAIL") !== uniqueSlots.has("CONSTRUCTION_DETAIL");
  const approvedSupplementalSlots = getApprovedModelSupplementalSlots(slug);
  const hasApprovedSupplementalViews = approvedSupplementalSlots.every((slot) =>
    uniqueSlots.has(slot)
  );
  const expectedCount = requiredMediaSlots.length + 1
    + (uniqueSlots.has("MODEL_FRONT") ? 1 : 0)
    + approvedSupplementalSlots.length;
  if (
    !hasRequiredFrames
    || !hasTruthfulDetail
    || !hasApprovedSupplementalViews
    || media.length !== expectedCount
    || uniqueSlots.size !== expectedCount
  ) return null;

  return {
    slug,
    sku,
    name,
    category: value.category as WardrobePublicProduct["category"],
    price,
    taggedSize,
    fit,
    condition,
    colour,
    availability: value.availability as WardrobePublicProduct["availability"],
    drop,
    tone: value.tone as WardrobePublicProduct["tone"],
    silhouette: value.silhouette as WardrobePublicProduct["silhouette"],
    note,
    story,
    details,
    measurements,
    modelAnchor,
    media,
  };
}

export function parseStoredWardrobePublicView(raw: string | null): WardrobePublicViewSnapshot {
  if (!raw) return { products: [], managedSlugs: [] };
  try {
    const envelope = JSON.parse(raw) as unknown;
    if (!isRecord(envelope) || !Array.isArray(envelope.data)) {
      return { products: [], managedSlugs: [] };
    }
    const migrateVersion2 = envelope.version === 2;
    const migrateVersion3 = envelope.version === 3;
    const migrateVersion4 = envelope.version === 4;
    const migrateVersion5 = envelope.version === 5;
    const migrateVersion6 = envelope.version === 6;
    const migrateVersion7 = envelope.version === 7;
    const migrateVersion8 = envelope.version === 8;
    const migrateVersion9 = envelope.version === 9;
    const migrateVersion10 = envelope.version === 10;
    const migrateVersion11 = envelope.version === 11;
    const migrateVersion12 = envelope.version === 12;
    const migrateVersion13 = envelope.version === 13;
    const migrateVersion14 = envelope.version === 14;
    const migrateVersion15 = envelope.version === 15;
    const migrateVersion16 = envelope.version === 16;
    const migrateVersion17 = envelope.version === 17;
    if (
      envelope.version !== WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION
      && !migrateVersion2
      && !migrateVersion3
      && !migrateVersion4
      && !migrateVersion5
      && !migrateVersion6
      && !migrateVersion7
      && !migrateVersion8
      && !migrateVersion9
      && !migrateVersion10
      && !migrateVersion11
      && !migrateVersion12
      && !migrateVersion13
      && !migrateVersion14
      && !migrateVersion15
      && !migrateVersion16
      && !migrateVersion17
    ) {
      return { products: [], managedSlugs: [] };
    }
    const parsed = envelope.data.flatMap((candidate) => {
      const product = parseProduct(candidate, {
        stripLegacyModelBack: migrateVersion2,
        migrateModelContract: envelope.version !== WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
      });
      return product ? [product] : [];
    });
    const products = parsed.filter((product, index) =>
      parsed.findIndex((candidate) => candidate.slug === product.slug) === index,
    );
    const managedCandidates = Array.isArray(envelope.managedSlugs)
      ? envelope.managedSlugs
      : products.map((product) => product.slug);
    const managedSlugs = [...new Set(managedCandidates.flatMap((candidate) => {
      const slug = safeSlug(candidate);
      return slug ? [slug] : [];
    }))];
    return { products, managedSlugs };
  } catch {
    return { products: [], managedSlugs: [] };
  }
}

function browserStorage() {
  if (typeof window === "undefined") {
    throw new Error("The wardrobe public-view browser adapter is available only after the app mounts.");
  }
  return window.localStorage;
}

export function createBrowserWardrobePublicViewRepository(): WardrobePublicViewRepository {
  return {
    async read() {
      const storage = browserStorage();
      const current = storage.getItem(WARDROBE_PUBLIC_VIEW_STORAGE_KEY);
      if (current !== null) return parseStoredWardrobePublicView(current);
      for (const previousKey of [
        PREVIOUS_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        THIRD_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        FOURTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        FIFTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        SIXTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        SEVENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        EIGHTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        NINTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        TENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        ELEVENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        TWELFTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        THIRTEENTH_OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
        EARLIEST_WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
      ]) {
        const previous = storage.getItem(previousKey);
        if (previous !== null) {
          const migrated = parseStoredWardrobePublicView(previous);
          await this.write(migrated);
          return migrated;
        }
      }
      const legacy = parseStoredWardrobePublicView(storage.getItem(LEGACY_PUBLIC_CATALOG_STORAGE_KEY));
      if (!legacy.products.length && !legacy.managedSlugs.length) return legacy;
      await this.write(legacy);
      return legacy;
    },
    async write(snapshot) {
      const safeSnapshot = parseStoredWardrobePublicView(JSON.stringify({
        version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
        data: snapshot.products,
        managedSlugs: snapshot.managedSlugs,
      } satisfies StoredWardrobePublicView));
      browserStorage().setItem(WARDROBE_PUBLIC_VIEW_STORAGE_KEY, JSON.stringify({
        version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
        data: safeSnapshot.products,
        managedSlugs: safeSnapshot.managedSlugs,
      } satisfies StoredWardrobePublicView));
      window.dispatchEvent(new CustomEvent(WARDROBE_PUBLIC_VIEW_CHANGE_EVENT, { detail: safeSnapshot }));
    },
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined;
      const receiveStorage = (event: StorageEvent) => {
        if (event.key !== WARDROBE_PUBLIC_VIEW_STORAGE_KEY) return;
        listener(parseStoredWardrobePublicView(event.newValue));
      };
      const receiveLocal = (event: Event) => {
        const detail = (event as CustomEvent<unknown>).detail;
        if (!isRecord(detail)) return;
        listener(parseStoredWardrobePublicView(JSON.stringify({
          version: WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
          data: Array.isArray(detail.products) ? detail.products : [],
          managedSlugs: Array.isArray(detail.managedSlugs) ? detail.managedSlugs : [],
        })));
      };
      window.addEventListener("storage", receiveStorage);
      window.addEventListener(WARDROBE_PUBLIC_VIEW_CHANGE_EVENT, receiveLocal);
      return () => {
        window.removeEventListener("storage", receiveStorage);
        window.removeEventListener(WARDROBE_PUBLIC_VIEW_CHANGE_EVENT, receiveLocal);
      };
    },
  };
}
