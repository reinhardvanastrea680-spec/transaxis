"use client";

import { useEffect, useState } from "react";

/**
 * The brand mark, alive.
 *
 * It used to flip nine letters in one after another — 70ms apart, 600ms each,
 * so the wordmark took over a second to finish before the page felt ready. It
 * read as a loading delay rather than a flourish.
 *
 * Now the whole lockup arrives as one 550ms settle, and the life comes from two
 * cheap ambient layers afterwards: a halo that breathes behind the tile and a
 * sheen that crosses it every few seconds. Both animate only `transform` and
 * `opacity`, so they run on the compositor and never block paint.
 *
 * `prefers-reduced-motion` is handled globally in globals.css, which collapses
 * every animation to a single near-instant frame.
 */
export default function AnimatedBrand() {
  const [shown, setShown] = useState(false);

  useEffect(() => {
    // One frame later, so the browser paints the "before" state and the
    // transition actually runs instead of being skipped.
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <div
      className="inline-flex items-center gap-4"
      style={{
        opacity: shown ? 1 : 0,
        transform: shown ? "none" : "translateY(10px) scale(0.985)",
        transition:
          "opacity 0.55s cubic-bezier(0.16,1,0.3,1), transform 0.55s cubic-bezier(0.16,1,0.3,1)",
      }}
    >
      <span className="relative flex size-14 items-center justify-center">
        {/* Breathing halo — sits behind the tile, never intercepts clicks. */}
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 rounded-2xl bg-brand/30 blur-md"
          style={{ animation: "brand-breathe 3.4s ease-in-out infinite" }}
        />
        <span className="relative flex size-14 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-brand to-accent text-white shadow-xl shadow-brand/25 ring-1 ring-white/20">
          <img
            src="/logo.svg"
            alt=""
            width={36}
            height={36}
            className="size-9 drop-shadow-sm"
          />
          {/* Sheen sweep across the tile. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.42) 50%, transparent 70%)",
              animation: "brand-sheen 6s ease-in-out infinite",
            }}
          />
        </span>
      </span>

      {/* The lockup is a brand mark, not the page heading — the hero already has
          an <h1>, so this stays out of the outline. */}
      <div
        aria-label="Transaxis"
        className="text-[clamp(2.75rem,7vw,5rem)] font-extrabold leading-none tracking-[-0.04em]"
      >
        <span
          className="animate-shimmer bg-gradient-to-r from-brand via-accent to-brand bg-[length:200%_100%] bg-clip-text text-transparent"
          style={{ animationDuration: "7s" }}
        >
          Transaxis
        </span>
      </div>
    </div>
  );
}
