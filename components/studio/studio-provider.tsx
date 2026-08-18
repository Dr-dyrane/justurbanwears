"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useStudioMachine, type StudioActions } from "../../hooks/studio/use-studio-machine";
import type { GarmentIntakeClient } from "./garment-intake/engine-client";
import { studioEngineIntakeClient } from "./garment-intake/engine-client";
import type { StudioModel } from "../../lib/studio/domain/entities";
import type { StudioMachineState } from "../../lib/studio/domain/state";
import type { ShopServerOrder } from "../../lib/shop/server-order/types";
import {
  createStudioScenarioIntakeClient,
  createStudioScenarioService,
  parseStudioScenario,
  type StudioScenario,
} from "../../lib/studio/simulator";
import { createBrowserStudioService } from "../../lib/studio/services/studio-service";
import {
  createStudioHold,
  dismissStudioNotification,
  readStudioAuthority,
  recordStudioLocation,
  releaseStudioHold,
  type StudioAuthoritySnapshot,
  type StudioAuthorityStatus,
} from "../../lib/studio/services/studio-authority-client";

export interface StudioAuthorityActions {
  snapshot: StudioAuthoritySnapshot | null;
  status: StudioAuthorityStatus;
  error: string;
  refresh(): Promise<void>;
  createHold(input: Parameters<typeof createStudioHold>[0]): Promise<string>;
  releaseHold(id: string): Promise<string>;
  dismissNotification(id: string): Promise<void>;
  recordLocation(input: Parameters<typeof recordStudioLocation>[0]): Promise<string>;
}

interface StudioContextValue extends StudioMachineState, StudioActions {
  identity: StudioModel;
  addGarment: StudioActions["createGarment"];
  authority: StudioAuthorityActions;
  intakeClient: GarmentIntakeClient;
  scenario: StudioScenario | null;
}

const StudioContext = createContext<StudioContextValue | null>(null);

