"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

import { ProfilePhotoImg } from "@/components/profile-photo";
import { useApiFetch } from "@/lib/hooks/use-api-fetch";
import { useAuthUser } from "@/lib/hooks/use-auth-user";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser";
import type { ProfileResponse } from "@/lib/types/wardrobe";

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
  const apiFetch = useApiFetch();
  const meta = useMemo(() => pageMeta(pathname), [pathname]);
  const { user } = useAuthUser();
  const [fetchedProfile, setFetchedProfile] = useState<AppProfile | null>(null);
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);
  const profileMenuRef = useRef<HTMLDivElement | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Derived so a sign-out drops the profile immediately without an extra
  // state reset; the next sign-in refetches and overwrites.
  const appProfile = user ? fetchedProfile : null;

  useEffect(() => {
    if (!user) return;
    let active = true;
    void apiFetch<ProfileResponse>("/api/profile")
      .then((json) => {
        if (!active) return;
        setFetchedProfile({
          avatarUrl: json.avatarUrl ?? null,
          displayName: json.displayName ?? null,
        });
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [user, apiFetch]);

  useEffect(() => {
    if (!isProfileMenuOpen) return;

    function closeAndRestoreFocus() {
      setIsProfileMenuOpen(false);
      // Return focus to the trigger so keyboard users don't lose their place.
      menuTriggerRef.current?.focus();
    }

    function handlePointerDown(event: MouseEvent) {
      if (!profileMenuRef.current?.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        closeAndRestoreFocus();
        return;
      }
      // Lightweight focus trap: wrap Tab across the menu's focusable items.
      if (event.key === "Tab" && menuRef.current) {
        const items = Array.from(
          menuRef.current.querySelectorAll<HTMLElement>(
            'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
          ),
        ).filter((el) => el.offsetParent !== null);
        if (items.length === 0) return;
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement as HTMLElement | null;
        if (event.shiftKey && (active === first || !menuRef.current.contains(active))) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    // Move focus into the menu on open for screen-reader and keyboard users.
    menuRef.current?.querySelector<HTMLElement>("a[href], button:not([disabled])")?.focus();

    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isProfileMenuOpen]);

  async function onSignOut() {
    const supabase = getBrowserSupabaseClient();
    await supabase.auth.signOut();
    // useAuthUser's onAuthStateChange subscription clears `user`.
    setIsProfileMenuOpen(false);
    router.push("/");
    router.refresh();
  }

  const oauthDisplayName =
    typeof user?.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : typeof user?.user_metadata?.name === "string"
        ? user.user_metadata.name
        : (user?.email ?? "Account");
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
      label: "Today",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path
            d="M3 9.5L10 3l7 6.5V17a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5z"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinejoin="round"
          />
          <path d="M7 18v-6h6v6" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
      ),
    },
    {
      href: "/library",
      label: "Wardrobe",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <rect x="3" y="3" width="14" height="14" rx="3" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M7 7h6M7 10h6M7 13h4"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
    {
      href: "/profile",
      label: "Profile",
      icon: (
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <circle cx="10" cy="7" r="3" stroke="currentColor" strokeWidth="1.4" />
          <path
            d="M4 17c0-3.3 2.7-6 6-6s6 2.7 6 6"
            stroke="currentColor"
            strokeWidth="1.4"
            strokeLinecap="round"
          />
        </svg>
      ),
    },
  ];

  const avatar = (size: number) => (
    <span
      className="app-avatar"
      style={{ width: size, height: size, borderRadius: size / 2 }}
      aria-hidden={avatarUrl ? undefined : true}
    >
      {avatarUrl ? (
        <ProfilePhotoImg
          src={avatarUrl}
          pick="avatar"
          alt={displayName}
          className="h-full w-full object-cover"
        />
      ) : (
        displayName.charAt(0).toUpperCase()
      )}
    </span>
  );

  return (
    <div className="page-shell app-layout">
      {showAppNav ? (
        <aside className="app-sidebar" aria-label="Sidebar">
          <Link href={user ? "/today" : "/"} className="app-logo app-logo-light">
            driply
          </Link>
          <nav className="app-sidebar-nav" aria-label="Main navigation">
            {navItems.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`app-sidebar-link${active ? " active" : ""}`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <Link href="/library" className="app-sidebar-cta">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
              <path
                d="M10 4v12M4 10h12"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
            Add clothes
          </Link>
          {user ? (
            <div className="app-sidebar-user">
              <Link href="/profile" className="app-sidebar-user-link">
                {avatar(40)}
                <span className="truncate">{displayName}</span>
              </Link>
              <button type="button" onClick={() => void onSignOut()} className="app-sidebar-logout">
                Log out
              </button>
            </div>
          ) : null}
        </aside>
      ) : null}

      <div className="app-column">
        <header className="app-topbar">
          <Link href={user ? "/today" : "/"} className="app-logo">
            driply
          </Link>

          {user ? (
            <div ref={profileMenuRef} className="relative">
              <button
                ref={menuTriggerRef}
                type="button"
                onClick={() => setIsProfileMenuOpen((open) => !open)}
                aria-label="Open account menu"
                aria-expanded={isProfileMenuOpen}
                aria-haspopup="menu"
                className="app-avatar-button"
              >
                {avatar(40)}
              </button>

              {isProfileMenuOpen ? (
                <div
                  ref={menuRef}
                  role="menu"
                  aria-label="Account menu"
                  className="profile-menu app-card absolute right-0 top-[calc(100%+0.6rem)] min-w-52 rounded-2xl p-2"
                >
                  <div className="px-3 py-2" aria-hidden="true">
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
        </header>

        <main className="app-main">
          {meta.showHeading ? (
            <div className="mb-6 flex items-center justify-between">
              <h1 className="app-page-title">{meta.title}</h1>
            </div>
          ) : null}
          {children}
        </main>
      </div>

      {showAppNav ? (
        <nav className="bottom-app-nav" aria-label="Mobile navigation">
          {navItems.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`bottom-app-tab${active ? " active" : ""}`}
              >
                {item.icon}
                <span className="bottom-app-tab-label">{item.label}</span>
              </Link>
            );
          })}
        </nav>
      ) : null}
    </div>
  );
}
