# iOS Simulator check — partial evidence

Status: `SIMULATOR_PARTIAL`, not physical-iPhone or production certification.

The operator requested Simulator after iPhone Mirroring reported that the
iPhone camera was in use. The camera session was not interrupted.

## Run identity

- Source: clean `main` at `14cf58fab4a1342e6f5c5f38229441fc93da5ecd`.
- Device: existing Apple Simulator iPhone 17 Pro Max, iOS 26.5, Safari,
  portrait, light theme, native on-screen keyboard.
- Capture window: 2026-09-07 13:43:11–13:53:13, America/Los_Angeles.
- Images: unmodified 1320 × 2868 Simulator PNGs. No browser viewport emulation
  is substituted for these native screenshots.
- Host: local Vite 8.0.13 / Vinext development server, Nitro `node-server`
  preset, bound to `127.0.0.1:3001`; `scenario=lifecycle` fixtures.
- Actor: unauthenticated local fixture, **not** either production admin.
- Safety: no Send, Save, Publish, Confirm, generation or other domain command
  was dispatched. The harmless unsent Ask draft was cleared by reload.
  No business record, private media or provider configuration was changed.

The successful fixture host started with process-only overrides:

```sh
NITRO_PRESET=node-server STUDIO_AI_ENGINE_AUTH_MODE='' \
DATABASE_URL='' DATABASE_URL_UNPOOLED='' POSTGRES_URL='' POSTGRES_URL_NON_POOLING='' \
AI_GATEWAY_API_KEY='' PRIVATE_BLOB_READ_WRITE_TOKEN='' PUBLIC_BLOB_READ_WRITE_TOKEN='' \
npx vite --host 127.0.0.1 --port 3001 --strictPort
```

No environment file was edited. This is a bounded local test setup, not a
production configuration or proof that every connected request is suppressed.
This receipt was written after the run; it is not the audit's proposed
immutable pre-request environment manifest.

## Observed behavior

| Journey | Result | Native evidence |
| --- | --- | --- |
| Home, `/studio?scenario=lifecycle` | Header and service controls visible; broken avatar is an open defect below | [Home](01-home.png) |
| Search → type `Coral` with keyboard open | Input, two matching garments and Close remain visible; choosing the Ready result opens the exact fixture piece and dismisses the keyboard | [Search + keyboard](02-search-keyboard.png) |
| Ready piece → Facts & price → Fabric detail → Close → Close | Nested viewer opens; its Close returns to Facts & price; the sheet's Close returns to Piece | [Nested media](03-nested-media.png) |
| Piece → Ask → focus composer → type `Hi` | Current Piece remains `JUW-001 / Coral Drift Dress · Ready`; composer and unsent text stay above the keyboard | [Ask + keyboard](04-ask-keyboard.png) |
| Ask → keyboard Done | Keyboard dismisses, header returns and `Hi` remains in the composer; later Safari reload clears the unsent fixture draft | [Ask after dismissal](05-ask-keyboard-dismissed.png) |

The piece route was
`/studio/wardrobe/scenario-garment-ready?scenario=lifecycle`. Ask was opened
through that piece's own header action, not through a separately constructed
context fixture. Public approved catalogue images only are present in captures;
no account email, credential or private authority image is included.

## Open observations and limits

1. **Fixture avatar request/fallback:** Home still requests
   `/api/studio/profile/avatar`. On this isolated local host it returned 500
   and Safari displayed a broken-image glyph. The fixture is therefore not
   fully request-isolated. The source's `onError` only sets `hidden`; the
   visible fallback did not work in this run. No private avatar was loaded.
2. **Ask keyboard layout:** opening the keyboard scrolls the header out of
   view and leaves a large gap below the composer. The input remains usable,
   but this is not certification of the intended keyboard layout or safe-area
   geometry. Dismissal restores the header.
3. **Garment form below the fold:** native automation scroll/drag did not
   reliably scroll the sheet; one drag opened a media tile like a tap. The
   separate Codex-browser DOM had a scrollable body (`clientHeight=744`,
   `scrollHeight=1486`, `overflowY=auto`), but that does not prove iOS touch
   scrolling. Field focus, multiline editing and form keyboard dismissal
   remain unverified. No touch-scroll defect is inferred from the tool limit.
4. **Local authenticated bootstrap:** before the isolated restart, an
   unauthenticated Simulator was redirected toward sign-in and the native dev
   host reported `Missing App Router element entry during render: layout:/`
   and `Cannot read properties of undefined (reading 'import')` in
   `@vitejs/plugin-rsc`. A hydration overlay accompanied that path. The isolated
   fixture rendered without that overlay. This is local-dev evidence, not a
   reproduced production sign-in failure.

No real-device, dark-theme, landscape, authenticated-role, mutation, durable
chat-history, interrupted-response or full six-surface screenshot acceptance
is claimed. `STU-012C` remains open; this bounded check supplements its evidence.

## Capture integrity

| File | SHA-256 |
| --- | --- |
| `01-home.png` | `3ab0acf752d7add155596cdad3091599f53157927eefef53defae14e47929758` |
| `02-search-keyboard.png` | `e164be803d8852868e543f69ed59ab3bf1ad24689859dcd8b1bd2eba48bfb70b` |
| `03-nested-media.png` | `d79d9fb17ef48b0c0d0d3fc343b32103d71aeefc7e8f7c45a7d9f4754184da0a` |
| `04-ask-keyboard.png` | `4ed8d7620b6a4b75075b53b697313ffb2f42dddaf71b1d0cb824310c9d828344` |
| `05-ask-keyboard-dismissed.png` | `d6be6a1f7a8fdd3b485dd9416c4d0e4f0809a6a4a5e5406916567d66792e6357` |
