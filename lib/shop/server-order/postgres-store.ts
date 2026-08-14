import { sql } from "drizzle-orm";
import { getShopDb } from "../../../db/shop-postgres";
import type {
  AuthorizePaymentEvidenceCommand,
  CompletePaymentEvidenceCommand,
  CreateShopOrderCommand,
  PaymentEvidenceAuthorization,
  RequestShopReturnCommand,
  ShopNotificationOutboxMessage,
  ShopOrderStore,
  ShopServerOrder,
  TransitionShopReturnCommand,
  TransitionShopOrderCommand,
} from "./types";
import { ShopOrderError } from "./types";

interface DocumentRow extends Record<string, unknown> {
  document: unknown;
}

interface AuthorizationRow extends Record<string, unknown> {
  authorization: unknown;
}

interface OutboxRow extends Record<string, unknown> {
  message: unknown;
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

function parseOrderDocument(value: unknown): ShopServerOrder {
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
  return value as unknown as ShopServerOrder;
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
  return value as unknown as ShopNotificationOutboxMessage;
}

async function executeDocument(query: ReturnType<typeof sql>): Promise<ShopServerOrder> {
  try {
    const result = await getShopDb().execute<DocumentRow>(query);
    if (result.rows.length !== 1) {
      throw new ShopOrderError("PERSISTENCE_UNAVAILABLE", "The order command returned no document.");
    }
    return parseOrderDocument(result.rows[0].document);
  } catch (error) {
    throw persistenceError(error);
  }
}

export class PostgresShopOrderStore implements ShopOrderStore {
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

  async listCustomerOrders(authSubject: string, limit: number): Promise<ShopServerOrder[]> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v2(orders.id, false) as document
        from shop_orders as orders
        inner join shop_customers as customers on customers.id = orders.customer_id
        where customers.auth_subject = ${authSubject}
        order by orders.saved_at desc
        limit ${limit}
      `);
      return result.rows.map((row) => parseOrderDocument(row.document));
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async getCustomerOrder(authSubject: string, reference: string): Promise<ShopServerOrder | null> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v2(orders.id, false) as document
        from shop_orders as orders
        inner join shop_customers as customers on customers.id = orders.customer_id
        where customers.auth_subject = ${authSubject}
          and orders.reference = ${reference}
        limit 1
      `);
      return result.rows[0] ? parseOrderDocument(result.rows[0].document) : null;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async listOperatorOrders(limit: number): Promise<ShopServerOrder[]> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v2(orders.id, true) as document
        from shop_orders as orders
        order by orders.saved_at desc
        limit ${limit}
      `);
      return result.rows.map((row) => parseOrderDocument(row.document));
    } catch (error) {
      throw persistenceError(error);
    }
  }

  async getOperatorOrder(reference: string): Promise<ShopServerOrder | null> {
    try {
      const result = await getShopDb().execute<DocumentRow>(sql`
        select shop_order_document_v2(orders.id, true) as document
        from shop_orders as orders
        where orders.reference = ${reference}
        limit 1
      `);
      return result.rows[0] ? parseOrderDocument(result.rows[0].document) : null;
    } catch (error) {
      throw persistenceError(error);
    }
  }

  transitionOrder(command: TransitionShopOrderCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_transition_order_v2(
        ${command.reference},
        ${command.actor.subject},
        ${command.actor.displayName ?? command.actor.email ?? "Studio operator"},
        ${command.expectedVersion},
        ${command.transition.dimension},
        ${command.transition.target},
        ${command.details ? JSON.stringify(command.details) : null}::jsonb,
        ${command.note},
        ${command.returnEligibleUntil?.toISOString() ?? null}::timestamptz,
        ${command.now.toISOString()}::timestamptz
      ) as document
    `);
  }

  requestReturn(command: RequestShopReturnCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_request_return_v2(
        ${command.reference},
        ${command.actor.subject},
        ${command.idempotencyKey},
        ${command.requestFingerprint},
        ${command.reason},
        ${command.detail},
        ${command.now.toISOString()}::timestamptz
      ) as document
    `);
  }

  transitionReturn(command: TransitionShopReturnCommand): Promise<ShopServerOrder> {
    return executeDocument(sql`
      select shop_transition_return_v2(
        ${command.reference},
        ${command.actor.subject},
        ${command.expectedVersion},
        ${command.transition.dimension},
        ${command.transition.target},
        ${command.refundReference},
        ${command.refundAmount},
        ${command.refundCurrency},
        ${command.note},
        ${command.now.toISOString()}::timestamptz
      ) as document
    `);
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
      return result.rows.map((row) => parseOutboxMessage(row.message));
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
