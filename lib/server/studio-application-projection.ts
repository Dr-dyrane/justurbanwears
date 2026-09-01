import { shopProducts } from "../shop/catalog";
import {
  studioOrderHasDueReturnWork,
  studioOrderHasDueWork,
} from "../shop/order-presentation";
import { CURRENT_SHOP_DROP } from "../shop/current-drop";
import { getShopCommerceGuidance } from "../shop/server-order/commerce-guidance";
import {
  DROP_01_INCOMPLETE_ARCHIVED_DRAFT_SKUS,
  SHOP_COLLECTION_COMPATIBILITY,
  compatibilityCollectionForSku,
} from "../shop/collection-compatibility";
import {
  createStudioScenarioSnapshot,
  STUDIO_SCENARIO_LABELS,
  studioScenarioHref,
  type StudioScenario,
} from "../studio/simulator";
import { STUDIO_SERVICES } from "../studio/service-registry";
import {
  actionableStudioDraftCount,
  historicalDrop01Kind,
} from "../studio/projections/piece-workspace";
import {
  STUDIO_APPLICATION_PROJECTION_VERSION,
  type StudioApplicationMode,
  type StudioApplicationProjection,
  type StudioCapability,
  type StudioCollectionScope,
  type StudioContinueAction,
  type StudioDegradedSource,
  type StudioSearchDocument,
  type StudioSummary,
  type StudioSummaryMetric,
} from "../studio/application/contracts";
import {
  getStudioAuthority,
  getStudioAuthorityWriteReadiness,
  type StudioAuthorityWriteReadiness,
} from "./studio-authority-repository";
import {
  listStudioCollections,
  type StudioCollectionReadResult,
} from "./studio-collection-repository";
import type { StudioOperator } from "./studio-operator";
import type { StudioAuthoritySnapshot } from "../studio/services/studio-authority-client";
import { sha256 } from "../studio/engine/fingerprint";

const CURRENT_COMPATIBILITY_SKUS: ReadonlySet<string> = new Set(
  SHOP_COLLECTION_COMPATIBILITY
    .find((collection) => collection.label === CURRENT_SHOP_DROP)
    ?.skus ?? [],
);

const PRIVATE_HISTORICAL_COMPATIBILITY_SKUS: ReadonlySet<string> = new Set(
  DROP_01_INCOMPLETE_ARCHIVED_DRAFT_SKUS,
);

const SEARCH_KIND_ORDER: Record<StudioSearchDocument["kind"], number> = {
  SERVICE: 0,
  COLLECTION: 1,
  PIECE: 2,
  SKU: 3,
  ORDER: 4,
  MODEL: 5,
  ATELIER_OPERATION: 6,
  MEDIA: 7,
  UPDATE: 8,
};

const STUDIO_OPERATOR_STORAGE_SCOPE_VERSION = "juw.studio.operator-storage-scope.v1";

/** Never expose the authenticated subject itself to browser storage keys. */
export function studioOperatorStorageScope(subject: string): string {
  return sha256(`${STUDIO_OPERATOR_STORAGE_SCOPE_VERSION}\n${subject}`);
}

function projectedOperator(operator: StudioOperator): StudioApplicationProjection["operator"] {
  return {
    displayName: operator.displayName,
    role: operator.role,
    storageScope: studioOperatorStorageScope(operator.actorSubject),
  };
}

const unavailableMetric = (): StudioSummaryMetric => ({
  value: null,
  asOf: null,
  source: "UNAVAILABLE",
});

function metric(value: number, asOf: string, source: "CONNECTED" | "SCENARIO"): StudioSummaryMetric {
  return { value, asOf, source };
}

function compareText(left: string, right: string) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sortDocuments(documents: StudioSearchDocument[]): StudioSearchDocument[] {
  return documents
    .sort((left, right) => (
      SEARCH_KIND_ORDER[left.kind] - SEARCH_KIND_ORDER[right.kind]
      || compareText(left.id, right.id)
    ))
    .slice(0, 300);
}

function serviceDocuments(scenario: StudioScenario | null = null): StudioSearchDocument[] {
  return STUDIO_SERVICES.map((service) => ({
    id: `service:${service.key}`,
    kind: "SERVICE" as const,
    primaryLabel: service.label,
    secondaryLabel: service.description,
    lifecycleState: "AVAILABLE",
    route: studioScenarioHref(service.href, scenario),
    aliases: service.aliases,
  }));
}

