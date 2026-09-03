import { sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import type { StudioCollectionScope } from "../studio/application/contracts";
import type {
  StudioCollectionIntent,
  StudioCollectionPreview,
  StudioCollectionReference,
  StudioCollectionReceipt,
  StudioPublishedCollectionMembership,
} from "../studio/collections/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import type { StudioOperator } from "./studio-operator";

type DatabaseRow = Record<string, unknown>;

type PreparedPublishedMembershipCorrection = {
  preview: StudioCollectionPreview;
  catalogueRevision: string;
};

export type StudioCollectionReadResult = {
  scopes: StudioCollectionScope[];
  generatedAt: string;
};

function resultRows(result: unknown): DatabaseRow[] {
  if (!result || typeof result !== "object") return [];
  const value = "rows" in result ? result.rows : result;
  return Array.isArray(value) ? value as DatabaseRow[] : [];
}

function nullableDate(value: unknown): string | null {
  if (!value) return null;
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function numberOrNull(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringArray(value: unknown): string[] {
  if (typeof value === "string") {
    try {
      return stringArray(JSON.parse(value) as unknown);
    } catch {
      return [];
    }
  }
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function collectionScope(row: DatabaseRow, authority: StudioCollectionScope["authority"] = "DATABASE"): StudioCollectionScope {
  const key = String(row.key ?? row.collection_key) as StudioCollectionScope["key"];
  const state = String(row.state) as StudioCollectionScope["state"];
  return {
    id: String(row.id ?? row.collection_id),
    key,
    label: String(row.label),
    ordinal: Number(row.ordinal),
    version: Number(row.version),
    state,
    isCurrent: state === "ACTIVE",
    authority,
    memberSkus: stringArray(row.member_skus ?? row.memberSkus),
    counts: {
      pieces: numberOrNull(row.pieces),
      private: numberOrNull(row.private_count),
      ready: numberOrNull(row.ready_count),
      published: numberOrNull(row.published_count),
      available: numberOrNull(row.available_count),
    },
    nextAction: `/studio/wardrobe?collection=${encodeURIComponent(key)}`,
    updatedAt: nullableDate(row.updated_at) ?? new Date(0).toISOString(),
  };
}

function normalizedIntent(intent: StudioCollectionIntent): StudioCollectionIntent {
  if (intent.command === "CREATE_COLLECTION") return { ...intent, label: intent.label.trim() };
  if (intent.command === "RENAME_COLLECTION") return { ...intent, label: intent.label.trim() };
  return intent;
}

function intentFingerprint(intent: StudioCollectionIntent) {
  return sha256(JSON.stringify(normalizedIntent(intent)));
}

function revisionFor(scopes: StudioCollectionScope[], intent: StudioCollectionIntent) {
  return sha256(JSON.stringify({
    intent: normalizedIntent(intent),
    collections: scopes.map(({ id, key, label, ordinal, state, version, memberSkus }) => ({
      id,
      key,
      label,
      ordinal,
      state,
      version,
      memberSkus,
    })),
  }));
}

function draftScope(input: { key: StudioCollectionScope["key"]; label: string; ordinal: number }): StudioCollectionScope {
  return {
    id: `pending:${input.key}`,
    key: input.key,
    label: input.label,
    ordinal: input.ordinal,
    version: 1,
    state: "DRAFT",
    isCurrent: false,
    authority: "DATABASE",
    memberSkus: [],
    counts: { pieces: 0, private: 0, ready: 0, published: 0, available: 0 },
    nextAction: `/studio/wardrobe?collection=${encodeURIComponent(input.key)}`,
    updatedAt: new Date().toISOString(),
  };
}

function requireCollection(scopes: StudioCollectionScope[], id: string) {
  const collection = scopes.find((scope) => scope.id === id);
  if (!collection) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      404,
      "That drop is no longer available.",
      "Refresh Browse drops and choose it again.",
    );
  }
  return collection;
}

function requireVersion(collection: StudioCollectionScope, expectedVersion: number) {
  if (collection.version !== expectedVersion) {
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      `${collection.label} changed after this preview.`,
      "Review the current drop and try again.",
    );
  }
}

function rejectFixedCollectionMutation(intent: StudioCollectionIntent): void {
  if (intent.command === "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP") return;
  const message = intent.command === "CREATE_COLLECTION"
    ? "New drops are unavailable while Drop 02 is the fixed active collection."
    : "Drop 01 and Drop 02 are fixed collections and cannot be changed.";
  throw new StudioEngineError(
    "INVALID_TRANSITION",
    409,
    message,
    "Use Drop 02 for active work. Drop 01 remains archived history.",
  );
}

function requireCollectionCorrectionPermission(
  operator: StudioOperator,
  intent: StudioCollectionIntent,
): void {
  if (intent.command !== "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP" || operator.role === "admin") return;
  throw new StudioEngineError(
    "OPERATOR_FORBIDDEN",
    403,
    "Only a Studio admin can change a published piece's drop.",
    "Ask a Studio admin to review and publish this drop change.",
  );
}

export async function listStudioCollections(): Promise<StudioCollectionReadResult> {
  const generatedAt = new Date().toISOString();
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select
      collection.id,
      collection.key,
      collection.label,
      collection.ordinal,
      collection.version,
      collection.state,
      collection.updated_at,
      coalesce((
        select jsonb_agg(catalogue.sku order by catalogue.sku)
        from shop_catalogue_items catalogue
        where catalogue.collection_id = collection.id
      ), '[]'::jsonb) as member_skus,
      (
        select count(*)::int
        from (
          select 'catalogue:' || catalogue.sku as piece_key
          from shop_catalogue_items catalogue
          where catalogue.collection_id = collection.id
          union
          select 'wardrobe:' || wardrobe.id::text as piece_key
          from studio_wardrobe_items wardrobe
          where wardrobe.target_collection_id = collection.id
            and not exists (
              select 1
              from studio_catalogue_publications publication
              where publication.wardrobe_item_id = wardrobe.id
            )
        ) pieces
      ) as pieces,
      (
        select count(*)::int
        from studio_wardrobe_items wardrobe
        where wardrobe.target_collection_id = collection.id
          and wardrobe.state = 'DRAFT'
      ) as private_count,
      (
        select count(*)::int
        from studio_wardrobe_items wardrobe
        where wardrobe.target_collection_id = collection.id
          and wardrobe.state = 'READY'
      ) as ready_count,
      (
        select count(*)::int
        from shop_catalogue_items catalogue
        where catalogue.collection_id = collection.id
      ) as published_count,
      (
        select count(*)::int
        from shop_catalogue_items catalogue
        inner join shop_inventory inventory on inventory.sku = catalogue.sku
        where catalogue.collection_id = collection.id
          and inventory.availability = 'AVAILABLE'
      ) as available_count
    from shop_collections collection
    order by collection.ordinal desc
  `);
  return { scopes: resultRows(result).map((row) => collectionScope(row)), generatedAt };
}

function collectionReference(collection: StudioCollectionScope): StudioCollectionReference {
  const { id, key, label, ordinal, version, state, isCurrent } = collection;
  return { id, key, label, ordinal, version, state, isCurrent };
}

function knownInventoryAvailability(
  value: unknown,
): StudioPublishedCollectionMembership["inventory"]["availability"] | null {
  return value === "AVAILABLE" || value === "RESERVED" || value === "SOLD" || value === "ARCHIVED"
    ? value
    : null;
}

function nonnegativeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function inventoryConsequence(input: {
  sku: string;
  destination: StudioCollectionScope;
  publicationState: StudioPublishedCollectionMembership["publicationState"];
  availability: StudioPublishedCollectionMembership["inventory"]["availability"];
}) {
  if (!input.destination.isCurrent) {
    return `${input.sku} will leave the current Shop. Its ${input.availability.toLowerCase()} inventory record stays unchanged.`;
  }
  if (input.publicationState === "ARCHIVED") {
    return `${input.sku} will join ${input.destination.label}, but its archived publication remains unavailable. Its ${input.availability.toLowerCase()} inventory record stays unchanged.`;
  }
  if (input.availability === "AVAILABLE") {
    return `${input.sku} will join the current Shop and can appear because it is available. Inventory stays unchanged.`;
  }
  return `${input.sku} will join ${input.destination.label}, but it will not appear as available while inventory is ${input.availability.toLowerCase()}. Inventory stays unchanged.`;
}

async function readPublishedMembership(sku: string): Promise<DatabaseRow | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select
      catalogue.sku,
      catalogue.drop_label,
      catalogue.updated_at::text as catalogue_revision,
      source.id as source_collection_id,
      source.key as source_collection_key,
      source.label as source_collection_label,
      publication.state as publication_state,
      publication.wardrobe_item_id,
      inventory.availability,
      inventory.on_hand,
      inventory.reserved,
      inventory.sold,
      inventory.returned,
      inventory.write_off
    from shop_catalogue_items catalogue
    left join shop_collections source on source.id = catalogue.collection_id
    left join studio_catalogue_publications publication on publication.sku = catalogue.sku
    left join shop_inventory inventory on inventory.sku = catalogue.sku
    where catalogue.sku = ${sku}
    limit 1
  `);
  return resultRows(result)[0] ?? null;
}

