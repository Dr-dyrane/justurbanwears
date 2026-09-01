import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  isSafeShopProductMediaUrl,
  isSafeStudioAtelierPublicationMediaUrl,
} from "../lib/shop/public-media";
import { databaseCatalogueRowToShopProduct } from "../lib/shop/server-catalog";
import { STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER } from "../lib/studio/atelier/publication-adoption-contracts";
import {
  parseStudioAtelierPublicationMediaSet,
  studioAtelierPublicationMediaPath,
} from "../lib/studio/engine/catalogue-publication-contracts";

const receiptId = "a".repeat(64);
const adoptionRevision = "b".repeat(64);
const slug = "atelier-coral-dress-0123456789ab4cde8f0123456789abcd";
const description = "A sculpted coral dress with a softly gathered waist.";
const modelRoles = new Set([
  "MODEL_FRONT",
  "MODEL_LEFT_PROFILE",
  "MODEL_REAR_THREE_QUARTER",
]);

const publicationMedia = STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER.map((slot, index) => ({
  slot,
  src: studioAtelierPublicationMediaPath(receiptId, slot),
  sourceSha256: String(index + 1).repeat(64),
  sha256: String(index + 1).repeat(64),
  mimeType: index % 2 === 0 ? "image/jpeg" as const : "image/png" as const,
  width: 1_024 + index,
  height: 1_280 + index,
  operationId: `00000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`,
  projectionVersion: index + 1,
}));

const catalogueMedia = publicationMedia.map((item) => ({
  slot: item.slot,
  src: item.src,
  ...(modelRoles.has(item.slot) ? { modelAnchorId: "lulu-v4" as const } : {}),
}));

function adoptionRow() {
  return {
    sku: "JUW-900",
    slug,
    name: "Atelier Coral Dress",
    category: "Dresses",
    price: 24_500,
    taggedSize: "UK 10",
    fit: "One of one",
    condition: "Excellent",
    colour: "Coral",
    dropLabel: "Drop 02",
    tone: "coral",
    silhouette: "dress",
    note: description,
    story: "Coral · Excellent",
    details: ["Coral", "UK 10", "Excellent"],
    measurements: [],
    modelAnchor: { id: "lulu-v4" as const },
    media: catalogueMedia,
    availability: "AVAILABLE" as const,
    publicationId: "12345678-89ab-4cde-8f01-23456789abcd",
    publicationOrigin: "STUDIO_NATIVE",
    publicationState: "PUBLISHED",
    publicationSourceRevision: adoptionRevision,
    publicationMedia,
    publicationSlug: slug,
    publicationBaseline: null,
    publicationFacts: {
      title: "Atelier Coral Dress",
      description,
      category: "Dresses",
      colour: "Coral",
      sizeLabel: "UK 10",
      condition: "Excellent",
      price: 24_500,
      quantity: 1,
      atelierAdoptionRevision: adoptionRevision,
    },
  };
}

