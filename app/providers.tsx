"use client";

import { useEffect, type ReactNode } from "react";
import { ScanSessionProvider } from "@/components/ScanSessionProvider";
import { loadUserSettings } from "@/lib/userSettings";

function syncReducedMotionClass() {
  if (typeof window === "undefined") return;
  const s = loadUserSettings();
  const osPrefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reduced = s.preferReducedMotion || osPrefersReduced;
  document.documentElement.classList.toggle("a11y-pref-reduced-motion", reduced);
}

export function Providers({ children }: { children: ReactNode }) {
  useEffect(() => {
    syncReducedMotionClass();
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onOsChange = () => syncReducedMotionClass();
    const onAppChange = () => syncReducedMotionClass();
    mq.addEventListener("change", onOsChange);
    window.addEventListener("a11y-user-settings-changed", onAppChange);
    return () => {
      mq.removeEventListener("change", onOsChange);
      window.removeEventListener("a11y-user-settings-changed", onAppChange);
    };
  }, []);

  return <ScanSessionProvider>{children}</ScanSessionProvider>;
}
