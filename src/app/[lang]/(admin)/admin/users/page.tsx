import type { Metadata } from "next";
import { Link } from "@/i18n/client";
import { getDictionary, getLocale } from "@/i18n/server";
import { db } from "@/lib/db";
import { requireAdmin } from "@/lib/auth/dal";
import { dayRange, like, readSearch } from "@/lib/admin/search";
import { formatDate, formatDateTime } from "@/lib/format";
import type { Prisma } from "@/generated/prisma/client";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { bannedNowWhere, isBanned } from "@/lib/account/ban-state";
import { Pager, SearchBar } from "../search-controls";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).admin.usersPage.title };
}

// What the list shows: everyone, one role, or the accounts an admin comes back to (banned, to lift; deleted, for records).
const FILTERS = ["USER", "ADMIN", "BANNED", "DELETED"] as const;
type Filter = (typeof FILTERS)[number];

function filterWhere(filter: Filter | undefined, now: Date): Prisma.UserWhereInput {
  switch (filter) {
    case "USER":
      return { role: "USER", deletedAt: null };
    case "ADMIN":
      return { role: "ADMIN" };
    case "BANNED":
      return { deletedAt: null, ...bannedNowWhere(now) };
    case "DELETED":
      return { deletedAt: { not: null } };
    default:
      return {};
  }
}

/** Banned and deleted accounts are listed by when that happened, most recent first. */
function filterOrder(filter: Filter | undefined): Prisma.UserOrderByWithRelationInput {
  if (filter === "BANNED") return { bannedAt: "desc" };
  if (filter === "DELETED") return { deletedAt: "desc" };
  return { createdAt: "desc" };
}

export default async function AdminUsersPage({ searchParams }: PageProps<"/[lang]/admin/users">) {
  const [locale, dict] = await Promise.all([getLocale(), getDictionary()]);
  const t = dict.admin.usersPage;
  await requireAdmin();
  const search = readSearch(await searchParams, FILTERS);
  const now = new Date();
  const where: Prisma.UserWhereInput = {
    ...filterWhere(search.status, now),
    ...(dayRange(search) ? { createdAt: dayRange(search) } : {}),
    ...(search.q
      ? { OR: [{ id: search.q }, { name: like(search.q) }, { email: like(search.q) }, { sellerProfile: { displayName: like(search.q) } }] }
      : {}),
  };
  const [users, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: filterOrder(search.status),
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

  return (
    <>
      <PageHeader title={t.title} description={t.intro} />
      <SearchBar
        search={search}
        path="/admin/users"
        placeholder={dict.admin.placeholders.users}
        statusLabel={t.showLabel}
        statuses={FILTERS.map((f) => ({ value: f, label: t.show[f] }))}
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
                    {u.deletedAt && ` · ${t.deletedOn(formatDate(u.deletedAt, locale))}`}
                    {!u.deletedAt && isBanned(u, now) && ` · ${u.bannedUntil ? t.bannedUntilShort(formatDateTime(u.bannedUntil, locale)) : t.bannedForeverShort}`}
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
