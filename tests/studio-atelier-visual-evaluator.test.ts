import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import sharp from "sharp";
import {
  STUDIO_ATELIER_VISUAL_ACCOUNTING_SCHEMA_VERSION,
  STUDIO_ATELIER_VISUAL_EVALUATOR_POLICY_SCHEMA_VERSION,
  STUDIO_ATELIER_VISUAL_EVIDENCE_SCHEMA_VERSION,
  STUDIO_ATELIER_VISUAL_RUBRIC_SCHEMA_VERSION,
  StudioAtelierVisualEvaluatorError,
  createStudioAtelierVisualEvaluator,
  type StudioAtelierVisualAccountingRecord,
  type StudioAtelierVisualEvaluationInput,
  type StudioAtelierVisualEvaluatorPolicy,
  type StudioAtelierVisualGatewayRequest,
  type StudioAtelierVisualRubric,
} from "../lib/server/studio-atelier-visual-evaluator";

const NOW = "2026-09-04T19:00:00.000Z";

function digest(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

const [candidateBytes, authorityBytes, roomBytes] = await Promise.all(
  ["#aa0000", "#00aa00", "#0000aa"].map(async (background) => new Uint8Array(await sharp({
    create: { width: 32, height: 40, channels: 4, background },
  }).png().toBuffer())),
);

const policy = Object.freeze({
  schemaVersion: STUDIO_ATELIER_VISUAL_EVALUATOR_POLICY_SCHEMA_VERSION,
  evaluatorId: "juw.atelier.closed-visual-evaluator",
  evaluatorVersion: "1.0.0",
  policyRevision: "2026-09-04.1",
  provider: "openai",
  model: "openai/gpt-5.4-2026-09-04",
  modelRevision: "2026-09-04",
  modelDigestSha256: digest("pinned visual model attestation"),
  maxOutputTokens: 400,
  timeoutMs: 30_000,
  costCapUsd: 0.05,
} satisfies StudioAtelierVisualEvaluatorPolicy);

const rubric = Object.freeze({
  schemaVersion: STUDIO_ATELIER_VISUAL_RUBRIC_SCHEMA_VERSION,
  rubricId: "juw.atelier.visual-qualification",
  rubricVersion: "1.0.0",
  thresholdVersion: "1.0.0",
  criteria: Object.freeze([
    Object.freeze({
      criterionId: "GARMENT_TRUTH",
      gate: "GARMENT" as const,
      instruction: "Compare visible silhouette, construction, colour and material to garment authority.",
      requiredAuthorities: [{ imageId: "garment-authority-001", role: "GARMENT_AUTHORITY" as const, sha256: digest(authorityBytes) }],
      satisfiedCode: "GARMENT_TRUTH_SATISFIED",
      notSatisfiedCode: "GARMENT_TRUTH_FAILED",
      indeterminateCode: "GARMENT_TRUTH_INDETERMINATE",
    }),
    Object.freeze({
      criterionId: "ROOM_FIDELITY",
      gate: "ROOM" as const,
      instruction: "Compare the visible room, light and standalone brand icon to room authority.",
      requiredAuthorities: [{ imageId: "room-authority-001", role: "ROOM_AUTHORITY" as const, sha256: digest(roomBytes) }],
      satisfiedCode: "ROOM_FIDELITY_SATISFIED",
      notSatisfiedCode: "ROOM_FIDELITY_FAILED",
      indeterminateCode: "ROOM_FIDELITY_INDETERMINATE",
    }),
  ]),
} satisfies StudioAtelierVisualRubric);

function evaluationInput(): StudioAtelierVisualEvaluationInput {
  return {
    evaluationId: "evaluation-001",
    garmentId: "034",
    stage: "ROOM_FINAL_05",
    view: "05",
    authorityDigestSha256: digest("resolved server authority"),
    artifact: {
      candidateImageId: "candidate-001",
      sha256: digest(candidateBytes),
      byteSize: candidateBytes.byteLength,
      mimeType: "image/png",
      width: 32,
      height: 40,
      kind: "COMPOSITE",
    },
    images: [
      {
        imageId: "candidate-001",
        role: "CANDIDATE",
        bytes: candidateBytes,
        sha256: digest(candidateBytes),
        byteSize: candidateBytes.byteLength,
        mimeType: "image/png",
        width: 32,
        height: 40,
      },
      {
        imageId: "garment-authority-001",
        role: "GARMENT_AUTHORITY",
        bytes: authorityBytes,
        sha256: digest(authorityBytes),
        byteSize: authorityBytes.byteLength,
        mimeType: "image/png",
        width: 32,
        height: 40,
      },
      {
        imageId: "room-authority-001",
        role: "ROOM_AUTHORITY",
        bytes: roomBytes,
        sha256: digest(roomBytes),
        byteSize: roomBytes.byteLength,
        mimeType: "image/png",
        width: 32,
        height: 40,
      },
    ],
  };
}

function validModelOutput() {
  return {
    checks: [
      {
        criterionId: "GARMENT_TRUTH",
        decision: "SATISFIED",
        confidenceBasis: "DIRECT_VISUAL_EVIDENCE",
        evidenceImageIds: ["candidate-001", "garment-authority-001"],
        observation: "The visible construction and colour correspond to the supplied authority.",
      },
      {
        criterionId: "ROOM_FIDELITY",
        decision: "INDETERMINATE",
        confidenceBasis: "INSUFFICIENT_VISUAL_EVIDENCE",
        evidenceImageIds: ["candidate-001"],
        observation: "The candidate obscures the icon, so its fidelity cannot be directly established.",
      },
    ],
  };
}

function accountingReceipt() {
  return Object.freeze({
    receiptSha256: digest("durable accounting receipt"),
    recordedAt: NOW,
  });
}

test("visual evaluator uses one pinned privacy-preserving Gateway request and derives non-installable evidence", async () => {
  const requests: StudioAtelierVisualGatewayRequest[] = [];
  const persisted: StudioAtelierVisualAccountingRecord[] = [];
  const clock = [100, 137];
  const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
    runGateway: async (request) => {
      requests.push(request);
      return {
        output: validModelOutput(),
        usage: { inputTokens: 321, outputTokens: 87, totalTokens: 408, raw: { secret: true } },
        providerMetadata: {
          gateway: {
            cost: "0.0125",
            generationId: "gen_qualification_001",
            privatePrompt: "must-not-leak",
          },
        },
      };
    },
    persistAccounting: async (accounting) => {
      persisted.push(accounting);
      return accountingReceipt();
    },
    now: () => new Date(NOW),
    monotonicNow: () => clock.shift() ?? 137,
  });

  const evidence = await evaluate(evaluationInput());

  assert.equal(requests.length, 1);
  assert.equal(requests[0]?.model, policy.model);
  assert.deepEqual(requests[0]?.providerOptions, {
    only: ["openai"],
    has: ["vision"],
    zeroDataRetention: true,
    disallowPromptTraining: true,
    tags: ["studio:atelier-qualification", "stage:visual-evaluation"],
  });
  assert.notEqual(requests[0]?.images[0]?.bytes, candidateBytes);
  assert.deepEqual(requests[0]?.images[0]?.bytes, candidateBytes);
  assert.doesNotMatch(requests[0]?.prompt ?? "", /https?:\/\/|file:\/\/|blob:/i);
  assert.equal(persisted.length, 1);
  assert.deepEqual(persisted[0], {
    schemaVersion: STUDIO_ATELIER_VISUAL_ACCOUNTING_SCHEMA_VERSION,
    evaluationId: "evaluation-001",
    requestSha256: evidence.requestSha256,
    outcome: "SUCCEEDED",
    provider: "openai",
    model: policy.model,
    modelRevision: policy.modelRevision,
    usage: { inputTokens: 321, outputTokens: 87, totalTokens: 408 },
    costUsd: 0.0125,
    gatewayGenerationId: "gen_qualification_001",
    durationMs: 37,
  });
  assert.equal(evidence.schemaVersion, STUDIO_ATELIER_VISUAL_EVIDENCE_SCHEMA_VERSION);
  assert.equal(evidence.evaluator.installationStatus, "UNQUALIFIED_FOUNDATION");
  assert.equal(evidence.derivedDecision, "INDETERMINATE");
  assert.equal(evidence.productionPass, false);
  assert.equal(evidence.checks[0]?.code, "GARMENT_TRUTH_SATISFIED");
  assert.equal(evidence.checks[1]?.code, "ROOM_FIDELITY_INDETERMINATE");
  assert.equal(evidence.accountingReceiptSha256, accountingReceipt().receiptSha256);
  assert.match(evidence.evaluationHash, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(evidence).includes("privatePrompt"), false);
  assert.equal(JSON.stringify(evidence).includes("secret"), false);
});

