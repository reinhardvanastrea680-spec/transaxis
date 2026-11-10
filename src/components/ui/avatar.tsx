const TONES = [
  "bg-brand-soft text-brand-ink",
  "bg-info-soft text-info",
  "bg-warn-soft text-warn",
  "bg-danger-soft text-danger",
  "bg-sunken text-ink",
];

function initials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

export function Avatar({
  name,
  size = 32,
  className = "",
}: {
  name: string | null | undefined;
  size?: number;
  className?: string;
}) {
  const text = initials(name);
  const tone =
    TONES[
      Array.from(text).reduce((acc, ch) => acc + ch.charCodeAt(0), 0) % TONES.length
    ];
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-medium ${tone} ${className}`}
      style={{ width: size, height: size, fontSize: Math.round(size * 0.36) }}
      aria-hidden="true"
    >
      {text}
    </span>
  );
}
