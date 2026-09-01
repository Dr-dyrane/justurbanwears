import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
  STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER,
} from "../lib/studio/atelier/publication-adoption-contracts";
import {
  parseStudioAtelierAdoptionReceiptEnvelope,
  parseStudioAtelierAdoptionReviewEnvelope,
} from "../components/studio/atelier/studio-atelier-shop-adoption-client";

const root = process.cwd();
const wardrobeItemId = "10000000-0000-4000-8000-000000000001";
const revision = "a".repeat(64);

function uuid(index: number): string {
  return `${index.toString(16).padStart(8, "0")}-0000-4000-8000-${index
    .toString(16).padStart(12, "0")}`;
}

function digest(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function readyEnvelope() {
  return {
    adoption: {
      state: "READY",
      wardrobeItemId,
      garmentId: `wardrobe:${wardrobeItemId}`,
      expectedRevision: revision,
      listingFacts: {
        title: "Violet Beaded Ruffle Romper",
        description: "A deep-violet beaded romper framed by soft flounces and an asymmetric ruffled hem.",
        category: "Rompers",
        colour: "Deep violet",
        sizeLabel: "S,M",
        condition: "New",
        price: 32_000,
      },
      roles: [...STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER],
    },
  };
}

function receiptEnvelope() {
  return {
    adoption: {
      schemaVersion: STUDIO_ATELIER_SHOP_ADOPTION_SCHEMA_VERSION,
      receiptId: digest("receipt"),
      wardrobeItemId,
      garmentId: `wardrobe:${wardrobeItemId}`,
      adoptionRevision: revision,
      media: STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.map((role, index) => ({
        role,
        operationId: uuid(index + 1),
        projectionVersion: index + 1,
        lockedArtifactSha256: digest(role),
        mimeType: index % 2 === 0 ? "image/png" : "image/jpeg",
        byteSize: index + 10,
        width: 1024,
        height: 1536,
        blobUrl: `private://must-not-cross/${role}`,
      })),
    },
  };
}

test("the client accepts only the exact seven-role READY review and preserves exact blocker text", () => {
  const ready = parseStudioAtelierAdoptionReviewEnvelope(readyEnvelope(), wardrobeItemId);
  assert.deepEqual(ready, readyEnvelope().adoption);

  const reordered = readyEnvelope();
  reordered.adoption.roles.reverse();
  assert.equal(parseStudioAtelierAdoptionReviewEnvelope(reordered, wardrobeItemId), null);

  const missingFacts = readyEnvelope();
  assert.equal(parseStudioAtelierAdoptionReviewEnvelope({
    adoption: { ...missingFacts.adoption, listingFacts: undefined },
  }, wardrobeItemId), null);

  const invalidFacts = readyEnvelope();
  invalidFacts.adoption.listingFacts.description = " ";
  assert.equal(parseStudioAtelierAdoptionReviewEnvelope(invalidFacts, wardrobeItemId), null);

  const blocked = parseStudioAtelierAdoptionReviewEnvelope({
    adoption: {
      state: "BLOCKED",
      wardrobeItemId,
      blockers: [
        "MODEL_LEFT_PROFILE is not LOCKED",
        "Restore the exact seven artifacts before publishing",
      ],
    },
  }, wardrobeItemId);
  assert.deepEqual(blocked, {
    state: "BLOCKED",
    wardrobeItemId,
    blockers: [
      "MODEL_LEFT_PROFILE is not LOCKED",
      "Restore the exact seven artifacts before publishing",
    ],
  });
});

test("the client reconstructs a safe receipt and drops every private locator", () => {
  const receipt = parseStudioAtelierAdoptionReceiptEnvelope(
    receiptEnvelope(),
    wardrobeItemId,
    revision,
  );
  assert.ok(receipt);
  assert.deepEqual(receipt.media.map((item) => item.role), STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER);
  assert.doesNotMatch(JSON.stringify(receipt), /blob|provider|pathname|private:\/\//i);

  const changed = receiptEnvelope();
  changed.adoption.media[6].role = "GARMENT_FRONT";
  assert.equal(
    parseStudioAtelierAdoptionReceiptEnvelope(changed, wardrobeItemId, revision),
    null,
  );
});

test("the adoption action is explicit, single-flight, reload-stable, and reconciliation-first", () => {
  const source = readFileSync(
    `${root}/components/studio/atelier/studio-atelier-shop-adoption.tsx`,
    "utf8",
  ).replaceAll("\r\n", "\n");
  assert.match(source, /confirmation: "ADOPT_LOCKED_ATELIER_MEDIA"/);
  assert.match(source, /commandInFlightRef\.current/);
  assert.match(source, /commandInFlightRef\.current = true/);
  assert.match(source, /getOrCreateSessionCommandKey\(\{/);
  assert.match(source, /revision: expectedRevision/);
  assert.match(source, /reconcilePublication\(\)\.catch\(\(\) => null\)/);
  assert.match(source, /readAdoptionReview\(wardrobeItemId\)\.catch\(\(\) => null\)/);
  assert.match(source, /clearSessionCommandKey\(\{/);
  assert.match(source, /The same safe command is ready to retry/);
  assert.match(source, /This check is read-only\. It cannot start image generation\./);
  assert.match(source, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(source, /aria-label="Seven locked Atelier views" role="list"/);
  assert.match(source, /aria-label="Final Shop listing"/);
  assert.match(source, /panel\.review\.listingFacts\.description/);
  assert.match(source, /panel\.review\.listingFacts\.condition/);
  assert.doesNotMatch(source, /listingFactsError|onRetryListingFacts/);
  assert.match(source, /role="alert">\{panel\.notice\}/);
  assert.doesNotMatch(source, /<img|assetUrl|blobPathname|providerUrl/);

  const claim = source.indexOf("commandInFlightRef.current = true");
  const post = source.indexOf("const receipt = await postAdoption", claim);
  const reconcile = source.indexOf("await reconcilePublication", post);
  assert.ok(claim >= 0 && post > claim && reconcile > post);
});

test("a post-command BLOCKED reread stays ambiguous and preserves the exact safe retry", () => {
  const source = readFileSync(
    `${root}/components/studio/atelier/studio-atelier-shop-adoption.tsx`,
    "utf8",
  ).replaceAll("\r\n", "\n");
  const branchStart = source.indexOf('} else if (reconciled?.state === "BLOCKED") {');
  const branchEnd = source.indexOf("\n        } else {", branchStart + 1);
  assert.ok(branchStart >= 0 && branchEnd > branchStart);

  const blockedAfterCommand = source.slice(branchStart, branchEnd);
  assert.match(blockedAfterCommand, /state: "ready"/);
  assert.match(blockedAfterCommand, /review: panel\.review/);
  assert.match(
    blockedAfterCommand,
    /Close and reopen Shop to check the latest status, or retry the same safe command/,
  );
  assert.doesNotMatch(blockedAfterCommand, /applyReview|clearSessionCommandKey|state: "blocked"/);
});

test("the existing adaptive Shop sheet gives READY adoption one primary action without remounting Piece state", () => {
  const source = readFileSync(
    `${root}/components/studio/wardrobe-workbench.tsx`,
    "utf8",
  ).replaceAll("\r\n", "\n");
  assert.match(source, /<StudioAdaptiveWorkspace/);
  assert.match(source, /<StudioTaskSheet[\s\S]*?className="studio-piece-shop-sheet"/);
  assert.match(source, /<StudioAtelierShopAdoption/);
  assert.match(source, /active=\{atelierAdoptionActive\}/);
  assert.doesNotMatch(source, /listingFacts=\{|listingFactsError=|onRetryListingFacts=/);
  assert.doesNotMatch(source, /fetch\(`\/api\/studio\/wardrobe\/\$\{encodeURIComponent\(garment\.privateWardrobeItemId\)\}\/lifecycle`/);
  assert.match(source, /atelierAdoptionOwnsShopSheet/);
  assert.match(source, /!atelierAdoptionOwnsShopSheet && dynamicReview\?\.state === "READY"/);
  assert.match(source, /busy=\{publishing \|\| atelierAdoptionBusy\}/);
  assert.match(source, /Review seven Shop views/);
  assert.match(source, /atelierAdoptionMode === "published"/);
  assert.match(source, /authoritativePublicationState !== "UNPUBLISHED"/);
  assert.match(source, /authoritativePublicationState !== "ARCHIVED"/);
});
