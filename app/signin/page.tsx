import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { A11yAmbience } from "@/components/A11yAmbience";
import { AppLogo } from "@/components/AppLogo";
import { GithubSignInButton } from "@/components/GithubSignInButton";
import { APP_NAME, APP_TAGLINE } from "@/lib/brand";

interface SignInPageProps {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}

function pickCallback(raw: string | string[] | undefined): string {
  if (!raw) return "/";
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value || typeof value !== "string") return "/";
  // Only allow same-origin redirects to prevent open-redirect abuse via
  // ?callbackUrl=https://evil.example.com.
  if (!value.startsWith("/") || value.startsWith("//")) return "/";
  return value;
}

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const session = await auth();
  const params = await searchParams;
  const callbackUrl = pickCallback(params.callbackUrl);

  if (session?.user) {
    redirect(callbackUrl);
  }

  return (
    <div className="bg-background relative flex min-h-dvh items-center justify-center px-4 py-12">
      <A11yAmbience />
      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="app-brand-glow overflow-hidden rounded-xl ring-1 ring-white/15">
            <AppLogo size={56} className="rounded-xl" />
          </div>
          <h1 className="agent-title-gradient text-2xl font-bold tracking-tight">{APP_NAME}</h1>
          <p className="text-muted-foreground text-sm">{APP_TAGLINE}</p>
        </div>

        <div className="border-border/60 bg-card/80 space-y-5 rounded-2xl border p-8 shadow-xl backdrop-blur-xl">
          <div className="space-y-1">
            <h2 className="text-lg font-semibold">Sign in to continue</h2>
            <p className="text-muted-foreground text-sm">
              {APP_NAME} uses GitHub OAuth so you can save scans, view dashboard
              stats, and export reports against your account.
            </p>
          </div>

          <GithubSignInButton callbackUrl={callbackUrl} />

          <p className="text-muted-foreground text-center text-xs">
            <Link href="/" className="hover:text-foreground hover:underline">
              Continue without signing in
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
