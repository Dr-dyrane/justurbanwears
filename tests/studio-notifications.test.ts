import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { Garment, StudioListing, StudioOrder, StudioReturn } from "../lib/studio/domain/entities";
import { createInitialStudioState } from "../lib/studio/domain/state";
import { deriveStudioNotifications } from "../lib/studio/notifications";

const root = process.cwd();

test("Studio updates prioritize failures and actionable commerce work", () => {
  const state = createInitialStudioState();
  state.persistence = "unavailable";
  state.orders.push({ id: "order-1", state: "RESERVED" } as unknown as StudioOrder);
  state.returns.push({ id: "return-1", state: "DRAFT" } as unknown as StudioReturn);
  state.garments.push({ id: "garment-1", state: "DRAFT" } as unknown as Garment);

  const notifications = deriveStudioNotifications(state);
  assert.deepEqual(notifications.slice(0, 4).map((item) => item.kind), ["PERSISTENCE", "ORDER", "RETURN", "WARDROBE"]);
  assert.equal(notifications[1].href, "/studio/operations?view=orders");
  assert.equal(notifications[2].href, "/studio/operations?view=returns");
});

test("a listing lifecycle change creates a new signature and completion clears it", () => {
  const state = createInitialStudioState();
  state.listings.push({ id: "listing-1", state: "DRAFT" } as unknown as StudioListing);
  const draftId = deriveStudioNotifications(state).find((item) => item.kind === "PUBLISHING")?.id;

  state.listings[0].state = "READY";
  const readyId = deriveStudioNotifications(state).find((item) => item.kind === "PUBLISHING")?.id;
  assert.notEqual(draftId, readyId);

  state.listings[0].state = "PUBLISHED";
  assert.equal(deriveStudioNotifications(state).some((item) => item.kind === "PUBLISHING"), false);
});

test("the centre is accessible, state-derived, and documented without delivery overclaim", () => {
  const centre = readFileSync(`${root}/components/studio/notifications/studio-notification-center.tsx`, "utf8");
  const shell = readFileSync(`${root}/components/studio/app-shell.tsx`, "utf8");
  const adr = readFileSync(`${root}/docs/adr/0043-studio-notifications-and-system-readiness.md`, "utf8");

  assert.match(shell, /<StudioNotificationCenter \/>/);
  assert.match(centre, /aria-controls="studio-notification-centre"/);
  assert.match(centre, /aria-live="polite"/);
  assert.match(centre, /unresolvedCount/);
  assert.doesNotMatch(centre, /Mark all read/);
  assert.doesNotMatch(centre, /onClick=\{\(\) =>.*markRead/);
  assert.match(adr, /does not claim background Web Push, email, SMS, WhatsApp, or cross-device inbox delivery/);
  assert.match(adr, /Arbitrary catalogue create\/update\/delete from Studio \| Not ready/);
  assert.match(adr, /Connected customer orders and inventory \| Not ready/);
});
