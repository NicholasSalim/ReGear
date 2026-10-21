// "Continue with Google" follows Google's sign-in branding guidelines (official
// "G" mark on a neutral button). A plain link: the OAuth flow starts with a GET.
export function GoogleButton({ next, from }: { next?: string; from: "login" | "register" }) {
  const qs = new URLSearchParams({ from });
  if (next) qs.set("next", next);
  const href = `/api/auth/google?${qs}`;
  return (
    <>
      <a
        href={href}
        className="flex h-11 w-full items-center justify-center gap-3 rounded-lg border border-rule bg-white text-sm font-semibold text-ink hover:border-slate-400"
      >
        <svg viewBox="0 0 48 48" className="size-5" aria-hidden>
          <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
          <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
          <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
          <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
        </svg>
        Continue with Google
      </a>
      <div className="my-5 flex items-center gap-3 text-xs text-slate-500">
        <span className="h-px flex-1 bg-rule" />
        or use your email
        <span className="h-px flex-1 bg-rule" />
      </div>
    </>
  );
}

const ERRORS: Record<string, string> = {
  google_unavailable: "Google sign-in isn't set up on this site yet. Use your email and password.",
  google_denied: "Google sign-in was cancelled or blocked. If you didn't cancel, this Google account may not be allowed to use the app yet. Try another account or use your email.",
  google_misconfigured: "Google sign-in is temporarily unavailable on our side. Use your email for now.",
  google_state: "Your Google sign-in expired before it finished. Click Continue with Google again, in the same browser tab.",
  google_rejected: "Google didn't confirm a verified email for this account. Verify your email with Google, or sign in with your password.",
  google_failed: "Couldn't reach Google right now. Try again in a moment.",
  locked: "This account is temporarily locked after repeated failed sign-ins. Try again in a few minutes.",
  rate_limited: "Too many sign-in attempts. Wait a few minutes and try again.",
};

export function AuthError({ code }: { code?: string }) {
  const message = code ? ERRORS[code] : undefined;
  if (!message) return null;
  return (
    <p role="alert" className="mb-4 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700">
      {message}
    </p>
  );
}
