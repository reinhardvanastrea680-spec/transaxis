import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { STANDARD_DISPATCHES_PER_MONTH, formatNaira, priceFor } from "@/lib/plans";

/**
 * The closing call to action, shared by the solution pages.
 *
 * The price is read from the plan table rather than typed here, so a page
 * cannot end up advertising a number checkout does not charge.
 */
export function CtaBand({
  heading = "Make every movement visible.",
  subheading = "Start with a clear operational system your whole team can trust.",
  related,
}: {
  heading?: string;
  subheading?: string;
  related?: { href: string; label: string };
}) {
  const standard = formatNaira(priceFor("standard", "monthly"));

  return (
    <section className="bg-band text-white">
      <div className="mx-auto flex max-w-[1200px] flex-col items-start justify-between gap-8 px-5 py-16 sm:px-8 md:flex-row md:items-center">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-emerald-300">
            14-day free trial · no card required
          </p>
          <h2 className="mt-3 max-w-xl text-3xl font-semibold tracking-[-0.01em] text-white">
            {heading}
          </h2>
          <p className="mt-3 max-w-lg text-sm leading-6 text-stone-300">{subheading}</p>
          <p className="mt-3 text-sm text-stone-400">
            {standard} a month for Standard — {STANDARD_DISPATCHES_PER_MONTH} dispatches,
            five staff seats, two warehouses.
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Link href="/login?mode=signup">
            <Button size="lg" variant="bandPrimary">
              Start a free trial
              <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </Link>
          <a href="mailto:transaxis6.ng@gmail.com?subject=Transaxis%20enquiry">
            <Button size="lg" variant="bandOutline">
              Ask a question
            </Button>
          </a>
        </div>
      </div>
      {related && (
        <div className="border-t border-white/10">
          <div className="mx-auto max-w-[1200px] px-5 py-4 text-sm sm:px-8">
            <span className="text-stone-400">Also relevant: </span>
            <Link
              href={related.href}
              className="font-medium text-white underline decoration-white/30 underline-offset-4 transition-colors hover:decoration-white"
            >
              {related.label}
            </Link>
          </div>
        </div>
      )}
    </section>
  );
}
