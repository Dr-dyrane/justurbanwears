#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import process from "node:process";

export const REQUIRED_RENDER_QUALITY_FIELDS = Object.freeze([
  "photographicRealism",
  "skinTexture",
  "garmentTexture",
  "lightingIntegration",
  "opticsPerspective",
]);

const SIBLING_CORE = Object.freeze({
  "06": Object.freeze({
    bodyAssetId: "lulu.body.canon.v4.side",
    forbiddenView: "07",
  }),
  "07": Object.freeze({
    bodyAssetId: "lulu.body.canon.v4.back",
    forbiddenView: "06",
  }),
});

const FASHION_NOVA_DECISIONS = new Set(["KEEP", "REFINE", "REPLACE", "NO_CLOSE_MATCH"]);

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function nonEmptyString(value) {
  return typeof value === "string" && value.trim().length > 0;
}

function normalizeView(view) {
  return String(view ?? "").padStart(2, "0");
}

function isRealIsoDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value ?? ""))) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function validateFashionNovaUrl(value, field, errors) {
  if (!nonEmptyString(value)) {
    errors.push(`${field} is required`);
    return;
  }

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();
    if (url.protocol !== "https:") {
      errors.push(`${field} must use HTTPS`);
    }
    if (hostname !== "fashionnova.com" && !hostname.endsWith(".fashionnova.com")) {
      errors.push(`${field} must use an official fashionnova.com host`);
    }
    if (!/^\/(products|collections)\/[^/]+/.test(url.pathname)) {
      errors.push(`${field} must resolve to an official Fashion Nova product or collection styling page`);
    }
  } catch {
    errors.push(`${field} must be a valid URL`);
  }
}

function collectStrings(value, output = []) {
  if (typeof value === "string") {
    output.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectStrings(item, output);
  } else if (value && typeof value === "object") {
    for (const item of Object.values(value)) collectStrings(item, output);
  }
  return output;
}

function validateRenderQualityContract(operation, errors) {
  const view = normalizeView(operation.view);
  if (!["05", "06", "07"].includes(view)) return;

  const contract = operation.renderQualityContract;
  if (!contract || typeof contract !== "object" || Array.isArray(contract)) {
    errors.push("renderQualityContract is required for model views 05, 06 and 07");
    return;
  }

  for (const field of REQUIRED_RENDER_QUALITY_FIELDS) {
    if (!nonEmptyString(contract[field])) {
      errors.push(`renderQualityContract.${field} must be a non-empty string`);
    }
  }

  if (!Array.isArray(contract.artifactRejection) || contract.artifactRejection.length === 0) {
    errors.push("renderQualityContract.artifactRejection must contain at least one rejection condition");
  } else if (contract.artifactRejection.some((item) => !nonEmptyString(item))) {
    errors.push("renderQualityContract.artifactRejection may contain only non-empty strings");
  }
}

function validateRenderQualityReview(operation, errors) {
  const view = normalizeView(operation.view);
  const reviewedStatus = /GATE_PASS|ACCEPTED|LOCKED/.test(String(operation.status ?? ""));
  if (!["05", "06", "07"].includes(view) || !reviewedStatus) return;

  const review = operation.renderQualityReview;
  if (!review || typeof review !== "object" || Array.isArray(review)) {
    errors.push("renderQualityReview is required before a model operation may claim GATE_PASS, ACCEPTED or LOCKED");
    return;
  }

  for (const field of [...REQUIRED_RENDER_QUALITY_FIELDS, "artifactRejection"]) {
    if (review[field] !== "PASS") {
      errors.push(`renderQualityReview.${field} must equal PASS before the operation may claim ${operation.status}`);
    }
  }

  if (!nonEmptyString(review.reviewedAt)) {
    errors.push(`renderQualityReview.reviewedAt is required before the operation may claim ${operation.status}`);
  }

  if (!nonEmptyString(operation.output?.path)) {
    errors.push(`output.path is required before the operation may claim ${operation.status}`);
  }
  if (!nonEmptyString(operation.output?.sha256)) {
    errors.push(`output.sha256 is required before the operation may claim ${operation.status}`);
  }
}

