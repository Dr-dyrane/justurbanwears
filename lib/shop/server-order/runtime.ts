import { PostgresShopOrderStore } from "./postgres-store";
import { ShopOrderService } from "./service";

const store = new PostgresShopOrderStore();
const service = new ShopOrderService(store);

export function getShopOrderStore() {
  return store;
}

export function getShopOrderService() {
  return service;
}
