"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "driply-theme-preference";
const themeOptions: ThemePreference[] = ["system", "light", "dark"];

function getResolvedTheme(preference: ThemePreference) {
  if (preference === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }
  return preference;
}

function applyTheme(preference: ThemePreference) {
  const root = document.documentElement;
  root.dataset.theme = preference === "system" ? "" : preference;
  root.dataset.themePreference = preference;
  root.style.colorScheme = getResolvedTheme(preference);
}

function formatThemeLabel(preference: ThemePreference) {
  if (preference === "system") return "System";
  return preference.charAt(0).toUpperCase() + preference.slice(1);
}

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return themeOptions.includes(stored as ThemePreference) ? (stored as ThemePreference) : "system";
}

function pageMeta(pathname: string) {
  if (pathname.startsWith("/library")) {
    return {
      title: "Wardrobe",
    };
  }

  return {
    title: "Home",
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const meta = useMemo(() => pageMeta(pathname), [pathname]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);

  useEffect(() => {
    applyTheme(themePreference);
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const handleSystemThemeChange = () => {
      if (themePreference === "system") applyTheme("system");
    };

    media.addEventListener("change", handleSystemThemeChange);
    return () => media.removeEventListener("change", handleSystemThemeChange);
  }, [themePreference]);

  function onThemeChange(nextPreference: ThemePreference) {
    setThemePreference(nextPreference);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextPreference);
    applyTheme(nextPreference);
  }

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href="/today" className="text-sm font-semibold tracking-tight text-foreground">
              driply
            </Link>
            <nav className="flex items-center gap-2">
              {[
                { href: "/today", label: "Home" },
                { href: "/library", label: "Wardrobe" },
              ].map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-3 py-1.5 text-sm transition ${
                      active
                        ? "bg-foreground text-background"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="app-card flex items-center gap-1 rounded-full p-1">
            {themeOptions.map((option) => {
              const selected = themePreference === option;
              return (
                <button
                  key={option}
                  type="button"
                  onClick={() => onThemeChange(option)}
                  aria-pressed={selected}
                  className={`rounded-full px-2.5 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] ${
                    selected ? "bg-foreground text-background" : "text-muted-foreground"
                  }`}
                >
                  {formatThemeLabel(option)}
                </button>
              );
            })}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-xl font-semibold tracking-tight text-foreground">{meta.title}</h1>
        </div>
        {children}
      </main>
    </div>
  );
}