function validateFashionNovaCheck(operation, errors) {
  if (normalizeView(operation.view) !== "05") return;

  const check = operation.fashionNovaCheck ?? operation.fashion_nova_check;
  if (!check || typeof check !== "object" || Array.isArray(check)) {
    errors.push("fashionNovaCheck is required before every 05 operation");
    return;
  }

  if (!nonEmptyString(check.operationId)) {
    errors.push("fashionNovaCheck.operationId is required");
  }
  if (check.publisher !== "Fashion Nova") {
    errors.push("fashionNovaCheck.publisher must equal Fashion Nova");
  }

  validateFashionNovaUrl(check.officialUrl, "fashionNovaCheck.officialUrl", errors);
  validateFashionNovaUrl(check.resolvedOfficialUrl, "fashionNovaCheck.resolvedOfficialUrl", errors);
  if (!nonEmptyString(check.pageTitle)) {
    errors.push("fashionNovaCheck.pageTitle is required as live-check evidence");
  }
  if (!isRealIsoDate(check.accessedOn)) {
    errors.push("fashionNovaCheck.accessedOn must be a real calendar date in YYYY-MM-DD format");
  }
  if (!Array.isArray(check.matchedGarmentFacts)) {
    errors.push("fashionNovaCheck.matchedGarmentFacts must be an array");
  } else if (check.matchedGarmentFacts.some((fact) => !nonEmptyString(fact))) {
    errors.push("fashionNovaCheck.matchedGarmentFacts may contain only non-empty strings");
  } else if (check.decision !== "NO_CLOSE_MATCH" && check.matchedGarmentFacts.length === 0) {
    errors.push("fashionNovaCheck.matchedGarmentFacts must contain at least one evidence-backed match");
  }
  if (!FASHION_NOVA_DECISIONS.has(check.decision)) {
    errors.push("fashionNovaCheck.decision must equal KEEP, REFINE, REPLACE or NO_CLOSE_MATCH");
  }
  if (check.decision === "NO_CLOSE_MATCH" && !nonEmptyString(check.noCloseMatchReason)) {
    errors.push("fashionNovaCheck.noCloseMatchReason is required for NO_CLOSE_MATCH");
  }
  if (!nonEmptyString(check.selectedStylingDirection)) {
    errors.push("fashionNovaCheck.selectedStylingDirection is required");
  }
  if (check.authority !== "ADVISORY_STYLING_ONLY") {
    errors.push("fashionNovaCheck.authority must equal ADVISORY_STYLING_ONLY");
  }
  if (check.passedAsImageReference !== false) {
    errors.push("fashionNovaCheck.passedAsImageReference must be false");
  }

  const referenceStack = operation.referenceStack ?? operation.reference_stack ?? [];
  const authorityStack = operation.authorityStack ?? operation.authority_stack ?? {};
  const leakedAuthority = [...collectStrings(referenceStack), ...collectStrings(authorityStack)].filter((value) =>
    /fashion\s*nova|fashionnova/i.test(value),
  );
  if (leakedAuthority.length > 0) {
    errors.push("Fashion Nova page or image evidence may not appear in referenceStack or authorityStack");
  }
}

function validateSiblingCore(operation, errors) {
  const view = normalizeView(operation.view);
  const core = SIBLING_CORE[view];
  if (!core) return;

  const garmentId = String(operation.garmentId ?? operation.garment_id ?? "").padStart(3, "0");
  const accepted05 = `garment.${garmentId}.view.05.accepted`;
  const parentAssets = operation.parentAssets ?? operation.parent_assets ?? [];
  const referenceStack = operation.referenceStack ?? operation.reference_stack ?? [];
  const referenceIds = referenceStack.map((reference) => reference.assetId ?? reference.asset_id);
  const authorityStack = operation.authorityStack ?? operation.authority_stack ?? {};
  const authorityIds = collectStrings(authorityStack);

  if (parentAssets.length !== 1 || parentAssets[0] !== accepted05) {
    errors.push(`${view} must have exactly one parent asset: ${accepted05}`);
  }

  const requiredCore = [
    accepted05,
    "lulu.face.operation-board.full.v1",
    core.bodyAssetId,
    "lulu.body.real.angle-contact.v4",
    "juw.atelier.empty-plate.v1",
  ];

  for (const requiredId of requiredCore) {
    if (!referenceIds.includes(requiredId)) {
      errors.push(`${view} must include ${requiredId} in referenceStack`);
    }
  }

  const siblingToken = `.view.${core.forbiddenView}.`;
  const forbiddenLineage = [...parentAssets, ...referenceIds, ...authorityIds].filter((id) =>
    String(id).includes(siblingToken),
  );
  if (forbiddenLineage.length > 0) {
    errors.push(`${view} may not use sibling view ${core.forbiddenView}: ${forbiddenLineage.join(", ")}`);
  }
}

