import { createHash, randomUUID } from "node:crypto";
import type { ShopOrderStatus } from "../domain/entities";
import { studioOrderHasDueWork } from "../order-presentation";
import { trackingUrlForOrder } from "./commerce-guidance";
import {
  PAYMENT_EVIDENCE_RECEIVED_NOTICE,
  PAYMENT_EVIDENCE_REVIEWED_NOTICE,
  ShopOrderError,
  type AuthorizePaymentEvidenceCommand,
  type CompletePaymentEvidenceCommand,
  type CreateAssistedShopOrderCommand,
  type CreateShopOrderCommand,
  type PaymentEvidenceAuthorization,
  type MutateCustomerOrderCommand,
  type RequestShopReturnCommand,
  type ShopNotificationOutboxMessage,
  type ShopCustomerActor,
  type ShopOrderAuditEvent,
  type ShopOrderListQuery,
  type ShopOrderPage,
  type ShopOperatorTransitionReceipt,
  type ShopOperatorReturnTransition,
  type ShopOperatorTransition,
  type ShopOrderStore,
  type ShopServerOrder,
  type TransitionShopReturnCommand,
  type TransitionShopOrderCommand,
} from "./types";

export interface MemoryShopCatalogueItem {
  sku: string;
  slug: string;
  name: string;
  taggedSize: string;
  price: number;
  availability?: "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
}

interface MemoryInventory {
  availability: "AVAILABLE" | "RESERVED" | "SOLD" | "ARCHIVED";
  onHand: number;
  reserved: number;
  sold: number;
  returned: number;
  writeOff: number;
}

interface MemoryCustomer {
  id: string;
  authSubject: string;
  email: string;
  phone: string;
  displayName: string;
}

interface InternalOrder extends ShopServerOrder {
  databaseId: string;
  customerId: string;
  authSubject: string;
  idempotencyKey: string;
  requestFingerprint: string;
  returnIdempotencyKey?: string;
  returnRequestFingerprint?: string;
}

interface InternalOutbox extends ShopNotificationOutboxMessage {
  status: "PENDING" | "DELIVERED" | "FAILED";
  availableAt: Date;
  lockedAt: Date | null;
  lockedBy: string | null;
  deliveredAt: Date | null;
  lastError: string | null;
}

function copy<T>(value: T): T {
  return structuredClone(value);
}

function operatorTransitionReceipt(
  order: InternalOrder,
  actorSubject: string,
  idempotencyKey: string,
): ShopOperatorTransitionReceipt | null {
  const event = order.events.find((candidate) => (
    candidate.actorSubject === actorSubject
    && candidate.metadata?.studioCommandIdempotencyKey === idempotencyKey
  ));
  const metadata = event?.metadata;
  if (
    !event
    || !metadata
    || metadata.studioCommandVersion !== 1
    || (metadata.studioCommandKind !== "ORDER" && metadata.studioCommandKind !== "RETURN")
    || typeof metadata.studioCommandExpectedVersion !== "number"
    || typeof metadata.studioCommandResultingVersion !== "number"
    || typeof metadata.studioCommandDimension !== "string"
    || typeof metadata.studioCommandTarget !== "string"
    || typeof metadata.studioCommandRequestFingerprint !== "string"
  ) return null;
  return {
    version: 1,
    receiptId: event.id,
    commandKind: metadata.studioCommandKind,
    orderId: order.databaseId,
    reference: order.reference,
    actorSubject,
    expectedVersion: metadata.studioCommandExpectedVersion,
    resultingVersion: metadata.studioCommandResultingVersion,
    dimension: metadata.studioCommandDimension as ShopOperatorTransitionReceipt["dimension"],
    target: metadata.studioCommandTarget as ShopOperatorTransitionReceipt["target"],
    idempotencyKey,
    requestFingerprint: metadata.studioCommandRequestFingerprint,
    occurredAt: event.occurredAt,
  };
}

function operatorTransitionMetadata(
  commandKind: "ORDER" | "RETURN",
  command: TransitionShopOrderCommand | TransitionShopReturnCommand,
  resultingVersion: number,
) {
  return {
    studioCommandVersion: 1,
    studioCommandKind: commandKind,
    studioCommandIdempotencyKey: command.idempotencyKey,
    studioCommandRequestFingerprint: command.requestFingerprint,
    studioCommandExpectedVersion: command.expectedVersion,
    studioCommandResultingVersion: resultingVersion,
    studioCommandDimension: command.transition.dimension,
    studioCommandTarget: command.transition.target,
  };
}

function assertOperatorTransitionReplay(
  receipt: ShopOperatorTransitionReceipt,
  commandKind: "ORDER" | "RETURN",
  command: TransitionShopOrderCommand | TransitionShopReturnCommand,
) {
  if (
    receipt.commandKind !== commandKind
    || receipt.reference !== command.reference
    || receipt.actorSubject !== command.actor.subject
    || receipt.expectedVersion !== command.expectedVersion
    || receipt.dimension !== command.transition.dimension
    || receipt.target !== command.transition.target
    || receipt.requestFingerprint !== command.requestFingerprint
  ) {
    throw new ShopOrderError("IDEMPOTENCY_MISMATCH", "The transition idempotency key was reused.");
  }
}

function referenceFor(now: Date, id: string): string {
  return `JUW-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${id.replaceAll("-", "").slice(0, 10).toUpperCase()}`;
}

function projectedStatus(order: ShopServerOrder): ShopOrderStatus {
  if (order.lifecycleStatus === "CANCELLED" || order.lifecycleStatus === "EXPIRED") return "CANCELLED";
  if (order.lifecycleStatus === "COMPLETED" || order.fulfillmentStatus === "DELIVERED") return "DELIVERED";
  if (order.fulfillmentStatus === "IN_TRANSIT") return "IN_TRANSIT";
  if (order.fulfillmentStatus === "READY_FOR_HANDOFF") return "READY_FOR_HANDOFF";
  if (order.fulfillmentStatus === "QUALITY_CHECK") return "QUALITY_CHECK";
  return order.fundsConfirmationStatus === "CONFIRMED" ? "ORDER_RECEIVED" : "PAYMENT_REQUIRED";
}

function allowedTransitionsFor(order: ShopServerOrder, now: Date): ShopOperatorTransition[] {
  const transitions: ShopOperatorTransition[] = [];
  if (order.fundsConfirmationStatus === "CONFIRMED") {
    transitions.push({ dimension: "FUNDS_CONFIRMATION", target: "CORRECTED" });
  }
  if (order.lifecycleStatus !== "ACTIVE") return transitions;
  if (order.cancellationRecovery?.status === "PENDING") {
    transitions.push(
      { dimension: "CANCELLATION_REFUND", target: "COMPLETED" },
      { dimension: "CANCELLATION_REFUND", target: "FAILED" },
    );
    return transitions;
  }
  if (order.cancellationRecovery?.status === "FAILED") {
    transitions.push({ dimension: "CANCELLATION_REFUND", target: "PENDING" });
    return transitions;
  }
  if (
    order.fulfillmentStatus === "NOT_STARTED"
    && order.fundsConfirmationStatus === "UNCONFIRMED"
  ) {
    transitions.push({ dimension: "LIFECYCLE", target: "CANCELLED" });
  }
  if (
    order.fulfillmentStatus === "NOT_STARTED"
    && order.fundsConfirmationStatus !== "CONFIRMED"
    && order.reservationExpiresAt
    && new Date(order.reservationExpiresAt) <= now
  ) transitions.push({ dimension: "LIFECYCLE", target: "EXPIRED" });

  if (order.paymentReviewStatus === "EVIDENCE_RECEIVED") {
    transitions.push(
      { dimension: "PAYMENT_REVIEW", target: "UNDER_REVIEW" },
      { dimension: "PAYMENT_REVIEW", target: "REVIEW_APPROVED" },
      { dimension: "PAYMENT_REVIEW", target: "REVIEW_REJECTED" },
    );
  } else if (order.paymentReviewStatus === "UNDER_REVIEW") {
    transitions.push(
      { dimension: "PAYMENT_REVIEW", target: "REVIEW_APPROVED" },
      { dimension: "PAYMENT_REVIEW", target: "REVIEW_REJECTED" },
    );
  }

  if (
    order.paymentReviewStatus === "REVIEW_APPROVED"
    && order.fundsConfirmationStatus === "UNCONFIRMED"
  ) {
    transitions.push({ dimension: "FUNDS_CONFIRMATION", target: "CONFIRMED" });
  }

  if (
    order.paymentReviewStatus === "REVIEW_APPROVED"
    && order.fundsConfirmationStatus === "CONFIRMED"
  ) {
    if (order.fulfillment.kind === "PICKUP" && order.fulfillmentStatus === "READY_FOR_HANDOFF") {
      transitions.push({ dimension: "PICKUP", target: "SCHEDULED" });
    }
    if (order.fulfillmentStatus === "NOT_STARTED") {
      transitions.push({ dimension: "FULFILLMENT", target: "QUALITY_CHECK" });
    } else if (order.fulfillmentStatus === "QUALITY_CHECK") {
      transitions.push({ dimension: "FULFILLMENT", target: "READY_FOR_HANDOFF" });
    } else if (order.fulfillmentStatus === "READY_FOR_HANDOFF") {
      if (order.fulfillment.kind === "DELIVERY") {
        transitions.push({ dimension: "FULFILLMENT", target: "IN_TRANSIT" });
      } else if (order.fulfillmentFacts.pickupAppointment) {
        transitions.push({ dimension: "FULFILLMENT", target: "DELIVERED" });
      }
    } else if (order.fulfillmentStatus === "IN_TRANSIT") {
      transitions.push({ dimension: "FULFILLMENT", target: "DELIVERED" });
    }
  }
  return transitions;
}

