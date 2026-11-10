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
  ],
};
