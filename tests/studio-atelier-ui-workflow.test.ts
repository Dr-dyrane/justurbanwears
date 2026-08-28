import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

import {
  isStudioAtelierUiReadError,
  readStudioAtelierOperation,
  retainNewestStudioAtelierOperation,
  shouldPollStudioAtelierOperation,
  studioAtelierReviewMediaUrl,
  STUDIO_ATELIER_RECOVERY_CAPABILITY,
  type StudioAtelierUiOperation,
} from "../lib/studio/atelier/ui-client";

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");
const clientSource = read("lib/studio/atelier/ui-client.ts");
const workspaceSource = read("components/studio/atelier/studio-atelier-operation-workspace.tsx");
const routeSource = read("app/(studio)/studio/media/atelier/[operationId]/page.tsx");

function operation(
  overrides: Partial<StudioAtelierUiOperation> = {},
): StudioAtelierUiOperation {
  return {
    operationId: "op:test/001",
    stage: "GARMENT_01_FRONT",
    view: "01",
    state: "DRAFT",
    version: 1,
    candidateVisibility: "HIDDEN",
    nextAction: "GENERATE",
    reused: false,
    ...overrides,
  };
}

test("the durable Atelier browser client is recovery-only and default-denies every command", () => {
  assert.deepEqual(STUDIO_ATELIER_RECOVERY_CAPABILITY, {
    prepare: false,
    generate: false,
    review: false,
    lockOrReuse: false,
    recover: true,
    reviewMedia: true,
  });
  assert.match(clientSource, /method: "GET"/);
  assert.doesNotMatch(clientSource, /method: "POST"|\/run`|\/decision`|prepareStudio|generateStudio|lockOrReuseStudio/);
  assert.doesNotMatch(workspaceSource, /fetch\(|method: "POST"/);
});

test("operation recovery binds same-origin GET to the exact returned operation", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInput: string | URL | Request | undefined;
  let capturedInit: RequestInit | undefined;
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    capturedInput = input;
    capturedInit = init;
    return Response.json({ operation: operation() });
  }) as typeof fetch;
  try {
    const recovered = await readStudioAtelierOperation("op:test/001");
    assert.equal(recovered.operationId, "op:test/001");
    assert.equal(capturedInput, "/api/studio/atelier/operations/op%3Atest%2F001");
    assert.equal(capturedInit?.method, "GET");
    assert.equal(capturedInit?.credentials, "same-origin");
    assert.equal(capturedInit?.cache, "no-store");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("operation recovery canonicalizes one encoded dynamic-route segment", async () => {
  const originalFetch = globalThis.fetch;
  let capturedInput: string | URL | Request | undefined;
  globalThis.fetch = (async (input: string | URL | Request) => {
    capturedInput = input;
    return Response.json({ operation: operation() });
  }) as typeof fetch;
  try {
    const recovered = await readStudioAtelierOperation("op%3Atest%2F001");
    assert.equal(recovered.operationId, "op:test/001");
    assert.equal(capturedInput, "/api/studio/atelier/operations/op%3Atest%2F001");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("sanitized read blockers survive a development module refresh boundary", () => {
  const retainedError = {
    name: "StudioAtelierUiReadError",
    message: "Studio AI is not enabled for this host.",
    status: 503,
    code: "ENGINE_DISABLED",
    recovery: "Use the approved Studio workspace.",
  };

  assert.equal(isStudioAtelierUiReadError(retainedError), true);
  assert.equal(isStudioAtelierUiReadError({ ...retainedError, recovery: 7 }), false);
  assert.match(workspaceSource, /isStudioAtelierUiReadError\(error\)/);
});

test("review media remains absent until the exact sanitized projection is reviewable", () => {
  const hidden = operation({ state: "MATERIALIZED", nextAction: "WAIT_FOR_MATERIALIZATION" });
  const inconsistent = operation({ candidateVisibility: "REVIEWABLE", state: "TECHNICAL_PASS", nextAction: "WAIT_FOR_MATERIALIZATION" });
  const reviewable = operation({ candidateVisibility: "REVIEWABLE", state: "SEMANTIC_PASS", nextAction: "REVIEW", version: 8 });

  assert.equal(studioAtelierReviewMediaUrl(hidden), null);
  assert.equal(studioAtelierReviewMediaUrl(inconsistent), null);
  assert.equal(
    studioAtelierReviewMediaUrl(reviewable),
    "/api/studio/atelier/operations/op%3Atest%2F001/review-media?v=8",
  );
  assert.match(workspaceSource, /mediaUrl \? studioAtelierReviewMediaUrl|studioAtelierReviewMediaUrl\(operation\)/);
  assert.match(clientSource, /candidateVisibility !== "REVIEWABLE"/);
});

test("reconciliation polling is bounded to durable wait projections and never regresses revision", () => {
  assert.equal(shouldPollStudioAtelierOperation(operation()), false);
  assert.equal(shouldPollStudioAtelierOperation(operation({ nextAction: "WAIT_FOR_MATERIALIZATION" })), true);
  assert.equal(shouldPollStudioAtelierOperation(operation({ nextAction: "GENERATE_CORRECTION" })), false);

  const newest = operation({ version: 7, state: "SEMANTIC_PASS", candidateVisibility: "REVIEWABLE", nextAction: "REVIEW" });
  const stale = operation({ version: 6, state: "TECHNICAL_PASS", nextAction: "WAIT_FOR_MATERIALIZATION" });
  assert.equal(retainNewestStudioAtelierOperation(newest, stale), newest);
  assert.match(workspaceSource, /RECONCILIATION_DELAYS_MS = \[1_500, 2_500, 4_000, 6_500, 8_000\]/);
  assert.match(workspaceSource, /pollAttempt >= RECONCILIATION_DELAYS_MS\.length/);
});

test("the deep link preserves one adaptive workspace, immediate feedback, accessibility, and legacy Intake", () => {
  assert.equal(workspaceSource.match(/<StudioAdaptiveWorkspace/g)?.length, 1);
  assert.match(workspaceSource, /initialDetent="half"/);
  assert.match(workspaceSource, /surfaceLabel="Atelier operation controls"/);
  assert.match(workspaceSource, /aria-busy=\{checking \|\| undefined\}/);
  assert.match(workspaceSource, /disabled=\{checking\}/);
  assert.match(workspaceSource, /Checking current state…/);
  assert.match(workspaceSource, /Zero-spend recovery only/);
  assert.match(workspaceSource, /quality-cleared review artifact/);
  assert.doesNotMatch(workspaceSource, /approved review artifact/);
  assert.match(workspaceSource, /href="\/studio\/media\/new"[\s\S]*?Use current Intake/);
  assert.match(workspaceSource, /href="\/studio\/media"[\s\S]*?All media/);
  assert.match(routeSource, /<StudioAtelierOperationWorkspace operationId=\{operationId\}/);
  assert.doesNotMatch(routeSource, /ShootComposer|ShootDetail/);
});
