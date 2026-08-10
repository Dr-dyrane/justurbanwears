"use client";

import { createContext, useContext, useMemo, useState } from "react";
import { seedState } from "../../lib/data/seed";
import type {
  Garment,
  ModelReference,
  NewGarmentInput,
  NewShootInput,
  ReviewDecision,
  StudioState,
  VisualVariant,
} from "../../lib/data/types";

interface StudioContextValue extends StudioState {
  addGarment(input: NewGarmentInput): Garment;
  approveGarment(id: string): void;
  addIdentityReferences(references: ModelReference[]): void;
  createMockShoot(input: NewShootInput): string;
  reviewGeneration(
    generationId: string,
    decision: ReviewDecision,
    reasons: string[],
    note?: string,
  ): void;
  setHero(generationId: string): void;
}

const StudioContext = createContext<StudioContextValue | null>(null);

const visualCycle: VisualVariant[] = ["plum", "indigo", "moss", "chalk", "umber"];

export function StudioProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<StudioState>(seedState);

  const value = useMemo<StudioContextValue>(
    () => ({
      ...state,
      addGarment(input) {
        const id = `garment-${input.sku.toLowerCase()}-${Date.now()}`;
        const references: Garment["references"] = [
          input.hasFront && { id: `${id}-front`, view: "FRONT", quality: 86 },
          input.hasBack && { id: `${id}-back`, view: "BACK", quality: 84 },
          input.hasDetail && { id: `${id}-detail`, view: "DETAIL", quality: 82 },
        ].filter(Boolean) as Garment["references"];
        const garment: Garment = {
          id,
          sku: input.sku,
          title: input.title,
          category: input.category,
          sizeLabel: input.sizeLabel,
          estimatedFit: input.estimatedFit,
          color: input.color,
          price: input.price,
          condition: input.condition,
          brand: input.brand,
          source: input.source,
          notes: input.notes,
          availability: "AVAILABLE",
          canonState: "REVIEW",
          visual: visualCycle[state.garments.length % visualCycle.length],
          references,
        };
        setState((current) => ({ ...current, garments: [garment, ...current.garments] }));
        return garment;
      },
      approveGarment(id) {
        setState((current) => ({
          ...current,
          garments: current.garments.map((garment) =>
            garment.id === id ? { ...garment, canonState: "APPROVED" } : garment,
          ),
        }));
      },
      addIdentityReferences(references) {
        setState((current) => ({
          ...current,
          identity: {
            ...current.identity,
            references: [...references, ...current.identity.references],
            completeness: Math.min(92, current.identity.completeness + references.length * 4),
          },
        }));
      },
      createMockShoot(input) {
        const sequence = state.shoots.length + 1;
        const shootId = `SHOOT-${String(sequence).padStart(3, "0")}`;
        const palette: VisualVariant[] =
          input.preset === "LAGOS STREET"
            ? ["lagos-dusk", "indigo", "umber"]
            : input.preset === "CASUAL MIRROR"
              ? ["mirror", "chalk", "plum"]
              : ["studio", "umber", "plum"];
        const generations = ["Front", "Three-quarter", "Detail"].map((label, index) => ({
          id: `gen-${Date.now()}-${index}`,
          shootId,
          label,
          visual: palette[index],
          identityMatch: 86 + index * 2,
          garmentMatch: 91 + index,
          review: { decision: "PENDING" as const, reasons: [] },
          isHero: false,
        }));
        setState((current) => ({
          ...current,
          shoots: [
            {
              id: shootId,
              garmentId: input.garmentId,
              identityVersion: current.identity.version,
              preset: input.preset,
              pose: input.pose,
              crop: input.crop,
              outputFormat: input.outputFormat,
              generationEngine: "konan/mock-v1",
              generationConfiguration: {
                mocked: true,
                seed: Date.now() % 10000,
                guidance: 7.4,
              },
              createdAt: "Just now",
              generations,
            },
            ...current.shoots,
          ],
        }));
        return shootId;
      },
      reviewGeneration(generationId, decision, reasons, note) {
        setState((current) => ({
          ...current,
          shoots: current.shoots.map((shoot) => ({
            ...shoot,
            generations: shoot.generations.map((generation) =>
              generation.id === generationId
                ? {
                    ...generation,
                    review: {
                      decision,
                      reasons,
                      note,
                      reviewedAt: "Just now",
                    },
                  }
                : generation,
            ),
          })),
        }));
      },
      setHero(generationId) {
        setState((current) => ({
          ...current,
          shoots: current.shoots.map((shoot) => ({
            ...shoot,
            generations: shoot.generations.map((generation) => ({
              ...generation,
              isHero: generation.id === generationId,
            })),
          })),
          garments: current.garments.map((garment) => ({
            ...garment,
            heroGenerationId:
              current.shoots
                .flatMap((shoot) => shoot.generations)
                .some((generation) =>
                  generation.id === generationId &&
                  current.shoots.find((shoot) => shoot.id === generation.shootId)?.garmentId ===
                    garment.id
                )
                ? generationId
                : garment.heroGenerationId,
          })),
        }));
      },
    }),
    [state],
  );

  return <StudioContext.Provider value={value}>{children}</StudioContext.Provider>;
}

export function useStudio() {
  const context = useContext(StudioContext);
  if (!context) throw new Error("useStudio must be used within StudioProvider");
  return context;
}
