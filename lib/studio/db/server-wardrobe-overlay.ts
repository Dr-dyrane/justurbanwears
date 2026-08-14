import type { OperatorSafeWardrobeItem } from "../engine/contracts";
import {
  isPendingDirectCaptureRole,
  pendingCaptureView,
  type OperatorSafePendingCapture,
} from "../engine/pending-capture-contracts";
import type { Garment, GarmentCategory, InventoryRecord } from "../domain/entities";
import type { StudioSnapshot } from "../domain/state";
import type { StudioRepository } from "../services/contracts";

const SERVER_GARMENT_PREFIX = "studio-server-garment-";
const SERVER_INVENTORY_PREFIX = "studio-server-inventory-";

type ServerWardrobeLoader = () => Promise<OperatorSafeWardrobeItem[]>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isWardrobeItem(value: unknown): value is OperatorSafeWardrobeItem {
  if (!isRecord(value)) return false;
  return typeof value.id === "string"
    && typeof value.intakeId === "string"
    && typeof value.title === "string"
    && typeof value.category === "string"
    && typeof value.colour === "string"
    && typeof value.sizeLabel === "string"
    && typeof value.condition === "string"
    && typeof value.price === "number"
    && value.quantity === 1
    && ["DRAFT", "READY", "ARCHIVED"].includes(String(value.state))
    && (value.approvedAssetId === null || typeof value.approvedAssetId === "string")
    && typeof value.createdAt === "string"
    && typeof value.updatedAt === "string"
    && (value.directCaptures === undefined || (
      Array.isArray(value.directCaptures)
      && value.directCaptures.every(isDirectCapture)
    ));
}

function isDirectCapture(value: unknown): value is OperatorSafePendingCapture {
  return isRecord(value)
    && typeof value.id === "string"
    && isPendingDirectCaptureRole(value.role)
    && typeof value.view === "string"
    && typeof value.mimeType === "string"
    && typeof value.assetUrl === "string"
    && typeof value.approvedAt === "string";
}

function studioCategory(category: OperatorSafeWardrobeItem["category"]): GarmentCategory {
  return category === "Other" ? "Shirt" : category;
}

function garmentId(itemId: string) {
  return `${SERVER_GARMENT_PREFIX}${itemId}`;
}

function inventoryId(itemId: string) {
  return `${SERVER_INVENTORY_PREFIX}${itemId}`;
}

function mapServerGarment(item: OperatorSafeWardrobeItem): Garment {
  const approvedAssetPath = item.approvedAssetId
    ? `/api/studio/intakes/${item.intakeId}/assets/${item.approvedAssetId}` as const
    : undefined;
  const directReferences = (item.directCaptures ?? []).map((capture) => ({
    id: `pending-capture-${capture.id}`,
    view: pendingCaptureView(capture.role),
    quality: 100,
  }));
  const references = [
    ...(approvedAssetPath ? [{ id: item.approvedAssetId!, view: "FRONT" as const, quality: 100 }] : []),
    ...directReferences,
  ];
  const mediaReady = (["FRONT", "BACK", "DETAIL"] as const).every((view) =>
    references.some((reference) => reference.view === view)
  );
  return {
    id: garmentId(item.id),
    sku: `INTAKE-${item.id.slice(0, 8).toUpperCase()}`,
    title: item.title,
    category: studioCategory(item.category),
    sizeLabel: item.sizeLabel,
    estimatedFit: "Measurements confirmed before payment",
    color: item.colour,
    price: item.price,
    condition: item.condition,
    source: "Studio intake",
    notes: "",
    privateNote: "",
    publicDescription: "",
    quantity: item.state === "ARCHIVED" ? 0 : 1,
    saleEligible: false,
    measurements: [],
    classificationState: "READY",
    mediaState: mediaReady ? "READY" : approvedAssetPath ? "DRAFT" : "EMPTY",
    state: "DRAFT",
    availability: item.state === "ARCHIVED" ? "ARCHIVED" : "AVAILABLE",
    canonState: "REVIEW",
    visual: "studio",
    references,
    ...(approvedAssetPath ? {
      reviewCover: {
        src: approvedAssetPath,
        alt: `${item.title}, approved Studio intake front`,
        width: 1024,
        height: 1280,
      },
    } : {}),
    createdAt: item.createdAt,
    privateWardrobeItemId: item.id,
  };
}

function mapServerInventory(item: OperatorSafeWardrobeItem): InventoryRecord {
  return {
    id: inventoryId(item.id),
    garmentId: garmentId(item.id),
    onHand: item.state === "ARCHIVED" ? 0 : 1,
    reserved: 0,
    sold: 0,
    returned: 0,
    writeOff: item.state === "ARCHIVED" ? 1 : 0,
    state: "DRAFT",
    updatedAt: item.updatedAt,
  };
}

export function stripServerWardrobeOverlay(snapshot: StudioSnapshot): StudioSnapshot {
  return {
    ...snapshot,
    garments: snapshot.garments.filter((garment) => !garment.id.startsWith(SERVER_GARMENT_PREFIX)),
    inventory: snapshot.inventory.filter((record) => !record.id.startsWith(SERVER_INVENTORY_PREFIX)),
  };
}

export function mergeServerWardrobeOverlay(
  snapshot: StudioSnapshot,
  items: OperatorSafeWardrobeItem[],
): StudioSnapshot {
  const local = stripServerWardrobeOverlay(snapshot);
  return {
    ...local,
    garments: [...local.garments, ...items.map(mapServerGarment)],
    inventory: [...local.inventory, ...items.map(mapServerInventory)],
  };
}

export async function loadServerWardrobeItems(): Promise<OperatorSafeWardrobeItem[]> {
  try {
    const response = await fetch("/api/studio/wardrobe", {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    if (!response.ok) return [];
    const body: unknown = await response.json();
    if (!isRecord(body) || !Array.isArray(body.items)) return [];
    return body.items.filter(isWardrobeItem);
  } catch {
    return [];
  }
}

export function createServerWardrobeOverlayRepository(
  repository: StudioRepository,
  loadItems: ServerWardrobeLoader = loadServerWardrobeItems,
): StudioRepository {
  let overlay: OperatorSafeWardrobeItem[] = [];
  return {
    async read() {
      const snapshot = await repository.read();
      overlay = await loadItems();
      return mergeServerWardrobeOverlay(snapshot, overlay);
    },
    write(snapshot) {
      return repository.write(stripServerWardrobeOverlay(snapshot));
    },
    subscribe(listener) {
      return repository.subscribe((snapshot) => listener(mergeServerWardrobeOverlay(snapshot, overlay)));
    },
  };
}
