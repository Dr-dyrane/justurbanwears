/**
 * Lightweight authority identity shared by status, readiness and execution.
 * Keep this module free of provider, image-processing and private-blob imports
 * so read-only authorization routes do not load the paid execution runtime.
 */
export const STUDIO_ATELIER_PRIVATE_MANIFEST_SHA256 =
  "d245096f4582e6638bbc9ab1c9abe41df9aa447736372824cdc6803d651824bb" as const;
export const STUDIO_ATELIER_PRIVATE_AUTHORITY_ASSET_COUNT = 11 as const;
