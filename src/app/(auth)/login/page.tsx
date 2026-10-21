import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/dal";
import { safeRedirectPath } from "@/lib/security/request";
import { isGoogleConfigured } from "@/lib/auth/google";
import { AuthError, GoogleButton } from "../google-button";
import { LoginForm } from "../auth-forms";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const { next, error } = await searchParams;
  const target = safeRedirectPath(next, "");
  if (await getCurrentUser()) redirect(target || "/account");
  return (
    <>
      <h1 className="text-2xl font-bold">Welcome back</h1>
      <p className="mt-1 mb-6 text-sm text-slate-600">Sign in to buy, sell and track your orders.</p>
      <AuthError code={typeof error === "string" ? error : undefined} />
      {isGoogleConfigured() && <GoogleButton next={target || undefined} from="login" />}
      <LoginForm next={target || undefined} googleEnabled={isGoogleConfigured()} />
    </>
  );
}
