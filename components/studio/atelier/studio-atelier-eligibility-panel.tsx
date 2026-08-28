"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronRight, LockKeyhole, RefreshCw } from "lucide-react";

import {
  studioAtelierEligibilityProjectionSchema,
  type StudioAtelierEligibilityBlocker,
  type StudioAtelierEligibilityProjection,
  type StudioAtelierEligibilityStage,
} from "../../../lib/studio/atelier/eligibility-contracts";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioLink } from "../atoms/studio-link";

type PanelState =
  | Readonly<{ state: "loading" }>
  | Readonly<{ state: "ready"; projection: StudioAtelierEligibilityProjection }>
  | Readonly<{ state: "error"; detail: string }>;

function stageBlocker(stage: StudioAtelierEligibilityStage): StudioAtelierEligibilityBlocker | null {
  const commands = [
    stage.commands.prepare,
    stage.commands.run,
    stage.commands.keep,
    stage.commands.fixOneThing,
    stage.commands.reject,
  ];
  return commands.find((command) => command.state === "BLOCKED")?.blocker ?? null;
}

export function selectStudioAtelierRecovery(
  projection: StudioAtelierEligibilityProjection,
): StudioAtelierEligibilityStage | null {
  return projection.stages.find((stage) =>
    stage.primaryCommand === "RECOVER"
    && stage.commands.recover.state === "AVAILABLE"
    && Boolean(stage.operation?.recoveryHref)
  ) ?? null;
}

export function selectStudioAtelierBlocker(
  projection: StudioAtelierEligibilityProjection,
): StudioAtelierEligibilityBlocker | null {
  for (const stage of projection.stages) {
    const blocker = stageBlocker(stage);
    if (blocker) return blocker;
  }
  return null;
}

