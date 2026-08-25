import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  StudioEngineError,
  type IntakeFacts,
} from "../components/studio/garment-intake/engine-client";
import {
  STUDIO_SCENARIOS,
  createStudioScenarioIntakeClient,
  createStudioScenarioService,
  createStudioScenarioSnapshot,
  parseStudioScenario,
  studioScenarioHref,
  studioScenarioRouteSupported,
} from "../lib/studio/simulator";
import { projectStudioDropScopes } from "../lib/studio/projections/drop-context";

const root = new URL("../", import.meta.url);
const source = (path: string) => readFileSync(new URL(path, root), "utf8");

test("Studio scenarios are an exact development-only allowlist", () => {
  assert.deepEqual(STUDIO_SCENARIOS, ["lifecycle", "intake-error"]);
  assert.equal(parseStudioScenario("lifecycle", true), "lifecycle");
  assert.equal(parseStudioScenario("intake-error", true), "intake-error");
  assert.equal(parseStudioScenario("LIFECYCLE", true), null);
  assert.equal(parseStudioScenario("orders", true), null);
  assert.equal(parseStudioScenario("lifecycle", false), null, "production must ignore the query");
  assert.equal(parseStudioScenario(null, true), null);
});

test("the lifecycle fixture overlays the complete sanitized catalogue", () => {
  const snapshot = createStudioScenarioSnapshot("lifecycle");
  const lifecycleGarmentIds = [
    "scenario-garment-draft",
    "scenario-garment-ready",
    "scenario-garment-live",
    "scenario-garment-order",
    "scenario-garment-return",
  ];
  assert.deepEqual(
    lifecycleGarmentIds.map((id) => snapshot.garments.find((garment) => garment.id === id)?.state),
    ["DRAFT", "READY", "PUBLISHED", "RESERVED", "SOLD"],
  );
  assert.deepEqual(
    snapshot.listings
      .filter((listing) => listing.garmentId.startsWith("scenario-garment-") && listing.garmentId !== "scenario-garment-draft")
      .map((listing) => listing.state),
    ["READY", "PUBLISHED", "RESERVED", "SOLD"],
  );
  assert.deepEqual(snapshot.orders.map((order) => order.state), ["RESERVED", "SOLD"]);
  assert.deepEqual(snapshot.returns.map((returnCase) => returnCase.state), ["DRAFT"]);
  assert.equal(snapshot.garments.length, 46);
  assert.equal(snapshot.listings.length, 39);
  assert.equal(snapshot.inventory.length, 46);
  assert.equal(
    snapshot.listings
      .filter((listing) => listing.garmentId.startsWith("scenario-garment-"))
      .some((listing) => Boolean(listing.publicProjection)),
    false,
    "lifecycle overlays must not pretend to be connected listing receipts",
  );
  assert.equal(snapshot.listings.some((listing) => Boolean(listing.publicProjection)), true);
  assert.equal(snapshot.garments.some((garment) => Boolean(garment.privateWardrobeItemId)), false);

  const drops = projectStudioDropScopes(snapshot.garments, snapshot.listings);
  assert.deepEqual(drops.scopes.map(({ key, count }) => ({ key, count })), [
    { key: "current", count: 21 },
    { key: "past", count: 18 },
    { key: "studio", count: 0 },
    { key: "private", count: 7 },
  ]);
  assert.deepEqual(drops.scopes[1]?.labels, ["Drop 01"]);

  for (const listing of snapshot.listings) {
    assert.ok(snapshot.garments.some((garment) => garment.id === listing.garmentId));
    assert.ok(snapshot.inventory.some((record) => record.listingId === listing.id));
  }
  for (const order of snapshot.orders) {
    assert.ok(snapshot.listings.some((listing) => listing.id === order.listingId));
    assert.ok(snapshot.inventory.some((record) => record.id === order.inventoryId));
  }
  assert.equal(snapshot.returns[0]?.orderId, "scenario-order-sold");
});

test("scenario state persists only inside its in-memory service", async () => {
  const service = createStudioScenarioService("lifecycle");
  const first = await service.hydrate();
  first.garments[0].title = "Caller mutation";
  assert.equal((await service.hydrate()).garments[0].title, "Scenario Intake Draft");

  let notified = false;
  const stop = service.subscribe(() => { notified = true; });
  const changed = await service.hydrate();
  changed.garments[0].title = "In-memory mutation";
  await service.persist(changed);
  assert.equal((await service.hydrate()).garments[0].title, "In-memory mutation");
  assert.equal(notified, false);
  stop();
  assert.match(service.createId("garment"), /^scenario-garment-001$/);
  assert.equal(service.now(), "2026-08-16T12:00:00.000Z");
});

