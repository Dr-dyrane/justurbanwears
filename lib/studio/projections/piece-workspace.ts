import type { Garment, StudioListing } from "../domain/entities";
import { everyGateReady, garmentReadiness } from "../domain/readiness";
import {
  isPendingDirectCaptureRole,
  type PendingDirectCaptureRole,
} from "../engine/pending-capture-contracts";
import { approvedSlugForSku, getApprovedPublicListingContract } from "./approved-catalogue";
import {
  getPendingWardrobeProductContract,
  pendingWardrobeMediaLabel,
} from "../seeds/private-wardrobe-products";

export type PieceHumanStage = "NEEDS_WORK" | "PRIVATE" | "READY" | "LIVE" | "SOLD";

export type PieceNextAction = {
  kind:
    | "CAPTURE"
    | "FINISH"
    | "TRY_ON"
    | "PREPARE_SHOP"
    | "REVIEW_SHOP"
    | "PUBLISH"
    | "VIEW_SHOP"
    | "VIEW_OPERATIONS"
    | "KEEP_PRIVATE";
  label: string;
  detail: string;
};

export type PieceWorkspace = {
  stage: PieceHumanStage;
  stageLabel: string;
  blockers: string[];
  captureRoles: PendingDirectCaptureRole[];
  canPublish: boolean;
  nextAction: PieceNextAction;
};

function captureRolesFor(garment: Garment): PendingDirectCaptureRole[] {
  const pending = getPendingWardrobeProductContract(garment.sku);
  if (pending) return pending.missingViews.filter(isPendingDirectCaptureRole);
  return garment.privateWardrobeItemId ? ["GARMENT_BACK", "FABRIC_DETAIL"] : [];
}

export function selectPieceWorkspace(input: {
  garment: Garment;
  listing?: StudioListing;
  capturedRoles?: readonly PendingDirectCaptureRole[];
}): PieceWorkspace {
  const { garment, listing } = input;
  const requiredCaptures = captureRolesFor(garment);
  const captured = new Set(input.capturedRoles ?? []);
  const missingCaptures = requiredCaptures.filter((role) => !captured.has(role));
  const approvedSlug = listing?.slug ?? approvedSlugForSku(garment.sku);
  const approved = approvedSlug
    ? getApprovedPublicListingContract(garment.sku, approvedSlug)
    : undefined;
  const canPublish = Boolean(approved);
  const garmentGates = garmentReadiness(garment);
  const garmentReady = everyGateReady(garmentGates);
  const otherBlockers = garmentGates
    .filter((gate) => !gate.ready && !(gate.id === "media" && requiredCaptures.length > 0))
    .map((gate) => gate.label);
  const blockers = [
    ...missingCaptures.map((role) => pendingWardrobeMediaLabel(role)),
    ...otherBlockers,
  ];

  if (listing && ["PUBLISHED", "RESERVED", "SOLD"].includes(listing.state) && !canPublish) {
    return {
      stage: "PRIVATE",
      stageLabel: "Private",
      blockers: ["Public approval unavailable"],
      captureRoles: requiredCaptures,
      canPublish: false,
      nextAction: { kind: "KEEP_PRIVATE", label: "Keep private", detail: "This piece has no approved public contract." },
    };
  }
  if (listing?.state === "SOLD" && canPublish) {
    return {
      stage: "SOLD",
      stageLabel: "Sold",
      blockers: [],
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "VIEW_OPERATIONS", label: "View sale", detail: "Open the sale record in Operations." },
    };
  }
  if (listing && canPublish && ["PUBLISHED", "RESERVED"].includes(listing.state)) {
    return {
      stage: "LIVE",
      stageLabel: listing.state === "RESERVED" ? "Reserved" : "Live",
      blockers: [],
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "VIEW_SHOP", label: "View in Shop", detail: "Open the customer view." },
    };
  }
  if (missingCaptures.length) {
    const label = pendingWardrobeMediaLabel(missingCaptures[0]);
    return {
      stage: "NEEDS_WORK",
      stageLabel: "Needs photos",
      blockers,
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "CAPTURE", label: `Add ${label.toLowerCase()}`, detail: `${missingCaptures.length} photo${missingCaptures.length === 1 ? "" : "s"} left.` },
    };
  }
  if (listing?.state === "READY" && canPublish) {
    return {
      stage: "READY",
      stageLabel: "Ready to publish",
      blockers,
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "PUBLISH", label: "Publish", detail: "Make this piece visible in Shop." },
    };
  }
  if (listing?.state === "DRAFT" && canPublish) {
    return {
      stage: "READY",
      stageLabel: "Shop preview",
      blockers,
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "REVIEW_SHOP", label: "Review Shop preview", detail: "Confirm the customer view before publishing." },
    };
  }
  if (garment.state === "DRAFT" && garmentReady) {
    return {
      stage: "READY",
      stageLabel: "Ready",
      blockers: [],
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "FINISH", label: "Finish piece", detail: "Save it as wardrobe-ready." },
    };
  }
  if (garment.privateWardrobeItemId) {
    return {
      stage: "PRIVATE",
      stageLabel: blockers.length ? "Private draft" : "Private",
      blockers,
      captureRoles: requiredCaptures,
      canPublish: false,
      nextAction: { kind: "TRY_ON", label: "Try it on", detail: "Make a private mannequin or model view." },
    };
  }
  if (["READY", "RETURNED"].includes(garment.state) && !listing && canPublish) {
    return {
      stage: "READY",
      stageLabel: "Ready",
      blockers,
      captureRoles: requiredCaptures,
      canPublish,
      nextAction: { kind: "PREPARE_SHOP", label: "Prepare Shop preview", detail: "Review the approved photos, title and price." },
    };
  }
  return {
    stage: blockers.length ? "NEEDS_WORK" : "PRIVATE",
    stageLabel: blockers.length ? "Needs review" : "Private",
    blockers,
    captureRoles: requiredCaptures,
    canPublish,
    nextAction: { kind: "KEEP_PRIVATE", label: "Keep private", detail: "Publishing is unavailable for this piece." },
  };
}
