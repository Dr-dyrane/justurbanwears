import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  createStudioDetailHydrationGate,
  createStudioSingleFlight,
  selectStudioHomeGate,
} from "../lib/studio/application/home-gate";

const ready = {
  applicationStatus: "ready" as const,
  authorityStatus: "ready" as const,
  hydration: "ready" as const,
  scenario: false,
};

test("connected Home renders from its application bootstrap without waiting for detail truth", () => {
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "idle" }), "loading");
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "loading" }), "loading");
  assert.equal(selectStudioHomeGate({ ...ready, authorityStatus: "loading" }), "ready");
  assert.equal(selectStudioHomeGate({ ...ready, authorityStatus: "error" }), "ready");
  assert.equal(selectStudioHomeGate({ ...ready, hydration: "restoring" }), "ready");
  assert.equal(selectStudioHomeGate({ ...ready, hydration: "degraded" }), "ready");
  assert.equal(selectStudioHomeGate(ready), "ready");
});

test("Home fails closed only when its own bootstrap is unavailable and preserves simulator ordering", () => {
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "error" }), "error");
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "error", authorityStatus: "error" }), "error");
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "error", hydration: "restoring", scenario: true }), "loading");
  assert.equal(selectStudioHomeGate({ ...ready, applicationStatus: "error", scenario: true }), "ready");
});

test("bootstrap reads are single-flight and release exactly one lazy detail wave", async () => {
  const singleFlight = createStudioSingleFlight();
  let readCount = 0;
  let finishRead!: () => void;
  const pendingRead = new Promise<void>((resolve) => { finishRead = resolve; });
  const first = singleFlight.run(async () => {
    readCount += 1;
    await pendingRead;
  });
  const repeated = singleFlight.run(async () => { readCount += 1; });

  assert.equal(first, repeated);
  await Promise.resolve();
  assert.equal(readCount, 1);
  finishRead();
  await first;
  await singleFlight.run(async () => { readCount += 1; });
  assert.equal(readCount, 2);

  const detailGate = createStudioDetailHydrationGate();
  const ordering = ["application"];
  const details = detailGate.wait().then(() => { ordering.push("details"); });
  await Promise.resolve();
  assert.deepEqual(ordering, ["application"]);
  detailGate.release();
  detailGate.release();
  await details;
  assert.deepEqual(ordering, ["application", "details"]);
});

test("provider starts detail hydration after bootstrap with one listener and Home never claims a false empty", async () => {
  const [provider, home] = await Promise.all([
    readFile(new URL("../components/studio/studio-provider.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/studio/studio-home.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(provider, /async hydrate\(\) \{\s*await detailHydrationGate\.wait\(\);/u);
  assert.match(provider, /void refreshApplication\(\)\.finally\(releaseDetails\)/u);
  assert.match(provider, /detailHydrationGate\.release\(\);\s*void refreshAuthority\(\);/u);
  assert.match(provider, /applicationSingleFlight\.run/u);
  assert.match(provider, /authoritySingleFlight\.run/u);
  assert.equal(provider.match(/document\.addEventListener\("visibilitychange"/gu)?.length, 1);
  assert.equal(provider.match(/readStudioApplication\(/gu)?.length, 1);
  assert.equal(provider.match(/readStudioAuthority\(/gu)?.length, 1);
  assert.match(home, /recentPiecesState === "loading"/u);
  assert.match(home, /Loading recent pieces…/u);
  assert.match(home, /recentPiecesState === "unavailable"/u);
  assert.match(home, /Recent pieces unavailable/u);
  assert.match(home, /recentPiecesState[^]*recentGarments\.length[^]*No pieces yet/u);
  assert.doesNotMatch(home, /More recommendations/u);
  assert.doesNotMatch(home, /studio-home-recommendation-actions/u);
});