function allowedReturnTransitionsFor(order: ShopServerOrder): ShopOperatorReturnTransition[] {
  if (!order.return) return [];
  if (order.return.status === "REQUESTED") {
    return [
      { dimension: "RETURN", target: "APPROVED" },
      { dimension: "RETURN", target: "REJECTED" },
    ];
  }
  if (order.return.status === "APPROVED") {
    return [{ dimension: "RETURN", target: "RECEIVED" }];
  }
  if (order.return.status === "RECEIVED") {
    if (order.return.refundStatus === "NOT_STARTED") {
      return [{ dimension: "REFUND", target: "PENDING" }];
    }
    if (order.return.refundStatus === "PENDING" || order.return.refundStatus === "FAILED") {
      return [
        { dimension: "REFUND", target: "COMPLETED" },
        { dimension: "REFUND", target: "FAILED" },
      ];
    }
    if (order.return.refundStatus === "COMPLETED") {
      return [{ dimension: "RETURN_RESOLUTION", target: "RESOLVE_ITEMS" }];
    }
  }
  return [];
}

function customerCanRequestReturn(order: ShopServerOrder, now: Date): boolean {
  return order.lifecycleStatus === "COMPLETED"
    && order.fulfillmentStatus === "DELIVERED"
    && !order.return
    && Boolean(order.returnEligibleUntil)
    && new Date(order.returnEligibleUntil!) >= now;
}

function customerCanRequestPaidCancellation(order: ShopServerOrder): boolean {
  return order.lifecycleStatus === "ACTIVE"
    && order.fundsConfirmationStatus === "CONFIRMED"
    && order.fulfillmentStatus !== "IN_TRANSIT"
    && order.fulfillmentStatus !== "DELIVERED"
    && !order.cancellationRecovery;
}

function deliveryFor(fulfillment: ShopServerOrder["fulfillment"]) {
  return fulfillment.optionId === "lagos"
    ? { fee: 2500, label: "Lagos delivery", estimate: "1–3 working days" }
    : fulfillment.optionId === "nationwide"
      ? { fee: 4500, label: "Nationwide delivery", estimate: "3–7 working days" }
      : { fee: 0, label: "Studio pickup", estimate: "After payment" };
}

function orderMatchesQuery(order: ShopServerOrder, query: ShopOrderListQuery): boolean {
  const search = query.search.toLowerCase();
  const matchesSearch = !search || [
    order.reference,
    order.contact.name,
    order.contact.email,
    order.contact.phone,
    ...order.lines.flatMap((line) => [line.name, line.sku]),
  ].some((value) => value.toLowerCase().includes(search));
  if (!matchesSearch) return false;
  if (query.filter === "ALL") return true;
  if (query.filter === "ACTIVE") return order.lifecycleStatus === "ACTIVE";
  if (query.filter === "COMPLETED") return order.lifecycleStatus === "COMPLETED";
  if (query.filter === "CANCELLED") return order.lifecycleStatus === "CANCELLED" || order.lifecycleStatus === "EXPIRED";
  if (query.filter === "RETURNS") return Boolean(order.return);
  return studioOrderHasDueWork(order);
}

export class MemoryShopOrderStore implements ShopOrderStore {
  private readonly catalogue = new Map<string, MemoryShopCatalogueItem>();
  private readonly inventory = new Map<string, MemoryInventory>();
  private readonly customersBySubject = new Map<string, MemoryCustomer>();
  private readonly ordersByReference = new Map<string, InternalOrder>();
  private readonly evidenceById = new Map<string, PaymentEvidenceAuthorization>();
  private readonly outboxById = new Map<string, InternalOutbox>();
  private readonly outboxByDedupe = new Map<string, string>();
  private serial: Promise<void> = Promise.resolve();

  constructor(
    items: readonly MemoryShopCatalogueItem[],
    private readonly now: () => Date = () => new Date(),
  ) {
    for (const source of items) {
      const item = copy(source);
      this.catalogue.set(item.slug, item);
      const availability = item.availability ?? "AVAILABLE";
      this.inventory.set(item.sku, {
        availability,
        onHand: availability === "SOLD" ? 0 : 1,
        reserved: availability === "RESERVED" ? 1 : 0,
        sold: availability === "SOLD" ? 1 : 0,
        returned: 0,
        writeOff: 0,
      });
    }
  }

  private transact<T>(operation: () => T | Promise<T>): Promise<T> {
    const result = this.serial.then(operation);
    this.serial = result.then(() => undefined, () => undefined);
    return result;
  }

  private order(reference: string): InternalOrder {
    const order = this.ordersByReference.get(reference);
    if (!order) throw new ShopOrderError("NOT_FOUND", "The order was not found.");
    return order;
  }

  private assertVersion(order: InternalOrder, expected: number) {
    if (order.version !== expected) {
      throw new ShopOrderError("VERSION_CONFLICT", "The order changed before the command was applied.");
    }
  }

  private event(
    order: InternalOrder,
    event: Omit<ShopOrderAuditEvent, "id" | "occurredAt">,
    now: Date,
  ) {
    order.events.push({ id: randomUUID(), occurredAt: now.toISOString(), ...event });
  }

  private enqueue(
    order: InternalOrder,
    topic: string,
    dedupeKey: string,
    payload: Record<string, unknown>,
    now: Date,
  ) {
    if (this.outboxByDedupe.has(dedupeKey)) return;
    const id = randomUUID();
    const message: InternalOutbox = {
      id,
      orderId: order.databaseId,
      customerId: order.customerId,
      recipientEmail: order.contact.email,
      recipientName: order.contact.name,
      topic,
      dedupeKey,
      payload: copy(payload),
      attempts: 0,
      createdAt: now.toISOString(),
      status: "PENDING",
      availableAt: new Date(now),
      lockedAt: null,
      lockedBy: null,
      deliveredAt: null,
      lastError: null,
    };
    this.outboxById.set(id, message);
    this.outboxByDedupe.set(dedupeKey, id);
  }

  claimCustomerIdentity(actor: ShopCustomerActor): Promise<void> {
    return this.transact(() => {
      if (this.customersBySubject.has(actor.subject) || !actor.email) return;
      const normalizedEmail = actor.email.toLowerCase();
      const assisted = [...this.customersBySubject.values()].find((customer) => (
        customer.authSubject.startsWith("assisted:")
        && customer.email?.toLowerCase() === normalizedEmail
      ));
      if (!assisted) return;
      this.customersBySubject.delete(assisted.authSubject);
      const previousSubject = assisted.authSubject;
      assisted.authSubject = actor.subject;
      assisted.displayName = actor.displayName ?? assisted.displayName;
      this.customersBySubject.set(actor.subject, assisted);
      for (const order of this.ordersByReference.values()) {
        if (order.authSubject === previousSubject) order.authSubject = actor.subject;
      }
    });
  }

