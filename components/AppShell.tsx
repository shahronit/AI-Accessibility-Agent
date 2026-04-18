"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ClipboardList,
  ExternalLink,
  GitCompareArrows,
  History as HistoryIcon,
  LayoutDashboard,
  LayoutGrid,
  LogIn,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
} from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import { A11yAmbience } from "@/components/A11yAmbience";
import { AppLogo } from "@/components/AppLogo";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { loadUserSettings } from "@/lib/userSettings";

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/history")) return "Scan history";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/scan/explain")) return "Issue explanation";
  if (pathname.startsWith("/compare")) return "Compare scans";
  if (pathname.startsWith("/report")) return "Scan findings report";
  if (pathname.startsWith("/scan")) return "New scan";
  if (pathname === "/testing/ai-report") return "AI report Analysis";
  if (pathname === "/testing/scenarios" || pathname.startsWith("/testing/scenarios/")) {
    return "Testing Scenarios";
  }
  if (pathname === "/testing/pour" || pathname.startsWith("/testing/pour/")) return "Core principles";
  if (pathname === "/testing/methods" || pathname.startsWith("/testing/methods/")) return "Testing plan";
  if (pathname === "/testing/checkpoints" || pathname.startsWith("/testing/checkpoints/")) {
    return "Essential checks";
  }
  if (pathname === "/testing/expert-audit" || pathname.startsWith("/testing/expert-audit/")) {
    return "Expert WCAG audit";
  }
  if (pathname === "/testing" || pathname === "/testing/") return "AI Testing Dashboard";
  if (pathname.startsWith("/testing")) return "Testing";
  return "Dashboard";
}

