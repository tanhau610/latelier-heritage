# Live balance reminder worker — staging only

This is a **separate Cloudflare scheduled Worker**, not a Cloudflare Pages Function. It is NOT deployed or enabled by merging the branch. Do not enable until a verified Resend sender, R2 permissions, PayPal reconciliation and safe test are confirmed.

## Required bindings and secrets
- R2 bucket binding: `PORTRAIT_UPLOADS` (same private order bucket as Pages).
- Secret: `RESEND_API_KEY` (never put it in GitHub).
- Text vars: `PAYPAL_MODE=live`, `PAYPAL_LIVE_READY=yes`, `LIVE_BALANCE_REMINDERS=enabled`.
- Text var `RESEND_FROM` must resolve to the verified `ATELIER HAU <orders@atelierhau.com>` sender.

## Schedule
Configure a **daily** Cron Trigger in Cloudflare for this Worker only after QA. It scans order records in R2, checks that a verified Live deposit exists, that the Studio has marked the portrait `Ready for balance`, and that the original balance-request email was recorded as sent. It checks day 3 and day 7 after the balance request, not after the initial deposit.

## Safety notes / known limitations
- No checkout token is saved in plaintext; reminders therefore ask the buyer to reply for a secure payment link rather than embedding a potentially invalid URL.
- An event record is created before calling Resend; any pending/failed event suppresses automated retries to avoid duplicate sends. Manual review is required for failures.
- This is **not an atomic distributed lock**. Never run overlapping schedules or enable multiple instances without implementing a transactional lease or a queue.
- R2 list scanning is capped at 2,000 order prefixes per run; implement pagination/checkpointing or a dedicated due-index before scaling.
- A race between a payment and email send remains possible. Production needs payment webhook reconciliation and stronger concurrency controls.
- Verify the order's email address and sender domain before any live send.
- No real customer email, live PayPal transaction, or Cloudflare Worker deployment is performed by this PR.

## QA checklist
1. Test unpaid, deposit-paid, balance-paid, cancelled, full-payment, wrong-quote, and Sandbox cases.
2. Verify day-3/day-7 boundaries and that a paid balance suppresses reminders.
3. Verify Resend failure behavior and duplicate trigger behavior.
4. Verify the Studio balance-request email was successfully sent before scheduling reminders.
5. Confirm Live webhook reconciliation and safe rollout plan before turning on the flag.