  private project(order: InternalOrder, includePrivate: boolean, now = this.now()): ShopServerOrder {
    const projected = copy(order) as InternalOrder;
    projected.status = projectedStatus(projected);
    projected.allowedTransitions = includePrivate ? allowedTransitionsFor(projected, now) : [];
    projected.allowedReturnTransitions = includePrivate ? allowedReturnTransitionsFor(projected) : [];
    projected.canRequestReturn = !includePrivate && customerCanRequestReturn(projected, now);
    projected.canRequestPaidCancellation = !includePrivate && customerCanRequestPaidCancellation(projected);
    projected.fulfillmentFacts.trackingUrl = trackingUrlForOrder(projected);
    if (!includePrivate && projected.fundsConfirmation) {
      delete projected.fundsConfirmation.verifierSubject;
    }
    projected.events = projected.events
      .filter((event) => includePrivate || event.visibility === "CUSTOMER")
      .map((event) => includePrivate ? event : { ...event, actorSubject: undefined });
    projected.evidence = projected.evidence.map((evidence) => {
      if (includePrivate) return evidence;
      const publicEvidence = { ...evidence };
      delete publicEvidence.blobPathname;
      return publicEvidence;
    });
    delete (projected as Partial<InternalOrder>).databaseId;
    delete (projected as Partial<InternalOrder>).customerId;
    delete (projected as Partial<InternalOrder>).authSubject;
    delete (projected as Partial<InternalOrder>).idempotencyKey;
    delete (projected as Partial<InternalOrder>).requestFingerprint;
    delete (projected as Partial<InternalOrder>).returnIdempotencyKey;
    delete (projected as Partial<InternalOrder>).returnRequestFingerprint;
    return projected;
  }

  private releaseInventory(order: InternalOrder) {
    for (const line of order.lines) {
      const inventory = this.inventory.get(line.sku);
      if (!inventory || inventory.availability !== "RESERVED" || inventory.onHand !== 1 || inventory.reserved !== 1) {
        throw new ShopOrderError("INVENTORY_UNAVAILABLE", "The reservation no longer matches inventory.");
      }
    }
    for (const line of order.lines) {
      const inventory = this.inventory.get(line.sku)!;
      inventory.availability = "AVAILABLE";
      inventory.reserved = 0;
    }
  }

  private sellInventory(order: InternalOrder) {
    for (const line of order.lines) {
      const inventory = this.inventory.get(line.sku);
      if (!inventory || inventory.availability !== "RESERVED" || inventory.onHand !== 1 || inventory.reserved !== 1) {
        throw new ShopOrderError("INVENTORY_UNAVAILABLE", "The reservation no longer matches inventory.");
      }
    }
    for (const line of order.lines) {
      const inventory = this.inventory.get(line.sku)!;
      inventory.availability = "SOLD";
      inventory.onHand = 0;
      inventory.reserved = 0;
      inventory.sold += 1;
    }
  }

  private resolveReturnedInventory(
    order: InternalOrder,
    decisions: Array<{ sku: string; disposition: "RESTOCK" | "WRITE_OFF" }>,
  ) {
    const bySku = new Map(decisions.map((decision) => [decision.sku, decision.disposition]));
    const lines = order.lines.filter((line) => bySku.has(line.sku));
    if (!lines.length || lines.length !== decisions.length) {
      throw new ShopOrderError("INVALID_REQUEST", "Every returned piece needs one inventory decision.");
    }
    for (const line of lines) {
      const inventory = this.inventory.get(line.sku);
      if (
        !inventory
        || inventory.availability !== "SOLD"
        || inventory.onHand !== 0
        || inventory.reserved !== 0
        || inventory.sold - inventory.returned !== 1
      ) throw new ShopOrderError("INVENTORY_UNAVAILABLE", "The sold inventory no longer matches this return.");
    }
    for (const line of lines) {
      const inventory = this.inventory.get(line.sku)!;
      inventory.returned += 1;
      if (bySku.get(line.sku) === "RESTOCK") {
        inventory.availability = "AVAILABLE";
        inventory.onHand = 1;
      } else {
        inventory.availability = "ARCHIVED";
        inventory.writeOff += 1;
      }
    }
  }

