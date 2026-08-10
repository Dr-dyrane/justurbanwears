"use client";

import { Laptop, Moon, Sun } from "lucide-react";
import { useTheme, type ThemePreference } from "./theme-provider";

const preferenceOrder: ThemePreference[] = ["system", "light", "dark"];
const preferenceLabel: Record<ThemePreference, string> = {
  system: "System",
  light: "Light",
  dark: "Dark",
};

export function ThemeToggle({ className = "" }: { className?: string }) {
  const { preference, setPreference } = useTheme();
  const nextPreference = preferenceOrder[(preferenceOrder.indexOf(preference) + 1) % preferenceOrder.length];
  const Icon = preference === "light" ? Sun : preference === "dark" ? Moon : Laptop;

  return (
    <button
      aria-label={`Appearance: ${preferenceLabel[preference]}. Switch to ${preferenceLabel[nextPreference]}`}
      className={["theme-toggle", className].filter(Boolean).join(" ")}
      onClick={() => setPreference(nextPreference)}
      title={`Appearance: ${preferenceLabel[preference]}`}
      type="button"
    >
      <Icon aria-hidden="true" size={18} strokeWidth={1.8} />
      <span className="sr-only">{preferenceLabel[preference]}</span>
    </button>
  );
}
