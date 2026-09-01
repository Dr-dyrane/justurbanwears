"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import {
  BookOpen,
  ChevronRight,
  LogOut,
  ScanLine,
  ShieldCheck,
  Sparkles,
  Store,
  UsersRound,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { StudioOperatorClientProfile } from "../../../lib/server/studio-operator-projection";
import { PwaInstallControl } from "../../pwa/pwa-install-control";
import { ThemeSettings } from "../../theme/theme-settings";
import { assignDocumentNavigation } from "../../brand/document-navigation-loading-stage";
import {
  actionableStudioDraftCount,
  historicalDrop01Kind,
} from "../../../lib/studio/projections/piece-workspace";
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

export function StudioSettingsCenter({ operator }: { operator: StudioOperatorClientProfile | null }) {
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
  const authority = studio.authority.snapshot;
  const readyModels = authority?.models.filter((model) => model.state === "READY").length ?? null;
  const studioHeldPieces = authority?.pieces.filter((piece) => piece.expectedCustody === "STUDIO").length ?? null;
  const garmentsById = new Map(studio.garments.map((garment) => [garment.id, garment]));
  const scenarioLiveListings = studio.listings.filter((listing) => {
    if (listing.state !== "PUBLISHED" && listing.state !== "RESERVED") return false;
    const garment = garmentsById.get(listing.garmentId);
    return !garment || historicalDrop01Kind(garment) === null;
  }).length;
  const liveListings = studio.scenario
    ? scenarioLiveListings
    : studio.application.snapshot?.summary.live.value ?? null;
  const availableShopPieces = studio.application.snapshot?.summary.available.value ?? null;
  const intakeDrafts = studio.scenario
    ? actionableStudioDraftCount(studio.garments)
    : authority?.pieces.filter((piece) => piece.availability === "PRIVATE").length ?? null;

  const loadConsent = useCallback(async (): Promise<AtelierConsentStatus | null> => {
    consentReadControllerRef.current?.abort();
    const controller = new AbortController();
    consentReadControllerRef.current = controller;
    setConsentLoading(true);
    setConsentMessage(null);
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
        setConsentMessage(error instanceof Error ? error.message : "Atelier authorization status needs a refresh.");
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

  const canConfirmConsent = Boolean(
    consent?.canGrant
    && adultSelfAttested
    && likenessAuthorized
    && retentionAcknowledged,
  );
  const modelsSummary = readyModels === null
    ? "Model state unavailable"
    : `${readyModels} model${readyModels === 1 ? "" : "s"} ready`;
  const consentSummary = consentLoading && !consent
    ? "Checking authorization…"
    : consentMessage && !consent
      ? "Status needs a refresh"
      : consent?.status === "ACTIVE"
        ? "Authorized for future use"
        : consent?.status === "REVOKED"
          ? "Future use is blocked"
          : consent?.status === "RECONFIRMATION_REQUIRED"
            ? "Authorization needs review"
            : consent?.status === "VERIFICATION_REQUIRED"
              ? "Not authorized yet"
              : consent?.status === "NOT_RECORDED"
                ? "Ready to authorize"
                : operator ? "Authorization not checked" : "Local preview only";
  const stocktakeSummary = studioHeldPieces === null
    ? "Physical state unavailable"
    : `${studioHeldPieces} Studio-held piece${studioHeldPieces === 1 ? "" : "s"}`;
  const shopSummary = liveListings === null
    ? availableShopPieces === null
      ? "Shop state needs a refresh"
      : `${availableShopPieces} piece${availableShopPieces === 1 ? "" : "s"} available`
    : `${liveListings} live listing${liveListings === 1 ? "" : "s"}`;
  const intakeSummary = intakeDrafts === null
    ? "Draft state unavailable"
    : intakeDrafts
      ? `${intakeDrafts} draft${intakeDrafts === 1 ? " needs" : "s need"} intake`
      : "No intake drafts open";

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

        <section className="studio-settings-section" aria-labelledby="studio-identity-title">
          <div className="studio-settings-heading"><span><UsersRound aria-hidden="true" size={18} /></span><h3 id="studio-identity-title">Identity &amp; privacy</h3></div>
          <div className="studio-settings-group studio-settings-link-group">
            <Link className="studio-settings-link" href="/studio/models"><span><UsersRound aria-hidden="true" size={18} /><span><strong>Models &amp; identity</strong><small>{modelsSummary}</small></span></span><ChevronRight aria-hidden="true" size={17} /></Link>
            <button className="studio-settings-link" onClick={(event) => {
              setConsentReturnFocus(event.currentTarget);
              setConsentOpen(true);
              if (!consent && !consentLoading) void loadConsent();
            }} type="button"><span><ShieldCheck aria-hidden="true" size={18} /><span><strong>Private Atelier use</strong><small>{consentSummary}</small></span></span><ChevronRight aria-hidden="true" size={17} /></button>
          </div>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-tools-title">
          <div className="studio-settings-heading"><span><ScanLine aria-hidden="true" size={18} /></span><h3 id="studio-tools-title">Studio tools</h3></div>
          <div className="studio-settings-group studio-settings-link-group">
            <Link className="studio-settings-link" href="/studio/stocktake"><span><ScanLine aria-hidden="true" size={18} /><span><strong>Stocktake &amp; scan</strong><small>{stocktakeSummary}</small></span></span><ChevronRight aria-hidden="true" size={17} /></Link>
            <Link className="studio-settings-link" href="/shop"><span><Store aria-hidden="true" size={18} /><span><strong>View live Shop</strong><small>{shopSummary}</small></span></span><ChevronRight aria-hidden="true" size={17} /></Link>
          </div>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-help-title">
          <div className="studio-settings-heading"><span><BookOpen aria-hidden="true" size={18} /></span><h3 id="studio-help-title">Help</h3></div>
          <div className="studio-settings-group studio-settings-link-group">
            <Link className="studio-settings-link" href="/studio/wardrobe?guide=1"><span><BookOpen aria-hidden="true" size={18} /><span><strong>Garment intake guide</strong><small>{intakeSummary}</small></span></span><ChevronRight aria-hidden="true" size={17} /></Link>
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
        {consent?.status === "VERIFICATION_REQUIRED" ? <><h3>Private Atelier isn’t authorized yet</h3><p>This is a safeguard, not a service outage. Lulu’s identity verification must be recorded separately before this page can authorize future provider use.</p></> : null}
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
        {consentMessage && !consent && !consentLoading ? <><h3>Authorization status needs a refresh</h3><p className="studio-engine-error" role="status">We couldn’t refresh the durable record just now. Nothing has changed, and no Atelier work can start from Settings.</p></> : null}
        {consentMessage && consent ? <p className="studio-engine-error" role="status">{consentMessage}</p> : null}
      </section>
      <footer className="studio-task-sheet-footer">
        <button className="button button-secondary" disabled={Boolean(consentPending)} onClick={() => setConsentOpen(false)} type="button">{consent?.canGrant || consent?.canRevoke ? "Cancel" : "Done"}</button>
        {!consent && consentMessage && !consentLoading ? <button className="button button-primary" onClick={() => void loadConsent()} type="button">Try again</button> : null}
        {consent?.canRevoke ? <button className="button button-primary is-destructive" disabled={Boolean(consentPending)} type="submit">{consentPending === "REVOKE" ? "Revoking…" : "Revoke future use"}</button> : null}
        {consent?.canGrant ? <button className="button button-primary" disabled={!canConfirmConsent || Boolean(consentPending)} type="submit">{consentPending === "GRANT" ? "Saving…" : "Confirm authorization"}</button> : null}
      </footer>
    </StudioTaskSheet>
  </>;
}
