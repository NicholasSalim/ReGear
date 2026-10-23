import { Heart, LayoutDashboard, LogOut, Package, Shield, Store } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { logoutAction } from "@/actions/auth";
import { buttonClass } from "@/components/ui";

// Streams in behind a Suspense boundary: it is the only per-user part of the header.
export async function UserMenu() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (!user) {
    return (
      <>
        <Link href="/login" className={buttonClass("secondary", "max-sm:px-3")}>
          {t.nav.signIn}
        </Link>
        <Link href="/register" className={buttonClass("primary", "max-sm:hidden")}>
          {t.nav.join}
        </Link>
      </>
    );
  }

  return (
    <details className="group relative">
      <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full p-1 hover:bg-slate-100 sm:pr-3 [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800" aria-hidden>
          {user.name.charAt(0).toUpperCase()}
        </span>
        <span className="hidden max-w-[8rem] truncate text-sm font-medium sm:block">{user.name}</span>
      </summary>
      <div className="absolute right-0 mt-2 w-56 rounded-xl border border-slate-200 bg-white p-1.5 text-sm shadow-lg">
        <MenuLink href="/account" icon={<LayoutDashboard className="size-4" />}>
          {t.nav.myAccount}
        </MenuLink>
        <MenuLink href="/account/orders" icon={<Package className="size-4" />}>
          {t.nav.purchases}
        </MenuLink>
        <MenuLink href="/account/favorites" icon={<Heart className="size-4" />}>
          {t.nav.savedItems}
        </MenuLink>
        <MenuLink href="/sell" icon={<Store className="size-4" />}>
          {t.nav.sellerDashboard}
        </MenuLink>
        {user.role === "ADMIN" && (
          <MenuLink href="/admin" icon={<Shield className="size-4" />}>
            {t.nav.admin}
          </MenuLink>
        )}
        <form action={logoutAction} className="mt-1 border-t border-slate-100 pt-1">
          <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100">
            <LogOut className="size-4" /> {t.nav.signOut}
          </button>
        </form>
      </div>
    </details>
  );
}

function MenuLink({ href, icon, children }: { href: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center gap-2 rounded-lg px-3 py-2 text-slate-700 hover:bg-slate-100">
      {icon}
      {children}
    </Link>
  );
}
