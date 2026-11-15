/**
 * Cancelling a Paystack subscription.
 *
 * Lives here rather than in `billing/actions.ts` because two very different
 * moments need it: the customer pressing "downgrade", and an upgrade whose new
 * payment has just succeeded and which must retire the subscription it
 * replaced. The second one runs inside the webhook and the checkout return
 * trip, so this has to be callable from there too.
 *
 * Paystack has no `/subscription/:code/disable` route — it 404s. Disabling
 * takes the code AND the subscription's `email_token` in a POST body, and the
 * token is only available from the single-subscription fetch.
 */

const PAYSTACK_API = "https://api.paystack.co";

export type CancelResult = { ok: boolean; detail: string };

export async function cancelSubscription(
  secret: string,
  subscriptionCode: string,
): Promise<CancelResult> {
  const fetchRes = await fetch(
    `${PAYSTACK_API}/subscription/${encodeURIComponent(subscriptionCode)}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
      cache: "no-store",
    },
  );
  const fetched = (await fetchRes.json().catch(() => null)) as
    | { status?: boolean; data?: { email_token?: string; status?: string } }
    | null;

  // Already stopped is the outcome we wanted.
  if (fetched?.data?.status && fetched.data.status !== "active") {
    return { ok: true, detail: `Subscription was already ${fetched.data.status}.` };
  }

  const token = fetched?.data?.email_token;
  if (!token) {
    return { ok: false, detail: "could not read the subscription's cancel token" };
  }

  const disableRes = await fetch(`${PAYSTACK_API}/subscription/disable`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ code: subscriptionCode, token }),
    cache: "no-store",
  });
  const disabled = (await disableRes.json().catch(() => null)) as
    | { status?: boolean; message?: string }
    | null;

  if (disableRes.ok && disabled?.status) {
    return { ok: true, detail: "Subscription cancelled." };
  }

  const message = disabled?.message ?? `HTTP ${disableRes.status}`;
  if (/already|inactive|cancelled/i.test(message)) {
    return { ok: true, detail: message };
  }
  return { ok: false, detail: message };
}
