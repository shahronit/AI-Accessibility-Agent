"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@/components/AuthProvider";
import { Loader2 } from "lucide-react";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await register(email, password, name || undefined);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="border-border/60 bg-card/80 space-y-5 rounded-2xl border p-8 shadow-xl backdrop-blur-xl"
    >
      <h2 className="text-lg font-semibold">Create your account</h2>

      {error && (
        <div role="alert" className="rounded-lg bg-red-500/10 px-4 py-2.5 text-sm text-red-400">
          {error}
        </div>
      )}

      <div className="space-y-2">
        <label htmlFor="name" className="text-muted-foreground text-sm font-medium">
          Name <span className="text-muted-foreground/60">(optional)</span>
        </label>
        <input
          id="name"
          type="text"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="border-border bg-background focus:ring-ring block w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="email" className="text-muted-foreground text-sm font-medium">
          Email
        </label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="border-border bg-background focus:ring-ring block w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="password" className="text-muted-foreground text-sm font-medium">
          Password
        </label>
        <input
          id="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="border-border bg-background focus:ring-ring block w-full rounded-lg border px-3 py-2.5 text-sm focus:ring-2 focus:outline-none"
        />
        <p className="text-muted-foreground text-xs">At least 8 characters</p>
      </div>

      <button
        type="submit"
        disabled={loading}
        className="bg-primary text-primary-foreground hover:bg-primary/90 flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50"
      >
        {loading && <Loader2 className="size-4 animate-spin" aria-hidden />}
        Create account
      </button>

      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{" "}
        <Link href="/login" className="text-emerald-400 hover:underline">
          Sign in
        </Link>
      </p>

      <p className="text-muted-foreground text-center text-xs">
        <Link href="/" className="hover:text-foreground hover:underline">
          Continue without signing in
        </Link>
      </p>
    </form>
  );
}
