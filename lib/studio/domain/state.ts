import type {
  Garment,
  InventoryRecord,
  Shoot,
  StudioListing,
  StudioModel,
  StudioOrder,
  StudioReturn,
} from "./entities";

export const STUDIO_STATE_SCHEMA_VERSION = 2 as const;

export interface StudioSnapshot {
  defaultModelId: string;
  models: StudioModel[];
  garments: Garment[];
  listings: StudioListing[];
  inventory: InventoryRecord[];
  orders: StudioOrder[];
  returns: StudioReturn[];
  shoots: Shoot[];
}

export interface StoredStudioStateV2 {
  version: typeof STUDIO_STATE_SCHEMA_VERSION;
  data: StudioSnapshot;
}

export type StudioHydrationState = "idle" | "restoring" | "ready" | "degraded";
export type StudioPersistenceState = "available" | "unavailable";

export const LULU_NEUTRAL_MASTER_PROFILE = Object.freeze({
  version: "LULU NEUTRAL IDENTITY MASTER V3",
  styling: Object.freeze({
    hair: "Natural, softly shaped",
    makeup: "Fresh skin, quiet definition",
    direction: "Neutral posture, minimal styling intervention, product-first",
  }),
  allowedVariance: Object.freeze(["Shoot-specific hair", "Natural expression"]),
  forbiddenDrift: Object.freeze(["Identity drift", "Body reshaping", "Skin-tone changes"]),
});

export interface StudioMachineState extends StudioSnapshot {
  schemaVersion: typeof STUDIO_STATE_SCHEMA_VERSION;
  hydration: StudioHydrationState;
  persistence: StudioPersistenceState;
  persistenceRevision: number;
  lastError?: string;
}

export function createDefaultModel(): StudioModel {
  return {
    id: "model-lulu",
    name: "Lulu",
    preferredName: "Lulu",
    version: LULU_NEUTRAL_MASTER_PROFILE.version,
    isDefault: true,
    state: "READY",
    status: "APPROVED",
    completeness: 100,
    styling: { ...LULU_NEUTRAL_MASTER_PROFILE.styling },
    readiness: {
      identityApproved: true,
      consentConfirmed: true,
      stylingComplete: true,
    },
    approvedAt: "Lulu V3 approved",
    bodyReferenceStatus: "COMPLETE",
    hairReferenceStatus: "COMPLETE",
    references: [],
    visibleFeatureNotes: [],
    allowedVariance: [...LULU_NEUTRAL_MASTER_PROFILE.allowedVariance],
    forbiddenDrift: [...LULU_NEUTRAL_MASTER_PROFILE.forbiddenDrift],
    consent: {
      status: "CONFIRMED",
      date: "Local foundation",
      allowedUse: "Approved justurban wears Studio work.",
      restrictedUse: "No raw identity material enters a public listing.",
    },
  };
}

export function createEmptyStudioSnapshot(): StudioSnapshot {
  const lulu = createDefaultModel();
  return {
    defaultModelId: lulu.id,
    models: [lulu],
    garments: [],
    listings: [],
    inventory: [],
    orders: [],
    returns: [],
    shoots: [],
  };
}

export function createInitialStudioState(): StudioMachineState {
  return {
    ...createEmptyStudioSnapshot(),
    schemaVersion: STUDIO_STATE_SCHEMA_VERSION,
    hydration: "idle",
    persistence: "available",
    persistenceRevision: 0,
  };
}