test("external URLs and locator fields fail before any evaluator or accounting call", async () => {
  let gatewayCalls = 0;
  let accountingCalls = 0;
  const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
    runGateway: async () => {
      gatewayCalls += 1;
      throw new Error("must not run");
    },
    persistAccounting: async () => {
      accountingCalls += 1;
      return accountingReceipt();
    },
  });
  const input = evaluationInput();
  const withLocator = {
    ...input,
    images: input.images.map((image, index) => index === 0
      ? { ...image, url: "https://private.example/candidate.png" }
      : image),
  } as unknown as StudioAtelierVisualEvaluationInput;

  await assert.rejects(
    () => evaluate(withLocator),
    (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
      && error.code === "INVALID_INPUT",
  );
  assert.equal(gatewayCalls, 0);
  assert.equal(accountingCalls, 0);

  assert.throws(
    () => createStudioAtelierVisualEvaluator({
      policy,
      rubric: {
        ...rubric,
        criteria: [{ ...rubric.criteria[0]!, instruction: "Compare file:///private/model.png" }],
      },
    }, {
      persistAccounting: async () => accountingReceipt(),
    }),
    (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
      && error.code === "INVALID_CONFIGURATION",
  );
});

test("comparison rubrics cannot omit their direct authority or substitute calibration", () => {
  for (const gate of ["GARMENT", "FACE", "BODY", "ROOM", "FINAL_INTEGRATION"] as const) {
    const criterion = { ...rubric.criteria[0]!, gate };
    for (const requiredAuthorities of [[], [{
      imageId: "calibration-001", role: "CALIBRATION_TARGET" as const, sha256: digest(roomBytes),
    }]]) {
      assert.throws(() => createStudioAtelierVisualEvaluator({
        policy, rubric: { ...rubric, criteria: [{ ...criterion, requiredAuthorities }] },
      }, { persistAccounting: async () => accountingReceipt() }),
      (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
        && error.code === "INVALID_CONFIGURATION");
    }
  }
});

test("missing, substituted and mislabelled authorities fail before a provider call", async (t) => {
  const input = evaluationInput();
  const replacement = await sharp({
    create: { width: 32, height: 40, channels: 4, background: "#aaaa00" },
  }).png().toBuffer();
  const cases = {
    missing: input.images.filter((image) => image.role !== "ROOM_AUTHORITY"),
    "wrong role": input.images.map((image) => image.role === "ROOM_AUTHORITY"
      ? { ...image, role: "CALIBRATION_TARGET" as const } : image),
    "wrong exact id": input.images.map((image) => image.role === "ROOM_AUTHORITY"
      ? { ...image, imageId: "other-room" } : image),
    "wrong exact hash": input.images.map((image) => image.role === "ROOM_AUTHORITY"
      ? { ...image, bytes: replacement, byteSize: replacement.byteLength, sha256: digest(replacement) }
      : image),
  };
  for (const [name, images] of Object.entries(cases)) {
    await t.test(name, async () => {
      let calls = 0;
      const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
        runGateway: async () => { calls += 1; throw new Error("must not dispatch"); },
        persistAccounting: async () => { calls += 1; return accountingReceipt(); },
      });
      await assert.rejects(() => evaluate({ ...input, images }),
        (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
          && error.code === "INVALID_INPUT");
      assert.equal(calls, 0);
    });
  }
});

