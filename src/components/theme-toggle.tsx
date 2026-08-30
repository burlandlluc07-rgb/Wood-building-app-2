"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

const STORAGE_KEY = "nestforge-theme";

function applyTheme(theme: "light" | "dark") {
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // localStorage unavailable (private browsing, etc.) — theme just
    // won't persist across reloads, which is fine.
  }
}

export function ThemeToggle() {
  // Starts null so the server-rendered markup and the first client render
  // match (the real value is decided by the no-flash script in layout.tsx
  // before hydration); read the actual state from the DOM once mounted.
  const [theme, setTheme] = useState<"light" | "dark" | null>(null);

  useEffect(() => {
    setTheme(document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark");
  }, []);

  if (theme === null) {
    return <div className="h-9 w-9" aria-hidden />;
  }

  return (
    <button
      onClick={() => {
        const next = theme === "light" ? "dark" : "light";
        applyTheme(next);
        setTheme(next);
      }}
      title={theme === "light" ? "Switch to dark mode" : "Switch to light mode"}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-edge bg-panel text-muted hover:text-brand"
    >
      {theme === "light" ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
    </button>
  );
}
