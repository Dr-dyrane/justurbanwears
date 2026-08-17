"use client";

import { createAuthClient } from "@neondatabase/auth/next";
import {
  Bell,
  BookOpen,
  Camera,
  Check,
  ChevronRight,
  Cloud,
  Database,
  ExternalLink,
  LogOut,
  ScanLine,
  Settings,
  ShieldCheck,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import { useId, useState } from "react";
import { useStudioPreferences } from "../../../hooks/studio/use-studio-preferences";
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
  const updateCountId = useId();
  const { showUpdateCount, setShowUpdateCount } = useStudioPreferences();
  const displayName = operator?.displayName && operator.displayName !== operator.email
    ? operator.displayName
    : "Lulu";
  const avatarInitial = displayName.trim().slice(0, 1).toUpperCase() || "L";
  const workspaceAvailable = studio.persistence === "available";

  return <>
    <button
      aria-controls="studio-settings-centre"
      aria-expanded={open}
      aria-label="Lulu profile and Studio spaces"
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
      eyebrow="Studio"
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

        <section className="studio-settings-section studio-settings-spaces" aria-labelledby="studio-spaces-title">
          <div className="studio-settings-heading"><span><Sparkles aria-hidden="true" size={18} /></span><div><p className="eyebrow">Spaces</p><h3 id="studio-spaces-title">Everything else</h3></div></div>
          <nav className="studio-helper-stack" aria-label="Studio spaces and helpers">
            <Link href="/studio/models">
              <Users aria-hidden="true" size={19} />
              <span><strong>Models</strong><small>Identity, consent, and presentation.</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/studio/media">
              <Camera aria-hidden="true" size={19} />
              <span><strong>Media lab</strong><small>Private AI and Wear imagery.</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/studio/stocktake">
              <ScanLine aria-hidden="true" size={19} />
              <span><strong>Stocktake</strong><small>Confirm what is physically in hand.</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
            <Link href="/shop">
              <ExternalLink aria-hidden="true" size={19} />
              <span><strong>Open Shop</strong><small>See the public wardrobe.</small></span>
              <ChevronRight aria-hidden="true" size={17} />
            </Link>
          </nav>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-appearance-title">
          <div className="studio-settings-heading"><span><Sparkles aria-hidden="true" size={18} /></span><div><p className="eyebrow">Appearance</p><h3 id="studio-appearance-title">Choose the light</h3></div></div>
          <ThemeSettings />
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-alerts-title">
          <div className="studio-settings-heading"><span><Bell aria-hidden="true" size={18} /></span><div><p className="eyebrow">Updates</p><h3 id="studio-alerts-title">Attention badge</h3></div></div>
          <label className="studio-settings-switch" htmlFor={updateCountId}>
            <span><strong>Show update count</strong><small>Keep the number on the Updates button.</small></span>
            <input aria-label="Show update count" checked={showUpdateCount} id={updateCountId} onChange={(event) => setShowUpdateCount(event.target.checked)} type="checkbox" />
            <i aria-hidden="true"><b /></i>
          </label>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-workspace-title">
          <div className="studio-settings-heading"><span><Database aria-hidden="true" size={18} /></span><div><p className="eyebrow">Workspace</p><h3 id="studio-workspace-title">Data & access</h3></div></div>
          <div className="studio-settings-status-list">
            <div><span><Cloud aria-hidden="true" size={17} /><span><strong>AI intake</strong><small>Private server drafts</small></span></span><Check aria-label="Available" size={17} /></div>
            <div><span><Database aria-hidden="true" size={17} /><span><strong>Workspace</strong><small>{workspaceAvailable ? "Saved on this device" : "Saving unavailable"}</small></span></span><b data-tone={workspaceAvailable ? "positive" : "critical"}>{workspaceAvailable ? "Ready" : "Check"}</b></div>
          </div>
        </section>

        <section className="studio-settings-section" aria-labelledby="studio-help-title">
          <div className="studio-settings-heading"><span><BookOpen aria-hidden="true" size={18} /></span><div><p className="eyebrow">Help</p><h3 id="studio-help-title">Keep the steps close</h3></div></div>
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