async function preparePublishedMembershipCorrection(
  intent: Extract<StudioCollectionIntent, { command: "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP" }>,
): Promise<PreparedPublishedMembershipCorrection> {
  const { scopes } = await listStudioCollections();
  const destination = requireCollection(scopes, intent.collectionId);
  requireVersion(destination, intent.expectedVersion);

  const canonicalKeys = new Set<StudioCollectionScope["key"]>(["drop-01", "drop-02"]);
  if (!canonicalKeys.has(destination.key)) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      "Published pieces can only be corrected between Drop 01 and Drop 02.",
      "Choose Drop 01 or Drop 02.",
    );
  }
  const expectedDestinationState = destination.key === "drop-02" ? "ACTIVE" : "ARCHIVED";
  if (destination.state !== expectedDestinationState) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${destination.label} is no longer in its expected ${expectedDestinationState.toLowerCase()} state.`,
      "Refresh the piece before changing its drop.",
    );
  }

  const row = await readPublishedMembership(intent.sku);
  if (!row) {
    throw new StudioEngineError(
      "INTAKE_NOT_FOUND",
      404,
      `${intent.sku} is not a published Studio piece.`,
      "Return to Wardrobe and open a published piece.",
    );
  }
  const publicationState = row.publication_state === "PUBLISHED" || row.publication_state === "ARCHIVED"
    ? row.publication_state
    : null;
  if (!publicationState) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${intent.sku} has never been published or is currently unpublished.`,
      "Open a published or historically published piece before changing its drop.",
    );
  }

  const sourceId = typeof row.source_collection_id === "string" ? row.source_collection_id : null;
  const source = sourceId ? scopes.find((scope) => scope.id === sourceId) ?? null : null;
  if (!source || !canonicalKeys.has(source.key)) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${intent.sku} does not have canonical Drop 01 or Drop 02 membership.`,
      "Reconcile its published collection before moving it.",
    );
  }
  const expectedSourceState = source.key === "drop-02" ? "ACTIVE" : "ARCHIVED";
  if (source.state !== expectedSourceState) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${source.label} is no longer in its expected ${expectedSourceState.toLowerCase()} state.`,
      "Refresh the piece before changing its drop.",
    );
  }
  if (source.id === destination.id) {
    throw new StudioEngineError(
      "INVALID_REQUEST",
      409,
      `${intent.sku} is already in ${destination.label}.`,
      "Choose the other drop.",
    );
  }
  if (!source.memberSkus.includes(intent.sku) || destination.memberSkus.includes(intent.sku)) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${intent.sku} has conflicting collection membership.`,
      "Refresh Wardrobe before moving it.",
    );
  }
  if (String(row.drop_label) !== source.label) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${intent.sku} has conflicting published drop data.`,
      "Reconcile its current drop before moving it.",
    );
  }

  const availability = knownInventoryAvailability(row.availability);
  const onHand = nonnegativeInteger(row.on_hand);
  const reserved = nonnegativeInteger(row.reserved);
  const sold = nonnegativeInteger(row.sold);
  const returned = nonnegativeInteger(row.returned);
  const writeOff = nonnegativeInteger(row.write_off);
  if (
    !availability
    || onHand === null
    || reserved === null
    || sold === null
    || returned === null
    || writeOff === null
  ) {
    throw new StudioEngineError(
      "INVALID_TRANSITION",
      409,
      `${intent.sku} does not have complete inventory truth.`,
      "Review the piece in Operations before changing its drop.",
    );
  }
  const catalogueRevision = typeof row.catalogue_revision === "string"
    ? row.catalogue_revision.trim()
    : "";
  if (!catalogueRevision) {
    throw new StudioEngineError(
      "ENGINE_UNAVAILABLE",
      503,
      `${intent.sku} has no usable catalogue revision.`,
      "Reload the piece and try again.",
    );
  }

  const consequence = inventoryConsequence({
    sku: intent.sku,
    destination,
    publicationState,
    availability,
  });
  const membership: StudioPublishedCollectionMembership = {
    sku: intent.sku,
    publicationState,
    sourceCollection: collectionReference(source),
    destinationCollection: collectionReference(destination),
    inventory: {
      availability,
      onHand,
      reserved,
      sold,
      returned,
      writeOff,
      consequence,
    },
  };
  const expectedRevision = sha256(JSON.stringify({
    collectionRevision: revisionFor(scopes, intent),
    catalogue: {
      sku: intent.sku,
      collectionId: source.id,
      dropLabel: source.label,
      updatedAt: catalogueRevision,
      publicationState,
    },
    inventory: membership.inventory,
  }));

  return {
    catalogueRevision,
    preview: {
      intent,
      collection: destination,
      previousActive: scopes.find((scope) => scope.isCurrent) ?? null,
      changes: [
        { label: "Drop", before: source.label, after: destination.label },
        {
          label: "Shop",
          before: source.isCurrent ? "Current Shop" : "Past drop",
          after: destination.isCurrent ? "Current Shop" : "Past drop",
        },
        { label: "Inventory", before: availability, after: "Unchanged" },
      ],
      expectedRevision,
      title: `Move ${intent.sku} to ${destination.label}`,
      consequence,
      membership,
    },
  };
}

