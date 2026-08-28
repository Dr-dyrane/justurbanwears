import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createStudioAtelierEligibilityHttpHandler } from "../lib/server/studio-atelier-eligibility-route";
import type { StudioAtelierEligibilityService } from "../lib/server/studio-atelier-eligibility-service";
import { StudioEngineError } from "../lib/studio/engine/errors";

const WARDROBE_ITEM_ID = "638e744d-2639-4e0d-8775-35d09f027dd3";

const projection = Object.freeze({
  schemaVersion: "juw.studio-atelier-eligibility.v2" as const,
  mode: "RECOVERY_ONLY" as const,
  wardrobeItem: Object.freeze({ title: "Lulu emerald dress", state: "DRAFT" as const, version: 1 }),
  legacyIntake: Object.freeze({ available: true }),
  stages: Object.freeze([]),
});

function context(id = WARDROBE_ITEM_ID) {
  return { params: Promise.resolve({ id }) };
}

test("the auth-neutral GET handler authenticates then returns a no-store projection", async () => {
  const calls: string[] = [];
  const service = {
    async read(subject: string, wardrobeItemId: string) {
      calls.push(`read:${subject}:${wardrobeItemId}`);
      return projection;
    },
  } as unknown as StudioAtelierEligibilityService;
  const handler = createStudioAtelierEligibilityHttpHandler({
    service,
    async requireOperator() {
      calls.push("auth");
      return { subject: "operator-http" };
    },
  });

  const response = await handler(
    new Request(`https://studio.example/api/studio/wardrobe/${WARDROBE_ITEM_ID}/atelier`),
    context(),
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(await response.json(), projection);
  assert.deepEqual(calls, ["auth", `read:operator-http:${WARDROBE_ITEM_ID}`]);
});

test("authentication errors remain authoritative and prevent eligibility reads", async () => {
  let readCount = 0;
  const handler = createStudioAtelierEligibilityHttpHandler({
    service: {
      async read() {
        readCount += 1;
        return projection;
      },
    } as unknown as StudioAtelierEligibilityService,
    async requireOperator() {
      throw new StudioEngineError(
        "AUTH_REQUIRED",
        401,
        "Sign in to use Studio.",
        "Sign in, then try again.",
      );
    },
  });

  const response = await handler(
    new Request("https://studio.example/api/studio/wardrobe/not-a-uuid/atelier"),
    context("not-a-uuid"),
  );
  assert.equal(response.status, 401);
  assert.equal(readCount, 0);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "AUTH_REQUIRED");
});

test("a malformed item path fails before the injected service is called", async () => {
  let readCount = 0;
  const handler = createStudioAtelierEligibilityHttpHandler({
    service: {
      async read() {
        readCount += 1;
        return projection;
      },
    } as unknown as StudioAtelierEligibilityService,
    async requireOperator() {
      return { subject: "operator-http" };
    },
  });

  const response = await handler(
    new Request("https://studio.example/api/studio/wardrobe/not-a-uuid/atelier"),
    context("not-a-uuid"),
  );
  assert.equal(response.status, 400);
  assert.equal(readCount, 0);
  assert.equal((await response.json() as { error: { code: string } }).error.code, "INVALID_REQUEST");
});

test("unexpected failures are sanitized and never cached", async () => {
  const handler = createStudioAtelierEligibilityHttpHandler({
    service: {
      async read() {
        throw new Error("private repository coordinate");
      },
    } as unknown as StudioAtelierEligibilityService,
    async requireOperator() {
      return { subject: "operator-http" };
    },
  });

  const response = await handler(
    new Request(`https://studio.example/api/studio/wardrobe/${WARDROBE_ITEM_ID}/atelier`),
    context(),
  );
  const body = await response.text();
  assert.equal(response.status, 503);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.doesNotMatch(body, /private repository coordinate/);
});

test("the handler is composition-only and has no concrete runtime, store, or provider dependency", () => {
  const source = readFileSync(
    new URL("../lib/server/studio-atelier-eligibility-route.ts", import.meta.url),
    "utf8",
  );

  assert.doesNotMatch(source, /from\s+["'][^"']*(production-readiness|production-runtime|repository|provider|private-content-addressed)[^"']*["']/);
  assert.doesNotMatch(source, /requireStudioOperator|request\.json\(|fetch\(|\bPOST\b/);
  assert.match(source, /input\.service\.read\(operator\.subject, wardrobeItemId\.data\)/);
});

test("the concrete route installs only the authenticated no-store GET composition", () => {
  const source = readFileSync(
    new URL("../app/api/studio/wardrobe/[id]/atelier/route.ts", import.meta.url),
    "utf8",
  );

  assert.match(source, /requireStudioOperator/);
  assert.match(source, /studioAtelierEligibilityService/);
  assert.match(source, /createStudioAtelierEligibilityHttpHandler/);
  assert.match(source, /export const GET/);
  assert.doesNotMatch(source, /export const (POST|PUT|PATCH|DELETE)|request\.json\(|provider|generate/i);
});
