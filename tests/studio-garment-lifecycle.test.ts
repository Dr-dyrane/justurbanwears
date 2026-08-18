import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { garmentLifecycleCommandSchema } from "../lib/studio/engine/garment-lifecycle-contracts";

const root = process.cwd();
const publicationRepository = readFileSync(`${root}/lib/server/studio-catalogue-publication-repository.ts`, "utf8");
const lifecycleRepository = readFileSync(`${root}/lib/server/studio-garment-lifecycle-repository.ts`, "utf8");
const lifecycleService = readFileSync(`${root}/lib/studio/engine/garment-lifecycle-service.ts`, "utf8");
const lifecyclePanel = readFileSync(`${root}/components/studio/garment-lifecycle-panel.tsx`, "utf8");
const intakeRoute = readFileSync(`${root}/app/api/studio/intakes/route.ts`, "utf8");
const intakeSheet = readFileSync(`${root}/components/studio/garment-intake/garment-intake-sheet.tsx`, "utf8");

const facts = {
  title: "Coral dress",
  category: "Dress" as const,
  colour: "Coral",
  sizeLabel: "UK 10",
  condition: "Excellent",
  price: 25_000,
};

test("live garment commands require explicit, versioned intent", () => {
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "SAVE_FACTS",
    expectedVersion: 3,
    facts,
  }).success, true);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "PUBLISH_REVISION",
    expectedRevision: "a".repeat(64),
    idempotencyKey: "revision:coral:4",
    confirmation: "PUBLISH_REVISION",
    publicMediaConfirmed: true,
  }).success, true);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "PUBLISH_REVISION",
    expectedRevision: "a".repeat(64),
    idempotencyKey: "revision:coral:4",
    confirmation: "PUBLISH_REVISION",
    publicMediaConfirmed: false,
  }).success, false);
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "ARCHIVE",
    expectedVersion: 3,
  }).success, false);
});

test("a revision swaps garment truth and Shop projection only after all guards pass", () => {
  assert.match(publicationRepository, /publishCatalogueRevisionAtomically/);
  assert.match(publicationRepository, /publication\.source_revision = \$\{input\.baseSourceRevision\}/);
  assert.match(publicationRepository, /revision\.version = \$\{input\.revisionVersion\}/);
  assert.match(publicationRepository, /inventory\.reserved = 0/);
  assert.match(publicationRepository, /update shop_catalogue_items target/);
  assert.match(publicationRepository, /update studio_catalogue_publications target/);
  assert.match(publicationRepository, /case when revision\.id = revision_source\.id then 'PUBLISHED' else 'SUPERSEDED' end/);
  assert.match(publicationRepository, /'REVISION_PUBLISHED'/);
  assert.match(lifecycleService, /Promise\.all\(context\.sources\.map\(\(source\) => publishStudioPublicationMedia/);
  assert.match(lifecycleService, /changed during publishing/);
});

test("unpublish and archive fail closed around reservation and sale truth", () => {
  assert.match(lifecycleRepository, /fromInventory = input\.command === "UNPUBLISH" \? "AVAILABLE" : "ARCHIVED"/);
  assert.match(lifecycleRepository, /inventory\.on_hand = 1/);
  assert.match(lifecycleRepository, /inventory\.reserved = 0/);
  assert.match(lifecycleRepository, /inventory\.sold = inventory\.returned/);
  assert.match(lifecycleService, /Check that it is not reserved or sold/);
});

test("Piece exposes direct price, media, visibility and history controls", () => {
  assert.match(lifecyclePanel, />Change price</);
  assert.match(lifecyclePanel, /Replace \{role === "GARMENT_FRONT"/);
  assert.match(lifecyclePanel, /"Publish changes"/);
  assert.match(lifecyclePanel, /Remove from Shop/);
  assert.match(lifecyclePanel, /Return to Shop/);
  assert.match(lifecyclePanel, />Archive</);
  assert.match(lifecyclePanel, />History</);
  assert.match(lifecyclePanel, /Changes stay private until you publish them\./);
});

test("unfinished durable intakes are discoverable and resumable", () => {
  assert.match(intakeRoute, /export async function GET/);
  assert.match(intakeRoute, /listRecoverableIntakes/);
  assert.match(intakeSheet, /recoverableIntakes/);
  assert.match(intakeSheet, /resumeIntake/);
  assert.match(intakeSheet, /client\.getIntake/);
  assert.match(intakeSheet, /hasDurableSource/);
  assert.match(intakeSheet, /Checking unfinished work/);
});
