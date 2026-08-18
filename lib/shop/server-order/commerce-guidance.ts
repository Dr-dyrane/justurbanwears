import { ShopOrderError, type ShopServerOrder } from "./types";

export interface ShopBankTransferInstructions {
  available: true;
  bankName: string;
  accountName: string;
  accountNumber: string;
  currency: "NGN";
}

export interface ShopUnavailablePaymentInstructions {
  available: false;
  message: string;
}

export interface ShopCommerceGuidance {
  payment: ShopBankTransferInstructions | ShopUnavailablePaymentInstructions;
  support: {
    email: string | null;
    phone: string | null;
  };
  pickup: {
    location: string | null;
    contact: string | null;
  };
  returns: {
    location: string | null;
    contact: string | null;
    instructions: string | null;
  };
}

function cleanEnvironmentText(value: string | undefined, maximum: number): string | null {
  if (!value) return null;
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned && cleaned.length <= maximum ? cleaned : null;
}

function cleanEmail(value: string | undefined): string | null {
  const cleaned = cleanEnvironmentText(value, 320)?.toLowerCase() ?? null;
  return cleaned && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleaned) ? cleaned : null;
}

function cleanPhone(value: string | undefined): string | null {
  const cleaned = cleanEnvironmentText(value, 32);
  return cleaned && /^\+?[0-9 ()-]{7,24}$/.test(cleaned) ? cleaned : null;
}

function cleanInternationalPhone(value: string | undefined): string | null {
  const digits = cleanEnvironmentText(value, 32)?.replace(/\D/g, "") ?? "";
  return digits.length >= 8 && digits.length <= 15 ? `+${digits}` : null;
}

export function getShopCommerceGuidance(): ShopCommerceGuidance {
  const bankName = cleanEnvironmentText(process.env.SHOP_PAYMENT_BANK_NAME, 120);
  const accountName = cleanEnvironmentText(process.env.SHOP_PAYMENT_ACCOUNT_NAME, 120);
  const rawAccountNumber = cleanEnvironmentText(process.env.SHOP_PAYMENT_ACCOUNT_NUMBER, 24);
  const accountNumber = rawAccountNumber?.replace(/[ -]/g, "") ?? null;
  const payment = bankName && accountName && accountNumber && /^\d{10}$/.test(accountNumber)
    ? {
        available: true as const,
        bankName,
        accountName,
        accountNumber,
        currency: "NGN" as const,
      }
    : {
        available: false as const,
        message: "Bank transfer is being updated. No order will be reserved until payment details are ready.",
      };
  const supportEmail = cleanEmail(process.env.SHOP_CUSTOMER_SUPPORT_EMAIL);
  const supportPhone = cleanPhone(process.env.SHOP_CUSTOMER_SUPPORT_PHONE)
    ?? cleanInternationalPhone(process.env.SHOP_WHATSAPP_ORDER_NUMBER);
  const sharedContact = supportPhone ?? supportEmail;

  return {
    payment,
    support: { email: supportEmail, phone: supportPhone },
    pickup: {
      location: cleanEnvironmentText(process.env.SHOP_PICKUP_LOCATION, 240),
      contact: cleanEnvironmentText(process.env.SHOP_PICKUP_CONTACT, 120) ?? sharedContact,
    },
    returns: {
      location: cleanEnvironmentText(process.env.SHOP_RETURN_HANDOFF_LOCATION, 240),
      contact: cleanEnvironmentText(process.env.SHOP_RETURN_HANDOFF_CONTACT, 120) ?? sharedContact,
      instructions: cleanEnvironmentText(process.env.SHOP_RETURN_HANDOFF_INSTRUCTIONS, 500),
    },
  };
}

export function requireShopPaymentInstructions(): ShopBankTransferInstructions {
  const guidance = getShopCommerceGuidance();
  if (!guidance.payment.available) {
    throw new ShopOrderError("PAYMENT_CONFIGURATION_UNAVAILABLE", guidance.payment.message);
  }
  return guidance.payment;
}

export function trackingUrlForOrder(order: ShopServerOrder): string | null {
  const reference = order.fulfillmentFacts.trackingReference;
  if (!reference || order.fulfillment.kind !== "DELIVERY") return null;
  const template = cleanEnvironmentText(process.env.SHOP_TRACKING_URL_TEMPLATE, 500);
  if (!template || !template.includes("{reference}")) return null;
  try {
    const value = template
      .replaceAll("{reference}", encodeURIComponent(reference))
      .replaceAll("{carrier}", encodeURIComponent(order.fulfillmentFacts.carrierName ?? ""));
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}
