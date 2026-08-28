import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  STUDIO_ATELIER_ADULT_VERIFICATION_VERSION,
  STUDIO_ATELIER_CONSENT_AFFIRMATIONS,
  STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256,
  STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION,
  STUDIO_ATELIER_PROVIDER_NOTICE_SHA256,
  STUDIO_ATELIER_PROVIDER_NOTICE_VERSION,
  STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE,
  deriveStudioAtelierAdultVerificationRecordHash,
  deriveStudioAtelierConsentCommandFingerprint,
  deriveStudioAtelierConsentEventHash,
  studioAtelierConsentCommandSchema,
  type StudioAtelierAdultVerificationBody,
} from "../lib/server/studio-atelier-consent-repository";
import { sha256Text } from "../lib/studio/atelier/canonical";

const OPERATOR = "operator:atelier-consent";
const GRANT = "00000000-0000-4000-8000-000000001901";

function verification(
  overrides: Partial<StudioAtelierAdultVerificationBody> = {},
): StudioAtelierAdultVerificationBody {
  return {
    schemaVersion: STUDIO_ATELIER_ADULT_VERIFICATION_VERSION,
    operatorSubject: OPERATOR,
    subjectAuthorityId: "lulu-v4",
    authorityRevision: "LULU_V4_2026-08-25.7",
    authorityManifestSha256: "d245096f4582e6638bbc9ab1c9abe41df9aa447736372824cdc6803d651824bb",
    subjectAge: "VERIFIED_ADULT_18_PLUS",
    verificationMethod: "TRUSTED_IDENTITY_PROVIDER",
    evidenceReceiptId: "trusted-idp:lulu:2026-08-27",
    evidenceReceiptSha256: sha256Text("trusted adult evidence"),
    verifiedAt: "2026-08-27T12:00:00.000Z",
    expiresAt: null,
    recordedBySubject: "system:trusted-identity-adapter",
    ...overrides,
  };
}

