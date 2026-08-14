import { createHash } from "node:crypto";
import type { PutBlobResult } from "@vercel/blob";
import { putShopBlob } from "../../server/vercel-blob";
import type { ShopOrderService } from "./service";
import {
  SHOP_PAYMENT_EVIDENCE_MAX_BYTES,
  ShopOrderError,
  type ShopCustomerActor,
  type ShopPaymentEvidenceContentType,
  type ShopServerOrder,
} from "./types";
import { extensionForEvidenceType } from "./validation";

export interface PrivatePaymentEvidenceBlobStore {
  put(input: {
    pathname: string;
    contentType: ShopPaymentEvidenceContentType;
    body: Uint8Array;
    maximumSizeInBytes: number;
  }): Promise<Pick<PutBlobResult, "url" | "pathname" | "contentType">>;
}

export const vercelPrivatePaymentEvidenceBlobStore: PrivatePaymentEvidenceBlobStore = {
  put({ pathname, contentType, body, maximumSizeInBytes }) {
    return putShopBlob("private", pathname, Buffer.from(body), {
      addRandomSuffix: false,
      // Retrying identical, hash-verified bytes can safely repair a Blob-write /
      // database-finalize interruption without accepting different content.
      allowOverwrite: true,
      contentType,
      maximumSizeInBytes,
    });
  },
};

async function readVerifiedBody(
  request: Request,
  expectedSize: number,
  expectedSha256: string,
): Promise<Uint8Array> {
  const contentLength = request.headers.get("content-length");
  if (contentLength !== null && (!/^\d+$/.test(contentLength) || Number(contentLength) !== expectedSize)) {
    throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence byte count does not match its authorization.");
  }
  const declaredSha256 = request.headers.get("x-content-sha256");
  if (declaredSha256 !== expectedSha256) {
    throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence SHA-256 header does not match its authorization.");
  }
  if (!request.body) {
    throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence upload body is missing.");
  }

  const reader = request.body.getReader();
  const hash = createHash("sha256");
  const chunks: Uint8Array[] = [];
  let byteSize = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      if (!value) continue;
      byteSize += value.byteLength;
      if (byteSize > expectedSize || byteSize > SHOP_PAYMENT_EVIDENCE_MAX_BYTES) {
        await reader.cancel("Payment evidence exceeded its authorized byte count.");
        throw new ShopOrderError("PAYLOAD_TOO_LARGE", "The evidence upload is too large.");
      }
      hash.update(value);
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (byteSize !== expectedSize || hash.digest("hex") !== expectedSha256) {
    throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence bytes do not match their authorization.");
  }

  const body = new Uint8Array(byteSize);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

export async function uploadAuthorizedPaymentEvidence(
  service: ShopOrderService,
  blobStore: PrivatePaymentEvidenceBlobStore,
  actor: ShopCustomerActor,
  reference: string,
  authorizationId: string,
  request: Request,
  now = new Date(),
): Promise<ShopServerOrder> {
  const authorization = await service.getPaymentEvidenceAuthorization(
    actor,
    reference,
    authorizationId,
  );
  if (authorization.status === "SUPERSEDED") {
    throw new ShopOrderError("INVALID_TRANSITION", "The evidence authorization has been superseded.");
  }
  if (authorization.status === "AUTHORIZED" && new Date(authorization.expiresAt).getTime() <= now.getTime()) {
    throw new ShopOrderError(
      "EVIDENCE_AUTHORIZATION_EXPIRED",
      "The payment-evidence authorization has expired.",
    );
  }
  if (request.headers.get("content-type") !== authorization.contentType) {
    throw new ShopOrderError("EVIDENCE_MISMATCH", "The evidence MIME type does not match its authorization.");
  }

  const body = await readVerifiedBody(request, authorization.byteSize, authorization.sha256);
  if (authorization.status === "RECEIVED") {
    return service.getCustomerOrder(actor, reference);
  }
  const pathname = [
    "shop/payment-evidence",
    authorization.orderId,
    `${authorization.id}${extensionForEvidenceType(authorization.contentType)}`,
  ].join("/");
  const blob = await blobStore.put({
    pathname,
    contentType: authorization.contentType,
    body,
    maximumSizeInBytes: authorization.byteSize,
  });
  if (blob.pathname !== pathname || blob.contentType !== authorization.contentType) {
    throw new ShopOrderError("EVIDENCE_MISMATCH", "The private Blob response did not match the authorization.");
  }

  return service.completePaymentEvidence(actor, {
    reference,
    authorizationId: authorization.id,
    contentType: authorization.contentType,
    byteSize: authorization.byteSize,
    sha256: authorization.sha256,
    blobPathname: blob.pathname,
    blobUrl: blob.url,
  });
}