function validatePrompt(operation, errors) {
  if (!Array.isArray(operation.promptVerbatimLines) || operation.promptVerbatimLines.length === 0) {
    errors.push("promptVerbatimLines must preserve the exact submitted prompt");
    return;
  }

  if (!nonEmptyString(operation.promptSha256)) {
    errors.push("promptSha256 is required");
    return;
  }

  const actual = sha256(operation.promptVerbatimLines.join("\n"));
  if (actual !== operation.promptSha256) {
    errors.push(`promptSha256 mismatch expected=${operation.promptSha256} actual=${actual}`);
  }
}

function validateFiles(operation, operationPath, errors) {
  if (!operationPath) return;
  const base = dirname(resolve(operationPath));
  const referenceStack = operation.referenceStack ?? operation.reference_stack ?? [];

  for (const reference of referenceStack) {
    const assetId = reference.assetId ?? reference.asset_id ?? "unknown-reference";
    if (!nonEmptyString(reference.path)) {
      errors.push(`${assetId} is missing a reference path`);
      continue;
    }
    const filePath = resolve(base, reference.path);
    if (!existsSync(filePath)) {
      errors.push(`${assetId} reference is missing: ${filePath}`);
      continue;
    }
    if (!nonEmptyString(reference.sha256)) {
      errors.push(`${assetId} is missing sha256`);
      continue;
    }
    const actual = sha256(readFileSync(filePath));
    if (actual !== reference.sha256) {
      errors.push(`${assetId} sha256 mismatch expected=${reference.sha256} actual=${actual}`);
    }
  }

  if (operation.output?.path && nonEmptyString(operation.output.sha256)) {
    const outputPath = resolve(base, operation.output.path);
    if (!existsSync(outputPath)) {
      errors.push(`output is missing: ${outputPath}`);
    } else if (nonEmptyString(operation.output.sha256)) {
      const actual = sha256(readFileSync(outputPath));
      if (actual !== operation.output.sha256) {
        errors.push(`output sha256 mismatch expected=${operation.output.sha256} actual=${actual}`);
      }
    }
  }
}

export function validateOperationRecord(operation, options = {}) {
  const errors = [];

  if (!operation || typeof operation !== "object" || Array.isArray(operation)) {
    return { pass: false, errors: ["operation record must be an object"] };
  }

  for (const field of ["operationId", "garmentId", "view", "operationType", "status"]) {
    if (!nonEmptyString(operation[field])) errors.push(`${field} is required`);
  }

  if (!Array.isArray(operation.changeSet) || operation.changeSet.length === 0) {
    errors.push("changeSet must contain at least one declared change");
  }
  if (!Array.isArray(operation.immutableSet) || operation.immutableSet.length === 0) {
    errors.push("immutableSet must contain at least one locked layer");
  }
  if (!Array.isArray(operation.outputContract) || operation.outputContract.length === 0) {
    errors.push("outputContract must contain at least one condition");
  }
  if (!Array.isArray(operation.failureGates) || operation.failureGates.length === 0) {
    errors.push("failureGates must contain at least one rejection condition");
  }

  validateSiblingCore(operation, errors);
  validateFashionNovaCheck(operation, errors);
  validateRenderQualityContract(operation, errors);
  validateRenderQualityReview(operation, errors);
  validatePrompt(operation, errors);
  if (options.verifyFiles !== false) validateFiles(operation, options.operationPath, errors);

  return {
    pass: errors.length === 0,
    operationId: operation.operationId ?? null,
    view: normalizeView(operation.view),
    errors,
  };
}

function parseArgs(argv) {
  const options = { operationPath: null, json: false, verifyFiles: true };
  for (const arg of argv) {
    if (arg === "--json") options.json = true;
    else if (arg === "--no-file-check") options.verifyFiles = false;
    else if (arg === "--help" || arg === "-h") {
      console.log("Usage: node scripts/virtual-atelier/validate-operation.mjs <operation.json> [--json] [--no-file-check]");
      process.exit(0);
    } else if (!options.operationPath) options.operationPath = arg;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.operationPath) throw new Error("An operation JSON path is required.");
  return options;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const operationPath = resolve(options.operationPath);
  const operation = JSON.parse(readFileSync(operationPath, "utf8"));
  const result = validateOperationRecord(operation, { operationPath, verifyFiles: options.verifyFiles });

  if (options.json) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(`JUW Virtual Atelier operation preflight: ${result.operationId || "unknown"}`);
    console.log(`${result.pass ? "PASS" : "FAIL"} view ${result.view || "unknown"}`);
    for (const error of result.errors) console.log(`- ${error}`);
  }
  process.exitCode = result.pass ? 0 : 1;
}

const isCli = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isCli) main();
