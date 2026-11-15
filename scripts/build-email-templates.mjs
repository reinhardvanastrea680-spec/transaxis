#!/usr/bin/env node
/**
 * Generates the Transaxis auth email templates into supabase/templates/.
 *
 *   node scripts/build-email-templates.mjs
 *
 * Why a generator and not five hand-written files: the five templates differ
 * only in copy. Kept as five separate documents they drift — one gets a new
 * footer, the other four keep the old one, and nobody notices until a customer
 * forwards a mismatched email. Here the layout exists once and the copy is data.
 *
 * Constraints the markup has to respect (Gmail/Outlook/Apple Mail):
 *   - tables, not flexbox or grid
 *   - every style inline; <style> blocks are stripped by Gmail
 *   - no background images, no web fonts, no SVG
 *   - a plain-text fallback link under the button
 *
 * The only dynamic values are Supabase's template variables, listed per entry
 * in `vars` so it is obvious what each template promises to receive.
 */

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "supabase", "templates");

const BRAND = "#047857";
const CANVAS = "#FAFAF9";
const BORDER = "#E7E5E4";
const INK = "#0C0A09";
const BODY = "#44403C";
const MUTED = "#78716C";
const FAINT = "#A8A29E";
const SUPPORT = "transaxis6.ng@gmail.com";

const FONT =
  "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

/** @typedef {{file:string, name:string, subject:string, heading:string, lead:string, button:string, note:string, vars:string[]}} Template */

/** @type {Template[]} */
const TEMPLATES = [
  {
    file: "recovery.html",
    name: "Reset Password",
    subject: "Reset your Transaxis password",
    heading: "Reset your password",
    lead:
      "Someone asked to reset the password for your Transaxis account. If that was you, choose a new one below.",
    button: "Choose a new password",
    note:
      "If you did not request this, you can ignore this email. Your password will not change, and the link expires on its own.",
    vars: ["ConfirmationURL"],
  },
  {
    file: "confirmation.html",
    name: "Confirm signup",
    subject: "Confirm your Transaxis email",
    heading: "Confirm your email",
    lead:
      "Welcome to Transaxis. Confirm this address and your workspace is ready — stock, dispatches and delivery proof in one place.",
    button: "Confirm my email",
    note:
      "If you did not create a Transaxis account, ignore this email. Nothing is activated for this address until the link is opened.",
    vars: ["ConfirmationURL"],
  },
  {
    file: "magic-link.html",
    name: "Magic link",
    subject: "Your Transaxis sign-in link",
    heading: "Your sign-in link",
    lead:
      "Use the button below to sign in. The link works once and expires shortly, so open it on the device you want to sign in from.",
    button: "Sign in to Transaxis",
    note:
      "If you did not ask for this link, ignore this email. Nobody can sign in without opening it.",
    vars: ["ConfirmationURL"],
  },
  {
    file: "email-change.html",
    name: "Change email address",
    subject: "Confirm your new Transaxis email",
    heading: "Confirm your new email",
    lead:
      "You asked to move this Transaxis account to <strong style=\"color:#0C0A09;\">{{ .NewEmail }}</strong>. Confirm the change below — the old address stops working once you do.",
    button: "Confirm the change",
    note:
      "If you did not request this, ignore this email and your address stays as it is. It is worth changing your password as well.",
    vars: ["ConfirmationURL", "NewEmail"],
  },
  {
    file: "invite.html",
    name: "Invite user",
    subject: "You have been invited to Transaxis",
    heading: "You have been invited",
    lead:
      "Someone added you to their Transaxis workspace. Set a password and you will land straight in the dashboard, with the stock and dispatches your role allows.",
    button: "Accept the invitation",
    note:
      "If you were not expecting this, you can ignore it — the invitation expires on its own and nothing is created for this address.",
    vars: ["ConfirmationURL"],
  },
];

/**
 * The layout. `{{ .ConfirmationURL }}` is the only value every template needs;
 * it already carries the redirect_to the app asked for, so the link lands back
 * on transaxis.com.ng rather than on a Supabase page.
 */
