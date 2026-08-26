import assert from "node:assert/strict";
import test from "node:test";
import {
  createStudioAtelierAgentEngine,
} from "../lib/server/studio-atelier-agent-engine";
import type {
  StudioAtelierCommandResult,
  StudioAtelierEngineFacade,
} from "../lib/server/studio-atelier-engine-facade";

const OPERATION_ID = "7a89499d-9e1a-4d62-8ad4-51af4db5f25d";

function result(
  overrides: Partial<StudioAtelierCommandResult>,
): StudioAtelierCommandResult {
  return Object.freeze({
    operationId: OPERATION_ID,
    stage: "GARMENT_01_FRONT",
    view: "01",
    state: "SEMANTIC_FAIL",
    version: 0,
    candidateVisibility: "HIDDEN",
    nextAction: "REVIEW",
    reused: false,
    ...overrides,
  });
}

test("production agent factory exposes only the fixed durable engine composition", async () => {
  const factoryHasExactlyOneParameter: Parameters<
    typeof createStudioAtelierAgentEngine
  >["length"] extends 1 ? true : false = true;
  const calls: string[] = [];
  const engine: StudioAtelierEngineFacade = {
    async readProjection() {
      calls.push("read");
      return result({
        state: "SEMANTIC_PASS",
        candidateVisibility: "REVIEWABLE",
      });
    },
    async prepare() {
      calls.push("prepare");
      return result({
        state: "SEMANTIC_PASS",
        candidateVisibility: "REVIEWABLE",
      });
    },
    async generate() {
      throw new Error("A prepared semantic pass must not generate.");
    },
    async review() {
      throw new Error("A prepared semantic pass must not be privately reviewed again.");
    },
    async lockOrReuse() {
      throw new Error("The private agent must never lock on the user's behalf.");
    },
    async resumeRecordedReview() {
      throw new Error("A semantic pass has no recorded review to resume.");
    },
  };

  const gate = createStudioAtelierAgentEngine(engine);
  const final = await gate.run("operator-agent-engine", {});

  assert.equal(factoryHasExactlyOneParameter, true);
  assert.equal(final.state, "SEMANTIC_PASS");
  assert.equal(final.candidateVisibility, "REVIEWABLE");
  assert.deepEqual(calls, ["prepare"]);
});

test("production agent resumes a prepared operation by ID without declaration preparation", async () => {
  const calls: string[] = [];
  const engine: StudioAtelierEngineFacade = {
    async readProjection(_operatorSubject, operationId) {
      assert.equal(operationId, OPERATION_ID);
      calls.push("read");
      return result({ state: "DRAFT", nextAction: "GENERATE" });
    },
    async prepare() {
      throw new Error("runPrepared must not prepare a declaration.");
    },
    async generate(_operatorSubject, operationId) {
      assert.equal(operationId, OPERATION_ID);
      calls.push("generate");
      return result({
        state: "SEMANTIC_PASS",
        candidateVisibility: "REVIEWABLE",
        nextAction: "REVIEW",
      });
    },
    async review() {
      throw new Error("A semantic pass must not be privately reviewed again.");
    },
    async lockOrReuse() {
      throw new Error("The private agent must never lock on the user's behalf.");
    },
    async resumeRecordedReview() {
      throw new Error("The draft has no recorded review to resume.");
    },
  };

  const gate = createStudioAtelierAgentEngine(engine);
  const final = await gate.runPrepared("operator-agent-engine", OPERATION_ID);

  assert.equal(final.state, "SEMANTIC_PASS");
  assert.deepEqual(calls, ["read", "generate"]);
});
