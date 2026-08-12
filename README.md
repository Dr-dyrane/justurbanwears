# justurban wears

The product repository for **justurban wears**: a public urban ladies’ wear shop and a separate operator Studio. It runs on the App Router API implemented by [vinext](https://github.com/cloudflare/vinext), Vite 8, React 19, and TypeScript.

The canonical production origin is `https://www.justurbanwears.com`.

## Local setup

Requirements: Node.js `>=22.13.0` and npm.

```bash
npm install
npm run dev
```

The vinext development server normally starts on `http://localhost:3001`. Useful checks:

```bash
npm run lint
npm run build
npm run build:vercel
```

Copy `.env.example` to `.env.local` to enable Mapbox delivery-location search:

```bash
NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN=pk.your_url_restricted_public_token
```

Use a public `pk` token restricted to the production origin, with a separate restricted token for localhost. Checkout keeps the native address fields available when the token, network, or WebGL is unavailable. Mapbox search results and coordinates remain ephemeral: they are not written to the local commerce snapshot, order history, or Postgres contract.

The current Vite configuration includes the project’s Sites and Cloudflare Worker integration. `.openai/hosting.json` has no D1 or R2 binding; the Vercel production project instead connects Neon Postgres and separate public/private Vercel Blob stores through server-only environment variables.

## Commerce architecture

The shopper app is local-first without coupling the UI to browser storage:

1. `lib/shop/domain` defines products, carts, orders, and the versioned state envelope.
2. `lib/shop/machines` owns the pure commerce reducer and lifecycle states.
3. `lib/shop/services` defines repository ports and commerce operations.
4. `lib/shop/db/browser-local-repository.ts` implements versioned local storage, validation, migration, and cross-tab sync.
5. `lib/shop/server-catalog.ts` reads the descriptive catalogue and current inventory from Neon on the server, validates the complete snapshot, and injects it into the first render.
6. `hooks/shop` and `components/shop/shop-provider.tsx` connect that immutable server snapshot and the local commerce machine to React.
7. `components/shop/atoms` supplies the shared actions, sheets, switches, and status primitives.
8. `db/shop-postgres-schema.ts` is the server-only Drizzle contract for the connected Neon database.

The public catalogue is server-authoritative, while saves, bag contents, and the current WhatsApp checkout handoff remain device-local. If Neon cannot confirm inventory, descriptive release data still renders but every purchase action fails closed until stock is confirmed again. Studio mutations, authenticated checkout writes, payments, and fulfilment automation are not connected yet.

Approved public catalogue media is mirrored to the public Blob store with immutable, content-addressed pathnames. The checked-in media manifest maps canonical `/shop/**` release keys to the exact verified Blob URL and SHA-256; private source/evidence media is never enumerated by this workflow. From a clean, reviewed release run:

```bash
npx vercel env run -e production --project justurbanwears -- npm run blob:sync:shop
```

The command uploads only media referenced by the checked-in catalogue manifest, refuses overwrites, downloads every result for checksum verification, and leaves superseded Blob objects available for older deployments. It never uses the private Blob token. Database migrations and catalogue releases remain a separate guarded command (`npm run db:release:shop`) and never run from the Vercel build.

## Route map

Public shop:

- `/` redirects to `/shop`.
- `/shop` is the catalogue landing page.
- `/shop/search` searches and filters the catalogue.
- `/shop/products/[slug]` shows fit, condition, measurements, and availability.
- `/shop/account` explains device-local state and PWA installation.
- `/shop/saved` shows pieces saved in this browser.
- `/shop/bag` holds the device-local bag.
- `/shop/checkout` completes the local checkout flow without collecting payment.
- `/shop/orders` and `/shop/orders/[id]` show orders created on this device.

Operator Studio:

- `/studio` is the operator overview.
- `/garments`, `/garments/new`, and `/garments/[id]` cover garment intake and review.
- `/shoots`, `/shoots/new`, and `/shoots/[id]` cover mock shoot composition and review.
- `/konan` is the identity-canon review surface.

The Studio is a private product surface by intent, but these routes are not an authorization boundary on their own. Add and verify server-side access control before exposing them from a public production deployment.

## Local-first and connected boundaries

This repository is intentionally honest about what is connected:

- Catalogue and Studio records come from seeded in-repository data.
- Saved pieces, the bag, following preferences, and order state stay in browser storage on one device.
- Checkout does not collect or transmit payment details.
- Placing a local order does not reserve inventory, charge a customer, notify an operator, request fulfilment, or contact a carrier.
- Delivery timelines are local product states, not live carrier data.
- Studio generation uses the labeled `konan/mock-v1` provider; it does not call a production image model.
- D1, R2, customer accounts, inventory synchronization, payments, transactional messaging, analytics, and production generation are not connected.

Keep the concise checkout and tracking disclosures until the corresponding server-side services, privacy controls, failure states, and operational ownership are live and verified.

## Installable PWA

`app/manifest.ts` publishes the install manifest and `app/layout.tsx` supplies canonical, mobile, Apple, and icon metadata. The service worker registers only in production on a secure origin.

The offline policy is deliberately narrow:

- Only `/offline.html` is precached.
- Successful page, API, RSC, image, and user-data responses are never written to the service-worker cache.
- The offline fallback applies only to `/`, `/shop`, `/shop/search`, and `/shop/products/*` navigations.
- Studio, auth, account, saved, bag, checkout, order, API, and framework-data requests are not intercepted or cached.

`PwaInstallControl` is exported from `components/pwa/pwa-install-control.tsx` for an account or settings surface. It shows an install button only when the browser provides a real `beforeinstallprompt` event; otherwise it reports installed mode or gives manual browser guidance.

### Brand asset drop contract

The manifest and document metadata depend on these exact public files. The identity lane currently supplies them; any future approved logo drop must replace the full set together:

| File | Required output |
| --- | --- |
| `public/brand/logo.svg` | Exact owner-supplied centered logo preserved losslessly inside an SVG wrapper. |
| `public/logo.png` | Exact owner-supplied 1313×1392 transparent PNG; direct-share logo at `/logo.png`. |
| `public/brand/wordmark.svg` | Unchanged path-outlined storefront wordmark; transparent and font-independent. |
| `public/brand/wordmark-white.svg` | Unchanged white outlined wordmark for dark surfaces. |
| `public/wordmark.png` | Unchanged 1620×370 transparent sRGB wordmark PNG. |
| `public/brand/icon.svg` | Owner-supplied wardrobe / figure / mirrored-L icon on a warm-paper app tile. |
| `public/icon.png` | Exactly 1024×1024 px, opaque sRGB app-icon derivative at `/icon.png`. |
| `public/favicon.svg` | Browser favicon using the owner-supplied compact icon. |
| `public/favicon.ico` | Multi-size browser favicon; include at least 16×16 and 32×32. |
| `public/brand/icon-192.png` | Exactly 192×192 px, sRGB PNG, standard app icon. |
| `public/brand/icon-512.png` | Exactly 512×512 px, sRGB PNG, standard app icon. |
| `public/brand/icon-maskable-512.png` | Exactly 512×512 px, sRGB PNG; keep all essential artwork inside the central maskable safe zone. |
| `public/brand/apple-touch-icon.png` | Exactly 180×180 px, opaque sRGB PNG; do not bake in rounded corners. |
| `public/brand/icon-master-1024.png` | Exactly 1024×1024 px, opaque sRGB PNG; canonical raster master for downstream platform exports. |

The convenience URLs `/logo`, `/wordmark`, and `/icon` serve the three approved SVG roles directly. Their PNG counterparts are `/logo.png`, `/wordmark.png`, and `/icon.png`. App code imports every path from `lib/brand/assets.ts`; Shop and Studio continue to render the unchanged shared wordmark plus the new compact icon rather than maintaining separate drawings.

Use the approved public logo only. Do not substitute private identity references, Studio assets, mock model outputs, screenshots, or an invented mark. Preserve these filenames unless the metadata and manifest are updated in the same change. After the final drop, verify every file returns `200` with the correct image content type, inspect maskable crops on multiple shapes, and rerun PWA install checks on Android/Chromium and iOS Safari.

## Vercel handoff

The repository has separate build paths for its two hosts. The default `npm run build` keeps the Sites/Cloudflare Worker stack (`vinext()`, the local Sites plugin, and `@cloudflare/vite-plugin`). When `VERCEL` or `NITRO_PRESET` is present, `vite.config.ts` instead selects `vinext()` with the Nitro Vite adapter, so the two platform adapters are not loaded into the same production build.

For the checked-in Vercel path, use:

```bash
npm run build:vercel
```

That script sets `NITRO_PRESET=vercel` and writes a Vercel Build Output API bundle to `.vercel/output`. Configure the Vercel project to run `npm run build:vercel`; Nitro owns the output bundle, so no separate dashboard output-directory override is needed. Do not use the default Cloudflare/Sites build for that project. The adapter is present, but the deployment still needs the production validation below.

Before promoting the custom domain:

1. Verify App Router SSR, redirects, dynamic product/order routes, metadata routes, and static assets through the selected adapter.
2. Protect every operator route and any future customer-data route at the server boundary.
3. Confirm `https://www.justurbanwears.com/manifest.webmanifest`, `/sw.js`, `/offline.html`, and every icon return successfully over HTTPS. Serve `/sw.js` with revalidation-friendly caching so browser update checks are not pinned to an old worker.
4. Set `www.justurbanwears.com` as primary and redirect the apex hostname to it.
5. Run one production-mode install/offline smoke test on the deployed origin. Confirm Studio and account/data routes remain network-only.

Deployment, DNS changes, and Vercel project creation are intentionally outside this PWA package change.
