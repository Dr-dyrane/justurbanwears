import type { Metadata } from "next";
import { BRAND_ASSETS } from "../lib/brand/assets";
import { formatNaira } from "../lib/shop/catalog";
import type { ShopProduct, ShopProductMedia } from "../lib/shop/domain/entities";
import {
  resolveApprovedModelTryout,
  selectProductGalleryMedia,
} from "../lib/shop/model-tryout";
import { getServerShopProducts } from "../lib/shop/server-catalog";
import styles from "./brand-home.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Clothes deserve more than one first impression",
  description:
    "One-off urban womenswear from Lulu’s wardrobe, given a truthful digital identity before it returns to the city.",
  alternates: {
    canonical: "/",
  },
};

const PROCESS_STEPS = [
  ["01", "Capture", "Begin with the physical garment."],
  ["02", "Confirm", "Keep the facts and approved evidence together."],
  ["03", "Complete", "Create only the supporting views that are missing."],
  ["04", "Publish", "Lulu reviews every public frame."],
  ["05", "Reserve", "One piece can have only one active buyer."],
  ["06", "Deliver", "The digital identity follows the real order."],
] as const;

function availabilityLabel(product: ShopProduct) {
  if (!product.availabilityConfirmed) return "Availability pending";
  if (product.availability === "AVAILABLE") return "Available";
  if (product.availability === "RESERVED") return "Reserved";
  return "Sold";
}

function mediaLabel(media: ShopProductMedia) {
  if (media.presentation === "model") return "Approved model view";
  if (media.presentation === "mannequin") return "Approved mannequin view";
  return "Approved garment view";
}

function ProductImage({
  media,
  eager = false,
}: {
  media: ShopProductMedia;
  eager?: boolean;
}) {
  return (
    // The public catalogue already carries reviewed dimensions, alt text, and source policy.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      alt={media.alt}
      fetchPriority={eager ? "high" : "auto"}
      height={media.height}
      loading={eager ? "eager" : "lazy"}
      src={media.src}
      style={{ objectPosition: media.objectPosition ?? "50% 50%" }}
      width={media.width}
    />
  );
}

function ProductCard({ product }: { product: ShopProduct }) {
  const media = selectProductGalleryMedia(product)[0];

  return (
    <a
      aria-label={`View ${product.name}`}
      className={styles.productCard}
      data-availability={product.availability.toLowerCase()}
      href={`/shop/products/${product.slug}`}
    >
      <span className={styles.productImage}>
        {media ? <ProductImage media={media} /> : <span aria-hidden="true" className={styles.productFallback} />}
        <span className={styles.productStatus}>{availabilityLabel(product)}</span>
      </span>
      <span className={styles.productMeta}>
        <span>
          <small>{product.category} · {product.taggedSize}</small>
          <strong>{product.name}</strong>
        </span>
        <b>{formatNaira(product.price)}</b>
      </span>
    </a>
  );
}

