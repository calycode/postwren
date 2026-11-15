---
'postwren': minor
---

Add pluggable sending providers. Cloudflare Email Service remains the default,
and Resend, Postmark, SendGrid and Mailgun can be selected in Settings. Provider
credentials are encrypted in D1, campaigns pin the active provider when they are
scheduled, sends are batched and paced per provider, and delivery events from
every provider feed the same suppression policy.
