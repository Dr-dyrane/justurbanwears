export const WARDROBE_MOTION_VARIANTS = [
  "loader",
  "footer",
  "404",
  "empty",
  "success",
  "entrance",
  "ambient",
] as const;

export type WardrobeMotionVariant = (typeof WARDROBE_MOTION_VARIANTS)[number];
export type WardrobeMotionSize = "sm" | "md" | "lg";
export type WardrobeMotionPolarity = "light" | "dark";
export type WardrobeMotionPreference = "auto" | "reduced";

export type WardrobeMotionProps = {
  className?: string;
  label?: string;
  loop?: boolean;
  motion?: WardrobeMotionPreference;
  polarity?: WardrobeMotionPolarity;
  size?: WardrobeMotionSize;
  variant?: WardrobeMotionVariant;
};
