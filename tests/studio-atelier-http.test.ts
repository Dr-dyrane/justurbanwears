import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  assertStudioAtelierMutationOrigin,
  createStudioAtelierHttpHandlers,
  parseStudioAtelierEmptyCommand,
} from "../lib/server/studio-atelier-http";
import type { StudioAtelierRouteService } from "../lib/server/studio-atelier-route-service";
import type { StudioOperator } from "../lib/server/studio-operator";
import { StudioEngineError } from "../lib/studio/engine/errors";

const ORIGIN = "https://studio.example";
const OPERATION_ID = "op-http-001";
const OPERATOR = Object.freeze({
  actorSubject: "actor-operator-http",
  workspaceId: "workspace-juw",
  workspaceSubject: "operator-http",
  subject: "operator-http",
  email: "operator@example.com",
  displayName: "Operator",
  role: "operator",
} as const satisfies StudioOperator);

const fixture = JSON.parse(readFileSync(
  new URL("./fixtures/studio-atelier-declarations.v1.json", import.meta.url),
  "utf8",
)) as { cases: Array<{ declaration: unknown }> };

function command(state = "SEMANTIC_PASS") {
  return Object.freeze({
    operationId: OPERATION_ID,
    stage: "GARMENT_01_FRONT" as const,
    view: "01" as const,
    state: state as "SEMANTIC_PASS",
    version: 3,
    candidateVisibility: "REVIEWABLE" as const,
    nextAction: "REVIEW" as const,
    reused: false,
  });
}

function serviceHarness() {
  const calls: Array<Readonly<{ name: string; arguments: readonly unknown[] }>> = [];
  const service = {
    async prepare(operator: StudioOperator, declaration: unknown) {
      calls.push({ name: "prepare", arguments: [operator, declaration] });
      return command("DRAFT");
    },
    async run(operator: StudioOperator, operationId: string) {
      calls.push({ name: "run", arguments: [operator, operationId] });
      return command();
    },
    async recover(operator: StudioOperator, operationId: string) {
      calls.push({ name: "recover", arguments: [operator, operationId] });
      return command();
    },
    async readReviewMedia(operator: StudioOperator, operationId: string) {
      calls.push({ name: "readReviewMedia", arguments: [operator, operationId] });
      return Object.freeze({
        operationId,
        lifecycleState: "SEMANTIC_PASS" as const,
        mimeType: "image/png" as const,
        byteSize: 4,
        width: 1,
        height: 1,
        bytes: new Uint8Array([1, 2, 3, 4]),
      });
    },
    async decide(operator: StudioOperator, operationId: string, decision: unknown) {
      calls.push({ name: "decide", arguments: [operator, operationId, decision] });
      return command("LOCKED");
    },
  } as unknown as StudioAtelierRouteService;
  return { calls, service };
}

function sameOriginRequest(path: string, init: RequestInit = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    ...init,
    headers: {
      origin: ORIGIN,
      "sec-fetch-site": "same-origin",
      ...init.headers,
    },
  });
}

function context(operationId = OPERATION_ID) {
  return { params: Promise.resolve({ operationId }) };
}

test("the five App Router entrypoints are thin Node-only adapters", () => {
  const routes = [
    ["../app/api/studio/atelier/prepare/route.ts", "POST", "prepare"],
    ["../app/api/studio/atelier/operations/[operationId]/route.ts", "GET", "recover"],
    ["../app/api/studio/atelier/operations/[operationId]/run/route.ts", "POST", "run"],
    ["../app/api/studio/atelier/operations/[operationId]/review-media/route.ts", "GET", "reviewMedia"],
    ["../app/api/studio/atelier/operations/[operationId]/decision/route.ts", "POST", "decision"],
  ] as const;

  for (const [path, method, handler] of routes) {
    const source = readFileSync(new URL(path, import.meta.url), "utf8");
    assert.match(source, /export const dynamic = "force-dynamic"/);
    assert.match(source, /export const runtime = "nodejs"/);
    assert.match(source, new RegExp(`export async function ${method}\\b`));
    assert.match(source, new RegExp(`studioAtelierHttpHandlers\\.${handler}\\(`));
    assert.doesNotMatch(source, /studio-gateway|gpt-image|provider|prompt/i);
  }
});

test("mutation origin rejects cross-site browser requests before authentication", () => {
  assert.throws(
    () => assertStudioAtelierMutationOrigin(new Request(
      `${ORIGIN}/api/studio/atelier/prepare`,
      {
        method: "POST",
        headers: {
          origin: "https://attacker.example",
          "sec-fetch-site": "cross-site",
        },
      },
    )),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "OPERATOR_FORBIDDEN",
  );
});

