# Virtual Atelier portable manual modus operandi

Status: governing manual-production method, revision 2026-08-26

This document turns the successful Garment 001–024 manual Atelier practice into a provider-neutral procedure that another authorized operator can reproduce on another machine. It does not make stochastic image output byte-reproducible. It makes the authority, lineage, evidence, review and acceptance decisions reproducible.

The governing outcome is materially equivalent accepted truth:

- the image reads as adult Lulu, not a generic generated model;
- Lulu's identity and complete approved body geometry remain coherent at the requested angle;
- the garment preserves only source-proven construction and explicitly labels inferred views;
- the locked JUW atelier, icon, light and camera family remain intact;
- the semantic view is correct;
- the frame is photographically believable; and
- the exact accepted bytes, decision and lineage are recoverable.

Human approval remains the final semblance gate. A provider, similarity metric or automated review cannot silently approve Lulu.

## 1. Authority before prompt

Never begin from descriptive prompt language alone. Resolve the authority stack in this order:

1. direct garment evidence;
2. real Lulu identity evidence;
3. real Lulu body-angle evidence;
4. approved V4 translation controls;
5. locked atelier and standalone JUW icon;
6. accepted garment-specific parent locks;
7. view-specific camera and pose grammar; and
8. advisory styling evidence, which never overrides the layers above.

Conflicts resolve toward the earlier, more direct authority. A generated control helps translation but never becomes real-person evidence merely because it looks convincing.

## 2. Minimum private authority kit

The optimized Studio runtime kit is the private manifest at `lib/server/private-asset-manifests/lulu-v4.json`. The cross-machine restore contract is `docs/virtual-atelier/portable-authority-kit.v1.json`, which adds the raw real-face anchors required to re-establish identity if an optimized board or translation lock ever needs to be rebuilt. Both manifests are safe to commit because they contain identifiers, hashes, dimensions and private pathnames rather than private pixels. The media remain private.

| Logical asset | Required role | Used for |
| --- | --- | --- |
| `lulu.face.real.primary` | Complete real Lulu face contact | Raw identity truth and board reconstruction |
| `lulu.face.real.v4.raw-frontal-closeup-eyes-closed` | Direct raw frontal facial evidence | Holistic identity synthesis and facial geometry |
| `lulu.face.real.v4.raw-three-quarter-open-eyes` | Direct raw three-quarter facial evidence | Angle identity and open-eye truth |
| `lulu.face.real.v4.front-lock` | Direct real-photo front lock | Front identity comparison; never styling authority |
| `lulu.face.operation-board.full.v1` | Complete real-face operation board | Every 05–07 identity operation |
| `lulu.face.v4.front.lock.v1` | Approved generated V4 translation lock | Repeatable face translation; never primary identity |
| `lulu.body.canon.v4` | Approved whole-body silhouette control | Holistic subject and front-body continuity |
| `lulu.body.canon.v4.three-view` | Approved three-view transfer control | Cross-angle proportion check |
| `lulu.body.canon.v4.front` | Front operation control | 05 |
| `lulu.body.canon.v4.side` | Left-profile operation control | 06 |
| `lulu.body.canon.v4.back` | Rear-angle operation control | 07 |
| `lulu.body.real.angle-contact.v4` | Direct real side/rear evidence | 06 and 07; useful in 05 body review |
| `lulu.body.real.gym-rear-profile.v4` | Direct real rear/profile evidence | 07 and rear-silhouette review |
| `lulu.body.rear.operation-board.full.v1` | Packaged rear operation board | 07 when a provider has a limited reference budget |
| `juw.atelier.empty-plate.v1` | Locked room plate | 05–07 scene authority |

The manifest's `authorityRevision`, per-asset SHA-256, byte size, MIME type, width, height and private pathname are the restore contract. A packaged board is a transport convenience, not new evidence. If a provider cannot receive the mandatory authorities without omission, the operation is `BLOCKED_CAPABILITY`.

The current manifest uses top-level approval and role semantics but does not yet store explicit per-asset `acceptance` and `lockedStatus` fields. Do not infer a new authority from that schema gap. A future authority revision should add those fields and re-sync the private manifest atomically.

## 3. Private restore and preflight

On any authorized machine:

1. restore the 11 manifest objects from private Blob or the approved encrypted backup;
2. verify every exact byte count and SHA-256 before use;
3. verify decoded dimensions and MIME type;
4. verify private access fails without authorization;
5. run `node scripts/virtual-atelier/verify-assets.mjs`;
6. resolve the active garment source manifest and locked parents; and
7. stop if a required authority is missing, mismatched or inaccessible.

