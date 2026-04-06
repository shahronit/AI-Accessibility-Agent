import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Accessibility testing · Accessibility AI Agent",
  description:
    "AI testing dashboard, AI report analysis, and generated manual QA scenarios from your scans.",
};

export default function TestingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="agent-screen relative min-h-full">
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_90%_60%_at_50%_-15%,rgba(139,92,246,0.14),transparent_55%)]"
        aria-hidden
      />
      <div
        className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(ellipse_70%_50%_at_100%_50%,rgba(34,211,238,0.06),transparent)]"
        aria-hidden
      />
      <div className="mx-auto max-w-5xl px-4 py-10">{children}</div>
    </div>
  );
}
