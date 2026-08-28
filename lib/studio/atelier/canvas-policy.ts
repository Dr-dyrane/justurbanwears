export const STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION =
  "juw.atelier-native-room-canvas.v1" as const;

export const STUDIO_ATELIER_PROVIDER_CANVAS = Object.freeze({
  width: 1024,
  height: 1536,
} as const);

export const STUDIO_ATELIER_NATIVE_4X5_GUARD_PIXELS = 16 as const;

export type StudioAtelierRoomCanvasProfile = Readonly<{
  profileId:
    | "atelier-room-native-2x3-v1"
    | "atelier-room-native-4x5-center-window-v1";
  policyRevision: typeof STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION;
  roomCanvas: Readonly<{ width: number; height: number }>;
  subjectWindow: Readonly<{
    left: number;
    top: number;
    width: number;
    height: number;
  }>;
  transparentGuardPixels: number;
}>;

const PROFILES = Object.freeze([
  Object.freeze({
    profileId: "atelier-room-native-2x3-v1",
    policyRevision: STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
    roomCanvas: Object.freeze({ width: 1024, height: 1536 }),
    subjectWindow: Object.freeze({ left: 0, top: 0, width: 1024, height: 1536 }),
    transparentGuardPixels: 0,
  }),
  Object.freeze({
    profileId: "atelier-room-native-4x5-center-window-v1",
    policyRevision: STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
    roomCanvas: Object.freeze({ width: 1024, height: 1280 }),
    subjectWindow: Object.freeze({ left: 0, top: 128, width: 1024, height: 1280 }),
    transparentGuardPixels: STUDIO_ATELIER_NATIVE_4X5_GUARD_PIXELS,
  }),
] as const satisfies readonly StudioAtelierRoomCanvasProfile[]);

export const STUDIO_ATELIER_SUPPORTED_ROOM_CANVAS_PROFILES = PROFILES;

export const STUDIO_ATELIER_NATIVE_ROOM_COMPOSITE_POLICY = Object.freeze({
  canvasPolicyRevision: STUDIO_ATELIER_ROOM_CANVAS_POLICY_REVISION,
  pixelMapping: "EXACT_1_TO_1_WINDOW_COPY" as const,
  roomPixelsGenerated: 0 as const,
  supportedRoomProfiles: Object.freeze(PROFILES.map((profile) => Object.freeze({
    profileId: profile.profileId,
    roomCanvas: profile.roomCanvas,
    subjectWindow: profile.subjectWindow,
    transparentGuardPixels: profile.transparentGuardPixels,
  }))) as unknown as readonly [
    {
      profileId: "atelier-room-native-2x3-v1";
      roomCanvas: { width: 1024; height: 1536 };
      subjectWindow: { left: 0; top: 0; width: 1024; height: 1536 };
      transparentGuardPixels: 0;
    },
    {
      profileId: "atelier-room-native-4x5-center-window-v1";
      roomCanvas: { width: 1024; height: 1280 };
      subjectWindow: { left: 0; top: 128; width: 1024; height: 1280 };
      transparentGuardPixels: 16;
    },
  ],
});

/**
 * Resolves only explicitly qualified native-room canvases. This is
 * intentionally not a percentage tolerance: every accepted profile defines
 * an exact, reproducible provider-to-room pixel mapping.
 */
export function resolveStudioAtelierRoomCanvasProfile(input: Readonly<{
  width: number;
  height: number;
}>): StudioAtelierRoomCanvasProfile | null {
  return PROFILES.find((profile) =>
    profile.roomCanvas.width === input.width
    && profile.roomCanvas.height === input.height
  ) ?? null;
}
