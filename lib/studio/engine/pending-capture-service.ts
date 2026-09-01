import { get } from "@vercel/blob";
import { getShopBlobToken, putShopBlob } from "../../server/vercel-blob";
import {
  getPendingProductCapture,
  listPendingProductCaptures,
  upsertPendingProductCapture,
  type PendingCaptureRow,
} from "../../server/studio-pending-capture-repository";
import { getOwnedWardrobeItem } from "../../server/studio-intake-repository";
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

const WARDROBE_CAPTURE_ROLES: readonly PendingDirectCaptureRole[] = [
  "GARMENT_BACK",
  "FABRIC_DETAIL",
];

export function wardrobeCaptureKey(wardrobeItemId: string) {
  return `INTAKE-${wardrobeItemId.replace(/-/g, "").slice(0, 32).toUpperCase()}`;
}

function safeCapture(row: PendingCaptureRow, assetUrl: string): OperatorSafePendingCapture {
  return {
    ...operatorSafePendingCapture(row),
    assetUrl,
  };
}

async function ownedWardrobeCaptureContract(wardrobeItemId: string, operator: StudioOperator) {
  const item = await getOwnedWardrobeItem(wardrobeItemId, operator.subject);
  return {
    item,
    key: wardrobeCaptureKey(item.id),
    roles: WARDROBE_CAPTURE_ROLES,
  };
}

async function saveCapture(input: {
  wardrobeItemId?: string;
  key: string;
  storagePath: string;
  assetUrl(captureId: string): string;
  roles: readonly PendingDirectCaptureRole[];
  role: unknown;
  operator: StudioOperator;
  bytes: Uint8Array;
  declaredType?: string;
}) {
  if (!isPendingDirectCaptureRole(input.role) || !input.roles.includes(input.role)) {
    throw new StudioEngineError("INVALID_REQUEST", 400, "That photo is not required.", "Choose a missing product view.");
  }
  const role = input.role;
  const verified = verifyStudioImage(input.bytes, input.declaredType);
  const hash = sha256(verified.bytes);
  const existing = (await listPendingProductCaptures({
    operatorSubject: input.operator.subject,
    sku: input.key,
  })).find((capture) => capture.role === role && capture.sha256 === hash);
  if (!existing) {
    const operatorKey = sha256(input.operator.subject).slice(0, 20);
    const pathname = `studio/operators/${operatorKey}/${input.storagePath}/${role.toLowerCase()}/${hash}.${verified.extension}`;
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
      wardrobeItemId: input.wardrobeItemId,
      sku: input.key,
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
  const captures = await listPendingProductCaptures({ operatorSubject: input.operator.subject, sku: input.key });
  return captures
    .filter((capture) => isPendingDirectCaptureRole(capture.role) && input.roles.includes(capture.role))
    .map((capture) => safeCapture(capture, input.assetUrl(capture.id)));
}

export async function getWardrobeCaptureWorkspace(wardrobeItemId: string, operator: StudioOperator) {
  const contract = await ownedWardrobeCaptureContract(wardrobeItemId, operator);
  const captures = await listPendingProductCaptures({ operatorSubject: operator.subject, sku: contract.key });
  return {
    wardrobeItemId,
    captures: captures
      .filter((capture) => isPendingDirectCaptureRole(capture.role) && contract.roles.includes(capture.role))
      .map((capture) => safeCapture(
        capture,
        `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/captures/${capture.id}`,
      )),
  };
}

export async function saveWardrobeCapture(input: {
  wardrobeItemId: string;
  role: unknown;
  operator: StudioOperator;
  bytes: Uint8Array;
  declaredType?: string;
}) {
  const contract = await ownedWardrobeCaptureContract(input.wardrobeItemId, input.operator);
  const captures = await saveCapture({
    wardrobeItemId: contract.item.id,
    key: contract.key,
    storagePath: `wardrobe/${contract.item.id}`,
    assetUrl: (captureId) => `/api/studio/wardrobe/${encodeURIComponent(contract.item.id)}/captures/${captureId}`,
    roles: contract.roles,
    role: input.role,
    operator: input.operator,
    bytes: input.bytes,
    declaredType: input.declaredType,
  });
  return { wardrobeItemId: contract.item.id, captures };
}

export async function readWardrobeCapture(input: {
  wardrobeItemId: string;
  captureId: string;
  operator: StudioOperator;
}) {
  const contract = await ownedWardrobeCaptureContract(input.wardrobeItemId, input.operator);
  const capture = await getPendingProductCapture({
    operatorSubject: input.operator.subject,
    sku: contract.key,
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
  await saveCapture({
    key: contract.sku,
    storagePath: `pending-products/${contract.sku}`,
    assetUrl: (captureId) => `/api/studio/pending-products/${encodeURIComponent(contract.sku)}/captures/${captureId}`,
    roles: contract.missingViews.filter(isPendingDirectCaptureRole),
    role: input.role,
    operator: input.operator,
    bytes: input.bytes,
    declaredType: input.declaredType,
  });
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
