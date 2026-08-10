import type {
  BagItem,
  ShopAvailability,
  ShopCheckoutCreationResult,
  ShopCheckoutRequest,
  ShopProduct,
} from "../domain/entities";
import type { CommerceSnapshot, ConnectivityState } from "../domain/state";

export interface ShopStateRepository {
  read(): Promise<CommerceSnapshot>;
  write(snapshot: CommerceSnapshot): Promise<void>;
  subscribe(listener: (snapshot: CommerceSnapshot) => void): () => void;
}

export interface ShopCatalogPort {
  hydrate(): Promise<ShopProduct[]>;
  list(): readonly ShopProduct[];
  getProduct(slug: string): ShopProduct | undefined;
  subscribe(listener: (products: ShopProduct[]) => void): () => void;
}

export interface CommerceService {
  hydrateCatalog(): Promise<ShopProduct[]>;
  listProducts(): readonly ShopProduct[];
  getProduct(slug: string): ShopProduct | undefined;
  subscribeCatalog(listener: (products: ShopProduct[]) => void): () => void;
  hydrate(): Promise<CommerceSnapshot>;
  persist(snapshot: CommerceSnapshot): Promise<void>;
  subscribe(listener: (snapshot: CommerceSnapshot) => void): () => void;
  readConnectivity(): ConnectivityState;
  subscribeConnectivity(listener: (state: ConnectivityState) => void): () => void;
  getProductAvailability(slug: string): ShopAvailability | null;
  createCheckout(
    snapshot: CommerceSnapshot,
    request: ShopCheckoutRequest,
  ): ShopCheckoutCreationResult;
  normalizeBagItem(item: BagItem): BagItem | null;
}
