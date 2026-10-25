import "server-only";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import nodemailer, { type Transporter } from "nodemailer";
import { env, isProd } from "@/lib/env";

export type OutgoingEmail = { to: string; subject: string; html: string; text: string };

/** Production without SMTP_URL: the email stays queued instead of being lost. */
export class EmailNotConfiguredError extends Error {
  constructor() {
    super("SMTP_URL is not set; the email stays queued");
    this.name = "EmailNotConfiguredError";
  }
}

/** Development and tests write emails here instead of sending them (listed at /api/dev/mail). */
export const DEV_MAIL_DIR = path.resolve(env.STORAGE_DIR, "dev-mail");

let smtp: Transporter | undefined;

export async function sendEmail(mail: OutgoingEmail) {
  if (env.SMTP_URL) {
    smtp ??= nodemailer.createTransport(env.SMTP_URL);
    await smtp.sendMail({ from: env.EMAIL_FROM, ...mail });
    return;
  }
  if (isProd) throw new EmailNotConfiguredError();
  await mkdir(DEV_MAIL_DIR, { recursive: true });
  const name = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  await writeFile(path.join(DEV_MAIL_DIR, name), JSON.stringify({ from: env.EMAIL_FROM, date: new Date().toISOString(), ...mail }));
  console.info(`[email] to ${mail.to}: ${mail.subject}`);
}
