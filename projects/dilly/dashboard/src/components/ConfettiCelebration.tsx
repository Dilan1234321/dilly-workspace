"use client";

/**
 * Light confetti celebration. Call fireConfetti() when user hits Top 25% or other milestones.
 */

/** Light confetti celebration for Top 25% and milestones. */
export function fireConfetti() {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  import("canvas-confetti").then((confetti) => {
    const count = 40;
    const defaults = { origin: { y: 0.75 }, zIndex: 9999 };

    function fire(particleRatio: number, opts: { spread?: number; startVelocity?: number }) {
      confetti.default({
        ...defaults,
        ...opts,
        particleCount: Math.floor(count * particleRatio),
        colors: ["#C8102E", "#FFCD00", "#22c55e", "#e2e8f0"],
        ticks: 80,
        gravity: 0.6,
        scalar: 0.7,
        drift: 0.05,
      });
    }

    fire(0.2, { spread: 40, startVelocity: 30 });
    fire(0.15, { spread: 70, startVelocity: 25 });
  });
}
