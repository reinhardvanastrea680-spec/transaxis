"use client";

import { forwardRef } from "react";
import { Loader2 } from "lucide-react";

type Variant = "primary" | "outline" | "ghost" | "danger" | "subtle";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-brand text-white hover:bg-brand-hover active:scale-[0.98] disabled:hover:bg-brand",
  outline:
    "border border-line-strong bg-surface text-ink hover:bg-sunken active:scale-[0.98]",
  ghost: "text-ink-muted hover:bg-sunken hover:text-ink active:scale-[0.98]",
  danger:
    "border border-danger/30 bg-surface text-danger hover:bg-danger-soft active:scale-[0.98]",
  subtle: "bg-sunken text-ink hover:bg-line active:scale-[0.98]",
};

const SIZES: Record<Size, string> = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-11 px-5 text-sm gap-2",
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { variant = "primary", size = "md", loading, className = "", children, disabled, ...props },
    ref,
  ) {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={`inline-flex items-center justify-center rounded-control font-medium transition-[background-color,color,transform,opacity] duration-150 disabled:cursor-not-allowed disabled:opacity-50 ${VARIANTS[variant]} ${SIZES[size]} ${className}`}
        {...props}
      >
        {loading && <Loader2 size={15} className="animate-spin" aria-hidden="true" />}
        {children}
      </button>
    );
  },
);
