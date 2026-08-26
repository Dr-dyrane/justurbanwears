# G001–G024 manual workflow and semblance audit

Audit date: 2026-08-26

Scope: private accepted media for Garments 001–024, semantic views 01–07, authority media, operation/state records, relevant Git history and legacy JUW task decisions

Outcome: the manual workflow is creatively proven and substantially durable, but portable replay still has four concrete gaps: one missing accepted byte asset, two incorrect asset-index hashes, an authority-manifest schema ambiguity, and an unimplemented provider-neutral ledger/qualification layer.

## Implementation resolution — 2026-08-26

The bounded portability implementation following this audit resolved three actionable gaps without changing any accepted image bytes:

- the two G022 public-index hashes now match the private source manifest and exact files;
- `portable-authority-kit.v1.json` explicitly records approval and immutable-lock status without changing the production private Blob manifest bytes;
- the provider-neutral semantic/execution identity, capability preflight, artifact/evaluation identities and ledger invariants are executable and tested; and
- `verify-portable-bundle.mjs` verifies the minimal authority kit plus one active garment rather than treating all history as an invocation dependency.

The G005/01 accepted byte remains historical evidence unavailable in the local archive. It is not required by the minimal active-garment portable bundle and must not be synthesized or substituted. Studio provider calls still require a separately reviewed cutover to the new ledger boundary.

## Technical summary

The strongest durable pattern is not a magic prompt. It is a controlled sequence:

```text
DIRECT GARMENT TRUTH 01–04
→ COMPLETE REAL FACE AUTHORITY
→ COMPLETE REAL BODY AUTHORITY + V4 TRANSFER CONTROLS
→ GARMENT-SPECIFIC SUBJECT LOCK
→ STYLING CHECK + LOCKED ATELIER
→ ACCEPTED 05
→ INDEPENDENT 06 || 07
→ WHOLE-FRAME HUMAN APPROVAL
→ BYTE LOCK + SEMANTIC EXPORT + LIVE VERIFICATION
```

The workflow produces its best results when each authority controls only its permitted layer, generated precedents remain subordinate to direct evidence, and side/rear views receive dedicated angle-specific body authority. The main observed drift is not the room or hair. Those are unusually stable. Drift accumulates when an accepted generated garment becomes the next garment's sole visual baseline, especially in side/rear body geometry and in the 03/04 semantic roles.

The portable operating method is now consolidated in `docs/virtual-atelier/MODUS-OPERANDI.md`. This audit preserves the evidence and exceptions behind that method.

## Scope and methodology

Evidence reviewed:

- mandatory Atelier contract, canon, state, active G024 brief, asset index and runbook;
- all 148 available accepted semantic-view files under `storage/garments/drop-02/001–024/locked/`;
- chronological contact sheets for model views 05–07;
- by-view contact sheets for 01–07;
- face-region and torso-to-upper-thigh crops for 05–07;
- the real-face operation board, body canon, three-view body board, rear operation board and exact room plate;
- private lock manifests and operation records for the key win/failure garments;
- relevant Git releases from G023/G024 and earlier garment history; and
- the legacy `Konan Identity + Styling` task's recorded audit/decision handoff.

Visual comparison was qualitative and authority-relative. No biometric score was used. Camera distance, pose, heel height, garment stiffness, colour contrast and silhouette-obscuring construction were treated as confounders. Direct real Lulu evidence outranks every generated comparison frame.

## Coverage

| Measure | Available | Expected | Coverage | Interpretation |
| --- | ---: | ---: | ---: | --- |
| All semantic slots, G001–G024 | 148 | 168 | 88.1% | Includes founding-era and intentional partial protocols |
| Model views 05–07 | 69 | 72 | 95.8% | Only G017 lacks all three model views |
| Garment views 01–04 | 79 | 96 | 82.3% | G001–G004 predate the full seven-view protocol; G005/01 byte is absent |
| Mature protocol, G006–G024 | 130 | 133 | 97.7% | The only gap is intentional G017/05–07 |

Exactly 20 semantic slots are absent:

- G001–G004: 01–04 absent by historical design, 16 slots;
- G005: 01 absent from the local locked archive despite an accepted record, one slot; and
- G017: 05–07 intentionally absent after terminal provider failures, three slots.

