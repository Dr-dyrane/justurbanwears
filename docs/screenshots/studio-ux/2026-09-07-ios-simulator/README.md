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

## Bounded correction follow-up — 14:07–14:08

The same native Simulator, fixture and process-only safety overrides were used
to check the local correction based on `b184efb`. A fresh `127.0.0.1` origin
was used after the earlier `localhost` document retained stale development
assets during a Vinext HMR failure. No production failure is inferred.

- [Keyboard open](06-ask-keyboard-corrected.png): Back and the Ask Studio header
  remain visible; the composer containing unsent `Hi` sits above Safari's
  keyboard controls. The conversation is the scrollable area, not the composer.
- [Keyboard dismissed](07-ask-dismissed-corrected.png): the composer returns
  to the bottom of the canvas, retaining `Hi`; current piece remains the exact
  `JUW-001 / Coral Drift Dress · Ready` fixture. Back returns to Home.
- Home and Profile now render a neutral person icon instead of a broken image.
  Profile truthfully says `Studio preview` / `No connected profile`, and its
  private authorization action is disabled. A fresh Codex-browser fixture
  Home → Profile check recorded zero avatar or consent resource requests.
- At 1440 × 900, the Codex browser retains the established right island.
  Tasks opens and dismisses without losing an unsent composer draft. This
  desktop check is separate from the native Simulator captures.

The implementation removes inherited page-bottom padding, gives the thread
its own scroll container (including older-message position preservation), and
binds Ask's mobile shell to the visual viewport with cleanup and pinch-zoom
protection. No Send, Save, Publish or consent command was clicked. No paid
provider work or business mutation was performed. The unsent drafts were
cleared after the check.

Focused checks: 93/93; release typecheck and native Vercel build passed;
CSS/font budget passed at 559.99 KiB raw CSS / 560 KiB. One independent review
found the older-message scroll-owner mismatch; its bounded correction and
recheck passed. The full authenticated/device acceptance limits above remain
open; these two corrected observations do not close `STU-012C`.

| File | SHA-256 |
| --- | --- |
| `06-ask-keyboard-corrected.png` | `8e3716c2c7e0c7e665d5b80bff888629f9b156763e71d59da3b8aacd515127fe` |
| `07-ask-dismissed-corrected.png` | `a2b8235f46243f502a3ac44785f6b06972a2fe7f33bf5823fa0c464fd123f7d8` |

## Release receipt for the preceding correction

`b2ea93d5f2110d5d5fedf8b8993649628aa4f2ff` was live-verified on the canonical
domain through READY deployment `dpl_7qo6K6XvDqbkfv5du7tqgLZzYuBV`.
Production smoke passed 35/35. A fresh authenticated Ask document loaded that
deployment's CSS: at 437 × 782, the composer ended exactly at y=782 with its
own 74.195px height and the thread was the scroll owner. At 1440 × 900,
History opened and dismissed its established side island. This production
browser evidence remains separate from the native fixture evidence above.

## Garment form follow-up — 14:29–14:59

Source: `b2ea93d` plus the bounded `app/foundation.css` control-font correction.
The same native Simulator and isolated local fixture were used. The 9px field
label size had been inherited by inputs, selects and textareas: focusing a
field caused Safari auto-zoom, right-edge clipping and header displacement.
The retained correction explicitly sizes control text at 16px, keeps the
existing label typography, and does not disable user zoom.

- Native title typing no longer auto-zooms or clips the field's right edge.
- [Description multiline typing](08-form-multiline-partial.png) shows a newline
  and temporary `A` above the keyboard. Keyboard Done restores the sheet header;
  Close returns to Piece. Reload cleared all unsaved fixture edits. No Save,
  Publish or domain command was dispatched.
- **Still open:** Safari can pan the sheet header/Close offscreen while the
  keyboard is open. One attempted visual-viewport sheet adjustment kept Close
  visible but hid the focused description below the keyboard. That adjustment
  and its source assertion were removed after native recheck; they are not
  part of the release. A further keyboard-scroll correction needs a separately
  bounded cell, not a claim that the native form is fully certified.
- Find on Page was used to reach the fields after native automation scroll and
  drag did not move the sheet. Touch-scroll certification therefore remains
  open; no product touch-scroll failure is inferred from that tool limitation.

Focused checks: 25/25; targeted lint, release typecheck, native Vercel build and
CSS/font budget passed (559.98 KiB raw CSS / 560 KiB). One independent review
found no blocker in the retained font change. No migration or external
configuration is required. Physical-device and authenticated-role limits
remain unchanged; `STU-012C` is still partial.

