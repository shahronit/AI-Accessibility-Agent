"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BookOpen, Info, Loader2, Mic } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { loadUserSettings, saveUserSettings, type UserSettings } from "@/lib/userSettings";

export default function SettingsPage() {
  const [settings, setSettings] = useState<UserSettings | null>(null);

  useEffect(() => {
    setSettings(loadUserSettings());
  }, []);

  const update = useCallback((partial: Partial<UserSettings>) => {
    setSettings(saveUserSettings(partial));
  }, []);

  if (!settings) {
    return (
      <p className="text-muted-foreground flex items-center gap-2 p-8 text-sm" role="status" aria-busy="true">
        <Loader2 className="text-primary size-4 shrink-0 animate-spin" aria-hidden />
        Loading settings…
      </p>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <Card className="agent-card">
        <CardHeader>
          <CardTitle className="text-lg">Profile</CardTitle>
          <CardDescription>
            Shown next to your name in the menu. Saved only on this device—not an online account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="display-name">Display name</Label>
            <Input
              id="display-name"
              value={settings.displayName}
              onChange={(e) => update({ displayName: e.target.value })}
              placeholder="Your name"
              autoComplete="name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="display-email">Email (optional)</Label>
            <Input
              id="display-email"
              type="email"
              value={settings.displayEmail}
              onChange={(e) => update({ displayEmail: e.target.value })}
              placeholder="you@example.com"
              autoComplete="email"
            />
          </div>
        </CardContent>
      </Card>

      <Card className="agent-card">
        <CardHeader>
          <CardTitle className="text-lg">Preferences</CardTitle>
          <CardDescription>Remembered in this browser only. Other devices won&apos;t see these choices.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/15 px-4 py-3">
            <div className="space-y-0.5">
              <Label htmlFor="reduced-motion" className="text-sm font-medium">
                Prefer reduced motion
              </Label>
              <p className="text-muted-foreground text-xs">Uses less animation when supported by the page.</p>
            </div>
            <input
              id="reduced-motion"
              type="checkbox"
              className="accent-primary size-4"
              checked={settings.preferReducedMotion}
              onChange={(e) => update({ preferReducedMotion: e.target.checked })}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="agent-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Mic className="size-5" aria-hidden />
            Voice
          </CardTitle>
          <CardDescription>Uses your browser&apos;s built-in speech. No sign-up needed.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <p className="text-muted-foreground leading-relaxed">
            Use <strong className="text-foreground">http://localhost:3000</strong> or HTTPS so the microphone and
            recognition run in a secure context. If you see a <code className="bg-muted rounded px-1">network</code>{" "}
            error, stay online and allow the microphone for this site.
          </p>
          <Alert>
            <Info className="size-4" aria-hidden />
            <AlertTitle>Typed commands</AlertTitle>
            <AlertDescription>
              If voice fails (VPN, firewall), use the voice panel&apos;s &quot;Type commands&quot; field on the
              dashboard.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <Card className="agent-card">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BookOpen className="size-5" aria-hidden />
            AI &amp; scans
          </CardTitle>
          <CardDescription>
            For developers: add API keys in <code className="text-xs">.env.local</code> on the machine that runs the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-muted-foreground text-sm leading-relaxed">
            This app calls <strong className="text-foreground">Gemini</strong>, <strong className="text-foreground">Anthropic</strong>, or{" "}
            <strong className="text-foreground">AssemblyAI</strong> from API routes. See the project README for variable
            names and scan timeouts.
          </p>
          <Link
            href="/"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
          >
            Back to dashboard
          </Link>
        </CardContent>
      </Card>
    </div>
  );
}