This distinction matters. G001–G004 and G017 are not unfinished in the same way. The first four established the model-view grammar before the complete protocol existed. G017 is a deliberate four-view partial product with rejected/no-output model lanes.

## View-by-view findings

### 01 — garment front

From G006 onward, 01 generally preserves a recognizable clean front presentation and is the most reliable garment authority. Background treatment changes across eras—from warm floating presentation to more neutral brown/taupe presentation—but this is presentational drift rather than construction drift.

The governing risk is allowing a polished 01 to replace direct source truth. It is a working translation authority only. Direct source captures remain the final construction authority.

### 02 — garment back

Most garments have no direct rear source. Their 02 is therefore an inferred presentation. The recurring risk is plausible invention: rear yokes, pockets, seams, closures, ruching or fastening systems may look commercially reasonable while remaining unproven.

The successful rule is inference quarantine: 02 may support catalogue presentation but may never become direct construction evidence or train the next garment's rear truth. G017 is stronger because direct rear captures establish its openings, strap and connector placement.

### 03 — mannequin front

03 shows the clearest semantic drift:

- many accepted early/middle garments preserve a source-room or source-mannequin presentation;
- G015/03 is a direct source-room mannequin capture accepted after generated corrections drifted from construction;
- G021/03 uses a stylized dark warm studio rather than a genuinely neutral sweep;
- G023's first public 03 leaked the private source-room family and was explicitly replaced; and
- corrected G023/03 and G024/03 are the best current source-safe neutral precedents.

The current guardrail is stricter than historical acceptance: an anonymous neutral mannequin on a seamless neutral sweep, with no reconstruction of source walls, curtains, tile, room lighting or distinctive mannequin.

### 04 — visible detail

04 has gradually expanded from a close construction/material view into, at times, a second full-garment presentation. G023/04 is visually close to another hero/front view, while G024/04 returns to a useful neckline/shoulder close detail.

04 must show a source-visible construction area or cloth response at detail scale. It cannot prove fibre, composition, stretch, lining or hidden construction, and it should not duplicate 01.

### 05 — Lulu front master

The light Atelier, centre-part low bun, frontal camera family and head-to-toe retail stance are highly stable across G001–G024. Face continuity is strongest from G006 onward. The most noticeable shifts are small changes in face length/cheek interpretation and model scale within the room, especially at some era boundaries.

Body drift is less obvious in 05 than in angle views because front garments can conceal depth. G019–G022 read straighter through waist-to-hip transition than the direct body authorities and the strongest early anchors. G023 corrects this through a whole-body rebase; G024 strengthens the most recent front balance further.

### 06 — Lulu left profile

06 is the most diagnostic view for body drift. It exposes whether the operation preserved a connected torso, waist, pelvis, rear profile and upper-thigh relationship rather than a generic slim fashion-model side view.

- G001/G004 and G007–G010 provide strong early/middle continuity.
- G013–G016 are more variable, partly because trouser shape and long garments obscure the contour.
- G019–G022 show the clearest recent compression/straightening relative to direct side authority.
- G023 improves the connected profile after the user's too-slim rejection.
- G024 is the strongest recent recovery and should be used with, not above, direct real authority.

The correction is not isolated enlargement. It is restoration of the complete evidence-supported silhouette under normalized pose and optics.

### 07 — Lulu right rear three-quarter

07 is the most sensitive view and the most likely to trigger provider moderation or garment invention. The room and turn direction remain stable; complete-back drift is generally avoided. Body geometry varies more than identity.

- G001–G004 establish the correct right-rear three-quarter grammar.
- G007–G012 retain strong rear/upper-thigh continuity.
- G013–G016 vary with garment coverage and appear less consistent as a group.
- G019–G022 are visually straighter/flatter than the direct rear-operation board.
- G023's accepted r005 uses the packaged rear board after direct invocations returned no bytes.
- G024 provides the strongest recent accepted rear-angle continuity.

Every 07 still inherits only source-proven garment rear facts. If the garment rear is unknown, the output remains an inferred presentation regardless of how convincing it looks.

## Era audit

### G001–G004 — founding model-view anchors

Wins:

