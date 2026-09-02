export const STUDIO_APPLICATION_PROJECTION_VERSION = "studio-application/v1" as const;

export type StudioApplicationSource =
  | "AUTHORITY"
  | "COLLECTIONS"
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
    | "WARDROBE_WRITE"
    | "ORDERS_READ"
    | "ORDERS_CREATE"
    | "ORDERS_WRITE"
    | "MODELS_READ"
    | "MODELS_WRITE"
    | "MEDIA_READ"
    | "MEDIA_WRITE"
    | "OPERATIONS_READ"
    | "HOLDS_WRITE"
    | "LOCATIONS_WRITE"
    | "OPERATIONS_WRITE"
    | "COLLECTIONS_READ"
    | "COLLECTIONS_WRITE"
    | "COLLECTION_MEMBERSHIP_WRITE";
  state: StudioCapabilityState;
};

export type StudioCollectionScope = {
  id: string;
  key: `drop-${string}`;
  label: string;
  ordinal: number;
  version: number;
  state: "DRAFT" | "ACTIVE" | "ARCHIVED";
  isCurrent: boolean;
  authority: "DATABASE" | "COMPATIBILITY" | "SCENARIO";
  memberSkus: string[];
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
  | "COLLECTION"
  | "PIECE"
  | "SKU"
  | "ORDER"
  | "MODEL"
  | "ATELIER_OPERATION"
  | "MEDIA"
  | "UPDATE";

export type StudioSearchAvailableAction =
  | "CREATE_HOLD"
  | "RELEASE_HOLD"
  | "CREATE_ORDER"
  | "CANCEL_ORDER"
  | "REFUND_ORDER"
  | "ADVANCE_ORDER"
  | "UPDATE_LOCATION";

export type StudioSearchDocument = {
  availableActions?: readonly StudioSearchAvailableAction[];
  /** Operator-safe long-form copy for exact-record answers; never used as the compact list label. */
  description?: string;
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
    /** Server-derived opaque identity for browser-private storage partitioning. */
    storageScope: string;
  };
  sourceRevisions: readonly StudioSourceRevision[];
  summary: StudioSummary;
  continueAction: StudioContinueAction | null;
  collectionScopes: readonly StudioCollectionScope[];
  searchDocuments: readonly StudioSearchDocument[];
  capabilities: readonly StudioCapability[];
  degradedSources: readonly StudioDegradedSource[];
};