test("re-encoded candidate pixels cannot impersonate comparison authority", async () => {
  const forgedAuthority = await sharp(candidateBytes).png({ compressionLevel: 0 }).toBuffer();
  assert.notEqual(digest(forgedAuthority), digest(candidateBytes));
  const input = evaluationInput();
  const forgedRubric = {
    ...rubric,
    criteria: rubric.criteria.map((criterion) => ({
      ...criterion,
      requiredAuthorities: criterion.requiredAuthorities.map((authority) =>
        authority.role === "GARMENT_AUTHORITY" ? { ...authority, sha256: digest(forgedAuthority) } : authority),
    })),
  };
  let calls = 0;
  const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric: forgedRubric }, {
    runGateway: async () => { calls += 1; throw new Error("must not dispatch"); },
    persistAccounting: async () => accountingReceipt(),
  });
  await assert.rejects(() => evaluate({ ...input,
    images: input.images.map((image) => image.role === "GARMENT_AUTHORITY" ? {
      ...image, bytes: forgedAuthority, byteSize: forgedAuthority.byteLength, sha256: digest(forgedAuthority),
    } : image),
  }), (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
    && error.code === "INVALID_INPUT");
  assert.equal(calls, 0);
});

test("valid authority-backed comparisons can satisfy the rubric without qualifying production", async () => {
  const output = validModelOutput();
  output.checks[1] = { ...output.checks[1]!, decision: "SATISFIED",
    confidenceBasis: "DIRECT_VISUAL_EVIDENCE", evidenceImageIds: ["candidate-001", "room-authority-001"] };
  const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
    runGateway: async () => ({ output,
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      providerMetadata: { gateway: { cost: 0.001, generationId: "gen_valid_comparison" } },
    }),
    persistAccounting: async () => accountingReceipt(),
  });
  const evidence = await evaluate(evaluationInput());
  assert.equal(evidence.derivedDecision, "SATISFIED");
  assert.equal(evidence.productionPass, false);
});

