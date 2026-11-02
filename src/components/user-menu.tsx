import { BellRing, ChevronDown, Heart, LayoutDashboard, LogOut, MessageCircle, Package, PlusCircle, Settings, Shield, ShoppingCart, Store, Tag } from "lucide-react";
import { Link } from "@/i18n/client";
import { getDictionary, type Dictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { logoutAction } from "@/actions/auth";
import { AccountMenu } from "@/components/account-menu";
import { buttonClass } from "@/components/ui";
import { cartCount } from "@/lib/cart";
import { unreadCount } from "@/lib/messages";

// These stream in behind Suspense boundaries: they are the only per-user parts of the header.

/** "Hi! Sign in or register", or the signed-in name, at the start of the top bar. */
export async function Greeting() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (user) return <span>{t.nav.hiName(user.name.split(" ")[0])}</span>;
  return (
    <span>
      {t.nav.hi}{" "}
      <Link href="/login" className="text-brand-700 underline hover:text-brand-800">
        {t.nav.signIn}
      </Link>{" "}
      {t.nav.or}{" "}
      <Link href="/register" className="text-brand-700 underline hover:text-brand-800">
        {t.nav.register}
      </Link>
    </span>
  );
}

/** "My ReGear" in the top bar: a menu of the account's pages, or a way in when signed out. */
export async function MyRegearMenu() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (!user) {
    return (
      <Link href="/account" className="hover:text-brand-700 hover:underline">
        {t.nav.myRegear}
      </Link>
    );
  }
  return (
    <AccountMenu
      summaryClassName="gap-1 hover:text-brand-700"
      summary={
        <>
          {t.nav.myRegear}
          <ChevronDown className="size-3.5 transition-transform group-open:rotate-180" aria-hidden />
        </>
      }
    >
      <MenuItems t={t} admin={user.role === "ADMIN"} />
    </AccountMenu>
  );
}

/** On phones the top bar is hidden, so the account sits next to the logo instead. */
export async function UserMenu() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (!user) {
    return (
      <Link href="/login" className={buttonClass("secondary", "px-3")}>
        {t.nav.signIn}
      </Link>
    );
  }
  return (
    <AccountMenu
      summary={
        <span className="grid size-8 place-items-center rounded-full bg-brand-100 text-sm font-bold text-brand-800" aria-label={t.nav.myRegear}>
          {user.name.charAt(0).toUpperCase()}
        </span>
      }
      summaryClassName="rounded-full p-1 hover:bg-slate-100"
    >
      <MenuItems t={t} admin={user.role === "ADMIN"} />
    </AccountMenu>
  );
}

function MenuItems({ t, admin }: { t: Dictionary; admin: boolean }) {
  return (
    <>
      <MenuLink href="/account" icon={<LayoutDashboard className="size-4" />}>
        {t.nav.myAccount}
      </MenuLink>
      <MenuLink href="/account/orders" icon={<Package className="size-4" />}>
        {t.nav.purchases}
      </MenuLink>
      <MenuLink href="/account/offers" icon={<Tag className="size-4" />}>
        {t.account.nav.offers}
      </MenuLink>
      <MenuLink href="/account/messages" icon={<MessageCircle className="size-4" />}>
        {t.nav.messages}
      </MenuLink>
      <MenuLink href="/account/favorites" icon={<Heart className="size-4" />}>
        {t.nav.watchlist}
      </MenuLink>
      <MenuLink href="/account/searches" icon={<BellRing className="size-4" />}>
        {t.account.nav.searches}
      </MenuLink>
      <MenuLink href="/account/settings" icon={<Settings className="size-4" />}>
        {t.account.nav.settings}
      </MenuLink>
      <p className="mt-1 border-t border-slate-100 px-3 pt-2 pb-1 text-xs font-semibold text-slate-500">{t.nav.sellerTools}</p>
      <MenuLink href="/sell" icon={<Store className="size-4" />}>
        {t.nav.sellerDashboard}
      </MenuLink>
      <MenuLink href="/sell/listings/new" icon={<PlusCircle className="size-4" />}>
        {t.nav.listAnItem}
      </MenuLink>
      {admin && (
        <MenuLink href="/admin" icon={<Shield className="size-4" />}>
          {t.nav.admin}
        </MenuLink>
      )}
      <form action={logoutAction} className="mt-1 border-t border-slate-100 pt-1">
        <button type="submit" className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-slate-700 hover:bg-slate-100">
          <LogOut className="size-4" /> {t.nav.signOut}
        </button>
      </form>
    </>
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

/** The cart in the header, with how many items are in it. */
export async function CartLink({ className = "" }: { className?: string }) {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  const count = user ? await cartCount(user.id) : 0;
  return (
    <Link href="/cart" aria-label={t.cart.aria(count)} className={`relative inline-flex items-center rounded-lg p-1.5 text-slate-700 hover:bg-slate-100 hover:text-ink ${className}`}>
      <ShoppingCart className="size-5" aria-hidden />
      {count > 0 && (
        <span className="num absolute -top-1 -right-1 grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white" aria-hidden>
          {count}
        </span>
      )}
    </Link>
  );
}

/** "Messages" in the top bar, with the number of conversations waiting to be read. */
export async function MessagesLink() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (!user) return null;
  const unread = await unreadCount(user.id);
  return (
    <Link href="/account/messages" aria-label={t.messages.aria(unread)} className="inline-flex items-center gap-1 hover:text-brand-700 hover:underline">
      <MessageCircle className="size-3.5" aria-hidden /> {t.nav.messages}
      {unread > 0 && (
        <span className="num grid min-w-4.5 place-items-center rounded-full bg-danger px-1 text-[10px] leading-4.5 font-bold text-white" aria-hidden>
          {unread}
        </span>
      )}
    </Link>
  );
}
