import type { Garment, StudioListing, StudioModel } from "./entities";
import type { StudioSnapshot } from "./state";
import {
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
  const fitConfirmationReady = garment.measurements.length > 0 || (
    garment.sizeLabel === "Size on request"
    && garment.estimatedFit === "Measurements confirmed before payment"
  );
  return [
    { id: "classification", label: "Classified", ready: garment.classificationState === "READY" },
    { id: "media", label: "Front, back & detail", ready: garment.mediaState === "READY" },
    { id: "measurements", label: "Fit confirmation ready", ready: fitConfirmationReady },
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
      label: approvedContract?.media.some((frame) => frame.slot === "MODEL_FRONT")
        ? "Product views + model front approved"
        : "Product views approved",
      ready: Boolean(approvedContract && approvedContract.media.length >= 4),
    },
    {
      id: "model",
      label: "Approved Lulu public model",
      ready: Boolean(
        model
        && model.id === snapshot.defaultModelId
        && model.state === "READY"
        && everyGateReady(modelReadiness(model))
        && approvedContract?.modelAnchor.id
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