test("a determinate comparison must cite every bound authority, not only the candidate", async (t) => {
  for (const evidenceImageIds of [["candidate-001"], ["candidate-001", "garment-authority-001"]]) {
    await t.test(evidenceImageIds.join(","), async () => {
      const output = validModelOutput();
      output.checks[1] = {
        ...output.checks[1]!, decision: "SATISFIED", confidenceBasis: "DIRECT_VISUAL_EVIDENCE",
        evidenceImageIds,
      };
      const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
        runGateway: async () => ({ output,
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          providerMetadata: { gateway: { cost: 0.001, generationId: "gen_fake_comparison" } },
        }),
        persistAccounting: async () => accountingReceipt(),
      });
      await assert.rejects(() => evaluate(evaluationInput()),
        (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
          && error.code === "INVALID_MODEL_OUTPUT" && error.accountingReceipt !== null);
    });
  }
});

test("real image bytes are decoded and matched to MIME and dimensions before dispatch", async (t) => {
  const invalidBytes = new Uint8Array([137, 80, 78, 71, 1, 2, 3]);
  const truncatedBytes = candidateBytes.slice(0, candidateBytes.length - 20);
  const variants = {
    "fake PNG": { bytes: invalidBytes, byteSize: invalidBytes.byteLength, sha256: digest(invalidBytes) },
    "truncated PNG": { bytes: truncatedBytes, byteSize: truncatedBytes.byteLength, sha256: digest(truncatedBytes) },
    "false MIME": { mimeType: "image/jpeg" as const },
    "false dimensions": { width: 33 },
  };
  for (const [name, properties] of Object.entries(variants)) {
    await t.test(name, async () => {
      const input = evaluationInput();
      const candidate = { ...input.images[0]!, ...properties };
      let calls = 0;
      const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
        runGateway: async () => { calls += 1; throw new Error("must not dispatch"); },
        persistAccounting: async () => accountingReceipt(),
      });
      await assert.rejects(() => evaluate({
        ...input,
        artifact: {
          ...input.artifact, sha256: candidate.sha256, byteSize: candidate.byteSize,
          mimeType: candidate.mimeType, width: candidate.width, height: candidate.height,
        },
        images: input.images.map((image) => image.role === "CANDIDATE" ? candidate : image),
      }), (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
        && error.code === "INVALID_INPUT");
      assert.equal(calls, 0);
    });
  }
});

