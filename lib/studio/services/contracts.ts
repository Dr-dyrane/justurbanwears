import type { PublicListingProjection } from "../domain/entities";
import type { StudioSnapshot } from "../domain/state";

export interface StudioRepository {
  read(): Promise<StudioSnapshot>;
  write(snapshot: StudioSnapshot): Promise<void>;
  subscribe(listener: (snapshot: StudioSnapshot) => void): () => void;
}

export interface WardrobePublicViewPort {
  write(products: PublicListingProjection[], managedSlugs: string[]): Promise<void>;
}

export interface StudioService {
  hydrate(): Promise<StudioSnapshot>;
  persist(snapshot: StudioSnapshot): Promise<void>;
  subscribe(listener: (snapshot: StudioSnapshot) => void): () => void;
  createId(prefix: string): string;
  now(): string;
}
