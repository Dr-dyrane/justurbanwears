import type { ShopCheckoutSubmissionIntent } from "../domain/entities";
import type {
  CompletePaymentEvidenceCommand,
  PaymentEvidenceAuthorization,
  ShopCustomerActor,
  ShopOperatorActor,
  ShopOrderStore,
  ShopServerOrder,
} from "./types";
import { ShopOrderError } from "./types";
import {
  checkoutRequestFingerprint,
  parseCheckoutIntent,
  parseEvidenceMetadata,
  parseExpectedVersion,
  parseOperatorTransition,
  parseOrderTransitionDetails,
  parseOptionalNote,
  parseRefundAmount,
  parseRefundCurrency,
  parseRefundReference,
  parseReturnRequest,
  parseReturnTransition,
  parseOrderReference,
  parseUuid,
} from "./validation";

type CommandBody = Record<string, unknown>;

function commandBody(value: unknown, allowedKeys: readonly string[]): CommandBody {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new ShopOrderError("INVALID_REQUEST", "The command body is invalid.");
  }
  const body = value as CommandBody;
  const allowed = new Set(allowedKeys);
  if (Object.keys(body).some((key) => !allowed.has(key))) {
    throw new ShopOrderError("INVALID_REQUEST", "The command body contains unsupported fields.");
  }
  return body;
}

export interface ShopOrderServiceOptions {
  now?: () => Date;
  reservationTtlMs?: number;
  evidenceAuthorizationTtlMs?: number;
  returnWindowMs?: number;
}

const DEFAULT_RETURN_WINDOW_DAYS = 7;

function configuredReturnWindowMs(): number {
  const configured = Number(process.env.SHOP_RETURN_WINDOW_DAYS ?? DEFAULT_RETURN_WINDOW_DAYS);
  const days = Number.isInteger(configured) && configured >= 1 && configured <= 90
    ? configured
    : DEFAULT_RETURN_WINDOW_DAYS;
  return days * 24 * 60 * 60 * 1000;
}

export class ShopOrderService {
  private readonly now: () => Date;
  private readonly reservationTtlMs: number;
  private readonly evidenceAuthorizationTtlMs: number;
  private readonly returnWindowMs: number;

  constructor(
    private readonly store: ShopOrderStore,
    options: ShopOrderServiceOptions = {},
  ) {
    this.now = options.now ?? (() => new Date());
    this.reservationTtlMs = options.reservationTtlMs ?? 24 * 60 * 60 * 1000;
    this.evidenceAuthorizationTtlMs = options.evidenceAuthorizationTtlMs ?? 10 * 60 * 1000;
    this.returnWindowMs = options.returnWindowMs ?? configuredReturnWindowMs();
  }

  createOrder(actor: ShopCustomerActor, value: unknown): Promise<ShopServerOrder> {
    const intent = parseCheckoutIntent(value);
    const now = this.now();
    return this.store.createOrder({
      actor,
      intent,
      requestFingerprint: checkoutRequestFingerprint(intent),
      now,
      reservationExpiresAt: new Date(now.getTime() + this.reservationTtlMs),
    });
  }

  /** Typed adapter used by the authenticated checkout command integration. */
  submitCheckout(
    actor: ShopCustomerActor,
    intent: ShopCheckoutSubmissionIntent,
  ): Promise<ShopServerOrder> {
    return this.createOrder(actor, intent);
  }

  listCustomerOrders(actor: ShopCustomerActor): Promise<ShopServerOrder[]> {
    return this.store.listCustomerOrders(actor.subject, 50);
  }

  async getCustomerOrder(actor: ShopCustomerActor, rawReference: unknown): Promise<ShopServerOrder> {
    const reference = parseOrderReference(rawReference);
    const order = await this.store.getCustomerOrder(actor.subject, reference);
    if (!order) throw new ShopOrderError("NOT_FOUND", "The order was not found.");
    return order;
  }

  listOperatorOrders(actor: ShopOperatorActor): Promise<ShopServerOrder[]> {
    void actor;
    return this.store.listOperatorOrders(100);
  }

  async getOperatorOrder(_actor: ShopOperatorActor, rawReference: unknown): Promise<ShopServerOrder> {
    const reference = parseOrderReference(rawReference);
    const order = await this.store.getOperatorOrder(reference);
    if (!order) throw new ShopOrderError("NOT_FOUND", "The order was not found.");
    return order;
  }