function compatibilityCollections(now: string): {
  scopes: StudioCollectionScope[];
  degraded: StudioDegradedSource[];
} {
  const catalogueSkus = new Set(shopProducts.map((product) => product.sku));
  const expectedSkus = SHOP_COLLECTION_COMPATIBILITY.flatMap((collection) => [...collection.skus]);
  const expectedCatalogueSkus = expectedSkus.filter((sku) => !PRIVATE_HISTORICAL_COMPATIBILITY_SKUS.has(sku));
  const unmappedSkus = shopProducts
    .filter((product) => !compatibilityCollectionForSku(product.sku))
    .map((product) => product.sku)
    .sort(compareText);
  const missingSkus = expectedCatalogueSkus.filter((sku) => !catalogueSkus.has(sku));
  const exposedPrivateSkus = shopProducts
    .filter((product) => PRIVATE_HISTORICAL_COMPATIBILITY_SKUS.has(product.sku))
    .map((product) => product.sku)
    .sort(compareText);
  const compatible = unmappedSkus.length === 0
    && missingSkus.length === 0
    && exposedPrivateSkus.length === 0
    && catalogueSkus.size === expectedCatalogueSkus.length;
  const degraded: StudioDegradedSource[] = compatible ? [] : [{
    source: "COLLECTIONS",
    message: "The transitional drop map does not match the approved catalogue.",
    nextAction: "Use Wardrobe without changing collection membership.",
  }];

  const scopes = SHOP_COLLECTION_COMPATIBILITY.map<StudioCollectionScope>((definition) => {
    const countsAvailable = compatible;
    return {
      id: definition.id,
      key: definition.key,
      label: definition.label,
      ordinal: definition.ordinal,
      version: 1,
      state: definition.state,
      isCurrent: definition.isCurrent,
      authority: "COMPATIBILITY",
      memberSkus: [...definition.skus],
      counts: {
        pieces: countsAvailable ? definition.skus.length : null,
        private: countsAvailable
          ? definition.skus.filter((sku) => PRIVATE_HISTORICAL_COMPATIBILITY_SKUS.has(sku)).length
          : null,
        ready: null,
        published: countsAvailable
          ? definition.skus.filter((sku) => catalogueSkus.has(sku)).length
          : null,
        // Compatibility rows prove membership, not current connected stock.
        available: null,
      },
      nextAction: `/studio/wardrobe?collection=${definition.key}`,
      updatedAt: now,
    };
  });
  return { scopes, degraded };
}

function collectionDocuments(scopes: readonly StudioCollectionScope[]): StudioSearchDocument[] {
  return scopes.map((scope) => ({
    id: `collection:${scope.id}`,
    kind: "COLLECTION",
    primaryLabel: scope.label,
    secondaryLabel: `${scope.counts.pieces ?? "—"} pieces · ${scope.state.toLowerCase()}`,
    lifecycleState: scope.state,
    route: scope.nextAction,
    aliases: [scope.key, `drop ${scope.ordinal}`, scope.isCurrent ? "current drop" : ""].filter(Boolean),
  }));
}

function pieceAvailableActions(piece: StudioAuthoritySnapshot["pieces"][number]): StudioSearchDocument["availableActions"] {
  const actions = new Set<NonNullable<StudioSearchDocument["availableActions"]>[number]>();
  if (piece.expectedCustody === "STUDIO") actions.add("UPDATE_LOCATION");
  if (
    piece.activeHold
    && piece.activeHold.status === "ACTIVE"
    && piece.availability === "RESERVED"
    && piece.expectedCustody === "STUDIO"
    && piece.expectedLocationKey === "WARDROBE_RAIL"
    && piece.observedLocationKey === "WARDROBE_RAIL"
    && Boolean(piece.observedAt)
    && !piece.hasLocationMismatch
  ) actions.add("RELEASE_HOLD");
  if (
    piece.availability === "AVAILABLE"
    && piece.sku
    && !piece.activeHold
    && piece.expectedCustody === "STUDIO"
    && piece.expectedLocationKey === "WARDROBE_RAIL"
    && piece.observedLocationKey === "WARDROBE_RAIL"
    && Boolean(piece.observedAt)
    && !piece.hasLocationMismatch
  ) {
    actions.add("CREATE_HOLD");
    actions.add("CREATE_ORDER");
  }
  return [...actions].sort(compareText);
}

