import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      // Match the server's cookie flags so a token written here is not the one
      // that leaks over HTTP. `HttpOnly` cannot be used: this client has to read
      // the cookie itself to sign in and to upload photos.
      cookieOptions: {
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
      },
    },
  );
}
