import type {
  Garment,
  InventoryRecord,
  ListingUpdateInput,
  ModelReference,
  ModelUpdateInput,
  ReturnDisposition,
  ReviewDecision,
  Shoot,
  StudioListing,
  StudioModel,
  StudioOrder,
  StudioReturn,
} from "../domain/entities";
import {
  availableStock,
  everyGateReady,
  garmentReadiness,
  listingReadiness,
  modelReadiness,
} from "../domain/readiness";
import {
  createInitialStudioState,
  type StudioMachineState,
  type StudioSnapshot,
} from "../domain/state";
import { createWardrobePublicProduct } from "../projections/public-listing";

export type StudioCommand =
  | { type: "HYDRATION_REQUESTED" }
  | { type: "HYDRATION_SUCCEEDED"; snapshot: StudioSnapshot }
  | { type: "HYDRATION_FAILED" }
  | { type: "EXTERNAL_STATE_RECEIVED"; snapshot: StudioSnapshot }
  | { type: "PERSISTENCE_FAILED" }
  | { type: "MODEL_CREATED"; model: StudioModel }
  | { type: "MODEL_UPDATED"; id: string; update: ModelUpdateInput }
  | { type: "IDENTITY_REFERENCES_ADDED"; id: string; references: ModelReference[] }
  | { type: "GARMENT_CREATED"; garment: Garment; inventory: InventoryRecord }
  | { type: "GARMENT_MEDIA_ADDED"; id: string; references: Garment["references"] }
  | { type: "GARMENT_READY_REQUESTED"; id: string }
  | { type: "GARMENT_APPROVED"; id: string }
  | { type: "LISTING_DRAFTED"; listing: StudioListing }
  | { type: "LISTING_UPDATED"; id: string; update: ListingUpdateInput }
  | { type: "LISTING_READY_REQUESTED"; id: string }
  | { type: "LISTING_PUBLISHED"; id: string; publishedAt: string }
  | { type: "ORDER_RESERVED"; order: StudioOrder }
  | { type: "ORDER_FULFILLED"; id: string; fulfilledAt: string }
  | { type: "RETURN_OPENED"; returnCase: StudioReturn }
  | { type: "RETURN_DISPOSED"; id: string; disposition: ReturnDisposition; resolvedAt: string }
  | { type: "SHOOT_CREATED"; shoot: Shoot }
  | {
      type: "GENERATION_REVIEWED";
      generationId: string;
      decision: ReviewDecision;
      reasons: string[];
      note?: string;
      reviewedAt: string;
    }
  | { type: "HERO_SELECTED"; generationId: string };

function persistentUpdate(
  state: StudioMachineState,
  update: Partial<StudioSnapshot>,
): StudioMachineState {
  return {
    ...state,
    ...update,
    lastError: undefined,
    persistenceRevision: state.persistenceRevision + 1,
  };
}

function applySnapshot(
  state: StudioMachineState,
  snapshot: StudioSnapshot,
): StudioMachineState {
  return {
    ...state,
    ...snapshot,
    lastError: undefined,
  };
}

function updateProjectionAvailability(
  listing: StudioListing,
  availability: "AVAILABLE" | "RESERVED" | "SOLD",
) {
  return listing.publicProjection
    ? { ...listing.publicProjection, availability }
    : listing.publicProjection;
}

function normalizedModel(model: StudioModel, update: ModelUpdateInput): StudioModel {
  const styling = { ...model.styling, ...update.styling };
  const readiness = { ...model.readiness, ...update.readiness };
  const next: StudioModel = {
    ...model,
    name: update.name?.trim() || model.name,
    preferredName: update.name?.trim() || model.preferredName,
    styling,
    readiness,
  };
  const gates = modelReadiness(next);
  const completeCount = gates.filter((gate) => gate.ready).length;
  const ready = everyGateReady(gates);
  return {
    ...next,
    state: ready ? "READY" : "DRAFT",
    status: ready ? "APPROVED" : "REVIEW",
    completeness: Math.round((completeCount / gates.length) * 100),
    bodyReferenceStatus: readiness.identityApproved ? "COMPLETE" : "MISSING",
    hairReferenceStatus: readiness.identityApproved ? "COMPLETE" : "MISSING",
    consent: {
      ...next.consent,
      status: readiness.consentConfirmed ? "CONFIRMED" : "WITHDRAWN",
    },
  };
}

