import { sql } from "drizzle-orm";
import { getShopDb } from "../../../db/shop-postgres";
import type {
  AuthorizePaymentEvidenceCommand,
  CompletePaymentEvidenceCommand,
  CreateAssistedShopOrderCommand,
  CreateShopOrderCommand,
  MutateCustomerOrderCommand,
  PaymentEvidenceAuthorization,
  RequestShopReturnCommand,
  ShopNotificationOutboxMessage,
  ShopCustomerActor,
  ShopOrderListQuery,
  ShopOrderPage,
  ShopOrderStore,
  ShopOperatorTransitionReceipt,
  ShopServerOrder,
  TransitionShopReturnCommand,
  TransitionShopOrderCommand,
} from "./types";
import { ShopOrderError } from "./types";
import { trackingUrlForOrder } from "./commerce-guidance";

interface DocumentRow extends Record<string, unknown> {
  document: unknown;
}

interface AuthorizationRow extends Record<string, unknown> {
  authorization: unknown;
}

interface OutboxRow extends Record<string, unknown> {
  message: unknown;
}

interface RecipientRow extends Record<string, unknown> {
  email: unknown;
  display_name: unknown;
}

interface ReferenceRow extends Record<string, unknown> {
  reference: unknown;
}

interface ExpiringOrderRow extends Record<string, unknown> {
  reference: unknown;
  version: unknown;
}

interface OperatorTransitionReceiptRow extends Record<string, unknown> {
  receipt_id: unknown;
  order_id: unknown;
  reference: unknown;
  actor_subject: unknown;
  metadata: unknown;
  occurred_at: unknown;
}

function parseOperatorTransitionReceipt(
  row: OperatorTransitionReceiptRow | undefined,
): ShopOperatorTransitionReceipt | null {
  if (!row || !row.metadata || typeof row.metadata !== "object" || Array.isArray(row.metadata)) return null;
  const metadata = row.metadata as Record<string, unknown>;
  if (
    typeof row.receipt_id !== "string"
    || typeof row.order_id !== "string"
    || typeof row.reference !== "string"
    || typeof row.actor_subject !== "string"
    || typeof row.occurred_at !== "string"
    || metadata.studioCommandVersion !== 1
    || (metadata.studioCommandKind !== "ORDER" && metadata.studioCommandKind !== "RETURN")
    || !Number.isInteger(metadata.studioCommandExpectedVersion)
    || !Number.isInteger(metadata.studioCommandResultingVersion)
    || typeof metadata.studioCommandDimension !== "string"
    || typeof metadata.studioCommandTarget !== "string"
    || typeof metadata.studioCommandIdempotencyKey !== "string"
    || typeof metadata.studioCommandRequestFingerprint !== "string"
  ) return null;
  return {
    version: 1,
    receiptId: row.receipt_id,
    commandKind: metadata.studioCommandKind,
    orderId: row.order_id,
    reference: row.reference,
    actorSubject: row.actor_subject,
    expectedVersion: metadata.studioCommandExpectedVersion as number,
    resultingVersion: metadata.studioCommandResultingVersion as number,
    dimension: metadata.studioCommandDimension as ShopOperatorTransitionReceipt["dimension"],
    target: metadata.studioCommandTarget as ShopOperatorTransitionReceipt["target"],
    idempotencyKey: metadata.studioCommandIdempotencyKey,
    requestFingerprint: metadata.studioCommandRequestFingerprint,
    occurredAt: row.occurred_at,
  };
}

function persistenceError(error: unknown): ShopOrderError {
  if (error instanceof ShopOrderError) return error;
  const message = error instanceof Error ? error.message : "";
  const mappings = [
    ["SHOP_IDEMPOTENCY_MISMATCH", "IDEMPOTENCY_MISMATCH", "The idempotency key was reused for a different request."],
    ["SHOP_INVENTORY_UNAVAILABLE", "INVENTORY_UNAVAILABLE", "One or more pieces are no longer available."],
    ["SHOP_VERSION_CONFLICT", "VERSION_CONFLICT", "The order changed before this command was applied."],
    ["SHOP_INVALID_TRANSITION", "INVALID_TRANSITION", "The requested order transition is not allowed."],
    ["SHOP_RETURN_WINDOW_CLOSED", "RETURN_WINDOW_CLOSED", "The return request window has closed."],
    ["SHOP_EVIDENCE_AUTHORIZATION_EXPIRED", "EVIDENCE_AUTHORIZATION_EXPIRED", "The payment-evidence authorization has expired."],
    ["SHOP_EVIDENCE_MISMATCH", "EVIDENCE_MISMATCH", "The payment evidence does not match its authorization."],
    ["SHOP_FORBIDDEN", "FORBIDDEN", "The authenticated actor does not own this order."],
    ["SHOP_NOT_FOUND", "NOT_FOUND", "The order was not found."],
    ["SHOP_INVALID_REQUEST", "INVALID_REQUEST", "The server rejected the command contract."],
  ] as const;
  for (const [marker, code, publicMessage] of mappings) {
    if (message.includes(marker)) return new ShopOrderError(code, publicMessage, { cause: error });
  }
  return new ShopOrderError(
    "PERSISTENCE_UNAVAILABLE",
    "The order service is temporarily unavailable.",
    { cause: error },
  );
}

