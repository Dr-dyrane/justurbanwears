import { requireStudioOperator } from "../../../../../lib/server/studio-operator";
import { resolveLuluV4AuthorityAssets } from "../../../../../lib/server/studio-lulu-v4-authority";
import { engineErrorResponse } from "../../../../../lib/studio/engine/errors";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const LULU_PROFILE_AVATAR_ASSET_ID = "lulu.face.v4.front.lock.v1";

export async function GET(): Promise<Response> {
  try {
    await requireStudioOperator();
    const [asset] = await resolveLuluV4AuthorityAssets([LULU_PROFILE_AVATAR_ASSET_ID]);
    const body = new Uint8Array(asset.bytes.byteLength);
    body.set(asset.bytes);
    return new Response(body.buffer, {
      headers: {
        "cache-control": "private, no-store, max-age=0",
        "content-length": String(body.byteLength),
        "content-type": asset.mimeType,
        "cross-origin-resource-policy": "same-origin",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (error) {
    return engineErrorResponse(error);
  }
}
