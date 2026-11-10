"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTheme } from "./theme-provider";

export function ThemeToggle() {
  const { resolved, toggle } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  // Avoid hydration mismatch: render a neutral placeholder until mounted.
  if (!mounted) {
    return (
      <button
        type="button"
        aria-label="Toggle theme"
        className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-ink-muted"
      >
        <Sun size={16} aria-hidden="true" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={`Switch to ${resolved === "dark" ? "light" : "dark"} mode`}
      className="flex size-9 items-center justify-center rounded-control border border-line bg-surface text-ink-muted transition-colors hover:border-line-strong hover:text-ink"
    >
      {resolved === "dark" ? (
        <Sun size={16} aria-hidden="true" />
      ) : (
        <Moon size={16} aria-hidden="true" />
      )}
    </button>
  );
}
