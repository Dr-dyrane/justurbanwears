import type {
  BagItem,
  ShopAvailability,
  ShopDeliveryId,
  ShopOrder,
} from "../domain/entities";
import type { CommerceSnapshot, ConnectivityState } from "../domain/state";

export interface ShopStateRepository {
  read(): Promise<CommerceSnapshot>;
  write(snapshot: CommerceSnapshot): Promise<void>;
  subscribe(listener: (snapshot: CommerceSnapshot) => void): () => void;
}

export interface CommerceService {
  hydrate(): Promise<CommerceSnapshot>;
  persist(snapshot: CommerceSnapshot): Promise<void>;
  subscribe(listener: (snapshot: CommerceSnapshot) => void): () => void;
  readConnectivity(): ConnectivityState;
  subscribeConnectivity(listener: (state: ConnectivityState) => void): () => void;
  getProductAvailability(slug: string): ShopAvailability | null;
  createOrder(snapshot: CommerceSnapshot, deliveryId: ShopDeliveryId): ShopOrder | null;
  normalizeBagItem(item: BagItem): BagItem | null;
}
