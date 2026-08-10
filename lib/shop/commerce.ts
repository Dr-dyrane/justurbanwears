import type {
  ShopDeliveryOption,
  ShopOrder,
  ShopOrderStatus,
} from "./domain/entities";

export const shopDeliveryOptions: ShopDeliveryOption[] = [
  {
    id: "lagos",
    label: "Lagos delivery",
    note: "Door delivery within Lagos.",
    fee: 2500,
    estimate: "1–3 working days",
  },
  {
    id: "pickup",
    label: "Studio pickup",
    note: "Lagos collection by appointment.",
    fee: 0,
    estimate: "After payment",
  },
  {
    id: "nationwide",
    label: "Nationwide delivery",
    note: "Delivery to other Nigerian states.",
    fee: 4500,
    estimate: "3–7 working days",
  },
];

export const checkoutProgress: Array<{
  id: "SAVED" | "PAYMENT" | "FULFILMENT";
  label: string;
  note: string;
}> = [
  { id: "SAVED", label: "Checkout saved", note: "On this device." },
  { id: "PAYMENT", label: "Secure payment", note: "Required next." },
  { id: "FULFILMENT", label: "Fulfilment", note: "Starts after payment." },
];

export function getOrderStep(order: ShopOrder) {
  return order.status === "PAYMENT_REQUIRED" ? 1 : 2;
}

export function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(date);
}

export function getOrderStatusLabel(status: ShopOrderStatus) {
  const labels: Record<ShopOrderStatus, string> = {
    PAYMENT_REQUIRED: "Payment required",
    ORDER_RECEIVED: "Order received",
    QUALITY_CHECK: "Quality check",
    READY_FOR_HANDOFF: "Ready for handoff",
    IN_TRANSIT: "In transit",
    DELIVERED: "Delivered",
    CANCELLED: "Cancelled",
  };
  return labels[status];
}

export type {
  ShopDeliveryId,
  ShopDeliveryOption,
  ShopOrder,
  ShopOrderStatus,
} from "./domain/entities";
