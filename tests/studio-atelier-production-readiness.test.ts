import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";
import authorityManifestJson from "../lib/server/private-asset-manifests/lulu-v4.json";
import {
  createStudioAtelierProductionReadinessProbe,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256,
  STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG,
  STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT,
  STUDIO_ATELIER_LEDGER_MIGRATION_INDEX,
  STUDIO_ATELIER_LEDGER_MIGRATION_SHA256,
  STUDIO_ATELIER_LEDGER_MIGRATION_TAG,
  STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256,
  STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG,
  type StudioAtelierAiAdapterPolicyObservation,
  type StudioAtelierAuthorityReadbackObservation,
  type StudioAtelierDatabaseObservation,
  type StudioAtelierProductionReadinessProbePorts,
  type StudioAtelierReadinessBlockerCode,
} from "../lib/server/studio-atelier-production-readiness";
import {
  STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
  STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
} from "../lib/studio/atelier/g004-calibration";

const VERIFIED_AT = "2026-08-27T12:00:00.000Z";
const REQUIRED_TABLES = Object.freeze([
  "studio_atelier_adult_verification_receipts",
  "studio_atelier_artifacts",
  "studio_atelier_consent_events",
  "studio_atelier_consent_grants",
  "studio_atelier_consent_projections",
  "studio_atelier_events",
  "studio_atelier_executions",
  "studio_atelier_operation_projections",
  "studio_atelier_operations",
  "studio_atelier_styling_advisories",
  "studio_engine_work_ownership",
]);
const PRIVATE_AUTHORITY_ASSETS = Object.freeze(
  authorityManifestJson.assets.slice(0, 11).map((asset) => Object.freeze({
    id: asset.id,
    role: asset.role,
    authority: asset.authority,
    acceptance: asset.acceptance,
    lockedStatus: asset.lockedStatus,
    sha256: asset.sha256,
    byteSize: asset.byteSize,
    width: asset.width,
    height: asset.height,
    mimeType: asset.mimeType,
  })),
);

type PortOverrides = Partial<StudioAtelierProductionReadinessProbePorts>;

function validDatabase(): StudioAtelierDatabaseObservation {
  const appliedMigrations = Array.from(
    { length: STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX + 1 },
    (_, index) => Object.freeze({
      hash: index === STUDIO_ATELIER_LEDGER_MIGRATION_INDEX
        ? STUDIO_ATELIER_LEDGER_MIGRATION_SHA256
        : index === STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX
          ? STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_SHA256
          : index === STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX
            ? STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_SHA256
            : String(index).padStart(64, "0"),
      createdAt: index === STUDIO_ATELIER_LEDGER_MIGRATION_INDEX
        ? String(STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT)
        : index === STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX
          ? String(STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT)
          : index === STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX
            ? String(STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT)
            : String(index),
    }),
  );
  return Object.freeze({
    tables: REQUIRED_TABLES,
    appliedMigrations: Object.freeze(appliedMigrations),
  });
}

function validAdapterPolicy(): StudioAtelierAiAdapterPolicyObservation {
  return Object.freeze({
    adapterId: "vercel-ai-gateway/openai-gpt-image-2",
    adapterVersion: "atelier-gpt-image-2-v2",
    policyRevision: "2026-08-26.3",
    provider: "openai",
    model: "openai/gpt-image-2",
    onlyProviders: Object.freeze(["openai"]),
    fallbackModels: Object.freeze([]),
    maxRetries: 0,
    costCapUsd: 0.10,
  });
}

function validAuthority(): StudioAtelierAuthorityReadbackObservation {
  return Object.freeze({
    authorityRevision: "LULU_V4_2026-08-25.7",
    manifestSha256: STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256,
    assets: PRIVATE_AUTHORITY_ASSETS,
  });
}

function privateBlobFor(input: Parameters<
  StudioAtelierProductionReadinessProbePorts["verifyPrivateStore"]
>[0]) {
  const hash = createHash("sha256").update(input.bytes).digest("hex");
  return Object.freeze({
    pathname: `${input.namespace}/${hash.slice(0, 2)}/${hash}.bin`,
    blobUrl: "https://private.invalid/content-addressed-probe",
    mimeType: input.mimeType,
    byteSize: input.bytes.byteLength,
    sha256: hash,
  });
}