Capture: unmodified 1320 × 2868 PNG, SHA-256
`ae42012d004052c06115bd0bbba9fc920bee40409ff16ed7cd0b139dd41afd69`.

## Next bounded cell — native verification blocked, 15:11

Base: clean `main` / `origin/main` at
`d13f9552a06738b78af3e83ab0e7cdf5baeb90d2`. That revision, including the
separate footer-copy commit `0e1e934`, was live-verified through READY
`dpl_9aniKySJqkNAHkSoStt4f8Dgy6N8`; production smoke passed 35/35 and the
authenticated listing editor rendered 16px inputs, select and textarea.

The next candidate is **local-uncommitted**, not released. It binds the mobile
task sheet to the visible viewport and, after layout, reveals the active field
inside its nearest scroll owner. It excludes nested-dialog focus, preserves
pinch zoom and existing desktop geometry, and disposes its listeners on close.
Runtime paths: `lib/studio/ui/task-sheet-viewport.ts`,
`components/studio/atoms/studio-task-sheet.tsx`, and
`app/studio-stack-navigation.css`. The regression file is
`tests/studio-task-sheet-viewport.test.ts`.

The six new behavioral cases and existing focused contracts pass 31/31;
targeted lint and diff checks pass. One independent source review found no
blocker in the candidate. Native acceptance is **not proven**:
Simulator screenshots and accessibility reads still show the running iPhone,
but taps return `noWindowsAvailable`. Reattaching the app and one tool-kernel
reset did not restore interaction. This is a computer-control blocker, not
evidence that the candidate passes or fails on iOS. The local host remains on
`127.0.0.1:3001`. No build, commit, push, deployment or domain mutation was
performed for this candidate. Production remains at `d13f955`.

Resume with native title, price and multiline-description focus: the active
field and Close must be simultaneously reachable with the keyboard open.
Then verify Done, Close, nested dismissal and unchanged desktop behavior;
run the single integration/build/CSS gate only after native acceptance.

## Resumed cell — focused native acceptance, 15:27–15:33

Simulator interaction recovered during the user-requested resume. The same
iPhone 17 Pro Max / iOS 26.5 Safari, light theme and isolated lifecycle fixture
were used; this is not physical-device or authenticated-role certification.

- Title, price and multiline-description focus keep the active field and the
  Facts & price header/Close simultaneously above the native keyboard.
- A native Return and `A` were entered in the description; the new line stayed
  visible. [Unmodified native capture](09-form-keyboard-corrected.png) is
  1320 × 2868, SHA-256
  `0cc252b480117794b24201fbd79cd72e90704e707960d45aa91453575e2edcb4`.
- Keyboard Done restores the full sheet. Close returns to the same Piece.
  Native touch-drag scrolls the sheet back to its photos; Fabric detail opens
  above it and closing that preview preserves the parent sheet.
- The temporary unsaved description edit was cleared by the CSS-refresh reload;
  subsequent native inspection showed the original fixture description. No
  Save, Publish, Confirm, business mutation or paid call was performed.
- The desktop check exposed an existing universal-CSS-reset defect, not a
  viewport-helper regression: `.studio-task-sheet` lacked `margin: auto` and
  rendered at x=0/y=0. Restoring that property in `app/foundation.css` centers
  the 840 × 820 sheet at x=300/y=40 in a 1440 × 900 viewport. Header, focused
  description and Close remain visible; scrollWidth equals clientWidth (840).
  Nested-preview dismissal restores the preview trigger, then closing the
  task sheet restores Facts & price. Mobile placement overrides remain intact.

The original focused set passed 31/31. The centering correction added one
contract; its affected file passed 7/7 with clean lint. One independent review
covered the candidate and confirmed the desktop root cause. Release typecheck
and the native Vercel build passed. The first CSS gate exceeded its unchanged
560 KiB budget by 0.14 KiB; consolidating the identical theme backgrounds into
the existing `--studio-canvas-deep` token brought the final build to 559.94 KiB.
CSS/font certification now passes. Release verification follows this receipt;
do not infer deployment from these local results. No migration or external
configuration is required.

This closes the bounded native form-keyboard check only. Full six-surface,
physical-device, landscape, both authenticated admins and mutation/recovery
certification remain outside this cell, so `STU-012C` stays partial.
