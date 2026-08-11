import type {
  BagItem,
  ShopCheckoutAvailabilityConfirmation,
} from "../domain/entities";
import type { CheckoutAvailabilityPort } from "../services/contracts";

type Fetcher = typeof globalThis.fetch;

export function createBrowserCheckoutAvailabilityPort(
  fetcher: Fetcher = globalThis.fetch,
): CheckoutAvailabilityPort {
  return {
    async confirm(lines: readonly BagItem[]): Promise<ShopCheckoutAvailabilityConfirmation> {
      try {
        const response = await fetcher("/api/shop/catalogue/availability", {
          method: "POST",
          cache: "no-store",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ lines }),
        });
        const value: unknown = await response.json();
        if (
          value
          && typeof value === "object"
          && "status" in value
          && (value.status === "CONFIRMED"
            || value.status === "CHANGED"
            || value.status === "UNAVAILABLE")
        ) return value.status;
      } catch {
        // A failed stock check must pause the one-off handoff.
      }
      return "UNAVAILABLE";
    },
  };
}