test("consent copy and provider notice are exact versioned hash authorities", () => {
  assert.equal(STUDIO_ATELIER_CONSENT_AFFIRMATIONS.length, 3);
  assert.match(STUDIO_ATELIER_CONSENT_AFFIRMATIONS[0], /I am Lulu.*18 or older/);
  assert.match(STUDIO_ATELIER_CONSENT_AFFIRMATIONS[1], /fully clothed, non-sexual/);
  assert.match(STUDIO_ATELIER_CONSENT_AFFIRMATIONS[2], /not configured for zero data retention/);
  assert.equal(STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION, "juw.atelier-likeness-consent-affirmation.v1");
  assert.match(STUDIO_ATELIER_CONSENT_AFFIRMATION_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(STUDIO_ATELIER_PROVIDER_NOTICE_VERSION, "juw.atelier-provider-retention-notice.v1");
  assert.match(STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE, /does not claim a provider retention duration/);
  assert.equal(STUDIO_ATELIER_PROVIDER_NOTICE_SHA256, sha256Text(STUDIO_ATELIER_PROVIDER_RETENTION_NOTICE));
});

test("adult verification is independent, content addressed, and cannot be minted by affirmation", () => {
  const trusted = verification();
  const trustedHash = deriveStudioAtelierAdultVerificationRecordHash(trusted);
  assert.match(trustedHash, /^[a-f0-9]{64}$/);
  assert.equal(deriveStudioAtelierAdultVerificationRecordHash({ ...trusted }), trustedHash);
  assert.notEqual(
    deriveStudioAtelierAdultVerificationRecordHash(verification({
      evidenceReceiptSha256: sha256Text("different evidence"),
    })),
    trustedHash,
  );
  assert.throws(() => deriveStudioAtelierAdultVerificationRecordHash({
    ...trusted,
    subjectAge: "SELF_ATTESTED_ADULT" as "VERIFIED_ADULT_18_PLUS",
  }));
});

test("grant and revoke commands are strict, CAS-bound, and fingerprint idempotently", () => {
  const grant = studioAtelierConsentCommandSchema.parse({
    action: "GRANT",
    expectedRevision: 0,
    idempotencyKey: "atelier-consent:grant:one",
    affirmationVersion: STUDIO_ATELIER_CONSENT_AFFIRMATION_VERSION,
    adultSelfAttested: true,
    likenessUseAuthorized: true,
    providerRetentionAcknowledged: true,
  });
  const fingerprint = deriveStudioAtelierConsentCommandFingerprint(grant);
  assert.equal(deriveStudioAtelierConsentCommandFingerprint({ ...grant }), fingerprint);
  assert.notEqual(
    deriveStudioAtelierConsentCommandFingerprint({ ...grant, expectedRevision: 1 }),
    fingerprint,
  );
  assert.equal(studioAtelierConsentCommandSchema.safeParse({
    ...grant,
    providerRetentionAcknowledged: false,
  }).success, false);
  assert.equal(studioAtelierConsentCommandSchema.safeParse({
    ...grant,
    adultVerificationReceipt: "browser-forged",
  }).success, false);
});

test("consent event hashes bind sequence, grant, previous event, actor, and payload", () => {
  const base = {
    operatorSubject: OPERATOR,
    sequence: 1,
    eventType: "GRANTED" as const,
    grantId: GRANT,
    actorSubject: OPERATOR,
    payload: { grantSha256: sha256Text("grant") },
    previousEventHash: null,
    createdAt: "2026-08-27T12:05:00.000Z",
  };
  const eventHash = deriveStudioAtelierConsentEventHash(base);
  assert.match(eventHash, /^[a-f0-9]{64}$/);
  assert.notEqual(
    deriveStudioAtelierConsentEventHash({ ...base, sequence: 2, previousEventHash: eventHash }),
    eventHash,
  );
  assert.notEqual(
    deriveStudioAtelierConsentEventHash({ ...base, payload: { grantSha256: sha256Text("other") } }),
    eventHash,
  );
});

test("the public consent route cannot submit verification evidence and mutations are same-origin", () => {
  const route = readFileSync(
    new URL("../app/api/studio/settings/atelier-consent/route.ts", import.meta.url),
    "utf8",
  );
  assert.match(route, /assertStudioAtelierMutationOrigin\(request\)/);
  assert.match(route, /requireStudioOperator\(\)/);
  assert.match(route, /studioAtelierConsentCommandSchema/);
  assert.doesNotMatch(route, /recordStudioAtelierAdultVerificationEvidence|evidenceReceiptSha256|VERIFIED_ADULT_18_PLUS/);
});

test("the repository uses one operator-scoped CAS projection and append-only event chain", () => {
  const repository = readFileSync(
    new URL("../lib/server/studio-atelier-consent-repository.ts", import.meta.url),
    "utf8",
  );
  assert.match(repository, /pg_advisory_xact_lock/);
  assert.match(repository, /projection\.revision = \$\{command\.expectedRevision\}/);
  assert.match(repository, /projection\.last_event_hash = \$\{previousEventHash\}/);
  assert.match(repository, /insert into studio_atelier_consent_events/);
  assert.match(repository, /verification\.revoked_at is null/);
  assert.match(repository, /verification\.expires_at is null or verification\.expires_at > now\(\)/);
  assert.match(repository, /export const resolveStudioAtelierProviderRetentionConsent/);
  assert.match(repository, /receiptId = `atelier-consent:\$\{authority\.grantSha256\}:\$\{parsed\.data\.operationId\}`/);
  assert.match(repository, /export const resolveStudioAtelierAdultLikenessAuthority/);
  assert.match(repository, /event\.event_hash = projection\.last_event_hash/);
  assert.doesNotMatch(repository, /status:\s*"PRODUCTION_READY"|productionReady:\s*true/);
});

test("Settings keeps one quiet durable row and preserves the private Lulu avatar boundary", () => {
  const settings = readFileSync(
    new URL("../components/studio/settings/studio-settings-center.tsx", import.meta.url),
    "utf8",
  );
  assert.equal(settings.match(/<strong>Atelier authorization<\/strong>/g)?.length, 1);
  assert.match(settings, /ATELIER_CONSENT_ENDPOINT/);
  assert.match(settings, /consentCommandKeyRef/);
  assert.match(settings, /stable key is deliberately retained/);
  assert.match(settings, /Trusted verification is still required/);
  assert.match(settings, /Revoke future use/);
  assert.match(settings, /const LULU_PROFILE_AVATAR_SRC = "\/api\/studio\/profile\/avatar"/);
  assert.match(settings, /onError=\{\(event\) => \{ event\.currentTarget\.hidden = true; \}\}/);
  assert.doesNotMatch(settings, /blob\.vercel-storage\.com|studio\/model-authorities/);
});
