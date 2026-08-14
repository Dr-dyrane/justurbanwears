"use client";

/* Private operator captures are served through authenticated no-store routes. */
/* eslint-disable @next/next/no-img-element */

import { Camera, Check, CircleAlert, Images, LoaderCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Garment } from "../../lib/studio/domain/entities";
import {
  pendingWardrobeMediaLabel,
  type PendingWardrobeProductContract,
} from "../../lib/studio/seeds/private-wardrobe-products";
import {
  PENDING_DIRECT_CAPTURE_ROLES,
  type OperatorSafePendingCapture,
  type PendingDirectCaptureRole,
} from "../../lib/studio/engine/pending-capture-contracts";
import { useStudio } from "./studio-provider";

type CaptureWorkspace = { sku: string; captures: OperatorSafePendingCapture[] };
type Preview = { role: PendingDirectCaptureRole; file: File; url: string };

function Spinner({ label }: { label?: string }) {
  return <span aria-label={label} className="studio-capture-spinner" role={label ? "status" : undefined}><LoaderCircle aria-hidden="true" size={17} /></span>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function parseWorkspace(value: unknown): CaptureWorkspace | null {
  if (!isRecord(value) || typeof value.sku !== "string" || !Array.isArray(value.captures)) return null;
  const captures = value.captures.filter((capture): capture is OperatorSafePendingCapture =>
    isRecord(capture)
    && typeof capture.id === "string"
    && typeof capture.role === "string"
    && PENDING_DIRECT_CAPTURE_ROLES.includes(capture.role as PendingDirectCaptureRole)
    && typeof capture.view === "string"
    && typeof capture.mimeType === "string"
    && typeof capture.assetUrl === "string"
    && typeof capture.approvedAt === "string"
  );
  return { sku: value.sku, captures };
}

function errorMessage(value: unknown) {
  if (isRecord(value) && typeof value.error === "string") return value.error;
  if (isRecord(value) && isRecord(value.error) && typeof value.error.message === "string") return value.error.message;
  return "The photo could not be saved.";
}

export function DraftDirectCaptures({
  contract,
  garment,
  onCapturesChange,
}: {
  contract: PendingWardrobeProductContract;
  garment: Garment;
  onCapturesChange(captures: OperatorSafePendingCapture[]): void;
}) {
  const { syncPendingGarmentCaptures } = useStudio();
  const [captures, setCaptures] = useState<OperatorSafePendingCapture[]>([]);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingRole, setSavingRole] = useState<PendingDirectCaptureRole | null>(null);
  const [feedback, setFeedback] = useState<{ tone: "success" | "error"; text: string } | null>(null);
  const busy = loading || Boolean(savingRole);
  const requiredRoles = useMemo(() => PENDING_DIRECT_CAPTURE_ROLES.filter((role) =>
    contract.missingViews.includes(role)
  ), [contract]);

  const applyWorkspace = useCallback((workspace: CaptureWorkspace) => {
    setCaptures(workspace.captures);
    onCapturesChange(workspace.captures);
    syncPendingGarmentCaptures(garment.id, workspace.captures.map((capture) => ({
      id: `pending-capture-${capture.id}`,
      view: capture.view,
      quality: 100,
    })));
  }, [garment.id, onCapturesChange, syncPendingGarmentCaptures]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    void fetch(`/api/studio/pending-products/${encodeURIComponent(contract.sku)}/captures`, {
      cache: "no-store",
      credentials: "same-origin",
      headers: { accept: "application/json" },
      signal: controller.signal,
    }).then(async (response) => {
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const workspace = parseWorkspace(body);
      if (!workspace) throw new Error("The saved photos could not be read.");
      applyWorkspace(workspace);
    }).catch((error: unknown) => {
      if (!controller.signal.aborted) setFeedback({ tone: "error", text: error instanceof Error ? error.message : "Photos could not load." });
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [applyWorkspace, contract.sku]);

  useEffect(() => () => {
    if (preview) URL.revokeObjectURL(preview.url);
  }, [preview]);

  function choose(role: PendingDirectCaptureRole, file?: File) {
    if (!file || busy) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 12 * 1024 * 1024) {
      setFeedback({ tone: "error", text: "Choose a JPEG, PNG or WebP under 12 MB." });
      return;
    }
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview({ role, file, url: URL.createObjectURL(file) });
    setFeedback(null);
  }

  async function usePhoto() {
    if (!preview || savingRole) return;
    setSavingRole(preview.role);
    setFeedback(null);
    const form = new FormData();
    form.set("role", preview.role);
    form.set("file", preview.file);
    try {
      const response = await fetch(`/api/studio/pending-products/${encodeURIComponent(contract.sku)}/captures`, {
        method: "POST",
        credentials: "same-origin",
        body: form,
      });
      const body: unknown = await response.json();
      if (!response.ok) throw new Error(errorMessage(body));
      const workspace = parseWorkspace(body);
      if (!workspace) throw new Error("The saved photo could not be read.");
      applyWorkspace(workspace);
      URL.revokeObjectURL(preview.url);
      setPreview(null);
      setFeedback({ tone: "success", text: `${pendingWardrobeMediaLabel(preview.role)} saved privately.` });
    } catch (error) {
      setFeedback({ tone: "error", text: error instanceof Error ? error.message : "The photo could not be saved." });
    } finally {
      setSavingRole(null);
    }
  }

  if (!requiredRoles.length) return null;

  return (
    <section className="studio-direct-captures" aria-label={`${garment.title} private captures`}>
      <div className="studio-direct-captures-heading">
        <div><small>Direct captures</small><strong>{captures.length}/{requiredRoles.length} saved</strong></div>
        {loading ? (
          <Spinner label="Loading saved photos" />
        ) : captures.length === requiredRoles.length ? (
          <Check aria-hidden="true" size={18} />
        ) : (
          <Images aria-hidden="true" className="is-incomplete" size={18} />
        )}
      </div>

      {preview ? (
        <div className="studio-capture-preview">
          <img alt={`${pendingWardrobeMediaLabel(preview.role)} preview`} src={preview.url} />
          <div>
            <span><small>Preview</small><strong>{pendingWardrobeMediaLabel(preview.role)}</strong></span>
            <label aria-disabled={busy} className="button button-secondary">
              <RefreshCw aria-hidden="true" size={15} />Replace
              <input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => choose(preview.role, event.target.files?.[0])} type="file" />
            </label>
            <button className="button button-primary" disabled={Boolean(savingRole)} onClick={usePhoto} type="button">
              {savingRole ? <Spinner /> : <Check aria-hidden="true" size={15} />}
              {savingRole ? "Saving…" : "Use photo"}
            </button>
          </div>
        </div>
      ) : (
        <div className="studio-direct-capture-list">
          {requiredRoles.map((role) => {
            const saved = captures.find((capture) => capture.role === role);
            return (
              <article className={saved ? "is-saved" : undefined} key={role}>
                {saved ? <img alt={`${pendingWardrobeMediaLabel(role)} saved privately`} src={saved.assetUrl} /> : <div><Images aria-hidden="true" size={21} /></div>}
                <span><small>{saved ? "Saved privately" : "Missing"}</small><strong>{pendingWardrobeMediaLabel(role)}</strong></span>
                <div className="studio-direct-capture-actions">
                  <label aria-disabled={busy} aria-label={`Take ${pendingWardrobeMediaLabel(role).toLowerCase()} photo`}>
                    <Camera aria-hidden="true" size={17} />
                    <span aria-hidden="true">Camera</span>
                    <input accept="image/jpeg,image/png,image/webp" capture="environment" disabled={busy} onChange={(event) => choose(role, event.target.files?.[0])} type="file" />
                  </label>
                  <label aria-disabled={busy} aria-label={`${saved ? "Replace" : "Choose"} ${pendingWardrobeMediaLabel(role).toLowerCase()} from Photos`}>
                    {saved ? <RefreshCw aria-hidden="true" size={17} /> : <Images aria-hidden="true" size={17} />}
                    <span aria-hidden="true">{saved ? "Replace" : "Photos"}</span>
                    <input accept="image/jpeg,image/png,image/webp" disabled={busy} onChange={(event) => choose(role, event.target.files?.[0])} type="file" />
                  </label>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {feedback ? <p className={`studio-capture-feedback is-${feedback.tone}`} role={feedback.tone === "error" ? "alert" : "status"}>{feedback.tone === "error" ? <CircleAlert aria-hidden="true" size={15} /> : <Check aria-hidden="true" size={15} />}{feedback.text}</p> : null}
      <p className="studio-capture-private-note">Private until a separate public review.</p>
    </section>
  );
}
