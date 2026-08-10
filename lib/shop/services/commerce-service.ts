import { shopProducts } from "../catalog";
import { shopDeliveryOptions } from "../commerce";
import { createBrowserShopCatalogPort } from "../db/browser-wardrobe-public-view";
import { createBrowserLocalShopRepository } from "../db/browser-local-repository";
import type {
  BagItem,
  ShopCheckoutContact,
  ShopCheckoutFulfillment,
  ShopCheckoutRequest,
} from "../domain/entities";
import type { CommerceSnapshot } from "../domain/state";
import type { CommerceService, ShopCatalogPort, ShopStateRepository } from "./contracts";

interface CommerceServiceDependencies {
  repository: ShopStateRepository;
  catalog?: ShopCatalogPort;
  now?: () => Date;
  createReference?: (date: Date) => string;
}

function createStaticMigrationCatalogPort(): ShopCatalogPort {
  const products = [...shopProducts];
  return {
    hydrate: async () => products,
    list: () => products,
    getProduct: (slug) => products.find((product) => product.slug === slug),
    subscribe: () => () => undefined,
  };
}

function createLocalOrderReference(date: Date) {
  const day = date.toISOString().slice(0, 10).replaceAll("-", "");
  const entropy = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().replaceAll("-", "").slice(0, 6)
    : date.getTime().toString(36).slice(-6);
  return `JUW-${day}-${entropy.toUpperCase()}`;
}

function cleanField(value: string, maximum: number) {
  const cleaned = value.trim().replace(/\s+/g, " ");
  return cleaned.length <= maximum ? cleaned : "";
}

function normalizeContact(contact: ShopCheckoutContact): ShopCheckoutContact | null {
  const name = cleanField(contact.name, 100);
  const email = contact.email.trim().toLowerCase();
  const phone = cleanField(contact.phone, 30);
  if (
    name.length < 2
    || email.length > 160
    || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
    || phone.replace(/\D/g, "").length < 7
  ) {
    return null;
  }
  return { name, email, phone };
}

function normalizeFulfillment(
  fulfillment: ShopCheckoutFulfillment,
): ShopCheckoutFulfillment | null {
  if (fulfillment.kind === "PICKUP") {
    return fulfillment.optionId === "pickup"
      ? { kind: "PICKUP", optionId: "pickup" }
      : null;
  }
  if (fulfillment.optionId !== "lagos" && fulfillment.optionId !== "nationwide") return null;
  const street = cleanField(fulfillment.address.street, 180);
  const area = cleanField(fulfillment.address.area, 100);
  const state = cleanField(fulfillment.address.state, 100);
  if (!street || !area || !state || fulfillment.address.country !== "Nigeria") return null;
  return {
    kind: "DELIVERY",
    optionId: fulfillment.optionId,
    address: { street, area, state, country: "Nigeria" },
  };
}

export function createCommerceService({
  repository,
  catalog = createStaticMigrationCatalogPort(),
  now = () => new Date(),
  createReference = createLocalOrderReference,
}: CommerceServiceDependencies): CommerceService {
  let catalogHydration: ReturnType<ShopCatalogPort["hydrate"]> | null = null;
  const hydrateCatalog = () => {
    catalogHydration ??= catalog.hydrate();
    return catalogHydration;
  };
  return {
    hydrateCatalog,
    listProducts: () => catalog.list(),
    getProduct: (slug) => catalog.getProduct(slug),
    subscribeCatalog: (listener) => catalog.subscribe(listener),
    async hydrate() {
      await hydrateCatalog();
      return repository.read();
    },
    persist: (snapshot) => repository.write(snapshot),
    subscribe: (listener) => repository.subscribe(listener),
    readConnectivity() {
      if (typeof window === "undefined") return "online";
      return window.navigator.onLine ? "online" : "offline";
    },
    subscribeConnectivity(listener) {
      if (typeof window === "undefined") return () => undefined;
      const notify = () => listener(window.navigator.onLine ? "online" : "offline");
      window.addEventListener("online", notify);
      window.addEventListener("offline", notify);
      return () => {
        window.removeEventListener("online", notify);
        window.removeEventListener("offline", notify);
      };
    },
    getProductAvailability(slug) {
      return catalog.getProduct(slug)?.availability ?? null;
    },
    normalizeBagItem(item: BagItem) {
      const product = catalog.getProduct(item.slug);
      if (!product || product.availability !== "AVAILABLE") return null;
      return { slug: product.slug, size: product.taggedSize };
    },
    createCheckout(snapshot: CommerceSnapshot, request: ShopCheckoutRequest) {
      if (!snapshot.bag.length) return { ok: false, reason: "EMPTY_BAG" } as const;
      const contact = normalizeContact(request.contact);
      const fulfillment = normalizeFulfillment(request.fulfillment);
      if (!contact || !fulfillment) return { ok: false, reason: "INVALID_CHECKOUT" } as const;

      const seen = new Set<string>();
      const products = snapshot.bag.flatMap((item) => {
        const product = catalog.getProduct(item.slug);
        if (
          !product
          || product.availability !== "AVAILABLE"
          || item.size !== product.taggedSize
          || seen.has(product.slug)
        ) return [];
        seen.add(product.slug);
        return [product];
      });
      if (products.length !== snapshot.bag.length) {
        return { ok: false, reason: "BAG_CHANGED" } as const;
      }

      const delivery = shopDeliveryOptions.find((option) => option.id === fulfillment.optionId);
      if (!delivery) return { ok: false, reason: "INVALID_CHECKOUT" } as const;
      const subtotal = products.reduce((sum, product) => sum + product.price, 0);
      const savedAt = now();
      return {
        ok: true,
        order: {
          id: createReference(savedAt),
          lines: products.map((product) => {
            const image = product.media?.[0];
            return {
              snapshot: "PRODUCT" as const,
              slug: product.slug,
              sku: product.sku,
              name: product.name,
              taggedSize: product.taggedSize,
              unitPrice: product.price,
              quantity: 1 as const,
              ...(image ? { imageSrc: image.src, imageAlt: image.alt } : {}),
            };
          }),
          contact,
          fulfillment,
          subtotal,
          deliveryFee: delivery.fee,
          total: subtotal + delivery.fee,
          deliveryLabel: delivery.label,
          deliveryEstimate: delivery.estimate,
          savedAt: savedAt.toISOString(),
          status: "PAYMENT_REQUIRED",
          transmission: "LOCAL_ONLY",
        },
      };
    },
  };
}

export function createBrowserCommerceService() {
  const catalog = createBrowserShopCatalogPort();
  return createCommerceService({
    catalog,
    repository: createBrowserLocalShopRepository((slug) => catalog.getProduct(slug)),
  });
}
