import type { CSSProperties, ReactNode } from "react";

/**
 * Entrance animation without JavaScript.
 *
 * These used to be Framer Motion components. That meant `opacity: 0` was baked
 * into the server HTML and nothing became visible until `motion` had been
 * downloaded, parsed and hydrated — so on a cold mobile launch the entire
 * dashboard sat invisible behind the PWA splash. Measured on a throttled
 * connection: HTML arrived in 197ms, first paint at 11.2s.
 *
 * The animation is now a CSS keyframe (see `reveal-in` in globals.css) which
 * starts as soon as the stylesheet applies. No bundle, no hydration, no client
 * component boundary — and the content is painted in the first frame rather
 * than after the last byte of JavaScript.
 *
 * These are deliberately server components now. The `Reveal` family appears 38
 * times across the dashboard, login and landing pages; keeping them client-side
 * would pull a React boundary into every one of them for no benefit.
 *
 * `prefers-reduced-motion` is handled globally in globals.css, which collapses
 * every animation to 0.01ms, so the reduced-motion path needs no branch here.
 */

type RevealStyle = CSSProperties & {
  "--reveal-delay"?: string;
  "--reveal-y"?: string;
  "--reveal-stagger"?: string;
};

export function Reveal({
  children,
  delay = 0,
  y = 8,
  className = "",
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const style: RevealStyle = {
    "--reveal-delay": `${delay}s`,
    "--reveal-y": `${y}px`,
  };
  return (
    <div className={`reveal ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

export function RevealGroup({
  children,
  className = "",
  stagger = 0.04,
}: {
  children: ReactNode;
  className?: string;
  stagger?: number;
}) {
  const style: RevealStyle = { "--reveal-stagger": `${stagger}s` };
  return (
    <div className={`reveal-group ${className}`.trim()} style={style}>
      {children}
    </div>
  );
}

/**
 * A child of `RevealGroup`; the group's CSS supplies the animation and the
 * stagger, so this adds nothing but its wrapper. Used on its own it is simply
 * visible, which is the safe failure.
 */
export function RevealItem({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return <div className={className}>{children}</div>;
}