  transitionOrder(
    actor: ShopOperatorActor,
    rawReference: unknown,
    value: unknown,
  ): Promise<ShopServerOrder> {
    const body = commandBody(value, ["expectedVersion", "transition", "details", "note"]);
    const transition = parseOperatorTransition(body.transition);
    if (transition.dimension === "FUNDS_CONFIRMATION" && actor.role !== "admin") {
      throw new ShopOrderError("FORBIDDEN", "Admin access is required to confirm settled funds.");
    }
    const now = this.now();
    const note = parseOptionalNote(body.note);
    const details = parseOrderTransitionDetails(transition, body.details);
    let returnEligibleUntil: Date | null = null;
    if (transition.dimension === "FULFILLMENT" && transition.target === "DELIVERED") {
      if (details?.kind !== "DELIVERY_COMPLETE" && details?.kind !== "PICKUP_COMPLETE") {
        throw new ShopOrderError("INVALID_REQUEST", "Delivery or pickup completion facts are required.");
      }
      const handoffAt = new Date(details.deliveredAt);
      if (handoffAt > now) {
        throw new ShopOrderError("INVALID_REQUEST", "The delivery or collection time cannot be in the future.");
      }
      returnEligibleUntil = new Date(handoffAt.getTime() + this.returnWindowMs);
    }
    return this.store.transitionOrder({
      actor,
      reference: parseOrderReference(rawReference),
      expectedVersion: parseExpectedVersion(body.expectedVersion),
      transition,
      details,
      note,
      returnEligibleUntil,
      now,
    });
  }

  requestReturn(
    actor: ShopCustomerActor,
    rawReference: unknown,
    value: unknown,
  ): Promise<ShopServerOrder> {
    const request = parseReturnRequest(value);
    return this.store.requestReturn({
      actor,
      reference: parseOrderReference(rawReference),
      ...request,
      now: this.now(),
    });
  }

  transitionReturn(
    actor: ShopOperatorActor,
    rawReference: unknown,
    value: unknown,
  ): Promise<ShopServerOrder> {
    const body = commandBody(value, [
      "expectedVersion",
      "transition",
      "refundReference",
      "refundAmount",
      "refundCurrency",
      "note",
    ]);
    const transition = parseReturnTransition(body.transition);
    const completedRefund = transition.dimension === "REFUND" && transition.target === "COMPLETED";
    if (completedRefund && actor.role !== "admin") {
      throw new ShopOrderError("FORBIDDEN", "Admin access is required to record a completed refund.");
    }
    return this.store.transitionReturn({
      actor,
      reference: parseOrderReference(rawReference),
      expectedVersion: parseExpectedVersion(body.expectedVersion),
      transition,
      refundReference: parseRefundReference(
        body.refundReference,
        completedRefund,
      ),
      refundAmount: parseRefundAmount(body.refundAmount, completedRefund),
      refundCurrency: parseRefundCurrency(body.refundCurrency, completedRefund),
      note: parseOptionalNote(body.note),
      now: this.now(),
    });
  }

  authorizePaymentEvidence(
    actor: ShopCustomerActor,
    rawReference: unknown,
    value: unknown,
  ): Promise<PaymentEvidenceAuthorization> {
    const reference = parseOrderReference(rawReference);
    const evidence = parseEvidenceMetadata(value);
    const now = this.now();
    return this.store.authorizePaymentEvidence({
      actor,
      reference,
      ...evidence,
      now,
      expiresAt: new Date(now.getTime() + this.evidenceAuthorizationTtlMs),
    });
  }

  async getPaymentEvidenceAuthorization(
    actor: ShopCustomerActor,
    rawReference: unknown,
    rawAuthorizationId: unknown,
  ): Promise<PaymentEvidenceAuthorization> {
    const authorization = await this.store.getPaymentEvidenceAuthorization(
      actor.subject,
      parseOrderReference(rawReference),
      parseUuid(rawAuthorizationId, "payment-evidence authorization"),
    );
    if (!authorization) {
      throw new ShopOrderError("NOT_FOUND", "The payment-evidence authorization was not found.");
    }
    return authorization;
  }

  completePaymentEvidence(
    actor: ShopCustomerActor,
    command: Omit<CompletePaymentEvidenceCommand, "actor" | "now">,
  ): Promise<ShopServerOrder> {
    return this.store.completePaymentEvidence({
      ...command,
      actor,
      now: this.now(),
    });
  }

}