export default async function Home() {
  const products = await getServerShopProducts();
  const availableProducts = products.filter((product) => product.availability === "AVAILABLE");
  const publicEdit = availableProducts.length ? availableProducts : products;
  const heroProduct = publicEdit.find((product) => resolveApprovedModelTryout(product.modelTryout))
    ?? publicEdit[0]
    ?? products[0];
  const approvedHero = heroProduct ? resolveApprovedModelTryout(heroProduct.modelTryout) : null;
  const heroMedia = approvedHero?.frame ?? (heroProduct ? selectProductGalleryMedia(heroProduct)[0] : undefined);
  const evidenceMedia = heroProduct ? selectProductGalleryMedia(heroProduct).slice(0, 3) : [];
  const dropProducts = publicEdit.slice(0, 4);

  return (
    <main className={styles.page} data-brand-entrance="justurbanwears">
      <a className={styles.skipLink} href="#brand-story">Skip to the story</a>

      <header className={styles.header}>
        <a aria-label="JustUrbanWears home" className={styles.wordmark} href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="JustUrbanWears" height={370} src={BRAND_ASSETS.wordmark.runtimeReverseSvg} width={1620} />
        </a>
        <nav aria-label="Primary" className={styles.nav}>
          <a href="#brand-story">The idea</a>
          <a href="#drop-01">Drop 01</a>
          <a className={styles.navAction} href="/shop">Enter shop <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section aria-labelledby="brand-hero-title" className={styles.hero}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>JustUrbanWears · Lagos · Issue 01</p>
          <h1 id="brand-hero-title">
            Clothes deserve
            <span>more than one</span>
            first impression.
          </h1>
          <p className={styles.heroLede}>
            One-off urban womenswear from Lulu’s wardrobe, given a truthful digital identity before it returns to the city.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="/shop">Enter the wardrobe <span aria-hidden="true">↗</span></a>
            <a className={styles.textAction} href="#brand-story">See how the piece becomes public</a>
          </div>
          <dl className={styles.heroFacts}>
            <div><dt>Inventory</dt><dd>One physical piece</dd></div>
            <div><dt>Public media</dt><dd>Human reviewed</dd></div>
            <div><dt>Orders</dt><dd>Server governed</dd></div>
          </dl>
        </div>

        <div className={styles.wardrobe} aria-label="The JustUrbanWears wardrobe opening onto the current edit">
          <div className={styles.wardrobeFrame}>
            <span aria-hidden="true" className={styles.wardrobeGlow} />
            {heroMedia ? (
              <ProductImage eager media={heroMedia} />
            ) : (
              <span aria-hidden="true" className={styles.heroFallback} />
            )}
            <span aria-hidden="true" className={`${styles.door} ${styles.doorLeft}`} />
            <span aria-hidden="true" className={`${styles.door} ${styles.doorRight}`} />
            <span aria-hidden="true" className={styles.wardrobeSeal}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" height={1024} src={BRAND_ASSETS.icon.runtimeSvg} width={1024} />
            </span>
            <span className={styles.wardrobeIndex}>01 / The wardrobe</span>
            {heroProduct ? (
              <a className={styles.wardrobeCaption} href={`/shop/products/${heroProduct.slug}`}>
                <span>
                  <small>{approvedHero ? "Approved on Lulu" : "Current garment"}</small>
                  <strong>{heroProduct.name}</strong>
                </span>
                <b>{formatNaira(heroProduct.price)}</b>
              </a>
            ) : null}
          </div>
        </div>
      </section>

      <section aria-labelledby="manifesto-title" className={styles.manifesto}>
        <p>From Lulu’s wardrobe, back into the city.</p>
        <h2 id="manifesto-title">Worn once. Chosen again.</h2>
        <span>Not mass inventory. Not imaginary fashion. One real garment at a time.</span>
      </section>

      <section aria-labelledby="brand-story-title" className={styles.story} id="brand-story">
        <div className={styles.storyIntro}>
          <p className={styles.sectionIndex}>02 / Garment truth</p>
          <div>
            <h2 id="brand-story-title">One real piece.<br />A complete digital identity.</h2>
            <p>
              Studio begins with approved garment evidence. Supporting views may be completed with AI, but nothing becomes public until Lulu reviews it. Generated media keeps its provenance; it never quietly replaces the physical piece.
            </p>
          </div>
        </div>

        <div className={styles.evidenceGrid}>
          {evidenceMedia.map((media, index) => (
            <figure className={styles.evidenceFrame} key={`${media.id}-${index}`}>
              <ProductImage media={media} />
              <figcaption>
                <span><small>0{index + 1}</small><strong>{media.label}</strong></span>
                <em>{mediaLabel(media)}</em>
              </figcaption>
            </figure>
          ))}
        </div>

        <ol aria-label="Garment operating sequence" className={styles.process}>
          {PROCESS_STEPS.map(([number, title, note]) => (
            <li key={number}>
              <span>{number}</span>
              <div><strong>{title}</strong><p>{note}</p></div>
            </li>
          ))}
        </ol>
      </section>

      <section aria-labelledby="drop-title" className={styles.drop} id="drop-01">
        <div className={styles.dropHeader}>
          <div>
            <p className={styles.sectionIndex}>03 / The public wardrobe</p>
            <h2 id="drop-title">Drop 01.</h2>
          </div>
          <div>
            <p>Each listing belongs to one physical garment. Availability remains governed from checkout through fulfilment.</p>
            <a href="/shop">Shop the complete edit <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className={styles.productGrid}>
          {dropProducts.map((product) => <ProductCard key={product.slug} product={product} />)}
        </div>
      </section>

      <footer className={styles.footer}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="JustUrbanWears" height={370} src={BRAND_ASSETS.wordmark.runtimeReverseSvg} width={1620} />
          <p>Clothes with a second first impression.</p>
        </div>
        <div className={styles.footerLinks}>
          <a href="/shop">Wardrobe</a>
          <a href="/shop/search">Search</a>
          <a href="/shop/account">Your space</a>
          <a href="/auth/sign-in?returnTo=%2Fstudio">Studio sign in</a>
        </div>
        <p className={styles.footerNote}>Curated in Lagos · Built around one-off truth.</p>
      </footer>
    </main>
  );
}
