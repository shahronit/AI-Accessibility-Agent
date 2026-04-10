"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

type AppLogoProps = {
  className?: string;
  /** CSS size (width & height). Default 40 (2.5rem). */
  size?: number;
};

/**
 * Brand mark: gradient tile, universal-access silhouette (wheelchair symbol),
 * and a small gold accent for the AI layer. Decorative where paired with visible text.
 */
export function AppLogo({ className, size = 40 }: AppLogoProps) {
  const gid = useId().replace(/:/g, "");
  const gradId = `${gid}-bg`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      aria-hidden
      focusable={false}
    >
      <defs>
        <linearGradient id={gradId} x1="4" y1="3" x2="28" y2="29" gradientUnits="userSpaceOnUse">
          <stop stopColor="#0891b2" />
          <stop offset="0.45" stopColor="#22d3ee" />
          <stop offset="1" stopColor="#7c3aed" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="9" fill={`url(#${gradId})`} />
      <circle cx="25.5" cy="6.5" r="2.2" fill="#fbbf24" opacity={0.95} />
      <g
        transform="translate(5.5, 5) scale(0.7)"
        fill="none"
        stroke="white"
        strokeWidth="2.25"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.95}
      >
        <circle cx="16" cy="4" r="1" fill="white" stroke="none" />
        <path d="m18 19 1-7-6 1" />
        <path d="m5 8 3-3 5.5 3-2.36 3.5" />
        <path d="M4.24 14.5a5 5 0 0 0 6.88 6" />
        <path d="M13.76 17.5a5 5 0 0 0-6.88-6" />
      </g>
    </svg>
  );
}