function validPorts(overrides: PortOverrides = {}): StudioAtelierProductionReadinessProbePorts {
  return Object.freeze({
    readDatabase: async () => validDatabase(),
    verifyPrivateStore: async (input) => privateBlobFor(input),
    readAiAdapterPolicy: () => validAdapterPolicy(),
    readAiEnvironment: () => Object.freeze({
      imageModel: "openai/gpt-image-2",
      imageCostCapUsd: "0.10",
      gatewayApiKey: "private-gateway-secret-never-returned",
      vercelOidcToken: undefined,
    }),
    readPrivateAuthority: async () => validAuthority(),
    readG004Calibration: async () => Object.freeze({
      receipt: STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
      assetCount: STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
    }),
    now: () => new Date(VERIFIED_AT),
    ...overrides,
  });
}

function blockerCodes(report: Awaited<ReturnType<ReturnType<
  typeof createStudioAtelierProductionReadinessProbe
>>>): StudioAtelierReadinessBlockerCode[] {
  return report.blockers.map((item) => item.code);
}

test("derives every zero-spend readiness proof but remains blocked on qualification", async () => {
  let databaseReads = 0;
  let privateStoreVerifications = 0;
  let adapterReads = 0;
  let environmentReads = 0;
  let authorityReads = 0;
  let g004Reads = 0;
  let requestedAuthorityIds: readonly string[] = [];
  const base = validPorts();
  const report = await createStudioAtelierProductionReadinessProbe(validPorts({
    readDatabase: async () => {
      databaseReads += 1;
      return base.readDatabase();
    },
    verifyPrivateStore: async (input) => {
      privateStoreVerifications += 1;
      return base.verifyPrivateStore(input);
    },
    readAiAdapterPolicy: () => {
      adapterReads += 1;
      return base.readAiAdapterPolicy();
    },
    readAiEnvironment: () => {
      environmentReads += 1;
      return base.readAiEnvironment();
    },
    readPrivateAuthority: async (assetIds) => {
      authorityReads += 1;
      requestedAuthorityIds = [...assetIds];
      return base.readPrivateAuthority(assetIds);
    },
    readG004Calibration: async () => {
      g004Reads += 1;
      return base.readG004Calibration();
    },
  }))();

  assert.equal(report.prequalificationStatus, "VERIFIED");
  assert.equal(report.readyForQualification, true);
  assert.equal(report.qualificationStatus, "NOT_VERIFIED");
  assert.equal(report.productionStatus, "BLOCKED");
  assert.equal(report.constructionAllowed, false);
  assert.deepEqual(blockerCodes(report), ["QUALIFICATION_NOT_PASSED"]);
  assert.equal(Object.keys(report.evidence).length, 6);
  assert.equal(report.evidence.database?.tables.length, 11);
  assert.equal(
    report.evidence.database?.migrationTag,
    "0017_studio_engine_work_ownership",
  );
  assert.equal(
    report.evidence.database?.migrationTag,
    STUDIO_ATELIER_LEDGER_MIGRATION_TAG,
  );
  assert.equal(
    report.evidence.database?.transactionalAuthorityMigrationTag,
    STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_TAG,
  );
  assert.equal(
    report.evidence.database?.externalAuthorityMigrationTag,
    STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_TAG,
  );
  assert.equal(report.evidence.privateAuthority?.assetCount, 11);
  assert.equal(report.evidence.approvedRoom?.assetId, "juw.atelier.empty-plate.v1");
  assert.equal(report.evidence.approvedRoom?.sha256, authorityManifestJson.assets[10]?.sha256);
  assert.equal(report.evidence.approvedRoom?.mimeType, "image/png");
  assert.equal(report.evidence.approvedRoom?.width, 1024);
  assert.equal(report.evidence.approvedRoom?.height, 1280);
  assert.equal(
    report.evidence.approvedRoom?.profileId,
    "atelier-room-native-4x5-center-window-v1",
  );
  assert.deepEqual(requestedAuthorityIds, PRIVATE_AUTHORITY_ASSETS.map((asset) => asset.id));
  assert.deepEqual(
    { databaseReads, privateStoreVerifications, adapterReads, environmentReads, authorityReads, g004Reads },
    {
      databaseReads: 1,
      privateStoreVerifications: 2,
      adapterReads: 1,
      environmentReads: 1,
      authorityReads: 1,
      g004Reads: 1,
    },
  );

  const serialized = JSON.stringify(report);
  assert.doesNotMatch(serialized, /private-gateway-secret-never-returned/);
  assert.doesNotMatch(serialized, /pathname|blobUrl|bytes|manifestPathname/);
});

