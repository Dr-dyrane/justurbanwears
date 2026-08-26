import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import {
  createStudioAtelierReviewArtifactService,
} from "../lib/server/studio-atelier-review-artifact";
import type {
  AtelierArtifactRow,
  AtelierExecutionRow,
  AtelierLifecycleState,
  AtelierOperationProjectionRow,
  AtelierOperationRow,
} from "../lib/server/studio-atelier-repository";
import { StudioEngineError } from "../lib/studio/engine/errors";

const OPERATOR = "operator-review-artifact";
const OTHER_OPERATOR = "operator-review-artifact-other";
const OPERATION_ID = "11111111-1111-4111-8111-111111111111";
const EXECUTION_ID = "22222222-2222-4222-8222-222222222222";
const ARTIFACT_ID = "33333333-3333-4333-8333-333333333333";
const BYTES = new Uint8Array([1, 2, 3, 4]);
const HASH = createHash("sha256").update(BYTES).digest("hex");
const operator = {
  subject: OPERATOR,
  email: "operator@example.com",
  displayName: "Review Operator",
  role: "operator" as const,
};
const otherOperator = {
  ...operator,
  subject: OTHER_OPERATOR,
  email: "other@example.com",
};

const HIDDEN_STATES: readonly AtelierLifecycleState[] = [
  "DRAFT",
  "MATERIALIZED",
  "TECHNICAL_PASS",
  "TECHNICAL_FAIL",
  "SEMANTIC_FAIL",
  "USER_REJECTED",
  "SUPERSEDED",
  "BLOCKED_USER_DIRECTION",
];

function projection(state: AtelierLifecycleState): AtelierOperationProjectionRow {
  return {
    operationId: OPERATION_ID,
    version: 4,
    state,
    technicalDecision: state === "DRAFT" || state === "MATERIALIZED" ? "PENDING" : "PASS",
    semanticDecision: ["SEMANTIC_PASS", "USER_APPROVED", "LOCKED"].includes(state)
      ? "PASS"
      : state === "SEMANTIC_FAIL" ? "FAIL" : "PENDING",
    userDecision: state === "USER_APPROVED" || state === "LOCKED"
      ? "APPROVED"
      : state === "USER_REJECTED" ? "REJECTED" : "PENDING",
    correctionAuthorized: false,
    materializedExecutionId: EXECUTION_ID,
    materializedArtifactId: ARTIFACT_ID,
    materializedArtifactSha256: HASH,
    lockedArtifactId: state === "LOCKED" ? ARTIFACT_ID : null,
    lockedAssetId: state === "LOCKED" ? `atelier.lock/${HASH}` : null,
    lockedArtifactSha256: state === "LOCKED" ? HASH : null,
    lockedParentDescriptor: state === "LOCKED" ? { lockedLayer: "GARMENT" } : null,
    supersededByOperationId: null,
    blockedReason: null,
    lastEventHash: HASH,
    createdAt: new Date("2026-08-26T12:00:00Z"),
    updatedAt: new Date("2026-08-26T12:00:00Z"),
  } as AtelierOperationProjectionRow;
}

function artifact(): AtelierArtifactRow {
  return {
    id: ARTIFACT_ID,
    executionId: EXECUTION_ID,
    ordinal: 0,
    kind: "NORMALIZED",
    role: "REVIEW_ARTIFACT",
    state: "STORED",
    blobPathname: `atelier/${HASH}.jpg`,
    blobUrl: `https://private.invalid/${HASH}.jpg`,
    mimeType: "image/jpeg",
    byteSize: BYTES.byteLength,
    width: 1024,
    height: 1536,
    sha256: HASH,
    metadata: {},
    quarantineReason: null,
    privacy: "PRIVATE",
    createdAt: new Date("2026-08-26T12:00:00Z"),
  } as AtelierArtifactRow;
}

function candidate(state: AtelierLifecycleState) {
  return {
    operation: {
      id: OPERATION_ID,
      operatorSubject: OPERATOR,
    } as AtelierOperationRow,
    projection: projection(state),
    execution: {
      id: EXECUTION_ID,
      operationId: OPERATION_ID,
      state: "COMPLETE",
    } as AtelierExecutionRow,
    artifact: artifact(),
  };
}

async function expectStudioError(
  action: () => Promise<unknown>,
  code: StudioEngineError["code"],
): Promise<void> {
  await assert.rejects(action, (error: unknown) =>
    error instanceof StudioEngineError && error.code === code
  );
}

for (const state of HIDDEN_STATES) {
  test(`review artifact bytes stay hidden in ${state}`, async () => {
    let readCalls = 0;
    const read = createStudioAtelierReviewArtifactService({
      getCandidate: async () => candidate(state),
      getProjection: async () => projection(state),
      readArtifact: async () => {
        readCalls += 1;
        return BYTES;
      },
    });
    await expectStudioError(
      () => read({ operator, operationId: OPERATION_ID }),
      "INTAKE_NOT_FOUND",
    );
    assert.equal(readCalls, 0);
  });
}

