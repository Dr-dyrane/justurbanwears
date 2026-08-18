import type { OperatorSafeWardrobeItem } from "../engine/contracts";
import {
  isPendingDirectCaptureRole,
  pendingCaptureView,
  type OperatorSafePendingCapture,
} from "../engine/pending-capture-contracts";
import type { Garment, GarmentCategory, InventoryRecord, StudioListing } from "../domain/entities";
import type { StudioSnapshot } from "../domain/state";
import type { StudioRepository } from "../services/contracts";

const SERVER_GARMENT_PREFIX = "studio-server-garment-";
const SERVER_INVENTORY_PREFIX = "studio-server-inventory-";
const SERVER_LISTING_PREFIX = "studio-server-listing-";

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
    ))
    && (value.publication === undefined || isPublication(value.publication, value.id));
}

function isPublication(value: unknown, wardrobeItemId: string) {
  if (!isRecord(value)) return false;
  const slug = typeof value.slug === "string" ? value.slug : "";
  return typeof value.publicationId === "string"
    && value.wardrobeItemId === wardrobeItemId
    && typeof value.sku === "string"
    && /^JUW-[0-9]{3,}$/.test(value.sku)
    && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)
    && ["STUDIO_NATIVE", "CATALOGUE_ADOPTED"].includes(String(value.origin))
    && ["PUBLISHED", "UNPUBLISHED", "ARCHIVED"].includes(String(value.state))
    && typeof value.publishedAt === "string"
    && Number.isFinite(Date.parse(value.publishedAt))
    && value.shopUrl === `/shop/products/${slug}`
    && (value.inventory === undefined || isPublicationInventory(value.inventory));
}

function isPublicationInventory(value: unknown) {
  if (!isRecord(value)) return false;
  return ["AVAILABLE", "RESERVED", "SOLD", "ARCHIVED"].includes(String(value.availability))
    && ["onHand", "reserved", "sold", "returned", "writeOff"].every((key) => Number.isInteger(value[key]))
    && typeof value.updatedAt === "string"
    && Number.isFinite(Date.parse(value.updatedAt));
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

function shopCategory(category: OperatorSafeWardrobeItem["category"], fallback: NonNullable<StudioListing["publicProjection"]>["category"]) {
  if (category === "Dress") return "Dresses" as const;
  if (category === "Set") return "Sets" as const;
  if (category === "Shirt") return "Shirts" as const;
  if (category === "Skirt") return "Skirts" as const;
  if (category === "Knitwear" || category === "Trousers") return category;
  return fallback;
}

function garmentId(itemId: string) {
  return `${SERVER_GARMENT_PREFIX}${itemId}`;
}

function inventoryId(itemId: string) {
  return `${SERVER_INVENTORY_PREFIX}${itemId}`;
}

function listingId(itemId: string) {
  return `${SERVER_LISTING_PREFIX}${itemId}`;
}

function lifecycleState(item: OperatorSafeWardrobeItem): Garment["state"] {
  if (
    item.state === "ARCHIVED"
    || item.publication?.state === "ARCHIVED"
    || item.publication?.inventory?.availability === "ARCHIVED"
  ) return "CANCELLED";
  if (item.publication?.inventory?.availability === "SOLD") return "SOLD";
  if (item.publication?.inventory?.availability === "RESERVED") return "RESERVED";
  if (item.publication?.state === "PUBLISHED") return "PUBLISHED";
  return item.state === "DRAFT" ? "DRAFT" : "READY";
}

function mapServerGarment(item: OperatorSafeWardrobeItem, legacy?: Garment): Garment {
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
    ...legacy,
    id: garmentId(item.id),
    sku: item.publication?.sku ?? `INTAKE-${item.id.slice(0, 8).toUpperCase()}`,
    title: item.title,
    category: studioCategory(item.category),
    sizeLabel: item.sizeLabel,
    estimatedFit: "Measurements confirmed before payment",
    color: item.colour,
    price: item.price,
    condition: item.condition,
    source: legacy?.source ?? "Studio intake",
    notes: legacy?.notes ?? "",
    privateNote: legacy?.privateNote ?? "",
    publicDescription: legacy?.publicDescription ?? "",
    quantity: item.state === "ARCHIVED" ? 0 : 1,
    saleEligible: item.publication?.state === "PUBLISHED",
    measurements: legacy?.measurements ?? [],
    classificationState: "READY",
    mediaState: legacy?.mediaState ?? (mediaReady ? "READY" : approvedAssetPath ? "DRAFT" : "EMPTY"),
    state: lifecycleState(item),
    availability: item.publication?.inventory?.availability ?? (item.state === "ARCHIVED" ? "ARCHIVED" : "AVAILABLE"),
    canonState: item.publication ? "APPROVED" : "REVIEW",
    visual: legacy?.visual ?? "studio",
    references: legacy?.references.length ? legacy.references : references,
    ...(approvedAssetPath ? {
      reviewCover: {
        src: approvedAssetPath,
        alt: `${item.title}, approved Studio intake front`,
        width: 1024,
        height: 1280,
      },
    } : {}),
    createdAt: legacy?.createdAt ?? item.createdAt,
    privateWardrobeItemId: item.id,
    ...(item.publication ? { dynamicPublication: {
      publicationId: item.publication.publicationId,
      wardrobeItemId: item.publication.wardrobeItemId,
      sku: item.publication.sku,
      slug: item.publication.slug,
      origin: item.publication.origin,
      state: item.publication.state,
      publishedAt: item.publication.publishedAt,
      shopUrl: item.publication.shopUrl,
    } } : {}),
    ...(legacy ? { id: legacy.id, reviewCover: legacy.reviewCover } : {}),
  };
}

