"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";

import { getBrowserSupabaseClient } from "@/lib/supabase/browser";

function pageMeta(pathname: string) {
  if (pathname === "/" || pathname === "/sign-in" || pathname === "/sign-up") {
    return {
      title: "",
      showHeading: false,
    };
  }

  if (pathname.startsWith("/today")) {
    return {
      title: "Home",
      showHeading: false,
    };
  }

  if (pathname.startsWith("/library")) {
    return {
      title: "Wardrobe",
      showHeading: true,
    };
  }

  if (pathname.startsWith("/profile")) {
    return {
      title: "Profile",
      showHeading: false,
    };
  }

  return {
    title: "Home",
    showHeading: true,
  };
}

type AppProfile = {
  avatarUrl: string | null;
  displayName: string | null;
};

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const meta = useMemo(() => pageMeta(pathname), [pathname]);
  const [user, setUser] = useState<User | null>(null);
  const [appProfile, setAppProfile] = useState<AppProfile | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);

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
        if (!session?.user) setAppProfile(null);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!user) return;
    let active = true;
    void fetch("/api/profile")
      .then((res) => res.json())
      .then((json) => {
        if (!active) return;
        setAppProfile({
          avatarUrl: json.avatarUrl ?? null,
          displayName: json.displayName ?? null,
        });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [user]);

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

  const oauthDisplayName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name
        : user?.email ?? "Account";
  const displayName = appProfile?.displayName || oauthDisplayName;

  const oauthAvatarUrl =
    typeof user?.user_metadata?.avatar_url === "string"
      ? user.user_metadata.avatar_url
      : typeof user?.user_metadata?.picture === "string"
        ? user.user_metadata.picture
        : null;
  const avatarUrl = appProfile?.avatarUrl ?? oauthAvatarUrl;
  const isPublicLanding = pathname === "/";
  const isPublicAuthPage =
    pathname === "/sign-in" ||
    pathname === "/sign-up" ||
    pathname === "/forgot-password" ||
    pathname === "/reset-password" ||
    pathname === "/onboarding";
  const showAppNav = !isPublicLanding && !isPublicAuthPage;

  if (isPublicLanding || isPublicAuthPage) return <>{children}</>;

  const navItems = [
    {
      href: "/today",
      label: "Home",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M3 9.5L10 3l7 6.5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
          <path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      href: "/library",
      label: "Wardrobe",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M7 7h6M7 10h6M7 13h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      href: "/profile",
      label: "Profile",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4"/>
          <path d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div className="page-shell">
      <header className="sticky top-0 z-20 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <Link
              href={user ? "/today" : "/"}
              style={{
                fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                fontWeight: 700,
                fontSize: 20,
                letterSpacing: "-0.03em",
                color: "var(--foreground)",
                textDecoration: "none",
                flexShrink: 0,
              }}
            >
              drip<span style={{ color: "oklch(75% 0.18 200)" }}>ly</span>
            </Link>
            {showAppNav ? (
              <nav className="hidden items-center gap-1 md:flex">
                {navItems.map((item) => {
                  const active = pathname === item.href;
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      style={{
                        fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                        fontSize: 13,
                        fontWeight: 500,
                      }}
                      className={`rounded-full px-3.5 py-1.5 transition ${
                        active
                          ? "bg-surface border border-border text-[oklch(75%_0.18_200)]"
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

          <div className="flex items-center gap-2">
            {showAppNav ? (
              <div
                style={{
                  width: 36, height: 36, borderRadius: 10,
                  background: "var(--surface)", border: "1px solid var(--border)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                  color: "var(--muted-foreground)", flexShrink: 0,
                }}
                aria-hidden="true"
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
                  <path
                    d="M8 2a4 4 0 0 0-4 4v3l-1 1v1h10v-1l-1-1V6a4 4 0 0 0-4-4zM6.5 13a1.5 1.5 0 0 0 3 0"
                    stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"
                  />
                </svg>
              </div>
            ) : null}

            {user ? (
              <div ref={profileMenuRef} className="relative">
                <button
                  type="button"
                  onClick={() => setIsProfileMenuOpen((open) => !open)}
                  aria-label="Open account menu"
                  aria-expanded={isProfileMenuOpen}
                  aria-haspopup="menu"
                  style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "oklch(75% 0.18 200 / 0.1)",
                    border: "1px solid oklch(75% 0.18 200 / 0.3)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    fontFamily: "var(--lp-font-display, 'Space Grotesk', sans-serif)",
                    fontSize: 13, fontWeight: 700,
                    color: "oklch(75% 0.18 200)",
                    cursor: "pointer", overflow: "hidden", flexShrink: 0,
                  }}
                >
                  {avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={avatarUrl}
                      alt={displayName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    displayName.charAt(0).toUpperCase()
                  )}
                </button>

                {isProfileMenuOpen ? (
                  <div className="profile-menu app-card absolute right-0 top-[calc(100%+0.6rem)] min-w-52 rounded-2xl p-2">
                    <div className="px-3 py-2">
                      <p className="text-sm font-semibold text-foreground">{displayName}</p>
                    </div>
                    <Link
                      href="/profile"
                      onClick={() => setIsProfileMenuOpen(false)}
                      className="profile-menu-action block"
                      role="menuitem"
                    >
                      Profile
                    </Link>
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
            ) : null}
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

      {showAppNav ? (
        <nav className="bottom-app-nav" aria-label="Mobile navigation">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`bottom-app-tab${pathname === item.href ? " active" : ""}`}
            >
              {item.icon}
              <span className="bottom-app-tab-label">{item.label}</span>
            </Link>
          ))}
        </nav>
      ) : null}
    </div>
  );
}
