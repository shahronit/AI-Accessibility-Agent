import type { DefaultSession } from "next-auth";

/**
 * Module augmentation so we can stash the GitHub user id (assigned in the
 * `jwt` callback in `auth.ts`) on the JWT and read it back as
 * `session.user.id` in API routes and server components.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
