import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
import { put, get } from "@vercel/blob";

const expectedSha = "ef88e65e78780101693720fd872c23857e4311412900acb28fdc139b08a373b8";
const sourcePath = process.env.STUDIO_LULU_V3_SOURCE_FILE;
const databaseUrl = process.env.DATABASE_URL_UNPOOLED;
const blobToken = process.env.PRIVATE_BLOB_READ_WRITE_TOKEN;

if (!sourcePath || !databaseUrl || !blobToken) {
  throw new Error("Provide STUDIO_LULU_V3_SOURCE_FILE, DATABASE_URL_UNPOOLED and PRIVATE_BLOB_READ_WRITE_TOKEN.");
}
const body = await readFile(sourcePath);
const hash = createHash("sha256").update(body).digest("hex");
if (hash !== expectedSha) throw new Error("Lulu V3 source SHA-256 did not match the approved authority.");
const pngSignature = body.subarray(0, 8).toString("hex");
const width = body.readUInt32BE(16);
const height = body.readUInt32BE(20);
if (pngSignature !== "89504e470d0a1a0a" || width !== 972 || height !== 1619) {
  throw new Error("Lulu V3 source dimensions or PNG signature did not match the approved authority.");
}
const pathname = `studio/model-authorities/lulu-v3/${hash}.png`;
let existing = await get(pathname, { access: "private", token: blobToken, useCache: false });
if (!existing) {
  try {
    await put(pathname, body, { access: "private", addRandomSuffix: false, allowOverwrite: false, contentType: "image/png", token: blobToken });
  } catch (error) {
    existing = await get(pathname, { access: "private", token: blobToken, useCache: false });
    if (!existing) throw error;
  }
}
const readback = existing ?? await get(pathname, { access: "private", token: blobToken, useCache: false });
if (!readback || readback.statusCode !== 200) throw new Error("Lulu V3 private Blob read-back failed.");
const readbackHash = createHash("sha256").update(Buffer.from(await new Response(readback.stream).arrayBuffer())).digest("hex");
if (readbackHash !== expectedSha) throw new Error("Lulu V3 private Blob read-back hash mismatch.");

const sql = neon(databaseUrl);
await sql.query(`insert into studio_model_profiles (
  operator_subject, name, authority_id, kind, state, source_blob_pathname, source_mime_type,
  source_byte_size, source_width, source_height, source_sha256, authority, authority_confirmed_at
) values (null, 'Lulu', 'lulu-v3', 'LULU_V3', 'READY', $1, 'image/png', $2, 972, 1619, $3, $4::jsonb, '2026-08-10'::timestamptz)
on conflict (authority_id) where kind = 'LULU_V3' do nothing`, [pathname, body.byteLength, expectedSha, JSON.stringify({
  canonVersion: "3.0.0",
  approvalState: "IDENTITY_MASTER_USER_APPROVED",
  approvedOn: "2026-08-10",
  approvedBy: "user",
  privacy: "PRIVATE_PRODUCTION_ONLY",
  publishable: false,
  allowedUse: "Private justurban wears Studio try-on generation.",
  restrictedUse: "Never expose the identity master or publish it as product media.",
})]);
const result = await sql.query("select source_blob_pathname, source_mime_type, source_byte_size, source_sha256, source_width, source_height, kind, authority from studio_model_profiles where authority_id = 'lulu-v3'", []);
const row = Array.isArray(result) ? result[0] : result.rows?.[0];
if (row?.source_blob_pathname !== pathname || row?.source_mime_type !== "image/png" || row?.source_byte_size !== body.byteLength || row?.source_sha256 !== expectedSha || row?.source_width !== 972 || row?.source_height !== 1619 || row?.kind !== "LULU_V3" || row?.authority?.approvalState !== "IDENTITY_MASTER_USER_APPROVED") {
  throw new Error("Stored Lulu V3 profile did not verify.");
}
console.log("Lulu V3 private authority verified and seeded.");
