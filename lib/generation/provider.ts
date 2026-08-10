import type { Generation, ShootPreset } from "../data/types";

export interface FashionGenerationInput {
  identityVersion: string;
  garmentVersion: string;
  preset: ShootPreset;
  pose: string;
  crop: string;
  output: string;
}

export interface FashionGenerationResult {
  generationId: string;
  status: "QUEUED" | "GENERATING" | "COMPLETE" | "FAILED";
  assets: Generation[];
  metadata: Record<string, string | number | boolean>;
}

export interface FashionGenerationProvider {
  generate(input: FashionGenerationInput): Promise<FashionGenerationResult>;
}
