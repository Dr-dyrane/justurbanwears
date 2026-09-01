import { createHash } from "node:crypto";
import { StudioEngineError } from "../studio/engine/errors";
import type { AtelierArtifactRow } from "./studio-atelier-repository";
import { getShopBlob } from "./vercel-blob";

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/**
 * Read-only exact-byte access deliberately lives outside the lock/compositor
 * module so review and publication GET routes never load native image tooling.
 */
export async function readAtelierArtifactBytes(
  artifact: AtelierArtifactRow,
): Promise<Uint8Array> {
  const result = await getShopBlob("private", artifact.blobPathname, { useCache: false });
  if (!result || result.statusCode !== 200 || !result.stream) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The approved Atelier artifact is unavailable.",
      "Restore the exact private content-addressed artifact before locking.",
    );
  }
  const bytes = new Uint8Array(await new Response(result.stream).arrayBuffer());
  if (
    bytes.byteLength !== artifact.byteSize
    || result.blob.size !== artifact.byteSize
    || sha256(bytes) !== artifact.sha256
  ) {
    throw new StudioEngineError(
      "INVALID_ASSET",
      503,
      "The approved Atelier artifact failed content-addressed verification.",
      "Restore the exact private artifact before locking.",
    );
  }
  return bytes;
}
