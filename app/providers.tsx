"use client";

import { useEffect, type ReactNode } from "react";
import { ScanSessionProvider } from "@/components/ScanSessionProvider";
import { loadUserSettings } from "@/lib/userSettings";

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    const s = loadUserSettings();
    document.documentElement.classList.toggle("a11y-pref-reduced-motion", s.preferReducedMotion);
  }, []);

  return <ScanSessionProvider>{children}</ScanSessionProvider>;
}
