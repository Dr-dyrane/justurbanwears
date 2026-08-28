"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import {
  BookOpen,
  Check,
  ChevronRight,
  Cloud,
  Database,
  LogOut,
  Settings,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioOperator } from "../../../lib/server/studio-operator";
import { PwaInstallControl } from "../../pwa/pwa-install-control";
import { ThemeSettings } from "../../theme/theme-settings";
import { assignDocumentNavigation } from "../../brand/document-navigation-loading-stage";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

const authClient = createAuthClient();
const LULU_PROFILE_AVATAR_SRC = "/api/studio/profile/avatar";
const ATELIER_CONSENT_ENDPOINT = "/api/studio/settings/atelier-consent";
const ATELIER_CONSENT_AFFIRMATION_VERSION =
  "juw.atelier-likeness-consent-affirmation.v1";

type AtelierConsentStatus = Readonly<{
  schemaVersion: "juw.atelier-consent-status.v1";
  status:
    | "VERIFICATION_REQUIRED"
    | "NOT_RECORDED"
    | "ACTIVE"
    | "REVOKED"
    | "RECONFIRMATION_REQUIRED";
  revision: number;
  canGrant: boolean;
  canRevoke: boolean;
  recordedAt: string | null;
  updatedAt: string | null;
  affirmationVersion: typeof ATELIER_CONSENT_AFFIRMATION_VERSION;
  affirmations: readonly string[];
  providerNoticeVersion: string;
  providerNotice: string;
  providerPolicyRevision: string;
}>;

function consentError(value: unknown): string {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return "Studio could not read the current Atelier authorization.";
  }
  const error = "error" in value && value.error && typeof value.error === "object"
    ? value.error as Record<string, unknown>
    : null;
  const message = typeof error?.message === "string" ? error.message : null;
  const recovery = typeof error?.recovery === "string" ? error.recovery : null;
  return [message, recovery].filter(Boolean).join(" ")
    || "Studio could not read the current Atelier authorization.";
}

async function readConsentResponse(response: Response): Promise<AtelierConsentStatus> {
  const payload = await response.json() as unknown;
  if (!response.ok) throw new Error(consentError(payload));
  const consent = payload && typeof payload === "object" && "consent" in payload
    ? payload.consent
    : payload && typeof payload === "object" && "receipt" in payload
      && payload.receipt && typeof payload.receipt === "object"
      && "status" in payload.receipt
      ? payload.receipt.status
      : null;
  if (!consent || typeof consent !== "object" || !("status" in consent)) {
    throw new Error("Studio returned an incomplete Atelier authorization status.");
  }
  return consent as AtelierConsentStatus;
}

const consentPresentation = Object.freeze({
  VERIFICATION_REQUIRED: {
    label: "Verification required",
    detail: "No provider authorization is recorded.",
    tone: "critical",
  },
  NOT_RECORDED: {
    label: "Not confirmed",
    detail: "Review once before subject generation.",
    tone: "attention",
  },
  ACTIVE: {
    label: "Active",
    detail: "Future private Atelier use is authorized.",
    tone: "positive",
  },
  REVOKED: {
    label: "Revoked",
    detail: "New provider use is blocked.",
    tone: "critical",
  },
  RECONFIRMATION_REQUIRED: {
    label: "Review",
    detail: "Authority or provider policy changed.",
    tone: "attention",
  },
} as const satisfies Record<AtelierConsentStatus["status"], Readonly<{
  label: string;
  detail: string;
  tone: string;
}>>);

function LuluProfileAvatar({ online = false }: { online?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={online
        ? "studio-profile-avatar studio-profile-orb-mobile"
        : "studio-profile-avatar studio-profile-card-avatar"}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- authenticated same-origin media keeps the exact private authority bytes */}
      <img
        alt=""
        decoding="async"
        fetchPriority={online ? "high" : "auto"}
        height={1402}
        loading={online ? "eager" : "lazy"}
        onError={(event) => { event.currentTarget.hidden = true; }}
        src={LULU_PROFILE_AVATAR_SRC}
        width={1122}
      />
      {online ? <i /> : null}
    </span>
  );
}

