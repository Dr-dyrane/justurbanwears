import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../db/studio-engine-migration.ts", import.meta.url), "utf8");
const sharedWorkspaceMigration = await readFile(
  new URL("../drizzle/shop-postgres/0021_shared_juw_studio.sql", import.meta.url),
  "utf8",
);

test("Studio schema activation is additive and idempotent", () => {
  assert.match(source, /CREATE TABLE IF NOT EXISTS studio_intakes/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS studio_wardrobe_items/);
  assert.match(source, /CREATE TABLE IF NOT EXISTS studio_operator_membership/);
  assert.match(source, /CREATE UNIQUE INDEX IF NOT EXISTS studio_generations_intake_fingerprint_unique/);
  assert.match(source, /EXCEPTION WHEN duplicate_object THEN NULL/);
  assert.doesNotMatch(source, /DROP\s+(TABLE|TYPE|SCHEMA)/i);
});

test("the JUW workspace migration links existing members without rewriting Studio ownership", () => {
  assert.match(sharedWorkspaceMigration, /CREATE TABLE (?:IF NOT EXISTS )?"?studio_workspaces"?/i);
  assert.match(sharedWorkspaceMigration, /'juw-studio'/);
  assert.match(sharedWorkspaceMigration, /data_subject/);
  assert.match(sharedWorkspaceMigration, /ADD COLUMN (?:IF NOT EXISTS )?"?workspace_id"?/i);
  assert.match(sharedWorkspaceMigration, /studio_operator_membership_workspace_active_role_idx/);
  assert.match(sharedWorkspaceMigration, /count\(\*\).*membership_count/is);
  assert.match(sharedWorkspaceMigration, /membership\.auth_subject = canonical_data_subject/);
  assert.match(sharedWorkspaceMigration, /UPDATE "studio_operator_membership"[\s\S]*SET "workspace_id"/i);
  assert.match(sharedWorkspaceMigration, /STUDIO_WORKSPACE_ADOPTED_OWNER_AMBIGUOUS/);
  assert.match(sharedWorkspaceMigration, /STUDIO_WORKSPACE_ADOPTED_OWNER_MEMBERSHIP_MISSING/);
  assert.doesNotMatch(sharedWorkspaceMigration, /INSERT\s+INTO\s+"?studio_operator_membership"?/i);
  assert.doesNotMatch(
    sharedWorkspaceMigration,
    /UPDATE\s+"?studio_(?:intakes|wardrobe_items|catalogue_publications|garment_revisions|garment_events)"?/i,
  );
  assert.doesNotMatch(sharedWorkspaceMigration, /superadmin/i);
  assert.doesNotMatch(sharedWorkspaceMigration, /DROP\s+(?:TABLE|TYPE|SCHEMA)/i);
});