function parseOrderDocument(value: unknown, includePrivate = false): ShopServerOrder {
  if (
    !value
    || typeof value !== "object"
    || !("reference" in value)
    || typeof value.reference !== "string"
    || !("version" in value)
    || !Number.isInteger(value.version)
    || !("lines" in value)
    || !Array.isArray(value.lines)
    || !("events" in value)
    || !Array.isArray(value.events)
    || !("allowedTransitions" in value)
    || !Array.isArray(value.allowedTransitions)
    || !("fundsConfirmationStatus" in value)
    || (value.fundsConfirmationStatus !== "UNCONFIRMED" && value.fundsConfirmationStatus !== "CONFIRMED")
    || !("fulfillmentFacts" in value)
    || !("allowedReturnTransitions" in value)
    || !Array.isArray(value.allowedReturnTransitions)
    || !("canRequestReturn" in value)
    || typeof value.canRequestReturn !== "boolean"
  ) {
    throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The database returned an invalid order document.");
  }
  const order = value as unknown as ShopServerOrder;
  const orderCreated = order.events.find((event) => event.eventType === "ORDER_CREATED");
  const eventSource = orderCreated?.metadata?.source;
  order.source = eventSource === "PHONE" || eventSource === "DM" || eventSource === "IN_PERSON"
    ? eventSource
    : "ONLINE";
  order.fulfillmentFacts.trackingUrl = trackingUrlForOrder(order);
  if (order.return) {
    if (!Array.isArray(order.return.items)) {
      order.return.items = order.lines.map((line) => ({
        orderItemId: null,
        sku: line.sku,
        name: line.name,
        unitPrice: line.unitPrice,
        refundCapAmount: line.unitPrice,
        disposition: order.return?.disposition ?? null,
      }));
    } else {
      order.return.items = order.return.items.map((item) => ({
        ...item,
        orderItemId: typeof item.orderItemId === "string" ? item.orderItemId : null,
        refundCapAmount: typeof item.refundCapAmount === "number"
          && Number.isSafeInteger(item.refundCapAmount)
          && item.refundCapAmount >= 0
          ? item.refundCapAmount
          : item.unitPrice,
      }));
    }
    order.return.correctionCount = Number.isInteger(order.return.correctionCount)
      ? order.return.correctionCount
      : order.events.filter((event) => event.eventType === "RETURN_CORRECTED").length;
  }
  const recoveryEvents = order.events.filter((event) => event.eventType.startsWith("CANCELLATION_REFUND_"));
  const recoveryRequested = recoveryEvents[0];
  const recoveryLatest = recoveryEvents.at(-1);
  if (recoveryRequested && recoveryLatest) {
    const status = recoveryLatest.eventType.endsWith("COMPLETED")
      ? "COMPLETED"
      : recoveryLatest.eventType.endsWith("FAILED")
        ? "FAILED"
        : "PENDING";
    order.cancellationRecovery = {
      status,
      reason: recoveryRequested.note ?? "Customer requested cancellation.",
      requestedAt: recoveryRequested.occurredAt,
      updatedAt: recoveryLatest.occurredAt,
      refundReference: typeof recoveryLatest.metadata?.refundReference === "string"
        ? recoveryLatest.metadata.refundReference
        : null,
      refundAmount: Number.isSafeInteger(recoveryLatest.metadata?.refundAmount)
        ? Number(recoveryLatest.metadata?.refundAmount)
        : null,
      refundCurrency: recoveryLatest.metadata?.refundCurrency === "NGN" ? "NGN" : null,
    };
  } else {
    order.cancellationRecovery = null;
  }
  order.canRequestPaidCancellation = !includePrivate
    && order.lifecycleStatus === "ACTIVE"
    && order.fundsConfirmationStatus === "CONFIRMED"
    && order.fulfillmentStatus !== "IN_TRANSIT"
    && order.fulfillmentStatus !== "DELIVERED"
    && !order.cancellationRecovery;
  if (order.fundsConfirmation) {
    const audit = [...order.events].reverse().find((event) => (
      event.eventType === "FUNDS_CONFIRMATION_CONFIRMED"
      || event.eventType === "FUNDS_CONFIRMATION_CORRECTED"
    ));
    const paidAmount = audit?.metadata?.paidAmount;
    const paidCurrency = audit?.metadata?.paidCurrency;
    order.fundsConfirmation.paidAmount = Number.isSafeInteger(paidAmount) && Number(paidAmount) > 0
      ? Number(paidAmount)
      : null;
    order.fundsConfirmation.paidCurrency = paidCurrency === "NGN" ? "NGN" : null;
    order.fundsConfirmation.updatedAt = audit?.occurredAt ?? order.fundsConfirmation.confirmedAt;
  }
  if (
    includePrivate
    && order.fundsConfirmationStatus === "CONFIRMED"
    && !order.allowedTransitions.some((transition) => (
      transition.dimension === "FUNDS_CONFIRMATION" && transition.target === "CORRECTED"
    ))
  ) {
    order.allowedTransitions.push({ dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" });
  }
  if (includePrivate && order.cancellationRecovery?.status !== "COMPLETED") {
    if (order.cancellationRecovery?.status === "PENDING") {
      order.allowedTransitions = order.allowedTransitions.filter((transition) => (
        transition.dimension === "FUNDS_CONFIRMATION"
      ));
      order.allowedTransitions.push(
        { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
        { dimension: "CANCELLATION_REFUND", target: "FAILED" },
      );
    } else if (order.cancellationRecovery?.status === "FAILED") {
      order.allowedTransitions = order.allowedTransitions.filter((transition) => (
        transition.dimension === "FUNDS_CONFIRMATION"
      ));
      order.allowedTransitions.push({ dimension: "CANCELLATION_REFUND", target: "PENDING" });
    }
  }
  if (
    includePrivate
    && order.lifecycleStatus === "ACTIVE"
    && order.fulfillment.kind === "PICKUP"
    && order.fundsConfirmationStatus === "CONFIRMED"
    && order.fulfillmentStatus === "READY_FOR_HANDOFF"
    && !order.cancellationRecovery
  ) {
    if (!order.allowedTransitions.some((transition) => transition.dimension === "PICKUP")) {
      order.allowedTransitions.push({ dimension: "PICKUP", target: "SCHEDULED" });
    }
    if (!order.fulfillmentFacts.pickupAppointment) {
      order.allowedTransitions = order.allowedTransitions.filter((transition) => !(
        transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED"
      ));
    }
  }
  return order;
}

export function operatorOrdersReadQuery(limit: number) {
  return sql`
    select shop_order_document_v3(orders.id, true) as document
    from shop_orders as orders
    order by orders.saved_at desc
    limit ${Math.min(Math.max(limit, 1), 100)}
  `;
}

export function mapOperatorOrderRows(rows: readonly Record<string, unknown>[]): ShopServerOrder[] {
  return rows.map((row) => parseOrderDocument(row.document, true));
}

function parseAuthorization(value: unknown): PaymentEvidenceAuthorization {
  if (
    !value
    || typeof value !== "object"
    || !("id" in value)
    || typeof value.id !== "string"
    || !("orderReference" in value)
    || typeof value.orderReference !== "string"
    || !("sha256" in value)
    || typeof value.sha256 !== "string"
  ) {
    throw new ShopOrderError(
      "PERSISTENCE_UNAVAILABLE",
      "The database returned an invalid payment-evidence authorization.",
    );
  }
  return value as unknown as PaymentEvidenceAuthorization;
}

function parseOutboxMessage(value: unknown): ShopNotificationOutboxMessage {
  if (
    !value
    || typeof value !== "object"
    || !("id" in value)
    || typeof value.id !== "string"
    || !("dedupeKey" in value)
    || typeof value.dedupeKey !== "string"
  ) {
    throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The database returned an invalid outbox message.");
  }
  return {
    ...(value as Omit<ShopNotificationOutboxMessage, "recipientEmail" | "recipientName">),
    recipientEmail: "",
    recipientName: null,
  };
}

async function executeDocument(query: ReturnType<typeof sql>, includePrivate = false): Promise<ShopServerOrder> {
  try {
    const result = await getShopDb().execute<DocumentRow>(query);
    if (result.rows.length !== 1) {
      throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The order command returned no document.");
    }
    return parseOrderDocument(result.rows[0].document, includePrivate);
  } catch (error) {
    throw persistenceError(error);
  }
}

export class PostgresShopOrderStore implements ShopOrderStore {
  async claimCustomerIdentity(actor: ShopCustomerActor, now: Date): Promise<void> {
    try {
      await getShopDb().execute(sql`
        select shop_claim_assisted_customer_v3(
          ${actor.subject},
          ${actor.email ?? null},
          ${actor.displayName ?? null},
          ${now.toISOString()}::timestamptz
        )
      `);
    } catch (error) {
      throw persistenceError(error);
    }
  }

  createOrder(command: CreateShopOrderCommand): Promise<ShopServerOrder> {
    const { actor, intent } = command;
    return executeDocument(sql`
      select shop_create_order_v2(
        ${actor.subject},
        ${actor.email ?? null},
        ${actor.displayName ?? null},
        ${intent.idempotencyKey},
        ${command.requestFingerprint},
        ${JSON.stringify(intent.lines)}::jsonb,
        ${JSON.stringify(intent.contact)}::jsonb,
        ${JSON.stringify(intent.fulfillment)}::jsonb,
        ${command.now.toISOString()}::timestamptz,
        ${command.reservationExpiresAt.toISOString()}::timestamptz
      ) as document
    `);
  }

  createAssistedOrder(command: CreateAssistedShopOrderCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_create_assisted_order_v4(
        ${command.actor.subject},
        ${command.actor.displayName ?? command.actor.email ?? "Studio operator"},
        ${command.source},
        ${command.sourceNote},
        ${command.intent.idempotencyKey},
        ${command.requestFingerprint},
        ${JSON.stringify(command.intent.lines)}::jsonb,
        ${JSON.stringify(command.intent.contact)}::jsonb,
        ${JSON.stringify(command.intent.fulfillment)}::jsonb,
        ${command.now.toISOString()}::timestamptz,
        ${command.reservationExpiresAt.toISOString()}::timestamptz
      ) as document
    `, true);
  }

  async listCustomerOrders(authSubject: string, limit: number): Promise<ShopServerOrder[]> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v3(orders.id, false) as document
        from shop_orders as orders
        inner join shop_customers as customers on customers.id = orders.customer_id
        where customers.auth_subject = ${authSubject}
        order by orders.saved_at desc
        limit ${limit}
      `);
      return result.rows.map((row) => parseOrderDocument(row.document, false));
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async pageCustomerOrders(authSubject: string, query: ShopOrderListQuery): Promise<ShopOrderPage> {
    try {
      const offset = (query.page - 1) * query.limit;
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v3(orders.id, false) as document
        from shop_orders as orders
        inner join shop_customers as customers on customers.id = orders.customer_id
        where customers.auth_subject = ${authSubject}
          and (
            ${query.search} = ''
            or orders.reference ilike ${`%${query.search}%`}
            or orders.contact_name ilike ${`%${query.search}%`}
            or exists (
              select 1 from shop_order_items as items
              where items.order_id = orders.id
                and (items.product_name ilike ${`%${query.search}%`} or items.sku ilike ${`%${query.search}%`})
            )
          )
          and (
            ${query.filter} = 'ALL'
            or (${query.filter} = 'ACTIVE' and orders.lifecycle_status = 'ACTIVE')
            or (${query.filter} = 'COMPLETED' and orders.lifecycle_status = 'COMPLETED')
            or (${query.filter} = 'CANCELLED' and orders.lifecycle_status in ('CANCELLED', 'EXPIRED'))
            or (${query.filter} = 'RETURNS' and exists (
              select 1 from shop_order_returns as returns where returns.order_id = orders.id
            ))
            or (${query.filter} = 'NEEDS_ACTION' and orders.lifecycle_status = 'ACTIVE')
          )
        order by orders.saved_at desc, orders.reference desc
        offset ${offset}
        limit ${query.limit + 1}
      `);
      const documents = result.rows.map((row) => parseOrderDocument(row.document, false));
      return {
        orders: documents.slice(0, query.limit),
        page: query.page,
        nextPage: documents.length > query.limit ? query.page + 1 : null,
      };
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async getCustomerOrder(authSubject: string, reference: string): Promise<ShopServerOrder | null> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v3(orders.id, false) as document
        from shop_orders as orders
        inner join shop_customers as customers on customers.id = orders.customer_id
        where customers.auth_subject = ${authSubject}
          and orders.reference = ${reference}
        limit 1
      `);
      return result.rows[0] ? parseOrderDocument(result.rows[0].document, false) : null;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async mutateCustomerOrder(command: MutateCustomerOrderCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_mutate_customer_order_v3(
        ${command.reference},
        ${command.actor.subject},
        ${command.expectedVersion},
        ${command.mutation.action},
        ${JSON.stringify(command.mutation)}::jsonb,
        ${command.now.toISOString()}::timestamptz
      ) as document
    `, false);
  }

  async expireReservations(now: Date, limit: number): Promise<number> {
    try {
      const database = getShopDb();
      const candidates = await database.execute<ExpiringOrderRow>(sql`
        select reference, version
        from shop_orders
        where lifecycle_status = 'ACTIVE'
          and fulfillment_status = 'NOT_STARTED'
          and funds_confirmation_status = 'UNCONFIRMED'
          and reservation_expires_at is not null
          and reservation_expires_at <= ${now.toISOString()}::timestamptz
        order by reservation_expires_at, id
        limit ${Math.min(Math.max(limit, 1), 100)}
      `);
      let expired = 0;
      for (const candidate of candidates.rows) {
        if (typeof candidate.reference !== "string" || !Number.isInteger(candidate.version)) continue;
        const result = await database.execute<ReferenceRow>(sql`
          with candidate as materialized (
            select orders.id, orders.reference, orders.customer_id, orders.version,
              orders.payment_review_status, orders.funds_confirmation_status, orders.fulfillment_status
            from shop_orders as orders
            where orders.reference = ${candidate.reference}
              and orders.version = ${candidate.version as number}
              and orders.lifecycle_status = 'ACTIVE'
              and orders.funds_confirmation_status = 'UNCONFIRMED'
              and orders.fulfillment_status = 'NOT_STARTED'
              and orders.reservation_expires_at <= ${now.toISOString()}::timestamptz
            for update of orders
          ), released as materialized (
            select shop_release_order_inventory_v2(candidate.id, ${now.toISOString()}::timestamptz)
            from candidate
          ), updated as (
            update shop_orders as orders
            set lifecycle_status = 'EXPIRED', status = 'CANCELLED',
              expired_at = ${now.toISOString()}::timestamptz,
              version = orders.version + 1,
              updated_at = ${now.toISOString()}::timestamptz
            from candidate, released
            where orders.id = candidate.id
            returning orders.id, orders.reference, orders.customer_id,
              candidate.payment_review_status, candidate.funds_confirmation_status, candidate.fulfillment_status
          ), event_record as (
            insert into shop_order_events (
              order_id, event_type, actor_kind, actor_subject, visibility,
              lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
              note, metadata, occurred_at
            )
            select updated.id, 'LIFECYCLE_EXPIRED', 'SYSTEM', 'system:reservation-expiry', 'CUSTOMER',
              'EXPIRED', updated.payment_review_status, updated.funds_confirmation_status,
              updated.fulfillment_status, 'The reservation expired and the pieces were released.',
              jsonb_build_object('previous', 'ACTIVE', 'releasedInventory', true),
              ${now.toISOString()}::timestamptz
            from updated
            returning order_id
          ), notification as materialized (
            select shop_enqueue_notification_v2(
              updated.id, updated.customer_id, 'LIFECYCLE_EXPIRED',
              'order:' || updated.id::text || ':system-expired',
              jsonb_build_object('orderReference', updated.reference, 'target', 'EXPIRED'),
              ${now.toISOString()}::timestamptz
            )
            from updated
          )
          select updated.reference
          from updated
          inner join event_record on event_record.order_id = updated.id
          cross join notification
        `);
        if (result.rows.length) expired += 1;
      }
      return expired;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async listOperatorOrders(limit: number): Promise<ShopServerOrder[]> {
    try {
      const result = await getShopDb().execute<DocumentRow>(operatorOrdersReadQuery(limit));
      return mapOperatorOrderRows(result.rows);
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async pageOperatorOrders(query: ShopOrderListQuery): Promise<ShopOrderPage> {
    try {
      const offset = (query.page - 1) * query.limit;
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v3(orders.id, true) as document
        from shop_orders as orders
        where (
            ${query.search} = ''
            or orders.reference ilike ${`%${query.search}%`}
            or orders.contact_name ilike ${`%${query.search}%`}
            or orders.contact_email ilike ${`%${query.search}%`}
            or orders.contact_phone ilike ${`%${query.search}%`}
            or exists (
              select 1 from shop_order_items as items
              where items.order_id = orders.id
                and (items.product_name ilike ${`%${query.search}%`} or items.sku ilike ${`%${query.search}%`})
            )
          )
          and (
            ${query.filter} = 'ALL'
            or (${query.filter} = 'ACTIVE' and orders.lifecycle_status = 'ACTIVE')
            or (${query.filter} = 'COMPLETED' and orders.lifecycle_status = 'COMPLETED')
            or (${query.filter} = 'CANCELLED' and orders.lifecycle_status in ('CANCELLED', 'EXPIRED'))
            or (${query.filter} = 'RETURNS' and exists (
              select 1 from shop_order_returns as returns where returns.order_id = orders.id
            ))
            or (${query.filter} = 'NEEDS_ACTION' and (
              (orders.lifecycle_status = 'ACTIVE' and (
                orders.payment_review_status in ('EVIDENCE_RECEIVED', 'UNDER_REVIEW', 'REVIEW_APPROVED')
                or orders.fulfillment_status in ('QUALITY_CHECK', 'READY_FOR_HANDOFF', 'IN_TRANSIT')
              ))
              or exists (
                select 1 from shop_order_returns as returns
                where returns.order_id = orders.id and returns.status not in ('REJECTED', 'RESOLVED')
              )
              or exists (
                select 1 from shop_order_recoveries as recoveries
                where recoveries.order_id = orders.id and recoveries.status in ('PENDING', 'FAILED')
              )
            ))
          )
        order by orders.saved_at desc, orders.reference desc
        offset ${offset}
        limit ${query.limit + 1}
      `);
      const documents = result.rows.map((row) => parseOrderDocument(row.document, true));
      return {
        orders: documents.slice(0, query.limit),
        page: query.page,
        nextPage: documents.length > query.limit ? query.page + 1 : null,
      };
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async getOperatorOrder(reference: string): Promise<ShopServerOrder | null> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v3(orders.id, true) as document
        from shop_orders as orders
        where orders.reference = ${reference}
        limit 1
      `);
      return result.rows[0] ? parseOrderDocument(result.rows[0].document, true) : null;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async getOperatorTransitionReceipt(
    actorSubject: string,
    reference: string,
    idempotencyKey: string,
  ): Promise<ShopOperatorTransitionReceipt | null> {
    try {
      const result = await getShopDb().execute<OperatorTransitionReceiptRow>(sql`
        select
          events.id::text as receipt_id,
          orders.id::text as order_id,
          orders.reference,
          events.actor_subject,
          events.metadata,
          events.occurred_at::text as occurred_at
        from shop_order_events as events
        inner join shop_orders as orders on orders.id = events.order_id
        where orders.reference = ${reference}
          and events.actor_kind = 'OPERATOR'
          and events.actor_subject = ${actorSubject}
          and events.metadata->>'studioCommandIdempotencyKey' = ${idempotencyKey}
        order by events.occurred_at desc, events.id desc
        limit 1
      `);
      return parseOperatorTransitionReceipt(result.rows[0]);
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async transitionOrder(command: TransitionShopOrderCommand): Promise<ShopServerOrder> {
    if (command.transition.dimension === "PICKUP") {
      if (command.details?.kind !== "PICKUP_SCHEDULE") {
        throw new ShopOrderError("INVALID_REQUEST", "A pickup time is required.");
      }
      return executeDocument(sql`
        select shop_transition_order_command_v4(
          ${command.reference},
          ${command.actor.subject},
          ${command.actor.displayName ?? command.actor.email ?? "Studio operator"},
          ${command.expectedVersion},
          ${command.idempotencyKey},
          ${command.requestFingerprint},
          ${command.transition.dimension},
          ${command.transition.target},
          ${JSON.stringify(command.details)}::jsonb,
          ${command.note},
          ${command.returnEligibleUntil?.toISOString() ?? null}::timestamptz,
          ${command.now.toISOString()}::timestamptz
        ) as document
      `, true);
    }

    if (command.transition.dimension === "CANCELLATION_REFUND") {
      const details = command.details?.kind === "CANCELLATION_REFUND" ? command.details : null;
      return executeDocument(sql`
        select shop_transition_order_command_v4(
          ${command.reference},
          ${command.actor.subject},
          ${command.actor.displayName ?? command.actor.email ?? "Studio operator"},
          ${command.expectedVersion},
          ${command.idempotencyKey},
          ${command.requestFingerprint},
          ${command.transition.dimension},
          ${command.transition.target},
          ${details ? JSON.stringify(details) : null}::jsonb,
          ${command.note},
          ${command.returnEligibleUntil?.toISOString() ?? null}::timestamptz,
          ${command.now.toISOString()}::timestamptz
        ) as document
      `, true);
    }

    if (command.transition.dimension !== "FUNDS_CONFIRMATION") {
      return executeDocument(sql`
        select shop_transition_order_command_v4(
          ${command.reference},
          ${command.actor.subject},
          ${command.actor.displayName ?? command.actor.email ?? "Studio operator"},
          ${command.expectedVersion},
          ${command.idempotencyKey},
          ${command.requestFingerprint},
          ${command.transition.dimension},
          ${command.transition.target},
          ${command.details ? JSON.stringify(command.details) : null}::jsonb,
          ${command.note},
          ${command.returnEligibleUntil?.toISOString() ?? null}::timestamptz,
          ${command.now.toISOString()}::timestamptz
        ) as document
      `, true);
    }

    if (command.details?.kind !== "FUNDS_CONFIRMATION") {
      throw new ShopOrderError("INVALID_REQUEST", "Settlement confirmation details are required.");
    }

    const target = command.transition.target;
    const actorName = command.actor.displayName ?? command.actor.email ?? "Studio operator";
    const now = command.now.toISOString();
    const eventType = `FUNDS_CONFIRMATION_${target}`;
    const eventNote = `${target === "CORRECTED" ? "Payment record corrected" : "Payment confirmed"}: NGN ${command.details.paidAmount}; transfer reference ${command.details.transferReference}.${command.note ? ` ${command.note}` : ""}`;

    try {
      const result = await getShopDb().execute<ReferenceRow>(sql`
        with candidate as (
          select
            orders.id,
            orders.customer_id,
            orders.reference,
            orders.version,
            orders.lifecycle_status,
            orders.payment_review_status,
            orders.funds_confirmation_status,
            orders.fulfillment_status,
            orders.funds_transfer_reference,
            orders.funds_receiving_account_label,
            orders.funds_refunded_amount
          from shop_orders as orders
          where orders.reference = ${command.reference}
          for update
        ), existing_receipt as (
          select events.id
          from shop_order_events as events
          inner join candidate on candidate.id = events.order_id
          where events.actor_kind = 'OPERATOR'
            and events.actor_subject = ${command.actor.subject}
            and events.metadata->>'studioCommandIdempotencyKey' = ${command.idempotencyKey}
          limit 1
        ), updated as (
          update shop_orders as orders
          set
            funds_confirmation_status = 'CONFIRMED',
            funds_transfer_reference = ${command.details.transferReference},
            funds_receiving_account_label = ${command.details.receivingAccountLabel},
            funds_paid_amount = ${command.details.paidAmount},
            funds_paid_currency = ${command.details.paidCurrency},
            funds_amount_updated_at = ${now}::timestamptz,
            funds_confirmed_at = case when ${target} = 'CONFIRMED' then ${now}::timestamptz else orders.funds_confirmed_at end,
            funds_verifier_subject = ${command.actor.subject},
            funds_verifier_display_name = ${actorName},
            status = case when ${target} = 'CONFIRMED' then 'ORDER_RECEIVED'::shop_order_status else orders.status end,
            version = orders.version + 1,
            updated_at = ${now}::timestamptz
          from candidate
          where orders.id = candidate.id
            and not exists (select 1 from existing_receipt)
            and candidate.version = ${command.expectedVersion}
            and (
              (${target} = 'CONFIRMED'
                and candidate.lifecycle_status = 'ACTIVE'
                and candidate.payment_review_status = 'REVIEW_APPROVED'
                and candidate.funds_confirmation_status = 'UNCONFIRMED')
              or (${target} = 'CORRECTED'
                and candidate.funds_confirmation_status = 'CONFIRMED'
                and ${command.details.paidAmount} >= candidate.funds_refunded_amount
                and (
                  candidate.lifecycle_status <> 'CANCELLED'
                  or candidate.funds_refunded_amount = 0
                  or ${command.details.paidAmount} = candidate.funds_refunded_amount
                ))
            )
          returning
            orders.id,
            orders.customer_id,
            orders.reference,
            orders.version,
            orders.lifecycle_status,
            orders.payment_review_status,
            orders.funds_confirmation_status,
            orders.fulfillment_status,
            candidate.funds_confirmation_status as previous_funds_status,
            candidate.funds_transfer_reference as previous_transfer_reference,
            candidate.funds_receiving_account_label as previous_receiving_account_label
        ), recovery_sync as (
          update shop_order_recoveries as recoveries
          set
            refund_cap_amount = ${command.details.paidAmount},
            refund_currency = ${command.details.paidCurrency},
            updated_at = ${now}::timestamptz
          from updated
          where recoveries.order_id = updated.id
            and recoveries.status in ('PENDING', 'FAILED')
          returning recoveries.order_id
        ), event as (
          insert into shop_order_events (
            order_id, event_type, actor_kind, actor_subject, visibility,
            lifecycle_status, payment_review_status, funds_confirmation_status, fulfillment_status,
            note, metadata, occurred_at
          )
          select
            updated.id, ${eventType}, 'OPERATOR', ${command.actor.subject}, 'CUSTOMER',
            updated.lifecycle_status, updated.payment_review_status, updated.funds_confirmation_status,
            updated.fulfillment_status, ${eventNote},
            jsonb_strip_nulls(jsonb_build_object(
              'previous', updated.previous_funds_status,
              'previousTransferReference', updated.previous_transfer_reference,
              'previousReceivingAccountLabel', updated.previous_receiving_account_label,
              'transferReference', ${command.details.transferReference}::text,
              'receivingAccountLabel', ${command.details.receivingAccountLabel}::text,
              'paidAmount', ${command.details.paidAmount}::integer,
              'paidCurrency', ${command.details.paidCurrency}::text,
              'studioCommandVersion', 1,
              'studioCommandKind', 'ORDER',
              'studioCommandIdempotencyKey', ${command.idempotencyKey}::text,
              'studioCommandRequestFingerprint', ${command.requestFingerprint}::text,
              'studioCommandExpectedVersion', ${command.expectedVersion}::integer,
              'studioCommandResultingVersion', updated.version,
              'studioCommandDimension', ${command.transition.dimension}::text,
              'studioCommandTarget', ${command.transition.target}::text
            )),
            ${now}::timestamptz
          from updated
          returning order_id
        ), notification as (
          insert into shop_notification_outbox (
            order_id, customer_id, topic, dedupe_key, payload, available_at, created_at
          )
          select
            updated.id,
            updated.customer_id,
            ${eventType},
            'order:' || updated.id::text || ':funds_confirmation:' || updated.version::text || ':' || lower(${target}::text),
            jsonb_build_object(
              'orderReference', updated.reference,
              'dimension', 'FUNDS_CONFIRMATION',
              'target', ${target}::text
            ),
            ${now}::timestamptz,
            ${now}::timestamptz
          from updated
          on conflict (dedupe_key) do nothing
          returning order_id
        )
        select updated.reference from updated
        union all
        select candidate.reference from candidate
        where exists (select 1 from existing_receipt)
      `);

      if (result.rows.length !== 1) {
        const diagnostic = await this.getOperatorOrder(command.reference);
        if (!diagnostic) throw new ShopOrderError("NOT_FOUND", "The order was not found.");
        if (diagnostic.version !== command.expectedVersion) {
          throw new ShopOrderError("VERSION_CONFLICT", "The order changed before this command was applied.");
        }
        throw new ShopOrderError("INVALID_TRANSITION", "The requested payment transition is not allowed.");
      }

      const order = await this.getOperatorOrder(command.reference);
      if (!order) throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The updated order could not be read.");
      return order;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  requestReturn(command: RequestShopReturnCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_request_return_v3(
        ${command.reference},
        ${command.actor.subject},
        ${command.idempotencyKey},
        ${command.requestFingerprint},
        ${command.expectedVersion},
        ${command.correction},
        ${command.reason},
        ${command.detail},
        ${JSON.stringify(command.lineSkus)}::jsonb,
        ${command.now.toISOString()}::timestamptz
      ) as document
    `);
  }

  transitionReturn(command: TransitionShopReturnCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_transition_return_command_v4(
        ${command.reference},
        ${command.actor.subject},
        ${command.expectedVersion},
        ${command.idempotencyKey},
        ${command.requestFingerprint},
        ${command.transition.dimension},
        ${command.transition.target},
        ${command.refundReference},
        ${command.refundAmount},
        ${command.refundCurrency},
        ${JSON.stringify(command.lineDispositions)}::jsonb,
        ${command.note},
        ${command.now.toISOString()}::timestamptz
      ) as document
    `, true);
  }

  async authorizePaymentEvidence(
    command: AuthorizePaymentEvidenceCommand,
  ): Promise<PaymentEvidenceAuthorization> {
    try {
      const result = await getShopDb().execute<AuthorizationRow>(sql`
        select shop_authorize_payment_evidence_v2(
          ${command.reference},
          ${command.actor.subject},
          ${command.idempotencyKey},
          ${command.requestFingerprint},
          ${command.originalFileName},
          ${command.contentType},
          ${command.byteSize},
          ${command.sha256},
          ${command.now.toISOString()}::timestamptz,
          ${command.expiresAt.toISOString()}::timestamptz
        ) as authorization
      `);
      if (result.rows.length !== 1) {
        throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The evidence command returned no authorization.");
      }
      return parseAuthorization(result.rows[0].authorization);
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async getPaymentEvidenceAuthorization(
    authSubject: string,
    reference: string,
    authorizationId: string,
  ): Promise<PaymentEvidenceAuthorization | null> {
    try {
      const result = await getShopDb().execute<AuthorizationRow>(sql`
        select shop_payment_evidence_authorization_v2(evidence.id) as authorization
        from shop_payment_evidence as evidence
        inner join shop_orders as orders on orders.id = evidence.order_id
        inner join shop_customers as customers on customers.id = orders.customer_id
        where evidence.id = ${authorizationId}::uuid
          and orders.reference = ${reference}
          and customers.auth_subject = ${authSubject}
        limit 1
      `);
      return result.rows[0] ? parseAuthorization(result.rows[0].authorization) : null;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  completePaymentEvidence(command: CompletePaymentEvidenceCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_receive_payment_evidence_v2(
        ${command.reference},
        ${command.actor.subject},
        ${command.authorizationId}::uuid,
        ${command.contentType},
        ${command.byteSize},
        ${command.sha256},
        ${command.blobPathname},
        ${command.blobUrl},
        ${command.now.toISOString()}::timestamptz
      ) as document
    `);
  }

  async claimPreviewOutbox(
    workerId: string,
    limit: number,
    now: Date,
  ): Promise<ShopNotificationOutboxMessage[]> {
    try {
      const result = await getShopDb().execute<OutboxRow>(sql`
        select message
        from shop_claim_outbox_v2(
          ${workerId},
          ${limit},
          ${now.toISOString()}::timestamptz
        ) as message
      `);
      const messages = result.rows.map((row) => parseOutboxMessage(row.message));
      return Promise.all(messages.map(async (message) => {
        const recipient = await getShopDb().execute<RecipientRow>(sql`
          select orders.contact_email as email, orders.contact_name as display_name
          from shop_orders as orders
          where orders.id = ${message.orderId}::uuid
          limit 1
        `);
        const row = recipient.rows[0];
        if (!row || typeof row.email !== "string" || !row.email.includes("@")) {
          throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The notification recipient is unavailable.");
        }
        return {
          ...message,
          recipientEmail: row.email,
          recipientName: typeof row.display_name === "string" ? row.display_name : null,
        };
      }));
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async markPreviewOutboxDelivered(messageId: string, workerId: string, now: Date): Promise<void> {
    try {
      await getShopDb().execute(sql`
        select shop_complete_outbox_v2(
          ${messageId}::uuid,
          ${workerId},
          true,
          null,
          ${now.toISOString()}::timestamptz,
          ${now.toISOString()}::timestamptz
        )
      `);
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async markPreviewOutboxFailed(
    messageId: string,
    workerId: string,
    errorMessage: string,
    retryAt: Date,
  ): Promise<void> {
    try {
      await getShopDb().execute(sql`
        select shop_complete_outbox_v2(
          ${messageId}::uuid,
          ${workerId},
          false,
          ${errorMessage},
          ${retryAt.toISOString()}::timestamptz,
          now()
        )
      `);
    } catch (error) {
      throw persistenceError(error);
    }
  }
}
