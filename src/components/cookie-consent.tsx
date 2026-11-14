"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { BarChart3, Cookie, Lock } from "lucide-react";
import { Button } from "./ui/button";
import { Modal } from "./ui/modal";
import {
  CONSENT_COOKIE,
  acceptAll,
  consentCookieAttributes,
  customConsent,
  essentialOnly,
  hasDecided,
  parseConsent,
  serializeConsent,
  type ConsentState,
} from "@/lib/consent";

/** Fired by anything that wants to reopen the preferences dialog. */
const COOKIE_SETTINGS_EVENT = "tx:open-cookie-settings";

export function openCookieSettings() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT));
}

function readCookie(name: string): string | null {
  const hit = document.cookie
    .split("; ")
    .find((part) => part.startsWith(`${name}=`));
  return hit ? hit.slice(name.length + 1) : null;
}

function writeConsent(state: ConsentState) {
  const secure = window.location.protocol === "https:";
  document.cookie = `${CONSENT_COOKIE}=${serializeConsent(state)}; ${consentCookieAttributes(secure)}`;
}

function Switch({
  checked,
  disabled,
  onChange,
  label,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange?: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange?.(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
        checked ? "bg-brand" : "bg-line-strong"
      } ${disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
    >
      <span
        className={`inline-block size-4 rounded-full bg-white shadow-sm transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function CookieConsent() {
  const [state, setState] = useState<ConsentState | null>(null);
  const [ready, setReady] = useState(false);
  const [showPreferences, setShowPreferences] = useState(false);
  const [draftAnalytics, setDraftAnalytics] = useState(false);

  // Read on mount only: reading a cookie during render would differ between the
  // server (no cookie) and the client (cookie), which breaks hydration.
  useEffect(() => {
    setState(parseConsent(readCookie(CONSENT_COOKIE)));
    setReady(true);
  }, []);

  const openPreferences = useCallback(() => {
    setDraftAnalytics(parseConsent(readCookie(CONSENT_COOKIE))?.analytics ?? false);
    setShowPreferences(true);
  }, []);

  useEffect(() => {
    window.addEventListener(COOKIE_SETTINGS_EVENT, openPreferences);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, openPreferences);
  }, [openPreferences]);

  function decide(next: ConsentState) {
    writeConsent(next);
    setState(next);
    setShowPreferences(false);
  }

  if (!ready) return null;

  const decided = hasDecided(state);
  const showBanner = !decided;

  return (
    <>
      {showBanner && (
        <div
          role="region"
          aria-label="Cookie consent"
          className="fixed inset-x-0 bottom-0 z-40 p-3 sm:p-4"
        >
          <div className="mx-auto max-w-[920px] rounded-card border border-line bg-surface p-4 shadow-lg ring-1 ring-black/[0.04] sm:p-5">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
              <span className="hidden size-9 shrink-0 items-center justify-center rounded-control bg-brand-soft text-brand sm:flex">
                <Cookie size={17} strokeWidth={1.9} aria-hidden="true" />
              </span>

              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium text-ink">Cookies on Transaxis</p>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  We use essential cookies to keep you signed in. We do not use
                  advertising or tracking cookies, and we never sell your data.
                  {" "}
                  <Link href="/cookies" className="font-medium text-brand hover:underline">
                    Cookie policy
                  </Link>
                </p>
              </div>

              <div className="flex shrink-0 flex-col gap-2 sm:flex-row sm:items-center">
                <Button size="sm" onClick={() => decide(acceptAll())}>
                  Accept all
                </Button>
                <Button size="sm" variant="outline" onClick={() => decide(essentialOnly())}>
                  Essential only
                </Button>
                <Button size="sm" variant="ghost" onClick={openPreferences}>
                  Manage
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <Modal
        open={showPreferences}
        onClose={() => setShowPreferences(false)}
        title="Cookie preferences"
      >
        <div className="space-y-4">
          <p className="text-sm leading-6 text-ink-muted">
            Choose what Transaxis may store on this device. Essential cookies are
            required for signing in and cannot be switched off.
          </p>

          <div className="divide-y divide-line rounded-control border border-line">
            <div className="flex items-start gap-3 p-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-sunken text-ink-muted">
                <Lock size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">Essential</p>
                  <span className="text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                    Always on
                  </span>
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Keeps you signed in and protects your session. Without these the
                  app cannot work.
                </p>
              </div>
              <Switch checked disabled label="Essential cookies (always on)" />
            </div>

            <div className="flex items-start gap-3 p-3.5">
              <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded bg-sunken text-ink-muted">
                <BarChart3 size={15} aria-hidden="true" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-medium text-ink">Analytics</p>
                  <Switch
                    checked={draftAnalytics}
                    onChange={setDraftAnalytics}
                    label="Analytics cookies"
                  />
                </div>
                <p className="mt-1 text-xs leading-5 text-ink-muted">
                  Not in use today. If we add usage analytics later, this setting
                  decides whether it runs. Off unless you turn it on.
                </p>
              </div>
            </div>
          </div>

          <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:justify-end">
            <Button
              variant="outline"
              onClick={() => decide(essentialOnly())}
            >
              Essential only
            </Button>
            <Button onClick={() => decide(customConsent({ analytics: draftAnalytics }))}>
              Save preferences
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

/**
 * Footer link that reopens the preferences dialog. Consent must be as easy to
 * withdraw as it was to give, so this has to be reachable from every page that
 * links the policy.
 */
export function CookieSettingsLink({
  className = "",
  children = "Cookie settings",
}: {
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <button type="button" onClick={openCookieSettings} className={className}>
      {children}
    </button>
  );
}
