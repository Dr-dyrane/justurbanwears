import { randomUUID } from "node:crypto";
import type { ShopOrderStatus } from "../domain/entities";
import {
  PAYMENT_EVIDENCE_RECEIVED_NOTICE,
  PAYMENT_EVIDENCE_REVIEWED_NOTICE,
  ShopOrderError,
  type AuthorizePaymentEvidenceCommand,
  type CompletePaymentEvidenceCommand,
  type CreateShopOrderCommand,
  type PaymentEvidenceAuthorization,
  type RequestShopReturnCommand,
  type ShopNotificationOutboxMessage,
  type ShopOrderAuditEvent,
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
  if (order.lifecycleStatus !== "ACTIVE") return [];
  const transitions: ShopOperatorTransition[] = [];
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
    if (order.fulfillmentStatus === "NOT_STARTED") {
      transitions.push({ dimension: "FULFILLMENT", target: "QUALITY_CHECK" });
    } else if (order.fulfillmentStatus === "QUALITY_CHECK") {
      transitions.push({ dimension: "FULFILLMENT", target: "READY_FOR_HANDOFF" });
    } else if (order.fulfillmentStatus === "READY_FOR_HANDOFF") {
      transitions.push({
        dimension: "FULFILLMENT",
        target: order.fulfillment.kind === "DELIVERY" ? "IN_TRANSIT" : "DELIVERED",
      });
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
      return [
        { dimension: "RETURN_RESOLUTION", target: "RESTOCK" },
        { dimension: "RETURN_RESOLUTION", target: "WRITE_OFF" },
      ];
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

export class MemoryShopOrderStore implements ShopOrderStore {
  private readonly catalogue = new Map<string, MemoryShopCatalogueItem>();
  private readonly inventory = new Map<string, MemoryInventory>();
  private readonly customersBySubject = new Map<string, MemoryCustomer>();
  private readonly ordersByReference = new Map<string, InternalOrder>();
  private readonly evidenceById = new Map<string, PaymentEvidenceAuthorization>();
  private readonly outboxById = new Map<string, InternalOutbox>();
  private readonly outboxByDedupe = new Map<string, string>();
  private serial: Promise<void> = Promise.resolve();

  constructor(items: readonly MemoryShopCatalogueItem[]) {
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

  private project(order: InternalOrder, includePrivate: boolean, now = new Date()): ShopServerOrder {
    const projected = copy(order) as InternalOrder;
    projected.status = projectedStatus(projected);
    projected.allowedTransitions = includePrivate ? allowedTransitionsFor(projected, now) : [];
    projected.allowedReturnTransitions = includePrivate ? allowedReturnTransitionsFor(projected) : [];
    projected.canRequestReturn = !includePrivate && customerCanRequestReturn(projected, now);
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

  private resolveReturnedInventory(order: InternalOrder, disposition: "RESTOCK" | "WRITE_OFF") {
    for (const line of order.lines) {
      const inventory = this.inventory.get(line.sku);
      if (
        !inventory
        || inventory.availability !== "SOLD"
        || inventory.onHand !== 0
        || inventory.reserved !== 0
        || inventory.sold - inventory.returned !== 1
      ) throw new ShopOrderError("INVENTORY_UNAVAILABLE", "The sold inventory no longer matches this return.");
    }
    for (const line of order.lines) {
      const inventory = this.inventory.get(line.sku)!;
      inventory.returned += 1;
      if (disposition === "RESTOCK") {
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

      const delivery = command.intent.fulfillment.optionId === "lagos"
        ? { fee: 2500, label: "Lagos delivery", estimate: "1–3 working days" }
        : command.intent.fulfillment.optionId === "nationwide"
          ? { fee: 4500, label: "Nationwide delivery", estimate: "3–7 working days" }
          : { fee: 0, label: "Studio pickup", estimate: "After payment" };
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
        lifecycleStatus: "ACTIVE",
        paymentReviewStatus: "AWAITING_EVIDENCE",
        fundsConfirmationStatus: "UNCONFIRMED",
        fundsConfirmation: null,
        fulfillmentStatus: "NOT_STARTED",
        fulfillmentFacts: {
          kind: command.intent.fulfillment.kind,
          carrierName: null,
          trackingReference: null,
          pickupAppointment: null,
          recipientName: null,
          dispatchReference: null,
          dispatchedAt: null,
          deliveredAt: null,
          deliveryProofReference: null,
        },
        return: null,
        version: 0,
        evidence: [],
        events: [],
        allowedTransitions: [],
        allowedReturnTransitions: [],
        canRequestReturn: false,
      };
      this.event(order, {
        eventType: "ORDER_CREATED",
        actorKind: "CUSTOMER",
        actorSubject: command.actor.subject,
        visibility: "CUSTOMER",
        lifecycleStatus: "ACTIVE",
        paymentReviewStatus: "AWAITING_EVIDENCE",
        fundsConfirmationStatus: "UNCONFIRMED",
        fulfillmentStatus: "NOT_STARTED",
        note: "Order received; payment evidence has not been received.",
        metadata: { reservationExpiresAt: order.reservationExpiresAt },
      }, command.now);
      this.ordersByReference.set(reference, order);
      this.enqueue(order, "ORDER_CREATED", `order:${databaseId}:created`, {
        orderReference: reference,
        lifecycleStatus: "ACTIVE",
      }, command.now);
      return this.project(order, false);
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

  async getCustomerOrder(authSubject: string, reference: string): Promise<ShopServerOrder | null> {
    await this.serial;
    const order = this.ordersByReference.get(reference);
    return order?.authSubject === authSubject ? this.project(order, false) : null;
  }

  async listOperatorOrders(limit: number): Promise<ShopServerOrder[]> {
    await this.serial;
    return [...this.ordersByReference.values()]
      .sort((left, right) => right.savedAt.localeCompare(left.savedAt))
      .slice(0, limit)
      .map((order) => this.project(order, true));
  }

  async getOperatorOrder(reference: string): Promise<ShopServerOrder | null> {
    await this.serial;
    const order = this.ordersByReference.get(reference);
    return order ? this.project(order, true) : null;
  }

  transitionOrder(command: TransitionShopOrderCommand): Promise<ShopServerOrder> {
    return this.transact(() => {
      const order = this.order(command.reference);
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
        order.fundsConfirmationStatus = "CONFIRMED";
        order.fundsConfirmation = {
          transferReference: command.details.transferReference,
          receivingAccountLabel: command.details.receivingAccountLabel,
          confirmedAt: command.now.toISOString(),
          verifierSubject: command.actor.subject,
          verifierDisplayName: command.actor.displayName ?? command.actor.email ?? "Studio operator",
        };
        note = `Payment confirmed against ${command.details.receivingAccountLabel}; transfer reference ${command.details.transferReference}.${note ? ` ${note}` : ""}`;
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
            order.fulfillmentFacts.pickupAppointment = command.details.pickupAppointment;
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
          : order.lifecycleStatus;
      const eventType = `${command.transition.dimension === "PAYMENT_REVIEW"
        ? "PAYMENT"
        : command.transition.dimension}_${target}`;
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
          ...(command.details ? { details: command.details } : {}),
          ...(command.transition.dimension === "LIFECYCLE" ? { releasedInventory: true } : {}),
        },
      }, command.now);
      this.enqueue(order, eventType, `order:${order.databaseId}:${command.transition.dimension.toLowerCase()}:${order.version}:${target.toLowerCase()}`, {
        orderReference: order.reference,
        dimension: command.transition.dimension,
        target,
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
      if (order.return) {
        if (
          order.returnIdempotencyKey === command.idempotencyKey
          && order.returnRequestFingerprint === command.requestFingerprint
        ) return this.project(order, false, command.now);
        if (order.returnIdempotencyKey === command.idempotencyKey) {
          throw new ShopOrderError("IDEMPOTENCY_MISMATCH", "The return idempotency key was reused.");
        }
        throw new ShopOrderError("INVALID_TRANSITION", "This order already has a return request.");
      }
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
        metadata: { reason: command.reason, returnId: order.return.id },
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
            || command.refundAmount > order.total
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
        this.resolveReturnedInventory(order, command.transition.target);
        currentReturn.disposition = command.transition.target;
        currentReturn.status = "RESOLVED";
        currentReturn.resolvedAt = command.now.toISOString();
        eventType = `RETURN_RESOLVED_${command.transition.target}`;
        note = note ?? (command.transition.target === "RESTOCK"
          ? "Return resolved and the piece is available again."
          : "Return resolved and the piece was written off.");
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
          returnId: currentReturn.id,
          returnStatus: currentReturn.status,
          refundStatus: currentReturn.refundStatus,
          ...(currentReturn.refundReference ? { refundReference: currentReturn.refundReference } : {}),
          ...(currentReturn.refundAmount ? {
            refundAmount: currentReturn.refundAmount,
            refundCurrency: currentReturn.refundCurrency,
          } : {}),
          ...(currentReturn.disposition ? { disposition: currentReturn.disposition } : {}),
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