`storage/` is an authorized local working archive, not the portable contract by itself. A copied directory without its manifest and hashes is not a valid restore.

The current full asset preflight has two known G022 metadata-hash failures recorded in the G001–G024 audit. They are metadata defects, not authority to alter the private source pixels.

## 4. Semantic view contract

Always name the semantic role before mapping it to a filename or provider slot.

| Working view | Semantic role | Truth boundary |
| --- | --- | --- |
| 01 | `GARMENT_FRONT` | Direct visible front construction only |
| 02 | `GARMENT_BACK` | Direct rear when available; otherwise conservative inferred presentation |
| 03 | `MANNEQUIN_FRONT` | Anonymous neutral mannequin on the warm cocoa catalogue backdrop; garment-presentation-only, never Lulu identity/body authority |
| 04 | `FABRIC_DETAIL` | Close visible construction/material response; never fibre proof |
| 05 | `MODEL_FRONT` / `FRONT_MASTER` | Accepted Lulu front master in the locked atelier |
| 06 | `MODEL_LEFT_PROFILE` | Independent sibling from accepted 05 with side canon |
| 07 | `MODEL_REAR_THREE_QUARTER` | Independent right-rear 3Q sibling from 05; never complete back view |

Historical Shop filenames map differently. Export only through `scripts/virtual-atelier/export-shop-media.mjs`; do not hand-map numeric filenames.

## 5. Manual production sequence

### 5.1 Intake and reserve

1. Copy private source media into the active garment's gitignored `source/` directory.
2. Hash and inventory every source before interpretation.
3. Write the garment brief with proven facts, unknown facts and prohibited inferences.
4. Reserve semantic views 01–07 and state whether direct rear or side evidence exists.
5. Update `docs/virtual-atelier/state/current.json` before invoking a model.

### 5.2 Establish garment views 01–04

Generate or isolate each view independently. No candidate may parent another candidate.

- 01 is the working construction authority after acceptance.
- 02 is quarantined as inferred unless direct rear evidence supports it.
- 03 must remove the source environment and use an anonymous neutral mannequin on the warm cocoa catalogue backdrop, never a white/pale sweep.
- 03 must not enter FACE, BODY, pre-room SUBJECT or final 05 authority. If a mannequin shape harms transfer, use a separate anonymous Lulu-proportioned garment-transfer form controlled by the body canon.
- 04 must be a genuine close visible-detail view, not a duplicate full-front hero.

Review garment construction before model work. Reject invented seams, closures, pockets, motifs, weave, fibre claims or source-room reconstruction.

### 5.3 Build one garment-specific subject

The subject chain is mandatory and staged: FACE identity first; BODY identity second while preserving FACE; then one complete pre-room subject render and lock. Do not collapse these stages into one final 05 invocation.

The successful G005 method is the precedent:

1. create and gate FACE from complete real-face authority plus accepted garment truth;
2. create and gate BODY from the accepted FACE parent plus body canon and direct real-body evidence;
3. create the complete neutral-staged pre-room subject from the accepted BODY parent;
4. review the whole frame, not only the face;
5. obtain explicit user approval; and
6. lock the exact accepted bytes as the garment-specific subject parent.

Automated pixel-difference rejection does not override an explicit, informed whole-frame user approval. Conversely, apparent likeness does not override construction or authority failure.

### 5.4 Resolve styling and create 05

Run the required official Fashion Nova advisory check and record `KEEP`, `REFINE`, `REPLACE` or `NO_CLOSE_MATCH`. It may guide footwear and restrained accessories only.

Place the intact accepted subject into `juw.atelier.empty-plate.v1`. Preserve identity, body, garment, hair and accepted subject geometry. Create one clean, head-to-toe 05 front master. Review and lock it before either sibling begins.

### 5.5 Create 06 and 07 as siblings

Both operations branch directly from accepted 05.

- 06 receives the face board, side body canon, direct angle evidence, exact room and garment safeguard.
- 07 receives the face board, rear operation board, direct rear/profile evidence, exact room and garment safeguard.
- 06 never receives 07, and 07 never receives 06.
- Neither inferred rotation becomes new garment-construction evidence.

The angle review must preserve the connected whole silhouette from shoulder and torso through waist, pelvis, hip, seat and upper thigh. Do not optimize, compress or enlarge one isolated region. Normalize for pose, heel height, garment stiffness, camera distance and perspective before calling a body drift.

### 5.6 Review, lock and publish

Run separate gates for:

- garment truth;
- identity;
- complete body geometry;
- atelier and icon;
- view grammar;
- sibling lineage;
- photographic realism and texture;
- full-frame format and artifacts; and
- privacy/provenance.

