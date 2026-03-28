"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

type ThemePreference = "system" | "light" | "dark";

const THEME_STORAGE_KEY = "driply-theme-preference";
const themeOptions: ThemePreference[] = ["system", "light", "dark"];

function SystemIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <rect x="4" y="5" width="16" height="11" rx="2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      <path d="M9 19h6" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
      <path d="M12 16v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <circle cx="12" cy="12" r="4.2" fill="none" stroke="currentColor" strokeWidth="1.7" />
      {[
        "12 2.5 12 5",
        "12 19 12 21.5",
        "2.5 12 5 12",
        "19 12 21.5 12",
        "5.2 5.2 7 7",
        "17 17 18.8 18.8",
        "17 7 18.8 5.2",
        "5.2 18.8 7 17",
      ].map((segment) => {
        const [x1, y1, x2, y2] = segment.split(" ");
        return (
          <line
            key={segment}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
        );
      })}
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
      <path
        d="M15.5 3.5a7.8 7.8 0 1 0 5 13.9A8.8 8.8 0 1 1 15.5 3.5Z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ThemeIcon({ preference }: { preference: ThemePreference }) {
  if (preference === "light") return <SunIcon />;
  if (preference === "dark") return <MoonIcon />;
  return <SystemIcon />;
}

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

function getStoredThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
  return themeOptions.includes(stored as ThemePreference) ? (stored as ThemePreference) : "system";
}

function pageMeta(pathname: string) {
  if (pathname === "/" || pathname === "/sign-in") {
    return {
      title: "",
      showHeading: false,
    };
  }

  if (pathname.startsWith("/library")) {
    return {
      title: "Wardrobe",
      showHeading: true,
    };
  }

  return {
    title: "Home",
    showHeading: true,
  };
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = useMemo(() => pageMeta(pathname), [pathname]);
  const [themePreference, setThemePreference] = useState<ThemePreference>(getStoredThemePreference);
  const [user, setUser] = useState<User | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supabase = getBrowserSupabaseClient();
    let active = true;

    void supabase.auth.getUser().then(({ data }) => {
      if (active) {
        setUser(data.user ?? null);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (active) {
        setUser(session?.user ?? null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsProfileMenuOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  async function onSignOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    setUser(null);
    setIsProfileMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const displayName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user?.email ?? "Account";
  const avatarUrl =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : typeof user?.user_metadata?.picture === "string"
        ? user.user_metadata.picture
        : null;
  const isPublicLanding = pathname === "/";
  const isPublicAuthPage = pathname === "/sign-in" || pathname === "/sign-up";
  const showAppNav = !isPublicLanding && !isPublicAuthPage;

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link href={user ? "/today" : "/"} className="text-sm font-semibold tracking-tight text-foreground">
              driply
            </Link>
            {showAppNav ? (
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
            ) : null}
          </div>

          <div className="flex items-center gap-3">
            <div className="app-card flex items-center gap-1 rounded-full p-1">
              {themeOptions.map((option) => {
                const selected = themePreference === option;
                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => onThemeChange(option)}
                    aria-label={`${option} theme`}
                    aria-pressed={selected}
                    className={`rounded-full p-2 transition ${
                      selected ? "bg-foreground text-background" : "text-muted-foreground"
                    }`}
                  >
                    <ThemeIcon preference={option} />
                  </button>
                );
              })}
            </div>

            {user ? (
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((open) => !open)}
                  aria-label="Open account menu"
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border border-border bg-surface"
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-semibold text-foreground">
                      {displayName.charAt(0).toUpperCase()}
                    </span>
                  )}
                </button>

                {isProfileMenuOpen ? (
                  <div className="profile-menu app-card absolute right-0 top-[calc(100%+0.6rem)] min-w-52 rounded-2xl p-2">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold text-foreground">{displayName}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void onSignOut()}
                      className="profile-menu-action"
                      role="menuitem"
                    >
                      Log out
                    </button>
                  </div>
                ) : null}
              </div>
            ) : (
              <Link href="/sign-in" className="text-sm text-foreground">
                Log in
              </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col px-4 py-6 sm:px-6 lg:px-8">
        {meta.showHeading ? (
          <div className="mb-6 flex items-center justify-between">
            <h1 className="text-xl font-semibold tracking-tight text-foreground">{meta.title}</h1>
          </div>
        ) : null}
        {children}
      </main>
    </div>
  );
}