test("a model cannot inject a free-form PASS and accounting is persisted before rejection", async () => {
  const persisted: StudioAtelierVisualAccountingRecord[] = [];
  const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
    runGateway: async () => ({
      output: { ...validModelOutput(), aggregateDecision: "PASS" },
      usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
      providerMetadata: { gateway: { cost: 0.001, generationId: "gen_closed_output" } },
    }),
    persistAccounting: async (accounting) => {
      persisted.push(accounting);
      return accountingReceipt();
    },
  });

  await assert.rejects(
    () => evaluate(evaluationInput()),
    (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
      && error.code === "INVALID_MODEL_OUTPUT"
      && error.accounting?.costUsd === 0.001
      && error.accountingReceipt?.receiptSha256 === accountingReceipt().receiptSha256,
  );
  assert.equal(persisted.length, 1);
});

test("missing or over-cap Gateway cost fails closed only after durable accounting", async (t) => {
  for (const item of [
    { name: "missing", gateway: { generationId: "gen_missing_cost" }, code: "ACCOUNTING_MISSING" },
    { name: "over cap", gateway: { generationId: "gen_over_cap", cost: 0.051 }, code: "ACCOUNTING_OVER_CAP" },
  ] as const) {
    await t.test(item.name, async () => {
      const persisted: StudioAtelierVisualAccountingRecord[] = [];
      const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
        runGateway: async () => ({
          output: validModelOutput(),
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
          providerMetadata: { gateway: item.gateway },
        }),
        persistAccounting: async (accounting) => {
          persisted.push(accounting);
          return accountingReceipt();
        },
      });
      await assert.rejects(
        () => evaluate(evaluationInput()),
        (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
          && error.code === item.code
          && !error.message.includes("result was retained")
          && error.accountingReceipt !== null,
      );
      assert.equal(persisted.length, 1);
    });
  }
});

test("missing generation identity or inconsistent token accounting cannot produce evidence", async (t) => {
  for (const item of [
    { name: "missing generation", usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 }, generationId: undefined },
    { name: "missing usage", usage: {}, generationId: "gen_missing_usage" },
    { name: "fractional tokens", usage: { inputTokens: 1.5, outputTokens: 1, totalTokens: 2.5 }, generationId: "gen_fractional" },
    { name: "inconsistent total", usage: { inputTokens: 10, outputTokens: 10, totalTokens: 30 }, generationId: "gen_inconsistent" },
  ]) {
    await t.test(item.name, async () => {
      let persisted = 0;
      const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
        runGateway: async () => ({ output: validModelOutput(), usage: item.usage,
          providerMetadata: { gateway: { cost: 0.001, generationId: item.generationId } },
        }),
        persistAccounting: async () => { persisted += 1; return accountingReceipt(); },
      });
      await assert.rejects(() => evaluate(evaluationInput()),
        (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
          && error.code === "ACCOUNTING_MISSING" && error.accountingReceipt !== null);
      assert.equal(persisted, 1);
    });
  }
});

test("provider failures retain only sanitized accounting and never produce evidence", async () => {
  const persisted: StudioAtelierVisualAccountingRecord[] = [];
  const evaluate = createStudioAtelierVisualEvaluator({ policy, rubric }, {
    runGateway: async () => {
      const failure = new Error("sensitive provider detail") as Error & {
        usage: unknown;
        providerMetadata: unknown;
      };
      failure.usage = { inputTokens: 12, outputTokens: 0, totalTokens: 12 };
      failure.providerMetadata = {
        gateway: { cost: "0.0005", generationId: "gen_failed_001", privatePrompt: "secret" },
      };
      throw failure;
    },
    persistAccounting: async (accounting) => {
      persisted.push(accounting);
      return accountingReceipt();
    },
  });

  await assert.rejects(
    () => evaluate(evaluationInput()),
    (error: unknown) => error instanceof StudioAtelierVisualEvaluatorError
      && error.code === "PROVIDER_FAILED"
      && error.message.includes("sensitive") === false
      && error.accounting?.outcome === "FAILED",
  );
  assert.equal(persisted.length, 1);
  assert.equal(JSON.stringify(persisted[0]).includes("privatePrompt"), false);
});
