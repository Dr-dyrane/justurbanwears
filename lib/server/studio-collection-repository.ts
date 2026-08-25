import { sql } from "drizzle-orm";
import { getStudioDb } from "../../db/shop-postgres";
import type { StudioCollectionScope } from "../studio/application/contracts";
import type {
  StudioCollectionIntent,
  StudioCollectionPreview,
  StudioCollectionReceipt,
} from "../studio/collections/contracts";
import { StudioEngineError } from "../studio/engine/errors";
import { sha256 } from "../studio/engine/fingerprint";
import type { StudioOperator } from "./studio-operator";

type DatabaseRow = Record<string, unknown>;

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
    collections: scopes.map(({ id, key, label, ordinal, state, version }) => ({
      id,
      key,
      label,
      ordinal,
      state,
      version,
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

export async function previewStudioCollectionCommand(
  _operator: StudioOperator,
  rawIntent: StudioCollectionIntent,
): Promise<StudioCollectionPreview> {
  const intent = normalizedIntent(rawIntent);
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

function receiptFromRow(row: DatabaseRow, replayed: boolean): StudioCollectionReceipt {
  return {
    id: String(row.id),
    command: String(row.command) as StudioCollectionReceipt["command"],
    collection: collectionScope(jsonObject(row.after_state)),
    consequence: String(row.consequence),
    nextRoute: String(row.next_route),
    occurredAt: nullableDate(row.created_at) ?? new Date().toISOString(),
    replayed,
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

function afterStateSql() {
  return sql`jsonb_build_object(
    'id', changed.id,
    'key', changed.key,
    'label', changed.label,
    'ordinal', changed.ordinal,
    'version', changed.version,
    'state', changed.state,
    'updated_at', changed.updated_at
  )`;
}

export async function applyStudioCollectionCommand(input: {
  operator: StudioOperator;
  intent: StudioCollectionIntent;
  expectedRevision: string;
  idempotencyKey: string;
}): Promise<StudioCollectionReceipt> {
  const intent = normalizedIntent(input.intent);
  const fingerprint = intentFingerprint(intent);
  const existing = await findReceipt(input.operator, input.idempotencyKey);
  if (existing) {
    if (String(existing.request_fingerprint) !== fingerprint) {
      throw new StudioEngineError("INVALID_REQUEST", 409, "That confirmation was already used.", "Review the drop again.");
    }
    return receiptFromRow(existing, true);
  }

  const preview = await previewStudioCollectionCommand(input.operator, intent);
  if (preview.expectedRevision !== input.expectedRevision) {
    throw new StudioEngineError("VERSION_CONFLICT", 409, "Drops changed after this preview.", "Review the updated change and confirm again.");
  }

  const database = await getStudioDb();
  let result: unknown;

  if (intent.command === "CREATE_COLLECTION") {
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
    throw new StudioEngineError(
      "VERSION_CONFLICT",
      409,
      "Drops changed before this confirmation completed.",
      "Review the updated change and try again.",
    );
  }
  return receiptFromRow(row, false);
}
