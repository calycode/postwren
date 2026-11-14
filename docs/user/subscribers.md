# Subscribers and tags

A subscriber is one email address plus a status, an optional name, tags, and
custom metadata. The list is the only thing every campaign and automation reads
from, so it is worth keeping clean.

## Statuses

| Status         | Meaning                                                                |
| -------------- | ---------------------------------------------------------------------- |
| `pending`      | Double opt-in signup that has not confirmed. Excluded from every send. |
| `subscribed`   | Active. The only status campaigns and automations select.              |
| `unsubscribed` | Opted out through the signed link. Never revived by a later signup.    |
| `bounced`      | Hard bounce reported by Cloudflare. Suppressed everywhere.             |
| `complained`   | Spam complaint reported by Cloudflare. Suppressed everywhere.          |
| `deleted`      | Soft-deleted row. Hidden from the list and excluded from sends.        |

A public signup for an existing address adds tags and metadata but does not
change its status. That is deliberate: a bounced or unsubscribed address cannot
be re-subscribed by a form.

## Adding and importing

- **Add subscriber** writes one row with a status of `subscribed`.
- **Import** reads a CSV. The header accepts `email`, `first_name`, `last_name`,
  `tags` and metadata columns; tags are separated by `;` or `,`. Rows report
  their own errors rather than failing the entire file.
- **Export** writes the current selection or the whole list as CSV.

Duplicates are matched on the normalised email address. Import is idempotent:
an existing row gains tags and metadata instead of becoming a second row.

## Tags

Tags are flat, lower-case labels. Use them for anything a campaign or automation
needs to target:

- `newsletter`, `product`, `customers`
- `beta`, `internal`, `vip`
- `webinar-2026-11`

Tag rename rewrites `tag:name` references in campaign audiences, automation
entry queries and automation steps, so saved sends keep working.

## Custom metadata

Metadata is a flat string map stored per subscriber. Keys match
`^[a-z][a-z0-9_]{0,63}$`, at most 50 keys per subscriber, values up to 1024
characters. The keys `id`, `email`, `first_name`, `last_name`, `status` and
`tags` are reserved.

Metadata is rendered with merge tags and is filterable in audiences:

```text
{{ subscriber.meta.plan }}
{{ subscriber.meta.company | default: "your team" }}
```

## Writing an audience

The audience query is a small, parameterised grammar:

| Query                    | Selects                                            |
| ------------------------ | -------------------------------------------------- |
| `tag:newsletter`         | Subscribers carrying `newsletter`                  |
| `tag:news -tag:internal` | `news` without `internal`                          |
| `meta:plan=pro`          | Subscribers whose `plan` metadata is exactly `pro` |
| `-meta:plan=free`        | Subscribers without `plan=free`                    |
| `tag:news meta:plan=pro` | Both conditions                                    |

Terms are ANDed. Empty queries match every subscribed subscriber. The campaign
dialog previews the match count before you schedule, and the API exposes the
same preview at `GET /api/v1/audience/preview?q=…`.

## Deleting

Deleting a subscriber is a soft delete: the row stays, the status becomes
`deleted`, `deleted_at` is set, and every send skips it. The dashboard has no
restore or hard-delete action; a deleted row is retained for the list history.

## Hygiene

The public subscribe endpoint runs a static disposable-domain and typo check
before writing. In production it also performs a DNS MX/A lookup and fails open
when DNS is unavailable. This is cheap hygiene, not a validation vendor: it
catches the obvious cases and nothing more.
