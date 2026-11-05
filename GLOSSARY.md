# Glossary

Domain terms used in ReGear's code and design discussions. Use these names for the concepts below.

## Orders

**Step**: one thing a buyer or seller can do to an order: pay, ship, cancel, confirm delivery, accept, request a return, respond to a return, ship a return, receive a return, review, or report a problem. Admin actions (cancelling as ReGear, resolving a dispute) and system actions (auto-completion, expiring unpaid orders) are not steps.

**Order capabilities**: which steps the buyer or seller looking at an order may take right now, and the reason for each one they may not. It also gives the figures those steps depend on (days left to request a return, the seller's payout). The order page offers only the steps it allows, and the order service refuses any step it doesn't, so the two always agree. Lives in `src/lib/orders/state.ts` (`orderCapabilities`).

**Refund**: money an order gives back to its buyer. The order step that causes it (a cancellation after payment, a received return, a dispute, a payment that landed on a cancelled order) decides the amount and claims it; the Refund module (`src/lib/orders/refunds.ts`) sends it. It goes back through the payment provider, or, for a bank transfer, by hand: the buyer gives an account and an admin sends the money.

**Refund state**: where an order's refund stands: none, on its way (through the provider, retried until confirmed), waiting for the buyer's account, waiting for ReGear's transfer, or sent. Worked out from the order's refund columns by `refundState`; every page that shows a refund reads it.

## Accounts

**Sign-in completion**: what happens once someone has proven who they are, the same for every way of signing in (password, Google, the code emailed at sign-up): a locked or banned account is refused; otherwise failed attempts are cleared, the email language is remembered, a session starts and the sign-in is recorded. `completeSignIn` in `src/lib/auth/sign-in.ts`; each way in turns a refusal into its own message.

## Catalogue

**Catalogue freshness**: keeping the cached public pages (search and browse, listing pages, seller pages, the marketplace numbers) in step with changes to listings and sellers. Whatever changes a listing or a seller in a way shoppers see calls `catalogueChanged` (`src/lib/cache.ts`) once its change has committed; nothing else knows the cache tags. Steps shoppers can't see, such as shipping or a return request, don't refresh anything.
