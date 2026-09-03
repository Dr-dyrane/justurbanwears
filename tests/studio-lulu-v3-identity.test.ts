import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createBrowserLocalStudioRepository,
  parseStoredStudioState,
  STUDIO_STORAGE_KEY,
} from "../lib/studio/db/browser-local-repository";
import {
  createDefaultModel,
  createEmptyStudioSnapshot,
  STUDIO_STATE_SCHEMA_VERSION,
} from "../lib/studio/domain/state";
import { mergeWardrobeAuthoritySeeds } from "../lib/studio/seeds/wardrobe-authority";
import { APPROVED_PUBLIC_MODEL_PREVIEW } from "../lib/studio/projections/approved-catalogue";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("Studio canonical identity is Lulu V3", () => {
  const model = createDefaultModel();
  assert.equal(model.version, "LULU NEUTRAL IDENTITY MASTER V3");
  assert.equal(model.approvedAt, "Lulu V3 approved");
});

test("stored V2 identity metadata upgrades without dropping operator collections", () => {
  const data = createEmptyStudioSnapshot();
  data.models[0] = {
    ...data.models[0],
    version: "LULU NEUTRAL IDENTITY MASTER V2",
    approvedAt: "Lulu V2 approved",
  };
  const operatorGarment = { id: "operator-garment", marker: "preserve-me" };
  const raw = JSON.stringify({
    version: STUDIO_STATE_SCHEMA_VERSION,
    data: { ...data, garments: [operatorGarment] },
  });

  const restored = parseStoredStudioState(raw);
  assert.ok(restored);
  assert.equal(restored.models[0].version, "LULU NEUTRAL IDENTITY MASTER V3");
  assert.equal(restored.models[0].approvedAt, "Lulu V3 approved");
  assert.deepEqual(restored.garments, [operatorGarment]);
});

test("repository read durably rewrites a stored V2 default as V3", async () => {
  const data = mergeWardrobeAuthoritySeeds(createEmptyStudioSnapshot());
  data.models[0] = {
    ...data.models[0],
    version: "LULU NEUTRAL IDENTITY MASTER V2",
    approvedAt: "Lulu V2 approved",
  };
  const juw015 = data.listings.find((listing) => listing.slug === "cocoa-cowl-gathered-midi-dress");
  assert.ok(juw015?.publicProjection);
  juw015.title = "Operator title preserved";
  juw015.publicProjection = {
    ...juw015.publicProjection,
    modelAnchor: { id: "lulu-v2", src: "/shop/model/lulu-v2-approved.png" },
    media: juw015.publicProjection.media.map((frame) => frame.slot.startsWith("MODEL_")
      ? { ...frame, modelAnchorId: "lulu-v2" as const }
      : { ...frame }),
  };
  const values = new Map<string, string>([
    [STUDIO_STORAGE_KEY, JSON.stringify({ version: STUDIO_STATE_SCHEMA_VERSION, data })],
  ]);
  const localStorage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const previousWindow = globalThis.window;
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: { localStorage },
  });

  try {
    const restored = await createBrowserLocalStudioRepository().read();
    assert.equal(restored.models[0].version, "LULU NEUTRAL IDENTITY MASTER V3");
    const restoredJuw015 = restored.listings.find((listing) => listing.slug === "cocoa-cowl-gathered-midi-dress");
    assert.equal(restoredJuw015?.title, "Operator title preserved");
    assert.deepEqual(restoredJuw015?.publicProjection?.modelAnchor, { id: "lulu-v3" });
    assert.deepEqual(
      restoredJuw015?.publicProjection?.media
        .filter((frame) => frame.slot.startsWith("MODEL_"))
        .map((frame) => frame.modelAnchorId),
      ["lulu-v3", "lulu-v3"],
    );
    const persisted = JSON.parse(values.get(STUDIO_STORAGE_KEY) ?? "null") as {
      data: { models: Array<{ version: string; approvedAt?: string }> };
    };
    assert.equal(persisted.data.models[0].version, "LULU NEUTRAL IDENTITY MASTER V3");
    assert.equal(persisted.data.models[0].approvedAt, "Lulu V3 approved");
  } finally {
    if (previousWindow === undefined) {
      Reflect.deleteProperty(globalThis, "window");
    } else {
      Object.defineProperty(globalThis, "window", {
        configurable: true,
        value: previousWindow,
      });
    }
  }
});

