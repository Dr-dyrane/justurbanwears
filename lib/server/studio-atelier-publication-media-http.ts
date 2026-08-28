import { engineErrorResponse } from "../studio/engine/errors";
import {
  readStudioAtelierPublishedMedia,
  type StudioAtelierPublishedMedia,
} from "./studio-atelier-publication-media";

type MediaContext = Readonly<{
  params: Promise<Readonly<{ receiptId: string; role: string }>>;
}>;

type ReadPublishedMedia = (input: Readonly<{
  receiptId: string;
  role: string;
}>) => Promise<StudioAtelierPublishedMedia>;

const CACHE_CONTROL = "public, no-cache, must-revalidate";

function headersFor(media: StudioAtelierPublishedMedia): HeadersInit {
  return {
    "cache-control": CACHE_CONTROL,
    "content-length": String(media.byteSize),
    "content-type": media.mimeType,
    "cross-origin-resource-policy": "same-origin",
    etag: media.etag,
    "x-content-type-options": "nosniff",
  };
}

function conditionalMatch(request: Request, etag: string): boolean {
  const condition = request.headers.get("if-none-match");
  if (!condition) return false;
  return condition.split(",").map((value) => value.trim()).includes(etag);
}

export function createStudioAtelierPublishedMediaHttpHandlers(input: Readonly<{
  readMedia: ReadPublishedMedia;
}>) {
  async function authorize(
    request: Request,
    context: MediaContext,
    head: boolean,
  ): Promise<Response> {
    try {
      const identity = await context.params;
      const media = await input.readMedia(identity);
      const headers = headersFor(media);
      if (conditionalMatch(request, media.etag)) {
        const conditionalHeaders = { ...headers } as Record<string, string>;
        delete conditionalHeaders["content-length"];
        delete conditionalHeaders["content-type"];
        return new Response(null, { status: 304, headers: conditionalHeaders });
      }
      if (head) return new Response(null, { status: 200, headers });
      const body = new Uint8Array(media.bytes.byteLength);
      body.set(media.bytes);
      return new Response(body.buffer, { status: 200, headers });
    } catch (error) {
      return engineErrorResponse(error);
    }
  }

  return Object.freeze({
    GET(request: Request, context: MediaContext): Promise<Response> {
      return authorize(request, context, false);
    },
    HEAD(request: Request, context: MediaContext): Promise<Response> {
      return authorize(request, context, true);
    },
  });
}

export const studioAtelierPublishedMediaHttpHandlers =
  createStudioAtelierPublishedMediaHttpHandlers({
    readMedia: readStudioAtelierPublishedMedia,
  });
