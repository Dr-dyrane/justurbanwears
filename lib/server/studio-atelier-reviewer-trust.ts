/**
 * Deployment-owned trust anchor, configured separately from qualification
 * packets. This pins the canonical policy content, including reviewer IDs,
 * key fingerprints, validity windows and the authorized qualification suite.
 * A policy's own content hash provides integrity, never reviewer authority.
 */
export function resolveStudioAtelierReviewerTrustPolicySha256(): string | null {
  const configured = process.env.STUDIO_ATELIER_REVIEWER_TRUST_POLICY_SHA256;
  return configured && /^[a-f0-9]{64}$/.test(configured) ? configured : null;
}
