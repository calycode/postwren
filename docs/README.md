# Postwren documentation

Postwren is self-hosted email marketing on a single Cloudflare Worker: a visual
block editor, tag-and-property audiences, scheduled campaigns, linear
automations, per-recipient rendering, open and click tracking, one-click
unsubscribe, a public web version of every sent campaign, optional double
opt-in, and signed outbound webhooks.

Status: **v0.1.0, pre-release.** The docs site is built locally and is not
deployed yet. `docs:build` produces a complete static site under
`packages/docs/dist`.

## Two ways in

| I want to…                                                                  | Start here                             |
| --------------------------------------------------------------------------- | -------------------------------------- |
| **Send.** Import a list, write an email, target a segment, schedule a send. | [User guide](user/README.md)           |
| **Build.** Self-host it, understand the architecture, or connect a system.  | [Developer guide](developer/README.md) |

## The short version

- **For marketers:** subscribers and tags, a block editor that renders the real
  email, campaigns that freeze at schedule, linear automations, and a web
  version of every send.
- **For builders:** one Worker with D1, R2, Queues, Cron and Cloudflare Email
  Sending; scoped API keys, transactional email, signed webhooks, and an
  OAuth-protected MCP server.
- **For everyone:** single-tenant by default, magic-link or six-digit sign-in,
  MIT licensed, no second service to keep alive.

## What it deliberately does not do

- No workflow canvas or branching automation graph.
- No A/B testing or send-time optimisation.
- No multi-tenant billing or account hierarchy.
- No deliverability guarantee: Cloudflare owns the MTA, you own the domain and
  the list.

## Project links

- [Source and issues](https://github.com/calycode/postwren)
- [README](https://github.com/calycode/postwren#readme)
- [Changelog](https://github.com/calycode/postwren/blob/main/CHANGELOG.md)
- [MIT license](https://github.com/calycode/postwren/blob/main/LICENSE)