export async function previewStudioCollectionCommand(
  operator: StudioOperator,
  rawIntent: StudioCollectionIntent,
): Promise<StudioCollectionPreview> {
  rejectFixedCollectionMutation(rawIntent);
  requireCollectionCorrectionPermission(operator, rawIntent);
  const intent = normalizedIntent(rawIntent);
  if (intent.command === "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP") {
    return (await preparePublishedMembershipCorrection(intent)).preview;
  }
  const { scopes } = await listStudioCollections();
  const expectedRevision = revisionFor(scopes, intent);

  if (intent.command === "CREATE_COLLECTION") {
    if (scopes.some((scope) => scope.label.toLocaleLowerCase("en-NG") === intent.label.toLocaleLowerCase("en-NG"))) {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That drop name already exists.", "Choose a distinct name.");
    }
    const ordinal = Math.max(0, ...scopes.map((scope) => scope.ordinal)) + 1;
    const key = `drop-${String(ordinal).padStart(2, "0")}` as StudioCollectionScope["key"];
    const collection = draftScope({ key, label: intent.label, ordinal });
    return {
      intent,
      collection,
      previousActive: scopes.find((scope) => scope.isCurrent) ?? null,
      changes: [
        { label: "Drop", before: "Not created", after: intent.label },
        { label: "State", before: "—", after: "Draft" },
      ],
      expectedRevision,
      title: `Create ${intent.label}`,
      consequence: `${intent.label} will open as a private draft drop.`,
    };
  }

  const collection = requireCollection(scopes, intent.collectionId);
  requireVersion(collection, intent.expectedVersion);

  if (intent.command === "RENAME_COLLECTION") {
    if (collection.label === intent.label) {
      throw new StudioEngineError("INVALID_REQUEST", 409, `${collection.label} already has that name.`, "Choose another name.");
    }
    if (scopes.some((scope) => scope.id !== collection.id && scope.label.toLocaleLowerCase("en-NG") === intent.label.toLocaleLowerCase("en-NG"))) {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That drop name already exists.", "Choose a distinct name.");
    }
    return {
      intent,
      collection: { ...collection, label: intent.label, version: collection.version + 1 },
      previousActive: scopes.find((scope) => scope.isCurrent) ?? null,
      changes: [{ label: "Name", before: collection.label, after: intent.label }],
      expectedRevision,
      title: `Rename ${collection.label}`,
      consequence: `The drop will appear as ${intent.label} everywhere in Studio.`,
    };
  }

  if (intent.command === "ACTIVATE_COLLECTION") {
    if (collection.state !== "DRAFT") {
      throw new StudioEngineError("INVALID_TRANSITION", 409, `${collection.label} cannot go live from ${collection.state.toLowerCase()}.`, "Choose a draft drop.");
    }
    const previousActive = scopes.find((scope) => scope.isCurrent) ?? null;
    return {
      intent,
      collection: { ...collection, state: "ACTIVE", isCurrent: true, version: collection.version + 1 },
      previousActive,
      changes: [
        { label: "State", before: "Draft", after: "Live" },
        ...(previousActive ? [{ label: previousActive.label, before: "Live", after: "Archived" }] : []),
      ],
      expectedRevision,
      title: `Activate ${collection.label}`,
      consequence: `${collection.label} will become the Shop drop${previousActive ? ` and ${previousActive.label} will archive` : ""}.`,
    };
  }

  if (collection.state === "ARCHIVED") {
    throw new StudioEngineError("INVALID_TRANSITION", 409, `${collection.label} is already archived.`, "Choose another drop.");
  }
  return {
    intent,
    collection: { ...collection, state: "ARCHIVED", isCurrent: false, version: collection.version + 1 },
    previousActive: scopes.find((scope) => scope.isCurrent) ?? null,
    changes: [{ label: "State", before: collection.state === "ACTIVE" ? "Live" : "Draft", after: "Archived" }],
    expectedRevision,
    title: `Archive ${collection.label}`,
    consequence: `${collection.label} will leave active Studio work. Its history remains available.`,
  };
}

