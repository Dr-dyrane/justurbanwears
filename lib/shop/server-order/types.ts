import type {
  ShopCheckoutFulfillment,
  ShopCheckoutSubmissionIntent,
  ShopOrderStatus,
} from "../domain/entities";

export const PAYMENT_EVIDENCE_RECEIVED_NOTICE =
  "Payment evidence received for review. This does not prove bank payment.";
export const PAYMENT_EVIDENCE_AUTHORIZATION_NOTICE =
  "Private upload authorized. Evidence is received only after the exact file passes validation and is stored.";
export const PAYMENT_EVIDENCE_REVIEWED_NOTICE =
  "Payment evidence reviewed. This review does not independently prove bank payment.";

export type ShopActorKind = "CUSTOMER" | "OPERATOR" | "SYSTEM";

interface ShopActorIdentity {
  subject: string;
  email?: string;
  displayName?: string;
}

export interface ShopCustomerActor extends ShopActorIdentity {
  kind: "CUSTOMER";
}

export interface ShopOperatorActor extends ShopActorIdentity {
  kind: "OPERATOR";
  role: "operator" | "admin";
}

export type ShopOrderLifecycleStatus = "ACTIVE" | "COMPLETED" | "CANCELLED" | "EXPIRED";
export type ShopPaymentReviewStatus =
  | "AWAITING_EVIDENCE"
  | "EVIDENCE_RECEIVED"
  | "UNDER_REVIEW"
  | "REVIEW_APPROVED"
  | "REVIEW_REJECTED";
export type ShopFundsConfirmationStatus = "UNCONFIRMED" | "CONFIRMED";
export type ShopFulfillmentStatus =
  | "NOT_STARTED"
  | "QUALITY_CHECK"
  | "READY_FOR_HANDOFF"
  | "IN_TRANSIT"
  | "DELIVERED";

export type ShopReturnReason =
  | "WRONG_SIZE"
  | "NOT_AS_DESCRIBED"
  | "DAMAGED"
  | "CHANGED_MIND"
  | "OTHER";
export type ShopReturnStatus = "REQUESTED" | "APPROVED" | "REJECTED" | "RECEIVED" | "RESOLVED";
export type ShopRefundStatus = "NOT_STARTED" | "PENDING" | "COMPLETED" | "FAILED";
export type ShopReturnDisposition = "RESTOCK" | "WRITE_OFF";

export interface ShopFundsConfirmation {
  transferReference: string;
  receivingAccountLabel: string;
  confirmedAt: string;
  verifierSubject?: string;
  verifierDisplayName: string;
}

export interface ShopFulfillmentFacts {
  kind: "DELIVERY" | "PICKUP";
  carrierName: string | null;
  trackingReference: string | null;
  pickupAppointment: string | null;
  recipientName: string | null;
  dispatchReference: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveryProofReference: string | null;
}

export interface ShopReturnView {
  id: string;
  status: ShopReturnStatus;
  reason: ShopReturnReason;
  detail: string;
  requestedAt: string;
  eligibleUntil: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  receivedAt: string | null;
  resolvedAt: string | null;
  resolutionNote: string | null;
  refundStatus: ShopRefundStatus;
  refundReference: string | null;
  refundAmount: number | null;
  refundCurrency: "NGN" | null;
  refundUpdatedAt: string | null;
  disposition: ShopReturnDisposition | null;
}

export interface ShopServerOrderLine {
  snapshot: "PRODUCT";
  slug: string;
  sku: string;
  name: string;
  taggedSize: string;
  unitPrice: number;
  quantity: 1;
}

export interface ShopOrderAuditEvent {
  id: string;
  eventType: string;
  actorKind: ShopActorKind;
  actorSubject?: string;
  visibility: "CUSTOMER" | "OPERATOR";
  lifecycleStatus: ShopOrderLifecycleStatus | null;
  paymentReviewStatus: ShopPaymentReviewStatus | null;
  fundsConfirmationStatus: ShopFundsConfirmationStatus | null;
  fulfillmentStatus: ShopFulfillmentStatus | null;
  note: string | null;
  metadata: Record<string, unknown> | null;
  occurredAt: string;
}

