import type { Metadata } from "next";
import { ProductDetail } from "../../../../components/shop/product-detail";
import { getShopProduct } from "../../../../lib/shop/catalog";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const product = getShopProduct(slug);

  if (!product) {
    return {
      title: "Piece not found",
      description: "Return to the justurban wears edit.",
    };
  }

  const description = `${product.note} ${product.condition} · ${product.taggedSize}.`;
  const featured = product.media?.[0];
  const images = featured
    ? [{
        url: featured.src,
        width: featured.width,
        height: featured.height,
        alt: featured.alt,
      }]
    : undefined;

  return {
    title: product.name,
    description,
    openGraph: {
      title: `${product.name} · justurban wears`,
      description,
      siteName: "justurban wears",
      type: "website",
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: `${product.name} · justurban wears`,
      description,
      images: featured ? [featured.src] : undefined,
    },
  };
}

export default async function ShopProductPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const product = getShopProduct(slug);
  const availability = product?.availability === "AVAILABLE"
    ? "https://schema.org/InStock"
    : product?.availability === "RESERVED"
      ? "https://schema.org/LimitedAvailability"
      : "https://schema.org/OutOfStock";
  const productJsonLd = product
    ? {
        "@context": "https://schema.org",
        "@type": "Product",
        name: product.name,
        description: product.note,
        sku: product.sku,
        color: product.colour,
        size: product.taggedSize,
        image: product.media?.map((item) => `https://justurbanwears.com${item.src}`),
        itemCondition: "https://schema.org/UsedCondition",
        offers: {
          "@type": "Offer",
          price: product.price,
          priceCurrency: "NGN",
          availability,
          url: `https://justurbanwears.com/shop/products/${product.slug}`,
          seller: {
            "@type": "Organization",
            name: "justurban wears",
          },
        },
      }
    : null;

  return (
    <>
      {productJsonLd ? (
        <script
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(productJsonLd).replaceAll("<", "\\u003c"),
          }}
          type="application/ld+json"
        />
      ) : null}
      <ProductDetail />
    </>
  );
}
