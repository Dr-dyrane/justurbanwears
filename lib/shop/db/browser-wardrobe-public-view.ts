import { createBrowserWardrobePublicViewRepository } from "../../wardrobe-public-view/db/browser-repository";
import type { ShopProduct } from "../domain/entities";
import {
  createShopProductMigrationSeeds,
  mergeWardrobePublicView,
} from "../wardrobe-public-view";
import type { ShopCatalogPort } from "../services/contracts";

export function createBrowserShopCatalogPort(): ShopCatalogPort {
  const repository = createBrowserWardrobePublicViewRepository();
  const migrationSeeds = createShopProductMigrationSeeds();
  let products: ShopProduct[] = [...migrationSeeds];

  function receive(snapshot: Awaited<ReturnType<typeof repository.read>>) {
    products = mergeWardrobePublicView(migrationSeeds, snapshot);
    return products;
  }

  return {
    async hydrate() {
      return receive(await repository.read());
    },
    list: () => products,
    getProduct: (slug) => products.find((product) => product.slug === slug),
    subscribe(listener) {
      return repository.subscribe((snapshot) => listener(receive(snapshot)));
    },
  };
}
