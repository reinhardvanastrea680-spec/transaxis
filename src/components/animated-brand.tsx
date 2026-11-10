"use client";

import { useEffect, useState } from "react";

export default function AnimatedBrand() {
  const letters = "Transaxis".split("");
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="relative inline-flex items-center gap-3">
      <span className="flex size-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand to-accent text-white overflow-hidden shadow-xl shadow-brand/25 ring-1 ring-white/20">
        <img src="/logo.svg" alt="" width={36} height={36} className="size-9 drop-shadow-sm" />
      </span>
      <h1 className="text-[clamp(2.75rem,7vw,5rem)] font-extrabold tracking-[-0.04em] leading-none">
        {letters.map((letter, i) => (
          <span
            key={i}
            className="inline-block bg-gradient-to-r from-brand via-accent to-brand bg-[length:200%_100%] bg-clip-text text-transparent animate-shimmer"
            style={{
              opacity: visible ? 1 : 0,
              transform: visible ? "translateY(0) rotateX(0deg)" : "translateY(30px) rotateX(-90deg)",
              transition: `opacity 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.07}s, transform 0.6s cubic-bezier(0.16,1,0.3,1) ${i * 0.07}s`,
              animationDelay: `${i * 0.1}s`,
            }}
          >
            {letter}
          </span>
        ))}
      </h1>
    </div>
  );
}