const SIDEBAR_COLLAPSED_KEY = "a11y-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);
  const { data: session } = useSession();
  const authUser = session?.user ?? null;
  const handleSignOut = () => {
    void signOut({ callbackUrl: "/" });
  };
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- restore sidebar preference after mount (client-only)
      setSidebarCollapsed(localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1");
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, sidebarCollapsed ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, [sidebarCollapsed]);

  useEffect(() => {
    const sync = () => {
      if (authUser) {
        const trimmedName = authUser.name?.trim();
        const email = authUser.email ?? "";
        const fallback = trimmedName || (email ? email.split("@")[0] : "GitHub user");
        setProfileName(fallback);
        setProfileEmail(email || "Signed in via GitHub");
      } else {
        const s = loadUserSettings();
        setProfileName(s.displayName?.trim() || "Local user");
        setProfileEmail(s.displayEmail?.trim() || "This browser · not signed in");
      }
    };
    sync();
    window.addEventListener("a11y-user-settings-changed", sync);
    return () => window.removeEventListener("a11y-user-settings-changed", sync);
  }, [authUser]);

  const primaryNav = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, active: pathname === "/" },
    {
      href: "/scan",
      label: "New scan",
      icon: ScanSearch,
      active: pathname.startsWith("/scan"),
    },
    { href: "/history", label: "History", icon: HistoryIcon, active: pathname.startsWith("/history") },
    { href: "/compare", label: "Compare", icon: GitCompareArrows, active: pathname.startsWith("/compare") },
    { href: "/settings", label: "Settings", icon: Settings, active: pathname.startsWith("/settings") },
  ] as const;

  const testingAreaActive = pathname.startsWith("/testing");
  const testingHubActive = pathname === "/testing" || pathname === "/testing/";
  const testingScenariosActive =
    pathname === "/testing/scenarios" || pathname.startsWith("/testing/scenarios/");

  const navLinkClass = (active: boolean, compact: boolean) =>
    cn(
      "app-nav-link flex items-center rounded-lg text-sm font-medium transition-colors",
      compact ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
      active
        ? "bg-emerald-500/25 text-emerald-200 shadow-[0_0_20px_oklch(0.55_0.12_160/0.12)]"
        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
    );

  const testingLinkClass = (active: boolean, compact: boolean) =>
    cn(
      "app-nav-link flex items-center rounded-lg text-sm font-medium transition-colors",
      compact ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
      active
        ? "bg-emerald-500/25 text-emerald-200 shadow-[0_0_20px_oklch(0.55_0.12_160/0.12)]"
        : "text-muted-foreground hover:bg-white/[0.06] hover:text-foreground",
    );

  return (
    <div className="bg-background flex min-h-full">
      <a
        href="#main-content"
        className="bg-primary text-primary-foreground focus:ring-ring sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-md focus:px-3 focus:py-2 focus:ring-2"
      >
        Skip to main content
      </a>
      <aside
        id="app-sidebar"
        className={cn(
          "border-border/60 bg-card/80 flex shrink-0 flex-col overflow-x-hidden border-r backdrop-blur-xl transition-[width] duration-200 ease-out",
          sidebarCollapsed ? "w-[4.5rem]" : "w-[min(100%,288px)]",
        )}
        aria-label="Application"
      >
        <div
          className={cn(
            "flex h-[3.75rem] shrink-0 items-center border-b border-white/10",
            sidebarCollapsed ? "justify-center px-2" : "gap-3 px-4",
          )}
        >
          <div className="app-brand-glow relative shrink-0 overflow-hidden rounded-xl ring-1 ring-white/15">
            <AppLogo size={40} className="rounded-xl" />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">{APP_NAME}</p>
              <p className="text-muted-foreground truncate text-xs">{APP_TAGLINE}</p>
            </div>
          )}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main navigation">
          {primaryNav.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              className={navLinkClass(active, sidebarCollapsed)}
              data-compact={sidebarCollapsed ? "true" : "false"}
              aria-current={active ? "page" : undefined}
            >
              <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
              <span className={cn(sidebarCollapsed && "sr-only")}>{label}</span>
            </Link>
          ))}

          <div className="mt-3 border-t border-white/10 pt-3">
            <p
              className={cn(
                "text-muted-foreground px-3 pb-2 text-[11px] font-semibold tracking-wide uppercase",
                testingAreaActive && "text-emerald-400/80",
                sidebarCollapsed && "sr-only",
              )}
            >
              AI Testing
            </p>
            <div className="flex flex-col gap-0.5">
              <Link
                href="/testing"
                className={testingLinkClass(testingHubActive, sidebarCollapsed)}
                data-compact={sidebarCollapsed ? "true" : "false"}
                aria-current={testingHubActive ? "page" : undefined}
                title={
                  testingAreaActive && !testingHubActive ? "Back to AI Testing hub" : undefined
                }
              >
                <LayoutGrid className="size-4 shrink-0 opacity-80" aria-hidden />
                <span className={cn(sidebarCollapsed && "sr-only")}>Testing hub</span>
              </Link>
              <Link
                href="/testing/scenarios"
                className={testingLinkClass(testingScenariosActive, sidebarCollapsed)}
                data-compact={sidebarCollapsed ? "true" : "false"}
                aria-current={testingScenariosActive ? "page" : undefined}
              >
                <ClipboardList className="size-4 shrink-0 opacity-80" aria-hidden />
                <span className={cn(sidebarCollapsed && "sr-only")}>Testing scenarios</span>
              </Link>
            </div>
          </div>
        </nav>
        <div className="border-border/60 mt-auto space-y-1 border-t border-white/10 p-3">
          <a
            href="https://www.w3.org/WAI/standards-guidelines/wcag/"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "text-muted-foreground hover:text-foreground flex items-center rounded-lg py-2 text-sm",
              sidebarCollapsed ? "justify-center px-2" : "gap-2 px-3",
            )}
            aria-label="WCAG reference"
          >
            <ExternalLink className="size-4 shrink-0" aria-hidden />
            <span className={cn(sidebarCollapsed && "sr-only")}>WCAG reference</span>
          </a>
          {sidebarCollapsed ? (
            authUser ? (
              <div className="flex flex-col items-center gap-2">
                {authUser.image ? (
                  <Image
                    src={authUser.image}
                    alt=""
                    width={28}
                    height={28}
                    className="size-7 shrink-0 rounded-full ring-1 ring-white/15"
                  />
                ) : null}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="text-muted-foreground hover:text-foreground flex items-center justify-center rounded-lg px-2 py-2.5 text-sm"
                  aria-label="Sign out"
                >
                  <LogOut className="size-4 shrink-0 opacity-80" aria-hidden />
                </button>
              </div>
            ) : (
              <Link
                href="/signin"
                className="text-muted-foreground hover:text-foreground flex items-center justify-center rounded-lg px-2 py-2.5 text-sm"
                aria-label="Sign in"
              >
                <LogIn className="size-4 shrink-0 opacity-80" aria-hidden />
              </Link>
            )
          ) : (
            <div className="border-border/60 mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
              <div className="flex items-center gap-3">
                {authUser?.image ? (
                  <Image
                    src={authUser.image}
                    alt=""
                    width={36}
                    height={36}
                    className="size-9 shrink-0 rounded-full ring-1 ring-white/15"
                  />
                ) : null}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-zinc-100">{profileName}</p>
                  <p className="text-muted-foreground mt-0.5 truncate text-xs">{profileEmail}</p>
                </div>
              </div>
              <div className="mt-2 flex items-center gap-3">
                <Link
                  href="/settings"
                  className="text-emerald-400/90 text-xs font-medium hover:underline"
                >
                  Edit profile
                </Link>
                {authUser ? (
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-muted-foreground hover:text-foreground text-xs font-medium hover:underline"
                  >
                    Sign out
                  </button>
                ) : (
                  <Link
                    href="/signin"
                    className="text-emerald-400/90 text-xs font-medium hover:underline"
                  >
                    Sign in
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="agent-header-bar flex h-[3.75rem] shrink-0 items-center gap-3 px-4 backdrop-blur-md sm:px-6">
          <button
            type="button"
            onClick={() => setSidebarCollapsed((c) => !c)}
            className="text-muted-foreground hover:bg-white/5 hover:text-foreground focus-visible:ring-ring shrink-0 rounded-lg p-2 focus-visible:ring-2 focus-visible:outline-none"
            aria-expanded={!sidebarCollapsed}
            aria-controls="app-sidebar"
            aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {sidebarCollapsed ? (
              <PanelLeftOpen className="size-5" aria-hidden />
            ) : (
              <PanelLeftClose className="size-5" aria-hidden />
            )}
          </button>
          <h1 className="agent-title-gradient min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">
            {title}
          </h1>
        </header>
        <div className="agent-screen flex min-h-0 flex-1 flex-col overflow-auto">
          <A11yAmbience />
          <div id="main-content" className="relative z-10 flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