- established the light room, camera family and 05/06/07 turn grammar;
- provided stable pre-drift translation guidance; and
- G004 created especially useful front/profile/rear balance and sibling lineage.

Limits:

- no 01–04 garment set under the later protocol;
- identity translation evolves between garments; and
- generated frames remain guidance, not primary face/body authority.

Use these for scene and view continuity, never to override current real identity/body evidence.

### G005–G008 — holistic-subject method becomes repeatable

Wins:

- G005 proves the two-pass holistic subject method and explicit whole-frame user rebase;
- G005 establishes that user approval can correctly override an automated pixel-difference false rejection;
- G006–G008 show improving identity continuity; and
- G007/G008 restore stronger angle-specific body continuity.

Failures/limits:

- two premature G005 attempts changed identity styling before the garment was locked;
- G005 accepts mild facial angle variance;
- G005/01 is recorded as accepted in state but the exact locked file is absent locally; and
- early manifests are not structurally uniform.

### G009–G012 — strongest repeatable middle-period sequence

Wins:

- full 01–07 process, advisory styling gate, locked room and sibling lineage work cleanly;
- face/room continuity is strong; and
- accepted angle views provide useful collection continuity.

Failures/limits:

- a translation reference transferred unauthorized jewellery into G009;
- the first automated gate incorrectly passed G009/06 and 07 despite deficient angle geometry;
- the root cause was missing dedicated side/back canon plus insufficient whole-silhouette language; and
- G009 boots change perceived stance/height and must not be mistaken for body drift.

This era proves why direct angle evidence must be explicit and why whole-frame user review outranks an automated pass.

### G013–G016 — garment complexity and semantic exceptions

Wins:

- operational sequence and room remain consistent;
- G013 records its accepted surface mismatch honestly; and
- G015 preserves construction truth by using direct-source presentation when generated attempts drifted.

Failures/limits:

- G013 retains a user-waived surface mismatch for that garment only;
- G013's exception is not precedent;
- side/rear silhouette continuity is less stable across the group; and
- G015/03 does not satisfy today's neutral source-safe 03 standard even though it was the least-wrong construction-preserving historical choice.

### G017 — capability failure handled correctly

Wins:

- direct front and rear garment truth is unusually strong;
- 01–04 are locked without inventing substitute model views;
- 12 built-in calls across 10 materially different strategies were recorded as no-output moderation failures;
- two Gateway candidates were rejected despite returning pixels; and
- the partial four-view release was explicit and live-verified with no placeholder or reused Lulu media.

Failures/limits:

- no accepted 05, therefore no authorized 06/07 lineage;
- output moderation produced category `sexual` false positives on a fully clothed retail transfer;
- Seedream failed identity/body/room/format/realism and added a watermark; and
- Flux passed garment/format but failed Lulu identity/body, room immutability and realism, while exceeding its declared cost cap.

The lesson is capability, not wording. Consent, authority declarations and neutral fashion context do not override provider moderation. Repeated euphemistic prompt rewrites are not a production strategy.

### G018–G022 — throughput improves while body/semantic drift accumulates

Wins:

- full sets are completed quickly;
- room, icon, hair and overall face family remain coherent; and
- garment silhouettes remain recognizable.

Failures/limits:

- 06/07 become progressively straighter through G019–G022 relative to direct body authority;
- the effect is most visible in profile/rear crops rather than front masters;
- G021/03 uses a stylized room rather than the current neutral-source-safe standard; and
- accepted chronology appears to have become too influential as a body baseline.

This is the clearest evidence for a multi-era baseline and direct-canon recheck on every garment.

### G023–G024 — explicit drift correction

Wins:

- G023 replaces a source-leaking 03 with a neutral source-safe view;
- G023 rejects and supersedes a too-slim subject lock rather than preserving it as authority;
- G023 rebases the complete body, then branches 06/07 independently;
- G024 carries the correction forward with stronger recent profile/rear continuity; and
- both releases retain exact manifests, semantic Shop export and live verification.

Limits:

- G023/04 is still broad for a true detail role;
- G023/07 required a packaged rear board after two output-moderation no-assets;
- G024 is accepted but must not become the sole future body authority; and
- G024 face/model scale appears slightly more editorial than some mid-era anchors, so future checks should use real face evidence and a multi-era baseline.

