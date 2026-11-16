import { Reveal } from "@/components/ui/reveal";

/**
 * Renders the FAQ and nothing else.
 *
 * The same array is passed to `faqPageSchema()` by the page, so the text a
 * visitor reads and the text Google indexes are the same object. Writing the
 * markup by hand beside the visible copy is how the two quietly diverge, and a
 * mismatch is grounds for losing the rich result.
 *
 * `<details>` rather than a JS accordion: it works before hydration, it is
 * keyboard accessible for free, and the answer text is in the DOM either way —
 * which is what a crawler reads.
 */
export function FaqSection({
  items,
  heading = "Questions people ask before starting",
}: {
  items: Array<{ q: string; a: string }>;
  heading?: string;
}) {
  return (
    <section className="border-t border-line bg-surface" aria-labelledby="faq-heading">
      <div className="mx-auto max-w-[900px] px-5 py-16 sm:px-8 lg:py-20">
        <Reveal>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-brand">
            FAQ
          </p>
          <h2
            id="faq-heading"
            className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.01em] text-ink"
          >
            {heading}
          </h2>
        </Reveal>

        <div className="mt-8 divide-y divide-line border-y border-line">
          {items.map((item) => (
            <details key={item.q} className="group py-5">
              <summary className="flex cursor-pointer list-none items-start justify-between gap-6 text-base font-medium text-ink marker:hidden">
                <span>{item.q}</span>
                <span
                  aria-hidden="true"
                  className="mt-1 shrink-0 text-ink-faint transition-transform group-open:rotate-45"
                >
                  <svg viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                    <path d="M8 3v10M3 8h10" strokeLinecap="round" />
                  </svg>
                </span>
              </summary>
              <p className="mt-3 max-w-[68ch] text-sm leading-7 text-ink-muted">{item.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
