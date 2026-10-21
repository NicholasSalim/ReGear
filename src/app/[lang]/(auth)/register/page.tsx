import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/security/request";
import { isGoogleConfigured } from "@/lib/auth/google";
import { AuthError, GoogleButton } from "../google-button";
import { RegisterForm } from "../auth-forms";

export const metadata: Metadata = { title: "Create account", robots: { index: false } };

export default async function RegisterPage({ searchParams }: PageProps<"/[lang]/register">) {
  const { next, error } = await searchParams;
  const target = safeRedirectPath(next, "");
  if (await getCurrentUser()) redirect(target || "/account");
  return (
    <>
      <h1 className="text-2xl font-bold">Create your ReGear account</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">One account to buy and sell. It takes less than a minute.</p>
      <AuthError code={typeof error === "string" ? error : undefined} />
      {isGoogleConfigured() && <GoogleButton next={target || undefined} from="register" />}
      <RegisterForm next={target || undefined} />
    </>
  );
}
