import { get } from "@vercel/blob";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import {
  getPendingProductCapture,
  listPendingProductCaptures,
  upsertPendingProductCapture,
  type PendingCaptureRow,
} from "../../server/studio-pending-capture-repository";
import type { StudioOperator } from "../../server/studio-operator";
import { getPendingWardrobeProductContract } from "../seeds/private-wardrobe-products";
import { verifyStudioImage } from "./assets";
import {
  isPendingDirectCaptureRole,
  pendingCaptureView,
  type OperatorSafePendingCapture,
  type PendingDirectCaptureRole,
} from "./pending-capture-contracts";
import { StudioEngineError } from "./errors";
import { sha256 } from "./fingerprint";

export function requirePendingCaptureContract(sku: string, role?: unknown) {
  const normalizedSku = sku.trim().toUpperCase();
  const contract = getPendingWardrobeProductContract(normalizedSku);
  if (!contract || contract.sku !== normalizedSku) {
    throw new StudioEngineError("INVALID_REQUEST", 404, "That draft was not found.", "Return to Wardrobe.");
  }
  if (role !== undefined && (
    !isPendingDirectCaptureRole(role)
    || !contract.missingViews.includes(role)
  )) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "That photo is not required.", "Choose a missing product view.");
  }
  return contract;
}

export function operatorSafePendingCapture(row: PendingCaptureRow): OperatorSafePendingCapture {
  const role = row.role as PendingDirectCaptureRole;
  return {
    id: row.id,
    role,
    view: pendingCaptureView(role),
    mimeType: row.mimeType,
    width: row.width,
    height: row.height,
    assetUrl: `/api/studio/pending-products/${encodeURIComponent(row.sku)}/captures/${row.id}`,
    approvedAt: row.operatorApprovedAt.toISOString(),
  };
}

export async function getPendingCaptureWorkspace(sku: string, operator: StudioOperator) {
  const contract = requirePendingCaptureContract(sku);
  const captures = await listPendingProductCaptures({ operatorSubject: operator.subject, sku: contract.sku });
  return {
    sku: contract.sku,
    captures: captures
      .filter((capture) => isPendingDirectCaptureRole(capture.role) && contract.missingViews.includes(capture.role))
      .map(operatorSafePendingCapture),
  };
}

export async function savePendingProductCapture(input: {
  sku: string;
  role: unknown;
  operator: StudioOperator;
  bytes: Uint8Array;
  declaredType?: string;
}) {
  const contract = requirePendingCaptureContract(input.sku, input.role);
  const role = input.role as PendingDirectCaptureRole;
  const verified = verifyStudioImage(input.bytes, input.declaredType);
  const hash = sha256(verified.bytes);
  const existing = (await listPendingProductCaptures({
    operatorSubject: input.operator.subject,
    sku: contract.sku,
  })).find((capture) => capture.role === role && capture.sha256 === hash);
  if (!existing) {
    const operatorKey = sha256(input.operator.subject).slice(0, 20);
    const pathname = `studio/operators/${operatorKey}/pending-products/${contract.sku}/${role.toLowerCase()}/${hash}.${verified.extension}`;
    const priorBlob = await get(pathname, {
      access: "private",
      token: getShopBlobToken("private"),
      useCache: false,
    });
    let storedPathname = pathname;
    if (priorBlob) {
      const priorBytes = new Uint8Array(await new Response(priorBlob.stream).arrayBuffer());
      const priorVerified = verifyStudioImage(priorBytes, priorBlob.blob.contentType ?? undefined);
      if (sha256(priorVerified.bytes) !== hash) {
        throw new StudioEngineError("INVALID_ASSET", 503, "That private photo did not verify.", "Choose the photo again.");
      }
    } else {
      const blob = await putShopBlob("private", pathname, Buffer.from(verified.bytes), {
        addRandomSuffix: false,
        allowOverwrite: false,
        contentType: verified.mimeType,
        cacheControlMaxAge: 31_536_000,
      });
      storedPathname = blob.pathname;
    }
    await upsertPendingProductCapture({
      operatorSubject: input.operator.subject,
      sku: contract.sku,
      role,
      blobPathname: storedPathname,
      mimeType: verified.mimeType,
      byteSize: verified.bytes.byteLength,
      width: verified.width,
      height: verified.height,
      sha256: hash,
      operatorApprovedAt: new Date(),
    });
  }
  return getPendingCaptureWorkspace(contract.sku, input.operator);
}

export async function readPendingProductCapture(input: {
  sku: string;
  captureId: string;
  operator: StudioOperator;
}) {
  const contract = requirePendingCaptureContract(input.sku);
  const capture = await getPendingProductCapture({
    operatorSubject: input.operator.subject,
    sku: contract.sku,
    captureId: input.captureId,
  });
  const result = await get(capture.blobPathname, {
    access: "private",
    token: getShopBlobToken("private"),
    useCache: true,
  });
  if (!result || result.statusCode !== 200) {
    throw new StudioEngineError("ENGINE_UNAVAILABLE", 503, "That photo is unavailable.", "Replace the photo.");
  }
  return { stream: result.stream, mimeType: capture.mimeType, byteSize: capture.byteSize };
}
