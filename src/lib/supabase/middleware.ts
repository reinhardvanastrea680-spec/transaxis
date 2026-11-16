import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // If Supabase is not configured yet, don't block the request.
  if (!url || !key) {
    return NextResponse.next({ request });
  }

  // Fast path: if there is no Supabase auth cookie, the visitor is
  // anonymous. Skip the (slow) round-trip to Supabase's auth endpoint
  // entirely — this keeps the landing/login pages snappy.
  const hasAuthCookie = request.cookies
    .getAll()
    .some((c) => c.name.startsWith("sb-") && c.name.includes("auth-token"));

  if (!hasAuthCookie) {
    return NextResponse.next({ request });
  }

  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(url, key, {
    /**
     * `secure` keeps the session cookie off plain HTTP entirely, rather than
     * relying on the HSTS redirect to catch it. On a first visit — before the
     * browser has seen the Strict-Transport-Security header — a captive portal
     * or a network that downgrades the request would otherwise receive the
     * token. `HttpOnly` is deliberately not set here: the browser client in
     * src/lib/supabase/client.ts reads this cookie for sign-in and storage
     * uploads, so hiding it from scripts would break those flows.
     */
    cookieOptions: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  await supabase.auth.getUser();

  return supabaseResponse;
}
