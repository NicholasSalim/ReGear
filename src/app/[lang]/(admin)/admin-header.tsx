import { Suspense } from "react";
import { ExternalLink, LogOut } from "lucide-react";
import { Link } from "@/i18n/client";
import { LanguageSwitcher } from "@/i18n/language-switcher";
import { getDictionary } from "@/i18n/server";
import { getCurrentUser } from "@/lib/auth/dal";
import { payments } from "@/lib/payments";
import { payouts } from "@/lib/payouts/provider";
import { logoutAction } from "@/actions/auth";
import { LogoMark } from "@/components/condition-strip";
import { Skeleton } from "@/components/ui";

export async function AdminHeader() {
  const t = await getDictionary();
  const f = t.admin.frame;
  // Say plainly when money isn't real, so a test never passes for production.
  const badges = [payments.mode === "sandbox" && f.paymentsSandbox, payments.mode === "simulated" && f.paymentsSimulated, payouts.mode === "simulated" && f.payoutsSimulated].filter(
    (b): b is string => !!b,
  );
  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-ink text-white">
      <div className="container-page flex h-14 items-center gap-3">
        <Link href="/admin" className="flex items-center gap-2" aria-label={f.homeAria}>
          <LogoMark />
          <span className="wide text-lg leading-none font-extrabold tracking-[-0.03em] max-[359px]:hidden">ReGear</span>
          <span className="rounded bg-white/15 px-1.5 py-0.5 text-xs font-semibold tracking-wide uppercase">{t.admin.title}</span>
        </Link>
        <ul className="hidden gap-1.5 md:flex" aria-label={f.environment}>
          {badges.map((b) => (
            <li key={b} className="rounded bg-amber-300 px-1.5 py-0.5 text-xs font-semibold text-amber-950">{b}</li>
          ))}
        </ul>
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <Link href="/" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
            <ExternalLink className="size-4" aria-hidden />
            <span className="max-sm:sr-only">{f.viewSite}</span>
          </Link>
          <div className="max-sm:hidden [&_a]:text-slate-300 [&_a:hover]:text-white [&_a[aria-current]]:text-white [&_span]:text-slate-500">
            <Suspense fallback={null}>
              <LanguageSwitcher />
            </Suspense>
          </div>
          <Suspense fallback={<Skeleton className="h-8 w-24 bg-white/10" />}>
            <AdminAccount />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

// The only per-user part of the bar: who is signed in, and a way out.
async function AdminAccount() {
  const [user, t] = await Promise.all([getCurrentUser(), getDictionary()]);
  if (!user) return null;
  return (
    <div className="flex items-center gap-2">
      <span className="hidden max-w-[10rem] truncate text-sm text-slate-300 sm:block">{user.name}</span>
      <form action={logoutAction}>
        <button type="submit" className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium text-slate-200 hover:bg-white/10 hover:text-white">
          <LogOut className="size-4" aria-hidden />
          <span className="max-sm:sr-only">{t.nav.signOut}</span>
        </button>
      </form>
    </div>
  );
}
