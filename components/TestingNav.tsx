"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ClipboardCheck, Home, LayoutGrid, Layers, Workflow } from "lucide-react";
import { cn } from "@/lib/utils";

const LINKS: { href: string; label: string; icon: typeof Home }[] = [
  { href: "/", label: "Scanner", icon: Home },
  { href: "/testing", label: "Overview", icon: LayoutGrid },
  { href: "/testing/pour", label: "Core principles", icon: Layers },
  { href: "/testing/methods", label: "Testing plan", icon: Workflow },
  { href: "/testing/checkpoints", label: "Essential checks", icon: ClipboardCheck },
];

export function TestingNav() {
  const pathname = usePathname();

  return (
    <nav
      className="border-border/50 bg-card/50 mb-8 flex flex-wrap gap-2 rounded-2xl border p-2 shadow-sm backdrop-blur-sm"
      aria-label="Accessibility testing sections"
    >
      {LINKS.map(({ href, label, icon: Icon }) => {
        const active =
          href === "/"
            ? pathname === "/"
            : pathname === href || (href !== "/testing" && pathname.startsWith(`${href}/`));
        return (
          <Link
            key={href}
            href={href}
            className={cn(
              "focus-visible:ring-ring flex items-center gap-2 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:outline-none",
              active
                ? "bg-primary/20 text-primary shadow-inner"
                : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
            )}
            aria-current={active ? "page" : undefined}
          >
            <Icon className="size-4 shrink-0 opacity-80" aria-hidden />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
