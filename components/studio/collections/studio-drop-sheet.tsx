"use client";

import { useMemo } from "react";
import { Archive, Check, ChevronRight, CircleDot } from "lucide-react";
import type { StudioCollectionScope } from "../../../lib/studio/application/contracts";
import type { StudioCollectionReceipt } from "../../../lib/studio/collections/contracts";
import { StudioFeedback } from "../atoms/studio-feedback";
import { StudioTaskSheet } from "../atoms/studio-task-sheet";

type AppliedDropChange = {
  collections: StudioCollectionScope[];
  receipt: StudioCollectionReceipt;
};

export interface StudioDropSheetProps {
  allCount: number;
  archivedCount: number;
  collections: readonly StudioCollectionScope[];
  initialAction?: "create" | "manage";
  initialCollectionId?: string | null;
  onApplied(change: AppliedDropChange): void;
  onDismiss(): void;
  onSelect(key: string): void;
  open: boolean;
  privateCount: number;
  returnFocus?: HTMLElement | null;
  scenario: boolean;
  selectedKey: string;
  unassignedCount: number;
}

function stateLabel(collection: StudioCollectionScope) {
  if (collection.state === "ACTIVE") return "Live";
  if (collection.state === "DRAFT") return "Draft";
  if (collection.key === "drop-01") return "Sold out";
  return "Archived";
}

export function StudioDropSheet({
  allCount,
  archivedCount,
  collections,
  initialAction,
  onDismiss,
  onSelect,
  open,
  privateCount,
  returnFocus,
  scenario,
  selectedKey,
  unassignedCount,
}: StudioDropSheetProps) {
  const ordered = useMemo(
    () => [...collections].sort((left, right) => Number(right.isCurrent) - Number(left.isCurrent) || right.ordinal - left.ordinal),
    [collections],
  );

  return (
    <StudioTaskSheet
      className="studio-drop-sheet"
      eyebrow={scenario ? "Scenario preview" : undefined}
      onDismiss={onDismiss}
      open={open}
      returnFocus={returnFocus}
      title="Browse drops"
    >
      {initialAction ? (
        <StudioFeedback
          detail="Drop 02 stays active and Drop 01 stays archived. New drops and collection changes are unavailable."
          state="error"
          title="Collection unchanged"
        />
      ) : null}

      <div className="studio-drop-list">
        <button className="studio-drop-context-row" onClick={() => onSelect("all")} type="button">
          <span aria-hidden="true" className="studio-drop-ordinal">∞</span>
          <span className="studio-drop-row-copy"><strong>All pieces</strong><small>{allCount} total</small></span>
          {selectedKey === "all" ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
        </button>
        {ordered.map((collection) => (
          <div className="studio-drop-row" data-read-only="true" data-state={collection.state.toLowerCase()} key={collection.id}>
            <button className="studio-drop-row-main" onClick={() => onSelect(collection.key)} type="button">
              <span aria-hidden="true" className="studio-drop-ordinal">{String(collection.ordinal).padStart(2, "0")}</span>
              <span className="studio-drop-row-copy">
                <strong>{collection.label}</strong>
                <small><CircleDot aria-hidden="true" size={10} />{stateLabel(collection)} · {collection.counts.pieces ?? "—"} pieces</small>
              </span>
              {selectedKey === collection.key ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
            </button>
          </div>
        ))}
        {unassignedCount > 0 ? (
          <button className="studio-drop-context-row" onClick={() => onSelect("unassigned")} type="button">
            <span aria-hidden="true" className="studio-drop-ordinal">?</span>
            <span className="studio-drop-row-copy"><strong>Unassigned</strong><small>{unassignedCount} published piece{unassignedCount === 1 ? "" : "s"}</small></span>
            {selectedKey === "unassigned" ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
          </button>
        ) : null}
        <button className="studio-drop-context-row" onClick={() => onSelect("private")} type="button">
          <span aria-hidden="true" className="studio-drop-ordinal">P</span>
          <span className="studio-drop-row-copy"><strong>Private</strong><small>{privateCount} pieces</small></span>
          {selectedKey === "private" ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
        </button>
        <button className="studio-drop-context-row" onClick={() => onSelect("archived")} type="button">
          <span aria-hidden="true" className="studio-drop-ordinal"><Archive size={17} strokeWidth={1.7} /></span>
          <span className="studio-drop-row-copy"><strong>Archived</strong><small>{archivedCount} piece{archivedCount === 1 ? "" : "s"}</small></span>
          {selectedKey === "archived" ? <Check aria-label="Selected" size={17} /> : <ChevronRight aria-hidden="true" size={17} />}
        </button>
      </div>
    </StudioTaskSheet>
  );
}
