import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";

/**
 * NextAuth v5 configuration.
 *
 * - Strategy: JWT (no DB; the GitHub-issued profile is encoded into the session cookie).
 * - Provider: GitHub OAuth. Configure GITHUB_ID / GITHUB_SECRET in .env.local
 *   (create at https://github.com/settings/developers).
 * - `trustHost: true` lets the app run behind any host header (Vercel preview URLs,
 *   Render onrender.com domains, custom domains) without an explicit AUTH_URL.
 *
 * The session callback exposes the GitHub user id on `session.user.id` so server
 * routes can scope user-owned resources without re-fetching the token.
 */
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    GitHub({
      clientId: process.env.GITHUB_ID,
      clientSecret: process.env.GITHUB_SECRET,
    }),
  ],
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },
  secret: process.env.NEXTAUTH_SECRET,
  trustHost: true,
  callbacks: {
    async jwt({ token, profile }) {
      if (profile && typeof profile.id !== "undefined") {
        token.id = String(profile.id);
      } else if (profile && typeof (profile as { sub?: unknown }).sub === "string") {
        token.id = String((profile as { sub?: string }).sub);
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },
});