export type ShopPaymentEvidenceStatus = "AUTHORIZED" | "RECEIVED" | "SUPERSEDED";

export interface ShopPaymentEvidenceView {
  id: string;
  status: ShopPaymentEvidenceStatus;
  originalFileName: string;
  contentType: ShopPaymentEvidenceContentType;
  byteSize: number;
  sha256: string;
  authorizedAt: string;
  expiresAt: string;
  receivedAt: string | null;
  notice: string;
  blobPathname?: string;
}

export interface ShopServerOrder {
  id: string;
  reference: string;
  lines: ShopServerOrderLine[];
  contact: { name: string; email: string; phone: string };
  fulfillment: ShopCheckoutFulfillment;
  subtotal: number;
  deliveryFee: number;
  total: number;
  deliveryLabel: string;
  deliveryEstimate: string;
  savedAt: string;
  reservationExpiresAt: string | null;
  returnEligibleUntil: string | null;
  status: ShopOrderStatus;
  transmission: "SUBMITTED";
  lifecycleStatus: ShopOrderLifecycleStatus;
  paymentReviewStatus: ShopPaymentReviewStatus;
  fundsConfirmationStatus: ShopFundsConfirmationStatus;
  fundsConfirmation: ShopFundsConfirmation | null;
  fulfillmentStatus: ShopFulfillmentStatus;
  fulfillmentFacts: ShopFulfillmentFacts;
  return: ShopReturnView | null;
  version: number;
  evidence: ShopPaymentEvidenceView[];
  events: ShopOrderAuditEvent[];
  allowedTransitions: ShopOperatorTransition[];
  allowedReturnTransitions: ShopOperatorReturnTransition[];
  canRequestReturn: boolean;
}

export interface CreateShopOrderCommand {
  actor: ShopCustomerActor;
  intent: ShopCheckoutSubmissionIntent;
  requestFingerprint: string;
  now: Date;
  reservationExpiresAt: Date;
}

export type ShopOperatorTransition =
  | { dimension: "PAYMENT_REVIEW"; target: Exclude<ShopPaymentReviewStatus, "AWAITING_EVIDENCE" | "EVIDENCE_RECEIVED"> }
  | { dimension: "FULFILLMENT"; target: "QUALITY_CHECK" | "READY_FOR_HANDOFF" | "IN_TRANSIT" | "DELIVERED" }
  | { dimension: "FUNDS_CONFIRMATION"; target: "CONFIRMED" }
  | { dimension: "LIFECYCLE"; target: "CANCELLED" | "EXPIRED" };

export type ShopOrderTransitionDetails =
  | {
      kind: "FUNDS_CONFIRMATION";
      transferReference: string;
      receivingAccountLabel: string;
    }
  | {
      kind: "DELIVERY_DISPATCH";
      carrierName: string;
      trackingReference: string;
      dispatchReference: string;
      dispatchedAt: string;
    }
  | {
      kind: "DELIVERY_COMPLETE";
      recipientName: string;
      deliveredAt: string;
      deliveryProofReference: string;
    }
  | {
      kind: "PICKUP_COMPLETE";
      pickupAppointment: string;
      recipientName: string;
      deliveredAt: string;
      deliveryProofReference: string;
    };

export interface TransitionShopOrderCommand {
  actor: ShopOperatorActor;
  reference: string;
  expectedVersion: number;
  transition: ShopOperatorTransition;
  details: ShopOrderTransitionDetails | null;
  note: string | null;
  returnEligibleUntil: Date | null;
  now: Date;
}

export interface RequestShopReturnCommand {
  actor: ShopCustomerActor;
  reference: string;
  idempotencyKey: string;
  requestFingerprint: string;
  reason: ShopReturnReason;
  detail: string;
  now: Date;
}

export type ShopOperatorReturnTransition =
  | { dimension: "RETURN"; target: "APPROVED" | "REJECTED" | "RECEIVED" }
  | { dimension: "REFUND"; target: "PENDING" | "COMPLETED" | "FAILED" }
  | { dimension: "RETURN_RESOLUTION"; target: ShopReturnDisposition };