test("exact seven-role Atelier media becomes one Shop product with the locked MODEL_FRONT tryout", () => {
  const parsed = parseStudioAtelierPublicationMediaSet(publicationMedia);
  assert.equal(parsed.receiptId, receiptId);
  assert.deepEqual(parsed.media.map((item) => item.slot), STUDIO_ATELIER_SHOP_MEDIA_ROLE_ORDER);

  const product = databaseCatalogueRowToShopProduct(adoptionRow());
  assert.ok(product);
  assert.equal(product.media?.length, 6);
  assert.equal(product.modelTryout.modelStatus, "APPROVED");
  if (product.modelTryout.modelStatus !== "APPROVED") return;
  const modelFront = publicationMedia.find((item) => item.slot === "MODEL_FRONT");
  assert.ok(modelFront);
  assert.equal(product.modelTryout.modelAnchorId, "lulu-v4");
  assert.equal(product.note, description);
  assert.equal(product.modelTryout.frame.src, modelFront.src);
  assert.equal(product.modelTryout.frame.width, modelFront.width);
  assert.equal(product.modelTryout.frame.height, modelFront.height);

  for (const media of publicationMedia) {
    assert.equal(isSafeStudioAtelierPublicationMediaUrl(media.src), true);
    assert.equal(isSafeShopProductMediaUrl(media.src, slug), true);
    if (media.slot === "MODEL_FRONT") continue;
    const frame = product.media?.find((item) =>
      item.id === media.slot.toLowerCase().replaceAll("_", "-"));
    assert.ok(frame, media.slot);
    assert.equal(frame.src, media.src);
    assert.equal(frame.width, media.width);
    assert.equal(frame.height, media.height);
  }
  assert.doesNotMatch(JSON.stringify(product), /blobPathname|lockedArtifactId|provider|storage\//i);
});

test("Atelier adoption commits the exact reviewed description under the item and intake CAS", () => {
  const repository = readFileSync(
    `${process.cwd()}/lib/server/studio-atelier-publication-adoption-ledger-repository.ts`,
    "utf8",
  );
  assert.match(repository, /join studio_intakes intake/);
  assert.match(repository, /intake\.facts->>'description' as description/);
  assert.match(repository, /description: target\.description/);
  assert.match(repository, /intake\.facts->>'description' = \$\{target\.description\}/);
  assert.match(repository, /intake\.facts->>'price' = \$\{String\(target\.price\)\}/);
  assert.match(repository, /for update of item, intake/);
  assert.match(repository, /\$\{target\.description\}, \$\{`\$\{target\.colour\} · \$\{target\.condition\}`\}/);
  assert.doesNotMatch(repository, /One-off wardrobe piece\./);
});

test("Atelier app-owned media paths are exact relative receipt and role identities", () => {
  const exact = studioAtelierPublicationMediaPath(receiptId, "MODEL_FRONT");
  assert.equal(isSafeStudioAtelierPublicationMediaUrl(exact), true);
  assert.equal(isSafeStudioAtelierPublicationMediaUrl(`https://www.justurbanwears.com${exact}`), false);
  assert.equal(isSafeStudioAtelierPublicationMediaUrl(`${exact}?download=1`), false);
  assert.equal(isSafeStudioAtelierPublicationMediaUrl(`${exact}#frame`), false);
  assert.equal(isSafeStudioAtelierPublicationMediaUrl(exact.replace("MODEL_FRONT", "MODEL_DETAIL")), false);
  assert.equal(isSafeStudioAtelierPublicationMediaUrl(exact.replace(receiptId, receiptId.toUpperCase())), false);
});

test("any Atelier role, hash, dimension, MIME, anchor, order or receipt drift fails closed", () => {
  const cases = [
    {
      label: "reviewed description",
      row: () => ({
        ...adoptionRow(),
        note: "A different public description.",
      }),
    },
    {
      label: "role order",
      row: () => ({
        ...adoptionRow(),
        publicationMedia: [publicationMedia[1], publicationMedia[0], ...publicationMedia.slice(2)],
      }),
    },
    {
      label: "source hash",
      row: () => ({
        ...adoptionRow(),
        publicationMedia: publicationMedia.map((item, index) =>
          index === 0 ? { ...item, sourceSha256: "f".repeat(64) } : item),
      }),
    },
    {
      label: "dimension",
      row: () => ({
        ...adoptionRow(),
        publicationMedia: publicationMedia.map((item, index) =>
          index === 0 ? { ...item, width: 0 } : item),
      }),
    },
    {
      label: "MIME",
      row: () => ({
        ...adoptionRow(),
        publicationMedia: publicationMedia.map((item, index) =>
          index === 0 ? { ...item, mimeType: "image/webp" } : item),
      }),
    },
    {
      label: "path receipt",
      row: () => ({
        ...adoptionRow(),
        publicationMedia: publicationMedia.map((item, index) =>
          index === 0 ? { ...item, src: item.src.replace(receiptId, "c".repeat(64)) } : item),
      }),
    },
    {
      label: "catalogue anchor",
      row: () => ({
        ...adoptionRow(),
        media: catalogueMedia.map((item) =>
          item.slot === "MODEL_FRONT" ? { slot: item.slot, src: item.src } : item),
      }),
    },
    {
      label: "Lulu identity",
      row: () => ({ ...adoptionRow(), modelAnchor: { id: "lulu-v3" as const } }),
    },
  ];
  for (const scenario of cases) {
    assert.throws(() => databaseCatalogueRowToShopProduct(scenario.row()), undefined, scenario.label);
  }
  assert.throws(() => databaseCatalogueRowToShopProduct({
    ...adoptionRow(),
    publicationFacts: {
      ...adoptionRow().publicationFacts,
      atelierAdoptionRevision: undefined,
    },
  }), /media set|revision/);
});

test("unpublish and archive revoke the product while exact republish restores the same receipt media", () => {
  const published = databaseCatalogueRowToShopProduct(adoptionRow());
  assert.ok(published);
  assert.equal(databaseCatalogueRowToShopProduct({
    ...adoptionRow(),
    publicationState: "UNPUBLISHED",
  }), null);
  assert.equal(databaseCatalogueRowToShopProduct({
    ...adoptionRow(),
    publicationState: "ARCHIVED",
  }), null);
  const republished = databaseCatalogueRowToShopProduct({
    ...adoptionRow(),
    publicationState: "PUBLISHED",
  });
  assert.ok(republished);
  assert.deepEqual(republished.media, published.media);
  assert.deepEqual(republished.modelTryout, published.modelTryout);
});

test("facts revisions and visibility commands preserve the adoption revision and exact media JSON", () => {
  const repository = readFileSync(
    `${process.cwd()}/lib/server/studio-catalogue-publication-repository.ts`,
    "utf8",
  );
  const lifecycleRepository = readFileSync(
    `${process.cwd()}/lib/server/studio-garment-lifecycle-repository.ts`,
    "utf8",
  );
  const lifecycleService = readFileSync(
    `${process.cwd()}/lib/studio/engine/garment-lifecycle-service.ts`,
    "utf8",
  );
  const atelierAtom = repository.match(
    /export async function publishAtelierAdoptionRevisionAtomically[\s\S]*?function resultRows/,
  )?.[0] ?? "";
  const publicationSet = atelierAtom.match(
    /publication as \([\s\S]*?set ([\s\S]*?)from revision_source, catalogue/,
  )?.[1] ?? "";
  assert.match(atelierAtom, /publication\.media = \$\{JSON\.stringify\(input\.media\)\}::jsonb/);
  assert.match(atelierAtom, /catalogue\.media = \$\{JSON\.stringify\(catalogueMedia\)\}::jsonb/);
  assert.match(atelierAtom, /publication\.facts->>'atelierAdoptionRevision'/);
  assert.doesNotMatch(publicationSet, /source_revision\s*=/);
  assert.doesNotMatch(publicationSet, /media\s*=/);
  assert.match(lifecycleService, /publishAtelierAdoptionRevisionAtomically/);
  assert.match(lifecycleService, /hasImmutablePublicationMedia/);

  const visibility = lifecycleRepository.match(
    /export async function changePublicationVisibility[\s\S]*?export async function archiveGarment/,
  )?.[0] ?? "";
  assert.match(visibility, /set state = \$\{toState\}/);
  assert.doesNotMatch(visibility, /set[\s\S]*?source_revision\s*=/);
  assert.doesNotMatch(visibility, /set[\s\S]*?media\s*=/);
  assert.match(lifecycleRepository, /set state = 'ARCHIVED'/);
});
