# JUW empty atelier plate

## Purpose

The empty atelier plate is the reusable room authority for placing Lulu and future garments without asking the image generator to recreate the set on every view.

It is derived from the approved purple `05 FRONT MASTER` room authority at exactly `1024 × 1280`. The source-authentic wall icon, vase and branches, brass rail and garment sequence, cream ottoman, rug placement, colour temperature and portrait camera grammar remain the governing visual system.

## Current candidate

```text
logical asset: juw.atelier.empty-plate.v1
sandbox file: JUW_ATELIER_EMPTY_PLATE_v33.png
sha256: 1aecb249fc8bc35b4466a500b73e03b63aaf9d655a221b8c512f29abdf77e9d4
bytes: 2,426,092
status: MONITOR_PASS / HUMAN_LOCK_PENDING
```

The plate contains no person. It is not committed because the repository stores durable control state and hashes, while active media remains outside the public repository.

## Monitor evidence

The current candidate passed the automated room monitor:

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

`MONITOR_PASS` does not silently equal human approval. Until the user locks this plate, Garment `004/05` remains blocked from treating it as an immutable parent. Once locked, future garment operations reference the plate directly and may no longer regenerate the room.
