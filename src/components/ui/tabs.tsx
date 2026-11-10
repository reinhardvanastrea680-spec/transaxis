"use client";

import { motion } from "motion/react";

export interface TabItem {
  id: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  className = "",
}: {
  items: TabItem[];
  active: string;
  onChange: (id: string) => void;
  className?: string;
}) {
  return (
    <div
      role="tablist"
      className={`flex flex-wrap gap-1 ${className}`}
    >
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(item.id)}
            className={`relative flex shrink-0 items-center gap-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? "text-ink" : "text-ink-muted hover:text-ink"
            }`}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-medium tabular ${
                  isActive ? "bg-brand-soft text-brand-ink" : "bg-sunken text-ink-muted"
                }`}
              >
                {item.count}
              </span>
            )}
            {isActive && (
              <motion.span
                layoutId="tab-indicator"
                className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-brand"
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}
