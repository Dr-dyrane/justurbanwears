import type { FashionGenerationInput, FashionGenerationProvider } from "./provider";

export const mockFashionProvider: FashionGenerationProvider = {
  async generate(input: FashionGenerationInput) {
    return {
      generationId: `mock-${Date.now()}`,
      status: "COMPLETE",
      assets: [],
      metadata: {
        provider: "konan/mock-v1",
        mocked: true,
        preset: input.preset,
      },
    };
  },
};
