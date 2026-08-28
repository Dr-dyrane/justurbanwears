# JUW empty atelier plate

## Purpose

The empty atelier plate is the reusable room authority for placing Lulu and future garments without asking the image generator to recreate the set on every view.

It is derived from the approved purple `05 FRONT MASTER` room authority at exactly `1024 × 1280`. The source-authentic wall icon, vase and branches, brass rail and garment sequence, cream ottoman, rug placement, colour temperature and portrait camera grammar remain the governing visual system.

The durable engine may use this exact native plate only through
`juw.atelier-native-room-canvas.v1`. GPT Image 2 still supplies a transparent
1024 × 1536 subject; the compositor accepts the centre 1024 × 1280 window only
when all non-zero alpha remains inside its additional 16-pixel guard, then
copies the retained pixels one-to-one over this room. It never resizes,
resamples, crops, pads, extends or regenerates room pixels. This geometric
eligibility does not enable paid production: route composition and the closed
stage-specific qualification bundle remain separate fail-closed gates.

## Approved operational plate

```text
logical asset: juw.atelier.empty-plate.v1
private filename: juw-room-v1.png
sha256: 0b591197d2de1b490c4305ac0aed4d1089564562c7b1005411a8340168aabb72
bytes: 1,144,381
dimensions: 1024 × 1280
status: ACCEPTED_OPERATIONAL_AUTHORITY / LOCKED_IMMUTABLE
```

The plate contains no person. Its exact private bytes remain outside the public
repository; `assets/current.json`, `state/current.json` and the private
`LULU_V4_2026-08-25.7` readback manifest bind its operational identity.

## Historical monitor candidate

The earlier sandbox-only candidate `JUW_ATELIER_EMPTY_PLATE_v33.png` is retained
as audit history under the non-authoritative label
`juw.atelier.empty-plate.candidate.v33`. Its SHA-256 was
`1aecb249fc8bc35b4466a500b73e03b63aaf9d655a221b8c512f29abdf77e9d4`, its
size was 2,426,092 bytes, and its status stopped at
`MONITOR_PASS / HUMAN_LOCK_PENDING`. It is superseded and must not resolve as
`juw.atelier.empty-plate.v1`, a parent, or provider authority.

## Historical monitor evidence

The superseded v33 candidate passed the automated room monitor:

- dimensions: `1024 × 1280`
- wall icon: byte-identical within the canonical icon region
- vase and branches SSIM: `0.99998`
- rail and garment region SSIM: `0.99671`
- ottoman SSIM: `0.99871`
- rug SSIM: `0.99905`
- approved-model roundtrip MAE: `1.143 / 255`
- approved-model roundtrip RMSE: `3.694 / 255`
- empty-centre edge density within the configured room threshold

The roundtrip test inserts the approved source model back over the candidate plate and verifies that the resulting photograph returns closely to the approved source. This protects against accepting an empty room whose lighting, scale or camera family cannot support Lulu correctly.

## Reproducible monitor command

```bash
npm run atelier:monitor:room -- \
  --source /storage/virtual-atelier/approved/002-05-front.png \
  --candidate /storage/virtual-atelier/candidates/JUW_ATELIER_EMPTY_PLATE_v33.png \
  --roundtrip /storage/virtual-atelier/qa/JUW_ATELIER_EMPTY_PLATE_v33_roundtrip.png \
  --report /storage/virtual-atelier/qa/JUW_ATELIER_EMPTY_PLATE_v33.monitor.json
```

The command exits non-zero if dimensions, protected room regions, centre continuity or the roundtrip test fail.

## State rule

`MONITOR_PASS` did not silently equal human approval. The v33 candidate never
became authority. The separately accepted `juw.atelier.empty-plate.v1` above is
the locked room and may no longer be regenerated or replaced implicitly. Its
native dimensions are now geometrically eligible, but paid Atelier use remains
blocked until route composition and the receipt-bound canvas/evaluator
qualification pass.