function mapServerListing(item: OperatorSafeWardrobeItem, garment: Garment, legacy?: StudioListing): StudioListing | null {
  if (!item.publication) return null;
  const state = lifecycleState(item);
  const publicProjection = legacy?.publicProjection ? {
    ...legacy.publicProjection,
    name: item.title,
    category: shopCategory(item.category, legacy.publicProjection.category),
    price: item.price,
    taggedSize: item.sizeLabel,
    condition: item.condition,
    colour: item.colour,
    availability: item.publication.inventory?.availability === "ARCHIVED"
      ? legacy.publicProjection.availability
      : item.publication.inventory?.availability ?? legacy.publicProjection.availability,
  } : undefined;
  return {
    ...legacy,
    id: legacy?.id ?? listingId(item.id),
    garmentId: garment.id,
    modelId: legacy?.modelId ?? "",
    slug: item.publication.slug,
    title: item.title,
    description: `${item.colour} · ${item.condition}`,
    price: item.price,
    state,
    createdAt: legacy?.createdAt ?? item.createdAt,
    publishedAt: item.publication.publishedAt,
    ...(publicProjection ? { publicProjection } : {}),
  };
}

function mapServerInventory(item: OperatorSafeWardrobeItem, garment: Garment, listing: StudioListing | null, legacy?: InventoryRecord): InventoryRecord {
  const inventory = item.publication?.inventory;
  return {
    ...legacy,
    id: legacy?.id ?? inventoryId(item.id),
    garmentId: garment.id,
    ...(listing ? { listingId: listing.id } : {}),
    onHand: inventory?.onHand ?? (item.state === "ARCHIVED" ? 0 : 1),
    reserved: inventory?.reserved ?? 0,
    sold: inventory?.sold ?? 0,
    returned: inventory?.returned ?? 0,
    writeOff: inventory?.writeOff ?? (item.state === "ARCHIVED" ? 1 : 0),
    state: lifecycleState(item),
    updatedAt: inventory?.updatedAt ?? item.updatedAt,
  };
}

export function stripServerWardrobeOverlay(snapshot: StudioSnapshot): StudioSnapshot {
  const serverGarmentIds = new Set(snapshot.garments
    .filter((garment) => garment.id.startsWith(SERVER_GARMENT_PREFIX) || Boolean(garment.privateWardrobeItemId))
    .map((garment) => garment.id));
  return {
    ...snapshot,
    garments: snapshot.garments.filter((garment) => !serverGarmentIds.has(garment.id)),
    inventory: snapshot.inventory.filter((record) => !record.id.startsWith(SERVER_INVENTORY_PREFIX) && !serverGarmentIds.has(record.garmentId)),
    listings: snapshot.listings.filter((listing) => !listing.id.startsWith(SERVER_LISTING_PREFIX) && !serverGarmentIds.has(listing.garmentId)),
  };
}

export function mergeServerWardrobeOverlay(
  snapshot: StudioSnapshot,
  items: OperatorSafeWardrobeItem[],
): StudioSnapshot {
  const local = stripServerWardrobeOverlay(snapshot);
  const garments = [...local.garments];
  const listings = [...local.listings];
  const inventory = [...local.inventory];
  for (const item of items) {
    const legacyGarment = item.publication?.origin === "CATALOGUE_ADOPTED"
      ? garments.find((garment) => garment.sku === item.publication?.sku)
      : undefined;
    const legacyListing = legacyGarment
      ? listings.find((listing) => listing.garmentId === legacyGarment.id || listing.slug === item.publication?.slug)
      : undefined;
    const legacyInventory = legacyGarment
      ? inventory.find((record) => record.garmentId === legacyGarment.id || record.listingId === legacyListing?.id)
      : undefined;
    const garment = mapServerGarment(item, legacyGarment);
    const listing = mapServerListing(item, garment, legacyListing);
    const stock = mapServerInventory(item, garment, listing, legacyInventory);
    if (legacyGarment) garments[garments.indexOf(legacyGarment)] = garment;
    else garments.push(garment);
    if (listing) {
      if (legacyListing) listings[listings.indexOf(legacyListing)] = listing;
      else listings.push(listing);
    }
    if (legacyInventory) inventory[inventory.indexOf(legacyInventory)] = stock;
    else inventory.push(stock);
  }
  return {
    ...local,
    garments,
    inventory,
    listings,
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