## Per-garment audit matrix

`Complete` refers to the protocol valid for that garment, not necessarily seven files.

| Garment | Coverage | Strongest retained lesson | Drift or portability note |
| --- | --- | --- | --- |
| G001 | 05–07 | Founding room and view grammar | Historical model-only protocol |
| G002 | 05–07 | Purple accepted room family | Historical model-only protocol |
| G003 | 05–07 | Packeted sibling sequence | Historical model-only protocol |
| G004 | 05–07 | Best early front/profile/rear translation anchor | Generated guidance only |
| G005 | 02–07 + subject | Whole-frame two-pass user-approved subject rebase | Accepted 01 byte missing locally |
| G006 | 01–07 | Full protocol continuity | Transitional manifest grammar |
| G007 | 01–07 | Strong angle/body correction precedent | Rear remains inferred when source rear absent |
| G008 | 01–07 | Stable casual-wear sibling continuity | Do not transfer denim facts |
| G009 | 01–07 | Styling gate and dedicated angle-canon lesson | Initial 06/07 false pass; boots confound stance |
| G010 | 01–07 | Strong room/identity continuity | Inferred rear quarantine still applies |
| G011 | 01–07 | Strong collection continuity | Inferred rear quarantine still applies |
| G012 | 01–07 | Strong mature manual sequence | Garment coverage affects silhouette reading |
| G013 | 01–07 | Explicit user exception record | Texture waiver is garment-only; no precedent |
| G014 | 01–07 | Stable room and identity | Angle silhouette appears straighter |
| G015 | 01–07 | Direct-source fallback preserved construction | 03 violates current neutral-source-safe rule |
| G016 | 01–07 | Complete sequence maintained | Camera/garment coverage complicates body comparison |
| G017 | 01–04 only | Honest partial publication and capability stop | No 05–07; no placeholder allowed |
| G018 | 01–07 | Return to stronger fitted-dress angle depth | Some identity/pose variance at angles |
| G019 | 01–07 | Fast complete workflow | Profile/rear silhouette begins recent straightening |
| G020 | 01–07 | Strong garment recognition | Side/rear body authority is underexpressed |
| G021 | 01–07 | Stable identity/room in model views | 03 is stylized, not neutral; body remains straightened |
| G022 | 01–07 | Stable face/room and full release | Two source hashes are wrong in asset index |
| G023 | 01–07 corrected | Source-safe 03 and full-body rebase | 04 too broad; initial subject may not parent |
| G024 | 01–07 | Strongest recent front/profile/rear recovery | Use with direct canon, never as sole future authority |

## Identity and semblance findings

Face continuity is materially better than body-angle continuity across the collection. Stable elements include the centre-part low bun, complexion family, eye/brow relationship, restrained catalogue expression and front/profile/rear turn logic. Variation is greatest at three-quarter angles, where cheek/jaw width, nose depth and face length can move toward a generic editorial model.

The control response is not to promote one generated face as the only parent. Every 05–07 operation must receive the complete real-face operation board plus the approved translation lock. The generated lock supplies repeatability; real multi-angle photographs supply truth.

Body semblance must be reviewed as a connected adult silhouette. The authority-supported relationships are torso-to-waist definition, lateral hip breadth, rear/profile depth, pelvis-to-upper-thigh continuity, thigh/leg balance and heel-aware stature. A correction that changes only one contour fails even if it superficially answers the latest complaint.

## Room, camera and brand findings

The Atelier is the most stable layer from G001–G024. The wall icon, warm-neutral light, vase, brass rail, garments, ottoman and rug retain a coherent family. Small variations occur in crop, subject scale, icon position and spotlight intensity. They are generally non-blocking until they alter the room layout, introduce substitute branding, shift to a dark showroom or make the subject appear composited.

The exact empty room plate remains the primary authority. Accepted garment images are only translation guidance for integration and camera family.

## Verified reproducibility defects

### 1. Missing G005/01 accepted byte

`state/current.json` and the G005 brief record `garment.005.view.01.accepted`, including SHA-256 `854fd7fea360639e551fcf544c9ba89bc0cdeee00d3bc9082754a8372480c798`, but `storage/garments/drop-02/005/locked/01-garment-front.png` is absent. The lock manifest also omits it while claiming a complete accepted 01–07 set.