function jsonObject(value: unknown): DatabaseRow {
  if (value && typeof value === "object") return value as DatabaseRow;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return parsed && typeof parsed === "object" ? parsed as DatabaseRow : {};
    } catch {
      return {};
    }
  }
  return {};
}

function membershipFromState(state: DatabaseRow): StudioPublishedCollectionMembership | undefined {
  const membership = jsonObject(state.membership);
  const source = jsonObject(membership.sourceCollection);
  const destination = jsonObject(membership.destinationCollection);
  const inventory = jsonObject(membership.inventory);
  const availability = knownInventoryAvailability(inventory.availability);
  const onHand = nonnegativeInteger(inventory.onHand);
  const reserved = nonnegativeInteger(inventory.reserved);
  const sold = nonnegativeInteger(inventory.sold);
  const returned = nonnegativeInteger(inventory.returned);
  const writeOff = nonnegativeInteger(inventory.writeOff);
  if (
    typeof membership.sku !== "string"
    || (membership.publicationState !== "PUBLISHED" && membership.publicationState !== "ARCHIVED")
    || typeof source.id !== "string"
    || typeof source.key !== "string"
    || typeof source.label !== "string"
    || typeof destination.id !== "string"
    || typeof destination.key !== "string"
    || typeof destination.label !== "string"
    || !availability
    || onHand === null
    || reserved === null
    || sold === null
    || returned === null
    || writeOff === null
    || typeof inventory.consequence !== "string"
  ) return undefined;
  return membership as StudioPublishedCollectionMembership;
}

