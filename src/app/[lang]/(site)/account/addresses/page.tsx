import type { Metadata } from "next";
import { getDictionary } from "@/i18n/server";
import { requireTrader } from "@/lib/auth/dal";
import { listAddresses } from "@/lib/addresses";
import { ADDRESS_LIMIT } from "@/lib/validation";
import { PageHeader } from "@/components/ui";
import { AddressBook } from "./address-book";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getDictionary()).account.addressesTitle };
}

export default async function AddressesPage() {
  const user = await requireTrader("/account/addresses");
  const [addresses, t] = await Promise.all([listAddresses(user.id), getDictionary()]);
  return (
    <>
      <PageHeader title={t.account.addressesTitle} description={t.account.addressesIntro(ADDRESS_LIMIT)} />
      <AddressBook addresses={addresses} defaultName={user.name} limit={ADDRESS_LIMIT} />
    </>
  );
}
