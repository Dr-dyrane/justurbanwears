import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import type { ShopServerOrder } from "../lib/shop/server-order/types";
import { projectConnectedStudioApplication } from "../lib/server/studio-application-projection";
import type { StudioOperator } from "../lib/server/studio-operator";
import {
  selectStudioProjectionFreshness,
  studioProjectionAsOfLabel,
} from "../lib/studio/application/projection-freshness";
import { selectStudioWorkProjection } from "../lib/studio/application/work-projection";
import { studioAssistantContextFromProjection } from "../lib/studio/assistant/projection";
import type {
  StudioAuthorityNotification,
  StudioAuthorityPiece,
  StudioAuthoritySnapshot,
} from "../lib/studio/services/studio-authority-client";

const NOW = "2026-09-02T20:15:00.000Z";
const source = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const operator: StudioOperator = {
  actorSubject: "actor-lulu",
  displayName: "Lulu",
  email: "lulu@example.com",
  role: "admin",
  subject: "workspace-subject",
  workspaceId: "juw-studio",
  workspaceSubject: "workspace-subject",
};

function piece(input: {
  availability?: StudioAuthorityPiece["availability"];
  hasLocationMismatch?: boolean;
  id: string;
}): StudioAuthorityPiece {
  return {
    activeHold: null,
    authorityRevision: `2026-09-02T20:1${input.id}.000000Z`,
    authorityUpdatedAt: NOW,
    availability: input.availability ?? "AVAILABLE",
    category: "Dress",
    colour: "Black",
    condition: "New",
    expectedCustody: "STUDIO",
    expectedLocationKey: "WARDROBE_RAIL",
    expectedLocationLabel: "Wardrobe rail",
    hasLocationMismatch: input.hasLocationMismatch ?? false,
    imageSrc: null,
    locationVersion: Number(input.id),
    observedAt: NOW,
    observedLocationKey: input.hasLocationMismatch ? "PACKING_SHELF" : "WARDROBE_RAIL",
    observedLocationLabel: input.hasLocationMismatch ? "Packing shelf" : "Wardrobe rail",
    orderReference: null,
    pieceKey: `piece-${input.id}`,
    sizeLabel: "M",
    sku: `JUW-0${input.id}`,
    title: `Piece ${input.id}`,
    wardrobeItemId: `wardrobe-${input.id}`,
  };
}

function dueOrder(): ShopServerOrder {
  return {
    allowedReturnTransitions: [],
    allowedTransitions: [{ dimension: "FULFILLMENT", target: "QUALITY_CHECK" }],
    cancellationRecovery: null,
    canRequestPaidCancellation: false,
    canRequestReturn: false,
    contact: { email: "customer@example.com", name: "Customer", phone: "+2348000000000" },
    deliveryEstimate: "By appointment",
    deliveryFee: 0,
    deliveryLabel: "Studio pickup",
    events: [],
    evidence: [],
    fulfillment: { kind: "PICKUP", optionId: "pickup" },
    fulfillmentFacts: {
      carrierName: null,
      deliveredAt: null,
      deliveryProofReference: null,
      dispatchReference: null,
      dispatchedAt: null,
      kind: "PICKUP",
      pickupAppointment: null,
      recipientName: null,
      trackingReference: null,
      trackingUrl: null,
    },
    fulfillmentStatus: "NOT_STARTED",
    fundsConfirmation: null,
    fundsConfirmationStatus: "CONFIRMED",
    id: "order-due",
    lifecycleStatus: "ACTIVE",
    lines: [{
      name: "Piece 5",
      quantity: 1,
      sku: "JUW-005",
      slug: "piece-5",
      snapshot: "PRODUCT",
      taggedSize: "M",
      unitPrice: 30_000,
    }],
    paymentReviewStatus: "REVIEW_APPROVED",
    reference: "JUW-ORDER-DUE",
    reservationExpiresAt: null,
    return: null,
    returnEligibleUntil: null,
    savedAt: NOW,
    source: "IN_PERSON",
    status: "ORDER_RECEIVED",
    subtotal: 30_000,
    total: 30_000,
    transmission: "SUBMITTED",
    version: 1,
  };
}

function notification(id: string): StudioAuthorityNotification {
  return {
    actionLabel: "Review update",
    createdAt: NOW,
    detail: "An informational update that duplicates another lane.",
    href: "/studio/operations",
    id,
    kind: "LOCATION",
    title: `Update ${id}`,
    tone: "attention",
  };
}

function authorityFixture(): StudioAuthoritySnapshot {
  return {
    generatedAt: NOW,
    holds: [],
    media: [],
    models: [],
    notifications: [notification("one"), notification("two"), notification("three")],
    orders: [dueOrder()],
    pieces: [
      piece({ availability: "PRIVATE", id: "1" }),
      piece({ availability: "PRIVATE", id: "2" }),
      piece({ hasLocationMismatch: true, id: "3" }),
      piece({ hasLocationMismatch: true, id: "4" }),
    ],
  };
}

test("one canonical selector separates private drafts and notification feed from actionable attention", () => {
  const authority = authorityFixture();
  const work = selectStudioWorkProjection(authority);

  assert.equal(work.attentionCount, 3);
  assert.equal(work.drafts.length, 2);
  assert.equal(work.locationMismatches.length, 2);
  assert.equal(work.dueOrders.length, 1);
  assert.equal(work.dueReturns.length, 0);

  const projection = projectConnectedStudioApplication({ authority, now: NOW, operator });
  assert.equal(projection.summary.attention.value, work.attentionCount);
  assert.equal(projection.summary.drafts.value, work.drafts.length);
  assert.deepEqual(projection.continueAction, {
    href: "/studio/operations?view=inventory",
    id: "locations",
    label: "Review 2 locations",
    openCount: 2,
    source: "CONNECTED",
  });
  assert.notEqual(projection.continueAction?.openCount, projection.summary.attention.value);

  const ask = studioAssistantContextFromProjection(projection);
  assert.equal(ask.summary.attention, work.attentionCount);
  assert.equal(ask.summary.drafts, work.drafts.length);
});