test("Model Atelier uses the current public V4 preview without exposing private authority", async () => {
  const [atelier, projection, repository] = await Promise.all([
    read("components/studio/model-atelier.tsx"),
    read("lib/studio/projections/approved-catalogue.ts"),
    read("lib/server/studio-authority-repository.ts"),
  ]);
  const source = `${atelier}\n${projection}\n${repository}`;
  assert.equal(APPROVED_PUBLIC_MODEL_PREVIEW.id, "lulu-v4");
  assert.equal(APPROVED_PUBLIC_MODEL_PREVIEW.listingSlug, "lime-one-shoulder-rosette-ruched-mini-dress");
  assert.equal(APPROVED_PUBLIC_MODEL_PREVIEW.src, "/shop/products/lime-one-shoulder-rosette-ruched-mini-dress/04-model-front.webp");
  assert.match(source, /lulu-v4/);
  assert.match(source, /previewAssetUrl/);
  assert.match(source, /Face and body authority synced/);
  assert.doesNotMatch(source, /cocoa-cowl-gathered-midi-dress\/07-model-left-profile\.webp/);
  assert.doesNotMatch(source, /lulu-v2-approved\.png/);
  assert.doesNotMatch(source, /storage\/models\/konan/);
});

test("Lulu authority renders durable REVIEW_REQUIRED and VERIFIED states from the API", async () => {
  const source = await read("components/studio/model-atelier.tsx");
  assert.match(source, /\/api\/studio\/models\/lulu\/verification/);
  assert.match(source, /status === "VERIFIED"/);
  assert.match(source, /<dt>Adult verification<\/dt><dd>Verified<\/dd>/);
  assert.match(source, /Independent review required/);
  assert.match(source, /verificationMethod/);
  assert.match(source, /verificationDate\(verification\.verifiedAt\)/);
});

test("an eligible independent admin must make both declarations before recording review", async () => {
  const source = await read("components/studio/model-atelier.tsx");
  assert.match(source, /verification\.canRecordReview/);
  assert.match(source, /RECORD_AUTHORIZED_HUMAN_REVIEW/);
  assert.match(source, /juw\.atelier-authorized-human-review\.v1/);
  assert.match(source, /reviewedReliableAdultIdentityEvidence: true/);
  assert.match(source, /matchedEvidenceToLuluAuthority: true/);
  assert.match(source, /expectedAuthorityRevision: verification\.authorityRevision/);
  assert.match(source, /expectedAuthorityManifestSha256: verification\.authorityManifestSha256/);
  assert.match(source, /reviewCommandRef\.current = command/);
  assert.match(source, /const current = \(await readLuluVerification\(\)\)\.verification/);
  assert.match(source, /disabled=\{pending \|\| !reviewedEvidence \|\| !matchedAuthority\}/);
});

test("Lulu cannot review her own authority and is directed to another admin", async () => {
  const source = await read("components/studio/model-atelier.tsx");
  assert.match(source, /INDEPENDENT_REVIEWER_REQUIRED/);
  assert.match(source, /Another Studio admin must review Lulu’s reliable adult identity evidence/);
  assert.match(source, /Lulu cannot review her own authority/);
});

test("stock-model withdrawal gives PostgreSQL a typed JSONB reason", async () => {
  const source = await read("lib/server/studio-authority-repository.ts");
  assert.match(source, /'revocationReason', \$\{reason\}::text/);
});