function orderAvailableActions(order: StudioAuthoritySnapshot["orders"][number]): StudioSearchDocument["availableActions"] {
  const actions = new Set<NonNullable<StudioSearchDocument["availableActions"]>[number]>();
  if (studioOrderHasDueWork(order)) actions.add("ADVANCE_ORDER");
  for (const transition of order.allowedTransitions) {
    if (transition.dimension === "LIFECYCLE" && transition.target === "CANCELLED") {
      actions.add("CANCEL_ORDER");
    }
    if (transition.dimension === "CANCELLATION_REFUND") {
      actions.add("CANCEL_ORDER");
      actions.add("REFUND_ORDER");
    }
  }
  if (order.allowedReturnTransitions.some((transition) => transition.dimension === "REFUND")) {
    actions.add("REFUND_ORDER");
  }
  return [...actions].sort(compareText);
}

function authoritativeHistoricalState(
  piece: StudioAuthoritySnapshot["pieces"][number],
  collectionScopes: readonly StudioCollectionScope[],
) {
  const sku = piece.sku;
  if (!sku) return null;
  const databaseCollection = collectionScopes.find((collection) => (
    collection.authority === "DATABASE" && collection.memberSkus.includes(sku)
  ));
  if (databaseCollection?.key !== "drop-01") return databaseCollection ? null : historicalDrop01Kind({
    id: piece.wardrobeItemId ?? piece.pieceKey,
    sku,
  });
  return historicalDrop01Kind({ id: piece.wardrobeItemId ?? piece.pieceKey, sku });
}

function authorityDocuments(
  authority: StudioAuthoritySnapshot,
  collectionScopes: readonly StudioCollectionScope[],
): StudioSearchDocument[] {
  const documents: StudioSearchDocument[] = [];
  for (const piece of authority.pieces) {
    const historicalState = authoritativeHistoricalState(piece, collectionScopes);
    const lifecycleState = historicalState ?? piece.availability;
    const route = piece.wardrobeItemId
      ? `/studio/wardrobe/${encodeURIComponent(piece.wardrobeItemId)}`
      : `/studio/operations?view=inventory&piece=${encodeURIComponent(piece.pieceKey)}`;
    const pieceMetadata = [piece.title, piece.category, piece.colour, piece.sizeLabel]
      .filter(Boolean)
      .join(" · ");
    documents.push({
      availableActions: pieceAvailableActions(piece),
      id: `piece:${piece.pieceKey}`,
      kind: "PIECE",
      // A single route-bound result keeps the exact SKU as the strongest search key
      // while retaining the human title and safe garment facts as supporting copy.
      primaryLabel: piece.sku ?? piece.title,
      secondaryLabel: piece.sku ? pieceMetadata : [piece.category, piece.colour, piece.sizeLabel].filter(Boolean).join(" · "),
      lifecycleState,
      route,
      aliases: [piece.pieceKey, ...(piece.sku ? [piece.sku] : []), piece.title],
    });
  }
  for (const order of authority.orders) documents.push({
    availableActions: orderAvailableActions(order),
    id: `order:${order.reference}`,
    kind: "ORDER",
    primaryLabel: order.reference,
    secondaryLabel: order.lines[0]?.name ?? "Order",
    lifecycleState: order.lifecycleStatus,
    route: `/studio/orders/${encodeURIComponent(order.reference)}`,
    aliases: order.lines.flatMap((line) => [line.sku, line.name]),
  });
  for (const model of authority.models.filter((candidate) => candidate.state === "READY")) documents.push({
    id: `model:${model.id}`,
    kind: "MODEL",
    primaryLabel: model.name,
    secondaryLabel: "Approved model authority",
    lifecycleState: model.state,
    route: `/studio/models?view=authority&model=${encodeURIComponent(model.id)}`,
    aliases: [],
  });
  for (const media of authority.media) documents.push({
    id: `media:${media.id}`,
    kind: media.operation === "MODEL_TRY_ON" || media.operation === "EDITORIAL_MODEL"
      ? "ATELIER_OPERATION"
      : "MEDIA",
    primaryLabel: media.title,
    secondaryLabel: media.operation.toLowerCase().replaceAll("_", " "),
    lifecycleState: media.state,
    route: `/studio/media/${encodeURIComponent(media.id)}`,
    aliases: [media.operation, ...(media.sku ? [media.sku] : [])],
  });
  for (const update of authority.notifications) documents.push({
    id: `update:${update.id}`,
    kind: "UPDATE",
    primaryLabel: update.title,
    secondaryLabel: update.kind.toLowerCase(),
    lifecycleState: update.tone.toUpperCase(),
    route: update.href,
    aliases: [update.kind, update.actionLabel],
  });
  return documents;
}

