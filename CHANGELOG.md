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

### Changed

- The double opt-in confirmation page auto-submits its POST, so a reader still
  confirms with one click while a link-only scanner writes nothing.
- Web and unsubscribe links are no longer wrapped in the 24-hour click-tracking
  token; their own tokens last much longer.
- Hard bounces and complaints now set the single application-level suppression
  state, exit active automation runs and update recipient rows.

### Fixed

- A personalized web view can no longer be produced from a token issued for a
  different campaign; it falls back to the anonymous page.
