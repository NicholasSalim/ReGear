import { AdminHeader } from "./admin-header";

// Chrome for the back office: a slim bar of its own, without the marketplace's
// search, categories and footer. Every admin page still checks the role itself.
export default function AdminFrameLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <AdminHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
    </>
  );
}
