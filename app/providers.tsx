"use client";

import type { ReactNode } from "react";
import { ScanSessionProvider } from "@/components/ScanSessionProvider";

export function Providers({ children }: { children: ReactNode }) {
  return <ScanSessionProvider>{children}</ScanSessionProvider>;
}
