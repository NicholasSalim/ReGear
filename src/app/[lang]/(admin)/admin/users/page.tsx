import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, like, readSearch } from "@/lib/admin/search";
import { formatDate } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { isBanned } from "@/lib/account/ban-state";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.usersPage.title };
}

const ROLES = ["USER", "ADMIN"] as const;

export default async function AdminUsersPage({ searchParams }: PageProps<"/[lang]/admin/users">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin.usersPage;
  await requireAdmin();
  const search = readSearch(await searchParams, ROLES);
  const where: Prisma.UserWhereInput = {
    ...(search.status ? { role: search.status } : {}),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    ...(search.q
      ? { OR: [{ id: search.q }, { name: like(search.q) }, { email: like(search.q) }, { sellerProfile: { displayName: like(search.q) } }] }
      : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: search.skip,
      take: search.take,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        deletedAt: true,
        lockedUntil: true,
        bannedAt: true,
        bannedUntil: true,
        sellerProfile: { select: { displayName: true } },
      },
    }),
    db.user.count({ where }),
  ]);
  const now = new Date();

  return (
    <>
      <PageHeader title={t.title} description={t.intro} />
      <SearchBar
        search={search}
        path="/admin/users"
        placeholder={dict.admin.placeholders.users}
        statusLabel={t.roleLabel}
        statuses={ROLES.map((r) => ({ value: r, label: t.role[r] }))}
      />
      {users.length === 0 ? (
        <EmptyState title={dict.admin.searchBar.none} />
      ) : (
        <ul className="card divide-y divide-slate-100">
          {users.map((u) => (
            <li key={u.id}>
              <Link href={`/admin/users/${u.id}`} className="flex flex-wrap items-center gap-3 p-4 text-sm hover:bg-slate-50">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{u.name || dict.common.deletedUser}</p>
                  <p className="truncate text-xs text-slate-500">
                    {u.email}
                    {u.sellerProfile?.displayName && ` · ${u.sellerProfile.displayName}`} · {t.joined(formatDate(u.createdAt, locale))}
                  </p>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {u.role === "ADMIN" && <Badge className="bg-inverse text-white ring-inverse">{t.role.ADMIN}</Badge>}
                  {u.deletedAt && <Badge className="bg-slate-100 text-slate-600 ring-slate-500/20">{t.deleted}</Badge>}
                  {u.lockedUntil && u.lockedUntil > now && <Badge className="bg-rose-50 text-rose-700 ring-rose-600/20">{t.locked}</Badge>}
                  {isBanned(u, now) && <Badge className="bg-rose-600 text-white ring-rose-600">{t.banned}</Badge>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
      <Pager search={search} total={total} path="/admin/users" />
    </>
  );
}
