"use client";

/* Private Studio images are served by authenticated same-origin routes. */
/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertCircle, Check, LoaderCircle, Sparkles } from "lucide-react";
import type {
  GarmentSetSlot,
  GarmentSetWorkspace,
} from "../../lib/studio/engine/garment-set-contracts";
import { StudioTaskSheet } from "./atoms/studio-task-sheet";
import { StudioMediaButton, type StudioMediaItem } from "./media-viewer";

type EngineErrorBody = {
  error?: { message?: string; recovery?: string };
};

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      cache: "no-store",
      credentials: "same-origin",
      ...init,
      headers: { "Content-Type": "application/json", ...init?.headers },
    });
  } catch {
    throw new Error("Studio could not connect. Check your connection and try again.");
  }
  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as EngineErrorBody;
    throw new Error([body.error?.message, body.error?.recovery].filter(Boolean).join(" ") || "Studio could not finish that action.");
  }
  return response.json() as Promise<T>;
}

function slotStatus(slot: GarmentSetSlot) {
  if (slot.state === "KEPT") return "Kept";
  if (slot.state === "REVIEW") return slot.inferred ? "Check against the garment" : "Review";
  if (slot.state === "BUILDING") return "Building";
  if (slot.state === "FAILED") return slot.canRetry ? "Try again" : "Use a photo";
  if (slot.state === "WAITING") return "After try-on";
  return "Not made";
}

export function GarmentSetBuilder({
  onDismiss,
  open,
  returnFocus,
  wardrobeItemId,
}: {
  onDismiss(): void;
  open: boolean;
  returnFocus?: HTMLElement | null;
  wardrobeItemId: string;
}) {
  const [workspace, setWorkspace] = useState<GarmentSetWorkspace | null>(null);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const result = await request<{ workspace: GarmentSetWorkspace }>(
        `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/set`,
      );
      setWorkspace(result.workspace);
      return result.workspace;
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "The set could not be opened.");
      return null;
    }
  }, [wardrobeItemId]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [load, open]);

  useEffect(() => {
    if (!open || workspace?.state !== "BUILDING") return;
    const timer = window.setTimeout(() => void load(), 2_500);
    return () => window.clearTimeout(timer);
  }, [load, open, workspace?.state]);

  const mediaItems = useMemo<StudioMediaItem[]>(() =>
    workspace?.slots.flatMap((slot) => slot.assetUrl ? [{
      alt: `${workspace.title} · ${slot.label}`,
      label: slot.label,
      src: slot.assetUrl,
    }] : []) ?? [], [workspace]);

  const build = useCallback(async () => {
    setWorking(true);
    setError("");
    try {
      const result = await request<{ workspace: GarmentSetWorkspace }>(
        `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/set`,
        { method: "POST", body: JSON.stringify({ costConfirmed: true }) },
      );
      setWorkspace(result.workspace);
    } catch (buildError) {
      setError(buildError instanceof Error ? buildError.message : "The set could not be built.");
      await load();
    } finally {
      setWorking(false);
    }
  }, [load, wardrobeItemId]);

  const decide = useCallback(async (slot: GarmentSetSlot, decision: "KEEP" | "REJECT") => {
    if (!slot.jobId) return;
    setWorking(true);
    setError("");
    try {
      const isCompletion = slot.key === "GARMENT_BACK" || slot.key === "FABRIC_DETAIL";
      const path = isCompletion
        ? `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/completions/${encodeURIComponent(slot.jobId)}/decision`
        : `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/wear/${encodeURIComponent(slot.jobId)}/decision`;
      await request(path, {
        method: "POST",
        body: JSON.stringify(isCompletion
          ? { decision, ...(decision === "KEEP" && slot.inferred ? { truthConfirmed: true } : {}) }
          : { decision }),
      });
      await load();
    } catch (decisionError) {
      setError(decisionError instanceof Error ? decisionError.message : "That decision was not saved.");
    } finally {
      setWorking(false);
    }
  }, [load, wardrobeItemId]);

  const kept = workspace?.slots.filter((slot) => slot.state === "KEPT").length ?? 0;
  const progress = workspace ? Math.round((kept / workspace.slots.length) * 100) : 0;

  return (
    <StudioTaskSheet
      className="studio-set-sheet"
      eyebrow="Garment set"
      footer={workspace && workspace.nextAction === "BUILD" ? (
        <button className="button button-primary studio-set-build" disabled={working} onClick={() => void build()} type="button">
          {working ? <LoaderCircle aria-hidden="true" className="spin" size={18} /> : <Sparkles aria-hidden="true" size={18} />}
          {workspace.slots.some((slot) => slot.state === "FAILED") ? "Try unfinished views" : "Build missing views"}
          {Number(workspace.maxAdditionalCostUsd) > 0 ? <small>up to ${workspace.maxAdditionalCostUsd}</small> : null}
        </button>
      ) : undefined}
      onDismiss={() => {
        if (working) return false;
        onDismiss();
      }}
      open={open}
      progress={progress}
      progressLabel="Garment set progress"
      returnFocus={returnFocus}
      title={workspace?.title ?? "Build the set"}
    >
      <div aria-live="polite" className="studio-set-status">
        {error ? <p className="studio-set-error"><AlertCircle aria-hidden="true" size={17} />{error}</p> : null}
        {!workspace && !error ? <p><LoaderCircle aria-hidden="true" className="spin" size={18} />Opening set</p> : null}
        {workspace?.state === "COMPLETE" ? <p><Check aria-hidden="true" size={18} />Set complete. Everything remains private until published.</p> : null}
      </div>

      {workspace ? (
        <ol className="studio-set-grid">
          {workspace.slots.map((slot) => {
            const itemIndex = slot.assetUrl
              ? mediaItems.findIndex((item) => item.src === slot.assetUrl)
              : -1;
            return (
              <li className={`studio-set-slot is-${slot.state.toLowerCase()}`} key={slot.key}>
                {slot.assetUrl && itemIndex >= 0 ? (
                  <StudioMediaButton
                    className="studio-set-media"
                    index={itemIndex}
                    items={mediaItems}
                    label={`Open ${slot.label}`}
                  >
                    <img alt="" src={slot.assetUrl} />
                  </StudioMediaButton>
                ) : (
                  <div aria-hidden="true" className="studio-set-placeholder">
                    {slot.state === "BUILDING"
                      ? <LoaderCircle className="spin" size={22} />
                      : <Sparkles size={22} />}
                  </div>
                )}
                <div className="studio-set-slot-copy">
                  <strong>{slot.label}</strong>
                  <span>{slotStatus(slot)}</span>
                  {slot.inferred ? <small>AI-completed view</small> : null}
                </div>
                {slot.state === "REVIEW" ? (
                  <div className="studio-set-decisions">
                    <button disabled={working} onClick={() => void decide(slot, "REJECT")} type="button">Fix</button>
                    <button className="button-primary" disabled={working} onClick={() => void decide(slot, "KEEP")} type="button">
                      {slot.inferred ? "Yes, it matches" : "Keep"}
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ol>
      ) : null}
    </StudioTaskSheet>
  );
}