function connectedSummary(authority: StudioAuthoritySnapshot): StudioSummary {
  const actionablePieces = authority.pieces.filter((piece) => (
    piece.availability === "PRIVATE" || piece.hasLocationMismatch
  )).length;
  const actionableOrders = authority.orders.filter((order) => (
    studioOrderHasDueWork(order)
  )).length;
  return {
    attention: metric(
      Math.max(authority.notifications.length, actionablePieces + actionableOrders),
      authority.generatedAt,
      "CONNECTED",
    ),
    available: metric(
      authority.pieces.filter((piece) => (
        piece.sku
        && CURRENT_COMPATIBILITY_SKUS.has(piece.sku)
        && piece.availability === "AVAILABLE"
      )).length,
      authority.generatedAt,
      "CONNECTED",
    ),
    // Physical-piece authority does not prove a public listing is live.
    live: unavailableMetric(),
    // The current order authority is a bounded operator list, not a total aggregate.
    orders: unavailableMetric(),
  };
}

function connectedContinueAction(
  authority: StudioAuthoritySnapshot,
  openCount: number,
): StudioContinueAction {
  const returns = authority.orders.filter((order) => (
    studioOrderHasDueReturnWork(order)
  ));
  if (returns.length) return {
    id: "returns",
    label: `Review ${returns.length} return${returns.length === 1 ? "" : "s"}`,
    href: "/studio/orders?filter=RETURNS",
    openCount,
    source: "CONNECTED",
  };

  const orders = authority.orders.filter((order) => (
    studioOrderHasDueWork(order) && !studioOrderHasDueReturnWork(order)
  ));
  if (orders.length) return {
    id: "orders",
    label: `Prepare ${orders.length} order${orders.length === 1 ? "" : "s"}`,
    href: "/studio/orders",
    openCount,
    source: "CONNECTED",
  };

  const notification = authority.notifications[0];
  if (notification) return {
    id: `update:${notification.id}`,
    label: notification.actionLabel || notification.title,
    href: notification.href,
    openCount,
    source: "CONNECTED",
  };

  const drafts = authority.pieces.filter((piece) => piece.availability === "PRIVATE");
  const exactDraft = drafts.find((piece) => piece.wardrobeItemId);
  if (drafts.length) return {
    id: "drafts",
    label: `Finish ${drafts.length} draft${drafts.length === 1 ? "" : "s"}`,
    href: exactDraft?.wardrobeItemId
      ? `/studio/wardrobe/${encodeURIComponent(exactDraft.wardrobeItemId)}`
      : "/studio/wardrobe?collection=private",
    openCount,
    source: "CONNECTED",
  };

  const mismatches = authority.pieces.filter((piece) => piece.hasLocationMismatch);
  if (mismatches.length) return {
    id: "locations",
    label: `Review ${mismatches.length} location${mismatches.length === 1 ? "" : "s"}`,
    href: "/studio/operations?view=inventory",
    openCount,
    source: "CONNECTED",
  };

  return {
    id: "add-piece",
    label: "Add the next piece",
    href: "/studio/wardrobe?intake=1",
    openCount,
    source: "CONNECTED",
  };
}

