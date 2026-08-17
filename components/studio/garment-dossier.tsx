"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { ArrowLeft, PackageOpen } from "lucide-react";
import { StudioLink } from "./atoms/studio-link";
import { WearSheet } from "./garment-intake/wear-sheet";
import { StudioMediaViewerProvider } from "./media-viewer";
import { useStudio } from "./studio-provider";
import { PieceWorkspaceView } from "./wardrobe-workbench";

export function GarmentDossier() {
  const params = useParams<{ id: string }>();
  const studio = useStudio();
  const [wearWardrobeItemId, setWearWardrobeItemId] = useState<string | null>(null);
  const requestedId = decodeURIComponent(String(params.id ?? ""));
  const garment = studio.garments.find((candidate) =>
    candidate.id === requestedId || candidate.privateWardrobeItemId === requestedId
  );
  if (studio.hydration === "idle" || studio.hydration === "restoring") {
    return <div className="studio-loading" role="status">Opening piece…</div>;
  }

  if (!garment) {
    return (
      <section className="studio-dossier-empty">
        <PackageOpen aria-hidden="true" size={32} strokeWidth={1.4} />
        <p className="eyebrow">Wardrobe</p>
        <h1>Piece not found.</h1>
        <p>It may have moved or no longer belongs to this Studio.</p>
        <StudioLink className="button button-primary" href="/studio/wardrobe">Open wardrobe</StudioLink>
      </section>
    );
  }

  return (
    <StudioMediaViewerProvider>
      <article className="studio-dossier-page">
        <StudioLink className="studio-dossier-back" href="/studio/wardrobe">
          <ArrowLeft aria-hidden="true" size={17} />Wardrobe
        </StudioLink>
        <PieceWorkspaceView
          garment={garment}
          onDismiss={() => window.location.assign("/studio/wardrobe")}
          onContinueMedia={(piece) => setWearWardrobeItemId(piece.privateWardrobeItemId ?? null)}
        />
        {wearWardrobeItemId ? (
          <WearSheet
            onDismiss={() => setWearWardrobeItemId(null)}
            open
            wardrobeItemId={wearWardrobeItemId}
          />
        ) : null}
      </article>
    </StudioMediaViewerProvider>
  );
}
