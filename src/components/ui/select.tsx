"use client";

import { forwardRef, useId } from "react";
import { ChevronDown } from "lucide-react";

export interface SelectProps
  extends React.SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string | null;
  hint?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  function Select({ label, error, hint, className = "", id, children, ...props }, ref) {
    const autoId = useId();
    const selectId = id ?? autoId;
    return (
      <div className="w-full">
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-ink">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            id={selectId}
            aria-invalid={error ? true : undefined}
            className={`mt-1.5 w-full appearance-none rounded-control border bg-surface py-2.5 pl-3.5 pr-9 text-sm text-ink transition-colors ${
              error
                ? "border-danger focus:border-danger"
                : "border-line-strong hover:border-ink-faint focus:border-brand"
            } ${className}`}
            {...props}
          >
            {children}
          </select>
          <ChevronDown
            size={15}
            className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          />
        </div>
        {error ? (
          <p className="mt-1.5 text-xs text-danger">{error}</p>
        ) : hint ? (
          <p className="mt-1.5 text-xs text-ink-muted">{hint}</p>
        ) : null}
      </div>
    );
  },
);
