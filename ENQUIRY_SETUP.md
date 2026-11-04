# Secure enquiry intake — setup required

This branch adds real enquiry submission but **must not be merged until the external services are configured and tested**.

## Architecture
- `/api/enquiry` is a Cloudflare Pages Function, not a public email address.
- Cloudflare Turnstile prevents automated submissions.
- Cloudflare R2 stores customer reference photos and the portrait enquiry JSON in a **private** bucket.
- Resend emails a **private internal notification** to the administrator; the administrator Gmail is not included in the public website or JavaScript.
- The studio reviews enquiries and requests payment manually later. There is no payment integration or automatic customer confirmation yet.

## Cloudflare configuration
Open Cloudflare Dashboard > Workers & Pages > `latelier-heritage-web` > Settings > Variables and Secrets / Bindings (labels may differ).

1. Create an R2 bucket named `latelier-heritage-enquiries`. Do not enable public access or custom public domain.
2. Add R2 binding `PORTRAIT_UPLOADS` targeting that bucket for production (and preview, if testing preview).
3. Create a Cloudflare Turnstile widget with allowed hostnames `latelier-heritage-web.pages.dev` and the eventual custom domain. Turnstile may require additional preview hostnames for branch testing. Add public **text variable** `TURNSTILE_SITE_KEY` and encrypted **secret** `TURNSTILE_SECRET_KEY`.
4. Create a Resend account and API key. Add encrypted **secret** `RESEND_API_KEY`.
5. Add encrypted **secret** `NOTIFICATION_EMAIL` with the private internal recipient address. This must NOT be committed into GitHub.
6. Add encrypted **secret** `RESEND_FROM` with a sender identity verified in Resend, e.g. `L'Atelier Heritage <orders@your-verified-domain.example>`. For initial account testing, Resend's onboarding sender can have restricted recipients; confirm with Resend before relying on it.
7. Redeploy after bindings/secrets change. Confirm `/api/enquiry-config` returns a public siteKey and readiness; **it must not return secrets**.
8. Test Contact with your own message, verify internal notification delivery. Test Commission with 1-5 JPG/PNG/WEBP photos, verify email and private R2 objects, and check browser/mobile behavior. Test security challenge failures and over-size photos.

## Before launch
- Validate the shipping promise and price calculations.
- Replace draft privacy policy with accurate processing, retention and deletion rules. Reference photos and customer data are personal data.
- Define staff access to R2 and a secure way to view/download order images. There is **no order management dashboard** yet.
- Add delivery retry / reconciliation for notifications (an R2 record may exist even if the email provider fails).
- Configure SPF/DKIM/DMARC on the verified studio sending domain before emailing customers.
- Rate limits, storage lifecycle rules, anti-abuse monitoring and retention/deletion procedures should be completed before public advertising.
- No real payment is processed and no automated email is sent to customers.

## Operational note
The original website is static HTML deployed from GitHub to Cloudflare Pages. A separate `functions/` folder is required for Pages Functions. Check that this project uses Git integration with Cloudflare Pages (not Workers static assets), and that deployment recognizes Pages Functions.