Impact: a fresh machine cannot reconstruct the exact accepted G005 garment-front authority from the local archive alone.

Required repair: recover the exact bytes from an approved private archive or Blob, verify the recorded hash/dimensions and add them to the private lock. Do not regenerate a replacement under the old asset ID.

### 2. Two G022 asset-index hashes are incorrect

`node scripts/virtual-atelier/verify-assets.mjs --json` currently fails only these required objects:

- `garment.022.close-front-primary`: indexed `b4cf536b…f004`, actual private byte hash `b4cfaf68…f004`;
- `garment.022.full-front-continuity`: indexed `dda34b66…4642`, actual private byte hash `dda34d06…4642`.

The private source manifest agrees with the actual files. Impact: complete preflight fails even though no pixel repair is needed. The tracked asset-index metadata should be corrected in one bounded repair with no source-byte change.

### 3. Private authority manifest lacks explicit per-asset lock fields

The private Lulu V4 manifest is operational and includes 11 assets with exact pathnames, SHA-256, dimensions, byte size and MIME type under `LULU_V4_2026-08-25.4`. Its approval/lock state is implied by the authority revision and semantic roles rather than declared on every asset.

Impact: a third-party operator could misread an operational control as merely available media.

Required repair: a future authority revision should add explicit per-asset `acceptance` and `lockedStatus`, update the sync validator and atomically replace the private manifest. Existing bytes and hashes must not change.

### 4. Provider-neutral replay remains proposed

ADR 0046 correctly separates semantic operation hash, provider execution hash, artifact hash and evaluation hash, and defines capability preflight, event ledger, idempotency and provider qualification. It remains `Proposed`.

Impact: prompts and JSON records are durable, but cross-provider retries, duplicate-cost prevention, reconciliation and qualification are still manual.

## What “portable anywhere” requires

### Already durable

- authority order and semantic roles;
- locked room and view grammar;
- per-garment facts/unknowns;
- exact hashes for most private assets and accepted outputs;
- rejected-parent prohibitions;
- whole-frame approval logic;
- semantic Shop export; and
- exact live release evidence.

### Still required

1. Recover exact G005/01 bytes.
2. Correct the two G022 asset-index hashes.
3. Add explicit per-asset acceptance/lock state in the next private authority revision.
4. Create and test an encrypted authority-bundle restore command.
5. Implement ADR 0046's semantic ledger and provider adapters.
6. Add a versioned provider qualification suite using G024 plus G005, G009, G017 and G023 failure cases.

## Provider qualification set

A new provider/model/adapter revision should not begin on a new garment. It must first demonstrate:

- G024-like 05 front identity/body/room preservation;
- G009-like 06 profile continuity with the dedicated side canon;
- G023/G024-like 07 rear-angle continuity with the rear operation board;
- G023-like source-safe 03 without reconstructing the intake room;
- G005-like holistic subject translation with the full real-face stack;
- G017-like moderation/capability reporting without unsafe automatic retry;
- local one-layer correction without regenerating accepted surroundings; and
- exact operation, output, review and decision recording.

Passing means satisfying the same semantic gates, not matching accepted pixels byte-for-byte.

## Limitations

- This is a retrospective visual and records audit, not calibrated biometric or anthropometric measurement.
- Garment structure can conceal body geometry, especially trousers, maxis and structured fabrics.
- Historical acceptance remains authoritative for those exact outputs; this audit does not retroactively reject them.
- Current guardrails are intentionally stricter for future work than some historical 03/04 precedents.
- Private Blob object integrity was previously verified for the current 11-object authority revision, but this report does not duplicate private credentials or objects.
- Legacy task content was used only to recover decisions and failure lessons; durable future operation must not depend on chat availability.

## Audit conclusion

The manual Atelier workflow is reproducible as a decision system today and can be operated consistently by another authorized human with the repository plus private media. It is not yet a fully self-restoring, provider-independent production system.

The durable standard is now explicit: direct evidence first, one semantic role per view, complete real identity/body authority on every model operation, accepted 05 as the only sibling parent, angle-specific canon for 06/07, neutral source-safe 03, genuine detail 04, whole-silhouette review, exact byte locking, explicit human approval and verified live release.
