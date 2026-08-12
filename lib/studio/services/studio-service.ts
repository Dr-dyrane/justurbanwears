import {
  createBrowserLocalStudioRepository,
  createBrowserWardrobePublicViewPort,
} from "../db/browser-local-repository";
import { createServerWardrobeOverlayRepository } from "../db/server-wardrobe-overlay";
import type { StudioSnapshot } from "../domain/state";
import { selectWardrobePublicView } from "../projections/public-listing";
import { WARDROBE_AUTHORITY_MANAGED_SLUGS } from "../seeds/wardrobe-authority";
import type {
  StudioRepository,
  StudioService,
  WardrobePublicViewPort,
} from "./contracts";

interface StudioServiceDependencies {
  repository: StudioRepository;
  wardrobePublicView: WardrobePublicViewPort;
  clock?: () => Date;
  idFactory?: (prefix: string) => string;
}

function localId(prefix: string) {
  const entropy = typeof globalThis.crypto?.randomUUID === "function"
    ? globalThis.crypto.randomUUID().split("-")[0]
    : Date.now().toString(36);
  return `${prefix}-${entropy}`;
}

export function createStudioService({
  repository,
  wardrobePublicView,
  clock = () => new Date(),
  idFactory = localId,
}: StudioServiceDependencies): StudioService {
  const writeWardrobePublicView = (snapshot: StudioSnapshot) => wardrobePublicView.write(
    selectWardrobePublicView(snapshot),
    [...new Set([
      ...WARDROBE_AUTHORITY_MANAGED_SLUGS,
      ...snapshot.listings.map((listing) => listing.slug),
    ])],
  );
  return {
    async hydrate() {
      const snapshot = await repository.read();
      await writeWardrobePublicView(snapshot);
      return snapshot;
    },
    async persist(snapshot: StudioSnapshot) {
      await repository.write(snapshot);
      await writeWardrobePublicView(snapshot);
    },
    subscribe: (listener) => repository.subscribe(listener),
    createId: idFactory,
    now: () => clock().toISOString(),
  };
}

export function createBrowserStudioService() {
  return createStudioService({
    repository: createServerWardrobeOverlayRepository(createBrowserLocalStudioRepository()),
    wardrobePublicView: createBrowserWardrobePublicViewPort(),
  });
}