test("distinguishes missing or substituted ledger tables from migration identity", async (t) => {
  await t.test("missing table", async () => {
    const database = validDatabase();
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readDatabase: async () => Object.freeze({
        ...database,
        tables: database.tables.slice(1),
      }),
    }))();
    assert(blockerCodes(report).includes("DATABASE_TABLES_MISMATCH"));
    assert(!blockerCodes(report).includes("DATABASE_MIGRATION_MISMATCH"));
  });

  await t.test("unexpected Atelier table", async () => {
    const database = validDatabase();
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readDatabase: async () => Object.freeze({
        ...database,
        tables: Object.freeze([...database.tables, "studio_atelier_shadow"]),
      }),
    }))();
    assert(blockerCodes(report).includes("DATABASE_TABLES_MISMATCH"));
  });

  await t.test("missing migration", async () => {
    const database = validDatabase();
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readDatabase: async () => Object.freeze({
        ...database,
        appliedMigrations: database.appliedMigrations.slice(
          0,
          STUDIO_ATELIER_LEDGER_MIGRATION_INDEX,
        ),
      }),
    }))();
    assert(blockerCodes(report).includes("DATABASE_MIGRATION_MISMATCH"));
    assert(!blockerCodes(report).includes("DATABASE_TABLES_MISMATCH"));
  });

  await t.test("wrong migration hash", async () => {
    const database = validDatabase();
    const migrations = [...database.appliedMigrations];
    migrations[STUDIO_ATELIER_LEDGER_MIGRATION_INDEX] = Object.freeze({
      hash: "f".repeat(64),
      createdAt: STUDIO_ATELIER_LEDGER_MIGRATION_CREATED_AT,
    });
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readDatabase: async () => Object.freeze({
        ...database,
        appliedMigrations: Object.freeze(migrations),
      }),
    }))();
    assert(blockerCodes(report).includes("DATABASE_MIGRATION_MISMATCH"));
  });

  await t.test("wrong transactional-authority migration hash", async () => {
    const database = validDatabase();
    const migrations = [...database.appliedMigrations];
    migrations[STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_INDEX] = Object.freeze({
      hash: "e".repeat(64),
      createdAt: STUDIO_TRANSACTIONAL_AUTHORITY_MIGRATION_CREATED_AT,
    });
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readDatabase: async () => Object.freeze({
        ...database,
        appliedMigrations: Object.freeze(migrations),
      }),
    }))();
    assert(blockerCodes(report).includes("DATABASE_MIGRATION_MISMATCH"));
  });

  await t.test("wrong external-authority migration hash", async () => {
    const database = validDatabase();
    const migrations = [...database.appliedMigrations];
    migrations[STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_INDEX] = Object.freeze({
      hash: "d".repeat(64),
      createdAt: STUDIO_ATELIER_EXTERNAL_AUTHORITY_MIGRATION_CREATED_AT,
    });
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readDatabase: async () => Object.freeze({
        ...database,
        appliedMigrations: Object.freeze(migrations),
      }),
    }))();
    assert(blockerCodes(report).includes("DATABASE_MIGRATION_MISMATCH"));
  });
});

test("rejects a private content-addressed readback that changes between probes", async () => {
  let calls = 0;
  const report = await createStudioAtelierProductionReadinessProbe(validPorts({
    verifyPrivateStore: async (input) => {
      calls += 1;
      const valid = privateBlobFor(input);
      return calls === 1
        ? valid
        : Object.freeze({ ...valid, sha256: "a".repeat(64) });
    },
  }))();
  assert.equal(calls, 2);
  assert(blockerCodes(report).includes("PRIVATE_STORE_READBACK_MISMATCH"));
  assert.equal(report.evidence.privateStore, undefined);
});

test("rejects a wrong adapter, environment policy and missing usable credential", async () => {
  const report = await createStudioAtelierProductionReadinessProbe(validPorts({
    readAiAdapterPolicy: () => Object.freeze({
      ...validAdapterPolicy(),
      adapterId: "unapproved/adapter",
      onlyProviders: Object.freeze(["openai", "fallback-provider"]),
    }),
    readAiEnvironment: () => Object.freeze({
      imageModel: "another/model",
      imageCostCapUsd: "1.00",
      gatewayApiKey: "[SENSITIVE]",
      vercelOidcToken: "placeholder",
    }),
  }))();
  const codes = blockerCodes(report);
  assert(codes.includes("AI_ADAPTER_POLICY_MISMATCH"));
  assert(codes.includes("AI_ENVIRONMENT_MISMATCH"));
  assert(codes.includes("AI_CREDENTIAL_UNAVAILABLE"));
  assert.equal(report.evidence.aiPolicy, undefined);
  assert.doesNotMatch(JSON.stringify(report), /another\/model|fallback-provider|SENSITIVE/);
});

