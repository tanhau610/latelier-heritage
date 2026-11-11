# Live unpaid checkout notification Worker

This is a **separate** Cloudflare Worker, not a Pages Function. It only reads `pending-checkouts/` markers tagged `checkoutMode: "live-inline"` and `sandbox: false`. It does not change the existing Sandbox Worker.

## Before deploying

1. Merge the companion checkout change from this branch to `main`, so new Live orders create R2 markers. The existing Production Live checkout continues to work independently.
2. In Cloudflare Workers & Pages, create a **new Worker** (e.g. `atelier-live-unpaid-notifications`), paste the complete contents of `worker.js`, and deploy.
3. Add an R2 binding named `PORTRAIT_UPLOADS` to the **same** `latelier-heritage-enquiries` bucket as the Pages checkout.
4. Set `RESEND_API_KEY` as a secret, `NOTIFICATION_EMAIL` as a secret, and `RESEND_FROM` to exactly `ATELIER HAU <orders@atelierhau.com>`. Worker settings are separate from Pages settings.
5. Add a Cron Trigger `*/1 * * * *` (every minute). No public route is required. Do **not** replace the existing Sandbox Worker.
6. Verify with a new Live order created **after** the checkout patch is deployed. Do not pay. Wait at least 11–13 minutes. Confirm one admin email, R2 event `enquiries/<id>/email-events/live-unpaid-alert.json`, and removal of `pending-checkouts/<id>.json`.
7. Separately verify a **paid** Live order never receives an unpaid alert, using a real customer payment or controlled non-financial ledger fixture; no real payment is required for the unpaid-only test.

## Safety and limitations

- The email means **no verified Live capture is recorded in R2**, not definitive proof that PayPal did not charge. Check PayPal before contacting a buyer.
- A successful Resend response is logged as sent; this does not guarantee mailbox delivery.
- R2 is not a transactional queue. Concurrent Cron invocations or partial failures can race; Resend's Idempotency-Key reduces duplicate emails but is not a distributed lock. For stronger guarantees use Cloudflare Queues or Durable Objects.
- If the worker is not deployed or cron is not enabled, no emails will be sent. GitHub commits alone do not deploy this standalone Worker.
- Keep Live credentials and all access tokens private; this Worker requires no PayPal credentials.
