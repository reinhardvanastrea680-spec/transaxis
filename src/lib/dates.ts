/**
 * Dates rendered the same on the server and in the browser.
 *
 * `new Date(x).toLocaleString()` with no arguments reads the *runtime's* locale
 * and timezone. On the server that is UTC in whatever locale the container was
 * built with; in the browser it is the customer's. So the same instant renders
 * as "11/15/2026, 9:49:17 PM" in one place and "15/11/2026, 22:49:17" in the
 * other, React finds a text node that does not match the HTML it was given,
 * and throws the whole subtree away (minified error #418) before re-rendering
 * it. Nothing is visibly broken, which is why it survived — but every such page
 * pays for a full client re-render on load.
 *
 * Pinning the locale and the timezone removes the ambiguity: both sides format
 * the same instant through the same rules and agree exactly.
 *
 * Africa/Lagos, not UTC: this is a Nigerian logistics product, the timestamps
 * are proof-of-delivery and dispatch times that an operator reads against their
 * own clock, and the zone has no daylight saving to shift under us.
 */

const LOCALE = "en-GB";
const TIME_ZONE = "Africa/Lagos";

const dateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
  timeZone: TIME_ZONE,
});

const longDateFormatter = new Intl.DateTimeFormat(LOCALE, {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});

function parse(value: string | number | Date | null | undefined): Date | null {
  if (value === null || value === undefined || value === "") return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** "15 Nov 2026" — an em dash when there is no usable date. */
export function formatDate(value: string | number | Date | null | undefined): string {
  const date = parse(value);
  return date ? dateFormatter.format(date) : "—";
}

/** "15 Nov 2026, 22:49" — an em dash when there is no usable date. */
export function formatDateTime(value: string | number | Date | null | undefined): string {
  const date = parse(value);
  return date ? dateTimeFormatter.format(date) : "—";
}

/** "15 November 2026" — for a date that is read as a sentence, not a column. */
export function formatDateLong(value: string | number | Date | null | undefined): string {
  const date = parse(value);
  return date ? longDateFormatter.format(date) : "—";
}
