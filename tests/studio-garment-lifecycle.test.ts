import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { garmentLifecycleCommandSchema } from "../lib/studio/engine/garment-lifecycle-contracts";

const root = process.cwd();
const publicationRepository = readFileSync(`${root}/lib/server/studio-catalogue-publication-repository.ts`, "utf8");
const intakeRepository = readFileSync(`${root}/lib/server/studio-intake-repository.ts`, "utf8");
const lifecycleRepository = readFileSync(`${root}/lib/server/studio-garment-lifecycle-repository.ts`, "utf8");
const lifecycleService = readFileSync(`${root}/lib/studio/engine/garment-lifecycle-service.ts`, "utf8");
const lifecyclePanel = readFileSync(`${root}/components/studio/garment-lifecycle-panel.tsx`, "utf8");
const dossier = readFileSync(`${root}/components/studio/garment-dossier.tsx`, "utf8");
const intakeRoute = readFileSync(`${root}/app/api/studio/intakes/route.ts`, "utf8");
const intakeSheet = readFileSync(`${root}/components/studio/garment-intake/garment-intake-sheet.tsx`, "utf8");

const facts = {
  title: "Coral dress",
  description: "A coral dress with a softly draped neckline.",
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
  const priceOnlyCompatibleFacts = {
    title: facts.title,
    category: facts.category,
    colour: facts.colour,
    sizeLabel: facts.sizeLabel,
    condition: facts.condition,
    price: facts.price,
  };
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "SAVE_FACTS",
    expectedVersion: 3,
    facts: priceOnlyCompatibleFacts,
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
  assert.equal(garmentLifecycleCommandSchema.safeParse({
    command: "SAVE_FACTS",
    expectedVersion: 3,
    facts: { ...facts, description: "   " },
  }).success, false);
});

