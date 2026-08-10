"use client";

import { Laptop, Moon, Sun, type LucideIcon } from "lucide-react";
import { useTheme, type ThemePreference } from "./theme-provider";

const choices: Array<{ id: ThemePreference; label: string; icon: LucideIcon }> = [
  { id: "system", label: "System", icon: Laptop },
  { id: "light", label: "Light", icon: Sun },
  { id: "dark", label: "Dark", icon: Moon },
];

export function ThemeSettings() {
  const { preference, setPreference } = useTheme();

  return (
    <div className="theme-settings" aria-label="Appearance" role="group">
      {choices.map(({ id, label, icon: Icon }) => (
        <button
          aria-pressed={preference === id}
          className={preference === id ? "is-active" : undefined}
          key={id}
          onClick={() => setPreference(id)}
          type="button"
        >
          <Icon aria-hidden="true" size={17} strokeWidth={1.8} />
          <span>{label}</span>
        </button>
      ))}
    </div>
  );
}
