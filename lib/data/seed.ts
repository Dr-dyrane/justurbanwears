import { createEmptyStudioSnapshot } from "../studio/domain/state";

// Kept as a compatibility export for the existing creative routes. The local
// repository is authoritative after hydration; this seed contains no sources.
export const seedState = createEmptyStudioSnapshot();
