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
  UserRound,
} from "lucide-react";
import { useState } from "react";
import type { StudioOperator } from "../../../lib/server/studio-operator";
import { PwaInstallControl } from "../../pwa/pwa-install-control";
import { ThemeSettings } from "../../theme/theme-settings";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

const authClient = createAuthClient();

export function StudioSettingsCenter({ operator }: { operator: StudioOperator | null }) {
  const studio = useStudio();
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const [signingOut, setSigningOut] = useState(false);
  const displayName = operator?.displayName && operator.displayName !== operator.email
    ? operator.displayName
    : "Lulu";
  const avatarInitial = displayName.trim().slice(0, 1).toUpperCase() || "L";
  const workspaceAvailable = studio.scenario ? true : studio.authority.status === "ready";

  return <>
    <button
      aria-controls="studio-settings-centre"
      aria-expanded={open}
      aria-label="Profile & settings — Lulu’s Studio spaces"
      className="studio-settings-trigger studio-profile-orb"
      onClick={(event) => { setReturnFocus(event.currentTarget); setOpen(true); }}
      type="button"
    >
      <UserRound aria-hidden="true" className="studio-profile-orb-desktop" size={18} />
      <span aria-hidden="true" className="studio-profile-orb-mobile">
        <b>{avatarInitial}</b>
        <i />
      </span>
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
          <span aria-hidden="true" className="studio-profile-card-avatar">{avatarInitial}</span>
          <div><small>{operator?.role === "admin" ? "Studio admin" : "Studio operator"}</small><h3 id="studio-profile-name">{displayName}</h3><p>{operator?.email ?? "Local Studio preview"}</p></div>
          <ShieldCheck aria-label="Authenticated private workspace" size={19} />
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-appearance-title">
          <div className="studio-settings-heading"><span><Sparkles aria-hidden="true" size={18} /></span><h3 id="studio-appearance-title">Appearance</h3></div>
          <ThemeSettings />
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-workspace-title">
          <div className="studio-settings-heading"><span><Database aria-hidden="true" size={18} /></span><h3 id="studio-workspace-title">Workspace</h3></div>
          <div className="studio-settings-status-list">
            <div><span><Cloud aria-hidden="true" size={17} /><span><strong>AI intake</strong><small>Private server drafts</small></span></span><Check aria-label="Available" size={17} /></div>
            <div><span><Database aria-hidden="true" size={17} /><span><strong>Workspace</strong><small>{studio.scenario ? "Read-only scenario" : workspaceAvailable ? "Connected Studio record" : "Live state unavailable"}</small></span></span><b data-tone={workspaceAvailable ? "positive" : "critical"}>{workspaceAvailable ? "Ready" : "Check"}</b></div>
          </div>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-help-title">
          <div className="studio-settings-heading"><span><BookOpen aria-hidden="true" size={18} /></span><h3 id="studio-help-title">Help</h3></div>
          <Link className="studio-settings-link" href="/studio/wardrobe?guide=1"><span><BookOpen aria-hidden="true" size={18} /><span><strong>Garment intake guide</strong><small>Five visual steps</small></span></span><ChevronRight aria-hidden="true" size={17} /></Link>
          <PwaInstallControl />
        </section>

        {operator ? <button
          className="studio-settings-signout"
          disabled={signingOut}
          onClick={async () => {
            setSigningOut(true);
            await authClient.signOut();
            window.location.assign("/auth/sign-in?returnTo=/studio");
          }}
          type="button"
        ><LogOut aria-hidden="true" size={17} />{signingOut ? "Signing out…" : "Sign out"}</button> : null}
        <p className="studio-settings-boundary"><Settings aria-hidden="true" size={13} />Preferences stay on this device.</p>
      </div>
    </StudioTaskSheet>
  </>;
}