function connectedCapabilities(input: {
  authorityAvailable: boolean;
  collectionsAvailable?: boolean;
  holdWriteReady?: boolean;
  locationWriteReady?: boolean;
  operatorRole: StudioOperator["role"];
  orderWriteReady?: boolean;
}): StudioCapability[] {
  const state = input.authorityAvailable ? "AVAILABLE" as const : "UNAVAILABLE" as const;
  const compatibilityState = input.authorityAvailable ? "AVAILABLE" as const : "READ_ONLY_COMPATIBILITY" as const;
  return [
    { id: "PROJECTION", state: "AVAILABLE" },
    { id: "SEARCH", state: compatibilityState },
    { id: "ASK_READ", state: compatibilityState },
    { id: "WARDROBE_READ", state },
    { id: "WARDROBE_WRITE", state },
    { id: "ORDERS_READ", state },
    { id: "ORDERS_CREATE", state: input.authorityAvailable && input.orderWriteReady ? "AVAILABLE" : "UNAVAILABLE" },
    { id: "ORDERS_WRITE", state },
    { id: "MODELS_READ", state },
    { id: "MODELS_WRITE", state: "UNAVAILABLE" },
    { id: "MEDIA_READ", state },
    { id: "MEDIA_WRITE", state: "UNAVAILABLE" },
    { id: "OPERATIONS_READ", state },
    { id: "HOLDS_WRITE", state: input.authorityAvailable && input.holdWriteReady ? "AVAILABLE" : "UNAVAILABLE" },
    { id: "LOCATIONS_WRITE", state: input.authorityAvailable && input.locationWriteReady ? "AVAILABLE" : "UNAVAILABLE" },
    { id: "OPERATIONS_WRITE", state: input.authorityAvailable && input.holdWriteReady && input.locationWriteReady ? "AVAILABLE" : "UNAVAILABLE" },
    { id: "COLLECTIONS_READ", state: input.collectionsAvailable ? "AVAILABLE" : "READ_ONLY_COMPATIBILITY" },
    { id: "COLLECTIONS_WRITE", state: "UNAVAILABLE" },
    {
      id: "COLLECTION_MEMBERSHIP_WRITE",
      state: input.authorityAvailable && input.collectionsAvailable && input.operatorRole === "admin"
        ? "AVAILABLE"
        : "UNAVAILABLE",
    },
  ];
}

function scenarioCapabilities(): StudioCapability[] {
  return [
    { id: "PROJECTION", state: "AVAILABLE" },
    { id: "SEARCH", state: "AVAILABLE" },
    { id: "ASK_READ", state: "AVAILABLE" },
    { id: "WARDROBE_READ", state: "AVAILABLE" },
    { id: "WARDROBE_WRITE", state: "UNAVAILABLE" },
    { id: "ORDERS_READ", state: "AVAILABLE" },
    { id: "ORDERS_CREATE", state: "UNAVAILABLE" },
    { id: "ORDERS_WRITE", state: "UNAVAILABLE" },
    { id: "MODELS_READ", state: "UNAVAILABLE" },
    { id: "MODELS_WRITE", state: "UNAVAILABLE" },
    { id: "MEDIA_READ", state: "AVAILABLE" },
    { id: "MEDIA_WRITE", state: "UNAVAILABLE" },
    { id: "OPERATIONS_READ", state: "AVAILABLE" },
    { id: "HOLDS_WRITE", state: "UNAVAILABLE" },
    { id: "LOCATIONS_WRITE", state: "UNAVAILABLE" },
    { id: "OPERATIONS_WRITE", state: "UNAVAILABLE" },
    { id: "COLLECTIONS_READ", state: "AVAILABLE" },
    { id: "COLLECTIONS_WRITE", state: "UNAVAILABLE" },
    { id: "COLLECTION_MEMBERSHIP_WRITE", state: "UNAVAILABLE" },
  ];
}

