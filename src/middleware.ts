import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/inventory/:path*",
    "/dispatch/:path*",
    "/staff/:path*",
    "/onboarding/:path*",
    "/auth/:path*",
    "/login",
    // The recovery flow relies on a session cookie being refreshed between the
    // email link and the reset form, so both routes have to pass through here.
    "/forgot-password",
    "/reset-password",
  ],
};
