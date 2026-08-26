# Virtual Atelier control plane

This directory is the durable operating system for Lulu V4 garment-media production.

The purpose is not to store every image inside Git. The purpose is to preserve the **rules, current state, authority hierarchy, asset identities, hashes, approvals, and restart point** so a new session or agent does not reconstruct the workflow from memory.

## Core principle

> **Identity first. Clothing later.**

Real Lulu material defines identity and body. Approved JUW imagery defines how that real identity translates into the catalogue environment. Garment evidence controls only the garment. The atelier and brand icon are fixed assets, not recurring creative prompts.

## Storage model

### In Git — durable and public

- operating contract
- view grammar
- garment briefs
- current production state
- packet names and SHA-256 hashes
- logical asset IDs and authority roles
- approval/rejection records
- runbooks and acceptance gates

### Outside Git — private pixels

- real face photographs
- real body plates
- WhatsApp/source archives
- unpublished garment evidence
- unapproved generated identity media

During an active session these may be mounted in the sandbox or placed under the local gitignored `/storage/` directory.

The current private V4 authority is organized as:

```text
storage/models/konan/canon/v4/
├── authority-manifest.json
├── CANON_LOCK.txt
├── LULU_V4_BODY_ANGLE_CONTACT.jpg
├── LULU_V4_BODY_CANON_SOURCE.png
├── LULU_V4_BODY_THREE_VIEW_CANON.png
└── face/
    ├── manifest.json
    ├── FACE_PRIMARY_CONTACT.jpg
    ├── LULU_V4_FACE_RAW_FRONTAL_CLOSEUP_EYES_CLOSED.jpg
    ├── LULU_V4_FACE_RAW_LEFT_THREE_QUARTER_OPEN_EYES.jpg
    └── LULU_V4_FACE_FRONT_LOCK.png
```

Accepted Drop 2 garment-specific masters remain under `storage/garments/drop-02/<garment>/locked/`. They are continuity references for their garments, not universal real-person identity evidence.

**Sandbox is not archival storage.** It is a transient working cache. Before ending a production cycle, canonical private media must be copied to a durable private vault such as encrypted Drive/object storage or a private media repository. This public repository should retain only the logical ID, filename, byte size, SHA-256 checksum, provenance, role, privacy class, and storage status.

## Directory map

```text
docs/virtual-atelier/
├── README.md
├── OPERATING-CONTRACT.md
├── RUNBOOK.md
├── asset-manifest.schema.json
├── assets/
│   └── current.json
├── garments/
│   └── 004.md
└── state/
    └── current.json
```

## Production layers

```text
REAL LULU IDENTITY
        +
LULU BODY CANON
        +
ACCEPTED JUW TRANSLATION LINEAGE
        +
FIXED ATELIER + CANONICAL ICON
        +
CURRENT GARMENT AUTHORITY
        +
VIEW-SPECIFIC POSE GRAMMAR
        ↓
ONE CLEAN FULL IMAGE
```

Each layer has scoped authority. A new reference cannot overwrite unrelated layers.

## Idempotency

Every operation resolves to a canonical provider-neutral declaration:

```text
semantic_operation_hash = canonical AtelierOperation + resolved authority/parent hashes + workflow revision
execution_hash = semantic_operation_hash + adapter/provider/model + compiled prompt/reference packing + execution parameters
```

Running the same semantic declaration returns its locked result regardless of provider choice. Provider/model changes create a new execution attempt under the same semantic operation. If the authority revision, garment evidence, parent lock, immutable set or intended change changes, the semantic identity changes rather than silently mutating accepted work. See ADR 0046 and `scripts/virtual-atelier/operation-identity.mjs`.

## Current restart position

Garments 001, 002, and 003 remain accepted lineage. Garment 004 is `COMPLETE_LOCKED` and packeted: `004/05` is the front master, while `004/06` and `004/07` are accepted sibling views branching independently from `004/05`. There is no pending Garment 004 generation operation. The neutral V4 face-front candidate is now explicitly approved and locked as the public translation asset at `/lulu.png`. It may parent downstream V4 renders, while the verified real Lulu photographs remain the dominant identity truth.

## Human approval

Generated output remains `MODEL_REFERENCE` provenance. Human approval may promote it into an approved styled reference, but never rewrites its provenance into direct photography.
