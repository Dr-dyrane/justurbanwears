import { readFile } from "node:fs/promises";
import process from "node:process";

const mode = process.argv[2] ?? "--template";
const allowedModes = new Set(["--template", "--runtime", "--release"]);
if (!allowedModes.has(mode)) {
  console.error("Usage: node scripts/validate-release-env.mjs [--template|--runtime|--release]");
  process.exit(2);
}

const templateKeys = [
  "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN", "DATABASE_URL", "DATABASE_URL_UNPOOLED",
  "SHOP_DB_TARGET", "SHOP_DB_EXPECTED_HOST", "SHOP_DB_EXPECTED_DATABASE",
  "SHOP_DB_PRODUCTION_CONFIRM", "SHOP_DB_EXPECTED_MANIFEST_CHECKSUM", "SHOP_DB_GIT_SHA",
  "PUBLIC_BLOB_READ_WRITE_TOKEN", "PRIVATE_BLOB_READ_WRITE_TOKEN", "SHOP_RETURN_WINDOW_DAYS",
  "STUDIO_AI_ENGINE_AUTH_MODE", "STUDIO_OPERATOR_EMAILS", "STUDIO_AI_TEXT_MODEL",
  "STUDIO_AI_IMAGE_MODEL", "STUDIO_AI_IMAGE_COST_CAP_USD", "SHOP_WHATSAPP_ORDER_NUMBER",
];

function parseTemplate(source) {
  const values = new Map();
  const duplicates = new Set();
  for (const rawLine of source.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw new Error(`Invalid .env.example entry: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim();
    if (values.has(key)) duplicates.add(key);
    values.set(key, value);
  }
  return { values, duplicates };
}

function fail(messages) {
  for (const message of messages) console.error(`✗ ${message}`);
  process.exit(1);
}

function isPlaceholder(value) {
  return /(?:replace[-_ ]?me|your[_-]|example|changeme|xxxxx)/i.test(value);
}

function requiredEnvironment(keys) {
  const errors = [];
  for (const key of keys) {
    const value = process.env[key]?.trim() ?? "";
    if (!value) errors.push(`${key} is required`);
    else if (isPlaceholder(value)) errors.push(`${key} still contains a placeholder`);
  }
  return errors;
}

function validateStudioEnvironment() {
  const errors = [];
  const authMode = process.env.STUDIO_AI_ENGINE_AUTH_MODE?.trim() ?? "";
  if (!authMode) return errors;
  if (authMode !== "openai-sites" && authMode !== "neon-auth") errors.push("STUDIO_AI_ENGINE_AUTH_MODE must be openai-sites or neon-auth");
  const emails = (process.env.STUDIO_OPERATOR_EMAILS ?? "").split(",").map((email) => email.trim()).filter(Boolean);
  if (!emails.length) errors.push("STUDIO_OPERATOR_EMAILS is required when Studio auth is enabled");
  if (emails.some((email) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) errors.push("STUDIO_OPERATOR_EMAILS contains an invalid email address");
  if (process.env.STUDIO_AI_IMAGE_MODEL?.trim() !== "openai/gpt-image-2") errors.push("STUDIO_AI_IMAGE_MODEL must be openai/gpt-image-2");
  const cost = Number(process.env.STUDIO_AI_IMAGE_COST_CAP_USD);
  if (cost !== 0.10) errors.push("STUDIO_AI_IMAGE_COST_CAP_USD must be exactly 0.10");
  return errors;
}

if (mode === "--template") {
  const source = await readFile(new URL("../.env.example", import.meta.url), "utf8");
  const { values, duplicates } = parseTemplate(source);
  const errors = [];
  for (const key of duplicates) errors.push(`${key} appears more than once in .env.example`);
  for (const key of templateKeys) if (!values.has(key)) errors.push(`${key} is missing from .env.example`);
  const days = Number(values.get("SHOP_RETURN_WINDOW_DAYS"));
  if (!Number.isInteger(days) || days < 1 || days > 90) errors.push("SHOP_RETURN_WINDOW_DAYS must default to a whole number from 1 through 90");
  const cap = Number(values.get("STUDIO_AI_IMAGE_COST_CAP_USD"));
  if (values.get("STUDIO_AI_IMAGE_MODEL") !== "openai/gpt-image-2") errors.push("STUDIO_AI_IMAGE_MODEL must default to openai/gpt-image-2");
  if (cap !== 0.10) errors.push("STUDIO_AI_IMAGE_COST_CAP_USD must default to exactly 0.10");
  if (errors.length) fail(errors);
  console.log(`✓ .env.example defines ${values.size} unique release variables`);
  process.exit(0);
}

const runtimeErrors = requiredEnvironment(["DATABASE_URL", "PUBLIC_BLOB_READ_WRITE_TOKEN", "PRIVATE_BLOB_READ_WRITE_TOKEN", "NEXT_PUBLIC_MAPBOX_ACCESS_TOKEN"]);
runtimeErrors.push(...validateStudioEnvironment());
if (mode === "--release") {
  runtimeErrors.push(...requiredEnvironment(["DATABASE_URL_UNPOOLED", "SHOP_DB_TARGET", "SHOP_DB_EXPECTED_HOST", "SHOP_DB_EXPECTED_DATABASE", "SHOP_DB_EXPECTED_MANIFEST_CHECKSUM"]));
  if (process.env.SHOP_DB_TARGET?.trim().toLowerCase() === "production" && !process.env.SHOP_DB_PRODUCTION_CONFIRM?.trim()) runtimeErrors.push("SHOP_DB_PRODUCTION_CONFIRM is required for a production release");
}
if (runtimeErrors.length) fail([...new Set(runtimeErrors)]);
console.log(`✓ ${mode === "--release" ? "release" : "runtime"} environment contract is complete`);
