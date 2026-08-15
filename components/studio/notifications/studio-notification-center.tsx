"use client";

import { useMemo, useRef, useState } from "react";
import { Bell, BellRing, ChevronRight, CloudOff, PackageCheck, RotateCcw, Shirt, Sparkles, Users } from "lucide-react";
import type { StudioNotificationKind } from "../../../lib/studio/notifications";
import { deriveStudioNotifications } from "../../../lib/studio/notifications";
import { useStudioPreferences } from "../../../hooks/studio/use-studio-preferences";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

const icons: Record<StudioNotificationKind, React.ComponentType<{ "aria-hidden"?: boolean; size?: number }>> = { PERSISTENCE: CloudOff, MODEL: Users, WARDROBE: Shirt, PUBLISHING: Sparkles, ORDER: PackageCheck, RETURN: RotateCcw };

export function StudioNotificationCenter() {
  const studio = useStudio();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const { showUpdateCount } = useStudioPreferences();
  const notifications = useMemo(() => deriveStudioNotifications(studio), [studio]);
  const unresolvedCount = notifications.length;

  return <>
    <button aria-controls="studio-notification-centre" aria-expanded={open} aria-label={unresolvedCount ? `Updates, ${unresolvedCount} unresolved` : "Updates"} className="studio-notification-trigger" onClick={(event) => { setReturnFocus(event.currentTarget); setOpen(true); }} ref={triggerRef} type="button">
      {unresolvedCount ? <BellRing aria-hidden="true" size={18} /> : <Bell aria-hidden="true" size={18} />}
      {unresolvedCount && showUpdateCount ? <b aria-hidden="true">{Math.min(9, unresolvedCount)}</b> : null}
    </button>
    <StudioTaskSheet className="studio-notification-sheet" eyebrow="Studio activity" onDismiss={() => setOpen(false)} open={open} returnFocus={returnFocus} title="Updates">
      <section className="studio-notification-centre" id="studio-notification-centre">
        <div className="studio-notification-summary"><span><small>To do</small><strong>{unresolvedCount}</strong></span></div>
        {notifications.length ? <div aria-label="Studio updates" className="studio-notification-list">{notifications.map((notification) => {
          const Icon = icons[notification.kind];
          return <Link className="is-unread" data-tone={notification.tone} href={notification.href} key={notification.id}><span className="studio-notification-icon"><Icon aria-hidden={true} size={19} /></span><span><strong>{notification.title}</strong><small>{notification.detail}</small></span><span className="studio-notification-action">{notification.actionLabel}<ChevronRight aria-hidden="true" size={14} /></span></Link>;
        })}</div> : <div className="studio-notification-empty"><Bell aria-hidden="true" size={28} /><strong>You’re caught up.</strong><p>New work will appear here.</p></div>}
        <p className="studio-notification-boundary">Updates from this workspace</p>
      </section>
      <span aria-live="polite" className="sr-only">{unresolvedCount ? `${unresolvedCount} unresolved Studio update${unresolvedCount === 1 ? "" : "s"}` : "No unresolved Studio updates"}</span>
    </StudioTaskSheet>
  </>;
}