export function studioReducer(
  state: StudioMachineState,
  command: StudioCommand,
): StudioMachineState {
  switch (command.type) {
    case "HYDRATION_REQUESTED":
      return { ...state, hydration: "restoring" };
    case "HYDRATION_SUCCEEDED":
      return {
        ...applySnapshot(state, command.snapshot),
        hydration: "ready",
        persistence: "available",
      };
    case "HYDRATION_FAILED":
      return {
        ...state,
        hydration: "degraded",
        persistence: "unavailable",
        lastError: "Local Studio storage is unavailable.",
      };
    case "EXTERNAL_STATE_RECEIVED":
      return {
        ...applySnapshot(state, command.snapshot),
        hydration: "ready",
      };
    case "PERSISTENCE_FAILED":
      return {
        ...state,
        persistence: "unavailable",
        lastError: "Changes remain in memory for this session.",
      };
    case "MODEL_CREATED":
      return persistentUpdate(state, {
        models: [command.model, ...state.models],
      });
    case "MODEL_UPDATED":
      return persistentUpdate(state, {
        models: state.models.map((model) =>
          model.id === command.id ? normalizedModel(model, command.update) : model,
        ),
      });
    case "IDENTITY_REFERENCES_ADDED":
      return persistentUpdate(state, {
        models: state.models.map((model) => model.id === command.id
          ? normalizedModel(
              { ...model, references: [...command.references, ...model.references] },
              { readiness: { identityApproved: command.references.length > 0 } },
            )
          : model),
      });
    case "GARMENT_CREATED":
      return persistentUpdate(state, {
        garments: [command.garment, ...state.garments],
        inventory: [command.inventory, ...state.inventory],
      });
    case "GARMENT_MEDIA_ADDED":
      return persistentUpdate(state, {
        garments: state.garments.map((garment) => {
          if (garment.id !== command.id) return garment;
          const byView = new Map(
            [...garment.references, ...command.references].map((reference) => [reference.view, reference]),
          );
          const references = [...byView.values()];
          const requiredViews = ["FRONT", "BACK", "DETAIL"];
          const mediaState = requiredViews.every((view) => references.some((reference) => reference.view === view))
            ? "READY"
            : "DRAFT";
          return {
            ...garment,
            references,
            mediaState,
            canonState: mediaState === "READY" ? "REVIEW" : garment.canonState,
          };
        }),
      });
    case "GARMENT_READY_REQUESTED": {
      const garment = state.garments.find((candidate) => candidate.id === command.id);
      if (!garment || !everyGateReady(garmentReadiness(garment))) return state;
      return persistentUpdate(state, {
        garments: state.garments.map((candidate) => candidate.id === command.id
          ? { ...candidate, state: "READY", canonState: "APPROVED", availability: "AVAILABLE" }
          : candidate),
      });
    }
    case "GARMENT_APPROVED":
      return persistentUpdate(state, {
        garments: state.garments.map((garment) => garment.id === command.id
          ? {
              ...garment,
              canonState: "APPROVED",
              state: everyGateReady(garmentReadiness(garment)) ? "READY" : garment.state,
            }
          : garment),
      });
    case "LISTING_DRAFTED": {
      if (state.listings.some((listing) => listing.garmentId === command.listing.garmentId)) return state;
      return persistentUpdate(state, {
        listings: [command.listing, ...state.listings],
        inventory: state.inventory.map((record) => record.garmentId === command.listing.garmentId
          ? { ...record, listingId: command.listing.id }
          : record),
      });
    }
    case "LISTING_UPDATED":
      return persistentUpdate(state, {
        listings: state.listings.map((listing) => {
          if (listing.id !== command.id || !["DRAFT", "READY"].includes(listing.state)) return listing;
          return {
            ...listing,
            ...command.update,
            title: command.update.title?.trim() || listing.title,
            description: command.update.description?.trim() ?? listing.description,
            state: "DRAFT",
            publicProjection: undefined,
          };
        }),
      });
    case "LISTING_READY_REQUESTED": {
      const listing = state.listings.find((candidate) => candidate.id === command.id);
      if (!listing || !everyGateReady(listingReadiness(state, listing))) return state;
      return persistentUpdate(state, {
        listings: state.listings.map((candidate) => candidate.id === command.id
          ? { ...candidate, state: "READY" }
          : candidate),
      });
    }
    case "LISTING_PUBLISHED": {
      const listing = state.listings.find((candidate) => candidate.id === command.id);
      const garment = listing
        ? state.garments.find((candidate) => candidate.id === listing.garmentId)
        : undefined;
      if (
        !listing
        || !garment
        || listing.state !== "READY"
        || !everyGateReady(listingReadiness(state, listing))
      ) return state;
      const published: StudioListing = {
        ...listing,
        state: "PUBLISHED",
        publishedAt: command.publishedAt,
      };
      const publicProjection = createWardrobePublicProduct(published, garment);
      if (!publicProjection) return state;
      published.publicProjection = publicProjection;
      return persistentUpdate(state, {
        listings: state.listings.map((candidate) => candidate.id === listing.id ? published : candidate),
        garments: state.garments.map((candidate) => candidate.id === garment.id
          ? { ...candidate, state: "PUBLISHED", availability: "AVAILABLE" }
          : candidate),
        inventory: state.inventory.map((record) => record.garmentId === garment.id
          ? { ...record, listingId: listing.id, state: "PUBLISHED", updatedAt: command.publishedAt }
          : record),
      });
    }
    case "ORDER_RESERVED": {
      const listing = state.listings.find((candidate) => candidate.id === command.order.listingId);
      const garment = listing
        ? state.garments.find((candidate) => candidate.id === listing.garmentId)
        : undefined;
      if (
        !listing
        || !garment
        || listing.state !== "PUBLISHED"
        || availableStock(state, listing.id) < command.order.quantity
      ) {
        return state;
      }
      return persistentUpdate(state, {
        orders: [command.order, ...state.orders],
        listings: state.listings.map((candidate) => candidate.id === listing.id
          ? {
              ...candidate,
              state: "RESERVED",
              publicProjection: updateProjectionAvailability(candidate, "RESERVED"),
            }
          : candidate),
        garments: state.garments.map((candidate) => candidate.id === garment.id
          ? { ...candidate, state: "RESERVED", availability: "RESERVED" }
          : candidate),
        inventory: state.inventory.map((record) => record.id === command.order.inventoryId
          ? {
              ...record,
              reserved: record.reserved + command.order.quantity,
              state: "RESERVED",
              updatedAt: command.order.createdAt,
            }
          : record),
      });
    }
    case "ORDER_FULFILLED": {
      const order = state.orders.find((candidate) => candidate.id === command.id);
      if (!order || order.state !== "RESERVED") return state;
      const inventory = state.inventory.find((candidate) => candidate.id === order.inventoryId);
      const listing = state.listings.find((candidate) => candidate.id === order.listingId);
      if (!inventory || !listing) return state;
      const nextOnHand = Math.max(0, inventory.onHand - order.quantity);
      const nextReserved = Math.max(0, inventory.reserved - order.quantity);
      const remaining = Math.max(0, nextOnHand - nextReserved);
      const nextState = remaining > 0 ? "PUBLISHED" : "SOLD";
      return persistentUpdate(state, {
        orders: state.orders.map((candidate) => candidate.id === order.id
          ? { ...candidate, state: "SOLD", fulfilledAt: command.fulfilledAt }
          : candidate),
        inventory: state.inventory.map((record) => record.id === inventory.id
          ? {
              ...record,
              onHand: nextOnHand,
              reserved: nextReserved,
              sold: record.sold + order.quantity,
              state: nextState,
              updatedAt: command.fulfilledAt,
            }
          : record),
        listings: state.listings.map((candidate) => candidate.id === listing.id
          ? {
              ...candidate,
              state: nextState,
              publicProjection: updateProjectionAvailability(candidate, remaining > 0 ? "AVAILABLE" : "SOLD"),
            }
          : candidate),
        garments: state.garments.map((candidate) => candidate.id === listing.garmentId
          ? {
              ...candidate,
              state: nextState,
              availability: remaining > 0 ? "AVAILABLE" : "SOLD",
            }
          : candidate),
      });
    }
    case "RETURN_OPENED": {
      const order = state.orders.find((candidate) => candidate.id === command.returnCase.orderId);
      if (
        !order
        || order.state !== "SOLD"
        || state.returns.some((candidate) => candidate.orderId === order.id)
      ) {
        return state;
      }
      return persistentUpdate(state, {
        returns: [command.returnCase, ...state.returns],
      });
    }
    case "RETURN_DISPOSED": {
      const returnCase = state.returns.find((candidate) => candidate.id === command.id);
      if (!returnCase || returnCase.state !== "DRAFT" || command.disposition === "PENDING") return state;
      const order = state.orders.find((candidate) => candidate.id === returnCase.orderId);
      const inventory = state.inventory.find((candidate) => candidate.id === returnCase.inventoryId);
      const listing = order
        ? state.listings.find((candidate) => candidate.id === order.listingId)
        : undefined;
      if (!order || !inventory || !listing) return state;
      const restock = command.disposition === "RESTOCK";
      const remainingAvailable = Math.max(0, inventory.onHand - inventory.reserved);
      const writeOffState = remainingAvailable > 0 ? "PUBLISHED" : "SOLD";
      return persistentUpdate(state, {
        returns: state.returns.map((candidate) => candidate.id === returnCase.id
          ? {
              ...candidate,
              state: "RETURNED",
              disposition: command.disposition,
              resolvedAt: command.resolvedAt,
            }
          : candidate),
        orders: state.orders.map((candidate) => candidate.id === order.id
          ? { ...candidate, state: "RETURNED" }
          : candidate),
        inventory: state.inventory.map((record) => record.id === inventory.id
          ? {
              ...record,
              onHand: restock ? record.onHand + returnCase.quantity : record.onHand,
              returned: record.returned + returnCase.quantity,
              writeOff: restock ? record.writeOff : record.writeOff + returnCase.quantity,
              state: restock ? "RETURNED" : writeOffState,
              updatedAt: command.resolvedAt,
            }
          : record),
        listings: state.listings.map((candidate) => candidate.id === listing.id
          ? {
              ...candidate,
              state: restock ? "READY" : writeOffState,
              publicProjection: restock
                ? undefined
                : updateProjectionAvailability(candidate, remainingAvailable > 0 ? "AVAILABLE" : "SOLD"),
            }
          : candidate),
        garments: state.garments.map((candidate) => candidate.id === listing.garmentId
          ? {
              ...candidate,
              state: restock ? "RETURNED" : writeOffState,
              availability: restock || remainingAvailable > 0 ? "AVAILABLE" : "SOLD",
            }
          : candidate),
      });
    }
    case "SHOOT_CREATED":
      return persistentUpdate(state, { shoots: [command.shoot, ...state.shoots] });
    case "GENERATION_REVIEWED":
      return persistentUpdate(state, {
        shoots: state.shoots.map((shoot) => ({
          ...shoot,
          generations: shoot.generations.map((generation) => generation.id === command.generationId
            ? {
                ...generation,
                review: {
                  decision: command.decision,
                  reasons: command.reasons,
                  note: command.note,
                  reviewedAt: command.reviewedAt,
                },
              }
            : generation),
        })),
      });
    case "HERO_SELECTED": {
      const shoot = state.shoots.find((candidate) =>
        candidate.generations.some((generation) => generation.id === command.generationId),
      );
      if (!shoot) return state;
      return persistentUpdate(state, {
        shoots: state.shoots.map((candidate) => candidate.id === shoot.id
          ? {
              ...candidate,
              generations: candidate.generations.map((generation) => ({
                ...generation,
                isHero: generation.id === command.generationId,
              })),
            }
          : candidate),
        garments: state.garments.map((garment) => garment.id === shoot.garmentId
          ? { ...garment, heroGenerationId: command.generationId }
          : garment),
      });
    }
    default:
      return state;
  }
}

export function selectStudioSnapshot(state: StudioMachineState): StudioSnapshot {
  return {
    defaultModelId: state.defaultModelId,
    models: state.models,
    garments: state.garments,
    listings: state.listings,
    inventory: state.inventory,
    orders: state.orders,
    returns: state.returns,
    shoots: state.shoots,
  };
}

export const initialStudioState = createInitialStudioState();
