export const STUDIO_APPLICATION_PROJECTION_VERSION = "studio-application/v1" as const;

export type StudioApplicationSource =
  | "AUTHORITY"
  | "CATALOGUE_COMPATIBILITY"
  | "SCENARIO";

export type StudioApplicationMode =
  | { kind: "CONNECTED" }
  | {
      kind: "SCENARIO";
      id: string;
      label: string;
      notice: string;
    };

export type StudioSourceRevision = {
  source: StudioApplicationSource;
  revision: string;
  generatedAt: string;
  state: "CURRENT" | "COMPATIBILITY" | "SIMULATED";
};

export type StudioDegradedSource = {
  source: "AUTHORITY" | "COLLECTIONS" | "ORDERS" | "PUBLICATION";
  message: string;
  nextAction: string;
};

export type StudioSummaryMetric = {
  value: number | null;
  asOf: string | null;
  source: "CONNECTED" | "SCENARIO" | "UNAVAILABLE";
};

export type StudioSummary = {
  attention: StudioSummaryMetric;
  available: StudioSummaryMetric;
  live: StudioSummaryMetric;
  orders: StudioSummaryMetric;
};

export type StudioContinueAction = {
  id: string;
  label: string;
  href: string;
  openCount: number;
  source: "CONNECTED" | "SCENARIO";
};

export type StudioCapabilityState =
  | "AVAILABLE"
  | "READ_ONLY_COMPATIBILITY"
  | "UNAVAILABLE";

export type StudioCapability = {
  id:
    | "PROJECTION"
    | "SEARCH"
    | "ASK_READ"
    | "WARDROBE_READ"
    | "ORDERS_READ"
    | "MODELS_READ"
    | "MEDIA_READ"
    | "COLLECTIONS_READ";
  state: StudioCapabilityState;
};

export type StudioCollectionScope = {
  /** Transitional identity. It is deliberately not a database UUID. */
  id: `compat:${string}`;
  key: "drop-01" | "drop-02";
  label: "Drop 01" | "Drop 02";
  ordinal: 1 | 2;
  state: "ACTIVE" | "ARCHIVED";
  isCurrent: boolean;
  authority: "COMPATIBILITY";
  counts: {
    pieces: number | null;
    private: number | null;
    ready: number | null;
    published: number | null;
    available: number | null;
  };
  nextAction: string;
  updatedAt: string;
};

export type StudioSearchDocumentKind =
  | "SERVICE"
  | "PIECE"
  | "SKU"
  | "ORDER"
  | "MODEL"
  | "ATELIER_OPERATION"
  | "MEDIA"
  | "UPDATE";

export type StudioSearchDocument = {
  id: string;
  kind: StudioSearchDocumentKind;
  primaryLabel: string;
  secondaryLabel: string;
  lifecycleState: string;
  route: string;
  aliases: readonly string[];
};

export type StudioApplicationProjection = {
  projectionVersion: typeof STUDIO_APPLICATION_PROJECTION_VERSION;
  generatedAt: string;
  mode: StudioApplicationMode;
  operator: {
    displayName: string;
    role: "operator" | "admin";
  };
  sourceRevisions: readonly StudioSourceRevision[];
  summary: StudioSummary;
  continueAction: StudioContinueAction | null;
  collectionScopes: readonly StudioCollectionScope[];
  searchDocuments: readonly StudioSearchDocument[];
  capabilities: readonly StudioCapability[];
  degradedSources: readonly StudioDegradedSource[];
};