export function projectConnectedStudioApplication(input: {
  operator: StudioOperator;
  now: string;
  authority: StudioAuthoritySnapshot | null;
  collections?: StudioCollectionReadResult | null;
  holdWriteReady?: boolean;
  locationWriteReady?: boolean;
  orderWriteReady?: boolean;
}): StudioApplicationProjection {
  const compatibility = compatibilityCollections(input.now);
  const collectionsAvailable = Boolean(input.collections);
  const collectionScopes = input.collections?.scopes ?? compatibility.scopes;
  const authorityAvailable = input.authority !== null;
  const degraded: StudioDegradedSource[] = [
    ...(collectionsAvailable ? [] : compatibility.degraded),
    ...(collectionsAvailable ? [] : [{
      source: "COLLECTIONS" as const,
      message: "Drop changes are temporarily unavailable.",
      nextAction: "Browse the approved collection map without changing it.",
    }]),
  ];
  if (!authorityAvailable) degraded.push({
    source: "AUTHORITY",
    message: "Connected Studio truth is unavailable.",
    nextAction: "Retry from the approved Studio workspace.",
  });
  // Order list reads are bounded and therefore never presented as a total.
  degraded.push({
    source: "ORDERS",
    message: "The total order aggregate is not available in this projection.",
    nextAction: "Open Orders for the bounded operator list.",
  });
  degraded.push({
    source: "PUBLICATION",
    message: "The public listing aggregate is not available in this projection.",
    nextAction: "Open Wardrobe publishing for listing state.",
  });
  const authority = input.authority;
  const summary = authority ? connectedSummary(authority) : {
    attention: unavailableMetric(),
    available: unavailableMetric(),
    live: unavailableMetric(),
    orders: unavailableMetric(),
  };
  return {
    projectionVersion: STUDIO_APPLICATION_PROJECTION_VERSION,
    generatedAt: input.now,
    mode: { kind: "CONNECTED" },
    operator: projectedOperator(input.operator),
    sourceRevisions: [
      ...(authority ? [{
        source: "AUTHORITY" as const,
        revision: `snapshot:${authority.generatedAt}`,
        generatedAt: authority.generatedAt,
        state: "CURRENT" as const,
      }] : []),
      ...(input.collections ? [{
        source: "COLLECTIONS" as const,
        revision: `collections:${input.collections.scopes.map((scope) => `${scope.key}@${scope.version}`).join(",")}`,
        generatedAt: input.collections.generatedAt,
        state: "CURRENT" as const,
      }] : [{
        source: "CATALOGUE_COMPATIBILITY" as const,
        revision: `known-drops:${shopProducts.length}`,
        generatedAt: input.now,
        state: "COMPATIBILITY" as const,
      }]),
    ],
    summary,
    continueAction: authority
      ? connectedContinueAction(authority, summary.attention.value ?? 0)
      : null,
    collectionScopes,
    searchDocuments: sortDocuments([
      ...serviceDocuments(),
      ...collectionDocuments(collectionScopes),
      ...(authority ? authorityDocuments(authority, collectionScopes) : []),
    ]),
    capabilities: connectedCapabilities({
      authorityAvailable,
      collectionsAvailable,
      holdWriteReady: input.holdWriteReady,
      locationWriteReady: input.locationWriteReady,
      operatorRole: input.operator.role,
      orderWriteReady: input.orderWriteReady,
    }),
    degradedSources: degraded,
  };
}

