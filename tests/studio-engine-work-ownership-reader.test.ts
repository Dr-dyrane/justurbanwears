import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createStudioEngineWorkOwnershipReader } from "../lib/server/studio-engine-work-ownership-reader";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = "operator-read-only-owner";
const ITEM = "00000000-0000-4000-8000-000000001717";
const INPUT = Object.freeze({
  operatorSubject: OPERATOR,
  wardrobeItemId: ITEM,
  stageFamily: "GARMENT_FRONT" as const,
});

test("ownership lookup returns only unclaimed or the immutable owner", async () => {
  const unclaimed = createStudioEngineWorkOwnershipReader({
    read: async () => ({ wardrobe_item_id: ITEM, owner: null }),
  });
  const owned = createStudioEngineWorkOwnershipReader({
    read: async () => ({ wardrobe_item_id: ITEM, owner: "ATELIER" }),
  });

  assert.deepEqual(await unclaimed(INPUT), { state: "UNCLAIMED" });
  assert.deepEqual(await owned(INPUT), { state: "OWNED", owner: "ATELIER" });
  assert.deepEqual(Object.keys(await owned(INPUT)).sort(), ["owner", "state"]);
});

test("missing, foreign, mismatched, or corrupt rows fail closed", async () => {
  const missing = createStudioEngineWorkOwnershipReader({ read: async () => null });
  const mismatched = createStudioEngineWorkOwnershipReader({
    read: async () => ({
      wardrobe_item_id: "00000000-0000-4000-8000-000000001718",
      owner: null,
    }),
  });
  const corrupt = createStudioEngineWorkOwnershipReader({
    read: async () => ({ wardrobe_item_id: ITEM, owner: "SOME_OTHER_ENGINE" }),
  });

  for (const reader of [missing, mismatched]) {
    await assert.rejects(
      reader(INPUT),
      (error: unknown) => error instanceof StudioEngineError
        && error.code === "INTAKE_NOT_FOUND"
        && error.status === 404,
    );
  }
  await assert.rejects(
    corrupt(INPUT),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "ENGINE_UNAVAILABLE"
      && error.status === 503,
  );
});

test("malformed identity or stage input fails before the read adapter", async () => {
  let reads = 0;
  const reader = createStudioEngineWorkOwnershipReader({
    read: async () => {
      reads += 1;
      return { wardrobe_item_id: ITEM, owner: null };
    },
  });

  await assert.rejects(
    reader({ ...INPUT, wardrobeItemId: "not-a-uuid" }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_REQUEST"
      && error.status === 400,
  );
  await assert.rejects(
    reader({ ...INPUT, stageFamily: "SOME_OTHER_STAGE" as typeof INPUT.stageFamily }),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_REQUEST",
  );
  assert.equal(reads, 0);
});

test("default ownership lookup is one read-only operator-scoped SELECT", () => {
  const source = readFileSync(
    new URL("../lib/server/studio-engine-work-ownership-reader.ts", import.meta.url),
    "utf8",
  ).replaceAll("\r\n", "\n");
  const queryStart = source.indexOf("select wardrobe.id::text");
  const query = source.slice(queryStart, source.indexOf("  `);", queryStart));

  assert.match(query, /left join studio_engine_work_ownership ownership/);
  assert.match(query, /ownership\.stage_family = \$\{input\.stageFamily\}/);
  assert.match(query, /wardrobe\.operator_subject = \$\{input\.operatorSubject\}/);
  assert.match(query, /wardrobe\.id = \$\{input\.wardrobeItemId\}::uuid/);
  assert.doesNotMatch(query, /insert|update|delete|lease|claim|release/i);
  assert.doesNotMatch(source, /semanticHash|semantic_hash|createdAt|updatedAt/);
});
