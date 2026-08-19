#!/usr/bin/env node

import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";

function parseArgs(argv) {
  const options = {
    root: process.env.JUW_ATELIER_MEDIA_ROOT || "storage/virtual-atelier",
    manifest: "docs/virtual-atelier/assets/current.json",
    state: "docs/virtual-atelier/state/current.json",
    json: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--root") options.root = argv[++index];
    else if (arg === "--manifest") options.manifest = argv[++index];
    else if (arg === "--state") options.state = argv[++index];
    else if (arg === "--json") options.json = true;
    else if (arg === "--help" || arg === "-h") {
      console.log(`Usage: node scripts/virtual-atelier/verify-assets.mjs [options]\n\nOptions:\n  --root <path>      Private media root (default: JUW_ATELIER_MEDIA_ROOT or storage/virtual-atelier)\n  --manifest <path>  Asset manifest path\n  --state <path>     Current production state path\n  --json             Emit machine-readable JSON\n`);
      process.exit(0);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function sha256File(filePath) {
  return new Promise((resolveHash, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolveHash(hash.digest("hex")));
  });
}

function gitBlobSha(filePath) {
  const content = readFileSync(filePath);
  const header = Buffer.from(`blob ${content.length}\0`);
  return createHash("sha1").update(header).update(content).digest("hex");
}

function collectAuthorityIds(state) {
  const next = state?.nextOperation;
  if (!next) return [];

  const ids = new Set(next.parentAssets || []);
  for (const values of Object.values(next.authorityStack || {})) {
    for (const id of values || []) ids.add(id);
  }
  return [...ids];
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = process.cwd();
  const mediaRoot = resolve(repoRoot, options.root);
  const manifestPath = resolve(repoRoot, options.manifest);
  const statePath = resolve(repoRoot, options.state);

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const state = JSON.parse(readFileSync(statePath, "utf8"));
  const requiredByOperation = new Set(collectAuthorityIds(state));
  const assetsById = new Map(manifest.assets.map((asset) => [asset.id, asset]));
  const results = [];

  for (const asset of manifest.assets) {
    const required = asset.required !== false || requiredByOperation.has(asset.id);
    let filePath = null;
    let source = "media";

    if (asset.repoPath) {
      filePath = resolve(repoRoot, asset.repoPath);
      source = "repo";
    } else {
      const candidates = [asset.filename, ...(asset.aliases || [])];
      filePath = candidates.map((name) => resolve(mediaRoot, name)).find((candidate) => existsSync(candidate)) || resolve(mediaRoot, asset.filename);
    }

    const result = {
      id: asset.id,
      required,
      source,
      path: filePath,
      status: "PASS",
      errors: [],
    };

    if (!existsSync(filePath)) {
      result.status = required ? "FAIL" : "SKIP";
      result.errors.push("missing");
      results.push(result);
      continue;
    }

    const stats = statSync(filePath);
    result.bytes = stats.size;

    if (asset.bytes !== null && asset.bytes !== undefined && stats.size !== asset.bytes) {
      result.status = "FAIL";
      result.errors.push(`bytes expected=${asset.bytes} actual=${stats.size}`);
    }

    if (asset.sha256) {
      result.sha256 = await sha256File(filePath);
      if (result.sha256 !== asset.sha256) {
        result.status = "FAIL";
        result.errors.push(`sha256 expected=${asset.sha256} actual=${result.sha256}`);
      }
    }

    if (asset.gitBlobSha) {
      result.gitBlobSha = gitBlobSha(filePath);
      if (result.gitBlobSha !== asset.gitBlobSha) {
        result.status = "FAIL";
        result.errors.push(`gitBlobSha expected=${asset.gitBlobSha} actual=${result.gitBlobSha}`);
      }
    }

    results.push(result);
  }

  for (const id of requiredByOperation) {
    if (!assetsById.has(id)) {
      results.push({
        id,
        required: true,
        source: "manifest",
        path: null,
        status: "FAIL",
        errors: ["referenced by current operation but absent from asset manifest"],
      });
    }
  }

  const failures = results.filter((result) => result.status === "FAIL");
  const summary = {
    mediaRoot,
    manifest: options.manifest,
    state: options.state,
    activeOperation: state?.nextOperation?.operationId || null,
    pass: failures.length === 0,
    results,
  };

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log("JUW Virtual Atelier preflight");
    console.log(`operation: ${summary.activeOperation || "none"}`);
    console.log(`media root: ${mediaRoot}\n`);
    for (const result of results) {
      const detail = result.errors.length ? ` — ${result.errors.join("; ")}` : "";
      console.log(`${result.status.padEnd(4)}  ${result.id}${detail}`);
    }
    console.log(`\n${summary.pass ? "PASS" : "FAIL"}: ${results.length - failures.length}/${results.length} assets resolved.`);
  }

  process.exitCode = summary.pass ? 0 : 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack : error);
  process.exitCode = 1;
});