test("requires all eleven exact Lulu readbacks and the exact approved room profile", async (t) => {
  await t.test("missing private authority asset", async () => {
    const authority = validAuthority();
    const report = await createStudioAtelierProductionReadinessProbe(validPorts({
      readPrivateAuthority: async () => Object.freeze({
        ...authority,
        assets: authority.assets.slice(1),
      }),
    }))();
    assert(blockerCodes(report).includes("PRIVATE_AUTHORITY_MISMATCH"));
    assert.equal(report.evidence.privateAuthority, undefined);
  });

  for (const [label, roomPatch] of [
    ["hash", { sha256: "b".repeat(64) }],
    ["MIME", { mimeType: "image/jpeg" }],
    ["dimensions and profile", { width: 1000, height: 1280 }],
  ] as const) {
    await t.test(`wrong room ${label}`, async () => {
      const authority = validAuthority();
      const assets = [...authority.assets];
      assets[10] = Object.freeze({ ...assets[10], ...roomPatch });
      const report = await createStudioAtelierProductionReadinessProbe(validPorts({
        readPrivateAuthority: async () => Object.freeze({
          ...authority,
          assets: Object.freeze(assets),
        }),
      }))();
      assert(blockerCodes(report).includes("APPROVED_ROOM_MISMATCH"));
      assert.equal(report.evidence.approvedRoom, undefined);
    });
  }
});

test("rejects substituted G004 receipt evidence without exposing its payload", async () => {
  const substitutedReceipt = {
    ...STUDIO_ATELIER_G004_EXPECTED_READBACK_RECEIPT,
    receiptSha256: "c".repeat(64),
    privateLocator: "private://must-not-leak",
  };
  const report = await createStudioAtelierProductionReadinessProbe(validPorts({
    readG004Calibration: async () => Object.freeze({
      receipt: substitutedReceipt,
      assetCount: STUDIO_ATELIER_G004_CALIBRATION_ASSET_COUNT,
    }),
  }))();
  assert(blockerCodes(report).includes("G004_CALIBRATION_MISMATCH"));
  assert.equal(report.evidence.g004Calibration, undefined);
  assert.doesNotMatch(JSON.stringify(report), /private:\/\/must-not-leak|privateLocator/);
});

test("sanitizes dependency failures instead of returning errors, locators or credentials", async () => {
  const sensitiveFailure = new Error(
    "secret-token private://authority storage/pathname raw-image-bytes",
  );
  const report = await createStudioAtelierProductionReadinessProbe(validPorts({
    readDatabase: async () => Promise.reject(sensitiveFailure),
    verifyPrivateStore: async () => Promise.reject(sensitiveFailure),
    readAiAdapterPolicy: () => {
      throw sensitiveFailure;
    },
    readPrivateAuthority: async () => Promise.reject(sensitiveFailure),
    readG004Calibration: async () => Promise.reject(sensitiveFailure),
  }))();
  const codes = blockerCodes(report);
  assert(codes.includes("DATABASE_UNAVAILABLE"));
  assert(codes.includes("PRIVATE_STORE_UNAVAILABLE"));
  assert(codes.includes("AI_ADAPTER_POLICY_MISMATCH"));
  assert(codes.includes("PRIVATE_AUTHORITY_UNAVAILABLE"));
  assert(codes.includes("G004_CALIBRATION_UNAVAILABLE"));
  assert.doesNotMatch(
    JSON.stringify(report),
    /secret-token|private:\/\/authority|storage\/pathname|raw-image-bytes/,
  );
});

test("has no provider invocation path and performs no default work at module import", async () => {
  const source = await readFile(
    new URL("../lib/server/studio-atelier-production-readiness.ts", import.meta.url),
    "utf8",
  );
  assert.doesNotMatch(source, /\bgenerateImage\s*\(/);
  assert.doesNotMatch(source, /\bcreateStudioGptImage2Adapter\s*\(/);
  assert.doesNotMatch(source, /\.invoke\s*\(/);
  assert.match(
    source,
    /table_name in \([\s\S]*'studio_atelier_adult_verification_receipts'[\s\S]*'studio_atelier_artifacts'[\s\S]*'studio_engine_work_ownership'[\s\S]*\)/,
  );
  assert.doesNotMatch(source, /position\('studio_atelier_' in table_name\)/);
  assert.doesNotMatch(source, /studio_atelier_shop_adoption_(?:receipts|media)/);
  assert.match(
    source,
    /probeStudioAtelierProductionReadiness\s*=\s*\r?\n\s*createStudioAtelierProductionReadinessProbe\(\)/,
  );
  assert.doesNotMatch(
    source,
    /createStudioAtelierProductionReadinessProbe\(\)\s*\(\)/,
  );
});
