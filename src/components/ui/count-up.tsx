"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A number that counts up when it scrolls into view.
 *
 * Two things this deliberately does NOT do:
 *
 *   1. It does not start at zero. The server renders the real value, so the
 *      dashboard is correct the instant it paints — previously the markup said
 *      "0 products" and only became true once JavaScript arrived, which on a
 *      cold mobile launch meant a dashboard that was visibly wrong for seconds.
 *      The animation is an enhancement for numbers you scroll down to; a number
 *      already on screen is simply correct.
 *
 *   2. It does not import `motion`. `useInView` is a thin wrapper over
 *      IntersectionObserver, and pulling the whole animation library into the
 *      dashboard bundle for it delayed the very paint it was decorating.
 */
export function CountUp({
  value,
  duration = 600,
  className = "",
}: {
  value: number;
  duration?: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const [display, setDisplay] = useState(value);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    // Already on screen: the value is correct and stays put. Animating here
    // would mean flashing the true number back to zero first.
    const rect = node.getBoundingClientRect();
    const onScreen = rect.top < window.innerHeight && rect.bottom > 0;
    if (onScreen) return;

    let raf = 0;
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((e) => e.isIntersecting)) return;
        observer.disconnect();
        const start = performance.now();
        const tick = (now: number) => {
          const t = Math.min((now - start) / duration, 1);
          // easeOutExpo
          const eased = t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
          setDisplay(Math.round(value * eased));
          if (t < 1) raf = requestAnimationFrame(tick);
        };
        setDisplay(0);
        raf = requestAnimationFrame(tick);
      },
      { rootMargin: "-40px" },
    );

    observer.observe(node);
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, duration]);

  return (
    <span ref={ref} className={`tabular ${className}`}>
      {display.toLocaleString()}
    </span>
  );
}
