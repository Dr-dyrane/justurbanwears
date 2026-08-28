# Local provider access

This is the canonical bootstrap for restoring authenticated local access to the
JustUrbanWears Vercel project, Neon database and Vercel Blob stores. Read it
before declaring a release blocked or searching an earlier task for secrets.

This guide restores access only. It does not grant authority to write the
database, upload media, publish, deploy, mint a persistent credential or change
a provider configuration. Those actions still require their normal release or
operation authority.

## Secret boundary

- Use the provider's authenticated CLI, connector, SSO or dashboard. Never copy
  a credential from a predecessor chat, task transcript, shell history or old
  temporary file.
- Never print a connection string, token, password, login/device code or
  provider profile. Do not use `set -x`, a PTY that can echo input, or a command
  argument such as `--token <secret>`.
- Store a fetched value only in an ignored local environment file or, for a
  release, a unique mode-`0600` file below `/private/tmp`. A tracked document may
  contain variable names and non-secret routing IDs only.
- An empty value or the literal `[SENSITIVE]` is a redacted placeholder, not a
  credential and not evidence that the provider is unavailable.
- Provider authentication is not operation authority. Check the applicable
  garment, catalogue, database and release gates before any write.

## Canonical routing guards

These identifiers are safe routing guards, not credentials. Verify them before
fetching or using any secret:

| Resource | Required identity |
| --- | --- |
| Vercel project | `justurbanwears` / `prj_2AUmc8egcqHgq0u5ID9fjuVza1vI` |
| Vercel team | `team_70YXvaKwtM0RJFRGtXT3hI5R` |
| Neon project | `justurbanwears-db` / `calm-glade-28091571` |
| Neon production branch | `main` / `br-mute-paper-awfdn96n` |
| Neon database | `neondb` |
| Neon release-admin role | `neondb_owner` |
| Public Shop Blob store | `3ZAHCGTjZNZCXGSl` / `public` |
| Private Studio Blob store | `55JZcnWtS768AS7Q` / `private` |

Do not record a Neon endpoint hostname as a durable identifier. Neon computes
can rotate; obtain a fresh direct connection and validate its resource identity
for each release.

## Failure-safe temporary files

Install one exact-path cleanup trap in the working shell before creating any
secret-bearing temporary file. It deliberately refuses recursive deletion:

```bash
juw_cleanup_local_access() {
  if [ -n "${JUW_DB_ENV_FILE:-}" ] && [ -f "$JUW_DB_ENV_FILE" ]; then
    unlink -- "$JUW_DB_ENV_FILE"
  fi
  if [ -n "${JUW_RELEASE_ENV_FILE:-}" ] && [ -f "$JUW_RELEASE_ENV_FILE" ]; then
    unlink -- "$JUW_RELEASE_ENV_FILE"
  fi
  if [ -n "${JUW_DB_ENV_DIR:-}" ] && [ -d "$JUW_DB_ENV_DIR" ]; then
    rmdir -- "$JUW_DB_ENV_DIR" 2>/dev/null || true
  fi
  if [ -n "${JUW_RELEASE_ENV_DIR:-}" ] && [ -d "$JUW_RELEASE_ENV_DIR" ]; then
    rmdir -- "$JUW_RELEASE_ENV_DIR" 2>/dev/null || true
  fi
  unset JUW_DB_ENV_FILE JUW_DB_ENV_DIR JUW_RELEASE_ENV_FILE JUW_RELEASE_ENV_DIR
}
trap juw_cleanup_local_access EXIT HUP INT TERM
```

Leave the trap installed until validation finishes. If a fetch or check fails,
call `juw_cleanup_local_access` before continuing or leaving the shell.

## Vercel login, link and environment

1. Check the existing CLI session:

   ```bash
   npx vercel whoami
   ```

   If it is unauthenticated, the human operator runs `npx vercel login` and
   completes the provider flow. A login/device code is short-lived secret
   material: use it only in the provider page and never paste it into a task,
   tracked file or durable log.

2. If `.vercel/project.json` already exists, do not relink. Read only
   `projectName`, `projectId` and `orgId`, and require the three Vercel guards in
   the table above. Stop on any mismatch. If the link is absent, link only the
   exact canonical project, then verify those fields:

   ```bash
   npx vercel link --yes \
     --team team_70YXvaKwtM0RJFRGtXT3hI5R \
     --project prj_2AUmc8egcqHgq0u5ID9fjuVza1vI
   ```

   Do not accept an adjacent or newly created project.