export function projectScenarioStudioApplication(input: {
  operator: StudioOperator;
  now: string;
  scenario: StudioScenario;
}): StudioApplicationProjection {
  const snapshot = createStudioScenarioSnapshot(input.scenario);
  const collections = compatibilityCollections(input.now);
  const scenarioCollections = collections.scopes.map((scope) => ({ ...scope, authority: "SCENARIO" as const }));
  const mode: StudioApplicationMode = {
    kind: "SCENARIO",
    id: input.scenario,
    label: STUDIO_SCENARIO_LABELS[input.scenario],
    notice: "Development simulator · isolated from connected Studio",
  };
  const documents: StudioSearchDocument[] = snapshot.garments.map((garment) => {
    const route = `/studio/wardrobe/${encodeURIComponent(garment.id)}?scenario=${encodeURIComponent(input.scenario)}`;
    const lifecycleState = historicalDrop01Kind(garment) ?? garment.state;
    return {
      id: `piece:${garment.id}`,
      kind: "PIECE" as const,
      primaryLabel: garment.sku,
      secondaryLabel: [garment.title, garment.category, garment.color, garment.sizeLabel].join(" · "),
      lifecycleState,
      route,
      aliases: [garment.id, garment.sku, garment.title],
    };
  });
  const scenarioOrders: StudioSearchDocument[] = snapshot.orders.map((order) => {
    const listing = snapshot.listings.find((candidate) => candidate.id === order.listingId);
    const garment = snapshot.garments.find((candidate) => candidate.id === listing?.garmentId);
    return {
      id: `order:${order.id}`,
      kind: "ORDER",
      primaryLabel: order.id,
      secondaryLabel: garment?.title ?? "Scenario order",
      lifecycleState: order.state,
      route: studioScenarioHref(`/studio/orders/${encodeURIComponent(order.id)}`, input.scenario),
      aliases: garment ? [garment.sku, garment.title] : [],
    };
  });
  const scenarioDrafts = actionableStudioDraftCount(snapshot.garments);
  const scenarioGarmentsById = new Map(snapshot.garments.map((garment) => [garment.id, garment]));
  const scenarioAvailable = snapshot.garments.filter((garment) => (
    garment.availability === "AVAILABLE"
    && historicalDrop01Kind(garment) === null
  )).length;
  const scenarioLive = snapshot.listings.filter((listing) => {
    if (listing.state !== "PUBLISHED" && listing.state !== "RESERVED") return false;
    const garment = scenarioGarmentsById.get(listing.garmentId);
    return !garment || historicalDrop01Kind(garment) === null;
  }).length;
  const continueAction: StudioContinueAction = snapshot.returns.length ? {
    id: "returns",
    label: `Review ${snapshot.returns.length} return${snapshot.returns.length === 1 ? "" : "s"}`,
    href: studioScenarioHref("/studio/orders?filter=RETURNS", input.scenario),
    openCount: snapshot.returns.length,
    source: "SCENARIO",
  } : scenarioDrafts ? {
    id: "drafts",
    label: `Finish ${scenarioDrafts} draft${scenarioDrafts === 1 ? "" : "s"}`,
    href: studioScenarioHref("/studio/wardrobe", input.scenario),
    openCount: scenarioDrafts,
    source: "SCENARIO",
  } : {
    id: "add-piece",
    label: "Add the next piece",
    href: studioScenarioHref("/studio/wardrobe?intake=1", input.scenario),
    openCount: 0,
    source: "SCENARIO",
  };
  return {
    projectionVersion: STUDIO_APPLICATION_PROJECTION_VERSION,
    generatedAt: input.now,
    mode,
    operator: projectedOperator(input.operator),
    sourceRevisions: [{
      source: "SCENARIO",
      revision: `scenario:${input.scenario}`,
      generatedAt: input.now,
      state: "SIMULATED",
    }],
    summary: {
      attention: metric(snapshot.returns.length, input.now, "SCENARIO"),
      available: metric(scenarioAvailable, input.now, "SCENARIO"),
      live: metric(scenarioLive, input.now, "SCENARIO"),
      orders: metric(snapshot.orders.length, input.now, "SCENARIO"),
    },
    continueAction,
    collectionScopes: scenarioCollections,
    searchDocuments: sortDocuments([
      ...serviceDocuments(input.scenario),
      ...collectionDocuments(scenarioCollections).map((document) => ({
        ...document,
        route: studioScenarioHref(document.route, input.scenario),
      })),
      ...documents,
      ...scenarioOrders,
    ]),
    capabilities: scenarioCapabilities(),
    degradedSources: collections.degraded,
  };
}

export async function getStudioApplicationProjection(
  operator: StudioOperator,
): Promise<StudioApplicationProjection> {
  const now = new Date().toISOString();
  let authority: StudioAuthoritySnapshot | null = null;
  let collections: StudioCollectionReadResult | null = null;
  let writeReadiness: StudioAuthorityWriteReadiness | null = null;
  const [authorityResult, collectionResult, writeReadinessResult] = await Promise.allSettled([
    getStudioAuthority(operator),
    listStudioCollections(),
    getStudioAuthorityWriteReadiness(),
  ]);
  if (authorityResult.status === "fulfilled") authority = authorityResult.value;
  if (collectionResult.status === "fulfilled") collections = collectionResult.value;
  if (writeReadinessResult.status === "fulfilled") writeReadiness = writeReadinessResult.value;
  return projectConnectedStudioApplication({
    operator,
    now,
    authority,
    collections,
    holdWriteReady: writeReadiness?.holds ?? false,
    locationWriteReady: writeReadiness?.custody ?? false,
    orderWriteReady: getShopCommerceGuidance().payment.available,
  });
}
