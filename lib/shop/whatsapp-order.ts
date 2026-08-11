export interface WhatsAppOrderLineSummary {
  name: string;
  sku: string;
  taggedSize: string;
  unitPrice: number;
  quantity: 1;
}

export interface WhatsAppOrderSummary {
  reference: string;
  contact: {
    name: string;
    email: string;
    phone: string;
  };
  fulfillment:
    | {
        kind: "PICKUP";
        label: string;
        estimate: string;
      }
    | {
        kind: "DELIVERY";
        label: string;
        estimate: string;
        address: {
          street: string;
          area: string;
          state: string;
          country: "Nigeria";
        };
      };
  lines: WhatsAppOrderLineSummary[];
  subtotal: number;
  deliveryFee: number;
  total: number;
}

function cleanText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function formatNaira(value: number) {
  return `₦${value.toLocaleString("en-NG")}`;
}

export function normalizeWhatsAppOrderNumber(value: string | null | undefined) {
  const candidate = value?.trim() ?? "";
  if (!/^\+?[\d\s()-]+$/.test(candidate)) return null;
  const digits = candidate.replace(/\D/g, "");
  return /^[1-9]\d{7,14}$/.test(digits) ? digits : null;
}

export function createWhatsAppOrderMessage(summary: WhatsAppOrderSummary) {
  const lines = summary.lines.map((line) =>
    `- ${cleanText(line.name)} (${cleanText(line.sku)}), size ${cleanText(line.taggedSize)}, quantity ${line.quantity}: ${formatNaira(line.unitPrice)}`
  );
  const fulfillment = summary.fulfillment.kind === "PICKUP"
    ? [
        `Handoff: ${cleanText(summary.fulfillment.label)}`,
        `Estimate: ${cleanText(summary.fulfillment.estimate)}`,
      ]
    : [
        `Delivery: ${cleanText(summary.fulfillment.label)}`,
        `Estimate: ${cleanText(summary.fulfillment.estimate)}`,
        `Address: ${cleanText(summary.fulfillment.address.street)}, ${cleanText(summary.fulfillment.address.area)}, ${cleanText(summary.fulfillment.address.state)}, ${summary.fulfillment.address.country}`,
      ];

  return [
    "Hello Just Urban Wears, I would like to place this order.",
    "",
    `Order reference: ${cleanText(summary.reference)}`,
    "",
    "Items:",
    ...lines,
    "",
    `Subtotal: ${formatNaira(summary.subtotal)}`,
    `Delivery fee: ${formatNaira(summary.deliveryFee)}`,
    `Total: ${formatNaira(summary.total)}`,
    "",
    ...fulfillment,
    "",
    `Name: ${cleanText(summary.contact.name)}`,
    `Phone: ${cleanText(summary.contact.phone)}`,
    `Email: ${cleanText(summary.contact.email)}`,
    "",
    "Please confirm availability and payment instructions.",
  ].join("\n");
}

export function createWhatsAppOrderUrl(
  number: string | null | undefined,
  summary: WhatsAppOrderSummary,
) {
  const normalizedNumber = normalizeWhatsAppOrderNumber(number);
  if (!normalizedNumber) return null;
  return `https://wa.me/${normalizedNumber}?text=${encodeURIComponent(createWhatsAppOrderMessage(summary))}`;
}
