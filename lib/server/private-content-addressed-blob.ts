import { createHash } from "node:crypto";
import type { GetBlobResult, PutBlobResult } from "@vercel/blob";
import { getShopBlob, putShopBlob } from "./vercel-blob";

const DEFAULT_NAMESPACE = "studio/atelier/artifacts";
const DEFAULT_MAXIMUM_BYTES = 32 * 1024 * 1024;

const extensionByMimeType: Readonly<Record<string, string>> = Object.freeze({
  "application/json": "json",
  "application/octet-stream": "bin",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
});

export interface PrivateContentAddressedBlobStore {
  get(pathname: string): Promise<GetBlobResult | null>;
  put(input: {
    pathname: string;
    body: Uint8Array;
    contentType: string;
  }): Promise<PutBlobResult>;
}

export interface VerifiedPrivateBlob {
  pathname: string;
  blobUrl: string;
  mimeType: string;
  byteSize: number;
  sha256: string;
}

const vercelPrivateBlobStore: PrivateContentAddressedBlobStore = {
  get(pathname) {
    return getShopBlob("private", pathname, { useCache: false });
  },
  put(input) {
    return putShopBlob("private", input.pathname, Buffer.from(input.body), {
      addRandomSuffix: false,
      allowOverwrite: false,
      cacheControlMaxAge: 31_536_000,
      contentType: input.contentType,
    });
  },
};

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function normalizeMimeType(value: string, allowOpaqueFallback: boolean): string {
  const mimeType = value.split(";", 1)[0]?.trim().toLowerCase() ?? "";
  if (!extensionByMimeType[mimeType]) {
    if (allowOpaqueFallback) return "application/octet-stream";
    throw new Error(`Unsupported private Atelier artifact MIME type: ${value}.`);
  }
  return mimeType;
}

function normalizeNamespace(value: string): string {
  const segments = value.replaceAll("\\", "/").split("/").filter(Boolean);
  if (
    segments.length === 0
    || segments.some((segment) => !/^[a-zA-Z0-9._-]+$/.test(segment) || segment === "." || segment === "..")
  ) {
    throw new Error("The private Atelier Blob namespace is invalid.");
  }
  return segments.join("/");
}

async function readVerified(
  store: PrivateContentAddressedBlobStore,
  pathname: string,
  expected: { bytes: Uint8Array; mimeType: string; sha256: string },
): Promise<VerifiedPrivateBlob | null> {
  const result = await store.get(pathname);
  if (!result) return null;
  if (result.statusCode !== 200 || !result.stream) {
    throw new Error(`Private Blob read-back did not return bytes: ${pathname}.`);
  }
  const remoteBytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  const remoteHash = sha256(remoteBytes);
  if (
    remoteBytes.byteLength !== expected.bytes.byteLength
    || remoteHash !== expected.sha256
    || result.blob.size !== expected.bytes.byteLength
    || result.blob.contentType.split(";", 1)[0]?.trim().toLowerCase() !== expected.mimeType
  ) {
    throw new Error(`Private Blob content-addressed read-back failed verification: ${pathname}.`);
  }
  return Object.freeze({
    pathname,
    blobUrl: result.blob.url,
    mimeType: expected.mimeType,
    byteSize: remoteBytes.byteLength,
    sha256: remoteHash,
  });
}

/**
 * Stores paid provider bytes in an immutable private, content-addressed path.
 * A successful return means the exact bytes were downloaded again and their
 * length, SHA-256 and MIME type matched. Concurrent identical writers converge
 * on the same verified object; a different object can never overwrite it.
 */
export async function putVerifiedPrivateContentAddressedBlob(input: {
  bytes: Uint8Array;
  mimeType: string;
  namespace?: string;
  maximumBytes?: number;
  allowOpaqueFallback?: boolean;
  store?: PrivateContentAddressedBlobStore;
}): Promise<VerifiedPrivateBlob> {
  const maximumBytes = input.maximumBytes ?? DEFAULT_MAXIMUM_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes <= 0) {
    throw new Error("The private Atelier artifact byte limit is invalid.");
  }
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > maximumBytes) {
    throw new Error(`The private Atelier artifact must contain 1-${maximumBytes} bytes.`);
  }

  const mimeType = normalizeMimeType(input.mimeType, input.allowOpaqueFallback ?? false);
  const digest = sha256(input.bytes);
  const namespace = normalizeNamespace(input.namespace ?? DEFAULT_NAMESPACE);
  const pathname = `${namespace}/${digest.slice(0, 2)}/${digest}.${extensionByMimeType[mimeType]}`;
  const store = input.store ?? vercelPrivateBlobStore;
  const expected = { bytes: input.bytes, mimeType, sha256: digest };

  const existing = await readVerified(store, pathname, expected);
  if (existing) return existing;

  try {
    await store.put({ pathname, body: input.bytes, contentType: mimeType });
  } catch (error) {
    // Another invocation may have won the immutable create race. Only suppress
    // the write error when the converged object exists and verifies exactly.
    const converged = await readVerified(store, pathname, expected);
    if (converged) return converged;
    throw error;
  }

  const readBack = await readVerified(store, pathname, expected);
  if (!readBack) {
    throw new Error(`Private Blob disappeared after immutable upload: ${pathname}.`);
  }
  return readBack;
}
