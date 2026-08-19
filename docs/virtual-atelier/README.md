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

Every operation must resolve to a stable declaration:

```text
operation_id = garment + view + parent hashes + authority revision + change set
```

Running the same operation declaration should target the same production state. If the authority revision, garment evidence, or change set changes, create a new operation ID rather than silently mutating the old one.

## Current restart position

Garments 001, 002, and 003 remain accepted lineage. Garment 004 is intentionally reset to `READY_FOR_05`; none of the prior 004 candidates is an accepted parent. The next valid operation is a single clean `004/05 FRONT MASTER` generated from the documented authority stack.

## Human approval

Generated output remains `MODEL_REFERENCE` provenance. Human approval may promote it into an approved styled reference, but never rewrites its provenance into direct photography.
