"use client";

import { ArrowRight, RefreshCw } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";
import type {
  StudioApplicationProjection,
  StudioCollectionScope,
  StudioSearchDocument,
} from "../../../lib/studio/application/contracts";
import {
  selectStudioProjectionFreshness,
  studioProjectionAsOfLabel,
} from "../../../lib/studio/application/projection-freshness";
import { selectStudioWorkProjection } from "../../../lib/studio/application/work-projection";
import { StudioLink as Link } from "../atoms/studio-link";
import { useStudio } from "../studio-provider";

type StudioServiceContextKind =
  | "ASK"
  | "HOLDS"
  | "INVENTORY"
  | "MEDIA"
  | "MODELS"
  | "OPERATIONS"
  | "ORDERS"
  | "PUBLISHING"
  | "RETURNS"
  | "STOCKTAKE"
  | "WARDROBE";

type StudioDesktopContext = {
  detail: string;
  label: string;
  state: string;
  subject: string;
};

type StudioRouteSelectors = {
  collection: string | null;
  filter: string | null;
  garment: string | null;
  media: string | null;
  model: string | null;
  operation: string | null;
  order: string | null;
  piece: string | null;
  view: string | null;
};

type StudioState = ReturnType<typeof useStudio>;

const ORIENTING_ACTION = {
  href: "#studio-content",
  label: "Focus workspace",
} as const;

function serviceContextKind(pathname: string, view: string | null): StudioServiceContextKind | null {
  if (pathname === "/studio/ask") return "ASK";
  if (pathname === "/studio/wardrobe" && view === "publishing") return "PUBLISHING";
  if (pathname === "/studio/wardrobe") return "WARDROBE";
  if (pathname === "/studio/media" || pathname === "/studio/media/new") return "MEDIA";
  if (pathname === "/studio/models") return "MODELS";
  if (pathname === "/studio/orders") return "ORDERS";
  if (pathname === "/studio/stocktake" || pathname === "/studio/scan" || scanPieceSelector(pathname)) return "STOCKTAKE";
  if (pathname === "/studio/operations" && view === "inventory") return "INVENTORY";
  if (pathname === "/studio/operations" && view === "orders") return "ORDERS";
  if (pathname === "/studio/operations" && view === "holds") return "HOLDS";
  if (pathname === "/studio/operations" && view === "returns") return "RETURNS";
  if (pathname === "/studio/operations") return "OPERATIONS";
  return null;
}

function scanPieceSelector(pathname: string) {
  return pathname.match(/^\/studio\/scan\/([^/]+)$/)?.[1] ?? null;
}

