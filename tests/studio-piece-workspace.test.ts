import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Garment } from "../lib/studio/domain/entities";
import {
  actionableStudioDraftCount,
  selectPieceWorkspace,
} from "../lib/studio/projections/piece-workspace";
import { getPendingWardrobeProductContract } from "../lib/studio/seeds/private-wardrobe-products";
import {
  createStudioScenarioSnapshot,
  studioScenarioRouteSupported,
} from "../lib/studio/simulator";

const root = process.cwd();

function serverDraft(): Garment {
  return {
    id: "studio-server-garment-item-1",
    sku: "INTAKE-ITEM1",
    title: "Coral Dress",
    category: "Dress",
    sizeLabel: "Size on request",
    estimatedFit: "Measurements confirmed before payment",
    color: "Coral",
    price: 24500,
    condition: "Excellent",
    source: "Studio intake",
    notes: "",
    privateNote: "",
    publicDescription: "",
    quantity: 1,
    saleEligible: false,
    measurements: [],
    classificationState: "READY",
    mediaState: "DRAFT",
    state: "DRAFT",
    availability: "AVAILABLE",
    canonState: "REVIEW",
    visual: "studio",
    references: [{ id: "front", view: "FRONT", quality: 100 }],
    createdAt: "2026-08-13T00:00:00.000Z",
    privateWardrobeItemId: "item-1",
  };
}

test("Piece selector exposes one truthful next action and never promises arbitrary publication", () => {
  const draft = selectPieceWorkspace({ garment: serverDraft() });
  assert.equal(draft.stageLabel, "Needs photos");
  assert.equal(draft.nextAction.kind, "CAPTURE");
  assert.deepEqual(draft.captureRoles, ["GARMENT_BACK", "FABRIC_DETAIL"]);
  assert.equal(draft.canPublish, false);

  const complete = selectPieceWorkspace({
    garment: { ...serverDraft(), mediaState: "READY" },
    capturedRoles: ["GARMENT_BACK", "FABRIC_DETAIL"],
  });
  assert.equal(complete.nextAction.kind, "TRY_ON");
  assert.equal(complete.canPublish, false);
  assert.doesNotMatch(complete.nextAction.label, /publish|shop/i);

  const stalePublicListing = {
    id: "listing-1",
    garmentId: "studio-server-garment-item-1",
    modelId: "model-1",
    slug: "coral-dress",
    title: "Coral Dress",
    description: "Coral dress",
    price: 24500,
    state: "SOLD" as const,
    createdAt: "2026-08-13T00:00:00.000Z",
  };
  const sold = selectPieceWorkspace({
    garment: serverDraft(),
    listing: stalePublicListing,
  });
  assert.equal(sold.nextAction.kind, "KEEP_PRIVATE");
  assert.equal(sold.stage, "PRIVATE");
  assert.equal(sold.canPublish, false);

  const approvedContract = getPendingWardrobeProductContract("JUW-015");
  assert.ok(approvedContract);
  const historicalSoldOut = selectPieceWorkspace({
    garment: approvedContract.garment,
    listing: {
      ...stalePublicListing,
      garmentId: approvedContract.garment.id,
      slug: approvedContract.slug,
    },
  });
  assert.deepEqual(
    [
      historicalSoldOut.stage,
      historicalSoldOut.stageLabel,
      historicalSoldOut.nextAction.kind,
      historicalSoldOut.canPublish,
    ],
    ["SOLD", "Sold out", "KEEP_PRIVATE", false],
  );

  const corruptPublished = selectPieceWorkspace({
    garment: serverDraft(),
    listing: {
      ...stalePublicListing,
      state: "PUBLISHED",
    },
  });
  assert.equal(corruptPublished.nextAction.kind, "KEEP_PRIVATE");
  assert.equal(corruptPublished.stageLabel, "Private");
});

test("lifecycle dossiers keep one truthful action across the complete scenario", () => {
  const snapshot = createStudioScenarioSnapshot("lifecycle");
  const expected = [
    ["scenario-garment-draft", "NEEDS_WORK", "Needs review", "KEEP_PRIVATE", false],
    ["scenario-garment-ready", "READY", "Ready to publish", "PUBLISH", true],
    ["scenario-garment-live", "LIVE", "Live", "VIEW_SHOP", true],
    ["scenario-garment-order", "LIVE", "Reserved", "VIEW_SHOP", true],
    ["scenario-garment-return", "SOLD", "Sold", "VIEW_OPERATIONS", true],
  ] as const;

  for (const [garmentId, stage, stageLabel, action, canPublish] of expected) {
    const garment = snapshot.garments.find((candidate) => candidate.id === garmentId);
    assert.ok(garment, `${garmentId} must exist`);
    const listing = snapshot.listings.find((candidate) => candidate.garmentId === garmentId);
    const workspace = selectPieceWorkspace({ garment, listing });
    assert.deepEqual(
      [workspace.stage, workspace.stageLabel, workspace.nextAction.kind, workspace.canPublish],
      [stage, stageLabel, action, canPublish],
    );
    assert.ok(workspace.nextAction.label.trim());
  }
});