test("run accepts no execution payload and rejects server-owned fields", async () => {
  assert.deepEqual(
    await parseStudioAtelierEmptyCommand(sameOriginRequest("/run", {
      method: "POST",
    })),
    {},
  );
  assert.deepEqual(
    await parseStudioAtelierEmptyCommand(sameOriginRequest("/run", {
      method: "POST",
      body: "{}",
    })),
    {},
  );
  await assert.rejects(
    parseStudioAtelierEmptyCommand(sameOriginRequest("/run", {
      method: "POST",
      body: JSON.stringify({ provider: "openai", prompt: "forged" }),
    })),
    (error: unknown) => error instanceof StudioEngineError
      && error.code === "INVALID_REQUEST",
  );
});

test("prepare parses only the strict declaration and returns a no-store projection", async () => {
  const kit = serviceHarness();
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => OPERATOR,
  });
  const declaration = fixture.cases[0]!.declaration;
  const response = await handlers.prepare(sameOriginRequest(
    "/api/studio/atelier/prepare",
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(declaration),
    },
  ));

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(kit.calls, [{
    name: "prepare",
    arguments: [OPERATOR, declaration],
  }]);
  const body = await response.text();
  assert.doesNotMatch(body, /provider|prompt|sha256|pathname|artifact/i);
});

test("explicit run forwards only authenticated operator scope and operation ID", async () => {
  const kit = serviceHarness();
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => OPERATOR,
  });
  const response = await handlers.run(sameOriginRequest(
    `/api/studio/atelier/operations/${OPERATION_ID}/run`,
    { method: "POST", body: "{}" },
  ), context());

  assert.equal(response.status, 200);
  assert.deepEqual(kit.calls, [{
    name: "run",
    arguments: [OPERATOR, OPERATION_ID],
  }]);
});

test("cross-origin decision is rejected before auth, parsing, or service mutation", async () => {
  const kit = serviceHarness();
  let authCalls = 0;
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => {
      authCalls += 1;
      return OPERATOR;
    },
  });
  const response = await handlers.decision(new Request(
    `${ORIGIN}/api/studio/atelier/operations/${OPERATION_ID}/decision`,
    {
      method: "POST",
      headers: {
        origin: "https://attacker.example",
        "sec-fetch-site": "cross-site",
        "content-type": "application/json",
      },
      body: JSON.stringify({ decision: "KEEP" }),
    },
  ), context());

  assert.equal(response.status, 403);
  assert.equal(authCalls, 0);
  assert.deepEqual(kit.calls, []);
});

test("decision accepts only the closed Keep/Fix/Reject schema", async () => {
  const kit = serviceHarness();
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => OPERATOR,
  });
  const response = await handlers.decision(sameOriginRequest(
    `/api/studio/atelier/operations/${OPERATION_ID}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "KEEP" }),
    },
  ), context());

  assert.equal(response.status, 200);
  assert.deepEqual(kit.calls, [{
    name: "decide",
    arguments: [OPERATOR, OPERATION_ID, { decision: "KEEP" }],
  }]);

  kit.calls.length = 0;
  const forged = await handlers.decision(sameOriginRequest(
    `/api/studio/atelier/operations/${OPERATION_ID}/decision`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "KEEP", artifactSha256: "a".repeat(64) }),
    },
  ), context());
  assert.equal(forged.status, 400);
  assert.deepEqual(kit.calls, []);
});

test("recovery is read-only, authenticated and no-store", async () => {
  const kit = serviceHarness();
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => OPERATOR,
  });
  const response = await handlers.recover(new Request(
    `${ORIGIN}/api/studio/atelier/operations/${OPERATION_ID}`,
  ), context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store, max-age=0");
  assert.deepEqual(kit.calls, [{
    name: "recover",
    arguments: [OPERATOR, OPERATION_ID],
  }]);
});

test("review media is private, no-store, same-origin and byte exact", async () => {
  const kit = serviceHarness();
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => OPERATOR,
  });
  const response = await handlers.reviewMedia(new Request(
    `${ORIGIN}/api/studio/atelier/operations/${OPERATION_ID}/review-media`,
  ), context());

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "private, no-store, max-age=0");
  assert.equal(response.headers.get("content-type"), "image/png");
  assert.equal(response.headers.get("content-length"), "4");
  assert.equal(response.headers.get("cross-origin-resource-policy"), "same-origin");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.deepEqual(
    [...new Uint8Array(await response.arrayBuffer())],
    [1, 2, 3, 4],
  );
});

test("auth errors are returned before the runtime service is called", async () => {
  const kit = serviceHarness();
  const handlers = createStudioAtelierHttpHandlers({
    service: kit.service,
    requireOperator: async () => {
      throw new StudioEngineError(
        "AUTH_REQUIRED",
        401,
        "Sign in to use Studio AI.",
        "Sign in, then try again.",
      );
    },
  });
  const response = await handlers.recover(new Request(
    `${ORIGIN}/api/studio/atelier/operations/${OPERATION_ID}`,
  ), context());

  assert.equal(response.status, 401);
  assert.deepEqual(kit.calls, []);
});