export function StudioSettingsCenter({ operator }: { operator: StudioOperator | null }) {
  const studio = useStudio();
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const consentCommandInFlightRef = useRef(false);
  const consentCommandKeyRef = useRef<Readonly<{ action: "GRANT" | "REVOKE"; key: string }> | null>(null);
  const consentReadControllerRef = useRef<AbortController | null>(null);
  const [consent, setConsent] = useState<AtelierConsentStatus | null>(null);
  const [consentLoading, setConsentLoading] = useState(false);
  const [consentPending, setConsentPending] = useState<"GRANT" | "REVOKE" | null>(null);
  const [consentMessage, setConsentMessage] = useState<string | null>(null);
  const [consentOpen, setConsentOpen] = useState(false);
  const [consentReturnFocus, setConsentReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [adultSelfAttested, setAdultSelfAttested] = useState(false);
  const [likenessAuthorized, setLikenessAuthorized] = useState(false);
  const [retentionAcknowledged, setRetentionAcknowledged] = useState(false);
  const displayName = operator?.displayName && operator.displayName !== operator.email
    ? operator.displayName
    : "Lulu";
  const workspaceAvailable = studio.scenario ? true : studio.authority.status === "ready";

  const loadConsent = useCallback(async (): Promise<AtelierConsentStatus | null> => {
    consentReadControllerRef.current?.abort();
    const controller = new AbortController();
    consentReadControllerRef.current = controller;
    setConsentLoading(true);
    try {
      const response = await fetch(ATELIER_CONSENT_ENDPOINT, {
        cache: "no-store",
        credentials: "same-origin",
        signal: controller.signal,
      });
      const current = await readConsentResponse(response);
      setConsent(current);
      setConsentMessage(null);
      return current;
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) {
        setConsentMessage(error instanceof Error ? error.message : "Atelier authorization is unavailable.");
      }
      return null;
    } finally {
      if (consentReadControllerRef.current === controller) {
        consentReadControllerRef.current = null;
        setConsentLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    if (open && operator) void loadConsent();
    return () => {
      consentReadControllerRef.current?.abort();
      consentReadControllerRef.current = null;
    };
  }, [loadConsent, open, operator]);

  const runConsentCommand = useCallback(async (action: "GRANT" | "REVOKE") => {
    if (!consent || consentCommandInFlightRef.current) return;
    consentCommandInFlightRef.current = true;
    setConsentPending(action);
    setConsentMessage(null);
    const existing = consentCommandKeyRef.current;
    const commandKey = existing?.action === action
      ? existing.key
      : `atelier-consent:${action.toLowerCase()}:${crypto.randomUUID()}`;
    consentCommandKeyRef.current = Object.freeze({ action, key: commandKey });
    const body = action === "GRANT"
      ? {
          action,
          expectedRevision: consent.revision,
          idempotencyKey: commandKey,
          affirmationVersion: ATELIER_CONSENT_AFFIRMATION_VERSION,
          adultSelfAttested: true,
          likenessUseAuthorized: true,
          providerRetentionAcknowledged: true,
        }
      : {
          action,
          expectedRevision: consent.revision,
          idempotencyKey: commandKey,
          reason: "Lulu revoked future Atelier provider use in Studio Settings.",
        };
    try {
      const response = await fetch(ATELIER_CONSENT_ENDPOINT, {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });
      const current = await readConsentResponse(response);
      setConsent(current);
      consentCommandKeyRef.current = null;
      setAdultSelfAttested(false);
      setLikenessAuthorized(false);
      setRetentionAcknowledged(false);
      setConsentMessage(action === "GRANT"
        ? "Atelier authorization saved."
        : "Future Atelier provider use is now blocked.");
    } catch (error) {
      // The stable key is deliberately retained. Reconcile current server state
      // before the same command can be retried after an ambiguous response.
      const message = error instanceof Error ? error.message : "Atelier authorization could not be saved.";
      const reconciled = await loadConsent();
      const completed = action === "GRANT"
        ? reconciled?.status === "ACTIVE"
        : reconciled?.status === "REVOKED";
      if (completed) consentCommandKeyRef.current = null;
      else setConsentMessage(message);
    } finally {
      consentCommandInFlightRef.current = false;
      setConsentPending(null);
    }
  }, [consent, loadConsent]);

  const consentUi = consent ? consentPresentation[consent.status] : null;
  const canConfirmConsent = Boolean(
    consent?.canGrant
    && adultSelfAttested
    && likenessAuthorized
    && retentionAcknowledged,
  );

  return <>
    <button
      aria-controls="studio-settings-centre"
      aria-expanded={open}
      aria-label="Profile & settings — Lulu’s Studio spaces"
      className="studio-settings-trigger studio-profile-orb"
      onClick={(event) => { setReturnFocus(event.currentTarget); setOpen(true); }}
      type="button"
    >
      <LuluProfileAvatar online />
    </button>
    <StudioTaskSheet
      className="studio-settings-sheet studio-profile-sheet"
      onDismiss={() => setOpen(false)}
      open={open}
      returnFocus={returnFocus}
      title="Lulu’s Studio"
    >
      <div className="studio-settings-centre" id="studio-settings-centre">
        <section className="studio-settings-identity studio-profile-card" aria-labelledby="studio-profile-name">
          <LuluProfileAvatar />
          <div><small>{operator?.role === "admin" ? "Studio admin" : "Studio operator"}</small><h3 id="studio-profile-name">{displayName}</h3><p>{operator?.email ?? "Local Studio preview"}</p></div>
          <ShieldCheck aria-label="Authenticated private workspace" size={19} />
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-appearance-title">
          <div className="studio-settings-heading"><span><Sparkles aria-hidden="true" size={18} /></span><h3 id="studio-appearance-title">Appearance</h3></div>
          <div className="studio-settings-group"><ThemeSettings /></div>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-workspace-title">
          <div className="studio-settings-heading"><span><Database aria-hidden="true" size={18} /></span><h3 id="studio-workspace-title">Workspace</h3></div>
          <div className="studio-settings-group">
            <div className="studio-settings-status-list">
              <div><span><Cloud aria-hidden="true" size={17} /><span><strong>AI intake</strong><small>Private server drafts</small></span></span><Check aria-label="Available" size={17} /></div>
              <div><span><Database aria-hidden="true" size={17} /><span><strong>Workspace</strong><small>{studio.scenario ? "Read-only scenario" : workspaceAvailable ? "Connected Studio record" : "Live state unavailable"}</small></span></span><b data-tone={workspaceAvailable ? "positive" : "critical"}>{workspaceAvailable ? "Ready" : "Check"}</b></div>
              <div><span><ShieldCheck aria-hidden="true" size={17} /><span><strong>Atelier authorization</strong><small>{consentLoading && !consent ? "Checking durable authority…" : consentMessage && !consent ? "Authorization unavailable" : consentUi?.detail ?? "Open once to check"}</small></span></span><button className="button button-secondary" data-tone={consentUi?.tone ?? "neutral"} disabled={consentLoading && !consent} onClick={(event) => { setConsentReturnFocus(event.currentTarget); setConsentOpen(true); }} type="button">{consentLoading && !consent ? "Checking…" : consentUi?.label ?? "Review"}</button></div>
            </div>
          </div>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-help-title">
          <div className="studio-settings-heading"><span><BookOpen aria-hidden="true" size={18} /></span><h3 id="studio-help-title">Help</h3></div>
          <div className="studio-settings-group studio-settings-help-group">
            <Link className="studio-settings-link" href="/studio/wardrobe?guide=1"><span><BookOpen aria-hidden="true" size={18} /><span><strong>Garment intake guide</strong><small>Five visual steps</small></span></span><ChevronRight aria-hidden="true" size={17} /></Link>
            <PwaInstallControl />
          </div>
        </section>

        {operator ? <button
          className="studio-settings-signout"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await authClient.signOut();
            assignDocumentNavigation("/auth/sign-in?returnTo=/studio");
          }}
          type="button"
        ><LogOut aria-hidden="true" size={17} />{signingOut ? "Signing out…" : "Sign out"}</button> : null}
        <p className="studio-settings-boundary"><Settings aria-hidden="true" size={13} />Preferences stay on this device. Atelier authorization is a durable server record.</p>
      </div>
    </StudioTaskSheet>
    <StudioTaskSheet
      busy={Boolean(consentPending)}
      busyLabel={consentPending === "REVOKE" ? "Revoking future Atelier use" : "Saving Atelier authorization"}
      eyebrow="Private provider authority"
      onDismiss={() => setConsentOpen(false)}
      onSubmit={consent?.canRevoke
        ? (event) => { event.preventDefault(); void runConsentCommand("REVOKE"); }
        : consent?.canGrant
          ? (event) => { event.preventDefault(); if (canConfirmConsent) void runConsentCommand("GRANT"); }
          : undefined}
      open={consentOpen}
      returnFocus={consentReturnFocus}
      title="Atelier authorization"
    >
      <section className="studio-task-question">
        {consentLoading && !consent ? <><h3>Checking durable authority…</h3><p>No generation can start from Settings.</p></> : null}
        {consent?.status === "VERIFICATION_REQUIRED" ? <><h3>Trusted verification is still required</h3><p>No authorization has been recorded. A separate trusted adult-verification receipt must bind Lulu and the locked Lulu V4 authority before this form can save consent.</p></> : null}
        {consent?.status === "ACTIVE" ? <><h3>Authorization is active</h3><p>Future private Atelier processing is authorized under provider policy {consent.providerPolicyRevision}. Revoking blocks new provider use; it does not recall already-started processing, erase audit records, or alter approved locked outputs.</p></> : null}
        {consent && consent.status !== "ACTIVE" && consent.canGrant ? <>
          <h3>Confirm once for future private Atelier work</h3>
          <p>This form records Lulu’s affirmation only after independent adult verification already exists.</p>
          {consent.affirmations.map((affirmation, index) => {
            const checked = index === 0 ? adultSelfAttested : index === 1 ? likenessAuthorized : retentionAcknowledged;
            const setChecked = index === 0 ? setAdultSelfAttested : index === 1 ? setLikenessAuthorized : setRetentionAcknowledged;
            const inputId = `atelier-consent-affirmation-${index}`;
            return <label className="studio-settings-switch studio-field-wide" htmlFor={inputId} key={affirmation}><span><strong>{index === 0 ? "Adult affirmation" : index === 1 ? "Likeness authority" : "Provider retention"}</strong><small>{affirmation}</small></span><input aria-label={affirmation} checked={checked} disabled={Boolean(consentPending)} id={inputId} onChange={(event) => setChecked(event.target.checked)} type="checkbox" /><i aria-hidden="true"><b /></i></label>;
          })}
          <p><small>{consent.providerNotice}</small></p>
        </> : null}
        {consent?.status === "REVOKED" && !consent.canGrant ? <><h3>Future provider use is revoked</h3><p>A new trusted verification record is required before authorization can be recorded again.</p></> : null}
        {consentMessage ? <p className="studio-engine-error" role="status">{consentMessage}</p> : null}
      </section>
      <footer className="studio-task-sheet-footer">
        <button className="button button-secondary" disabled={Boolean(consentPending)} onClick={() => setConsentOpen(false)} type="button">{consent?.canGrant || consent?.canRevoke ? "Cancel" : "Done"}</button>
        {consent?.canRevoke ? <button className="button button-primary is-destructive" disabled={Boolean(consentPending)} type="submit">{consentPending === "REVOKE" ? "Revoking…" : "Revoke future use"}</button> : null}
        {consent?.canGrant ? <button className="button button-primary" disabled={!canConfirmConsent || Boolean(consentPending)} type="submit">{consentPending === "GRANT" ? "Saving…" : "Confirm authorization"}</button> : null}
      </footer>
    </StudioTaskSheet>
  </>;
}