export interface TransitionShopReturnCommand {
  actor: ShopOperatorActor;
  reference: string;
  expectedVersion: number;
  transition: ShopOperatorReturnTransition;
  refundReference: string | null;
  refundAmount: number | null;
  refundCurrency: "NGN" | null;
  note: string | null;
  now: Date;
}

export const shopPaymentEvidenceContentTypes = [
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
] as const;
export type ShopPaymentEvidenceContentType = (typeof shopPaymentEvidenceContentTypes)[number];
export const SHOP_PAYMENT_EVIDENCE_MAX_BYTES = 5_000_000;

export interface AuthorizePaymentEvidenceCommand {
  actor: ShopCustomerActor;
  reference: string;
  idempotencyKey: string;
  requestFingerprint: string;
  originalFileName: string;
  contentType: ShopPaymentEvidenceContentType;
  byteSize: number;
  sha256: string;
  now: Date;
  expiresAt: Date;
}

export interface PaymentEvidenceAuthorization {
  id: string;
  orderId: string;
  orderReference: string;
  customerId: string;
  status: ShopPaymentEvidenceStatus;
  originalFileName: string;
  contentType: ShopPaymentEvidenceContentType;
  byteSize: number;
  sha256: string;
  authorizedAt: string;
  expiresAt: string;
  receivedAt: string | null;
  blobPathname: string | null;
  blobUrl: string | null;
}

export interface CompletePaymentEvidenceCommand {
  actor: ShopCustomerActor;
  reference: string;
  authorizationId: string;
  contentType: ShopPaymentEvidenceContentType;
  byteSize: number;
  sha256: string;
  blobPathname: string;
  blobUrl: string;
  now: Date;
}

export interface ShopNotificationOutboxMessage {
  id: string;
  orderId: string;
  customerId: string;
  topic: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;
}

export interface ShopOrderStore {
  createOrder(command: CreateShopOrderCommand): Promise<ShopServerOrder>;
  listCustomerOrders(authSubject: string, limit: number): Promise<ShopServerOrder[]>;
  getCustomerOrder(authSubject: string, reference: string): Promise<ShopServerOrder | null>;
  listOperatorOrders(limit: number): Promise<ShopServerOrder[]>;
  getOperatorOrder(reference: string): Promise<ShopServerOrder | null>;
  transitionOrder(command: TransitionShopOrderCommand): Promise<ShopServerOrder>;
  requestReturn(command: RequestShopReturnCommand): Promise<ShopServerOrder>;
  transitionReturn(command: TransitionShopReturnCommand): Promise<ShopServerOrder>;
  authorizePaymentEvidence(command: AuthorizePaymentEvidenceCommand): Promise<PaymentEvidenceAuthorization>;
  getPaymentEvidenceAuthorization(
    authSubject: string,
    reference: string,
    authorizationId: string,
  ): Promise<PaymentEvidenceAuthorization | null>;
  completePaymentEvidence(command: CompletePaymentEvidenceCommand): Promise<ShopServerOrder>;
  claimPreviewOutbox(workerId: string, limit: number, now: Date): Promise<ShopNotificationOutboxMessage[]>;
  markPreviewOutboxDelivered(messageId: string, workerId: string, now: Date): Promise<void>;
  markPreviewOutboxFailed(messageId: string, workerId: string, error: string, retryAt: Date): Promise<void>;
}

export type ShopOrderErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "INVALID_REQUEST"
  | "NOT_FOUND"
  | "IDEMPOTENCY_MISMATCH"
  | "INVENTORY_UNAVAILABLE"
  | "VERSION_CONFLICT"
  | "INVALID_TRANSITION"
  | "RETURN_WINDOW_CLOSED"
  | "EVIDENCE_AUTHORIZATION_EXPIRED"
  | "EVIDENCE_MISMATCH"
  | "PAYLOAD_TOO_LARGE"
  | "PERSISTENCE_UNAVAILABLE";

export class ShopOrderError extends Error {
  constructor(readonly code: ShopOrderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShopOrderError";
  }
}