test("Shop description follows the existing private revision and public note contract", () => {
  assert.match(lifecyclePanel, /<span>Shop description<\/span><textarea/);
  assert.match(lifecyclePanel, /setDraftFacts\(\{ \.\.\.draftFacts, description: event\.target\.value \}\)/);
  assert.match(lifecycleService, /\["description", "Shop description"\]/);
  assert.match(lifecycleService, /description: requiredDescription\(facts\)/);
  assert.match(lifecycleService, /description: requiredDescription\(currentFacts\)/);
  assert.match(lifecycleService, /const fallbackFacts = draft\?\.facts \?\? \(publication \? liveFacts\(publication, item\) : itemFacts\(context\.item\)\)/);
  assert.match(lifecycleService, /const facts = withDescription\(input\.facts, fallbackFacts\)/);
  assert.match(lifecycleRepository, /facts = intake\.facts \|\| \$\{JSON\.stringify\(input\.facts\)\}::jsonb/);
  assert.match(lifecycleRepository, /select intake\.facts->>'description' as description/);
  assert.match(publicationRepository, /description: shopCatalogueItems\.note/);
  assert.match(publicationRepository, /note = \$\{input\.description\}/);
  assert.match(publicationRepository, /\$\{input\.description\}, \$\{`\$\{input\.colour\} · \$\{input\.condition\}`\}/);
  assert.doesNotMatch(publicationRepository, /story = \$\{input\.description\}/);
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

test("catalogue-adopted revisions update reviewed facts while preserving the authored photo set", () => {
  const adoptedPublication = publicationRepository.match(
    /export async function publishAdoptedCatalogueRevisionAtomically[\s\S]*?(?=export async function publishAtelierAdoptionRevisionAtomically|function resultRows)/,
  )?.[0] ?? "";
  assert.match(publicationRepository, /publishAdoptedCatalogueRevisionAtomically/);
  assert.match(publicationRepository, /publication\.origin = 'CATALOGUE_ADOPTED'/);
  assert.match(publicationRepository, /revision\.media = publication\.media/);
  assert.match(adoptedPublication, /and item\.version = \$\{input\.expectedVersion\}[\s\S]*?inventory_ready as/);
  assert.match(publicationRepository, /set name = \$\{input\.title\}, category = \$\{input\.category\}, price = \$\{input\.price\}/);
  assert.match(adoptedPublication, /note = \$\{input\.description\}/);
  assert.doesNotMatch(
    adoptedPublication,
    /media = \$\{JSON\.stringify/,
  );
  assert.match(lifecycleService, /isCatalogueAdopted\(publication\)/);
  assert.match(lifecyclePanel, /approved catalogue photo set stays unchanged/);
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
  assert.match(lifecyclePanel, /type FactsEditMode = "details" \| "price"/);
  assert.match(lifecyclePanel, /beginEdit\("price"\)/);
  assert.match(lifecyclePanel, /editMode === "details" \? <label className="studio-field"><span>Name<\/span>/);
  assert.match(lifecyclePanel, /editMode === "price" \? "Save price"/);
  assert.match(lifecyclePanel, /Replace \{role === "GARMENT_FRONT"/);
  assert.match(lifecyclePanel, /"Publish changes"/);
  assert.match(lifecyclePanel, /Remove from Shop/);
  assert.match(lifecyclePanel, /Return to Shop/);
  assert.match(lifecyclePanel, />Archive</);
  assert.match(lifecyclePanel, />History</);
  assert.match(lifecyclePanel, /Changes stay private until you publish them\./);
  assert.match(lifecyclePanel, /aria-label="Final Shop listing"/);
  assert.match(lifecyclePanel, /<small>Customers will see<\/small>/);
  assert.match(lifecyclePanel, /workspace\.draft\.facts\.description/);
  assert.match(lifecyclePanel, /Price saved\./);
  assert.match(lifecyclePanel, /Garment details saved\./);
  assert.match(lifecyclePanel, /Garment photo saved\./);
  assert.match(lifecyclePanel, /The photo is in the private revision; the current Shop listing is unchanged\./);
  assert.match(lifecyclePanel, /milestoneRef\.current\?\.focus\(\{ preventScroll: true \}\)/);
  assert.match(dossier, /searchParams\.get\("action"\) === "price"/);
  assert.match(lifecyclePanel, /initialAction !== "price"/);
  assert.match(lifecyclePanel, /priceRef\.current\?\.focus/);
});

test("lifecycle mutations are synchronous single-flight and reconcile authoritative state or exact receipts", () => {
  assert.match(lifecyclePanel, /const commandInFlightRef = useRef\(false\)/);
  assert.match(lifecyclePanel, /if \(commandInFlightRef\.current\) return \{ error: "Another Studio change is still finishing\."/);
  assert.match(lifecyclePanel, /const reconciled = await readWorkspace\(\)\.catch\(\(\) => null\)/);
  assert.match(lifecyclePanel, /commandIsReflected\(reconciled, value\)/);
  assert.match(lifecyclePanel, /lifecycle\/media\?idempotencyKey=/);
  assert.match(lifecyclePanel, /mediaReceiptMatchesCommand\(reconciled\.receipt, commandIdentity, wardrobeItemId\)/);
  assert.doesNotMatch(lifecyclePanel, /reconciled\.itemVersion > expectedVersion/);
  assert.match(lifecyclePanel, /commandInFlightRef\.current = false/);
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

test("garment create, read, update and archive stay in the canonical Studio scope", () => {
  assert.match(intakeRepository, /operatorSubject: input\.operator\.subject/);
  assert.match(lifecycleService, /getOwnedWardrobeItem\(wardrobeItemId, operator\.subject\)/);
  assert.match(lifecycleService, /updatePrivateGarmentFacts\(\{[\s\S]*?operatorSubject: input\.operator\.subject/);
  assert.match(lifecycleService, /updateDraftGarmentRevision\(\{[\s\S]*?operatorSubject: input\.operator\.subject/);
  assert.match(lifecycleService, /discardDraftGarmentRevision\(\{[\s\S]*?operatorSubject: input\.operator\.subject/);
  assert.match(lifecycleService, /changePublicationVisibility\(\{[\s\S]*?operatorSubject: input\.operator\.subject/);
  assert.match(lifecycleService, /archiveGarment\(\{[\s\S]*?operatorSubject: input\.operator\.subject/);
  assert.doesNotMatch(lifecycleService, /operator\.role/);
});
