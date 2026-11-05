# Glossary

Domain terms used in ReGear's code and design discussions. Use these names for the concepts below.

## Orders

**Step**: one thing a buyer or seller can do to an order: pay, ship, cancel, confirm delivery, accept, request a return, respond to a return, ship a return, receive a return, review, or report a problem. Admin actions (cancelling as ReGear, resolving a dispute) and system actions (auto-completion, expiring unpaid orders) are not steps.

**Order capabilities**: which steps the buyer or seller looking at an order may take right now, and the reason for each one they may not. It also gives the figures those steps depend on (days left to request a return, the seller's payout). The order page offers only the steps it allows, and the order service refuses any step it doesn't, so the two always agree. Lives in `src/lib/orders/state.ts` (`orderCapabilities`).
