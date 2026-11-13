# Changelog

## Unreleased — 2026-11-09

### Added

- Signed, per-recipient web versions. `{{ links.web }}` resolves to
  `/p/<campaign>?t=<token>` and renders that reader's merge tags and unsubscribe
  link; `/p/<campaign>` remains the anonymous, shareable page.
- Optional Turnstile per subscribe key (`turnstileSiteKey` plus
  `TURNSTILE_SECRET`), with the honeypot kept as the first line.
- Cloudflare Email Sending event ingestion for `message.complained`,
  `message.bounced` and `message.delivered`, deduplicated by `eventId`.
- Per-block template notes with open/done state, counts in the block outline and
  management in the property panel.
- Repeat blocks: a root-level container bound to a campaign data list, with
  `{{ item.key }}`, `{{ itemIndex }}`, `{{ itemIndex1 }}`, a preview sample,
  snapshotted `data_snapshot`, and per-item clone ids for click analytics.
- Campaign `data` JSON with a 128 KB limit, 10 collections and 50 flat items per
  collection, exposed through the REST API and MCP campaign tools.
- `subscriber.bounced` and `subscriber.complained` webhook events.
- Playwright end-to-end suite (`pnpm e2e`) that builds the SPA, starts a Worker on
  `:8791` with a clean local database, and drives Chromium through the primary user
  journeys: sign-in and sign-out, the dashboard, subscriber CRUD and CSV import,
  bulk tagging, exports, template editing and preview, media upload, campaign
  draft/test/send/schedule/cancel, a welcome automation with a real queue delivery,
  double opt-in public signup, and workspace settings. Every spec runs under a named
  `describe` with step-level reporting. CI runs it on every pull request as a
  separate `e2e` job.

### Changed

- The double opt-in confirmation page auto-submits its POST, so a reader still
  confirms with one click while a link-only scanner writes nothing.
- Web and unsubscribe links are no longer wrapped in the 24-hour click-tracking
  token; their own tokens last much longer.
- Hard bounces and complaints now set the single application-level suppression
  state, exit active automation runs and update recipient rows.

### Fixed

- Clearing a subscriber's first or last name in the detail panel no longer fails
  the whole save with a 422. An empty name is treated as an explicit clear and is
  stored as `null`, so tagging or editing a subscriber with a blank name works.
- A personalized web view can no longer be produced from a token issued for a
  different campaign; it falls back to the anonymous page.