async function readEligibility(wardrobeItemId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/studio/wardrobe/${encodeURIComponent(wardrobeItemId)}/atelier`,
    { cache: "no-store", credentials: "same-origin", signal },
  );
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const parsed = body && typeof body === "object" && "error" in body
      ? (body as { error?: { message?: unknown; recovery?: unknown } }).error
      : null;
    const message = typeof parsed?.message === "string"
      ? parsed.message
      : "Studio could not check this garment.";
    const recovery = typeof parsed?.recovery === "string" ? ` ${parsed.recovery}` : "";
    throw new Error(`${message}${recovery}`);
  }
  const parsed = studioAtelierEligibilityProjectionSchema.safeParse(body);
  if (!parsed.success) throw new Error("Studio returned an unreadable Atelier status.");
  return parsed.data;
}

function stageStatus(stage: StudioAtelierEligibilityStage): string {
  if (stage.operation?.state === "LOCKED") return "Locked";
  if (stage.operation) return "Saved";
  if (stage.status === "ELIGIBLE") return "Ready";
  return stageBlocker(stage)?.title ?? "Blocked";
}

export function StudioAtelierEligibilityPanel({
  onUseLegacy,
  wardrobeItemId,
}: Readonly<{
  onUseLegacy(): void;
  wardrobeItemId: string;
}>) {
  const requestInFlightRef = useRef(false);
  const activeRequestRef = useRef<AbortController | null>(null);
  const [panel, setPanel] = useState<PanelState>({ state: "loading" });

  const refresh = useCallback(async () => {
    if (requestInFlightRef.current) return;
    requestInFlightRef.current = true;
    const controller = new AbortController();
    activeRequestRef.current = controller;
    setPanel({ state: "loading" });
    try {
      const projection = await readEligibility(wardrobeItemId, controller.signal);
      setPanel({ state: "ready", projection });
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setPanel({
          state: "error",
          detail: error instanceof Error
            ? error.message
            : "Check this garment again. No generation was started.",
        });
      }
    } finally {
      if (activeRequestRef.current === controller) {
        activeRequestRef.current = null;
        requestInFlightRef.current = false;
      }
    }
  }, [wardrobeItemId]);

  useEffect(() => {
    void refresh();
    return () => {
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      requestInFlightRef.current = false;
    };
  }, [refresh]);

  const projection = panel.state === "ready" ? panel.projection : null;
  const recoveryStage = useMemo(
    () => projection ? selectStudioAtelierRecovery(projection) : null,
    [projection],
  );
  const blocker = useMemo(
    () => projection ? selectStudioAtelierBlocker(projection) : null,
    [projection],
  );

  return (
    <details className="studio-piece-shop studio-atelier-eligibility">
      <summary className="studio-draft-media-action">
        <span>
          <LockKeyhole aria-hidden="true" size={18} />
          <span>
            <small>Product photos</small>
            <strong>Atelier</strong>
          </span>
        </span>
        <span className="studio-inline-state">
          {panel.state === "loading"
            ? "Checking…"
            : panel.state === "error"
              ? "Unavailable"
              : recoveryStage
                ? "Saved work"
                : panel.projection.mode === "COMMANDS_AVAILABLE"
                  ? "Ready"
                  : "Current flow"}
          <ChevronRight aria-hidden="true" size={16} />
        </span>
      </summary>

      <div className="studio-draft-readiness">
        {panel.state === "loading" ? (
          <StudioFeedback
            detail="No generation starts during this check."
            state="loading"
            title="Checking saved Atelier work…"
          />
        ) : panel.state === "error" ? (
          <StudioFeedback
            action={(
              <div className="studio-card-actions">
                <button className="button button-primary" onClick={() => void refresh()} type="button">
                  <RefreshCw aria-hidden="true" size={15} />
                  Try again
                </button>
                <button className="button button-secondary" onClick={onUseLegacy} type="button">
                  Use current photos
                </button>
              </div>
            )}
            detail={panel.detail}
            state="error"
            title="Atelier status unavailable"
          />
        ) : (
          <>
          <div className="studio-card-heading">
            <div>
              <small>{panel.projection.mode === "RECOVERY_ONLY" ? "Recovery only" : "Server ready"}</small>
              <h3>{recoveryStage ? `Continue ${recoveryStage.label}` : "Current photo flow stays available"}</h3>
            </div>
            {recoveryStage ? <LockKeyhole aria-label="Saved privately" size={18} /> : null}
          </div>
          <p className="studio-inline-state" role={blocker ? "status" : undefined}>
            {recoveryStage
              ? "Open the exact saved operation. Private candidates stay hidden until quality passes."
              : blocker
                ? `${blocker.title}. ${blocker.detail}`
                : "Atelier is ready when you choose it. Current Intake and Wear remain available."}
          </p>

          <div className="studio-card-actions">
            {recoveryStage?.operation ? (
              <StudioLink
                className="button button-primary"
                data-studio-workspace-primary="true"
                href={recoveryStage.operation.recoveryHref}
              >
                Open saved {recoveryStage.label}
              </StudioLink>
            ) : panel.projection.legacyIntake.available ? (
              <button
                className="button button-primary"
                data-studio-workspace-primary="true"
                onClick={onUseLegacy}
                type="button"
              >
                Continue with current photos
              </button>
            ) : null}
            {recoveryStage && panel.projection.legacyIntake.available ? (
              <button className="button button-secondary" onClick={onUseLegacy} type="button">
                Use current photos
              </button>
            ) : null}
          </div>

          <details>
            <summary className="button button-secondary">10-stage status</summary>
            <div className="studio-readiness-list">
              {panel.projection.stages.map((stage) => (
                <p key={stage.stage}>
                  <strong>{stage.label}</strong>
                  <span>
                    {stage.operation?.state === "LOCKED" ? <Check aria-hidden="true" size={14} /> : null}
                    {stageStatus(stage)}
                  </span>
                </p>
              ))}
            </div>
          </details>
          </>
        )}
      </div>
    </details>
  );
}
