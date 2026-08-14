import mediaManifest from "./public-media-manifest.json" with { type: "json" };
import sourceManifest from "./public-media-source-manifest.json" with { type: "json" };

const canonicalShopOrigin = "https://www.justurbanwears.com";
const uploadedAssetsBySource = new Map(
  mediaManifest.assets.map((asset) => [asset.sourcePath, asset] as const),
);
const sourceAssets = sourceManifest.assets.map((asset) => ({
  ...asset,
  url: asset.sourcePath,
}));
const activeAssets = [
  ...mediaManifest.assets,
  ...sourceAssets.filter((asset) => !uploadedAssetsBySource.has(asset.sourcePath)),
].sort((left, right) => left.sourcePath.localeCompare(right.sourcePath));
const assetsBySource = new Map(
  activeAssets.map((asset) => [asset.sourcePath, asset] as const),
);
const assetsByUrl = new Map(
  [...activeAssets, ...mediaManifest.legacyAssets]
    .map((asset) => [asset.url, asset] as const),
);

export const SHOP_PUBLIC_MEDIA_REVISION = sourceManifest.catalogueRevision;
export const SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM = sourceManifest.catalogueChecksum;
export const SHOP_PUBLIC_MEDIA_PRESENTATION_CHECKSUM = sourceManifest.cataloguePresentationChecksum;
export const SHOP_PUBLIC_MEDIA_ASSETS = activeAssets;
export const SHOP_PUBLIC_MEDIA_SOURCE_ASSETS = sourceManifest.assets;
export const SHOP_PUBLIC_MEDIA_LEGACY_ASSETS = mediaManifest.legacyAssets;

export function isApprovedShopMediaSource(sourcePath: string): boolean {
  return assetsBySource.has(sourcePath);
}

export function resolveShopPublicMediaUrl(sourcePath: string): string {
  return assetsBySource.get(sourcePath)?.url ?? sourcePath;
}

export function isSafeShopProductMediaUrl(value: string, slug: string): boolean {
  const asset = assetsBySource.get(value) ?? assetsByUrl.get(value);
  if (asset?.sourcePath.startsWith(`/shop/products/${slug}/`)) return true;
  try {
    const url = new URL(value);
    return url.protocol === "https:"
      && !url.username
      && !url.password
      && !url.port
      && url.hostname.endsWith(".public.blob.vercel-storage.com")
      && url.pathname.startsWith(`/shop/studio/${slug}/`);
  } catch {
    return false;
  }
}

export function absoluteShopMediaUrl(value: string): string {
  return new URL(value, canonicalShopOrigin).toString();
}