function simulatorAuthority(state: StudioMachineState): StudioAuthoritySnapshot {
  const orders: ShopServerOrder[] = state.orders.flatMap((order) => {
    const listing = state.listings.find((candidate) => candidate.id === order.listingId);
    const garment = state.garments.find((candidate) => candidate.id === listing?.garmentId);
    if (!listing || !garment) return [];
    const localReturn = state.returns.find((candidate) => candidate.orderId === order.id);
    const completed = order.state === "SOLD" || order.state === "RETURNED";
    return [{
      id: order.id,
      reference: order.id,
      lines: [{ snapshot: "PRODUCT", slug: listing.slug, sku: garment.sku, name: garment.title, taggedSize: garment.sizeLabel, unitPrice: garment.price, quantity: 1 }],
      contact: { name: "Scenario customer", email: "scenario@example.com", phone: "+234 800 000 0000" },
      fulfillment: { kind: "PICKUP", optionId: "pickup" },
      subtotal: garment.price,
      deliveryFee: 0,
      total: garment.price,
      deliveryLabel: "Studio pickup",
      deliveryEstimate: "Scenario",
      savedAt: order.createdAt,
      reservationExpiresAt: completed ? null : order.createdAt,
      returnEligibleUntil: completed ? order.createdAt : null,
      status: completed ? "DELIVERED" : "ORDER_RECEIVED",
      transmission: "SUBMITTED",
      source: "IN_PERSON",
      lifecycleStatus: completed ? "COMPLETED" : "ACTIVE",
      paymentReviewStatus: "REVIEW_APPROVED",
      fundsConfirmationStatus: "CONFIRMED",
      fundsConfirmation: null,
      fulfillmentStatus: completed ? "DELIVERED" : "NOT_STARTED",
      fulfillmentFacts: {
        kind: "PICKUP",
        carrierName: null,
        trackingReference: null,
        trackingUrl: null,
        pickupAppointment: null,
        recipientName: null,
        dispatchReference: null,
        dispatchedAt: null,
        deliveredAt: completed ? order.fulfilledAt ?? order.createdAt : null,
        deliveryProofReference: null,
      },
      cancellationRecovery: null,
      return: localReturn ? {
        id: localReturn.id,
        status: localReturn.state === "RETURNED" ? "RESOLVED" : "REQUESTED",
        reason: "OTHER",
        detail: "Scenario return",
        requestedAt: localReturn.createdAt,
        eligibleUntil: localReturn.createdAt,
        approvedAt: null,
        rejectedAt: null,
        receivedAt: null,
        resolvedAt: localReturn.resolvedAt ?? null,
        resolutionNote: null,
        refundStatus: "NOT_STARTED",
        refundReference: null,
        refundAmount: null,
        refundCurrency: null,
        refundUpdatedAt: null,
        disposition: localReturn.disposition === "PENDING" ? null : localReturn.disposition,
        items: [{ sku: garment.sku, name: garment.title, unitPrice: garment.price, disposition: localReturn.disposition === "PENDING" ? null : localReturn.disposition }],
        correctionCount: 0,
      } : null,
      version: 1,
      evidence: [],
      events: [],
      allowedTransitions: completed ? [] : [{ dimension: "FULFILLMENT", target: "QUALITY_CHECK" }],
      allowedReturnTransitions: localReturn?.disposition === "PENDING" ? [{ dimension: "RETURN", target: "APPROVED" }] : [],
      canRequestReturn: completed && !localReturn,
      canRequestPaidCancellation: false,
    }];
  });
  const pieces = state.garments.map((garment) => {
    const listing = state.listings.find((candidate) => candidate.garmentId === garment.id);
    const order = orders.find((candidate) => candidate.lines.some((line) => line.sku === garment.sku));
    const isPublic = Boolean(listing && ["PUBLISHED", "RESERVED", "SOLD"].includes(listing.state));
    const availability = isPublic ? garment.availability : "PRIVATE" as const;
    const location = availability === "RESERVED"
      ? { key: "PACKING_SHELF", label: "Packing shelf", custody: "STUDIO" as const }
      : availability === "SOLD"
        ? { key: "CUSTOMER", label: "With customer", custody: "CUSTOMER" as const }
        : { key: "WARDROBE_RAIL", label: "Wardrobe rail", custody: "STUDIO" as const };
    return {
      pieceKey: `scenario:${garment.id}`,
      wardrobeItemId: garment.privateWardrobeItemId ?? garment.id,
      sku: garment.sku,
      title: garment.title,
      category: garment.category,
      colour: garment.color,
      condition: garment.condition,
      sizeLabel: garment.sizeLabel,
      imageSrc: garment.reviewCover?.src ?? null,
      availability,
      expectedLocationKey: location.key,
      expectedLocationLabel: location.label,
      expectedCustody: location.custody,
      orderReference: order?.reference ?? null,
      observedLocationKey: location.custody === "STUDIO" ? location.key : null,
      observedLocationLabel: location.custody === "STUDIO" ? location.label : null,
      observedAt: garment.createdAt,
      hasLocationMismatch: false,
      activeHold: null,
    };
  });
  const models = state.models.map((model) => ({
    id: model.id,
    name: model.name,
    kind: model.isDefault ? "LULU_V3" as const : "AUTHORIZED_STOCK" as const,
    state: model.state === "READY" ? "READY" as const : "ARCHIVED" as const,
    sourceAssetUrl: "/shop/model/lulu-v3-approved.png",
    licenseUrl: null,
    authorityConfirmedAt: model.approvedAt ?? state.garments[0]?.createdAt ?? new Date(0).toISOString(),
    authority: {
      adultConfirmed: true,
      operatorAuthorityConfirmed: model.consent.status === "CONFIRMED",
      allowedUse: model.consent.allowedUse,
      restrictedUse: model.consent.restrictedUse,
      styling: model.styling,
    },
    createdAt: state.garments[0]?.createdAt ?? new Date(0).toISOString(),
    updatedAt: state.garments[0]?.createdAt ?? new Date(0).toISOString(),
  }));
  return {
    pieces,
    orders,
    holds: [],
    models,
    media: [],
    notifications: [],
    generatedAt: state.garments[0]?.createdAt ?? new Date(0).toISOString(),
  };
}

