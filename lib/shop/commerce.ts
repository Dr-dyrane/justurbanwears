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
    note: "Collect in person after confirmation.",
    fee: 0,
    estimate: "Next working day",
  },
  {
    id: "nationwide",
    label: "Nationwide delivery",
    note: "Delivery to other Nigerian states.",
    fee: 4500,
    estimate: "3–7 working days",
  },
];

export const orderTimeline: Array<{
  status: ShopOrderStatus;
  label: string;
  note: string;
}> = [
  { status: "ORDER_RECEIVED", label: "Order received", note: "Saved to this device." },
  { status: "QUALITY_CHECK", label: "Quality check", note: "The garment condition is confirmed before handoff." },
  { status: "READY_FOR_HANDOFF", label: "Ready for handoff", note: "The piece is prepared for pickup or courier collection." },
  { status: "IN_TRANSIT", label: "In transit", note: "The carrier has accepted the parcel." },
  { status: "DELIVERED", label: "Delivered", note: "The parcel has reached its destination." },
];

export function getOrderStep(order: ShopOrder) {
  const index = orderTimeline.findIndex((item) => item.status === order.status);
  return Math.max(index, 0);
}

export function formatOrderDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", { dateStyle: "long" }).format(date);
}

export function getOrderStatusLabel(status: ShopOrderStatus) {
  return orderTimeline.find((item) => item.status === status)?.label ?? "Order received";
}

export type {
  ShopDeliveryId,
  ShopDeliveryOption,
  ShopOrder,
  ShopOrderStatus,
} from "./domain/entities";
