"use client";

import { useRef, useState } from "react";
import {
  Bell,
  BellRing,
  Camera,
  ChevronRight,
  Clock3,
  MapPin,
  PackageCheck,
  RotateCcw,
  Shirt,
  Users,
} from "lucide-react";
import type { StudioAuthorityNotification } from "../../../lib/studio/services/studio-authority-client";
import { useStudioPreferences } from "../../../hooks/studio/use-studio-preferences";
import { StudioLink as Link } from "../atoms/studio-link";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";
import { useStudio } from "../studio-provider";

const icons: Record<StudioAuthorityNotification["kind"], React.ComponentType<{ "aria-hidden"?: boolean; size?: number }>> = {
  HOLD: Clock3,
  LOCATION: MapPin,
  MEDIA: Camera,
  MODEL: Users,
  ORDER: PackageCheck,
  PUBLISHING: Shirt,
  RETURN: RotateCcw,
  WARDROBE: Shirt,
};

export function StudioNotificationCenter() {
  const { authority } = useStudio();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [returnFocus, setReturnFocus] = useState<HTMLButtonElement | null>(null);
  const { showUpdateCount } = useStudioPreferences();
  const notifications = authority.snapshot?.notifications ?? [];
  const unresolvedCount = notifications.length;

  return <>
    <button aria-controls="studio-notification-centre" aria-expanded={open} aria-label={unresolvedCount ? `Updates, ${unresolvedCount} unresolved` : "Updates"} className="studio-notification-trigger" onClick={(event) => { setReturnFocus(event.currentTarget); setOpen(true); }} ref={triggerRef} type="button">
      {unresolvedCount ? <BellRing aria-hidden="true" size={18} /> : <Bell aria-hidden="true" size={18} />}
      {unresolvedCount && showUpdateCount ? <b aria-hidden="true">{Math.min(9, unresolvedCount)}</b> : null}
    </button>
    <StudioTaskSheet className="studio-notification-sheet" eyebrow="Live Studio" onDismiss={() => setOpen(false)} open={open} returnFocus={returnFocus} title="Updates">
      <section className="studio-notification-centre" id="studio-notification-centre">
        <div className="studio-notification-summary"><span><small>To do</small><strong>{unresolvedCount}</strong></span></div>
        {authority.status === "error" ? <div className="studio-notification-empty" role="alert"><Bell aria-hidden="true" size={28} /><strong>Updates unavailable</strong><p>{authority.error}</p><button className="button button-secondary" onClick={() => void authority.refresh()} type="button">Try again</button></div> : null}
        {authority.status === "ready" && notifications.length ? <div aria-label="Studio updates" className="studio-notification-list">{notifications.map((notification) => {
          const Icon = icons[notification.kind];
          return <Link className="is-unread" data-tone={notification.tone} href={notification.href} key={notification.id} onClick={() => { void authority.dismissNotification(notification.id).catch(() => undefined); }}><span className="studio-notification-icon"><Icon aria-hidden={true} size={19} /></span><span><strong>{notification.title}</strong><small>{notification.detail}</small></span><span className="studio-notification-action">{notification.actionLabel}<ChevronRight aria-hidden="true" size={14} /></span></Link>;
        })}</div> : null}
        {authority.status === "ready" && !notifications.length ? <div className="studio-notification-empty"><Bell aria-hidden="true" size={28} /><strong>You’re caught up.</strong><p>New work will appear here.</p></div> : null}
        <p className="studio-notification-boundary">Opening an update clears it across Studio devices</p>
      </section>
      <span aria-live="polite" className="sr-only">{unresolvedCount ? `${unresolvedCount} unresolved Studio update${unresolvedCount === 1 ? "" : "s"}` : "No unresolved Studio updates"}</span>
    </StudioTaskSheet>
  </>;
}
