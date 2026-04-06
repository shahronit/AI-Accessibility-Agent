"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ClipboardList,
  ExternalLink,
  History as HistoryIcon,
  LayoutDashboard,
  LayoutGrid,
  PanelLeftClose,
  PanelLeftOpen,
  ScanSearch,
  Settings,
  Sparkles,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { loadUserSettings } from "@/lib/userSettings";

function pageTitle(pathname: string): string {
  if (pathname.startsWith("/history")) return "Scan history";
  if (pathname.startsWith("/settings")) return "Settings";
  if (pathname.startsWith("/scan/explain")) return "Issue explanation";
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
  if (pathname === "/testing" || pathname === "/testing/") return "AI Testing Dashboard";
  if (pathname.startsWith("/testing")) return "Testing";
  return "Dashboard";
}

const SIDEBAR_COLLAPSED_KEY = "a11y-sidebar-collapsed";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const title = pageTitle(pathname);
  const [profileName, setProfileName] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    try {
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
      const s = loadUserSettings();
      setProfileName(s.displayName?.trim() || "Local user");
      setProfileEmail(s.displayEmail?.trim() || "This browser · not signed in");
    };
    sync();
    window.addEventListener("a11y-user-settings-changed", sync);
    return () => window.removeEventListener("a11y-user-settings-changed", sync);
  }, []);

  const primaryNav = [
    { href: "/", label: "Dashboard", icon: LayoutDashboard, active: pathname === "/" },
    {
      href: "/scan",
      label: "New scan",
      icon: ScanSearch,
      active: pathname.startsWith("/scan"),
    },
    { href: "/history", label: "History", icon: HistoryIcon, active: pathname.startsWith("/history") },
    { href: "/settings", label: "Settings", icon: Settings, active: pathname.startsWith("/settings") },
  ] as const;

  const testingAreaActive = pathname.startsWith("/testing");
  const testingHubActive = pathname === "/testing" || pathname === "/testing/";
  const testingScenariosActive =
    pathname === "/testing/scenarios" || pathname.startsWith("/testing/scenarios/");

  const navLinkClass = (active: boolean, compact: boolean) =>
    cn(
      "flex items-center rounded-lg text-sm font-medium transition-colors",
      compact ? "justify-center px-2 py-2.5" : "gap-3 px-3 py-2.5",
      active
        ? "bg-emerald-500/20 text-emerald-300"
        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
    );

  const testingLinkClass = (active: boolean, compact: boolean) =>
    cn(
      "flex items-center rounded-lg text-sm font-medium transition-colors",
      compact ? "justify-center px-2 py-2" : "gap-3 px-3 py-2",
      active
        ? "bg-emerald-500/20 text-emerald-300"
        : "text-muted-foreground hover:bg-white/5 hover:text-foreground",
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
          "border-border/60 bg-card/90 flex shrink-0 flex-col overflow-x-hidden border-r backdrop-blur-md transition-[width] duration-200 ease-out",
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
          <div className="bg-primary/15 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl">
            <Sparkles className="size-5 text-amber-400/90" aria-hidden />
          </div>
          {!sidebarCollapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold tracking-tight">Accessibility AI</p>
              <p className="text-muted-foreground truncate text-xs">AI-powered accessibility testing</p>
            </div>
          )}
        </div>
        <nav className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto p-3" aria-label="Main navigation">
          {primaryNav.map(({ href, label, icon: Icon, active }) => (
            <Link
              key={href}
              href={href}
              className={navLinkClass(active, sidebarCollapsed)}
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
            <Link
              href="/settings"
              className="text-muted-foreground hover:text-foreground flex items-center justify-center rounded-lg px-2 py-2.5 text-sm"
              aria-label="Settings and profile"
            >
              <Settings className="size-4 shrink-0 opacity-80" aria-hidden />
            </Link>
          ) : (
            <div className="border-border/60 mt-3 rounded-xl border border-white/10 bg-black/25 px-3 py-3">
              <p className="truncate text-sm font-medium text-zinc-100">{profileName}</p>
              <p className="text-muted-foreground mt-0.5 truncate text-xs">{profileEmail}</p>
              <Link
                href="/settings"
                className="text-emerald-400/90 mt-2 inline-block text-xs font-medium hover:underline"
              >
                Edit profile
              </Link>
            </div>
          )}
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-border/60 flex h-[3.75rem] shrink-0 items-center gap-3 border-b border-white/10 px-4 sm:px-6">
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
          <h1 className="min-w-0 flex-1 truncate text-lg font-semibold tracking-tight">{title}</h1>
        </header>
        <div className="agent-screen flex min-h-0 flex-1 flex-col overflow-auto">
          <div id="main-content" className="flex-1">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
