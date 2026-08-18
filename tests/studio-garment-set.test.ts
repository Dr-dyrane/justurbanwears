import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  garmentSetSlotKeys,
  startGarmentSetSchema,
} from "../lib/studio/engine/garment-set-contracts";

const service = readFileSync(new URL("../lib/studio/engine/garment-set-service.ts", import.meta.url), "utf8");
const surface = readFileSync(new URL("../components/studio/garment-set-builder.tsx", import.meta.url), "utf8");

test("the set is explicit, bounded and cost-confirmed", () => {
  assert.deepEqual(garmentSetSlotKeys, [
    "GARMENT_FRONT",
    "GARMENT_BACK",
    "FABRIC_DETAIL",
    "MANNEQUIN_FRONT",
    "LULU_TRY_ON",
    "EDITORIAL_LULU",
  ]);
  assert.equal(startGarmentSetSchema.safeParse({ costConfirmed: true }).success, true);
  assert.equal(startGarmentSetSchema.safeParse({ costConfirmed: false }).success, false);
});

test("the orchestrator reuses durable jobs and preserves review gates", () => {
  assert.match(service, /createMediaCompletion/);
  assert.match(service, /generateWearCandidate/);
  assert.match(service, /sourceMode:\s*"APPROVED_FRONT"/);
  assert.match(service, /luluTryOn\?\.state === "APPROVED"/);
  assert.match(service, /Promise\.allSettled\(tasks\)/);
  assert.doesNotMatch(service, /decideMediaCompletion|decideWearCandidate/);
});

test("inferred views require a visual human decision", () => {
  assert.match(surface, /AI-completed view/);
  assert.match(surface, /Yes, it matches/);
  assert.match(surface, /truthConfirmed:\s*true/);
  assert.match(surface, /StudioMediaButton/);
  assert.match(surface, /Everything remains private until published/);
});
