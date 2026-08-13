# ADR 0042: Studio Wear engine production acceptance

- Status: Accepted for private production use
- Date: 2026-08-13
- Owner: Studio
- Scope: private garment intake and Wear media; Shop publication remains a separate operator decision

## Decision

The Studio garment engine and its Wear child actions are accepted for private
production use. One authenticated operator can photograph or upload a garment,
confirm extracted facts, keep a product front, save a durable Wardrobe draft,
then create and review:

- an anonymous `MANNEQUIN_FRONT`;
- a `MODEL_TRY_ON` on approved Lulu V3;
- a `MODEL_TRY_ON` on a separately authorized adult stock model;
- an `EDITORIAL_MODEL` derived only from an approved try-on.

Every result remains private until the operator keeps it. Saving a garment or a
Wear view does not publish it to Shop. Unsupported back construction, closure,
lining, pockets and fibre remain unknown; the UI names the missing back and
fabric-detail captures instead of synthesizing them.

Production activation included migration `0004_fixed_betty_ross.sql`, a
content-addressed private Blob copy of the approved Lulu V3 authority, and an
idempotent server-only `lulu-v3` profile. Browser DTOs expose neither private
Blob paths nor authority hashes.

## Controlled acceptance inputs

The manual and Gateway lanes used the same exact normalized bytes:

