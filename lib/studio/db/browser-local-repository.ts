import type { Garment, StudioModel } from "../domain/entities";
import {
  WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION,
} from "../../wardrobe-public-view/domain/entities";
import {
  WARDROBE_PUBLIC_VIEW_STORAGE_KEY,
  createBrowserWardrobePublicViewRepository,
} from "../../wardrobe-public-view/db/browser-repository";
import {
  STUDIO_STATE_SCHEMA_VERSION,
  createDefaultModel,
  createEmptyStudioSnapshot,
  type StoredStudioStateV2,
  type StudioSnapshot,
} from "../domain/state";
import type { StudioRepository, WardrobePublicViewPort } from "../services/contracts";
import { mergeWardrobeAuthoritySeeds } from "../seeds/wardrobe-authority";

export const STUDIO_STORAGE_KEY = "justurban-wears:studio:v2";
export const LEGACY_STUDIO_STORAGE_KEY = "justurban-wears:studio:v1";
export const WARDROBE_PUBLIC_VIEW_PROJECTION_SCHEMA_VERSION = WARDROBE_PUBLIC_VIEW_SCHEMA_VERSION;
export { WARDROBE_PUBLIC_VIEW_STORAGE_KEY };

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseJson(raw: string | null): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

function hasId(value: unknown): value is UnknownRecord & { id: string } {
  return isRecord(value) && typeof value.id === "string" && Boolean(value.id);
}

function parseCurrentSnapshot(value: unknown): StudioSnapshot | null {
  if (!isRecord(value) || typeof value.defaultModelId !== "string") return null;
  const collectionKeys = ["models", "garments", "listings", "inventory", "orders", "returns", "shoots"] as const;
  if (collectionKeys.some((key) => !Array.isArray(value[key]))) return null;
  if (collectionKeys.some((key) => (value[key] as unknown[]).some((item) => !hasId(item)))) return null;

  const snapshot = value as unknown as StudioSnapshot;
  if (!snapshot.models.some((model) => model.id === snapshot.defaultModelId)) return null;
  const approvedDefault = createDefaultModel();
  const models = snapshot.models.map((model) => {
    if (model.id !== snapshot.defaultModelId) return model;
    const styling: UnknownRecord = isRecord(model.styling) ? model.styling : {};
    return {
      ...model,
      version: approvedDefault.version,
      approvedAt: model.approvedAt || approvedDefault.approvedAt,
      styling: {
        hair: typeof styling.hair === "string" && styling.hair.trim() ? styling.hair : approvedDefault.styling.hair,
        makeup: typeof styling.makeup === "string" && styling.makeup.trim() ? styling.makeup : approvedDefault.styling.makeup,
        direction: typeof styling.direction === "string" && styling.direction.trim() ? styling.direction : approvedDefault.styling.direction,
      },
      allowedVariance: model.allowedVariance?.length ? model.allowedVariance : approvedDefault.allowedVariance,
      forbiddenDrift: model.forbiddenDrift?.length ? model.forbiddenDrift : approvedDefault.forbiddenDrift,
    };
  });
  return {
    defaultModelId: snapshot.defaultModelId,
    models,
    garments: snapshot.garments,
    listings: snapshot.listings,
    inventory: snapshot.inventory,
    orders: snapshot.orders,
    returns: snapshot.returns,
    shoots: snapshot.shoots,
  };
}

export function parseStoredStudioState(raw: string | null): StudioSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== STUDIO_STATE_SCHEMA_VERSION) return null;
  return parseCurrentSnapshot(value.data);
}

function migrateModel(value: unknown, isDefault: boolean): StudioModel | null {
  if (!hasId(value) || typeof value.name !== "string") return null;
  const base = createDefaultModel();
  const ready = value.ready === true;
  return {
    ...base,
    id: value.id,
    name: value.name,
    preferredName: value.name,
    version: isDefault ? base.version : `${value.name.toUpperCase()} MODEL 01`,
    isDefault,
    state: ready ? "READY" : "DRAFT",
    status: ready ? "APPROVED" : "REVIEW",
    completeness: ready ? 100 : 0,
    readiness: {
      identityApproved: ready,
      consentConfirmed: ready,
      stylingComplete: ready,
    },
  };
}

