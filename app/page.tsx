import type { Metadata } from "next";
import { ShopLink } from "../components/shop/atoms/shop-link";
import { BRAND_ASSETS } from "../lib/brand/assets";
import { formatNaira } from "../lib/shop/catalog";
import type { ShopProduct, ShopProductMedia } from "../lib/shop/domain/entities";
import {
  resolveApprovedModelTryout,
  selectProductGalleryMedia,
} from "../lib/shop/model-tryout";
import { getServerShopProducts } from "../lib/shop/server-catalog";
import editorial from "./brand-editorial.module.css";
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
  ["01", "Capture", "Real piece"],
  ["02", "Confirm", "Facts first"],
  ["03", "Complete", "Missing views"],
  ["04", "Publish", "Lulu approves"],
  ["05", "Reserve", "One buyer"],
  ["06", "Deliver", "New owner"],
] as const;

const ISSUE_CONTENTS = [
  ["01", "Cover", "Chosen again", "#cover-story"],
  ["02", "Proof", "One real piece", "#brand-story"],
  ["03", "Lulu", "Style changes hands", "#curators-note"],
  ["04", "Drop 01", "Shop the edit", "#drop-01"],
] as const;

const COVER_LINES = [
  ["Lagos edit", "One piece. One chance."],
  ["Every frame", "Approved by Lulu."],
  ["Issue 01", "Chosen again."],
] as const;

function availabilityLabel(product: ShopProduct) {
  if (!product.availabilityConfirmed) return "Availability pending";
  if (product.availability === "AVAILABLE") return "Available";
  if (product.availability === "RESERVED") return "Reserved";
  return "Sold";
}

