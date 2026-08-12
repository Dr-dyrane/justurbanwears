import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../db/studio-engine-migration.ts", import.meta.url), "utf8");

test("Studio schema activation is additive and idempotent", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS studio_intakes/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS studio_wardrobe_items/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS studio_operator_membership/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS studio_generations_intake_fingerprint_unique/);
  assert.match(source, /EXCEPTION WHEN duplicate_object THEN NULL/);
  assert.doesNotMatch(source, /DROP\s+(TABLE|TYPE|SCHEMA)/i);
});