function StudioMachineProvider({ children, scenario }: {
  children: React.ReactNode;
  scenario: StudioScenario | null;
}) {
  const service = useMemo(
    () => scenario ? createStudioScenarioService(scenario) : createBrowserStudioService(),
    [scenario],
  );
  const intakeClient = useMemo(
    () => scenario ? createStudioScenarioIntakeClient(scenario) : studioEngineIntakeClient,
    [scenario],
  );
  const { state, actions } = useStudioMachine(service);
  const identity = state.models.find((model) => model.id === state.defaultModelId) ?? state.models[0];
  const [authoritySnapshot, setAuthoritySnapshot] = useState<StudioAuthoritySnapshot | null>(null);
  const [authorityStatus, setAuthorityStatus] = useState<StudioAuthorityStatus>(scenario ? "ready" : "idle");
  const [authorityError, setAuthorityError] = useState("");
  const authorityRequestRef = useRef<AbortController | null>(null);
  const authorityLoadedAtRef = useRef(0);
  const scenarioAuthority = useMemo(() => scenario ? simulatorAuthority(state) : null, [scenario, state]);

  const refreshAuthority = useCallback(async () => {
    if (scenario) return;
    authorityRequestRef.current?.abort();
    const controller = new AbortController();
    authorityRequestRef.current = controller;
    setAuthorityStatus((current) => current === "ready" ? current : "loading");
    setAuthorityError("");
    try {
      const snapshot = await readStudioAuthority(controller.signal);
      if (controller.signal.aborted) return;
      setAuthoritySnapshot(snapshot);
      setAuthorityStatus("ready");
      authorityLoadedAtRef.current = Date.now();
    } catch (cause) {
      if (controller.signal.aborted) return;
      setAuthorityError(cause instanceof Error ? cause.message : "Connected Studio truth is unavailable.");
      setAuthorityStatus("error");
    }
  }, [scenario]);

  useEffect(() => {
    if (scenario) return;
    const controller = new AbortController();
    authorityRequestRef.current = controller;
    void readStudioAuthority(controller.signal).then((snapshot) => {
      if (controller.signal.aborted) return;
      setAuthoritySnapshot(snapshot);
      setAuthorityStatus("ready");
      setAuthorityError("");
      authorityLoadedAtRef.current = Date.now();
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setAuthorityError(cause instanceof Error ? cause.message : "Connected Studio truth is unavailable.");
      setAuthorityStatus("error");
    });
    const onVisibility = () => {
      if (document.visibilityState === "visible" && Date.now() - authorityLoadedAtRef.current > 30_000) {
        void refreshAuthority();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      controller.abort();
      authorityRequestRef.current?.abort();
    };
  }, [refreshAuthority, scenario]);

  const authority = useMemo<StudioAuthorityActions>(() => ({
    snapshot: scenarioAuthority ?? authoritySnapshot,
    status: authorityStatus,
    error: authorityError,
    refresh: refreshAuthority,
    async createHold(input) {
      if (scenario) throw new Error("Holds are read-only in the simulator.");
      const result = await createStudioHold(input);
      await refreshAuthority();
      return result.receipt.consequence;
    },
    async releaseHold(id) {
      if (scenario) throw new Error("Holds are read-only in the simulator.");
      const result = await releaseStudioHold(id);
      await refreshAuthority();
      return result.receipt.consequence;
    },
    async dismissNotification(id) {
      if (scenario) return;
      await dismissStudioNotification(id);
      setAuthoritySnapshot((current) => current ? {
        ...current,
        notifications: current.notifications.filter((notification) => notification.id !== id),
      } : current);
    },
    async recordLocation(input) {
      if (scenario) throw new Error("Locations are read-only in the simulator.");
      const result = await recordStudioLocation(input);
      await refreshAuthority();
      return result.receipt.consequence;
    },
  }), [authorityError, authoritySnapshot, authorityStatus, refreshAuthority, scenario, scenarioAuthority]);

  const value = useMemo<StudioContextValue>(() => ({
    ...state,
    ...actions,
    identity,
    addGarment: actions.createGarment,
    authority,
    intakeClient,
    scenario,
  }), [actions, authority, identity, intakeClient, scenario, state]);

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function StudioProvider({ children, scenariosEnabled }: {
  children: React.ReactNode;
  scenariosEnabled: boolean;
}) {
  const searchParams = useSearchParams();
  const scenario = parseStudioScenario(searchParams.get("scenario"), scenariosEnabled);
  return (
    <StudioMachineProvider key={scenario ?? "production"} scenario={scenario}>
      {children}
    </StudioMachineProvider>
  );
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