function readableState(value: string) {
  return value.toLowerCase().replaceAll("_", " ").replace(/(^|\s)\S/g, (letter) => letter.toUpperCase());
}

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`;
}

function normalized(value: string) {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // Keep the literal selector when it is not URI encoded.
  }
  return decoded.trim().toLowerCase();
}

function documentValues(document: StudioSearchDocument) {
  const route = new URL(document.route, "https://studio.local");
  const idWithoutKind = document.id.includes(":")
    ? document.id.slice(document.id.indexOf(":") + 1)
    : document.id;
  return [
    document.id,
    idWithoutKind,
    document.primaryLabel,
    ...document.aliases,
    ...route.pathname.split("/").filter(Boolean),
    ...["garment", "media", "model", "operation", "order", "piece"]
      .map((key) => route.searchParams.get(key))
      .filter((value): value is string => Boolean(value)),
  ].map(normalized);
}

function exactDocument(
  documents: readonly StudioSearchDocument[],
  kinds: readonly StudioSearchDocument["kind"][],
  selector: string,
) {
  const requested = normalized(selector);
  return documents.find((document) => (
    kinds.includes(document.kind) && documentValues(document).includes(requested)
  )) ?? null;
}

function documentTitle(document: StudioSearchDocument) {
  if (document.kind !== "PIECE") return document.primaryLabel;
  return document.secondaryLabel.split(" · ")[0] || document.primaryLabel;
}

function documentDetail(document: StudioSearchDocument) {
  if (document.kind !== "PIECE") return document.secondaryLabel;
  const detail = document.secondaryLabel.split(" · ").slice(1).join(" · ");
  return detail || document.secondaryLabel;
}

function documentContext(document: StudioSearchDocument, label: string): StudioDesktopContext {
  return {
    detail: documentDetail(document),
    label,
    state: `${document.kind === "PIECE" ? `${document.primaryLabel} · ` : ""}${readableState(document.lifecycleState)}`,
    subject: documentTitle(document),
  };
}

function missingSelection(label: string, selector: string): StudioDesktopContext {
  return {
    detail: "The current projection has no exact match. Studio will not substitute another record.",
    label,
    state: "Unavailable",
    subject: selector,
  };
}

function metricState(value: number | null, singular: string, pluralLabel?: string) {
  return value === null ? `${readableState(singular)} count unavailable` : plural(value, singular, pluralLabel);
}

function currentCollection(projection: StudioApplicationProjection) {
  return projection.collectionScopes.find((scope) => scope.isCurrent)
    ?? projection.collectionScopes[0]
    ?? null;
}

function exactCollection(
  scopes: readonly StudioCollectionScope[],
  selector: string,
) {
  const requested = normalized(selector);
  return scopes.find((scope) => (
    [scope.id, scope.key, scope.label].map(normalized).includes(requested)
  )) ?? null;
}

function collectionContext(scope: StudioCollectionScope): StudioDesktopContext {
  return {
    detail: "The workspace is scoped to this collection.",
    label: scope.isCurrent ? "Current drop" : "Selected drop",
    state: `${metricState(scope.counts.pieces, "piece")} · ${readableState(scope.state)}`,
    subject: scope.label,
  };
}

function archivedWardrobeContext(count: number): StudioDesktopContext {
  return {
    detail: "Archived pieces stay out of active Wardrobe and Shop. Open one to review its history or permanently delete it when eligible.",
    label: "Wardrobe archive",
    state: plural(count, "archived piece"),
    subject: "Archived pieces",
  };
}

function projectedSelection(
  kind: StudioServiceContextKind,
  projection: StudioApplicationProjection,
  selectors: StudioRouteSelectors,
): StudioDesktopContext | null {
  const documents = projection.searchDocuments;
  const requestedOrder = selectors.order;
  if (requestedOrder && ["OPERATIONS", "ORDERS", "RETURNS"].includes(kind)) {
    const document = exactDocument(documents, ["ORDER"], requestedOrder);
    return document ? documentContext(document, "Selected order") : missingSelection("Selected order", requestedOrder);
  }

  const requestedPiece = selectors.piece ?? selectors.garment;
  if (requestedPiece && ["HOLDS", "INVENTORY", "MEDIA", "OPERATIONS", "ORDERS", "PUBLISHING", "STOCKTAKE", "WARDROBE"].includes(kind)) {
    const document = exactDocument(documents, ["PIECE", "SKU"], requestedPiece);
    return document ? documentContext(document, kind === "ORDERS" ? "Requested piece" : "Selected piece") : missingSelection("Selected piece", requestedPiece);
  }

  if (selectors.model && kind === "MODELS") {
    const document = exactDocument(documents, ["MODEL"], selectors.model);
    return document ? documentContext(document, "Selected authority") : missingSelection("Selected authority", selectors.model);
  }

  const requestedMedia = selectors.media ?? selectors.operation;
  if (requestedMedia && kind === "MEDIA") {
    const document = exactDocument(documents, ["ATELIER_OPERATION", "MEDIA"], requestedMedia);
    return document ? documentContext(document, "Selected media") : missingSelection("Selected media", requestedMedia);
  }

  return null;
}

function projectedContext(
  kind: StudioServiceContextKind,
  projection: StudioApplicationProjection,
  selectors: StudioRouteSelectors,
  archivedPieceCount: number,
): StudioDesktopContext | null {
  const selected = projectedSelection(kind, projection, selectors);
  if (selected) return selected;

  const documents = projection.searchDocuments;
  const pieces = documents.filter((document) => document.kind === "PIECE");
  const orders = documents.filter((document) => document.kind === "ORDER");

  if (kind === "WARDROBE" && selectors.collection === "archived") {
    return archivedWardrobeContext(archivedPieceCount);
  }

  const collection = selectors.collection
    ? exactCollection(projection.collectionScopes, selectors.collection)
    : currentCollection(projection);

  if ((kind === "WARDROBE" || kind === "PUBLISHING") && collection) {
    if (kind === "WARDROBE") return collectionContext(collection);
    const publicationState = [
      collection.counts.ready === null ? null : plural(collection.counts.ready, "ready piece", "ready pieces"),
      collection.counts.published === null ? null : plural(collection.counts.published, "published piece", "published pieces"),
    ].filter(Boolean).join(" · ");
    return {
      detail: "The publishing workspace remains scoped to this collection.",
      label: "Publishing scope",
      state: publicationState || "Publication counts unavailable",
      subject: collection.label,
    };
  }

  if (kind === "WARDROBE" || kind === "PUBLISHING") {
    const selector = selectors.collection;
    if (selector === "choose") return {
      detail: "Choose a collection in the workspace before opening its pieces.",
      label: "Collection scope",
      state: "Chooser open",
      subject: "Browse drops",
    };
    if (selector === "all") return {
      detail: "The workspace includes every piece in the current projection.",
      label: "Collection scope",
      state: plural(pieces.length, "projected piece"),
      subject: "All drops",
    };
    if (selector === "private") {
      const privatePieces = pieces.filter((document) => document.lifecycleState === "PRIVATE");
      return {
        detail: "The workspace is limited to private pieces in the current projection.",
        label: "Collection scope",
        state: plural(privatePieces.length, "private piece"),
        subject: "Private wardrobe",
      };
    }
    if (selector) return missingSelection("Collection scope", selector);
    return {
      detail: "No collection scope is available in the current projection.",
      label: kind === "PUBLISHING" ? "Publishing scope" : "Wardrobe scope",
      state: plural(pieces.length, "projected piece"),
      subject: kind === "PUBLISHING" ? "Publishing" : "Wardrobe",
    };
  }

  if (kind === "ORDERS" || kind === "RETURNS") {
    if (kind === "RETURNS" || selectors.filter === "RETURNS") {
      const openReturns = projection.continueAction?.id === "returns"
        ? projection.continueAction.openCount
        : null;
      return {
        detail: "The workspace owns the current return filter and its next eligible action.",
        label: "Order filter",
        state: openReturns === null ? "Return count unavailable" : plural(openReturns, "open return"),
        subject: "Returns",
      };
    }
    return {
      detail: selectors.filter
        ? `The workspace applies the ${readableState(selectors.filter)} filter.`
        : "The workspace contains the bounded order projection.",
      label: selectors.filter ? "Order filter" : "Order service",
      state: plural(orders.length, "projected order"),
      subject: selectors.filter ? readableState(selectors.filter) : "Orders",
    };
  }

  if (kind === "INVENTORY" || kind === "STOCKTAKE") return {
    detail: kind === "STOCKTAKE"
      ? "The workspace verifies physical stock without choosing a substitute piece."
      : "The workspace shows the current inventory projection.",
    label: kind === "STOCKTAKE" ? "Stock count scope" : "Inventory scope",
    state: metricState(projection.summary.available.value, "available piece"),
    subject: kind === "STOCKTAKE" ? "Physical stock" : "Inventory",
  };

  if (kind === "HOLDS") {
    const heldPieces = pieces.filter((document) => document.availableActions?.includes("RELEASE_HOLD"));
    return {
      detail: "The workspace shows pieces with a releasable hold in the current projection.",
      label: "Hold service",
      state: plural(heldPieces.length, "active hold"),
      subject: "Holds",
    };
  }

  if (kind === "MODELS") {
    const models = documents.filter((document) => document.kind === "MODEL");
    return {
      detail: "Choose an authority in the workspace to inspect its exact record.",
      label: "Model service",
      state: plural(models.length, "authority", "authorities"),
      subject: "Model authorities",
    };
  }

  if (kind === "MEDIA") {
    const media = documents.filter((document) => ["ATELIER_OPERATION", "MEDIA"].includes(document.kind));
    return {
      detail: "Choose a media operation in the workspace to inspect its exact state.",
      label: "Media service",
      state: plural(media.length, "projected item"),
      subject: "Media",
    };
  }

  if (kind === "OPERATIONS") return {
    detail: "The workspace resolves the current operational projection.",
    label: "Operations service",
    state: metricState(projection.summary.attention.value, "item needing attention", "items needing attention"),
    subject: "Operations",
  };

  if (kind === "ASK") return {
    detail: "Ask Studio can inspect the current projection before preparing an action.",
    label: "Current Studio state",
    state: projection.continueAction?.openCount
      ? plural(projection.continueAction.openCount, "open item")
      : "Ready",
    subject: projection.continueAction?.label ?? "Ask Studio",
  };

  return null;
}

function scenarioGarmentSelector(garment: StudioState["garments"][number]) {
  return [garment.id, `scenario:${garment.id}`, garment.sku, garment.dynamicPublication?.slug]
    .filter((value): value is string => Boolean(value))
    .map(normalized);
}

function scenarioGarmentContext(
  garment: StudioState["garments"][number],
  label: string,
): StudioDesktopContext {
  return {
    detail: [garment.color, garment.category, garment.sizeLabel].filter(Boolean).join(" · "),
    label,
    state: `${garment.sku} · ${readableState(garment.state)}`,
    subject: garment.title,
  };
}

function scenarioContext(
  kind: StudioServiceContextKind,
  studio: StudioState,
  selectors: StudioRouteSelectors,
): StudioDesktopContext | null {
  if (!studio.scenario) return null;

  const requestedOrder = selectors.order;
  if (requestedOrder && ["OPERATIONS", "ORDERS", "RETURNS"].includes(kind)) {
    const order = studio.orders.find((candidate) => normalized(candidate.id) === normalized(requestedOrder));
    if (!order) return missingSelection("Selected order", requestedOrder);
    const listing = studio.listings.find((candidate) => candidate.id === order.listingId);
    const garment = studio.garments.find((candidate) => candidate.id === listing?.garmentId);
    return {
      detail: garment?.title ?? "Scenario order",
      label: "Selected order",
      state: readableState(order.state),
      subject: order.id,
    };
  }

  const requestedPiece = selectors.piece ?? selectors.garment;
  if (requestedPiece && ["HOLDS", "INVENTORY", "OPERATIONS", "ORDERS", "PUBLISHING", "STOCKTAKE", "WARDROBE"].includes(kind)) {
    const requested = normalized(requestedPiece);
    const garment = studio.garments.find((candidate) => scenarioGarmentSelector(candidate).includes(requested));
    return garment
      ? scenarioGarmentContext(garment, kind === "ORDERS" ? "Requested piece" : "Selected piece")
      : missingSelection("Selected piece", requestedPiece);
  }

  if (selectors.model && kind === "MODELS") {
    const model = studio.models.find((candidate) => normalized(candidate.id) === normalized(selectors.model!));
    return model ? {
      detail: model.version,
      label: "Selected authority",
      state: `${readableState(model.state)} · ${readableState(model.consent.status)}`,
      subject: model.preferredName,
    } : missingSelection("Selected authority", selectors.model);
  }

  const requestedMedia = selectors.media ?? selectors.operation;
  if (requestedMedia && kind === "MEDIA") {
    const shoot = studio.shoots.find((candidate) => normalized(candidate.id) === normalized(requestedMedia));
    if (!shoot) return missingSelection("Selected media", requestedMedia);
    const garment = studio.garments.find((candidate) => candidate.id === shoot.garmentId);
    return {
      detail: [garment?.sku, shoot.preset].filter(Boolean).join(" · "),
      label: "Selected media",
      state: plural(shoot.generations.length, "generation"),
      subject: garment?.title ?? shoot.id,
    };
  }

  if (kind === "WARDROBE" || kind === "PUBLISHING") {
    const collection = selectors.collection;
    if (kind === "WARDROBE" && collection === "archived") {
      return archivedWardrobeContext(
        studio.garments.filter((garment) => garment.state === "ARCHIVED").length,
      );
    }
    const subject = collection === "all"
      ? "All drops"
      : collection === "private"
        ? "Private wardrobe"
        : collection === "choose"
          ? "Browse drops"
          : collection?.startsWith("drop-")
            ? readableState(collection.replace("-", " "))
            : kind === "PUBLISHING" ? "Publishing" : "Scenario wardrobe";
    const listingCount = studio.listings.filter((listing) => (
      listing.state === "READY" || listing.state === "PUBLISHED"
    )).length;
    return {
      detail: collection === "choose"
        ? "Choose a collection in the workspace before opening its pieces."
        : "The right workspace owns the exact collection and piece selection.",
      label: kind === "PUBLISHING" ? "Publishing scope" : "Collection scope",
      state: collection === "choose"
        ? "Chooser open"
        : plural(kind === "PUBLISHING" ? listingCount : studio.garments.length, kind === "PUBLISHING" ? "listing" : "piece"),
      subject,
    };
  }

  if (kind === "ORDERS" || kind === "RETURNS") {
    const returnFilter = kind === "RETURNS" || selectors.filter === "RETURNS";
    return {
      detail: returnFilter
        ? "The workspace owns the simulated return queue."
        : "The workspace owns the simulated order queue.",
      label: returnFilter ? "Order filter" : "Order service",
      state: plural(returnFilter ? studio.returns.length : studio.orders.length, returnFilter ? "return" : "order"),
      subject: returnFilter ? "Returns" : "Orders",
    };
  }

  if (kind === "INVENTORY" || kind === "STOCKTAKE") {
    const available = studio.garments.filter((garment) => garment.availability === "AVAILABLE").length;
    return {
      detail: "The workspace owns the exact piece and physical-state actions.",
      label: kind === "STOCKTAKE" ? "Stock count scope" : "Inventory scope",
      state: plural(available, "available piece"),
      subject: kind === "STOCKTAKE" ? "Physical stock" : "Inventory",
    };
  }

  if (kind === "HOLDS") return {
    detail: "The isolated scenario does not create or release connected holds.",
    label: "Hold service",
    state: "Read only",
    subject: "No simulated holds",
  };

  if (kind === "MODELS") return {
    detail: "Choose an authority in the workspace to inspect its exact record.",
    label: "Model service",
    state: plural(studio.models.length, "authority", "authorities"),
    subject: "Model authorities",
  };

  if (kind === "MEDIA") return {
    detail: "Choose a media operation in the workspace to inspect its exact state.",
    label: "Media service",
    state: plural(studio.shoots.length, "shoot"),
    subject: "Media",
  };

  if (kind === "OPERATIONS") {
    const attention = studio.authority.snapshot
      ? selectStudioWorkProjection(studio.authority.snapshot).attentionCount
      : studio.returns.filter((entry) => entry.disposition === "PENDING").length;
    return {
      detail: "The workspace resolves the current simulated operational state.",
      label: "Operations service",
      state: plural(attention, "item needing attention", "items needing attention"),
      subject: "Operations",
    };
  }

  if (kind === "ASK") return {
    detail: "Ask Studio can inspect the simulated projection before preparing an action.",
    label: "Current Studio state",
    state: "Ready",
    subject: "Ask Studio",
  };

  return null;
}

export function StudioDesktopContextStage({ title }: { title: string }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const studio = useStudio();
  const selectors: StudioRouteSelectors = {
    collection: searchParams.get("collection"),
    filter: searchParams.get("filter"),
    garment: searchParams.get("garment"),
    media: searchParams.get("media"),
    model: searchParams.get("model"),
    operation: searchParams.get("operation"),
    order: searchParams.get("order"),
    piece: searchParams.get("piece") ?? scanPieceSelector(pathname),
    view: searchParams.get("view"),
  };
  const kind = serviceContextKind(pathname, selectors.view);
  if (!kind) return null;

  const archivedPieceCount = studio.garments.filter((garment) => garment.state === "ARCHIVED").length;
  const context = scenarioContext(kind, studio, selectors)
    ?? (studio.application.snapshot
      ? projectedContext(kind, studio.application.snapshot, selectors, archivedPieceCount)
      : null);
  const freshness = selectStudioProjectionFreshness({
    error: studio.application.error,
    generatedAt: studio.application.snapshot?.generatedAt ?? null,
    status: studio.application.status,
  });
  const stale = !studio.scenario && freshness.state === "STALE";
  const loading = !studio.scenario && studio.application.status === "loading";
  const unavailable = !context && !loading;

  return (
    <aside
      aria-labelledby="studio-desktop-context-title"
      className="studio-desktop-context-stage"
      data-context-state={loading ? "loading" : unavailable ? "unavailable" : stale ? "stale" : "ready"}
    >
      <div className="studio-desktop-context-copy">
        <span>{stale ? "Last-known Studio" : context?.label ?? (loading ? "Current context" : `${title} context`)}</span>
        <h2 id="studio-desktop-context-title">
          {context?.subject ?? (loading ? "Reading Studio state" : "Live state unavailable")}
        </h2>
        <p className="studio-desktop-context-state">
          {stale ? studioProjectionAsOfLabel(freshness.asOf) : context?.state ?? (loading ? "Connecting" : "Unavailable")}
        </p>
        <p className="studio-desktop-context-detail">
          {stale
            ? studio.application.error || "Refresh failed. Verify current Studio state before making a change."
            : context?.detail
            ?? studio.application.error
            ?? (loading ? "The current operator-safe projection is loading." : "Retry the current Studio projection before acting.")}
        </p>
        {context && !stale ? (
          <Link className="studio-desktop-context-action" href={ORIENTING_ACTION.href}>
            <span>{ORIENTING_ACTION.label}</span>
            <ArrowRight aria-hidden="true" size={20} />
          </Link>
        ) : (
          <button
            className="studio-desktop-context-action"
            disabled={loading}
            onClick={() => void studio.application.refresh()}
            type="button"
          >
            <span>{loading ? "Reading state" : "Try again"}</span>
            <RefreshCw aria-hidden="true" size={18} />
          </button>
        )}
      </div>
    </aside>
  );
}
