import { WARDROBE_PUBLIC_DRAFTS } from "../../lib/wardrobe-public-view/drafts";

export function WardrobePreview() {
  return (
    <section className="shop-wardrobe-preview" aria-labelledby="wardrobe-preview-title">
      <header className="shop-wardrobe-preview-header">
        <div>
          <p className="shop-kicker">From the wardrobe · Styling now</p>
          <h2 id="wardrobe-preview-title">Six dresses in first light.</h2>
        </div>
        <p>
          Front studies for the next drop.
        </p>
      </header>

      <ol className="shop-wardrobe-preview-list">
        {WARDROBE_PUBLIC_DRAFTS.map((draft, index) => (
          <li key={draft.slug}>
            <figure>
              <div className="shop-wardrobe-preview-frame">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  alt={draft.cover.alt}
                  decoding="async"
                  height={draft.cover.height}
                  loading="lazy"
                  src={draft.cover.src}
                  width={draft.cover.width}
                />
              </div>
              <figcaption>
                <span className="shop-wardrobe-preview-state">
                  <i aria-hidden="true" />
                  {draft.state}
                </span>
                <span className="shop-wardrobe-preview-index" aria-hidden="true">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h3>{draft.name}</h3>
              </figcaption>
            </figure>
          </li>
        ))}
      </ol>
    </section>
  );
}
