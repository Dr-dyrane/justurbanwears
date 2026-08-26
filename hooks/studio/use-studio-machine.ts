"use client";

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type {
  Garment,
  InventoryRecord,
  ListingUpdateInput,
  ModelReference,
  ModelUpdateInput,
  NewGarmentInput,
  NewModelInput,
  NewShootInput,
  ReturnDisposition,
  ReviewDecision,
  Shoot,
  StudioListing,
  StudioModel,
  StudioOrder,
  StudioReturn,
  VisualVariant,
} from "../../lib/studio/domain/entities";
import {
  everyGateReady,
  garmentReadiness,
  listingReadiness,
} from "../../lib/studio/domain/readiness";
import {
  initialStudioState,
  selectStudioSnapshot,
  studioReducer,
} from "../../lib/studio/machines/studio-machine";
import { createListingSlug } from "../../lib/studio/projections/public-listing";
import type { StudioService } from "../../lib/studio/services/contracts";

const visualCycle: VisualVariant[] = ["plum", "indigo", "moss", "chalk", "umber"];

function buildModel(service: StudioService, input: NewModelInput): StudioModel {
  const id = service.createId("model");
  const name = input.name.trim();
  return {
    id,
    name,
    preferredName: name,
    version: `${name.toUpperCase()} MODEL 01`,
    isDefault: false,
    state: "DRAFT",
    status: "REVIEW",
    completeness: 0,
    styling: { hair: "", makeup: "", direction: "" },
    readiness: {
      identityApproved: false,
      consentConfirmed: false,
      stylingComplete: false,
    },
    bodyReferenceStatus: "MISSING",
    hairReferenceStatus: "MISSING",
    references: [],
    visibleFeatureNotes: [],
    allowedVariance: [],
    forbiddenDrift: ["Identity drift", "Body reshaping", "Skin-tone changes"],
    consent: {
      status: "WITHDRAWN",
      date: service.now(),
      allowedUse: "Approved justurban wears Studio work.",
      restrictedUse: "No raw identity material enters a public listing.",
    },
  };
}

function buildGarment(
  service: StudioService,
  input: NewGarmentInput,
  visual: VisualVariant,
): { garment: Garment; inventory: InventoryRecord } {
  const id = service.createId("garment");
  const createdAt = service.now();
  const quantity = Math.max(0, Math.floor(input.quantity ?? 1));
  const references: Garment["references"] = [
    input.hasFront && { id: `${id}-front`, view: "FRONT", quality: 100 },
    input.hasBack && { id: `${id}-back`, view: "BACK", quality: 100 },
    input.hasDetail && { id: `${id}-detail`, view: "DETAIL", quality: 100 },
  ].filter(Boolean) as Garment["references"];
  const mediaState = input.hasFront && input.hasBack && input.hasDetail
    ? "READY"
    : references.length
      ? "DRAFT"
      : "EMPTY";
  const classificationState = [
    input.category,
    input.color,
    input.sizeLabel,
    input.condition,
  ].every((value) => value.trim()) ? "READY" : "DRAFT";
  const publicDescription = (input.publicDescription ?? input.notes).trim();
  const privateNote = (input.privateNote ?? "").trim();
  const garment: Garment = {
    id,
    sku: input.sku.trim().toUpperCase(),
    title: input.title.trim(),
    category: input.category,
    sizeLabel: input.sizeLabel.trim(),
    estimatedFit: input.estimatedFit.trim(),
    color: input.color.trim(),
    price: Math.max(0, input.price),
    condition: input.condition.trim(),
    brand: input.brand?.trim() || undefined,
    source: input.source.trim() || "Studio intake",
    notes: publicDescription,
    privateNote,
    publicDescription,
    quantity,
    saleEligible: input.saleEligible ?? true,
    measurements: (input.measurements ?? []).filter((measurement) => measurement.value.trim()),
    classificationState,
    mediaState,
    state: "DRAFT",
    availability: quantity > 0 ? "AVAILABLE" : "ARCHIVED",
    canonState: mediaState === "READY" && classificationState === "READY" ? "REVIEW" : "DRAFT",
    visual,
    references,
    createdAt,
  };
  return {
    garment,
    inventory: {
      id: service.createId("stock"),
      garmentId: id,
      onHand: quantity,
      reserved: 0,
      sold: 0,
      returned: 0,
      writeOff: 0,
      state: quantity > 0 ? "READY" : "ERROR",
      updatedAt: createdAt,
    },
  };
}

