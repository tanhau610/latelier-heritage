# ATELIER HAU — domain email receiving setup

## Chosen launch architecture

- Resend sends transactional emails as `ATELIER HAU <orders@atelierhau.com>` using the verified `atelierhau.com` sending domain.
- Cloudflare Email Routing forwards inbound `orders@atelierhau.com` and `hello@atelierhau.com` to a private, verified Gmail destination.
- Cloudflare Email Routing is forwarding only. It is **not** an inbox and does **not** enable sending as `@atelierhau.com` from Gmail.
- Never put the private destination Gmail address in GitHub, frontend HTML, public JavaScript or documentation.

## Dashboard actions (requires domain owner)

1. Cloudflare Dashboard → select **atelierhau.com** → **Email** → **Email Routing**. Enable routing if not already enabled.
2. Add the destination Gmail address and complete the verification email received there.
3. Create routing rules for **orders** and **hello**, both to the verified destination.
4. If Cloudflare asks to add or adjust MX/TXT records, inspect the existing DNS first and follow the dashboard prompts only if they do not conflict with an existing inbound email provider. Do not remove Resend SPF/DKIM/DMARC records. Email Routing MX records handle **receiving**; Resend records handle **sending**.
5. Send an external test message to `hello@atelierhau.com`, then another to `orders@atelierhau.com`. Verify arrival in Gmail and inspect spam folder.
6. Reply-to testing: reply to a transactional email from a separate test mailbox and confirm it reaches the forwarded inbox. Sending a reply **from Gmail** will show the Gmail address until an authenticated send-as provider is set up.
7. Only after the tests pass, update the website's public contact address to `hello@atelierhau.com` if desired, and set an explicit Reply-To for transactional emails if needed.

## Operational checks before accepting live customers

- Keep `orders@atelierhau.com` routable and tested, since it is already the public transactional sender.
- Do not claim inbox setup is complete based on Resend's **Verified** domain status; that confirms sending domain verification, not incoming mailbox routing.
- Monitor the forwarded inbox daily and test both aliases after any DNS change.
- Consider a dedicated business mailbox (e.g., Zoho Mail or Google Workspace) when staff need to send and reply as `@atelierhau.com` without exposing a personal Gmail address.
