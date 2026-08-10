import {
  WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
  type StoredWardrobePublicView,
  type WardrobePublicMedia,
  type WardrobePublicMediaSlot,
  type WardrobePublicProduct,
  type WardrobePublicViewSnapshot,
} from "../domain/entities";
import {
  WARDROBE_APPROVED_MODEL_FRONT_SLUGS,
  WARDROBE_APPROVED_MODEL_MULTI_VIEW_SLUGS,
} from "../seeds";
import type { WardrobePublicViewRepository } from "../services/contracts";

export const WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v6";
export const WARDROBE_PUBLIC_VIEW_CHANGE_EVENT = "justurban-wears:wardrobe-public-view:changed";
export const PREVIOUS_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v5";
export const OLDER_WARDROBE_PUBLIC_VIEW_STORAGE_KEY = "justurban-wears:wardrobe-public-view:v4";
export const LEGACY_PUBLIC_CATALOG_STORAGE_KEY = "justurban-wears:catalog-projections:v2";

type UnknownRecord = Record<string, unknown>;

const categories = new Set(["Dresses", "Shirts", "Knitwear", "Skirts", "Trousers"]);
const availabilities = new Set(["AVAILABLE", "RESERVED", "SOLD"]);
const tones = new Set(["coral", "indigo", "moss", "ivory", "cocoa", "salmon"]);
const silhouettes = new Set(["dress", "shirt", "knit", "skirt", "trouser"]);
const requiredMediaSlots: WardrobePublicMediaSlot[] = [
  "GARMENT_FRONT",
  "GARMENT_BACK",
  "MANNEQUIN_FRONT",
  "FABRIC_DETAIL",
];
const mediaFiles: Record<WardrobePublicMediaSlot, string> = {
  GARMENT_FRONT: "01-garment-front.webp",
  GARMENT_BACK: "02-garment-back.webp",
  MANNEQUIN_FRONT: "03-mannequin-front.webp",
  MODEL_FRONT: "04-model-front.webp",
  MODEL_LEFT_PROFILE: "07-model-left-profile.webp",
  MODEL_REAR_THREE_QUARTER: "05-model-rear-three-quarter.webp",
  FABRIC_DETAIL: "06-fabric-detail.webp",
};
const approvedModelFrontSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_FRONT_SLUGS);
const approvedModelMultiViewSlugs = new Set<string>(WARDROBE_APPROVED_MODEL_MULTI_VIEW_SLUGS);
const supplementalModelSlots = [
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
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
    && !approvedModelMultiViewSlugs.has(slug)
  ) return null;
  const src = safeText(value.src, 240);
  const expected = `/shop/products/${slug}/${mediaFiles[slot]}`;
  return src === expected ? { slot, src } : null;
}

interface ParseProductOptions {
  stripLegacyModelBack?: boolean;
  addApprovedModelViews?: boolean;
}

function addApprovedModelViews(media: unknown[], slug: string) {
  if (!approvedModelMultiViewSlugs.has(slug)) return media;
  const migrated = [...media];
  for (const slot of supplementalModelSlots) {
    if (migrated.some((item) => isRecord(item) && item.slot === slot)) continue;
    migrated.push({ slot, src: `/shop/products/${slug}/${mediaFiles[slot]}` });
  }
  return migrated;
}

function parseProduct(
  value: unknown,
  options: ParseProductOptions = {},
): WardrobePublicProduct | null {
  if (!isRecord(value)) return null;
  const slug = safeSlug(value.slug);
  const sku = safeText(value.sku, 80);
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
  const modelAnchor = isRecord(value.modelAnchor)
    && value.modelAnchor.id === "lulu-v2"
    && value.modelAnchor.src === "/shop/model/lulu-v2-approved.png"
      ? { id: "lulu-v2" as const, src: "/shop/model/lulu-v2-approved.png" as const }
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
  if (
    !approvedModelFrontSlugs.has(slug)
    && value.media.some((item) => isRecord(item) && item.slot === "MODEL_FRONT")
  ) {
    return null;
  }
  const legacySafeMedia = options.stripLegacyModelBack
    ? value.media.filter((item) => !(isRecord(item) && item.slot === "MODEL_BACK"))
    : value.media;
  const mediaCandidates = options.addApprovedModelViews
    ? addApprovedModelViews(legacySafeMedia, slug)
    : legacySafeMedia;
  const media = mediaCandidates.flatMap((item) => {
    const parsed = parseMedia(item, slug);
    return parsed ? [parsed] : [];
  });
  if (media.length !== mediaCandidates.length) return null;
  const uniqueSlots = new Set(media.map((item) => item.slot));
  const hasRequiredFrames = requiredMediaSlots.every((slot) => uniqueSlots.has(slot));
  const hasApprovedMultiView = approvedModelMultiViewSlugs.has(slug)
    && uniqueSlots.has("MODEL_FRONT")
    && supplementalModelSlots.every((slot) => uniqueSlots.has(slot));
  const expectedCount = requiredMediaSlots.length
    + (uniqueSlots.has("MODEL_FRONT") ? 1 : 0)
    + (hasApprovedMultiView ? supplementalModelSlots.length : 0);
  if (
    !hasRequiredFrames
    || (approvedModelMultiViewSlugs.has(slug) && !hasApprovedMultiView)
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
    if (
      envelope.version !== WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION
      && !migrateVersion2
      && !migrateVersion3
      && !migrateVersion4
      && !migrateVersion5
    ) {
      return { products: [], managedSlugs: [] };
    }
    const parsed = envelope.data.flatMap((candidate) => {
      const product = parseProduct(candidate, {
        stripLegacyModelBack: migrateVersion2,
        addApprovedModelViews: migrateVersion2 || migrateVersion3 || migrateVersion4 || migrateVersion5,
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
