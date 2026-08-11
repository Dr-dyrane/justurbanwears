import type {
  BagItem,
  ShopCheckoutSubmissionIntent,
  ShopCheckoutSubmissionResult,
  ShopCheckoutAvailabilityConfirmation,
  ShopAvailability,
  ShopCheckoutCreationResult,
  ShopCheckoutRequest,
  ShopOrder,
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

/**
 * Future server capability. Authentication is derived from the validated
 * server session; the intent deliberately carries no customer id, price,
 * totals, status, transmission, or private Studio data.
 */
export interface AuthenticatedCheckoutCommandPort {
  isAuthenticated(): boolean;
  submit(intent: ShopCheckoutSubmissionIntent): Promise<ShopCheckoutSubmissionResult>;
}

export interface CheckoutAvailabilityPort {
  confirm(lines: readonly BagItem[]): Promise<ShopCheckoutAvailabilityConfirmation>;
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
  confirmCheckoutAvailability(
    snapshot: CommerceSnapshot,
  ): Promise<ShopCheckoutAvailabilityConfirmation>;
  getProductAvailability(slug: string): ShopAvailability | null;
  createCheckout(
    snapshot: CommerceSnapshot,
    request: ShopCheckoutRequest,
  ): ShopCheckoutCreationResult;
  submitCheckout(order: ShopOrder): Promise<ShopCheckoutSubmissionResult>;
  normalizeBagItem(item: BagItem): BagItem | null;
}
