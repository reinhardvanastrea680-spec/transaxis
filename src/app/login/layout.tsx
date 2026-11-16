import type { Metadata } from "next";
import { pageMetadata } from "@/lib/seo";

/**
 * page.tsx is a client component (`"use client"`), and a client component
 * cannot export `metadata`. The metadata lives here instead.
 *
 * The canonical matters more than it looks: the signup screen is the same route
 * with `?mode=signup`, and without a canonical Google would treat those as two
 * separate pages competing for the same brand queries.
 */
export const metadata: Metadata = pageMetadata({
  title: "Sign in",
  description:
    "Sign in to your Transaxis workspace to manage inventory, dispatch and staff.",
  path: "/login",
});

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
