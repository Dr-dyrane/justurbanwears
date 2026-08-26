import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { MEDIA_STATE_PRESENTATION } from "../components/shoot/media-state-presentation";
import {
  createMediaReviewIntent,
  mediaReviewIntentReflected,
  persistMediaReviewIntent,
  readMediaReviewIntent,
  reconcileMediaReviewIntent,
} from "../components/shoot/media-review-client";
import type {
  StudioAuthorityMedia,
  StudioAuthoritySnapshot,
} from "../lib/studio/services/studio-authority-client";

const root = process.cwd();
const read = (file: string) => readFileSync(join(root, file), "utf8");
const gallery = read("components/shoot/shoot-gallery.tsx");
const detail = read("components/shoot/shoot-detail.tsx");
const OPERATOR_SCOPE = "c".repeat(64);
const OTHER_OPERATOR_SCOPE = "d".repeat(64);

function media(overrides: Partial<StudioAuthorityMedia> = {}): StudioAuthorityMedia {
  return {
    id: "media-1",
    wardrobeItemId: "wardrobe-1",
    title: "Coral dress",
    sku: "JUW-001",
    operation: "MODEL_TRY_ON",
    state: "COMPLETE",
    outputUrl: "/api/studio/private/media-1",
    modelName: "Lulu",
    costUsd: "0.10",
    createdAt: "2026-08-26T10:00:00.000Z",
    updatedAt: "2026-08-26T10:00:00.000Z",
    ...overrides,
  };
}

function snapshot(items: StudioAuthorityMedia[]): StudioAuthoritySnapshot {
  return {
    generatedAt: "2026-08-26T10:01:00.000Z",
    holds: [],
    media: items,
    models: [],
    notifications: [],
    orders: [],
    pieces: [],
  };
}

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string) { return values.get(key) ?? null; },
    removeItem(key: string) { values.delete(key); },
    setItem(key: string, value: string) { values.set(key, value); },
  };
}

test("media lifecycle presentation keeps materialization distinct from approval", () => {
  assert.equal(MEDIA_STATE_PRESENTATION.PENDING.label, "Queued");
  assert.equal(MEDIA_STATE_PRESENTATION.RUNNING.label, "Running");
  assert.equal(MEDIA_STATE_PRESENTATION.COMPLETE.label, "Awaiting review");
  assert.match(MEDIA_STATE_PRESENTATION.COMPLETE.detail, /ready to review/);
  assert.match(MEDIA_STATE_PRESENTATION.COMPLETE.detail, /not approved yet/);
  assert.equal(MEDIA_STATE_PRESENTATION.APPROVED.label, "Approved");
  assert.equal(MEDIA_STATE_PRESENTATION.REJECTED.label, "Rejected");
  assert.equal(MEDIA_STATE_PRESENTATION.FAILED.label, "Failed");
  assert.equal(MEDIA_STATE_PRESENTATION.INDETERMINATE.label, "Needs checking");
  assert.notEqual(MEDIA_STATE_PRESENTATION.COMPLETE.label, MEDIA_STATE_PRESENTATION.APPROVED.label);
});

test("filtered-empty Media keeps Show all primary and reserves Create media for a truly empty archive", () => {
  assert.match(gallery, /media\.length === 0[\s\S]*?Create media[\s\S]*?button button-primary[\s\S]*?Show all/);
  assert.match(gallery, /The \$\{selectedFilterLabel\} filter is empty/);
  assert.match(gallery, /setFilter\("ALL"\)/);
  assert.match(gallery, /"REJECTED",[\s\S]*?"FAILED",[\s\S]*?"INDETERMINATE"/);
});

test("review decisions fail closed and map one bounded fix to the correct engine command", () => {
  assert.match(detail, /decision === "FIX" && !correction/);
  assert.match(detail, /decision === "KEEP" && completion && !truthConfirmed/);
  assert.match(detail, /decision === "FIX" \? \(completion \? "RETRY" : "EDIT"\) : decision/);
  assert.match(detail, /decision === "FIX" \? correction : undefined/);
  assert.match(detail, /pendingRef\.current/);
  assert.match(detail, /persistMediaReviewIntent\(intent, operatorScope\)/);
  assert.match(detail, /reconcileMediaReviewIntent\(intent\)/);
  assert.match(detail, /Decision outcome unconfirmed/);
  assert.match(detail, /maxLength=\{500\}/);
  assert.doesNotMatch(detail, /note\.trim\(\) \|\| undefined|decide\("RETRY"\)|Retry once/);
});

test("review recovery intents are minimal and isolated by opaque operator scope", () => {
  const storage = memoryStorage();
  const current = media();
  const intent = createMediaReviewIntent({
    decision: "KEEP",
    id: "10000000-0000-4000-8000-000000000001",
    media: current,
    snapshot: snapshot([current]),
  });
  persistMediaReviewIntent(intent, OPERATOR_SCOPE, storage);

  assert.deepEqual(readMediaReviewIntent(OPERATOR_SCOPE, current.id, storage), intent);
  assert.equal(readMediaReviewIntent(OTHER_OPERATOR_SCOPE, current.id, storage), undefined);
  assert.equal("correction" in intent, false);
});

test("review reconciliation binds the exact state transition or a new correction generation", async () => {
  const current = media();
  const keep = createMediaReviewIntent({
    decision: "KEEP",
    id: "10000000-0000-4000-8000-000000000001",
    media: current,
    snapshot: snapshot([current]),
  });
  assert.equal(mediaReviewIntentReflected(keep, snapshot([{ ...current, state: "APPROVED" }])), true);
  assert.equal(mediaReviewIntentReflected(keep, snapshot([{ ...current, state: "COMPLETE" }])), false);

  const fix = { ...keep, decision: "FIX" as const };
  const correction = media({ id: "media-2", state: "PENDING" });
  assert.equal(mediaReviewIntentReflected(fix, snapshot([current, correction])), true);
  assert.equal(mediaReviewIntentReflected(fix, snapshot([current])), false);

  let reads = 0;
  const result = await reconcileMediaReviewIntent(keep, async () => {
    reads += 1;
    return snapshot([{ ...current, state: "APPROVED" }]);
  });
  assert.equal(result.kind, "reflected");
  assert.equal(reads, 1);
});
