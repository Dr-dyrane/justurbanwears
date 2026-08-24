import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { expectedPhysicalTruth } from "../lib/server/studio-stocktake-repository";

async function source(path: string) {
  return readFile(new URL(`../${path}`, import.meta.url), "utf8");
}

test("physical expectation follows connected commerce without changing it", () => {
  assert.deepEqual(expectedPhysicalTruth({ availability: "PRIVATE" }), {
    custody: "STUDIO",
    locationKey: "WARDROBE_RAIL",
    locationLabel: "Wardrobe rail",
  });
  assert.equal(expectedPhysicalTruth({ availability: "RESERVED" }).locationKey, "PACKING_SHELF");
  assert.deepEqual(expectedPhysicalTruth({
    availability: "RESERVED",
    fulfillmentStatus: "IN_TRANSIT",
  }), {
    custody: "COURIER",
    locationKey: "COURIER",
    locationLabel: "With courier",
  });
  assert.equal(expectedPhysicalTruth({
    availability: "SOLD",
    returnStatus: "RECEIVED",
  }).locationKey, "RETURN_INSPECTION");
  assert.equal(expectedPhysicalTruth({ availability: "SOLD" }).custody, "CUSTOMER");
  assert.equal(expectedPhysicalTruth({ availability: "ARCHIVED" }).custody, "UNKNOWN");
});

test("0009 adds frozen counts and an append-only observation ledger", async () => {
  const [migration, schema] = await Promise.all([
    source("drizzle/shop-postgres/0009_studio_stocktakes.sql"),
    source("db/shop-postgres-schema.ts"),
  ]);
  assert.match(migration, /CREATE TABLE "studio_stocktakes"/);
  assert.match(migration, /"expected_pieces" jsonb NOT NULL/);
  assert.match(migration, /studio_stocktakes_operator_open_unique/);
  assert.match(migration, /CREATE TABLE "studio_physical_observations"/);
  assert.match(migration, /studio_physical_observations_append_only_v1/);
  assert.match(migration, /BEFORE UPDATE OR DELETE ON "studio_physical_observations"/);
  assert.match(migration, /STUDIO_INVALID_TRANSITION: physical observations are append-only/);
  assert.doesNotMatch(migration, /UPDATE\s+"?shop_inventory"?/i);
  assert.doesNotMatch(migration, /UPDATE\s+"?shop_orders"?/i);
  assert.match(schema, /studioPhysicalObservations/);
  assert.match(schema, /studioStocktakes/);
  assert.match(schema, /jsonb_array_length\(\$\{table\.expectedPieces\}\) > 0/);
});

test("stocktake commands stay server-authoritative and idempotent", async () => {
  const [repository, route] = await Promise.all([
    source("lib/server/studio-stocktake-repository.ts"),
    source("app/api/studio/stocktake/route.ts"),
  ]);
  assert.match(route, /requireStudioOperator/);
  assert.match(route, /parseEngineJson\(request, stocktakeCommandSchema\)/);
  assert.match(route, /getStocktakeWorkspace/);
  assert.match(route, /customerVisible: false/);
  assert.match(repository, /on conflict \(operator_subject, idempotency_key\) do nothing/);
  assert.match(repository, /jsonb_agg\(jsonb_build_object/);
  assert.match(repository, /for update/);
  assert.match(repository, /session_lock as/);
  assert.match(repository, /set version = stocktake\.version \+ 1/);
  assert.match(repository, /stocktake\.version = \$\{input\.expectedVersion \?\? -1\}/);
  assert.match(repository, /and not exists \(select 1 from existing\)/);
  assert.doesNotMatch(repository, /if \(session && input\.expectedVersion !== session\.version\)/);
  assert.match(repository, /latest\.result <> 'MATCH'/);
  assert.doesNotMatch(repository, /where latest\.result = 'MISMATCH'\s+and not exists/);
  assert.match(repository, /current_order\.fulfillment_status = 'IN_TRANSIT'/);
  assert.match(repository, /current_order\.return_status = 'RECEIVED'/);
  assert.doesNotMatch(repository, /localStorage|sessionStorage/);
  assert.doesNotMatch(repository, /update\s+shop_inventory/i);
  assert.doesNotMatch(repository, /update\s+shop_orders/i);
});

test("canonical routes expose one physical action and clear receipts", async () => {
  const [stocktakePage, scanPage, workspace, shell, stackContext] = await Promise.all([
    source("app/(studio)/studio/stocktake/page.tsx"),
    source("app/(studio)/studio/scan/[sku]/page.tsx"),
    source("components/studio/stocktake-workspace.tsx"),
    source("components/studio/app-shell.tsx"),
    source("components/studio/navigation/studio-stack-context.tsx"),
  ]);
  assert.match(stocktakePage, /mode="stocktake"/);
  assert.match(stocktakePage, /from "\.\.\/\.\.\/\.\.\/\.\.\/components\/studio\/stocktake-workspace"/);
  assert.match(scanPage, /mode="scan"/);
  assert.match(scanPage, /from "\.\.\/\.\.\/\.\.\/\.\.\/\.\.\/components\/studio\/stocktake-workspace"/);
  assert.match(workspace, /Current truth/);
  assert.match(workspace, /Confirm in hand/);
  assert.match(workspace, /Record mismatch/);
  assert.match(workspace, /Shop and order state will not change/);
  assert.match(workspace, /Mismatch recorded/);
  assert.match(workspace, /Resolve only what differs/);
  assert.match(workspace, /expectedVersion: countSession\?\.version/);
  assert.doesNotMatch(workspace, /useStudioMobileAction|invokeTargetId/);
  assert.match(workspace, /id="stocktake-close-action"/);
  assert.match(workspace, /This count cannot close/);
  assert.doesNotMatch(workspace, /Quantity\s*\[|\[-\]|\[\+\]/i);
  assert.match(shell, /href=\{stack\.backHref\}/);
  assert.match(stackContext, /pathname\.startsWith\("\/studio\/scan"\)/);
  assert.match(stackContext, /backHref: "\/studio\/stocktake"/);
});