test("a retained projection plus refresh error is explicitly stale and retains its as-of time", () => {
  assert.deepEqual(selectStudioProjectionFreshness({
    error: "Refresh failed.",
    generatedAt: NOW,
    status: "ready",
  }), {
    asOf: NOW,
    state: "STALE",
  });
  assert.match(studioProjectionAsOfLabel(NOW), /^Last updated /);

  assert.deepEqual(selectStudioProjectionFreshness({
    error: "Refresh failed.",
    generatedAt: null,
    status: "error",
  }), {
    asOf: null,
    state: "UNAVAILABLE",
  });
  assert.deepEqual(selectStudioProjectionFreshness({
    error: "",
    generatedAt: null,
    status: "loading",
  }), {
    asOf: null,
    state: "LOADING",
  });
});

test("Operations refreshes exact authority before minting or dispatching a location command", async () => {
  const operations = await source("components/studio/operations-desk.tsx");
  const refreshStart = operations.indexOf("async function refreshReviewedPiece(");
  const refreshEnd = operations.indexOf("\n  async function saveHold", refreshStart);
  assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, "authority refresh boundary is missing");
  const refreshBody = operations.slice(refreshStart, refreshEnd);
  const authorityRead = refreshBody.indexOf("await authority.refresh()");
  const exactPiece = refreshBody.indexOf(".pieces.find", authorityRead);
  const revisionCheck = refreshBody.indexOf("current.authorityRevision !== reviewed.authorityRevision", exactPiece);
  const versionCheck = refreshBody.indexOf("current.locationVersion !== reviewed.locationVersion", revisionCheck);
  assert.ok(
    authorityRead >= 0
      && authorityRead < exactPiece
      && exactPiece < revisionCheck
      && revisionCheck < versionCheck,
    "the reviewed piece must be refreshed and revision-checked before use",
  );
  assert.match(refreshBody, /if \(!refreshed\) return \{ error: AUTHORITY_REFRESH_BLOCKER, piece: null \}/);
  assert.match(refreshBody, /if \(!current\) \{/);

  const start = operations.indexOf("async function recordLocation(");
  const end = operations.indexOf("\n  function confirmLocationReview", start);
  assert.ok(start >= 0 && end > start, "location command boundary is missing");
  const body = operations.slice(start, end);

  const refresh = body.indexOf("await refreshReviewedPiece(piece)");
  const block = body.indexOf("if (!fresh.piece)", refresh);
  const mint = body.indexOf("mutationFingerprint(JSON.stringify(request))", block);
  const dispatch = body.indexOf("authority.recordLocation", mint);
  assert.ok(
    refresh >= 0 && refresh < block && block < mint && mint < dispatch,
    "fresh authority and exact piece resolution must precede idempotency minting and dispatch",
  );
  assert.match(body, /if \(!fresh\.piece\) \{[\s\S]*?return \{ error: fresh\.error, ok: false \}/);
});

test("Home, desktop context, and Ask render retained projection freshness instead of implying live state", async () => {
  const [home, desktop, ask, notice] = await Promise.all([
    source("components/studio/studio-home.tsx"),
    source("components/studio/navigation/studio-desktop-context-stage.tsx"),
    source("components/studio/navigation/studio-ask-surface.tsx"),
    source("components/studio/atoms/studio-projection-freshness.tsx"),
  ]);

  for (const surface of [home, desktop, ask]) {
    assert.match(surface, /selectStudioProjectionFreshness/);
    assert.match(surface, /application\.error/);
    assert.match(surface, /application\.status/);
    assert.match(surface, /STALE/);
    assert.match(surface, /Last-known Studio/);
  }

  assert.match(home, /StudioProjectionFreshnessNotice/);
  assert.match(desktop, /studioProjectionAsOfLabel\(freshness\.asOf\)/);
  assert.match(desktop, /data-context-state=\{[\s\S]*?stale \? "stale" : "ready"/);
  assert.match(ask, /generatedAt: projected\.generatedAt/);
  assert.match(ask, /status: applicationFreshness\.state === "STALE"[\s\S]*?"degraded"/);
  assert.match(notice, /studioProjectionAsOfLabel\(asOf\)/);
  assert.match(notice, /Last-known Studio/);
  assert.match(notice, /Try again/);
});

test("retry preserves a stale marker until fresh data replaces the retained projection", async () => {
  const provider = await source("components/studio/studio-provider.tsx");

  for (const [startMarker, endMarker, errorSetter, snapshotSetter] of [
    [
      "const refreshApplication = useCallback",
      "const refreshAuthority = useCallback",
      "setApplicationError",
      "setApplicationSnapshot",
    ],
    [
      "const refreshAuthority = useCallback",
      "useEffect(() =>",
      "setAuthorityError",
      "setAuthoritySnapshot",
    ],
  ] as const) {
    const start = provider.indexOf(startMarker);
    const end = provider.indexOf(endMarker, start + startMarker.length);
    assert.ok(start >= 0 && end > start, `${startMarker} boundary is missing`);
    const body = provider.slice(start, end);
    const success = body.indexOf(snapshotSetter);
    const clear = body.indexOf(`${errorSetter}("")`);
    assert.ok(success >= 0 && clear > success, `${errorSetter} must clear only after fresh data arrives`);
    assert.equal(
      body.slice(0, success).includes(`${errorSetter}("")`),
      false,
      `${errorSetter} must remain visible while retained data is revalidating`,
    );
  }
});
