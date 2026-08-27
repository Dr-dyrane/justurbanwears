import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  applyDrop02TransitionInTransaction,
  DROP01_TRANSITION_SKUS,
  DROP02_TRANSITION_SKUS,
} from "../scripts/shop-db/drop02-transition.mjs";

const owner = {
  auth_subject: "neon:operator:lulu",
  email: "lulu@example.com",
};

function uuid(value: string) {
  const hex = createHash("md5").update(value).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function adoptionId(version: string, sku: string, kind: string) {
  return uuid(`catalogue-adoption:${version}:${sku}:${kind}`);
}

function manifest() {
  return {
    products: [...DROP01_TRANSITION_SKUS, ...DROP02_TRANSITION_SKUS].map((sku) => ({ sku })),
  };
}

function oldInventory(archived: boolean) {
  return DROP01_TRANSITION_SKUS.map((sku) => {
    if (sku === "JUW-001") {
      return {
        sku,
        availability: archived ? "ARCHIVED" : "AVAILABLE",
        on_hand: 1,
        reserved: 0,
        sold: 1,
        returned: 1,
        write_off: 0,
      };
    }
    if (sku === "JUW-002") {
      return {
        sku,
        availability: archived ? "ARCHIVED" : "RESERVED",
        on_hand: 1,
        reserved: archived ? 0 : 1,
        sold: 0,
        returned: 0,
        write_off: 0,
      };
    }
    if (sku === "JUW-004") {
      return {
        sku,
        availability: archived ? "ARCHIVED" : "SOLD",
        on_hand: 0,
        reserved: 0,
        sold: 1,
        returned: 0,
        write_off: 0,
      };
    }
    return {
      sku,
      availability: archived ? "ARCHIVED" : "AVAILABLE",
      on_hand: 1,
      reserved: 0,
      sold: 0,
      returned: 0,
      write_off: 0,
    };
  });
}

function newInventory(adoptedSkus: Set<string>) {
  return DROP02_TRANSITION_SKUS.map((sku, index) => ({
    sku,
    availability: adoptedSkus.has(sku) && index === 0 ? "RESERVED" : "AVAILABLE",
    on_hand: 1,
    reserved: adoptedSkus.has(sku) && index === 0 ? 1 : 0,
    sold: 0,
    returned: 0,
    write_off: 0,
  }));
}

function oldAdoptions(archived: boolean) {
  return DROP01_TRANSITION_SKUS.map((sku) => ({
    sku,
    publication_id: adoptionId("v1", sku, "publication"),
    wardrobe_item_id: adoptionId("v1", sku, "wardrobe"),
    publication_origin: "CATALOGUE_ADOPTED",
    publication_state: archived ? "ARCHIVED" : "PUBLISHED",
    publication_operator_subject: owner.auth_subject,
    wardrobe_state: archived ? "ARCHIVED" : "READY",
    wardrobe_operator_subject: owner.auth_subject,
  }));
}

function newAdoptions(adoptedSkus: Set<string>) {
  return DROP02_TRANSITION_SKUS.map((sku) => {
    const catalogueSlug = `drop02-${sku.toLowerCase()}`;
    if (!adoptedSkus.has(sku)) {
      return {
        sku,
        catalogue_slug: catalogueSlug,
        publication_id: null,
      };
    }
    return {
      sku,
      catalogue_slug: catalogueSlug,
      publication_sku: sku,
      publication_slug: catalogueSlug,
      publication_id: adoptionId("v2", sku, "publication"),
      wardrobe_item_id: adoptionId("v2", sku, "wardrobe"),
      intake_id: adoptionId("v2", sku, "intake"),
      revision_id: adoptionId("v2", sku, "revision"),
      publication_origin: "CATALOGUE_ADOPTED",
      publication_operator_subject: owner.auth_subject,
      wardrobe_operator_subject: owner.auth_subject,
      intake_operator_subject: owner.auth_subject,
      revision_operator_subject: owner.auth_subject,
      intake_idempotency_key: `catalogue-adoption:v2:${sku}:intake`,
      publication_idempotency_key: `catalogue-adoption:v2:${sku}:publication`,
      revision_idempotency_key: `catalogue-adoption:v2:${sku}:revision`,
    };
  });
}

function postcondition() {
  return {
    old_inventory_archived: 18,
    old_publications_archived: 18,
    old_wardrobe_archived: 18,
    old_archive_events: 18,
    new_intakes: 29,
    new_wardrobe_items: 29,
    new_publications: 29,
    new_revisions: 29,
    new_events: 58,
    orphan_reserved: 0,
    returned_listing_sold: 1,
    returned_listing_returned: 1,
    sold_listing_sold: 1,
  };
}

interface RelationshipCounts {
  hold_count: number;
  order_item_count: number;
  return_item_count: number;
  custody_count: number;
}

function mockTransaction({
  adoptionState = "none",
  relationshipCounts = {
    hold_count: 0,
    order_item_count: 0,
    return_item_count: 0,
    custody_count: 0,
  },
}: {
  adoptionState?: "none" | "partial" | "all";
  relationshipCounts?: RelationshipCounts;
} = {}) {
  const calls: Array<{ text: string; values: unknown[] }> = [];
  const adoptedSkus = new Set(
    adoptionState === "all"
      ? DROP02_TRANSITION_SKUS
      : adoptionState === "partial"
        ? DROP02_TRANSITION_SKUS.slice(0, -1)
        : [],
  );
  const drop01Archived = adoptionState !== "none";
  const missingSkus = DROP02_TRANSITION_SKUS.filter((sku) => !adoptedSkus.has(sku));
  return {
    calls,
    async query(text: string, values: unknown[] = []) {
      calls.push({ text, values });
      if (text.startsWith("lock table")) return { rows: [] };
      if (text.includes("as catalogue_count")) {
        return { rows: [{ catalogue_count: 47, expected_catalogue_count: 47, expected_inventory_count: 47 }] };
      }
      if (text.includes("from studio_operator_membership membership")) return { rows: [owner] };
      if (text.includes("from shop_inventory") && text.includes("for update")) {
        return { rows: [...oldInventory(drop01Archived), ...newInventory(adoptedSkus)] };
      }
      if (text.includes("as hold_count")) return { rows: [relationshipCounts] };
      if (text.includes("publication.state as publication_state")) return { rows: oldAdoptions(drop01Archived) };
      if (text.includes("publication.slug as publication_slug")) return { rows: newAdoptions(adoptedSkus) };
      if (text.startsWith("update shop_inventory")) {
        return { rows: drop01Archived ? [] : DROP01_TRANSITION_SKUS.map((sku) => ({ sku })) };
      }
      if (text.startsWith("insert into studio_intakes")) {
        return {
          rows: missingSkus.map((sku) => ({ id: adoptionId("v2", sku, "intake") })),
        };
      }
      if (text.startsWith("with adoption as")) {
        return {
          rows: missingSkus.map((sku) => ({ id: adoptionId("v2", sku, "publication") })),
        };
      }
      if (text.includes("from jsonb_array_elements(catalogue.media)")) return { rows: [] };
      if (text.includes("as old_inventory_archived")) return { rows: [postcondition()] };
      return { rows: [] };
    },
  };
}

test("runs the guarded Drop 01 retirement and v2 Drop 02 adoption in the supplied transaction", async () => {
  const transaction = mockTransaction();
  assert.equal(await applyDrop02TransitionInTransaction(transaction, manifest()), "apply");

  const relationshipGuard = transaction.calls.find((call) => call.text.includes("as hold_count"));
  assert.ok(relationshipGuard);
  assert.match(relationshipGuard.text, /studio_manual_holds/);
  assert.match(relationshipGuard.text, /shop_order_items/);
  assert.match(relationshipGuard.text, /shop_order_return_items/);
  assert.match(relationshipGuard.text, /studio_piece_custody/);

  const inventoryArchive = transaction.calls.find((call) => call.text.startsWith("update shop_inventory"));
  assert.ok(inventoryArchive);
  assert.match(inventoryArchive.text, /set availability = 'ARCHIVED'/);
  assert.match(inventoryArchive.text, /case when sku = 'JUW-002' then 0 else reserved end/);
  assert.doesNotMatch(inventoryArchive.text, /\bsold\s*=/);
  assert.doesNotMatch(inventoryArchive.text, /\bon_hand\s*=/);
  assert.doesNotMatch(inventoryArchive.text, /\breturned\s*=/);
  assert.doesNotMatch(inventoryArchive.text, /\bwrite_off\s*=/);

  const postconditionQuery = transaction.calls.find((call) => call.text.includes("as returned_listing_sold"));
  assert.ok(postconditionQuery);
  assert.match(postconditionQuery.text, /where sku = 'JUW-001'/);

  const archiveEvent = transaction.calls.find((call) => call.text.includes("Seed reservation cleared and test piece archived"));
  assert.ok(archiveEvent);
  assert.match(archiveEvent.text, /Sold test listing retired/);
  assert.match(archiveEvent.text, /orphanSeedReservationCleared/);

  const v2Statements = transaction.calls.filter((call) => call.text.includes("catalogue-adoption:v2:"));
  assert.ok(v2Statements.length >= 8);
  const intakeAdoption = transaction.calls.find((call) => call.text.startsWith("insert into studio_intakes"));
  const wardrobeAdoption = transaction.calls.find((call) => call.text.startsWith("insert into studio_wardrobe_items"));
  assert.ok(intakeAdoption);
  assert.ok(wardrobeAdoption);
  assert.match(intakeAdoption.text, /when 'Rompers' then 'Set'/);
  assert.match(wardrobeAdoption.text, /when 'Rompers' then 'Set'/);
  assert.doesNotMatch(`${intakeAdoption.text}\n${wardrobeAdoption.text}`, /then 'Romper'/);
  assert.ok(v2Statements.some((call) => call.text.includes("to_jsonb(catalogue) - 'created_at' - 'updated_at'")));
  assert.ok(v2Statements.some((call) => call.text.includes("digest(convert_to")));
  assert.ok(v2Statements.some((call) => call.text.includes("on conflict do nothing")));
});

test("is a true no-op after transition while preserving later Drop 02 inventory truth", async () => {
  const transaction = mockTransaction({ adoptionState: "all" });
  assert.equal(await applyDrop02TransitionInTransaction(transaction, manifest()), "noop");
  const inventoryArchive = transaction.calls.find((call) => call.text.startsWith("update shop_inventory"));
  assert.ok(inventoryArchive);
  assert.deepEqual(inventoryArchive.values, [DROP01_TRANSITION_SKUS]);
});

test("incrementally adopts a new Drop 02 piece without rewriting existing operational inventory", async () => {
  const transaction = mockTransaction({ adoptionState: "partial" });
  assert.equal(await applyDrop02TransitionInTransaction(transaction, manifest()), "apply");
  const intakeInsert = transaction.calls.find((call) => call.text.startsWith("insert into studio_intakes"));
  assert.ok(intakeInsert);
  assert.deepEqual(intakeInsert.values[0], DROP02_TRANSITION_SKUS);
  const inventoryArchive = transaction.calls.find((call) => call.text.startsWith("update shop_inventory"));
  assert.ok(inventoryArchive);
  assert.deepEqual(inventoryArchive.values, [DROP01_TRANSITION_SKUS]);
});

test("refuses an incomplete catalogue or any real Drop 01 relationship before mutation", async () => {
  const wrongManifest = manifest();
  wrongManifest.products.pop();
  const untouched = mockTransaction();
  await assert.rejects(
    applyDrop02TransitionInTransaction(untouched, wrongManifest),
    /DROP02_TRANSITION_MANIFEST_MISMATCH/,
  );
  assert.equal(untouched.calls.length, 0);

  const relationship = mockTransaction({
    relationshipCounts: {
      hold_count: 0,
      order_item_count: 1,
      return_item_count: 0,
      custody_count: 0,
    },
  });
  await assert.rejects(
    applyDrop02TransitionInTransaction(relationship, manifest()),
    /DROP02_TRANSITION_RELATIONSHIP_CONFLICT/,
  );
  assert.equal(relationship.calls.some((call) => call.text.startsWith("update shop_inventory")), false);
});

test("shop release invokes the transition after descriptive sync and before verification", () => {
  const release = readFileSync(new URL("../scripts/shop-db/shop-release.mjs", import.meta.url), "utf8");
  const sync = release.indexOf("await applyCatalogueInTransaction(");
  const transition = release.indexOf("await applyDrop02TransitionInTransaction(");
  const verify = release.indexOf("await verifyCatalogueInTransaction(");
  assert.ok(sync >= 0 && transition > sync && verify > transition);
});
