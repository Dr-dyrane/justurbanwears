import type { WardrobePublicViewSnapshot } from "../domain/entities";

export interface WardrobePublicViewRepository {
  read(): Promise<WardrobePublicViewSnapshot>;
  write(snapshot: WardrobePublicViewSnapshot): Promise<void>;
  subscribe(listener: (snapshot: WardrobePublicViewSnapshot) => void): () => void;
}