function render(t) {
  const body = `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CANVAS};padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#FFFFFF;border:1px solid ${BORDER};border-radius:14px;overflow:hidden;font-family:${FONT};">

            <!-- Wordmark -->
            <tr>
              <td style="background:${BRAND};padding:20px 32px;">
                <span style="font-size:17px;font-weight:700;letter-spacing:-0.2px;color:#FFFFFF;">Transaxis</span>
                <span style="font-size:11px;font-weight:500;letter-spacing:0.08em;text-transform:uppercase;color:#A7F3D0;padding-left:10px;">Stock &amp; Dispatch</span>
              </td>
            </tr>

            <!-- Body -->
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h1 style="margin:0;font-size:21px;line-height:1.3;font-weight:600;color:${INK};">${t.heading}</h1>
                <p style="margin:14px 0 0 0;font-size:15px;line-height:1.6;color:${BODY};">
                  ${t.lead}
                </p>
              </td>
            </tr>

            <!-- Button -->
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <table role="presentation" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="background:${BRAND};border-radius:10px;">
                      <a href="{{ .ConfirmationURL }}"
                         style="display:inline-block;padding:13px 26px;font-size:15px;font-weight:600;color:#FFFFFF;text-decoration:none;border-radius:10px;">
                        ${t.button}
                      </a>
                    </td>
                  </tr>
                </table>
                <p style="margin:18px 0 0 0;font-size:13px;line-height:1.6;color:${MUTED};">
                  If the button does not work, copy this address into your browser:
                </p>
                <p style="margin:6px 0 0 0;font-size:12px;line-height:1.5;word-break:break-all;color:${BRAND};">
                  {{ .ConfirmationURL }}
                </p>
              </td>
            </tr>

            <!-- Caveat -->
            <tr>
              <td style="padding:26px 32px 28px 32px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BORDER};">
                  <tr>
                    <td style="padding-top:18px;font-size:13px;line-height:1.6;color:${MUTED};">
                      ${t.note}
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- Footer -->
            <tr>
              <td style="background:${CANVAS};border-top:1px solid ${BORDER};padding:18px 32px;">
                <p style="margin:0;font-size:12px;line-height:1.6;color:${FAINT};">
                  Transaxis — stock, dispatch and delivery proof for Nigerian logistics.
                </p>
                <p style="margin:6px 0 0 0;font-size:12px;line-height:1.6;color:${FAINT};">
                  Need help? Reply to this email or write to
                  <a href="mailto:${SUPPORT}" style="color:${BRAND};text-decoration:none;">${SUPPORT}</a>.
                </p>
              </td>
            </tr>

          </table>

          <p style="max-width:560px;margin:16px auto 0 auto;font-size:11px;line-height:1.6;color:${FAINT};text-align:center;font-family:${FONT};">
            You are receiving this because of activity on a Transaxis account.
          </p>
        </td>
      </tr>
    </table>`;

  return `<!doctype html>
<!--
  Transaxis — ${t.name.toLowerCase()} email.

  Generated by scripts/build-email-templates.mjs. Edit the copy there, not here.

  Paste the contents of the <body> into Supabase → Authentication → Emails →
  Templates → "${t.name}", or push it with:
      node scripts/configure-auth-email.mjs --templates-only

  Dynamic values: ${t.vars.map((v) => `{{ .${v} }}`).join(", ")}
-->
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${t.subject}</title>
  </head>
  <body style="margin:0;padding:0;background:${CANVAS};">${body}
  </body>
</html>
`;
}

await mkdir(OUT_DIR, { recursive: true });

for (const t of TEMPLATES) {
  const path = join(OUT_DIR, t.file);
  await writeFile(path, render(t), "utf8");
  console.log(`${t.file.padEnd(20)} ${String(t.subject).padEnd(38)} ${t.name}`);
}

console.log(`\n${TEMPLATES.length} templates written to supabase/templates/`);
