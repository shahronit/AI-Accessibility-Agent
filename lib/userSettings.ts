"use client";

const STORAGE_KEY = "a11y-user-settings-v1";

export type UserSettings = {
  /** Prefer reduced motion for layout / scroll (honored where implemented). */
  preferReducedMotion: boolean;
  /** Shown in the sidebar profile (local only). */
  displayName: string;
  displayEmail: string;
};

const defaults: UserSettings = {
  preferReducedMotion: false,
  displayName: "",
  displayEmail: "",
};

function read(): UserSettings {
  if (typeof window === "undefined") return { ...defaults };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaults };
    const parsed = JSON.parse(raw) as Partial<UserSettings>;
    return { ...defaults, ...parsed };
  } catch {
    return { ...defaults };
  }
}

function write(next: UserSettings) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("a11y-pref-reduced-motion", next.preferReducedMotion);
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("a11y-user-settings-changed"));
  }
}

export function loadUserSettings(): UserSettings {
  return read();
}

export function saveUserSettings(partial: Partial<UserSettings>): UserSettings {
  const next = { ...read(), ...partial };
  write(next);
  return next;
}
