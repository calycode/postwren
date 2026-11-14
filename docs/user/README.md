# User guide

This guide is for the person running the list: importing subscribers, writing
an email, choosing who receives it, and reading what happened afterwards.

Postwren is single-tenant. There is no team management, no seat list, and no
billing screen. You sign in with the owner address configured on the Worker.

## The five-minute path

1. **Sign in.** Open the app and request a sign-in link or a six-digit code.
   The first sign-in must use the `OWNER_EMAIL` configured for the Worker.
2. **Add a sending domain.** Settings → Sending. Campaigns cannot send from an
   address that is not on this list.
3. **Import or add subscribers.** Subscribers → Import, or add one by hand.
   Tags are how you will target them later.
4. **Create a template.** Templates → New. The editor previews the real email.
5. **Create a campaign.** Choose the template, subject and sender, set the
   audience query, then schedule or send now.
6. **Read the result.** The campaign page shows delivery, opens and clicks, and
   links to the public web version of the send.

## Where things live

| Section     | What it holds                                                      |
| ----------- | ------------------------------------------------------------------ |
| Home        | List health, growth, recent sends, next sends, active automations  |
| Subscribers | The list, tags, custom fields, CSV import and export, bulk actions |
| Templates   | The block editor, revisions, saved blocks, block notes             |
| Campaigns   | Drafts, scheduled sends, live sends, recipient stats, web versions |
| Automations | Trigger-and-step sequences, runs, run logs                         |
| Settings    | Sending domains, subscribe keys, webhooks, API keys, embed origins |

The account menu at the bottom of the sidebar holds the theme switch, the guided
tour, and sign-out.

## Pages

- [Getting started](getting-started.md)
- [Subscribers and tags](subscribers.md)
- [Templates and the editor](templates.md)
- [Campaigns](campaigns.md)
- [Automations](automations.md)
- [Settings](settings.md)
- [Integrations](integrations.md)
- [FAQ](faq.md)

If you are deploying or extending Postwren rather than using it, read the
[developer guide](../developer/README.md) instead.
