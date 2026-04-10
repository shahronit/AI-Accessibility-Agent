/**
 * Decorative layer only: soft motion and a11y-themed motifs.
 * Motion runs only when the user has not chosen reduced motion (class + media query in CSS).
 */
export function A11yAmbience() {
  return (
    <div
      className="pointer-events-none absolute inset-0 z-0 overflow-hidden"
      aria-hidden
    >
      <div className="a11y-ambient-grid" />
      <div className="a11y-ambient-orb a11y-ambient-orb-a" />
      <div className="a11y-ambient-orb a11y-ambient-orb-b" />
      <div className="a11y-ambient-orb a11y-ambient-orb-c" />
      <svg
        className="a11y-ambient-mark text-cyan-400/90"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <circle cx="60" cy="60" r="54" className="stroke-white/[0.07]" strokeWidth="1" />
        <circle cx="60" cy="36" r="6" className="fill-current opacity-[0.12]" />
        <path
          d="M48 48h24v4H68v32h-4V52H56v32h-4V52h-4v-4z"
          className="fill-current opacity-[0.1]"
        />
        <path
          d="M24 58c12-18 36-18 48 0M24 72c12 18 36 18 48 0"
          className="stroke-current opacity-[0.14]"
          strokeWidth="1.25"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}
