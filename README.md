# justurban wears

The product repository for **justurban wears**: a public urban ladies’ wear shop and a separate operator Studio. It runs on the App Router API implemented by [vinext](https://github.com/cloudflare/vinext), Vite 8, React 19, and TypeScript.

The canonical production origin is `https://justurbanwears.com`.

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

The current Vite configuration includes the project’s Sites and Cloudflare Worker integration. `.openai/hosting.json` has no D1 or R2 binding enabled, so no hosted database or object storage is provisioned by this snapshot.

## Commerce architecture

The shopper app is local-first without coupling the UI to browser storage:

1. `lib/shop/domain` defines products, carts, orders, and the versioned state envelope.
2. `lib/shop/machines` owns the pure commerce reducer and lifecycle states.
3. `lib/shop/services` defines repository ports and commerce operations.
4. `lib/shop/db/browser-local-repository.ts` implements versioned local storage, validation, migration, and cross-tab sync.
5. `hooks/shop` and `components/shop/shop-provider.tsx` connect the machine to React.
6. `components/shop/atoms` supplies the shared actions, sheets, switches, and status primitives.
7. `db/shop-postgres-schema.ts` is the server-only Drizzle contract for a future Neon or Supabase Postgres adapter.

The UI and machine do not import `localStorage` directly. A connected release can replace the browser repository with a server-backed implementation of the same port, then add authentication, authorization, inventory transactions, payment, and fulfilment services at their respective boundaries. Generate the future Postgres migration package with `npm run db:generate:shop`; this does not connect to a database or read credentials.

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
| `public/favicon.ico` | Multi-size browser favicon; include at least 16×16 and 32×32. |
| `public/brand/icon-192.png` | Exactly 192×192 px, sRGB PNG, standard app icon. |
| `public/brand/icon-512.png` | Exactly 512×512 px, sRGB PNG, standard app icon. |
| `public/brand/icon-maskable-512.png` | Exactly 512×512 px, sRGB PNG; keep all essential artwork inside the central maskable safe zone. |
| `public/brand/apple-touch-icon.png` | Exactly 180×180 px, opaque sRGB PNG; do not bake in rounded corners. |

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
3. Confirm `https://justurbanwears.com/manifest.webmanifest`, `/sw.js`, `/offline.html`, and every icon return successfully over HTTPS. Serve `/sw.js` with revalidation-friendly caching so browser update checks are not pinned to an old worker.
4. Set `justurbanwears.com` as primary and redirect any `www` hostname to it.
5. Run one production-mode install/offline smoke test on the deployed origin. Confirm Studio and account/data routes remain network-only.

Deployment, DNS changes, and Vercel project creation are intentionally outside this PWA package change.
