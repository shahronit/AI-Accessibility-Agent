"use client";

import {
  Accessibility,
  Captions,
  Contrast,
  Heading2,
  ImageIcon,
  Keyboard,
  Languages,
  Link2,
  Table2,
  TextCursorInput,
} from "lucide-react";

const ITEMS: { icon: typeof Contrast; title: string; desc: string }[] = [
  { icon: Contrast, title: "Color contrast", desc: "Whether text and controls stand out clearly against the background." },
  { icon: ImageIcon, title: "Alt text", desc: "Short descriptions for images and icons so everyone gets the meaning." },
  { icon: Heading2, title: "Heading hierarchy", desc: "Headings that follow a sensible order, like an outline." },
  { icon: Accessibility, title: "ARIA attributes", desc: "Extra labels for custom controls when plain HTML isn’t enough." },
  { icon: Keyboard, title: "Keyboard access", desc: "Everything important works with Tab and keys—not only a mouse." },
  { icon: TextCursorInput, title: "Form labels", desc: "Fields clearly tied to their labels and related inputs grouped sensibly." },
  { icon: Link2, title: "Link text", desc: "Links that say where they go, not just “click here.”" },
  { icon: Table2, title: "Tables", desc: "Data tables with proper headers so screen readers can follow rows and columns." },
  { icon: Languages, title: "Language", desc: "Page language set correctly so assistive tech reads text the right way." },
  { icon: Captions, title: "Multimedia", desc: "Captions, transcripts, or descriptions when video or audio matter." },
];

export function WhatWeTestPanel() {
  return (
    <div className="space-y-3">
      <div>
        <h3 className="text-base font-semibold tracking-tight text-zinc-100">What we test</h3>
        <p className="text-muted-foreground mt-1 text-sm leading-relaxed">
          Exactly what gets checked depends on the accessibility level you pick for the scan.
        </p>
      </div>
      <ul className="max-h-[min(52vh,520px)] space-y-2.5 overflow-y-auto pr-1">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <li key={title} className="flex gap-3">
            <span className="border-emerald-500/20 bg-emerald-500/10 text-emerald-400 flex size-8 shrink-0 items-center justify-center rounded-lg border">
              <Icon className="size-3.5" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-zinc-100">{title}</p>
              <p className="text-muted-foreground mt-0.5 text-sm leading-snug">{desc}</p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