function receiptFromRow(row: DatabaseRow, replayed: boolean): StudioCollectionReceipt {
  const afterState = jsonObject(row.after_state);
  return {
    id: String(row.id),
    command: String(row.command) as StudioCollectionReceipt["command"],
    collection: collectionScope(afterState),
    consequence: String(row.consequence),
    nextRoute: String(row.next_route),
    occurredAt: nullableDate(row.created_at) ?? new Date().toISOString(),
    replayed,
    membership: membershipFromState(afterState),
  };
}

async function findReceipt(operator: StudioOperator, idempotencyKey: string) {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_collection_commands
    where operator_subject = ${operator.subject}
      and idempotency_key = ${idempotencyKey}
    limit 1
  `);
  return resultRows(result)[0] ?? null;
}

/** Read-only reconciliation lookup. Ownership must already be established by
 * the caller before it supplies the actor that originally crossed the command
 * fence. This function never creates or reapplies a collection command. */
export async function getStudioCollectionCommandReceipt(input: {
  idempotencyKey: string;
  operatorSubject: string;
}): Promise<StudioCollectionReceipt | null> {
  const result = await (await getStudioDb()).execute<DatabaseRow>(sql`
    select *
    from studio_collection_commands
    where operator_subject = ${input.operatorSubject}
      and idempotency_key = ${input.idempotencyKey}
    limit 1
  `);
  const row = resultRows(result)[0];
  return row ? receiptFromRow(row, true) : null;
}

function afterStateSql() {
  return sql`jsonb_build_object(
    'id', changed.id,
    'key', changed.key,
    'label', changed.label,
    'ordinal', changed.ordinal,
    'version', changed.version,
    'state', changed.state,
    'member_skus', coalesce((
      select jsonb_agg(catalogue.sku order by catalogue.sku)
      from shop_catalogue_items catalogue
      where catalogue.collection_id = changed.id
    ), '[]'::jsonb),
    'updated_at', changed.updated_at
  )`;
}

export async function applyStudioCollectionCommand(input: {
  operator: StudioOperator;
  intent: StudioCollectionIntent;
  expectedRevision: string;
  idempotencyKey: string;
}): Promise<StudioCollectionReceipt> {
  rejectFixedCollectionMutation(input.intent);
  requireCollectionCorrectionPermission(input.operator, input.intent);
  const intent = normalizedIntent(input.intent);
  const fingerprint = intentFingerprint(intent);
  const existing = await findReceipt(input.operator, input.idempotencyKey);
  if (existing) {
    if (String(existing.request_fingerprint) !== fingerprint) {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That confirmation was already used.", "Review the drop again.");
    }
    return receiptFromRow(existing, true);
  }

  const preparedMembership = intent.command === "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP"
    ? await preparePublishedMembershipCorrection(intent)
    : null;
  const preview = preparedMembership?.preview
    ?? await previewStudioCollectionCommand(input.operator, intent);
  if (preview.expectedRevision !== input.expectedRevision) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "Drops changed after this preview.", "Review the updated change and confirm again.");
  }

  const database = await getStudioDb();
  let result: unknown;

  if (intent.command === "CORRECT_PUBLISHED_COLLECTION_MEMBERSHIP") {
    const membership = preview.membership;
    if (!membership || !preparedMembership) {
      throw new StudioEngineError(
        "ENGINE_UNAVAILABLE",
        503,
        "Studio could not prepare that drop correction.",
        "Reload the piece and try again.",
      );
    }
    const source = membership.sourceCollection;
    const destination = membership.destinationCollection;
    const inventory = membership.inventory;
    const destinationMemberSkus = [...new Set([
      ...preview.collection.memberSkus,
      intent.sku,
    ])].sort((left, right) => left.localeCompare(right));
    const beforeState = {
      sku: intent.sku,
      collection: source,
      dropLabel: source.label,
      inventory,
    };
    const afterState = {
      id: destination.id,
      key: destination.key,
      label: destination.label,
      ordinal: destination.ordinal,
      version: destination.version,
      state: destination.state,
      member_skus: destinationMemberSkus,
      updated_at: preview.collection.updatedAt,
      membership,
    };
    result = await database.execute<DatabaseRow>(sql`
      with command_lock as (
        select pg_advisory_xact_lock(hashtext(${`studio_collection_membership:${intent.sku}`}))
      ), destination as (
        select collection.*
        from shop_collections collection cross join command_lock
        where collection.id = ${destination.id}::uuid
          and collection.key = ${destination.key}
          and collection.version = ${intent.expectedVersion}
          and collection.state = ${destination.state}::shop_collection_state
      ), before as (
        select catalogue.sku
        from shop_catalogue_items catalogue
        cross join command_lock
        join shop_collections source on source.id = catalogue.collection_id
        join shop_inventory inventory on inventory.sku = catalogue.sku
        join studio_catalogue_publications publication on publication.sku = catalogue.sku
        where catalogue.sku = ${intent.sku}
          and catalogue.collection_id = ${source.id}::uuid
          and source.key = ${source.key}
          and source.version = ${source.version}
          and source.state = ${source.state}::shop_collection_state
          and catalogue.drop_label = ${source.label}
          and catalogue.updated_at = ${preparedMembership.catalogueRevision}::timestamptz
          and publication.state = ${membership.publicationState}
          and inventory.availability = ${inventory.availability}::shop_catalogue_availability
          and inventory.on_hand = ${inventory.onHand}
          and inventory.reserved = ${inventory.reserved}
          and inventory.sold = ${inventory.sold}
          and inventory.returned = ${inventory.returned}
          and inventory.write_off = ${inventory.writeOff}
        for update of catalogue
      ), changed as (
        update shop_catalogue_items catalogue
        set collection_id = destination.id,
            drop_label = destination.label,
            updated_at = now()
        from before, destination
        where catalogue.sku = before.sku
        returning catalogue.sku
      ), command as (
        insert into studio_collection_commands (
          operator_subject, idempotency_key, request_fingerprint, command,
          collection_id, collection_key, before_state, after_state,
          consequence, next_route, created_at
        )
        select
          ${input.operator.subject}, ${input.idempotencyKey}, ${fingerprint}, ${intent.command},
          destination.id, destination.key, ${JSON.stringify(beforeState)}::jsonb,
          ${JSON.stringify(afterState)}::jsonb, ${preview.consequence},
          ${`/studio/wardrobe?collection=${encodeURIComponent(destination.key)}`}, now()
        from changed cross join destination
        returning *
      )
      select * from command
    `);
  } else if (intent.command === "CREATE_COLLECTION") {
    const { collection } = preview;
    result = await database.execute<DatabaseRow>(sql`
      with lifecycle_lock as (
        select pg_advisory_xact_lock(hashtext('studio_collection_lifecycle'))
      ), changed as (
        insert into shop_collections (key, label, ordinal, version, state, created_at, updated_at)
        select ${collection.key}, ${collection.label}, ${collection.ordinal}, 1, 'DRAFT', now(), now()
        from lifecycle_lock
        where (select coalesce(max(ordinal), 0) + 1 from shop_collections) = ${collection.ordinal}
          and not exists (select 1 from shop_collections where lower(label) = lower(${collection.label}))
        returning *
      ), command as (
        insert into studio_collection_commands (
          operator_subject, idempotency_key, request_fingerprint, command,
          collection_id, collection_key, before_state, after_state,
          consequence, next_route, created_at
        )
        select
          ${input.operator.subject}, ${input.idempotencyKey}, ${fingerprint}, ${intent.command},
          changed.id, changed.key, '{}'::jsonb, ${afterStateSql()},
          ${`${collection.label} created.`}, ${collection.nextAction}, now()
        from changed
        returning *
      )
      select * from command
    `);
  } else if (intent.command === "RENAME_COLLECTION") {
    result = await database.execute<DatabaseRow>(sql`
      with before as (
        select * from shop_collections
        where id = ${intent.collectionId}::uuid and version = ${intent.expectedVersion}
      ), changed as (
        update shop_collections
        set label = ${intent.label}, version = version + 1, updated_at = now()
        where id = ${intent.collectionId}::uuid
          and version = ${intent.expectedVersion}
          and not exists (select 1 from shop_collections where id <> ${intent.collectionId}::uuid and lower(label) = lower(${intent.label}))
        returning *
      ), command as (
        insert into studio_collection_commands (
          operator_subject, idempotency_key, request_fingerprint, command,
          collection_id, collection_key, before_state, after_state,
          consequence, next_route, created_at
        )
        select
          ${input.operator.subject}, ${input.idempotencyKey}, ${fingerprint}, ${intent.command},
          changed.id, changed.key, to_jsonb(before), ${afterStateSql()},
          ${`${intent.label} renamed.`}, ${preview.collection.nextAction}, now()
        from changed inner join before on before.id = changed.id
        returning *
      )
      select * from command
    `);
  } else if (intent.command === "ACTIVATE_COLLECTION") {
    result = await database.execute<DatabaseRow>(sql`
      with lifecycle_lock as (
        select pg_advisory_xact_lock(hashtext('studio_collection_lifecycle'))
      ), before as (
        select collection.*
        from shop_collections collection cross join lifecycle_lock
        where collection.id = ${intent.collectionId}::uuid
          and collection.version = ${intent.expectedVersion}
          and collection.state = 'DRAFT'
      ), archived as (
        update shop_collections
        set state = 'ARCHIVED', archived_at = now(), version = version + 1, updated_at = now()
        where state = 'ACTIVE' and id <> ${intent.collectionId}::uuid
          and exists (select 1 from before)
        returning id
      ), changed as (
        update shop_collections
        set state = 'ACTIVE', activated_at = now(), archived_at = null,
            version = version + 1, updated_at = now()
        where id = ${intent.collectionId}::uuid
          and version = ${intent.expectedVersion}
          and state = 'DRAFT'
          and (select count(*) from archived) >= 0
        returning *
      ), command as (
        insert into studio_collection_commands (
          operator_subject, idempotency_key, request_fingerprint, command,
          collection_id, collection_key, before_state, after_state,
          consequence, next_route, created_at
        )
        select
          ${input.operator.subject}, ${input.idempotencyKey}, ${fingerprint}, ${intent.command},
          changed.id, changed.key, to_jsonb(before), ${afterStateSql()},
          ${`${preview.collection.label} is now live.`}, ${preview.collection.nextAction}, now()
        from changed inner join before on before.id = changed.id
        returning *
      )
      select * from command
    `);
  } else {
    result = await database.execute<DatabaseRow>(sql`
      with before as (
        select * from shop_collections
        where id = ${intent.collectionId}::uuid
          and version = ${intent.expectedVersion}
          and state <> 'ARCHIVED'
      ), changed as (
        update shop_collections
        set state = 'ARCHIVED', archived_at = now(), version = version + 1, updated_at = now()
        where id = ${intent.collectionId}::uuid
          and version = ${intent.expectedVersion}
          and state <> 'ARCHIVED'
        returning *
      ), command as (
        insert into studio_collection_commands (
          operator_subject, idempotency_key, request_fingerprint, command,
          collection_id, collection_key, before_state, after_state,
          consequence, next_route, created_at
        )
        select
          ${input.operator.subject}, ${input.idempotencyKey}, ${fingerprint}, ${intent.command},
          changed.id, changed.key, to_jsonb(before), ${afterStateSql()},
          ${`${preview.collection.label} archived.`}, ${preview.collection.nextAction}, now()
        from changed inner join before on before.id = changed.id
        returning *
      )
      select * from command
    `);
  }

  const row = resultRows(result)[0];
  if (!row) {
    const replay = await findReceipt(input.operator, input.idempotencyKey);
    if (replay) {
      if (String(replay.request_fingerprint) !== fingerprint) {
        throw new StudioEngineError("INVALID_REQUEST", 409, "That confirmation was already used.", "Review the drop again.");
      }
      return receiptFromRow(replay, true);
    }
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "Drops changed before this confirmation completed.",
      "Review the updated change and try again.",
    );
  }
  return receiptFromRow(row, false);
}