function migrateGarment(value: unknown, now: string): Garment | null {
  if (!hasId(value) || typeof value.sku !== "string" || typeof value.title !== "string") return null;
  return {
    id: value.id,
    sku: value.sku,
    title: value.title,
    category: "Dress",
    sizeLabel: "Unclassified",
    estimatedFit: "To measure",
    color: "Unclassified",
    price: 0,
    condition: "To inspect",
    source: "Migrated local record",
    notes: "",
    privateNote: "",
    publicDescription: "",
    quantity: 0,
    saleEligible: false,
    measurements: [],
    classificationState: "DRAFT",
    mediaState: "EMPTY",
    state: "DRAFT",
    availability: "ARCHIVED",
    canonState: "DRAFT",
    visual: "umber",
    references: [],
    createdAt: now,
  };
}

export function migrateLegacyStudioState(raw: string | null): StudioSnapshot | null {
  const value = parseJson(raw);
  if (!isRecord(value) || value.version !== 1 || !isRecord(value.data)) return null;
  const legacyModels = Array.isArray(value.data.models) ? value.data.models : [];
  const fallback = createDefaultModel();
  const defaultModelId = typeof value.data.defaultModelId === "string"
    ? value.data.defaultModelId
    : hasId(legacyModels[0])
      ? legacyModels[0].id
      : fallback.id;
  const models = legacyModels
    .map((candidate) => migrateModel(candidate, hasId(candidate) && candidate.id === defaultModelId))
    .filter((model): model is StudioModel => Boolean(model));
  const safeModels = models.length ? models : [fallback];
  const safeDefaultId = safeModels.some((model) => model.id === defaultModelId)
    ? defaultModelId
    : safeModels[0].id;
  const garments = (Array.isArray(value.data.garments) ? value.data.garments : [])
    .map((candidate) => migrateGarment(candidate, "Migrated locally"))
    .filter((garment): garment is Garment => Boolean(garment));

  return {
    ...createEmptyStudioSnapshot(),
    defaultModelId: safeDefaultId,
    models: safeModels.map((model) => ({ ...model, isDefault: model.id === safeDefaultId })),
    garments,
  };
}

function browserStorage() {
  if (typeof window === "undefined") {
    throw new Error("Browser storage is available only after Studio mounts.");
  }
  return window.localStorage;
}

export function createBrowserLocalStudioRepository(): StudioRepository {
  return {
    async read() {
      const storage = browserStorage();
      const currentRaw = storage.getItem(STUDIO_STORAGE_KEY);
      if (currentRaw) {
        const restored = parseStoredStudioState(currentRaw) ?? createEmptyStudioSnapshot();
        const merged = mergeWardrobeAuthoritySeeds(restored);
        if (JSON.stringify(merged) !== JSON.stringify(restored)) await this.write(merged);
        return merged;
      }

      const migrated = migrateLegacyStudioState(storage.getItem(LEGACY_STUDIO_STORAGE_KEY));
      const seeded = mergeWardrobeAuthoritySeeds(migrated ?? createEmptyStudioSnapshot());
      await this.write(seeded);
      return seeded;
    },
    async write(snapshot) {
      const envelope: StoredStudioStateV2 = {
        version: STUDIO_STATE_SCHEMA_VERSION,
        data: snapshot,
      };
      browserStorage().setItem(STUDIO_STORAGE_KEY, JSON.stringify(envelope));
    },
    subscribe(listener) {
      if (typeof window === "undefined") return () => undefined;
      const receiveStorage = (event: StorageEvent) => {
        if (event.key !== STUDIO_STORAGE_KEY || !event.newValue) return;
        const snapshot = parseStoredStudioState(event.newValue);
        if (snapshot) listener(mergeWardrobeAuthoritySeeds(snapshot));
      };
      window.addEventListener("storage", receiveStorage);
      return () => window.removeEventListener("storage", receiveStorage);
    },
  };
}

export function createBrowserWardrobePublicViewPort(): WardrobePublicViewPort {
  const repository = createBrowserWardrobePublicViewRepository();
  return {
    write: (products, managedSlugs) => repository.write({ products, managedSlugs }),
  };
}
