import mediaManifest from "./public-media-manifest.json" with { type: "json" };

const canonicalShopOrigin = "https://www.justurbanwears.com";
const assetsBySource = new Map(
  mediaManifest.assets.map((asset) => [asset.sourcePath, asset] as const),
);
const assetsByUrl = new Map(
  [...mediaManifest.assets, ...mediaManifest.legacyAssets]
    .map((asset) => [asset.url, asset] as const),
);

export const SHOP_PUBLIC_MEDIA_REVISION = mediaManifest.catalogueRevision;
export const SHOP_PUBLIC_MEDIA_CATALOGUE_CHECKSUM = mediaManifest.catalogueChecksum;
export const SHOP_PUBLIC_MEDIA_PRESENTATION_CHECKSUM = mediaManifest.cataloguePresentationChecksum;
export const SHOP_PUBLIC_MEDIA_ASSETS = mediaManifest.assets;
export const SHOP_PUBLIC_MEDIA_LEGACY_ASSETS = mediaManifest.legacyAssets;

export function isApprovedShopMediaSource(sourcePath: string): boolean {
  return assetsBySource.has(sourcePath);
}

export function resolveShopPublicMediaUrl(sourcePath: string): string {
  return assetsBySource.get(sourcePath)?.url ?? sourcePath;
}

export function isSafeShopProductMediaUrl(value: string, slug: string): boolean {
  const asset = assetsBySource.get(value) ?? assetsByUrl.get(value);
  return asset?.sourcePath.startsWith(`/shop/products/${slug}/`) ?? false;
}

export function absoluteShopMediaUrl(value: string): string {
  return new URL(value, canonicalShopOrigin).toString();
}