test("G024 stays available as quiet Drop 01 history without becoming active work", () => {
  const snapshot = createStudioScenarioSnapshot("lifecycle");
  const garment = snapshot.garments.find((candidate) => candidate.id === "wardrobe-private-product-juw-024");
  assert.ok(garment);
  assert.equal(garment.privateWardrobeItemId, undefined);
  assert.equal(snapshot.listings.some((listing) => listing.garmentId === garment.id), false);

  const workspace = selectPieceWorkspace({ garment });
  assert.equal(workspace.stage, "PRIVATE");
  assert.equal(workspace.stageLabel, "Archived draft");
  assert.equal(workspace.nextAction.kind, "KEEP_PRIVATE");
  assert.deepEqual(workspace.captureRoles, []);
  assert.equal(studioScenarioRouteSupported(`/studio/wardrobe/${garment.id}`), true);
});

test("lifecycle attention counts only the one active draft", () => {
  const snapshot = createStudioScenarioSnapshot("lifecycle");
  assert.equal(actionableStudioDraftCount(snapshot.garments), 1);
});

test("Piece projection stays independent of viewport and presentation state", () => {
  const projection = readFileSync(`${root}/lib/studio/projections/piece-workspace.ts`, "utf8");
  assert.doesNotMatch(projection, /window|document|matchMedia|innerWidth|fetch\(|useState/);
});

test("dynamic intake captures reuse the private capture store after ownership validation", () => {
  const service = readFileSync(`${root}/lib/studio/engine/pending-capture-service.ts`, "utf8");
  const wardrobeRoute = readFileSync(`${root}/app/api/studio/wardrobe/route.ts`, "utf8");
  const captureRoute = readFileSync(`${root}/app/api/studio/wardrobe/[id]/captures/route.ts`, "utf8");
  const overlay = readFileSync(`${root}/lib/studio/db/server-wardrobe-overlay.ts`, "utf8");
  const migration = readFileSync(`${root}/drizzle/shop-postgres/0005_dazzling_sister_grimm.sql`, "utf8");

  assert.ok(service.indexOf("getOwnedWardrobeItem") < service.indexOf("listPendingProductCaptures", service.indexOf("ownedWardrobeCaptureContract")));
  assert.match(service, /upsertPendingProductCapture/);
  assert.match(captureRoute, /requireStudioOperator/);
  assert.match(wardrobeRoute, /directCaptures/);
  assert.match(overlay, /pending-capture-/);
  assert.match(migration, /studio_pending_product_captures/);
});

test("Piece surface uses one workspace, durable captures, and a universal accessible viewer", () => {
  const workbench = readFileSync(`${root}/components/studio/wardrobe-workbench.tsx`, "utf8");
  const viewer = readFileSync(`${root}/components/studio/media-viewer.tsx`, "utf8");
  const foundation = readFileSync(`${root}/app/foundation.css`, "utf8");

  assert.match(workbench, /selectPieceWorkspace/);
  assert.match(workbench, /<PieceWorkspaceView/);
  assert.match(workbench, /studio-garment-disclosure/);
  assert.match(workbench, /StudioMediaViewerProvider/);
  assert.match(workbench, /DraftDirectCaptures garment=\{garment\}/);
  assert.doesNotMatch(workbench, /Move to wardrobe|Clear gates|Create media/);
  assert.match(workbench, /Approved Shop previews appear here\./);
  assert.match(workbench, /VIEW_OPERATIONS/);
  assert.match(workbench, /Approve Shop preview/);
  assert.match(workbench, /setPublicationNeedsRefresh\(true\)/);
  assert.match(workbench, /function dismissShop\(\)[\s\S]*assignDocumentNavigation\(`\/studio\/wardrobe\/\$\{encodeURIComponent\(garment\.id\)\}`\)/);
  assert.match(workbench, /onDismiss=\{dismissShop\}/);
  assert.match(workbench, /aria-live="polite"><strong>Live in Shop/);
  assert.match(viewer, /onCancel/);
  assert.match(viewer, /popstate/);
  assert.match(viewer, /addEventListener\("keydown", onEscape, true\)/);
  assert.match(viewer, /origin\?\.focus/);
  assert.match(viewer, /aria-modal|showModal/);
  assert.match(foundation, /studio-media-viewer-stage > img:only-child \{ grid-column: 1 \/ -1; \}/);
});
