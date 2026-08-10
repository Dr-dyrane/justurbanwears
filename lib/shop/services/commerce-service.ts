import { shopProducts } from "../catalog";
import { shopDeliveryOptions } from "../commerce";
import { createBrowserShopCatalogPort } from "../db/browser-wardrobe-public-view";
import { createBrowserLocalShopRepository } from "../db/browser-local-repository";
import type {
  BagItem,
  ShopDeliveryId,
  ShopOrder,
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
    createOrder(snapshot: CommerceSnapshot, deliveryId: ShopDeliveryId): ShopOrder | null {
      const seen = new Set<string>();
      const products = snapshot.bag.flatMap((item) => {
        const product = catalog.getProduct(item.slug);
        if (!product || product.availability !== "AVAILABLE" || seen.has(product.slug)) return [];
        seen.add(product.slug);
        return [product];
      });
      if (!products.length) return null;

      const delivery = shopDeliveryOptions.find((option) => option.id === deliveryId)
        ?? shopDeliveryOptions[0];
      const subtotal = products.reduce((sum, product) => sum + product.price, 0);
      const placedAt = now();
      return {
        id: createReference(placedAt),
        itemSlugs: products.map((product) => product.slug),
        subtotal,
        deliveryFee: delivery.fee,
        total: subtotal + delivery.fee,
        deliveryLabel: delivery.label,
        deliveryEstimate: delivery.estimate,
        placedAt: placedAt.toISOString(),
        status: "ORDER_RECEIVED",
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