export interface StudioActions {
  createModel(input: NewModelInput): string;
  updateModel(id: string, update: ModelUpdateInput): void;
  createGarment(input: NewGarmentInput): Garment;
  addGarmentMedia(id: string, view: Garment["references"][number]["view"]): void;
  syncPendingGarmentCaptures(id: string, references: Garment["references"]): void;
  moveGarmentToWardrobe(id: string): boolean;
  prepareListing(garmentId: string): string;
  updateListing(id: string, update: ListingUpdateInput): void;
  confirmListingReady(id: string): boolean;
  publishListing(id: string): boolean;
  reserveOrder(listingId: string, quantity?: number): string;
  cancelOrder(id: string): boolean;
  fulfillOrder(id: string): void;
  openReturn(orderId: string): string;
  disposeReturn(id: string, disposition: Exclude<ReturnDisposition, "PENDING">): void;
  approveGarment(id: string): void;
  addIdentityReferences(references: ModelReference[]): void;
  createMockShoot(input: NewShootInput): string;
  reviewGeneration(generationId: string, decision: ReviewDecision, reasons: string[], note?: string): void;
  setHero(generationId: string): void;
}

export function useStudioMachine(service: StudioService) {
  const [state, dispatch] = useReducer(studioReducer, initialStudioState);
  const stateRef = useRef(state);
  const persistedRevisionRef = useRef(0);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    let active = true;
    dispatch({ type: "HYDRATION_REQUESTED" });
    const stopSync = service.subscribe((snapshot) => {
      if (active) dispatch({ type: "EXTERNAL_STATE_RECEIVED", snapshot });
    });
    void service.hydrate()
      .then((snapshot) => {
        if (active) dispatch({ type: "HYDRATION_SUCCEEDED", snapshot });
      })
      .catch((cause: unknown) => {
        if (active) dispatch({
          type: "HYDRATION_FAILED",
          message: cause instanceof Error ? cause.message : undefined,
        });
      });
    return () => {
      active = false;
      stopSync();
    };
  }, [service]);

  useEffect(() => {
    if (
      state.hydration === "idle"
      || state.hydration === "restoring"
      || state.persistenceRevision <= persistedRevisionRef.current
    ) {
      return;
    }
    persistedRevisionRef.current = state.persistenceRevision;
    void service.persist(selectStudioSnapshot(state)).catch(() => {
      dispatch({ type: "PERSISTENCE_FAILED" });
    });
  }, [service, state]);

  const createModel = useCallback((input: NewModelInput) => {
    if (!input.name.trim()) return "";
    const model = buildModel(service, input);
    dispatch({ type: "MODEL_CREATED", model });
    return model.id;
  }, [service]);

  const updateModel = useCallback((id: string, update: ModelUpdateInput) => {
    dispatch({ type: "MODEL_UPDATED", id, update });
  }, []);

  const createGarment = useCallback((input: NewGarmentInput) => {
    const visual = visualCycle[stateRef.current.garments.length % visualCycle.length];
    const record = buildGarment(service, input, visual);
    dispatch({ type: "GARMENT_CREATED", ...record });
    return record.garment;
  }, [service]);

  const addGarmentMedia = useCallback((id: string, view: Garment["references"][number]["view"]) => {
    dispatch({
      type: "GARMENT_MEDIA_ADDED",
      id,
      references: [{ id: service.createId("media"), view, quality: 100 }],
    });
  }, [service]);

  const syncPendingGarmentCaptures = useCallback((id: string, references: Garment["references"]) => {
    dispatch({ type: "GARMENT_PENDING_CAPTURES_SYNCED", id, references });
  }, []);

  const moveGarmentToWardrobe = useCallback((id: string) => {
    const garment = stateRef.current.garments.find((candidate) => candidate.id === id);
    if (!garment || !everyGateReady(garmentReadiness(garment))) return false;
    dispatch({ type: "GARMENT_READY_REQUESTED", id });
    return true;
  }, []);

  const prepareListing = useCallback((garmentId: string) => {
    const current = stateRef.current;
    const garment = current.garments.find((candidate) => candidate.id === garmentId);
    const model = current.models.find((candidate) => candidate.id === current.defaultModelId);
    if (
      !garment
      || !model
      || !["READY", "RETURNED"].includes(garment.state)
      || current.listings.some((listing) => listing.garmentId === garmentId)
    ) {
      return "";
    }
    const listing: StudioListing = {
      id: service.createId("listing"),
      garmentId,
      modelId: model.id,
      slug: createListingSlug(garment.sku, garment.title),
      title: garment.title,
      description: garment.publicDescription,
      price: garment.price,
      state: "DRAFT",
      createdAt: service.now(),
    };
    dispatch({ type: "LISTING_DRAFTED", listing });
    return listing.id;
  }, [service]);

  const updateListing = useCallback((id: string, update: ListingUpdateInput) => {
    dispatch({ type: "LISTING_UPDATED", id, update });
  }, []);

  const confirmListingReady = useCallback((id: string) => {
    const current = stateRef.current;
    const listing = current.listings.find((candidate) => candidate.id === id);
    if (!listing || !everyGateReady(listingReadiness(current, listing))) return false;
    dispatch({ type: "LISTING_READY_REQUESTED", id });
    return true;
  }, []);

  const publishListing = useCallback((id: string) => {
    const listing = stateRef.current.listings.find((candidate) => candidate.id === id);
    if (!listing || listing.state !== "READY") return false;
    dispatch({ type: "LISTING_PUBLISHED", id, publishedAt: service.now() });
    return true;
  }, [service]);

  const reserveOrder = useCallback((listingId: string, requestedQuantity = 1) => {
    const current = stateRef.current;
    const listing = current.listings.find((candidate) => candidate.id === listingId);
    const inventory = listing
      ? current.inventory.find((candidate) => candidate.garmentId === listing.garmentId)
      : undefined;
    const quantity = Math.max(1, Math.floor(requestedQuantity));
    if (!listing || !inventory || listing.state !== "PUBLISHED" || inventory.onHand - inventory.reserved < quantity) {
      return "";
    }
    const createdAt = service.now();
    const order: StudioOrder = {
      id: service.createId("order"),
      listingId,
      inventoryId: inventory.id,
      quantity,
      state: "RESERVED",
      createdAt,
    };
    dispatch({ type: "ORDER_RESERVED", order });
    return order.id;
  }, [service]);

  const fulfillOrder = useCallback((id: string) => {
    dispatch({ type: "ORDER_FULFILLED", id, fulfilledAt: service.now() });
  }, [service]);

  const cancelOrder = useCallback((id: string) => {
    const order = stateRef.current.orders.find((candidate) => candidate.id === id);
    if (!order || order.state !== "RESERVED") return false;
    dispatch({ type: "ORDER_CANCELLED", id, cancelledAt: service.now() });
    return true;
  }, [service]);

  const openReturn = useCallback((orderId: string) => {
    const current = stateRef.current;
    const order = current.orders.find((candidate) => candidate.id === orderId);
    if (!order || order.state !== "SOLD" || current.returns.some((candidate) => candidate.orderId === orderId)) {
      return "";
    }
    const returnCase: StudioReturn = {
      id: service.createId("return"),
      orderId,
      inventoryId: order.inventoryId,
      quantity: order.quantity,
      state: "DRAFT",
      disposition: "PENDING",
      createdAt: service.now(),
    };
    dispatch({ type: "RETURN_OPENED", returnCase });
    return returnCase.id;
  }, [service]);

  const disposeReturn = useCallback((id: string, disposition: Exclude<ReturnDisposition, "PENDING">) => {
    dispatch({ type: "RETURN_DISPOSED", id, disposition, resolvedAt: service.now() });
  }, [service]);

  const approveGarment = useCallback((id: string) => {
    dispatch({ type: "GARMENT_APPROVED", id });
  }, []);

  const addIdentityReferences = useCallback((references: ModelReference[]) => {
    dispatch({
      type: "IDENTITY_REFERENCES_ADDED",
      id: stateRef.current.defaultModelId,
      references,
    });
  }, []);

  const createMockShoot = useCallback((input: NewShootInput) => {
    const current = stateRef.current;
    const garment = current.garments.find((candidate) => candidate.id === input.garmentId);
    const identity = current.models.find((candidate) => candidate.id === current.defaultModelId);
    if (!garment || !identity) return "";
    const shootId = `SHOOT-${String(current.shoots.length + 1).padStart(3, "0")}`;
    const palette: VisualVariant[] = input.preset === "LAGOS STREET"
      ? ["lagos-dusk", "indigo", "umber"]
      : input.preset === "CASUAL MIRROR"
        ? ["mirror", "chalk", "plum"]
        : ["studio", "umber", "plum"];
    const createdAt = service.now();
    const shoot: Shoot = {
      id: shootId,
      garmentId: garment.id,
      identityVersion: identity.version,
      preset: input.preset,
      pose: input.pose,
      crop: input.crop,
      outputFormat: input.outputFormat,
      generationEngine: "studio/mock-v1",
      generationConfiguration: { mocked: true },
      createdAt,
      generations: ["Front", "Three-quarter", "Detail"].map((label, index) => ({
        id: service.createId("frame"),
        shootId,
        label,
        visual: palette[index],
        identityMatch: 86 + index * 2,
        garmentMatch: 91 + index,
        review: { decision: "PENDING", reasons: [] },
        isHero: false,
      })),
    };
    dispatch({ type: "SHOOT_CREATED", shoot });
    return shootId;
  }, [service]);

  const reviewGeneration = useCallback((
    generationId: string,
    decision: ReviewDecision,
    reasons: string[],
    note?: string,
  ) => {
    dispatch({
      type: "GENERATION_REVIEWED",
      generationId,
      decision,
      reasons,
      note,
      reviewedAt: service.now(),
    });
  }, [service]);

  const setHero = useCallback((generationId: string) => {
    dispatch({ type: "HERO_SELECTED", generationId });
  }, []);

  const actions = useMemo<StudioActions>(() => ({
    createModel,
    updateModel,
    createGarment,
    addGarmentMedia,
    syncPendingGarmentCaptures,
    moveGarmentToWardrobe,
    prepareListing,
    updateListing,
    confirmListingReady,
    publishListing,
    reserveOrder,
    cancelOrder,
    fulfillOrder,
    openReturn,
    disposeReturn,
    approveGarment,
    addIdentityReferences,
    createMockShoot,
    reviewGeneration,
    setHero,
  }), [
    addGarmentMedia,
    addIdentityReferences,
    approveGarment,
    confirmListingReady,
    cancelOrder,
    createGarment,
    createMockShoot,
    createModel,
    disposeReturn,
    fulfillOrder,
    moveGarmentToWardrobe,
    openReturn,
    prepareListing,
    publishListing,
    reserveOrder,
    reviewGeneration,
    setHero,
    syncPendingGarmentCaptures,
    updateListing,
    updateModel,
  ]);

  return { state, actions };
}
