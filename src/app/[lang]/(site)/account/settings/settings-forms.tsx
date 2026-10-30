"use client";

import { Link, useT } from "@/i18n/client";
import { changePasswordAction, deleteAccountAction, updateProfileAction } from "@/actions/auth";
import type { DeletionBlockers } from "@/lib/account/delete";
import { ActionForm, FormMessage, PasswordInput, SubmitButton } from "@/components/forms";
import { Field } from "@/components/ui";

export function SettingsForms({ name, email, hasPassword, googleEmail }: { name: string; email: string; hasPassword: boolean; googleEmail?: string }) {
  const t = useT().settings;
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      <ActionForm action={updateProfileAction} className="card space-y-4 p-6">
        {(s) => (
          <>
            <h2 className="font-bold">{t.profile}</h2>
            <FormMessage state={s} />
            <Field label={t.email} name="email-ro">
              <input id="email-ro" value={email} disabled className="input" readOnly />
            </Field>
            <Field label={t.fullName} name="name" error={s.fieldErrors?.name}>
              <input id="name" name="name" defaultValue={name} required maxLength={60} className="input" />
            </Field>
            <p className="text-sm text-slate-600">{googleEmail ? t.googleLinked(googleEmail) : t.googleNotLinked}</p>
            <SubmitButton>{t.saveProfile}</SubmitButton>
          </>
        )}
      </ActionForm>

      <ActionForm action={changePasswordAction} className="card space-y-4 p-6" resetOnSuccess>
        {(s) => (
          <>
            <h2 className="font-bold">{hasPassword ? t.changePassword : t.setPassword}</h2>
            <p className="text-sm text-slate-600">{hasPassword ? t.changeHint : t.setHint}</p>
            <FormMessage state={s} />
            {hasPassword && (
              <Field label={t.currentPassword} name="currentPassword" error={s.fieldErrors?.currentPassword}>
                <PasswordInput id="currentPassword" name="currentPassword" autoComplete="current-password" />
              </Field>
            )}
            <Field label={t.newPassword} name="newPassword" error={s.fieldErrors?.newPassword}>
              <PasswordInput id="newPassword" name="newPassword" autoComplete="new-password" />
            </Field>
            <Field label={t.confirmPassword} name="confirmPassword" error={s.fieldErrors?.confirmPassword}>
              <PasswordInput id="confirmPassword" name="confirmPassword" autoComplete="new-password" />
            </Field>
            <SubmitButton>{hasPassword ? t.changePassword : t.setPasswordButton}</SubmitButton>
          </>
        )}
      </ActionForm>
    </div>
  );
}

export function DeleteAccountForm({ email, hasPassword, blockers }: { email: string; hasPassword: boolean; blockers: DeletionBlockers }) {
  const t = useT().deleteAccount;
  const blocked = blockers.admin || blockers.purchases > 0 || blockers.sales > 0 || blockers.balance;
  return (
    <section className="card mt-6 space-y-4 border-rose-200 p-6" aria-labelledby="delete-account">
      <div>
        <h2 id="delete-account" className="font-bold text-rose-700">{t.title}</h2>
        <p className="text-sm text-slate-600">{t.intro}</p>
      </div>
      <div className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
        <div>
          <h3 className="font-semibold">{t.removedTitle}</h3>
          <ul className="mt-1 list-disc space-y-0.5 pl-5 text-slate-600">
            {t.removed.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="font-semibold">{t.keptTitle}</h3>
          <p className="mt-1 text-slate-600">{t.kept}</p>
        </div>
      </div>

      {blocked ? (
        <div role="status" className="rounded-lg bg-amber-50 p-4 text-sm text-amber-900">
          <p className="font-semibold">{t.blockedTitle}</p>
          <ul className="mt-2 space-y-1">
            {blockers.admin && <li>{t.admin}</li>}
            {blockers.purchases > 0 && (
              <li>
                {t.purchases(blockers.purchases)}{" "}
                <Link href="/account/orders" className="font-semibold underline">{t.viewPurchases}</Link>
              </li>
            )}
            {blockers.sales > 0 && (
              <li>
                {t.sales(blockers.sales)}{" "}
                <Link href="/sell/orders" className="font-semibold underline">{t.viewSales}</Link>
              </li>
            )}
            {blockers.balance && (
              <li>
                {t.balance}{" "}
                <Link href="/sell/payouts" className="font-semibold underline">{t.viewPayouts}</Link>
              </li>
            )}
          </ul>
          {(blockers.purchases > 0 || blockers.sales > 0) && <p className="mt-2 text-xs">{t.deliveredNote}</p>}
        </div>
      ) : (
        <ActionForm action={deleteAccountAction} confirm={t.confirmDialog} className="max-w-md space-y-4">
          {(s) => (
            <>
              <FormMessage state={s} />
              <Field label={t.confirmEmail(email)} name="confirmEmail" error={s.fieldErrors?.confirmEmail}>
                <input id="confirmEmail" name="confirmEmail" type="email" autoComplete="off" className="input" />
              </Field>
              {hasPassword && (
                <Field label={t.password} name="deletePassword" error={s.fieldErrors?.password}>
                  <PasswordInput id="deletePassword" name="password" autoComplete="current-password" />
                </Field>
              )}
              <SubmitButton variant="danger" pendingText={t.deleting}>
                {t.submit}
              </SubmitButton>
            </>
          )}
        </ActionForm>
      )}
    </section>
  );
}