3. For normal local development, fetch the linked project's development values
   into the ignored local file, then let the environment checker report missing
   names without printing values:

   ```bash
   umask 077
   npx vercel env pull .env.local --environment=development --yes
   chmod 600 .env.local
   npm run env:check:studio
   ```

   When Vercel Secure Backend Access is enabled, this pull also writes a newly
   issued short-lived `VERCEL_OIDC_TOKEN`. It is local session material, not a
   value to add to `.env.example` or copy elsewhere. Rerun the development pull
   when it expires or authentication fails. See Vercel's
   [OIDC local-development guidance](https://vercel.com/docs/oidc#in-local-development).

4. For a release, fetch Vercel-managed production values into a unique file
   outside the repository:

   ```bash
   umask 077
   JUW_RELEASE_ENV_DIR=$(mktemp -d /private/tmp/juw-vercel-release.XXXXXX)
   JUW_RELEASE_ENV_FILE="$JUW_RELEASE_ENV_DIR/production.env"
   if ! npx vercel env pull "$JUW_RELEASE_ENV_FILE" \
     --environment=production \
     --yes; then
     juw_cleanup_local_access
     false
   fi
   chmod 600 "$JUW_RELEASE_ENV_FILE"
   ```

5. Validate required key names and whether their values are non-empty and not
   `[SENSITIVE]` without printing the values. A redacted provider-managed value
   must be resolved through that provider's authenticated integration or
   dashboard; do not replace it with a remembered value.

`.env.example` is the tracked schema of supported names, not a credential
source. `.env.local` and `.env.production.local` are ignored developer files;
keep them mode `0600`, populate only the values needed for the current local
workflow, and do not treat them as durable production-release evidence.

## Neon login and a fresh direct database connection

Use the authenticated Neon connector first. Search for `justurbanwears-db`,
then require the exact project, branch and database guards above before asking
for a connection. If connector search succeeds but describe or connection
retrieval fails specifically because of a connector parameter-schema or
transport defect, use the existing authenticated Neon CLI session as the
bounded fallback.

On a fresh machine, the human operator first authenticates Neon through its
browser flow and OS keyring. Treat any displayed login/device code exactly like
the Vercel code: use it only with Neon and never paste it into a task or file.
`neonctl` is an alias, but the current package name is `neon`:

```bash
npx --yes neon@latest auth --keyring
```

Then verify the CLI identity and resource routing before requesting a
connection:

```bash
npx --yes neon@latest orgs list --output json --no-color
npx --yes neon@latest projects list \
  --org-id <authenticated-org-id> \
  --output json \
  --no-color
npx --yes neon@latest branches list \
  --project-id calm-glade-28091571 \
  --output json \
  --no-color
```

The authenticated organization ID comes from the first command and is routing
metadata; select the organization containing the exact canonical project. Stop
if the exact production project and branch are absent or not ready.

Capture a fresh direct admin connection without allowing it to reach terminal
output or shell history:

```bash
umask 077
JUW_DB_ENV_DIR=$(mktemp -d /private/tmp/juw-shop-release.XXXXXX)
JUW_DB_ENV_FILE="$JUW_DB_ENV_DIR/production.env"
if ! {
  printf 'DATABASE_URL_UNPOOLED=' &&
  npx --yes neon@latest connection-string br-mute-paper-awfdn96n \
    --project-id calm-glade-28091571 \
    --role-name neondb_owner \
    --database-name neondb \
    --endpoint-type read_write \
    --ssl require \
    --no-color
} > "$JUW_DB_ENV_FILE"; then
  juw_cleanup_local_access
  false
fi
chmod 600 "$JUW_DB_ENV_FILE"
```

Parse the URL locally and emit only its hostname and decoded database name.
Require database `neondb` and reject a hostname containing `-pooler` or
`.pooler.`. The exact database target guards and release commands remain in
[`docs/data/SHOP_DATABASE.md`](../data/SHOP_DATABASE.md).

Do not use a connection recovered from an old task, an old release file or a
Vercel `[SENSITIVE]` placeholder. If both connector and CLI sessions lack the
canonical project, use the existing Vercel Marketplace integration's
authenticated SSO/Connect flow. Never substitute another visible Neon project.

## Public and private Blob access

The two stores have separate credentials and authority boundaries:

| Variable | Permitted use |
| --- | --- |
| `PUBLIC_BLOB_READ_WRITE_TOKEN` | Approved public Shop media, including `npm run blob:sync:shop` |
| `PRIVATE_BLOB_READ_WRITE_TOKEN` | Authorized private Studio/model authority, including `npm run blob:sync:lulu-v4-authority` |

Fetch each token from the linked Vercel project's production environment or
the exact Blob store's authenticated Connect/environment view. Never substitute
one store's token for the other, mint a second store to work around missing
access, or use a token as authority to upload. Validate presence and
non-placeholder status without printing the value. Then perform a non-mutating
`list({limit: 1})` and compare the returned URL host to the exact store ID and
access mode in the routing table. This must precede any sync, because
`blob:sync:shop` uploads missing objects and is not an identity probe.

For either store, set the three non-secret selectors and run:

```bash
JUW_BLOB_TOKEN_KEY=PUBLIC_BLOB_READ_WRITE_TOKEN \
JUW_BLOB_EXPECTED_STORE=3ZAHCGTjZNZCXGSl \
JUW_BLOB_EXPECTED_ACCESS=public \
node --env-file="$JUW_RELEASE_ENV_FILE" --input-type=module <<'NODE'
import { list } from '@vercel/blob';

const key = process.env.JUW_BLOB_TOKEN_KEY;
const expectedStore = process.env.JUW_BLOB_EXPECTED_STORE;
const expectedAccess = process.env.JUW_BLOB_EXPECTED_ACCESS;
const token = process.env[key]?.trim();
if (!token || token === '[SENSITIVE]') throw new Error(`${key} is unavailable`);

const result = await list({ token, limit: 1 });
if (result.blobs.length === 0) {
  throw new Error('Store is empty; verify its ID and access in Vercel before use');
}
const host = new URL(result.blobs[0].url).hostname;
const [storeId, access] = host.split('.');
if (storeId.toLowerCase() !== expectedStore.toLowerCase() || access !== expectedAccess) {
  throw new Error('Blob token resolved to the wrong store or access mode');
}
console.log(JSON.stringify({ storeId, access, readOnlyList: 'PASS' }));
NODE
```

Repeat with `PRIVATE_BLOB_READ_WRITE_TOKEN`, store
`55JZcnWtS768AS7Q` and access `private`. If a store is empty, verify its exact
non-secret store ID and access mode in Vercel's authenticated store page; do not
upload a probe object. Vercel documents Blob `list` as a read operation in the
[Blob SDK guide](https://vercel.com/docs/vercel-blob/using-blob-sdk#list-blobs).
A successful later sync still requires its expected hashes, counts, readback
and host manifest.

After the separate upload authority is confirmed, a temporary Vercel env file
can be passed directly to Node without sourcing it into the shell:

```bash
node --env-file="$JUW_RELEASE_ENV_FILE" \
  scripts/shop-media/blob-sync.mjs --summary
node --env-file="$JUW_RELEASE_ENV_FILE" \
  scripts/studio-models/sync-lulu-v4-authority.mjs
```

Run only the command covered by the current authority; these examples are not
permission to sync both stores.

## Login codes and token minting

Interactive login/SSO and existing scoped provider sessions are the default.
Do not mint a persistent Vercel, Neon, Blob, OAuth, personal or CI token merely
to avoid interactive login.

If unattended automation genuinely requires a new credential, stop and obtain
explicit user authority for that creation. Then:

1. use the narrowest resource and permission scope;
2. give it one purpose label, owner and expiry;
3. place the secret directly into the provider's encrypted environment or CI
   store rather than chat, Git or a shell argument;
4. record only the non-secret credential ID, owner, purpose, creation time,
   expiry and revocation location; and
5. revoke or rotate it when the bounded use ends.

Short-lived login/device codes follow the same no-copy boundary even though
they expire. A task may ask the human to finish the provider login, but must not
request that the code or resulting token be pasted back into conversation.

`VERCEL_OIDC_TOKEN` is the expected exception to manual token minting: when
Secure Backend Access is configured, the development `vercel env pull` issues
it automatically for local use. Keep it in the ignored mode-`0600`
`.env.local`, let it expire, and refresh it with a new authenticated development
pull. Do not promote it to a permanent provider token or pass it as a command
argument.

## Validation and cleanup

Before use, require the exact provider identity, only the required variable
names, non-placeholder values, and file mode `0600`. Before a production
database write, also require a clean committed checkout and every guard in
[`docs/data/SHOP_DATABASE.md`](../data/SHOP_DATABASE.md).

Delete only the exact temporary files created for the operation, then clear the
trap after successful cleanup:

```bash
juw_cleanup_local_access
trap - EXIT HUP INT TERM
```

| Failure | Required response |
| --- | --- |
| Project, team, branch or database mismatch | Stop; do not relink or substitute a nearby resource. |
| Empty or `[SENSITIVE]` value | Resolve through the authenticated provider path. |
| Neon connector schema/transport fault | Use the authenticated Neon CLI fallback after exact search. |
| Multiple Neon roles | Select explicit release role `neondb_owner`; never guess. |
| Pooled database URL | Reject it for administrative/release commands. |
| Provider `401` or `403` | Refresh the interactive session or short-lived OIDC pull; do not mint a broad token by default. |
| Missing or wrong Blob token | Stop the media operation; never cross-use stores. |
| Temporary/local environment file is not mode `0600` | Correct permissions before reading it. |
| Dirty or uncommitted release checkout | Do not apply a production database release. |
