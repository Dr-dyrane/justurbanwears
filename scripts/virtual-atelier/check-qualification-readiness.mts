#!/usr/bin/env node

import { resolve } from "node:path";
import { inspectStudioAtelierQualificationEvidence } from "../../lib/server/studio-atelier-qualification-evidence";

const DEFAULT_PACKET_PATH =
  "storage/virtual-atelier/qualification/current/qualification-evidence.json";
const DEFAULT_REVIEWER_TRUST_POLICY_PATH =
  "storage/virtual-atelier/qualification-authority/authorized-human-reviewers.json";

function argumentValue(name: string): string | null {
  const inlinePrefix = `${name}=`;
  const inline = process.argv.slice(2).find((argument) => argument.startsWith(inlinePrefix));
  if (inline) return inline.slice(inlinePrefix.length);
  const index = process.argv.indexOf(name);
  if (index < 0) return null;
  const value = process.argv[index + 1];
  return value && !value.startsWith("--") ? value : null;
}
if (process.argv.includes("--help")) {
  process.stdout.write([
    "Read-only, zero-spend Atelier qualification evidence audit.",
    "",
    "Usage:",
    "  npx tsx scripts/virtual-atelier/check-qualification-readiness.mts [options]",
    "",
    "Options:",
    `  --packet <path>        Default: ${DEFAULT_PACKET_PATH}`,
    `  --trust-policy <path>  Default: ${DEFAULT_REVIEWER_TRUST_POLICY_PATH}`,
    "  --compact              Emit compact JSON.",
    "",
    "This command never calls a provider and never installs production qualification.",
    "",
  ].join("\n"));
} else {
  const packetPath = resolve(argumentValue("--packet") ?? DEFAULT_PACKET_PATH);
  const reviewerTrustPolicyPath = resolve(
    argumentValue("--trust-policy") ?? DEFAULT_REVIEWER_TRUST_POLICY_PATH,
  );
  const report = await inspectStudioAtelierQualificationEvidence({
    packetPath,
    reviewerTrustPolicyPath,
  });
  process.stdout.write(`${JSON.stringify(report, null, process.argv.includes("--compact") ? 0 : 2)}\n`);
  process.exitCode = report.status === "BLOCKED" ? 1 : 0;
}
