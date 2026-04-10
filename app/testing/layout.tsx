import type { Metadata } from "next";
import { A11yAmbience } from "@/components/A11yAmbience";
import { APP_NAME } from "@/lib/brand";

export const metadata: Metadata = {
  title: `Accessibility testing · ${APP_NAME}`,
  description:
    "AI testing dashboard, AI report analysis, and generated manual QA scenarios from your scans.",
};

export default function TestingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="agent-screen relative isolate min-h-full">
      <A11yAmbience />
      <div className="relative z-10 mx-auto max-w-5xl px-4 py-10">{children}</div>
    </div>
  );
}
