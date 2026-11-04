"use server";

import { redirect } from "next/navigation";
import { localePath } from "@/i18n/locales";
import { refresh } from "next/cache";
import { actionI18n, runAction, type ActionState, requireTraderStrict } from "@/lib/action";
import { requireUserStrict } from "@/lib/auth/dal";
import { rateLimit } from "@/lib/security/rate-limit";
import * as cart from "@/lib/cart";
import * as messages from "@/lib/messages";
import * as searches from "@/lib/saved-searches";
import { id as idSchema } from "@/lib/validation";

// Cart, messages and saved searches: the buyer's tools around a purchase.

export async function addToCartAction(listingId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(listingId);
    await cart.addToCart(user.id, listingId);
    refresh();
    return { ok: true, message: t.actions.addedToCart };
  });
}

export async function removeFromCartAction(listingId: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(listingId);
    await cart.removeFromCart(user.id, listingId);
    refresh();
    return { ok: true, message: t.actions.removedFromCart };
  });
}

/** The message text, or the reason it can't be sent. */
async function messageBody(formData: FormData): Promise<{ body: string } | { error: string; fieldErrors: Record<string, string> }> {
  const { t } = await actionI18n();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { error: t.actions.messageEmpty, fieldErrors: { body: t.actions.messageEmpty } };
  if (body.length > messages.MESSAGE_MAX) {
    const msg = t.actions.messageTooLong(messages.MESSAGE_MAX);
    return { error: msg, fieldErrors: { body: msg } };
  }
  return { body };
}

/** First message about a listing; opens the conversation afterwards. */
export async function startConversationAction(listingId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  let conversationId: string | undefined;
  const result = await runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    if (!user.emailVerified) return { error: t.domain.emailUnverified };
    idSchema.parse(listingId);
    if (!(await rateLimit(`message:${user.id}`, 60, 3600)).ok) return { error: t.actions.messageLimit };
    const parsed = await messageBody(formData);
    if ("error" in parsed) return parsed;
    ({ conversationId } = await messages.startConversation(user.id, listingId, parsed.body));
  });
  if (conversationId) redirect(localePath(`/account/messages/${conversationId}`, (await actionI18n()).locale));
  return result;
}

export async function replyAction(conversationId: string, _prev: ActionState, formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    if (!user.emailVerified) return { error: t.domain.emailUnverified };
    idSchema.parse(conversationId);
    if (!(await rateLimit(`message:${user.id}`, 60, 3600)).ok) return { error: t.actions.messageLimit };
    const parsed = await messageBody(formData);
    if ("error" in parsed) return parsed;
    await messages.reply(user.id, conversationId, parsed.body);
    refresh();
    return { ok: true, message: t.actions.messageSent };
  });
}

/** Called when a conversation is on screen. Never fails loudly: it only moves a read marker. */
export async function markReadAction(conversationId: string) {
  const user = await requireUserStrict();
  if (!idSchema.safeParse(conversationId).success) return;
  await messages.markRead(user.id, conversationId);
}

/** Save the results page's current filters. `query` is the page's own query string; it's re-parsed here. */
export async function saveSearchAction(query: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t, locale } = await actionI18n();
    const params = searches.parseQuery(query);
    await searches.saveSearch(user.id, params, searches.describeSearch(params, t, locale));
    refresh();
    return { ok: true, message: t.actions.searchSaved };
  });
}

export async function deleteSavedSearchAction(id: string, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(id);
    await searches.deleteSavedSearch(user.id, id);
    refresh();
    return { ok: true, message: t.actions.searchDeleted };
  });
}

export async function setAlertsAction(id: string, alerts: boolean, _prev: ActionState, _formData: FormData): Promise<ActionState> {
  return runAction(async () => {
    const user = await requireTraderStrict();
    const { t } = await actionI18n();
    idSchema.parse(id);
    await searches.setAlerts(user.id, id, alerts);
    refresh();
    return { ok: true, message: alerts ? t.actions.alertsOn : t.actions.alertsOff };
  });
}
