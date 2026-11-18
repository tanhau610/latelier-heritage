# ATELIER HAU — Analytics and Search Console

## What is available now
- Cloudflare Web Analytics: open Cloudflare Dashboard > Web Analytics. Select atelierhau.com or create a Web Analytics site for this domain. Cloudflare Pages traffic analytics may also be available under Workers & Pages > latelier-heritage-web > Analytics. These views are not identical; request counts are not necessarily human visitors.
- Google Analytics 4: reports for users, sessions, page views, acquisition, engagement, and events. **Not yet active** until the owner creates a GA4 web stream and supplies its Measurement ID.
- Google Search Console: query impressions, clicks, CTR, ranking position and indexing. Ownership verification is required.

## Activate GA4 (one-time owner action)
1. Sign in at https://analytics.google.com/ and create a GA4 property for ATELIER HAU.
2. Add a **Web** data stream with https://atelierhau.com and copy the **Measurement ID** starting with G-.
3. Set that exact ID in the single variable `const id=""` in `assets/analytics.js`. Do not paste passwords, API secrets, or service credentials into the repository.
4. Confirm the domain in GA4 Realtime and Tag Assistant. Enable Enhanced Measurement as desired, avoiding duplicate events.
5. Review applicable privacy/consent requirements before enabling analytics for visitors. Add a suitable consent mechanism where legally required.

The script intentionally stays **disabled** until the real Measurement ID is configured. It tracks only public pages, commission CTA clicks, pricing clicks, studio video plays, and public support email clicks. Checkout, payment, and studio pages are excluded to avoid sending private order URLs and identifiers. It does not record payment completion and must not be used as a source of paid-order truth.

## Activate Search Console
1. Visit https://search.google.com/search-console/ and add a **Domain property**: atelierhau.com.
2. Follow Google's DNS TXT ownership verification using Cloudflare DNS (do not replace existing MX/SPF/DKIM records).
3. Submit `https://atelierhau.com/sitemap.xml` in Sitemaps.
4. Check Pages indexing and Performance > Search results. Filter Country = Australia to evaluate the initial market.
5. Review Core Web Vitals and page experience. SEO improvements do not guarantee rankings.

## Interpreting metrics
- GA4 users: estimated distinct visitors; sessions: visits; views: pages/screens seen; engagement: interactions and engaged sessions.
- Cloudflare requests are not unique human visitors.
- Search Console impressions mean appearances in Google Search, not visits. Clicks are visits from Google Search results.
- Conversion funnel: commission CTA clicks -> checkout starts -> verified paid orders. This release only measures the first of these through GA4; do not infer paid sales from clicks.

## Privacy and accuracy
Never send email addresses, pet photos, customer names, delivery addresses, PayPal order IDs or private checkout URLs to analytics. Do not install multiple GA4 tags for the same property. Respect consent and privacy requirements for the customer's jurisdiction.