for (const state of ["SEMANTIC_PASS", "USER_APPROVED", "LOCKED"] as const) {
  test(`the exact operator-scoped review artifact is readable in ${state}`, async () => {
    const calls: Array<Record<string, string>> = [];
    const read = createStudioAtelierReviewArtifactService({
      getCandidate: async (input) => {
        calls.push(input);
        return candidate(state);
      },
      getProjection: async (input) => {
        calls.push(input);
        return projection(state);
      },
      readArtifact: async (value) => {
        assert.equal(value.id, ARTIFACT_ID);
        return BYTES;
      },
    });
    const result = await read({
      operator: { ...operator, subject: ` ${OPERATOR} ` },
      operationId: ` ${OPERATION_ID} `,
    });
    assert.equal(result.lifecycleState, state);
    assert.equal(result.mimeType, "image/jpeg");
    assert.equal(result.byteSize, BYTES.byteLength);
    assert.deepEqual(result.bytes, BYTES);
    assert.deepEqual(calls, [{
      operatorSubject: OPERATOR,
      operationId: OPERATION_ID,
    }, {
      operatorSubject: OPERATOR,
      operationId: OPERATION_ID,
    }]);
    const publicShape = result as unknown as Record<string, unknown>;
    assert.equal("blobPathname" in publicShape, false);
    assert.equal("blobUrl" in publicShape, false);
    assert.equal("sha256" in publicShape, false);
    assert.equal("artifactId" in publicShape, false);
  });
}

test("a different operator scope resolves neither metadata nor bytes", async () => {
  let readCalls = 0;
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async (input) => input.operatorSubject === OPERATOR
      ? candidate("SEMANTIC_PASS")
      : null,
    getProjection: async () => null,
    readArtifact: async () => {
      readCalls += 1;
      return BYTES;
    },
  });
  await expectStudioError(
    () => read({ operator: otherOperator, operationId: OPERATION_ID }),
    "INTAKE_NOT_FOUND",
  );
  assert.equal(readCalls, 0);
});

test("a rejection during private-byte verification fails closed", async () => {
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => candidate("SEMANTIC_PASS"),
    getProjection: async () => projection("USER_REJECTED"),
    readArtifact: async () => BYTES,
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "INTAKE_NOT_FOUND",
  );
});

test("a locked projection must bind the exact reviewed artifact", async () => {
  const mismatched = projection("LOCKED");
  mismatched.lockedArtifactId = "44444444-4444-4444-8444-444444444444";
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => ({
      ...candidate("LOCKED"),
      projection: mismatched,
    }),
    getProjection: async () => mismatched,
    readArtifact: async () => BYTES,
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "ENGINE_UNAVAILABLE",
  );
});

test("a byte-size mismatch never returns a private artifact", async () => {
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => candidate("SEMANTIC_PASS"),
    getProjection: async () => projection("SEMANTIC_PASS"),
    readArtifact: async () => new Uint8Array([1]),
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "INVALID_ASSET",
  );
});

test("same-size bytes with the wrong content hash never leave the server", async () => {
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => candidate("SEMANTIC_PASS"),
    getProjection: async () => projection("SEMANTIC_PASS"),
    readArtifact: async () => new Uint8Array([4, 3, 2, 1]),
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "INVALID_ASSET",
  );
});

test("candidate metadata must remain bound to the authenticated operator and operation", async () => {
  let readCalls = 0;
  const wrongScope = candidate("SEMANTIC_PASS");
  wrongScope.operation.operatorSubject = OTHER_OPERATOR;
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => wrongScope,
    getProjection: async () => projection("SEMANTIC_PASS"),
    readArtifact: async () => {
      readCalls += 1;
      return BYTES;
    },
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "ENGINE_UNAVAILABLE",
  );
  assert.equal(readCalls, 0);
});

test("review authorization cannot regress while private bytes are read", async () => {
  const regressed = projection("SEMANTIC_PASS");
  regressed.version = 5;
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => candidate("USER_APPROVED"),
    getProjection: async () => regressed,
    readArtifact: async () => BYTES,
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "ENGINE_UNAVAILABLE",
  );
});

test("missing review dimensions fail before private bytes are read", async () => {
  let readCalls = 0;
  const missingDimensions = artifact();
  missingDimensions.width = null;
  missingDimensions.height = null;
  const read = createStudioAtelierReviewArtifactService({
    getCandidate: async () => ({
      ...candidate("SEMANTIC_PASS"),
      artifact: missingDimensions,
    }),
    getProjection: async () => projection("SEMANTIC_PASS"),
    readArtifact: async () => {
      readCalls += 1;
      return BYTES;
    },
  });
  await expectStudioError(
    () => read({ operator, operationId: OPERATION_ID }),
    "ENGINE_UNAVAILABLE",
  );
  assert.equal(readCalls, 0);
});