test("scenario intake never calls fetch and exposes success and recovery states", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls += 1;
    throw new Error("Scenario intake attempted network access.");
  }) as typeof fetch;

  try {
    const lifecycle = createStudioScenarioIntakeClient("lifecycle");
    let intake = (await lifecycle.createIntake("DESCRIBE", "Blush dress")).intake;
    intake = (await lifecycle.analyzeIntake(intake, "Blush dress")).intake;
    const generated = await lifecycle.generateGarment(intake);
    assert.equal(generated.intake.facts?.title, "Scenario Intake Draft");
    assert.equal(
      lifecycle.candidateUrl(generated.intake),
      "/studio/wardrobe/blush-scoop-mini-dress/01-garment-front.webp",
    );
    const decided = await lifecycle.decideIntake(generated.intake, "KEEP");
    const committed = await lifecycle.commitIntake(decided.intake, generated.intake.facts as IntakeFacts);
    assert.deepEqual(committed.wardrobeItem, { id: "scenario-garment-draft", state: "DRAFT" });

    const unavailable = createStudioScenarioIntakeClient("intake-error");
    await assert.rejects(
      unavailable.createIntake("DESCRIBE", "Source stays here"),
      (error: unknown) => error instanceof StudioEngineError
        && error.code === "ENGINE_UNAVAILABLE"
        && /source is still here/i.test(error.recovery),
    );
    assert.equal(fetchCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("scenario navigation stays on safe Studio routes", () => {
  assert.equal(
    studioScenarioHref("/studio/operations?view=returns", "lifecycle"),
    "/studio/operations?view=returns&scenario=lifecycle",
  );
  assert.equal(
    studioScenarioHref("/studio/orders/JUW-ORDER", "lifecycle"),
    "/studio/operations?view=orders&order=JUW-ORDER&scenario=lifecycle#studio-scenario-order",
  );
  assert.equal(studioScenarioHref("/shop", "lifecycle"), "/shop");
  assert.equal(studioScenarioHref("/shoots", "lifecycle"), "/shoots?scenario=lifecycle");
  assert.equal(studioScenarioHref("#piece-primary-action", "lifecycle"), "#piece-primary-action");
  assert.equal(studioScenarioRouteSupported("/studio"), true);
  assert.equal(studioScenarioRouteSupported("/studio/ask"), true);
  assert.equal(studioScenarioRouteSupported("/studio/wardrobe/scenario-garment-draft"), true);
  assert.equal(studioScenarioRouteSupported("/studio/operations"), true);
  assert.equal(studioScenarioRouteSupported("/studio/media"), true);
  assert.equal(studioScenarioRouteSupported("/studio/orders"), false);
  assert.equal(studioScenarioRouteSupported("/shoots"), false);
});

test("the simulator wiring preserves the authority boundary", () => {
  const simulator = source("lib/studio/simulator.ts");
  const layout = source("app/(studio)/layout.tsx");
  const provider = source("components/studio/studio-provider.tsx");
  const shell = source("components/studio/app-shell.tsx");
  const intake = source("components/studio/garment-intake/garment-intake-sheet.tsx");
  const wardrobe = source("components/studio/wardrobe-workbench.tsx");
  const dossier = source("components/studio/garment-dossier.tsx");

  assert.doesNotMatch(
    simulator,
    /localStorage|createBrowserStudioService|createServerWardrobeOverlayRepository|selectWardrobePublicView|\/api\/studio\//,
  );
  assert.match(layout, /const scenariosEnabled = process\.env\.NODE_ENV === "development"/);
  assert.match(layout, /<AppShell operator=\{operator\} scenariosEnabled=\{scenariosEnabled\}>/);
  assert.match(provider, /parseStudioScenario\(searchParams\.get\("scenario"\), scenariosEnabled\)/);
  assert.match(provider, /scenario \? createStudioScenarioService\(scenario\) : createBrowserStudioService\(\)/);
  assert.match(shell, /Simulator · \{STUDIO_SCENARIO_LABELS\[studio\.scenario\]\} · Resets on reload/);
  assert.match(shell, /scenarioRouteSupported \? children/);
  assert.match(shell, /<div className="workspace">[\s\S]*?<div className="demo-ribbon"/);
  assert.match(intake, /client = studioEngineIntakeClient/);
  assert.match(intake, /client\.createIntake/);
  assert.doesNotMatch(intake, /onClick=\{finishDismiss\}>Open garment/);
  assert.match(wardrobe, /studioScenarioHref\("\/studio\/operations", studio\.scenario\)/);
  assert.match(dossier, /studioScenarioHref\("\/studio\/wardrobe", studio\.scenario\)/);
});