function mediaLabel(media: ShopProductMedia) {
  if (media.presentation === "model") return "On Lulu";
  if (media.presentation === "mannequin") return "Mannequin";
  return "Garment";
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

function ProductCard({ product, index }: { product: ShopProduct; index: number }) {
  const media = selectProductGalleryMedia(product)[0];

  return (
    <a
      aria-label={`View ${product.name}`}
      className={`${styles.productCard} ${editorial.editorialProductCard}`}
      data-availability={product.availability.toLowerCase()}
      href={`/shop/products/${product.slug}`}
    >
      <span className={styles.productImage}>
        {media ? <ProductImage media={media} /> : <span aria-hidden="true" className={styles.productFallback} />}
        <span aria-hidden="true" className={editorial.productNumber}>0{index + 1}</span>
        <span className={styles.productStatus}>{availabilityLabel(product)}</span>
      </span>
      <span className={styles.productMeta}>
        <span>
          <small>{product.category} · {product.taggedSize}</small>
          <strong>{product.name}</strong>
          <span className={editorial.productAction}>View piece <span aria-hidden="true">↗</span></span>
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
  const editorialProduct = publicEdit.find((product) => (
    product.slug !== heroProduct?.slug && resolveApprovedModelTryout(product.modelTryout)
  )) ?? heroProduct;
  const approvedEditorial = editorialProduct
    ? resolveApprovedModelTryout(editorialProduct.modelTryout)
    : null;
  const editorialGallery = editorialProduct ? selectProductGalleryMedia(editorialProduct) : [];
  const editorialMedia = approvedEditorial?.frame ?? editorialGallery[1] ?? editorialGallery[0];

  return (
    <main className={`${styles.page} ${editorial.pageAtmosphere}`} data-brand-entrance="justurbanwears">
      <a className={styles.skipLink} href="#issue-contents">Skip to issue</a>

      <header className={`${styles.header} ${editorial.magazineHeader}`}>
        <ShopLink aria-label="JustUrbanWears home" className={styles.wordmark} href="/">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="JustUrbanWears" height={370} src={BRAND_ASSETS.wordmark.runtimeReverseSvg} width={1620} />
        </ShopLink>
        <nav aria-label="Primary" className={styles.nav}>
          <a href="#brand-story">Proof</a>
          <a href="#curators-note">Lulu</a>
          <a href="#drop-01">Drop 01</a>
          <a className={styles.navAction} href="/shop">Shop <span aria-hidden="true">↗</span></a>
        </nav>
      </header>

      <section aria-labelledby="brand-hero-title" className={`${styles.hero} ${editorial.coverHero}`}>
        <div aria-hidden="true" className={editorial.coverMasthead}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="" height={370} src={BRAND_ASSETS.wordmark.runtimeReverseSvg} width={1620} />
        </div>

        <div aria-hidden="true" className={editorial.issueRail}>
          <span>Issue 01</span>
          <span>Lagos · 2026</span>
        </div>

        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}>Lagos · Issue 01</p>
          <h1 className={editorial.coverTitle} id="brand-hero-title">
            Clothes deserve
            <span>more than one</span>
            first impression.
          </h1>
          <p className={styles.heroLede}>
            Lulu’s wardrobe.<br />
            One-off pieces.<br />
            Back in the city.
          </p>
          <div className={styles.heroActions}>
            <a className={styles.primaryAction} href="/shop">Enter the wardrobe <span aria-hidden="true">↗</span></a>
            <a className={styles.textAction} href="#brand-story">See the proof</a>
          </div>
        </div>

        <div className={`${styles.wardrobe} ${editorial.coverWardrobe}`} aria-label="The JustUrbanWears wardrobe opening onto the current edit">
          <div className={`${styles.wardrobeFrame} ${editorial.coverFrame}`}>
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
            <span className={styles.wardrobeIndex}>01 / Cover</span>
            <div aria-label="Issue highlights" className={editorial.coverLines}>
              {COVER_LINES.map(([kicker, title]) => (
                <span key={kicker}>
                  <small>{kicker}</small>
                  <strong>{title}</strong>
                </span>
              ))}
            </div>
            {heroProduct ? (
              <a className={styles.wardrobeCaption} href={`/shop/products/${heroProduct.slug}`}>
                <span>
                  <small>{approvedHero ? "Lulu approved" : "Current piece"}</small>
                  <strong>{heroProduct.name}</strong>
                </span>
                <b>{formatNaira(heroProduct.price)}</b>
              </a>
            ) : null}
          </div>
        </div>

        <a aria-label="Continue to this issue" className={editorial.scrollCue} href="#issue-contents">
          <span>Open the issue</span>
          <i aria-hidden="true" />
        </a>
      </section>

      <aside aria-labelledby="issue-contents-title" className={editorial.issueContents} id="issue-contents">
        <div className={editorial.contentsLead}>
          <p>JustUrbanWears · 01</p>
          <h2 id="issue-contents-title">Inside.</h2>
        </div>
        <ol className={editorial.contentsList}>
          {ISSUE_CONTENTS.map(([number, section, title, href]) => (
            <li key={number}>
              <a href={href}>
                <span>{number}</span>
                <small>{section}</small>
                <strong>{title}</strong>
                <i aria-hidden="true">↘</i>
              </a>
            </li>
          ))}
        </ol>
      </aside>

      <section aria-labelledby="manifesto-title" className={`${styles.manifesto} ${editorial.coverStory}`} id="cover-story">
        <p>Lulu’s wardrobe.</p>
        <h2 id="manifesto-title">Worn once. Chosen again.</h2>
        <span>One piece. One chance.</span>
      </section>

      <section aria-labelledby="brand-story-title" className={`${styles.story} ${editorial.storyRefinement}`} id="brand-story">
        <div className={styles.storyIntro}>
          <p className={styles.sectionIndex}>02 / Garment truth</p>
          <div>
            <h2 id="brand-story-title">One piece.<br />Fully seen.</h2>
            <p>
              Real garment.<br />
              Reviewed frames.<br />
              AI disclosed.
            </p>
          </div>
        </div>

        <div className={styles.evidenceGrid}>
          {evidenceMedia.map((media, index) => (
            <figure className={`${styles.evidenceFrame} ${editorial.editorialReveal}`} key={`${media.id}-${index}`}>
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

      <section aria-labelledby="curators-note-title" className={editorial.curator} id="curators-note">
        <div className={editorial.curatorMedia}>
          <div className={editorial.curatorImage}>
            {editorialMedia ? (
              <ProductImage media={editorialMedia} />
            ) : (
              <span aria-hidden="true" className={styles.heroFallback} />
            )}
          </div>
          {editorialProduct ? (
            <a className={editorial.editorialPlate} href={`/shop/products/${editorialProduct.slug}`}>
              <span><small>Plate 04</small><strong>{editorialProduct.name}</strong></span>
              <em>{availabilityLabel(editorialProduct)}</em>
            </a>
          ) : null}
        </div>

        <div className={editorial.curatorCopy}>
          <p className={`${styles.sectionIndex} ${editorial.curatorIndex}`}>03 / Lulu’s note</p>
          <h2 id="curators-note-title">Style changes hands.</h2>
          <div className={editorial.curatorBody}>
            <p><span className={editorial.dropCap}>L</span>ulu edits every drop.</p>
            <p>Every frame must match the piece.</p>
          </div>
          <div className={editorial.byline}>
            <span aria-hidden="true">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img alt="" height={1024} src={BRAND_ASSETS.icon.runtimeSvg} width={1024} />
            </span>
            <p><strong>Lulu</strong><small>Founder & curator · Lagos</small></p>
          </div>
          <a className={editorial.curatorAction} href="/shop">Shop the edit <span aria-hidden="true">↗</span></a>
        </div>
      </section>

      <section aria-labelledby="drop-title" className={`${styles.drop} ${editorial.dropRefinement}`} id="drop-01">
        <div className={styles.dropHeader}>
          <div>
            <p className={styles.sectionIndex}>04 / The edit</p>
            <h2 id="drop-title">Drop 01.</h2>
          </div>
          <div>
            <p>One piece each.<br />No restocks.</p>
            <a href="/shop">Shop all <span aria-hidden="true">↗</span></a>
          </div>
        </div>

        <div className={styles.productGrid}>
          {dropProducts.map((product, index) => (
            <ProductCard index={index} key={product.slug} product={product} />
          ))}
        </div>
      </section>

      <footer className={`${styles.footer} ${editorial.footerRefinement}`}>
        <div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt="JustUrbanWears" height={370} src={BRAND_ASSETS.wordmark.runtimeReverseSvg} width={1620} />
          <p>Chosen again.</p>
        </div>
        <div className={styles.footerLinks}>
          <a href="/shop">Wardrobe</a>
          <a href="/shop/search">Search</a>
          <a href="/shop/account">Account</a>
          <ShopLink href="/auth/sign-in?returnTo=%2Fstudio">Studio</ShopLink>
        </div>
        <div aria-label="Issue credits" className={editorial.colophon}>
          <p><small>Curator</small><strong>Lulu</strong></p>
          <p><small>Direction</small><strong>Dyrane</strong></p>
          <p><small>City</small><strong>Lagos</strong></p>
          <p><small>Issue</small><strong>01</strong></p>
        </div>
        <p className={`${styles.footerNote} ${editorial.footerNoteRefinement}`}>Lagos · 2026</p>
      </footer>
    </main>
  );
}
