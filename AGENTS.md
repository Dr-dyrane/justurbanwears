# JustUrbanWears agent operating contract

This file governs every AI-assisted task in this repository. It is especially strict for the Lulu virtual-atelier workflow.

## Mandatory read order

Before any model, garment, catalogue-media, identity, body, atelier, branding, or view-generation task, read:

1. `docs/virtual-atelier/OPERATING-CONTRACT.md`
2. `docs/virtual-atelier/ATELIER-CANON.md`
3. `docs/virtual-atelier/state/current.json`
4. The active garment brief under `docs/virtual-atelier/garments/`
5. `docs/virtual-atelier/assets/current.json`
6. `docs/virtual-atelier/RUNBOOK.md`

Do not act from the latest user sentence alone. The repository state is the durable production memory.

## Non-negotiable rules

1. **Real identity first.** Real Lulu face references are the primary identity authority. Generated JUW faces are translation guidance only.
2. **Body canon is authoritative.** Do not reinterpret Lulu's body from descriptive words such as “curvy,” “hourglass,” or “full.” Use the approved body canon and its accepted geometry.
3. **The atelier is the approved light catalogue room.** The accepted Garment 001/002 imagery defines its layout, warm-neutral colour temperature, ambience, props and camera family. Never replace it with a dark showroom, reception counter, mirror, backroom, shelving, spotlight board or any newly designed boutique.
4. **Brand references control the icon only.** The wall mark is the small standalone canonical JUW icon. Never add `justurban`, `wears`, `BY LULU`, substitute lettering, circles, triangles, approximate geometry, or use a full logo-lockup image as room authority.
5. **Garment references control the garment only.** They have no authority over identity, body, room, branding, camera, pose, or styling unless explicitly granted.
6. **View grammar is fixed.** `05 = FRONT MASTER`; `06 = LEFT PROFILE`; `07 = RIGHT REAR 3Q`, never a complete back view.
7. **Accepted means immutable.** A locked layer may not be regenerated to fix another layer. A local correction must list the exact mutable region and preserve all other accepted pixels/concepts.
8. **One clean full image at a time.** Do not produce triptychs, contact sheets, labels, footers, measurements, cards, crops, or presentation boards unless explicitly requested.
9. **Never promote a rejected candidate.** Rejected outputs cannot become parents, authorities, or packet contents.
10. **Stop rather than guess.** If required reference media is unavailable to the actual operation, report the binding failure before generating.

## Required operation declaration

Every generation or edit must be preceded internally by a resolved operation record containing:

- `operation_id`
- `garment_id`
- `view`
- `parent_assets`
- `authority_stack`
- `change_set`
- `immutable_set`
- `output_contract`
- `failure_gates`

The operation is invalid if any required authority is unresolved.

## Media privacy

The repository is public. Never commit real face photographs, body plates, WhatsApp source archives, private garment evidence, or unapproved generated identity media. Local private media belongs under `/storage/`, which is gitignored. Sandbox storage is a transient working cache, not a durable archive.

## State discipline

User approval is authoritative. After each approval or rejection, update `docs/virtual-atelier/state/current.json` before beginning another operation. Do not rely on conversational memory to carry state.