Record the exact user decision. Copy accepted bytes unchanged into `locked/`, update the private manifest and state, then export Shop derivatives. Publication requires catalogue/database verification, a READY deployment, affected-route smoke, seven-view gallery verification when seven views exist, and a clean console. A partial publication must explicitly omit unaccepted views; G017 is the precedent.

## 6. Operation record required for every invocation

Record before invocation:

- operation ID and workflow revision;
- garment ID and semantic view role;
- exact parent locks and hashes;
- ordered authority bindings by semantic role;
- change set and immutable set;
- proven garment facts, unknowns and prohibited inferences;
- scene, camera, pose and styling contract;
- output contract and failure gates;
- provider/model capability and privacy preflight; and
- correction budget.

Record after invocation:

- provider request/job ID and execution status;
- exact compiled prompt and reference packing;
- output path, bytes, dimensions and SHA-256;
- technical review and semantic review separately;
- user decision;
- accepted/rejected/superseded lineage; and
- release evidence if promoted.

ADR 0046 defines the provider-neutral semantic hash, execution hash and event ledger. The portable core is implemented in `scripts/virtual-atelier/operation-identity.mjs`; it derives canonical semantic and provider execution identities, fails closed on provider capability, separates artifact/evaluation identity and enforces lock reuse and unsafe-retry reconciliation. The private JSON operation record plus `state/current.json` remain the recovery authorities until Studio provider routing is cut over to the ledger.

Before trusting a restored environment, run:

```bash
npm run atelier:verify:portable -- --garment 024
```

This verifies only the universal immutable Lulu/atelier kit, the selected garment's direct sources, locked views and generation operation records. It does not require every historical garment merely because that history exists locally.

## 7. Drift-control baseline

Do not compare a new candidate only with the immediately preceding garment. Use a small multi-era baseline:

- G001/05–07 and G004/05–07 for founding room, camera and view grammar;
- G005 for the approved holistic subject/rebase method;
- G009 for the angle-canon failure and correction lesson;
- G023 for source-safe 03 and too-slim body rebase;
- G024 for the latest accepted front/profile/rear balance; and
- the direct real face/body authorities, which outrank every generated precedent.

Review 01–04 and 05–07 separately. A visually attractive frame can still fail its semantic role, and a correct role can still fail likeness or garment truth.

## 8. Failure atlas

| Pattern | Evidence | Rule carried forward |
| --- | --- | --- |
| Garment work began before 01–04 lock | G005 premature attempts | Lock garment truth before identity/body/room work |
| Automated review passed a deficient angle | G009 initial 06/07 | Dedicated angle canon and direct evidence are mandatory; user review overrides a false pass |
| Generated reference transferred jewellery | G009 subject R001 | Translation references cannot transfer styling unless granted |
| Unsupported material motif survived | G013 | A one-garment user exception is not validator precedent |
| Provider returned no bytes after output moderation | G017 and G023 rear attempts | Consent and valid authority do not override provider moderation; record no-output terminally and change capability, not euphemisms |
| Provider returned pixels but failed truth | G017 Gateway comparison | Returned pixels are not progress unless identity, body, garment, room, format and realism pass |
| Source environment leaked into 03 | G023 first public 03 | 03 is neutral and source-safe; replace only the defective semantic view |
| Subject became too slim across model views | G023 first 05–07 | Rebase the complete silhouette from direct canon; never patch one isolated contour |
| Rear/profile continuity remained weak | G024 direction | Use the complete rear board and direct evidence; assess the connected silhouette |
| Accepted record exists but locked byte is absent | G005/01 local archive | Acceptance needs a restorable exact file, manifest entry and verified hash |

## 9. Portability acceptance checklist

The workflow is portable only when all answers are yes:

- Can the operator restore and hash-verify the private authority kit?
- Can every authority be identified by semantic role rather than image number?
- Are garment facts, unknowns and inferred views explicit?
- Can the provider carry the complete mandatory stack without silently dropping it?
- Can 05, 06 and 07 lineage be reconstructed exactly?
- Are rejected and no-output attempts prevented from parenting?
- Can the exact accepted bytes and user decision be recovered?
- Can a new provider be calibrated before production use?
- Can publication be tied to an exact deployment and live smoke?
- Can all private identity/body/source media remain outside public Git and browser DTOs?

If any answer is no, the environment is not production-ready even if it can generate an image.

Provider qualification uses `docs/virtual-atelier/provider-calibration.v1.json`. A provider/model/adapter revision must pass G005 identity synthesis, the G009 angle false-pass correction, G017 terminal provider failure, G023 source-room/body correction and the complete G024 sequence. Qualification never auto-approves a generated Lulu candidate.
