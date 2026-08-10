export interface WardrobePublicDraftCover {
  src: `/studio/wardrobe/${string}/01-garment-front.webp`;
  alt: string;
  width: number;
  height: number;
}

export interface WardrobePublicDraft {
  slug: string;
  name: string;
  colour: string;
  state: "Styling now";
  cover: WardrobePublicDraftCover;
}

/** Public-safe facts shared by Studio intake and the non-saleable Shop preview. */
export const WARDROBE_PUBLIC_DRAFTS = [
  {
    slug: "blush-scoop-mini-dress",
    name: "Blush scoop mini dress",
    colour: "Blush pink",
    state: "Styling now",
    cover: {
      src: "/studio/wardrobe/blush-scoop-mini-dress/01-garment-front.webp",
      alt: "Blush scoop mini dress, garment-only front study",
      width: 1122,
      height: 1402,
    },
  },
  {
    slug: "orchid-beaded-column-gown",
    name: "Orchid beaded column gown",
    colour: "Orchid / mauve",
    state: "Styling now",
    cover: {
      src: "/studio/wardrobe/orchid-beaded-column-gown/01-garment-front.webp",
      alt: "Orchid beaded column gown, garment-only front study",
      width: 1122,
      height: 1402,
    },
  },
  {
    slug: "sage-asymmetric-ruched-maxi-dress",
    name: "Sage asymmetric ruched maxi dress",
    colour: "Soft sage",
    state: "Styling now",
    cover: {
      src: "/studio/wardrobe/sage-asymmetric-ruched-maxi-dress/01-garment-front.webp",
      alt: "Sage asymmetric ruched maxi dress, garment-only front study",
      width: 1122,
      height: 1402,
    },
  },
  {
    slug: "magenta-plunge-ruched-mini-dress",
    name: "Magenta plunge ruched mini dress",
    colour: "Vivid magenta",
    state: "Styling now",
    cover: {
      src: "/studio/wardrobe/magenta-plunge-ruched-mini-dress/01-garment-front.webp",
      alt: "Magenta plunge ruched mini dress, garment-only front study",
      width: 1122,
      height: 1402,
    },
  },
  {
    slug: "silver-off-shoulder-mermaid-dress",
    name: "Silver off-shoulder mermaid dress",
    colour: "Silver grey",
    state: "Styling now",
    cover: {
      src: "/studio/wardrobe/silver-off-shoulder-mermaid-dress/01-garment-front.webp",
      alt: "Silver off-shoulder mermaid dress, garment-only front study",
      width: 1122,
      height: 1402,
    },
  },
  {
    slug: "multicolor-abstract-strapless-mini-dress",
    name: "Multicolor abstract strapless mini dress",
    colour: "Multicolor abstract print",
    state: "Styling now",
    cover: {
      src: "/studio/wardrobe/multicolor-abstract-strapless-mini-dress/01-garment-front.webp",
      alt: "Multicolor abstract strapless mini dress, garment-only front study",
      width: 1122,
      height: 1402,
    },
  },
] as const satisfies readonly WardrobePublicDraft[];

export type WardrobePublicDraftSlug = (typeof WARDROBE_PUBLIC_DRAFTS)[number]["slug"];
