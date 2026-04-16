import { type ReactNode } from "react";
import { A11yAmbience } from "@/components/A11yAmbience";
import { AppLogo } from "@/components/AppLogo";
import { APP_NAME } from "@/lib/brand";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-dvh items-center justify-center px-4 py-12">
      <A11yAmbience />
      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3">
          <div className="app-brand-glow overflow-hidden rounded-xl ring-1 ring-white/15">
            <AppLogo size={56} className="rounded-xl" />
          </div>
          <h1 className="agent-title-gradient text-2xl font-bold tracking-tight">{APP_NAME}</h1>
        </div>
        {children}
      </div>
    </div>
  );
}