| Authority | Source | SHA-256 | Use |
| --- | --- | --- | --- |
| Garment | [Marcelo Verfe · Pexels](https://www.pexels.com/photo/black-dress-on-a-hanger-19895958/) | `87cbaec74003c642f2d1374b4c7a64c20f0e6549081276a2da3e10a191c7e0b9` | Visible garment front only |
| Adult stock model | [Eli Freire · Pexels](https://www.pexels.com/photo/a-woman-posing-on-a-white-background-19307224/) | `667ed56cf740692b18873e8c21ad40db11c38c4b5715f1753037384cdd70576f` | Private identity/body/pose QA |
| Lulu | Approved private Lulu V3 authority | `ef88e65e78780101693720fd872c23857e4311412900acb28fdc139b08a373b8` | Private JustUrbanWears generation |

The stock sources are covered by the [Pexels licence](https://www.pexels.com/license/).
Generated stock-model views remain private QA and carry no endorsement claim.

Visible garment truth was limited to black colour, deep V neckline,
dolman/batwing short sleeves, gathered waist, straight midi silhouette and the
geometric cutout hem band.

## Manual versus Gateway result

| Acceptance point | Manual ImageGen lane | Live Studio Gateway lane |
| --- | --- | --- |
| API cost | `$0` | `$0.116` for the final six-generation flow; at most `$0.20` for the entire acceptance exercise |
| Calls / elapsed | 6 calls including one correction; `225.869s` | Six persisted image generations; measured Wear stages `72.7–89.9s` each |
| Product front | Pass | Pass; approved and durable |
| Mannequin front | Pass | Pass; approved and durable |
| Lulu V3 try-on | Pass | Pass; approved and durable |
| Stock-model try-on | Rejected after one correction for pose, hand and leg drift | Pass; approved and durable |
| Editorial background | Background passed, but inherited the rejected manual stock composite | `v1` rejected as visually unchanged; one bounded `v2` correction passed |
| Persistence | Private files and manifest | Neon rows, private Blob assets, decision ledger and reload recovery |
| Publication | None | Private Draft; absent from Shop |

The live flow stayed below the authorized `$2` cap. `bfl/flux-2-klein-4b`
reported either `$0.016` or `$0.021` per accepted operation. The engine records
actual Gateway cost and usage before enforcing its `$0.025` per-image ceiling.

## Live durable evidence

- Intake: `43e18906-6a07-4140-8fa7-71ecae5c6f37`
- Wardrobe item: `a633335a-ac3c-40f2-b9ae-8438fbddf03e`
- SKU: `INTAKE-A633335A`
- Title: `Black dress with cutout detail`
- State: `DRAFT · private · not for sale`
- Authorized stock profile: `c738f7b0-c40b-4f1c-8a76-2c317942c152`

| Operation | Generation | Prompt | Cost | Result asset SHA-256 | Decision |
| --- | --- | --- | ---: | --- | --- |
| `GARMENT_FRONT` | `71cf82a8-03ea-4ae6-97b7-71d7621afa10` | `garment-front-v2` | `$0.021` | `b4a2baf2cd1e4a4621d7ba130d4c1c0ba3930a8c2196de960b4b51e5f8863b9c` | Keep |
| `MANNEQUIN_FRONT` | `8e869a0c-4af1-4fac-b3fe-b429dd20dbda` | `mannequin-front-v1` | `$0.021` | `6d1aa21244903761b0c7b61638d9e1c8d4c7e6dd411543e5e8d83dcebb5342e9` | Keep |
| Lulu `MODEL_TRY_ON` | `d44f6913-f1df-47cc-ba46-321b15140dfe` | `model-try-on-v1` | `$0.016` | `ef95f32ca5b95f6e552d07511caa75ab2fb9bbf461b176a418c1a3ae1cbcb98e` | Keep |
| Stock `MODEL_TRY_ON` | `2da02805-9b90-48fc-8fb0-1728bde0bbfb` | `model-try-on-v1` | `$0.016` | `dffd0f8329f810b0aaa2e43a401de9564bc72d3f9ca8908eb050b92457da384f` | Keep |
| Stock `EDITORIAL_MODEL` | `3e081a10-113e-416d-8e71-e6d91653d2b3` | `editorial-model-v1` | `$0.021` | `70ecac…` | Reject |
| Stock `EDITORIAL_MODEL` | `d94039e7-a2f6-4faa-99e1-5468c7e5827d` | `editorial-model-v2` | `$0.021` | `3b7d0f01cae7094cdbf3607152c02c80ed0698b262039832a7d80146ab3a7a68` | Keep |

All final assets are private 1600×2368 JPEGs. Six operator decisions were
present in the append-only decision ledger. Reload restored 26 Studio garments
and both model authorities. A live Shop search found neither the SKU nor title.

## Experience acceptance

The progressive sheet passed the production browser story in dark and light
themes and at a 390×844 mobile viewport:

- mounted sheet flow, one action at a time, with no select menus;
- working spinner and `Private until kept` status;
- review, reject, edit, keep, expanded image and saved receipt states;
- 44×44 close target and 64px disclosure rows; no measured horizontal overflow;
- native modal semantics, labelled progress and live error/status regions;
- seven focusable controls in logical DOM order inside the chooser;
- axe WCAG A/AA scan: zero detected violations; one contrast check was
  inconclusive over the translucent backdrop and was manually readable;
- reduced-motion preference was honored; interruption and full reload recovered
  durable work;
- no console or network failure remained in the accepted flow.

The web experience deliberately does not simulate native haptics or sounds.
Press, progress, success and error feedback remain visual and screen-reader
announced. Compact mobile garment-card actions retain explicit accessible names
when their visible text collapses to icons.

## Curated evidence

| Stage | Evidence |
| --- | --- |
| Garment confirmation | [Dark review](studio-wear-acceptance/01-garment-review-dark.jpg) |
| Working state | [Mannequin generation](studio-wear-acceptance/02-mannequin-working-dark.jpg) |
| Detailed inspection | [Expanded mannequin](studio-wear-acceptance/03-mannequin-expanded-dark.jpg) |
| Lulu V3 | [Approved-model review](studio-wear-acceptance/04-lulu-review-dark.jpg) |
| Stock authority | [Licensed-model intake](studio-wear-acceptance/05-stock-authority-dark.jpg) |
| Stock try-on | [Stock-model review](studio-wear-acceptance/06-stock-review-dark.jpg) |
| Mobile Wear | [Dark chooser](studio-wear-acceptance/07-wear-chooser-mobile-dark.jpg) |
| Editorial correction | [Dark review](studio-wear-acceptance/08-editorial-v2-mobile-dark.jpg) |
| Saved receipt | [Light receipt](studio-wear-acceptance/09-editorial-saved-mobile-light.jpg) |

The manual prompt contract and hashes are retained in the private acceptance
bundle at `/private/tmp/juw-studio-acceptance-20260813/manual/`; source and
identity authorities are not copied into Git.

## Consequences

- Lulu can now complete the private garment-to-mannequin/model/editorial flow
  without a CLI operator.
- Manual ImageGen remains useful for expert exception work, but the live engine
  won this controlled stock-model test on pose consistency, durable lineage and
  recovery.
- A front photograph still cannot authorize a back, closure, lining, pocket or
  fibre claim. These remain missing captures.
- Catalogue publish/update/archive is still a separate audited command. This
  acceptance intentionally leaves the benchmark garment out of Shop.

## Release and rollback boundary

Runtime implementation: `fc6d8821fd1b08c5ee791ec08468f05428f1bfdf`.
Editorial correction: `c97ebf68bbd132698726064a7400c0d685408b0e`.

Rollback may hide the Wear UI and stop new jobs without deleting private Blob,
model-profile, generation or decision lineage. Migration 0004 is additive and
must not be reversed by dropping production records.
