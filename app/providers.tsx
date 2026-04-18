"use client";

import { useEffect, type ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import type { Session } from "next-auth";
import { ScanSessionProvider } from "@/components/ScanSessionProvider";
import { loadUserSettings } from "@/lib/userSettings";

function syncReducedMotionClass() {
  if (typeof window === "undefined") return;
  const s = loadUserSettings();
  const osPrefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const reduced = s.preferReducedMotion || osPrefersReduced;
  document.documentElement.classList.toggle("a11y-pref-reduced-motion", reduced);
}

interface ProvidersProps {
  children: ReactNode;
  session: Session | null;
}

export function Providers({ children, session }: ProvidersProps) {
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

  return (
    <SessionProvider session={session}>
      <ScanSessionProvider>{children}</ScanSessionProvider>
    </SessionProvider>
  );
}
