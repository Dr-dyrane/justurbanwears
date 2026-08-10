import type { Garment, StudioListing, StudioModel } from "./entities";
import type { StudioSnapshot } from "./state";
import {
  APPROVED_PUBLIC_MODEL_ANCHOR,
  getApprovedPublicListingContract,
} from "../projections/approved-catalogue";

export interface ReadinessGate {
  id: string;
  label: string;
  ready: boolean;
}

export function modelReadiness(model: StudioModel): ReadinessGate[] {
  return [
    { id: "identity", label: "Identity approved", ready: model.readiness.identityApproved },
    { id: "consent", label: "Consent confirmed", ready: model.readiness.consentConfirmed },
    { id: "styling", label: "Styling complete", ready: model.readiness.stylingComplete },
  ];
}

export function garmentReadiness(garment: Garment): ReadinessGate[] {
  return [
    { id: "classification", label: "Classified", ready: garment.classificationState === "READY" },
    { id: "media", label: "Front, back & detail", ready: garment.mediaState === "READY" },
    { id: "measurements", label: "Measurements captured", ready: garment.measurements.length > 0 },
    { id: "quantity", label: "Stock on hand", ready: garment.quantity > 0 },
    { id: "eligibility", label: "Sale eligible", ready: garment.saleEligible },
  ];
}

export function listingReadiness(
  snapshot: StudioSnapshot,
  listing: StudioListing,
): ReadinessGate[] {
  const garment = snapshot.garments.find((candidate) => candidate.id === listing.garmentId);
  const model = snapshot.models.find((candidate) => candidate.id === listing.modelId);
  const inventory = snapshot.inventory.find((candidate) => candidate.garmentId === listing.garmentId);
  const approvedContract = garment
    ? getApprovedPublicListingContract(garment.sku, listing.slug)
    : undefined;
  return [
    {
      id: "wardrobe",
      label: "Wardrobe item ready",
      ready: Boolean(garment && everyGateReady(garmentReadiness(garment))),
    },
    { id: "copy", label: "Public title & description", ready: Boolean(listing.title.trim() && listing.description.trim()) },
    { id: "price", label: "Price confirmed", ready: Number.isFinite(listing.price) && listing.price > 0 },
    {
      id: "media",
      label: "Six public frames approved",
      ready: approvedContract?.media.length === 6,
    },
    {
      id: "model",
      label: "Lulu V2 public anchor",
      ready: Boolean(
        model
        && model.id === snapshot.defaultModelId
        && model.state === "READY"
        && everyGateReady(modelReadiness(model))
        && approvedContract?.modelAnchor.id === APPROVED_PUBLIC_MODEL_ANCHOR.id
      ),
    },
    {
      id: "stock",
      label: "Stock available",
      ready: Boolean(inventory && inventory.onHand - inventory.reserved > 0),
    },
  ];
}

export function everyGateReady(gates: ReadinessGate[]) {
  return gates.every((gate) => gate.ready);
}

export function availableStock(snapshot: StudioSnapshot, listingId: string) {
  const listing = snapshot.listings.find((candidate) => candidate.id === listingId);
  if (!listing) return 0;
  const inventory = snapshot.inventory.find((candidate) => candidate.garmentId === listing.garmentId);
  return inventory ? Math.max(0, inventory.onHand - inventory.reserved) : 0;
}
