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
  workspaceId: string;
  workspaceSubject: string;
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
export type ShopOrderSource = "ONLINE" | "PHONE" | "DM" | "IN_PERSON";
export type ShopCancellationRecoveryStatus = "PENDING" | "FAILED" | "COMPLETED";

export interface ShopFundsConfirmation {
  transferReference: string;
  receivingAccountLabel: string;
  paidAmount: number | null;
  paidCurrency: "NGN" | null;
  confirmedAt: string;
  updatedAt: string;
  verifierSubject?: string;
  verifierDisplayName: string;
}

export interface ShopFulfillmentFacts {
  kind: "DELIVERY" | "PICKUP";
  carrierName: string | null;
  trackingReference: string | null;
  trackingUrl: string | null;
  pickupAppointment: string | null;
  recipientName: string | null;
  dispatchReference: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  deliveryProofReference: string | null;
}

export interface ShopReturnLineView {
  orderItemId?: string | null;
  sku: string;
  name: string;
  unitPrice: number;
  refundCapAmount?: number;
  disposition: ShopReturnDisposition | null;
}

export interface ShopCancellationRecovery {
  status: ShopCancellationRecoveryStatus;
  reason: string;
  requestedAt: string;
  updatedAt: string;
  refundReference: string | null;
  refundAmount: number | null;
  refundCurrency: "NGN" | null;
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
  items: ShopReturnLineView[];
  correctionCount: number;
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

export type ShopOperatorTransitionCommandKind = "ORDER" | "RETURN";

export interface ShopOperatorTransitionReceipt {
  version: 1;
  receiptId: string;
  commandKind: ShopOperatorTransitionCommandKind;
  orderId: string;
  reference: string;
  actorSubject: string;
  expectedVersion: number;
  resultingVersion: number;
  dimension: ShopOperatorTransition["dimension"] | ShopOperatorReturnTransition["dimension"];
  target: ShopOperatorTransition["target"] | ShopOperatorReturnTransition["target"];
  idempotencyKey: string;
  requestFingerprint: string;
  occurredAt: string;
}

export interface ShopOperatorTransitionResult {
  order: ShopServerOrder;
  receipt: ShopOperatorTransitionReceipt;
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
  source: ShopOrderSource;
  lifecycleStatus: ShopOrderLifecycleStatus;
  paymentReviewStatus: ShopPaymentReviewStatus;
  fundsConfirmationStatus: ShopFundsConfirmationStatus;
  fundsConfirmation: ShopFundsConfirmation | null;
  fulfillmentStatus: ShopFulfillmentStatus;
  fulfillmentFacts: ShopFulfillmentFacts;
  cancellationRecovery: ShopCancellationRecovery | null;
  return: ShopReturnView | null;
  version: number;
  evidence: ShopPaymentEvidenceView[];
  events: ShopOrderAuditEvent[];
  allowedTransitions: ShopOperatorTransition[];
  allowedReturnTransitions: ShopOperatorReturnTransition[];
  canRequestReturn: boolean;
  canRequestPaidCancellation: boolean;
}

export interface CreateShopOrderCommand {
  actor: ShopCustomerActor;
  intent: ShopCheckoutSubmissionIntent;
  requestFingerprint: string;
  now: Date;
  reservationExpiresAt: Date;
  source?: ShopOrderSource;
  createdBy?: ShopOperatorActor;
  sourceNote?: string | null;
}

export interface CreateAssistedShopOrderCommand {
  actor: ShopOperatorActor;
  intent: ShopCheckoutSubmissionIntent;
  source: Exclude<ShopOrderSource, "ONLINE">;
  sourceNote: string | null;
  requestFingerprint: string;
  now: Date;
  reservationExpiresAt: Date;
}

export type ShopCustomerOrderAction =
  | { action: "CANCEL"; reason: string }
  | { action: "UPDATE_CONTACT"; contact: { name: string; email: string; phone: string } }
  | { action: "UPDATE_FULFILLMENT"; fulfillment: ShopCheckoutFulfillment }
  | { action: "REQUEST_PAID_CANCELLATION"; reason: string };

export interface MutateCustomerOrderCommand {
  actor: ShopCustomerActor;
  reference: string;
  expectedVersion: number;
  mutation: ShopCustomerOrderAction;
  now: Date;
}

export type ShopOperatorTransition =
  | { dimension: "PAYMENT_REVIEW"; target: Exclude<ShopPaymentReviewStatus, "AWAITING_EVIDENCE" | "EVIDENCE_RECEIVED"> }
  | { dimension: "FULFILLMENT"; target: "QUALITY_CHECK" | "READY_FOR_HANDOFF" | "IN_TRANSIT" | "DELIVERED" }
  | { dimension: "FUNDS_CONFIRMATION"; target: "CONFIRMED" | "CORRECTED" }
  | { dimension: "PICKUP"; target: "SCHEDULED" }
  | { dimension: "CANCELLATION_REFUND"; target: "PENDING" | "COMPLETED" | "FAILED" }
  | { dimension: "LIFECYCLE"; target: "CANCELLED" | "EXPIRED" };

export type ShopOrderTransitionDetails =
  | {
      kind: "FUNDS_CONFIRMATION";
      transferReference: string;
      receivingAccountLabel: string;
      paidAmount: number;
      paidCurrency: "NGN";
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
    }
  | {
      kind: "PICKUP_SCHEDULE";
      pickupAppointment: string;
    }
  | {
      kind: "CANCELLATION_REFUND";
      refundReference: string | null;
      refundAmount: number | null;
      refundCurrency: "NGN" | null;
    };

export interface TransitionShopOrderCommand {
  actor: ShopOperatorActor;
  reference: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
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
  lineSkus: string[];
  expectedVersion: number | null;
  correction: boolean;
  now: Date;
}

export type ShopOperatorReturnTransition =
  | { dimension: "RETURN"; target: "APPROVED" | "REJECTED" | "RECEIVED" }
  | { dimension: "REFUND"; target: "PENDING" | "COMPLETED" | "FAILED" }
  | { dimension: "RETURN_RESOLUTION"; target: "RESOLVE_ITEMS" };

export interface ShopReturnLineDisposition {
  sku: string;
  disposition: ShopReturnDisposition;
}

export interface TransitionShopReturnCommand {
  actor: ShopOperatorActor;
  reference: string;
  expectedVersion: number;
  idempotencyKey: string;
  requestFingerprint: string;
  transition: ShopOperatorReturnTransition;
  refundReference: string | null;
  refundAmount: number | null;
  refundCurrency: "NGN" | null;
  lineDispositions: ShopReturnLineDisposition[];
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
  recipientEmail: string;
  recipientName: string | null;
  topic: string;
  dedupeKey: string;
  payload: Record<string, unknown>;
  attempts: number;
  createdAt: string;
}

export type ShopOrderListFilter =
  | "ALL"
  | "ACTIVE"
  | "COMPLETED"
  | "CANCELLED"
  | "RETURNS"
  | "NEEDS_ACTION";

export interface ShopOrderListQuery {
  page: number;
  limit: number;
  search: string;
  filter: ShopOrderListFilter;
}

export interface ShopOrderPage {
  orders: ShopServerOrder[];
  page: number;
  nextPage: number | null;
}

export interface ShopOrderStore {
  claimCustomerIdentity(actor: ShopCustomerActor, now: Date): Promise<void>;
  createOrder(command: CreateShopOrderCommand): Promise<ShopServerOrder>;
  createAssistedOrder(command: CreateAssistedShopOrderCommand): Promise<ShopServerOrder>;
  listCustomerOrders(authSubject: string, limit: number): Promise<ShopServerOrder[]>;
  pageCustomerOrders(authSubject: string, query: ShopOrderListQuery): Promise<ShopOrderPage>;
  getCustomerOrder(authSubject: string, reference: string): Promise<ShopServerOrder | null>;
  mutateCustomerOrder(command: MutateCustomerOrderCommand): Promise<ShopServerOrder>;
  expireReservations(now: Date, limit: number): Promise<number>;
  listOperatorOrders(limit: number): Promise<ShopServerOrder[]>;
  pageOperatorOrders(query: ShopOrderListQuery): Promise<ShopOrderPage>;
  getOperatorOrder(reference: string): Promise<ShopServerOrder | null>;
  getOperatorTransitionReceipt(
    actorSubject: string,
    reference: string,
    idempotencyKey: string,
  ): Promise<ShopOperatorTransitionReceipt | null>;
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
  | "PAYMENT_CONFIGURATION_UNAVAILABLE"
  | "PERSISTENCE_UNAVAILABLE";

export class ShopOrderError extends Error {
  constructor(readonly code: ShopOrderErrorCode, message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ShopOrderError";
  }
}
