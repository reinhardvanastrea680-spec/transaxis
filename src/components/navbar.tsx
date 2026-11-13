"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Boxes, LogOut, Menu, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/theme-toggle";

// Drivers get one destination. Everything else in the nav is office work.
const OFFICE_ROLES = ["owner", "admin", "warehouse", "dispatcher", "staff"];

const NAV = [
  { href: "/dashboard", label: "Dashboard", roles: OFFICE_ROLES },
  { href: "/inventory", label: "Inventory", roles: OFFICE_ROLES },
  { href: "/stocktaking", label: "Stocktaking", roles: ["owner", "admin", "warehouse"] },
  { href: "/dispatch", label: "Dispatch" },
  { href: "/reports", label: "Reports", roles: ["owner", "admin", "warehouse"] },
  { href: "/staff", label: "Staff", roles: ["owner", "admin", "warehouse"] },
  { href: "/billing", label: "Billing", roles: ["owner", "admin"] },
];

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState<string | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured()) {
      setLoading(false);
      return;
    }
    const supabase = createClient();

    async function loadRole(userId: string | undefined) {
      if (!userId) {
        setRole(null);
        return;
      }
      const { data } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", userId)
        .maybeSingle();
      setRole(data?.role ?? null);
    }

    supabase.auth.getUser().then(async ({ data }) => {
      setEmail(data.user?.email ?? null);
      await loadRole(data.user?.id);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (_e, session) => {
      setEmail(session?.user?.email ?? null);
      await loadRole(session?.user?.id);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signOut() {
    if (!isSupabaseConfigured()) return;
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const isAuthPage = pathname === "/login" || pathname.startsWith("/auth");
  const isLanding = pathname === "/";
  const items = NAV.filter(
    (item) => !item.roles || (role && item.roles.includes(role)),
  );

  return (
    <header
      className={`sticky top-0 z-40 border-b border-line bg-surface/95 backdrop-blur ${
        isLanding ? "" : "shadow-[0_1px_0_0_var(--color-line)]"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-[1200px] items-center justify-between px-5 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 font-medium tracking-[-0.01em] text-ink"
          aria-label="Transaxis home"
        >
          <span className="flex size-8 items-center justify-center rounded-control bg-brand text-white overflow-hidden">
            <img src="/logo.svg" alt="" width={24} height={24} className="size-6" />
          </span>
          <span>Transaxis</span>
        </Link>

        {!isAuthPage && !isLanding && items.length > 0 && (
          <nav
            className="hidden items-center gap-1 md:flex"
            aria-label="Main navigation"
          >
            {items.map((item) => {
              const active = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={`rounded-control px-3 py-2 text-sm font-medium transition-colors ${
                    active
                      ? "bg-sunken text-ink"
                      : "text-ink-muted hover:bg-sunken hover:text-ink"
                  }`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
        )}

        <div className="flex items-center gap-2">
          <ThemeToggle />
          {!loading && email ? (
            <>
              <span className="hidden max-w-[180px] truncate text-sm text-ink-muted lg:inline">
                {email}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={signOut}
                className="hidden sm:inline-flex"
              >
                <LogOut size={14} aria-hidden="true" />
                Sign out
              </Button>
            </>
          ) : !loading && !email && !isAuthPage ? (
            <Link href="/login">
              <Button size="sm">Sign in</Button>
            </Link>
          ) : null}

          {!isAuthPage && !isLanding && (
            <button
              className="flex size-11 items-center justify-center rounded-control text-ink transition-colors hover:bg-sunken md:hidden"
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
            >
              {menuOpen ? (
                <X size={20} aria-hidden="true" />
              ) : (
                <Menu size={20} aria-hidden="true" />
              )}
            </button>
          )}
        </div>
      </div>

      {menuOpen && !isAuthPage && !isLanding && (
        <nav
          className="border-t border-line bg-surface md:hidden"
          aria-label="Mobile navigation"
        >
          <div className="mx-auto flex max-w-[1200px] flex-col px-5 sm:px-8">
            {items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setMenuOpen(false)}
                className={`border-b border-line py-3 text-sm font-medium ${
                  pathname === item.href ? "text-ink" : "text-ink-muted"
                }`}
              >
                {item.label}
              </Link>
            ))}
            {email && (
              <button
                onClick={signOut}
                className="flex items-center gap-2 py-3 text-sm font-medium text-ink-muted"
              >
                <LogOut size={14} aria-hidden="true" />
                Sign out
              </button>
            )}
          </div>
        </nav>
      )}
    </header>
  );
}
