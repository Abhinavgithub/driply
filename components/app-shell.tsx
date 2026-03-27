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
      eyebrow: "Closet Edit",
      title: "Curate the wardrobe behind every recommendation.",
      subtitle:
        "Organize your wardrobe, fill in missing metadata, and keep every item styled well enough to unlock better outfit picks.",
    };
  }

  return {
    eyebrow: "Daily Styling",
    title: "Dress for the day with a sharper recommendation flow.",
    subtitle:
      "Weather-aware outfit picks now balance color, formality, and styling cues from your wardrobe for a more polished daily look.",
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
      <header className="shell-nav sticky top-0 z-20 w-full border-b border-border/80">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
            <div className="space-y-2">
              <div className="eyebrow">{meta.eyebrow}</div>
              <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                <div className="max-w-3xl">
                  <div className="text-lg font-semibold tracking-[0.18em] text-foreground/80 uppercase">
                    Driply
                  </div>
                  <h1 className="mt-2 max-w-3xl text-3xl font-semibold tracking-tight text-foreground sm:text-5xl">
                    {meta.title}
                  </h1>
                </div>
                <p className="max-w-xl text-sm leading-6 muted-copy sm:text-base">
                  {meta.subtitle}
                </p>
              </div>
            </div>

            <div className="glass-card flex items-center gap-2 self-start rounded-full p-1.5">
              {themeOptions.map((option) => {
                const selected = themePreference === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onThemeChange(option)}
                    aria-pressed={selected}
                    className={`rounded-full px-3 py-2 text-xs font-semibold tracking-[0.12em] uppercase transition ${
                      selected
                        ? "bg-foreground text-background shadow-[0_12px_28px_rgba(0,0,0,0.18)]"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {formatThemeLabel(option)}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <nav className="glass-card flex w-full max-w-fit items-center gap-2 rounded-full p-1.5">
              {[
                { href: "/today", label: "Today" },
                { href: "/library", label: "Library" },
              ].map((item) => {
                const active = pathname === item.href;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                      active
                        ? "bg-accent text-white shadow-[0_14px_30px_rgba(0,0,0,0.12)]"
                        : "text-muted-foreground hover:bg-accent-soft hover:text-foreground"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </nav>

            <div className="flex flex-wrap gap-2">
              <span className="pill pill-accent">Editorial wardrobe assistant</span>
              <span className="pill">Theme-aware experience</span>
            </div>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col px-4 py-8 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}