  createOrder(command: CreateShopOrderCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      let customer = this.customersBySubject.get(command.actor.subject);
      if (!customer) {
        customer = {
          id: randomUUID(),
          authSubject: command.actor.subject,
          email: command.actor.email ?? command.intent.contact.email,
          phone: command.intent.contact.phone,
          displayName: command.actor.displayName ?? command.intent.contact.name,
        };
        this.customersBySubject.set(command.actor.subject, customer);
      } else {
        customer.email = command.actor.email ?? command.intent.contact.email;
        customer.phone = command.intent.contact.phone;
        customer.displayName = command.actor.displayName ?? command.intent.contact.name;
      }

      const existing = [...this.ordersByReference.values()].find((order) => (
        order.customerId === customer!.id && order.idempotencyKey === command.intent.idempotencyKey
      ));
      if (existing) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new ShopOrderError("IDEMPOTENCY_MISMATCH", "The idempotency key was reused.");
        }
        return this.project(existing, false);
      }

      const items = command.intent.lines.map((line) => {
        const item = this.catalogue.get(line.slug);
        const inventory = item ? this.inventory.get(item.sku) : undefined;
        if (
          !item
          || !inventory
          || item.taggedSize !== line.taggedSize
          || inventory.availability !== "AVAILABLE"
          || inventory.onHand !== 1
          || inventory.reserved !== 0
        ) {
          throw new ShopOrderError("INVENTORY_UNAVAILABLE", "A requested piece is unavailable.");
        }
        return item;
      });
      for (const item of items) {
        const inventory = this.inventory.get(item.sku)!;
        inventory.availability = "RESERVED";
        inventory.reserved = 1;
      }

      const delivery = deliveryFor(command.intent.fulfillment);
      const databaseId = randomUUID();
      const subtotal = items.reduce((sum, item) => sum + item.price, 0);
      const reference = referenceFor(command.now, databaseId);
      const order: InternalOrder = {
        databaseId,
        customerId: customer.id,
        authSubject: customer.authSubject,
        idempotencyKey: command.intent.idempotencyKey,
        requestFingerprint: command.requestFingerprint,
        id: reference,
        reference,
        lines: items.map((item) => ({
          snapshot: "PRODUCT",
          slug: item.slug,
          sku: item.sku,
          name: item.name,
          taggedSize: item.taggedSize,
          unitPrice: item.price,
          quantity: 1,
        })),
        contact: copy(command.intent.contact),
        fulfillment: copy(command.intent.fulfillment),
        subtotal,
        deliveryFee: delivery.fee,
        total: subtotal + delivery.fee,
        deliveryLabel: delivery.label,
        deliveryEstimate: delivery.estimate,
        savedAt: command.now.toISOString(),
        reservationExpiresAt: command.reservationExpiresAt.toISOString(),
        returnEligibleUntil: null,
        status: "PAYMENT_REQUIRED",
        transmission: "SUBMITTED",
        source: command.source ?? "ONLINE",
        lifecycleStatus: "ACTIVE",
        paymentReviewStatus: "AWAITING_EVIDENCE",
        fundsConfirmationStatus: "UNCONFIRMED",
        fundsConfirmation: null,
        fulfillmentStatus: "NOT_STARTED",
        fulfillmentFacts: {
          kind: command.intent.fulfillment.kind,
          carrierName: null,
          trackingReference: null,
          trackingUrl: null,
          pickupAppointment: null,
          recipientName: null,
          dispatchReference: null,
          dispatchedAt: null,
          deliveredAt: null,
          deliveryProofReference: null,
        },
        cancellationRecovery: null,
        return: null,
        version: 0,
        evidence: [],
        events: [],
        allowedTransitions: [],
        allowedReturnTransitions: [],
        canRequestReturn: false,
        canRequestPaidCancellation: false,
      };
      this.event(order, {
        eventType: "ORDER_CREATED",
        actorKind: command.createdBy ? "OPERATOR" : "CUSTOMER",
        actorSubject: command.createdBy?.subject ?? command.actor.subject,
        visibility: "CUSTOMER",
        lifecycleStatus: "ACTIVE",
        paymentReviewStatus: "AWAITING_EVIDENCE",
        fundsConfirmationStatus: "UNCONFIRMED",
        fulfillmentStatus: "NOT_STARTED",
        note: command.createdBy
          ? `Order created from ${order.source.toLowerCase().replace("_", " ")}. Payment evidence has not been received.`
          : "Order received; payment evidence has not been received.",
        metadata: {
          reservationExpiresAt: order.reservationExpiresAt,
          source: order.source,
        },
      }, command.now);
      if (command.sourceNote) {
        this.event(order, {
          eventType: "ORDER_SOURCE_NOTE",
          actorKind: "OPERATOR",
          actorSubject: command.createdBy?.subject ?? "studio:assisted-order",
          visibility: "OPERATOR",
          lifecycleStatus: "ACTIVE",
          paymentReviewStatus: "AWAITING_EVIDENCE",
          fundsConfirmationStatus: "UNCONFIRMED",
          fulfillmentStatus: "NOT_STARTED",
          note: command.sourceNote,
          metadata: { source: order.source },
        }, command.now);
      }
      this.ordersByReference.set(reference, order);
      this.enqueue(order, "ORDER_CREATED", `order:${databaseId}:created`, {
        orderReference: reference,
        lifecycleStatus: "ACTIVE",
      }, command.now);
      return this.project(order, false);
    });
  }

  createAssistedOrder(command: CreateAssistedShopOrderCommand): Promise<ShopServerOrder> {
    const contactKey = createHash("sha256")
      .update(command.intent.contact.email.toLowerCase())
      .digest("hex")
      .slice(0, 32);
    return this.createOrder({
      actor: {
        kind: "CUSTOMER",
        subject: `assisted:${contactKey}`,
        email: command.intent.contact.email,
        displayName: command.intent.contact.name,
      },
      intent: command.intent,
      requestFingerprint: command.requestFingerprint,
      now: command.now,
      reservationExpiresAt: command.reservationExpiresAt,
      source: command.source,
      createdBy: command.actor,
      sourceNote: command.sourceNote,
    });
  }

  async listCustomerOrders(authSubject: string, limit: number): Promise<ShopServerOrder[]> {
    await this.serial;
    return [...this.ordersByReference.values()]
      .filter((order) => order.authSubject === authSubject)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .slice(0, limit)
      .map((order) => this.project(order, false));
  }

  async pageCustomerOrders(authSubject: string, query: ShopOrderListQuery): Promise<ShopOrderPage> {
    await this.serial;
    const matching = [...this.ordersByReference.values()]
      .filter((order) => order.authSubject === authSubject)
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .map((order) => this.project(order, false))
      .filter((order) => orderMatchesQuery(order, query));
    const offset = (query.page - 1) * query.limit;
    const orders = matching.slice(offset, offset + query.limit);
    return {
      orders,
      page: query.page,
      nextPage: matching.length > offset + orders.length ? query.page + 1 : null,
    };
  }

  async getCustomerOrder(authSubject: string, reference: string): Promise<ShopServerOrder | null> {
    await this.serial;
    const order = this.ordersByReference.get(reference);
    return order?.authSubject === authSubject ? this.project(order, false) : null;
  }

  mutateCustomerOrder(command: MutateCustomerOrderCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      const order = this.order(command.reference);
      if (order.authSubject !== command.actor.subject) {
        throw new ShopOrderError("NOT_FOUND", "The order was not found.");
      }
      this.assertVersion(order, command.expectedVersion);
      if (order.lifecycleStatus !== "ACTIVE" || order.fulfillmentStatus !== "NOT_STARTED") {
        throw new ShopOrderError("INVALID_TRANSITION", "This order can no longer be changed by the customer.");
      }

      if (command.mutation.action === "CANCEL") {
        if (order.fundsConfirmationStatus !== "UNCONFIRMED" || order.paymentReviewStatus !== "AWAITING_EVIDENCE") {
          throw new ShopOrderError("INVALID_TRANSITION", "Contact Lulu because payment activity already exists on this order.");
        }
        this.releaseInventory(order);
        order.lifecycleStatus = "CANCELLED";
        order.version += 1;
        this.event(order, {
          eventType: "LIFECYCLE_CANCELLED",
          actorKind: "CUSTOMER",
          actorSubject: command.actor.subject,
          visibility: "CUSTOMER",
          lifecycleStatus: "CANCELLED",
          paymentReviewStatus: order.paymentReviewStatus,
          fundsConfirmationStatus: order.fundsConfirmationStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          note: command.mutation.reason,
          metadata: { previous: "ACTIVE", releasedInventory: true },
        }, command.now);
        this.enqueue(order, "LIFECYCLE_CANCELLED", `order:${order.databaseId}:customer-cancelled`, {
          orderReference: order.reference,
          target: "CANCELLED",
        }, command.now);
      } else if (command.mutation.action === "UPDATE_CONTACT") {
        const previous = copy(order.contact);
        order.contact = copy(command.mutation.contact);
        order.version += 1;
        this.event(order, {
          eventType: "CONTACT_UPDATED",
          actorKind: "CUSTOMER",
          actorSubject: command.actor.subject,
          visibility: "CUSTOMER",
          lifecycleStatus: order.lifecycleStatus,
          paymentReviewStatus: order.paymentReviewStatus,
          fundsConfirmationStatus: order.fundsConfirmationStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          note: "Order contact details updated.",
          metadata: { previousEmail: previous.email, email: order.contact.email },
        }, command.now);
      } else if (command.mutation.action === "UPDATE_FULFILLMENT") {
        const previous = copy(order.fulfillment);
        const priceChanged = previous.optionId !== command.mutation.fulfillment.optionId;
        if (
          priceChanged
          && (order.fundsConfirmationStatus !== "UNCONFIRMED" || order.paymentReviewStatus !== "AWAITING_EVIDENCE")
        ) {
          throw new ShopOrderError("INVALID_TRANSITION", "Contact Lulu because this handoff change affects an active payment.");
        }
        const delivery = deliveryFor(command.mutation.fulfillment);
        order.fulfillment = copy(command.mutation.fulfillment);
        order.deliveryFee = delivery.fee;
        order.deliveryLabel = delivery.label;
        order.deliveryEstimate = delivery.estimate;
        order.total = order.subtotal + delivery.fee;
        order.fulfillmentFacts.kind = command.mutation.fulfillment.kind;
        order.fulfillmentFacts.pickupAppointment = null;
        order.version += 1;
        this.event(order, {
          eventType: "FULFILLMENT_DETAILS_UPDATED",
          actorKind: "CUSTOMER",
          actorSubject: command.actor.subject,
          visibility: "CUSTOMER",
          lifecycleStatus: order.lifecycleStatus,
          paymentReviewStatus: order.paymentReviewStatus,
          fundsConfirmationStatus: order.fundsConfirmationStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          note: "Delivery or pickup details updated before preparation started.",
          metadata: {
            previousKind: previous.kind,
            previousOptionId: previous.optionId,
            kind: order.fulfillment.kind,
            optionId: order.fulfillment.optionId,
            total: order.total,
          },
        }, command.now);
      } else {
        if (!customerCanRequestPaidCancellation(order)) {
          throw new ShopOrderError("INVALID_TRANSITION", "This paid order can no longer enter cancellation recovery.");
        }
        order.cancellationRecovery = {
          status: "PENDING",
          reason: command.mutation.reason,
          requestedAt: command.now.toISOString(),
          updatedAt: command.now.toISOString(),
          refundReference: null,
          refundAmount: null,
          refundCurrency: null,
        };
        order.version += 1;
        this.event(order, {
          eventType: "CANCELLATION_REFUND_PENDING",
          actorKind: "CUSTOMER",
          actorSubject: command.actor.subject,
          visibility: "CUSTOMER",
          lifecycleStatus: order.lifecycleStatus,
          paymentReviewStatus: order.paymentReviewStatus,
          fundsConfirmationStatus: order.fundsConfirmationStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          note: command.mutation.reason,
          metadata: { releasedInventory: false },
        }, command.now);
        this.enqueue(order, "CANCELLATION_REFUND_PENDING", `order:${order.databaseId}:cancellation-refund:pending`, {
          orderReference: order.reference,
          target: "PENDING",
        }, command.now);
      }
      return this.project(order, false, command.now);
    });
  }

  expireReservations(now: Date, limit: number): Promise<number> {
    return this.transact(() => {
      const due = [...this.ordersByReference.values()]
        .filter((order) => (
          order.lifecycleStatus === "ACTIVE"
          && order.fulfillmentStatus === "NOT_STARTED"
          && order.fundsConfirmationStatus === "UNCONFIRMED"
          && Boolean(order.reservationExpiresAt)
          && new Date(order.reservationExpiresAt!) <= now
        ))
        .sort((left, right) => (left.reservationExpiresAt ?? "").localeCompare(right.reservationExpiresAt ?? ""))
        .slice(0, Math.min(Math.max(limit, 1), 100));
      for (const order of due) {
        this.releaseInventory(order);
        order.lifecycleStatus = "EXPIRED";
        order.version += 1;
        this.event(order, {
          eventType: "LIFECYCLE_EXPIRED",
          actorKind: "SYSTEM",
          actorSubject: "system:reservation-expiry",
          visibility: "CUSTOMER",
          lifecycleStatus: "EXPIRED",
          paymentReviewStatus: order.paymentReviewStatus,
          fundsConfirmationStatus: order.fundsConfirmationStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          note: "The reservation expired and the pieces were released.",
          metadata: { previous: "ACTIVE", releasedInventory: true },
        }, now);
        this.enqueue(order, "LIFECYCLE_EXPIRED", `order:${order.databaseId}:system-expired`, {
          orderReference: order.reference,
          target: "EXPIRED",
        }, now);
      }
      return due.length;
    });
  }

  async listOperatorOrders(limit: number): Promise<ShopServerOrder[]> {
    await this.serial;
    return [...this.ordersByReference.values()]
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .slice(0, limit)
      .map((order) => this.project(order, true));
  }

  async pageOperatorOrders(query: ShopOrderListQuery): Promise<ShopOrderPage> {
    await this.serial;
    const matching = [...this.ordersByReference.values()]
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .map((order) => this.project(order, true))
      .filter((order) => orderMatchesQuery(order, query));
    const offset = (query.page - 1) * query.limit;
    const orders = matching.slice(offset, offset + query.limit);
    return {
      orders,
      page: query.page,
      nextPage: matching.length > offset + orders.length ? query.page + 1 : null,
    };
  }

  async getOperatorOrder(reference: string): Promise<ShopServerOrder | null> {
    await this.serial;
    const order = this.ordersByReference.get(reference);
    return order ? this.project(order, true) : null;
  }

  getOperatorTransitionReceipt(
    actorSubject: string,
    reference: string,
    idempotencyKey: string,
  ): Promise<ShopOperatorTransitionReceipt | null> {
    return this.transact(() => {
      const order = this.ordersByReference.get(reference);
      return order ? operatorTransitionReceipt(order, actorSubject, idempotencyKey) : null;
    });
  }

  transitionOrder(command: TransitionShopOrderCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      const order = this.order(command.reference);
      const replay = operatorTransitionReceipt(
        order,
        command.actor.subject,
        command.idempotencyKey,
      );
      if (replay) {
        assertOperatorTransitionReplay(replay, "ORDER", command);
        return this.project(order, true, command.now);
      }
      this.assertVersion(order, command.expectedVersion);
      const allowed = allowedTransitionsFor(order, command.now).some((transition) => (
        transition.dimension === command.transition.dimension
        && transition.target === command.transition.target
      ));
      if (!allowed) throw new ShopOrderError("INVALID_TRANSITION", "The order transition is invalid.");
      if (command.transition.dimension === "FULFILLMENT" && command.transition.target === "DELIVERED") {
        const handoffAt = command.details?.kind === "DELIVERY_COMPLETE"
          || command.details?.kind === "PICKUP_COMPLETE"
          ? new Date(command.details.deliveredAt)
          : null;
        if (
          !handoffAt
          || !Number.isFinite(handoffAt.getTime())
          || handoffAt > command.now
          || !command.returnEligibleUntil
          || command.returnEligibleUntil <= handoffAt
        ) {
          throw new ShopOrderError("INVALID_REQUEST", "The return eligibility window is invalid.");
        }
      }
      const previous = command.transition.dimension === "PAYMENT_REVIEW"
        ? order.paymentReviewStatus
        : command.transition.dimension === "FUNDS_CONFIRMATION"
          ? order.fundsConfirmationStatus
        : command.transition.dimension === "FULFILLMENT"
          ? order.fulfillmentStatus
          : command.transition.dimension === "PICKUP"
            ? order.fulfillmentFacts.pickupAppointment
            : command.transition.dimension === "CANCELLATION_REFUND"
              ? order.cancellationRecovery?.status ?? null
          : order.lifecycleStatus;
      let note = command.note;
      if (command.transition.dimension === "PAYMENT_REVIEW") {
        const target = command.transition.target;
        order.paymentReviewStatus = target;
        note = `${target === "UNDER_REVIEW"
          ? "Payment evidence is under review. This does not prove bank payment."
          : PAYMENT_EVIDENCE_REVIEWED_NOTICE}${note ? ` ${note}` : ""}`;
      } else if (command.transition.dimension === "FUNDS_CONFIRMATION") {
        if (command.details?.kind !== "FUNDS_CONFIRMATION") {
          throw new ShopOrderError("INVALID_REQUEST", "Settlement confirmation details are required.");
        }
        const refundedAmount = order.cancellationRecovery?.status === "COMPLETED"
          ? order.cancellationRecovery.refundAmount ?? 0
          : order.return?.refundStatus === "COMPLETED"
            ? order.return.refundAmount ?? 0
            : 0;
        if (command.details.paidAmount < refundedAmount) {
          throw new ShopOrderError("INVALID_REQUEST", "The corrected payment cannot be lower than money already refunded.");
        }
        if (
          command.transition.target === "CORRECTED"
          && order.lifecycleStatus === "CANCELLED"
          && refundedAmount > 0
          && command.details.paidAmount !== refundedAmount
        ) {
          throw new ShopOrderError("INVALID_REQUEST", "A fully refunded cancellation must keep the paid and refunded amounts equal.");
        }
        const originalConfirmation = order.fundsConfirmation;
        order.fundsConfirmationStatus = "CONFIRMED";
        order.fundsConfirmation = {
          transferReference: command.details.transferReference,
          receivingAccountLabel: command.details.receivingAccountLabel,
          paidAmount: command.details.paidAmount,
          paidCurrency: command.details.paidCurrency,
          confirmedAt: originalConfirmation?.confirmedAt ?? command.now.toISOString(),
          updatedAt: command.now.toISOString(),
          verifierSubject: command.actor.subject,
          verifierDisplayName: command.actor.displayName ?? command.actor.email ?? "Studio operator",
        };
        note = `${command.transition.target === "CORRECTED" ? "Payment record corrected" : "Payment confirmed"}: NGN ${command.details.paidAmount}; transfer reference ${command.details.transferReference}.${note ? ` ${note}` : ""}`;
      } else if (command.transition.dimension === "FULFILLMENT") {
        if (command.transition.target === "IN_TRANSIT") {
          if (order.fulfillment.kind !== "DELIVERY" || command.details?.kind !== "DELIVERY_DISPATCH") {
            throw new ShopOrderError("INVALID_REQUEST", "Delivery dispatch facts are required.");
          }
          order.fulfillmentFacts.carrierName = command.details.carrierName;
          order.fulfillmentFacts.trackingReference = command.details.trackingReference;
          order.fulfillmentFacts.dispatchReference = command.details.dispatchReference;
          order.fulfillmentFacts.dispatchedAt = command.details.dispatchedAt;
          note = note ?? `Dispatched with ${command.details.carrierName}; tracking ${command.details.trackingReference}.`;
        } else if (command.transition.target === "DELIVERED") {
          if (order.fulfillment.kind === "DELIVERY" && command.details?.kind === "DELIVERY_COMPLETE") {
            order.fulfillmentFacts.recipientName = command.details.recipientName;
            order.fulfillmentFacts.deliveredAt = command.details.deliveredAt;
            order.fulfillmentFacts.deliveryProofReference = command.details.deliveryProofReference;
            note = note ?? `Delivered to ${command.details.recipientName}; proof ${command.details.deliveryProofReference}.`;
          } else if (order.fulfillment.kind === "PICKUP" && command.details?.kind === "PICKUP_COMPLETE") {
            if (
              !order.fulfillmentFacts.pickupAppointment
              || order.fulfillmentFacts.pickupAppointment !== command.details.pickupAppointment
            ) throw new ShopOrderError("INVALID_REQUEST", "Use the pickup appointment already agreed with the customer.");
            order.fulfillmentFacts.recipientName = command.details.recipientName;
            order.fulfillmentFacts.deliveredAt = command.details.deliveredAt;
            order.fulfillmentFacts.deliveryProofReference = command.details.deliveryProofReference;
            note = note ?? `Collected from the Studio by ${command.details.recipientName}; handoff ${command.details.deliveryProofReference}.`;
          } else {
            throw new ShopOrderError("INVALID_REQUEST", "Completion facts do not match the handoff method.");
          }
        }
        order.fulfillmentStatus = command.transition.target;
        if (command.transition.target === "DELIVERED") {
          this.sellInventory(order);
          order.lifecycleStatus = "COMPLETED";
          order.returnEligibleUntil = command.returnEligibleUntil!.toISOString();
        }
      } else if (command.transition.dimension === "PICKUP") {
        if (order.fulfillment.kind !== "PICKUP" || command.details?.kind !== "PICKUP_SCHEDULE") {
          throw new ShopOrderError("INVALID_REQUEST", "A pickup time is required.");
        }
        order.fulfillmentFacts.pickupAppointment = command.details.pickupAppointment;
        note = note ?? `Pickup scheduled for ${command.details.pickupAppointment}.`;
      } else if (command.transition.dimension === "CANCELLATION_REFUND") {
        const recovery = order.cancellationRecovery;
        if (!recovery) throw new ShopOrderError("INVALID_TRANSITION", "No cancellation refund is pending.");
        if (command.transition.target === "COMPLETED") {
          if (
            command.details?.kind !== "CANCELLATION_REFUND"
            || !command.details.refundReference
            || !command.details.refundAmount
            || command.details.refundCurrency !== "NGN"
            || !order.fundsConfirmation?.paidAmount
            || command.details.refundAmount !== order.fundsConfirmation.paidAmount
          ) throw new ShopOrderError("INVALID_REQUEST", "Record the full refund amount and reference before cancelling.");
          this.releaseInventory(order);
          recovery.status = "COMPLETED";
          recovery.refundReference = command.details.refundReference;
          recovery.refundAmount = command.details.refundAmount;
          recovery.refundCurrency = command.details.refundCurrency;
          recovery.updatedAt = command.now.toISOString();
          order.lifecycleStatus = "CANCELLED";
          note = note ?? `Refund of NGN ${command.details.refundAmount} completed; reference ${command.details.refundReference}. The pieces were released.`;
        } else if (command.transition.target === "FAILED") {
          if (!note) throw new ShopOrderError("INVALID_REQUEST", "Record why the refund failed.");
          recovery.status = "FAILED";
          recovery.updatedAt = command.now.toISOString();
        } else {
          recovery.status = "PENDING";
          recovery.updatedAt = command.now.toISOString();
          note = note ?? "Cancellation refund is being retried.";
        }
      } else {
        if (command.transition.target === "CANCELLED" && !note) {
          throw new ShopOrderError("INVALID_REQUEST", "A cancellation reason is required.");
        }
        this.releaseInventory(order);
        order.lifecycleStatus = command.transition.target;
        note = command.transition.target === "EXPIRED"
          ? "The reservation expired and the pieces were released."
          : note;
      }
      order.version += 1;
      const target = command.transition.dimension === "PAYMENT_REVIEW"
        ? order.paymentReviewStatus
        : command.transition.dimension === "FUNDS_CONFIRMATION"
          ? order.fundsConfirmationStatus
        : command.transition.dimension === "FULFILLMENT"
          ? order.fulfillmentStatus
          : command.transition.dimension === "PICKUP"
            ? "SCHEDULED"
            : command.transition.dimension === "CANCELLATION_REFUND"
              ? order.cancellationRecovery?.status ?? command.transition.target
          : order.lifecycleStatus;
      const eventTarget = command.transition.dimension === "FUNDS_CONFIRMATION"
        ? command.transition.target
        : target;
      const eventType = `${command.transition.dimension === "PAYMENT_REVIEW"
        ? "PAYMENT"
        : command.transition.dimension}_${eventTarget}`;
      this.event(order, {
        eventType,
        actorKind: "OPERATOR",
        actorSubject: command.actor.subject,
        visibility: "CUSTOMER",
        lifecycleStatus: order.lifecycleStatus,
        paymentReviewStatus: order.paymentReviewStatus,
        fundsConfirmationStatus: order.fundsConfirmationStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        note,
        metadata: {
          previous,
          ...operatorTransitionMetadata("ORDER", command, order.version),
          ...(command.details ? { details: command.details } : {}),
          ...(command.details?.kind === "FUNDS_CONFIRMATION" ? {
            paidAmount: command.details.paidAmount,
            paidCurrency: command.details.paidCurrency,
          } : {}),
          ...(command.transition.dimension === "LIFECYCLE"
            || (command.transition.dimension === "CANCELLATION_REFUND" && command.transition.target === "COMPLETED")
            ? { releasedInventory: true }
            : {}),
        },
      }, command.now);
      this.enqueue(order, eventType, `order:${order.databaseId}:${command.transition.dimension.toLowerCase()}:${order.version}:${eventTarget.toLowerCase()}`, {
        orderReference: order.reference,
        dimension: command.transition.dimension,
        target: eventTarget,
      }, command.now);
      return this.project(order, true, command.now);
    });
  }

  requestReturn(command: RequestShopReturnCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      const order = this.order(command.reference);
      if (order.authSubject !== command.actor.subject) {
        throw new ShopOrderError("FORBIDDEN", "The customer does not own this order.");
      }
      if (command.expectedVersion !== null) this.assertVersion(order, command.expectedVersion);
      const selectedLines = command.lineSkus.length
        ? command.lineSkus.map((sku) => order.lines.find((line) => line.sku === sku))
        : order.lines;
      if (selectedLines.some((line) => !line) || !selectedLines.length) {
        throw new ShopOrderError("INVALID_REQUEST", "Every selected return piece must belong to this order.");
      }
      const returnItems = selectedLines.map((line) => ({
        orderItemId: null,
        sku: line!.sku,
        name: line!.name,
        unitPrice: line!.unitPrice,
        refundCapAmount: line!.unitPrice,
        disposition: null,
      }));
      if (order.return) {
        if (
          order.returnIdempotencyKey === command.idempotencyKey
          && order.returnRequestFingerprint === command.requestFingerprint
        ) return this.project(order, false, command.now);
        if (order.returnIdempotencyKey === command.idempotencyKey) {
          throw new ShopOrderError("IDEMPOTENCY_MISMATCH", "The return idempotency key was reused.");
        }
        if (
          !command.correction
          || order.return.status !== "REJECTED"
          || order.return.correctionCount >= 1
        ) throw new ShopOrderError("INVALID_TRANSITION", "This return request cannot be reopened.");
        order.returnIdempotencyKey = command.idempotencyKey;
        order.returnRequestFingerprint = command.requestFingerprint;
        order.return.status = "REQUESTED";
        order.return.reason = command.reason;
        order.return.detail = command.detail;
        order.return.requestedAt = command.now.toISOString();
        order.return.rejectedAt = null;
        order.return.items = returnItems;
        order.return.correctionCount += 1;
        order.version += 1;
        this.event(order, {
          eventType: "RETURN_CORRECTED",
          actorKind: "CUSTOMER",
          actorSubject: command.actor.subject,
          visibility: "CUSTOMER",
          lifecycleStatus: order.lifecycleStatus,
          paymentReviewStatus: order.paymentReviewStatus,
          fundsConfirmationStatus: order.fundsConfirmationStatus,
          fulfillmentStatus: order.fulfillmentStatus,
          note: "Return request corrected and reopened for one more review.",
          metadata: { returnId: order.return.id, lineSkus: returnItems.map((item) => item.sku) },
        }, command.now);
        this.enqueue(order, "RETURN_CORRECTED", `order:${order.databaseId}:return:corrected`, {
          orderReference: order.reference,
          returnId: order.return.id,
        }, command.now);
        return this.project(order, false, command.now);
      }
      if (command.correction) throw new ShopOrderError("INVALID_TRANSITION", "There is no rejected return to correct.");
      if (
        order.lifecycleStatus !== "COMPLETED"
        || order.fulfillmentStatus !== "DELIVERED"
        || !order.returnEligibleUntil
        || new Date(order.returnEligibleUntil) < command.now
      ) throw new ShopOrderError("RETURN_WINDOW_CLOSED", "This order is not eligible for a return request.");

      order.returnIdempotencyKey = command.idempotencyKey;
      order.returnRequestFingerprint = command.requestFingerprint;
      order.return = {
        id: randomUUID(),
        status: "REQUESTED",
        reason: command.reason,
        detail: command.detail,
        requestedAt: command.now.toISOString(),
        eligibleUntil: order.returnEligibleUntil,
        approvedAt: null,
        rejectedAt: null,
        receivedAt: null,
        resolvedAt: null,
        resolutionNote: null,
        refundStatus: "NOT_STARTED",
        refundReference: null,
        refundAmount: null,
        refundCurrency: null,
        refundUpdatedAt: null,
        disposition: null,
        items: returnItems,
        correctionCount: 0,
      };
      order.version += 1;
      this.event(order, {
        eventType: "RETURN_REQUESTED",
        actorKind: "CUSTOMER",
        actorSubject: command.actor.subject,
        visibility: "CUSTOMER",
        lifecycleStatus: order.lifecycleStatus,
        paymentReviewStatus: order.paymentReviewStatus,
        fundsConfirmationStatus: order.fundsConfirmationStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        note: "Return requested. Lulu will review eligibility and next steps.",
        metadata: {
          reason: command.reason,
          returnId: order.return.id,
          lineSkus: returnItems.map((item) => item.sku),
        },
      }, command.now);
      this.enqueue(order, "RETURN_REQUESTED", `order:${order.databaseId}:return:requested`, {
        orderReference: order.reference,
        returnId: order.return.id,
        reason: command.reason,
      }, command.now);
      return this.project(order, false, command.now);
    });
  }

  transitionReturn(command: TransitionShopReturnCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      const order = this.order(command.reference);
      const replay = operatorTransitionReceipt(
        order,
        command.actor.subject,
        command.idempotencyKey,
      );
      if (replay) {
        assertOperatorTransitionReplay(replay, "RETURN", command);
        return this.project(order, true, command.now);
      }
      this.assertVersion(order, command.expectedVersion);
      const currentReturn = order.return;
      if (!currentReturn) throw new ShopOrderError("NOT_FOUND", "The return request was not found.");
      const allowed = allowedReturnTransitionsFor(order).some((transition) => (
        transition.dimension === command.transition.dimension
        && transition.target === command.transition.target
      ));
      if (!allowed) throw new ShopOrderError("INVALID_TRANSITION", "The return transition is invalid.");

      let eventType: string;
      let note = command.note;
      if (command.transition.dimension === "RETURN") {
        if (command.transition.target === "REJECTED" && !note) {
          throw new ShopOrderError("INVALID_REQUEST", "A return rejection reason is required.");
        }
        currentReturn.status = command.transition.target;
        eventType = `RETURN_${command.transition.target}`;
        if (command.transition.target === "APPROVED") {
          currentReturn.approvedAt = command.now.toISOString();
          note = note ?? "Return approved. Arrange the Studio handoff before sending the piece.";
        } else if (command.transition.target === "REJECTED") {
          currentReturn.rejectedAt = command.now.toISOString();
        } else {
          currentReturn.receivedAt = command.now.toISOString();
          note = note ?? "Returned piece received by the Studio.";
        }
      } else if (command.transition.dimension === "REFUND") {
        if (command.transition.target === "COMPLETED") {
          if (
            !command.refundReference
            || !command.refundAmount
            || command.refundAmount > currentReturn.items.reduce(
              (sum, item) => sum + (item.refundCapAmount ?? item.unitPrice),
              0,
            )
            || command.refundCurrency !== "NGN"
          ) {
            throw new ShopOrderError("INVALID_REQUEST", "Exact refund amount, currency, and reference are required.");
          }
          currentReturn.refundReference = command.refundReference;
          currentReturn.refundAmount = command.refundAmount;
          currentReturn.refundCurrency = command.refundCurrency;
          note = note ?? `Refund of NGN ${command.refundAmount} completed; reference ${command.refundReference}.`;
        } else if (command.transition.target === "PENDING") {
          note = note ?? "Refund is being prepared.";
        } else {
          if (!note) throw new ShopOrderError("INVALID_REQUEST", "A failed refund reason is required.");
        }
        currentReturn.refundStatus = command.transition.target;
        currentReturn.refundUpdatedAt = command.now.toISOString();
        eventType = `REFUND_${command.transition.target}`;
      } else {
        const expectedSkus = currentReturn.items.map((item) => item.sku).sort();
        const actualSkus = command.lineDispositions.map((item) => item.sku).sort();
        if (expectedSkus.length !== actualSkus.length || expectedSkus.some((sku, index) => sku !== actualSkus[index])) {
          throw new ShopOrderError("INVALID_REQUEST", "Choose one inventory result for every returned piece.");
        }
        this.resolveReturnedInventory(order, command.lineDispositions);
        for (const item of currentReturn.items) {
          item.disposition = command.lineDispositions.find((decision) => decision.sku === item.sku)!.disposition;
        }
        const dispositions = new Set(command.lineDispositions.map((item) => item.disposition));
        currentReturn.disposition = dispositions.size === 1 ? command.lineDispositions[0].disposition : null;
        currentReturn.status = "RESOLVED";
        currentReturn.resolvedAt = command.now.toISOString();
        eventType = "RETURN_RESOLVED";
        note = note ?? "Every returned piece was inspected and its inventory result recorded.";
        currentReturn.resolutionNote = note;
      }

      order.version += 1;
      this.event(order, {
        eventType,
        actorKind: "OPERATOR",
        actorSubject: command.actor.subject,
        visibility: "CUSTOMER",
        lifecycleStatus: order.lifecycleStatus,
        paymentReviewStatus: order.paymentReviewStatus,
        fundsConfirmationStatus: order.fundsConfirmationStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        note,
        metadata: {
          ...operatorTransitionMetadata("RETURN", command, order.version),
          returnId: currentReturn.id,
          returnStatus: currentReturn.status,
          refundStatus: currentReturn.refundStatus,
          ...(currentReturn.refundReference ? { refundReference: currentReturn.refundReference } : {}),
          ...(currentReturn.refundAmount ? {
            refundAmount: currentReturn.refundAmount,
            refundCurrency: currentReturn.refundCurrency,
          } : {}),
          ...(currentReturn.disposition ? { disposition: currentReturn.disposition } : {}),
          ...(command.transition.dimension === "RETURN_RESOLUTION" ? {
            lineDispositions: command.lineDispositions,
          } : {}),
        },
      }, command.now);
      this.enqueue(order, eventType, `order:${order.databaseId}:return:${order.version}:${eventType.toLowerCase()}`, {
        orderReference: order.reference,
        returnId: currentReturn.id,
        eventType,
      }, command.now);
      return this.project(order, true, command.now);
    });
  }

  authorizePaymentEvidence(command: AuthorizePaymentEvidenceCommand): Promise<PaymentEvidenceAuthorization> {
    return this.transact(() => {
      const order = this.order(command.reference);
      if (order.authSubject !== command.actor.subject) {
        throw new ShopOrderError("FORBIDDEN", "The customer does not own this order.");
      }
      if (
        order.lifecycleStatus !== "ACTIVE"
        || order.fulfillmentStatus !== "NOT_STARTED"
        || !["AWAITING_EVIDENCE", "REVIEW_REJECTED"].includes(order.paymentReviewStatus)
        || order.fundsConfirmationStatus !== "UNCONFIRMED"
      ) throw new ShopOrderError("INVALID_TRANSITION", "Evidence cannot be authorized for this order.");
      const existing = [...this.evidenceById.values()].find((evidence) => (
        evidence.orderId === order.databaseId
        && (evidence as PaymentEvidenceAuthorization & { idempotencyKey?: string }).idempotencyKey === command.idempotencyKey
      )) as (PaymentEvidenceAuthorization & { idempotencyKey?: string; requestFingerprint?: string }) | undefined;
      if (existing) {
        if (existing.requestFingerprint !== command.requestFingerprint) {
          throw new ShopOrderError("IDEMPOTENCY_MISMATCH", "The evidence idempotency key was reused.");
        }
        return copy(existing);
      }
      const authorization = {
        id: randomUUID(),
        orderId: order.databaseId,
        orderReference: order.reference,
        customerId: order.customerId,
        status: "AUTHORIZED" as const,
        originalFileName: command.originalFileName,
        contentType: command.contentType,
        byteSize: command.byteSize,
        sha256: command.sha256,
        authorizedAt: command.now.toISOString(),
        expiresAt: command.expiresAt.toISOString(),
        receivedAt: null,
        blobPathname: null,
        blobUrl: null,
        idempotencyKey: command.idempotencyKey,
        requestFingerprint: command.requestFingerprint,
      };
      this.evidenceById.set(authorization.id, authorization);
      order.evidence.push({
        id: authorization.id,
        status: "AUTHORIZED",
        originalFileName: authorization.originalFileName,
        contentType: authorization.contentType,
        byteSize: authorization.byteSize,
        sha256: authorization.sha256,
        authorizedAt: authorization.authorizedAt,
        expiresAt: authorization.expiresAt,
        receivedAt: null,
        notice: "Payment evidence is authorized for private upload and has not been received.",
      });
      order.version += 1;
      this.event(order, {
        eventType: "PAYMENT_EVIDENCE_AUTHORIZED",
        actorKind: "CUSTOMER",
        actorSubject: command.actor.subject,
        visibility: "OPERATOR",
        lifecycleStatus: order.lifecycleStatus,
        paymentReviewStatus: order.paymentReviewStatus,
        fundsConfirmationStatus: order.fundsConfirmationStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        note: "Private payment-evidence upload authorized; no evidence has been received.",
        metadata: { evidenceId: authorization.id, sha256: authorization.sha256 },
      }, command.now);
      return copy(authorization);
    });
  }

  async getPaymentEvidenceAuthorization(
    authSubject: string,
    reference: string,
    authorizationId: string,
  ): Promise<PaymentEvidenceAuthorization | null> {
    await this.serial;
    const order = this.ordersByReference.get(reference);
    const authorization = this.evidenceById.get(authorizationId);
    return order?.authSubject === authSubject && authorization?.orderId === order.databaseId
      ? copy(authorization)
      : null;
  }

  completePaymentEvidence(command: CompletePaymentEvidenceCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      const order = this.order(command.reference);
      const authorization = this.evidenceById.get(command.authorizationId);
      if (order.authSubject !== command.actor.subject) {
        throw new ShopOrderError("FORBIDDEN", "The customer does not own this order.");
      }
      if (!authorization || authorization.orderId !== order.databaseId) {
        throw new ShopOrderError("NOT_FOUND", "The evidence authorization was not found.");
      }
      if (
        authorization.contentType !== command.contentType
        || authorization.byteSize !== command.byteSize
        || authorization.sha256 !== command.sha256
      ) throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence does not match its authorization.");
      const extension = authorization.contentType === "image/jpeg"
        ? ".jpg"
        : authorization.contentType === "image/png"
          ? ".png"
          : authorization.contentType === "image/webp"
            ? ".webp"
            : ".pdf";
      const expectedPathname = `shop/payment-evidence/${order.databaseId}/${authorization.id}${extension}`;
      if (command.blobPathname !== expectedPathname || !command.blobUrl.startsWith("https://")) {
        throw new ShopOrderError("EVIDENCE_MISMATCH", "The private Blob metadata is invalid.");
      }
      if (authorization.status === "RECEIVED") {
        if (
          authorization.blobPathname !== command.blobPathname
          || authorization.blobUrl !== command.blobUrl
        ) {
          throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence replay does not match its receipt.");
        }
        return this.project(order, false);
      }
      if (
        order.lifecycleStatus !== "ACTIVE"
        || order.fulfillmentStatus !== "NOT_STARTED"
        || !["AWAITING_EVIDENCE", "REVIEW_REJECTED"].includes(order.paymentReviewStatus)
        || order.fundsConfirmationStatus !== "UNCONFIRMED"
      ) {
        throw new ShopOrderError("INVALID_TRANSITION", "Evidence review has already advanced.");
      }
      if (authorization.status !== "AUTHORIZED") {
        throw new ShopOrderError("INVALID_TRANSITION", "The evidence authorization was already used.");
      }
      if (new Date(authorization.expiresAt) <= command.now) {
        throw new ShopOrderError("EVIDENCE_AUTHORIZATION_EXPIRED", "The evidence authorization expired.");
      }
      for (const evidence of this.evidenceById.values()) {
        if (evidence.orderId === order.databaseId && evidence.status === "RECEIVED") {
          evidence.status = "SUPERSEDED";
        }
      }
      authorization.status = "RECEIVED";
      authorization.receivedAt = command.now.toISOString();
      authorization.blobPathname = command.blobPathname;
      authorization.blobUrl = command.blobUrl;
      for (const evidence of order.evidence) {
        if (evidence.id !== authorization.id && evidence.status === "RECEIVED") evidence.status = "SUPERSEDED";
        if (evidence.id === authorization.id) {
          evidence.status = "RECEIVED";
          evidence.receivedAt = authorization.receivedAt;
          evidence.blobPathname = command.blobPathname;
          evidence.notice = PAYMENT_EVIDENCE_RECEIVED_NOTICE;
        }
      }
      order.paymentReviewStatus = "EVIDENCE_RECEIVED";
      const extended = new Date(command.now.getTime() + 24 * 60 * 60 * 1000).toISOString();
      if (!order.reservationExpiresAt || order.reservationExpiresAt < extended) order.reservationExpiresAt = extended;
      order.version += 1;
      this.event(order, {
        eventType: "PAYMENT_EVIDENCE_RECEIVED",
        actorKind: "CUSTOMER",
        actorSubject: command.actor.subject,
        visibility: "CUSTOMER",
        lifecycleStatus: order.lifecycleStatus,
        paymentReviewStatus: "EVIDENCE_RECEIVED",
        fundsConfirmationStatus: order.fundsConfirmationStatus,
        fulfillmentStatus: order.fulfillmentStatus,
        note: PAYMENT_EVIDENCE_RECEIVED_NOTICE,
        metadata: { evidenceId: authorization.id, sha256: authorization.sha256 },
      }, command.now);
      this.enqueue(order, "PAYMENT_EVIDENCE_RECEIVED", `order:${order.databaseId}:evidence:${authorization.id}:received`, {
        orderReference: order.reference,
        evidenceId: authorization.id,
        paymentReviewStatus: "EVIDENCE_RECEIVED",
        notice: PAYMENT_EVIDENCE_RECEIVED_NOTICE,
      }, command.now);
      return this.project(order, false);
    });
  }

  claimPreviewOutbox(workerId: string, limit: number, now: Date): Promise<ShopNotificationOutboxMessage[]> {
    return this.transact(() => {
      const messages = [...this.outboxById.values()]
        .filter((message) => (
          (message.status === "PENDING" || message.status === "FAILED")
          && message.availableAt <= now
          && (!message.lockedAt || message.lockedAt.getTime() < now.getTime() - 5 * 60 * 1000)
        ))
        .sort((left, right) => left.availableAt.getTime() - right.availableAt.getTime())
        .slice(0, limit);
      for (const message of messages) {
        message.lockedAt = new Date(now);
        message.lockedBy = workerId;
        message.attempts += 1;
        message.lastError = null;
      }
      return messages.map((message) => ({
        id: message.id,
        orderId: message.orderId,
        customerId: message.customerId,
        recipientEmail: message.recipientEmail,
        recipientName: message.recipientName,
        topic: message.topic,
        dedupeKey: message.dedupeKey,
        payload: copy(message.payload),
        attempts: message.attempts,
        createdAt: message.createdAt,
      }));
    });
  }

  markPreviewOutboxDelivered(messageId: string, workerId: string, now: Date): Promise<void> {
    return this.transact(() => {
      const message = this.outboxById.get(messageId);
      if (!message || message.lockedBy !== workerId) {
        throw new ShopOrderError("VERSION_CONFLICT", "The outbox claim was lost.");
      }
      message.status = "DELIVERED";
      message.deliveredAt = new Date(now);
      message.lockedAt = null;
      message.lockedBy = null;
    });
  }

  markPreviewOutboxFailed(
    messageId: string,
    workerId: string,
    error: string,
    retryAt: Date,
  ): Promise<void> {
    return this.transact(() => {
      const message = this.outboxById.get(messageId);
      if (!message || message.lockedBy !== workerId) {
        throw new ShopOrderError("VERSION_CONFLICT", "The outbox claim was lost.");
      }
      message.status = "FAILED";
      message.availableAt = new Date(retryAt);
      message.lastError = error;
      message.lockedAt = null;
      message.lockedBy = null;
    });
  }

  inventorySnapshot(): Record<string, MemoryInventory> {
    return Object.fromEntries([...this.inventory.entries()].map(([sku, inventory]) => [sku, copy(inventory)]));
  }

  outboxSnapshot(): Array<Pick<InternalOutbox, "dedupeKey" | "status" | "attempts">> {
    return [...this.outboxById.values()].map(({ dedupeKey, status, attempts }) => ({ dedupeKey, status, attempts }));
  }
}
