"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { PackageOpen } from "lucide-react";
import { StudioLoadingStage } from "./atoms/studio-loading-stage";
import { StudioLink } from "./atoms/studio-link";
import { StudioStackPage } from "./atoms/studio-stack-page";
import { WearSheet } from "./garment-intake/wear-sheet";
import { GarmentSetBuilder } from "./garment-set-builder";
import { StudioMediaViewerProvider } from "./media-viewer";
import { useStudio } from "./studio-provider";
import { PieceWorkspaceView } from "./wardrobe-workbench";
import { studioScenarioHref } from "../../lib/studio/simulator";

export function GarmentDossier() {
  const params = useParams<{ id: string }>();
  const searchParams = useSearchParams();
  const studio = useStudio();
  const [setWardrobeItemId, setSetWardrobeItemId] = useState<string | null>(null);
  const [wearWardrobeItemId, setWearWardrobeItemId] = useState<string | null>(null);
  const requestedId = decodeURIComponent(String(params.id ?? ""));
  const garment = studio.garments.find((candidate) =>
    candidate.id === requestedId || candidate.privateWardrobeItemId === requestedId
  );
  if (studio.hydration === "idle" || studio.hydration === "restoring") {
    return <StudioLoadingStage label="Opening piece…" />;
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
      <StudioStackPage className="studio-dossier-page" kind="record">
        <PieceWorkspaceView
          garment={garment}
          initialAction={searchParams.get("action") === "price" ? "price" : undefined}
          onBuildSet={(piece) => setSetWardrobeItemId(piece.privateWardrobeItemId ?? null)}
          onDismiss={() => window.location.assign(studioScenarioHref("/studio/wardrobe", studio.scenario))}
          onContinueMedia={(piece) => setWearWardrobeItemId(piece.privateWardrobeItemId ?? null)}
        />
        {setWardrobeItemId ? (
          <GarmentSetBuilder
            onDismiss={() => setSetWardrobeItemId(null)}
            open
            wardrobeItemId={setWardrobeItemId}
          />
        ) : null}
        {wearWardrobeItemId ? (
          <WearSheet
            onDismiss={() => setWearWardrobeItemId(null)}
            open
            wardrobeItemId={wearWardrobeItemId}
          />
        ) : null}
      </StudioStackPage>
    </StudioMediaViewerProvider>
  );
}
