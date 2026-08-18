import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  locationCommandSchema,
  STUDIO_AUTHORITY_REQUIRED_SQL,
} from "../lib/server/studio-authority-repository";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("normal location work separates a physical check from an authoritative move", () => {
  assert.equal(locationCommandSchema.safeParse({
    command: "CONFIRM",
    idempotencyKey: "confirm:piece-001",
    locationKey: "WARDROBE_RAIL",
    pieceKey: "sku:JUW-001",
  }).success, true);
  assert.equal(locationCommandSchema.safeParse({
    command: "MOVE",
    idempotencyKey: "move:piece-001",
    locationKey: "PACKING_SHELF",
    pieceKey: "sku:JUW-001",
  }).success, true);
  assert.equal(locationCommandSchema.safeParse({
    command: "MOVE",
    idempotencyKey: "move:piece-001",
    locationKey: "CUSTOMER",
    pieceKey: "sku:JUW-001",
  }).success, false);

  const ddl = STUDIO_AUTHORITY_REQUIRED_SQL.join("\n");
  assert.match(ddl, /create table studio_piece_custody_commands/);
  assert.match(ddl, /unique \(operator_subject, idempotency_key\)/);
  assert.match(ddl, /create table studio_piece_custody/);
  assert.match(ddl, /primary key \(operator_subject, piece_key\)/);
});

test("authoritative Studio surfaces no longer expose local commerce or mock media mutations", async () => {
  const [operations, models, gallery, detail] = await Promise.all([
    read("components/studio/operations-desk.tsx"),
    read("components/studio/model-atelier.tsx"),
    read("components/shoot/shoot-gallery.tsx"),
    read("components/shoot/shoot-detail.tsx"),
  ]);
  assert.doesNotMatch(operations, /reserveOrder|fulfillOrder|cancelOrder|openReturn|disposeReturn/);
  assert.doesNotMatch(models, /createModel\(|updateModel\(/);
  assert.doesNotMatch(`${gallery}\n${detail}`, /createMockShoot|MOCK FRAME|LOCAL \/ SAFE/);
  assert.match(operations, /command: "CONFIRM" \| "MOVE"/);
});
