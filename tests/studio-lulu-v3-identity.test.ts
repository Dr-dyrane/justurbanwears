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

test("Model Atelier uses a public V3 try-on without exposing the private master", async () => {
  const [atelier, projection] = await Promise.all([
    read("components/studio/model-atelier.tsx"),
    read("lib/studio/projections/approved-catalogue.ts"),
  ]);
  const source = `${atelier}\n${projection}`;
  assert.match(source, /APPROVED_PUBLIC_MODEL_PREVIEW/);
  assert.match(source, /Approved default/);
  assert.match(source, /cocoa-cowl-gathered-midi-dress\/07-model-left-profile\.webp/);
  assert.doesNotMatch(source, /lulu-v2-approved\.png/);
  assert.doesNotMatch(source, /storage\/models\/konan/);
});
