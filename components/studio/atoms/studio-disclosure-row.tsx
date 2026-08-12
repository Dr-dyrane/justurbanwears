"use client";

import { Check, ChevronRight } from "lucide-react";

interface StudioDisclosureRowProps {
  detail?: string;
  icon: React.ReactNode;
  label: string;
  onClick(): void;
  selected?: boolean;
  value?: string;
}

export function StudioDisclosureRow({
  detail,
  icon,
  label,
  onClick,
  selected = false,
  value,
}: StudioDisclosureRowProps) {
  return (
    <button
      aria-pressed={selected || undefined}
      className={`studio-disclosure-row${selected ? " is-selected" : ""}`}
      onClick={onClick}
      type="button"
    >
      <span className="studio-disclosure-icon" aria-hidden="true">{icon}</span>
      <span className="studio-disclosure-copy">
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
      {value ? <span className="studio-disclosure-value">{value}</span> : null}
      {selected ? <Check aria-hidden="true" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
    </button>
  );
}
