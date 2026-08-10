import {
  createBrowserLocalStudioRepository,
  createBrowserPublicCatalogPort,
} from "../db/browser-local-repository";
import type { StudioSnapshot } from "../domain/state";
import { selectPublicCatalog } from "../projections/public-listing";
import type {
  PublicCatalogPort,
  StudioRepository,
  StudioService,
} from "./contracts";

interface StudioServiceDependencies {
  repository: StudioRepository;
  publicCatalog: PublicCatalogPort;
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
  publicCatalog,
  clock = () => new Date(),
  idFactory = localId,
}: StudioServiceDependencies): StudioService {
  return {
    async hydrate() {
      const snapshot = await repository.read();
      await publicCatalog.write(selectPublicCatalog(snapshot));
      return snapshot;
    },
    async persist(snapshot: StudioSnapshot) {
      await repository.write(snapshot);
      await publicCatalog.write(selectPublicCatalog(snapshot));
    },
    subscribe: (listener) => repository.subscribe(listener),
    createId: idFactory,
    now: () => clock().toISOString(),
  };
}

export function createBrowserStudioService() {
  return createStudioService({
    repository: createBrowserLocalStudioRepository(),
    publicCatalog: createBrowserPublicCatalogPort(),
  });
}
