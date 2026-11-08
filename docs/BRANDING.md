# Brand proposal

Status: applied to the workspace, Worker names, API key prefix and EmDash plugin. Naming checks run
on 2026-10-30; remote and npm release steps live in `docs/RELEASING.md`.

## The name

**Postwren**

> Small bird. Loud voice. One Worker.

One-liner: _Postwren is self-hosted email marketing on a single Cloudflare Worker: a visual editor, tag-and-property audiences, scheduled campaigns, and an API/MCP for agents._

## Why Postwren

A wren is one of the smallest birds in the garden, and its song carries much farther than its size
suggests. That is this project: one small Worker, a voice the whole list hears.

The word is a double compound:

- **post** is the mail, and also the fence post a wren sings from. The bird sings from a post; the
  product sends the post.
- **wren** is the underdog bird: plain, quick, everywhere, and disproportionately loud. It matches a
  tool that is deliberately narrow, self-hosted, and does not need a platform team to run.

It also avoids the two crowded naming lanes. It is not another `Mail*`/`Send*` product, and it is not
a Greek god, a bell, or a printing term. "Postwren" reads as a product, not a feature.

What the name promises:

- **Small footprint.** One Worker, one D1 database, one queue.
- **Owned voice.** Your domain, your list, your data, your sender reputation.
- **Clear reach.** A campaign should be heard, not sprayed.

What it deliberately does not promise: automation builders, A/B testing, multi-tenant billing. Those
are out of charter.

## Brand marks

- **Wordmark:** `postwren` in lowercase, with the wren's tail forming the descender of the `p` or a
  small comma after the word.
- **Mark:** a wren perched on a post that is also an envelope edge. One colour works at 16 px.
- **Palette:** action blue `#00508F`, harbour ink `#14293A`, peach `#FFCD82`, sky `#ADDBFF`, burnt ochre `#8F5601`, paper `#F6F4EF`, espresso `#4F3815`. No gradients.
- **Type:** an editorial serif for headlines (the "post" half) and a plain grotesk for UI (the
  "worker" half).
- **Voice:** plain, dry, confident. Short sentences. Name the tradeoff instead of hiding it. No
  growth-hacker vocabulary, no exclamation marks, no "supercharge".

Example lines:

- "One Worker. Your whole list."
- "Own the list. Own the send."
- "A small mailer with a long reach."
- "No chimp. No circus. Just a wren."

## Colour roles

| Role                 | Hex       | Use                                                      |
| -------------------- | --------- | -------------------------------------------------------- |
| Action, links, focus | `#00508F` | Primary buttons, links, focus rings, selected controls   |
| Ink and rail         | `#14293A` | Body text, the dark navigation rail, dark-mode surfaces  |
| Paper                | `#F6F4EF` | Light background                                         |
| Warm attention       | `#FFCD82` | Trigger cards, callouts, logo tile on the rail, warnings |
| Informational wash   | `#ADDBFF` | Info badges, dark-mode primary action, sidebar focus     |
| Editorial mark       | `#8F5601` | Eyebrows, rules, active-indicator details, warm links    |
| Deep warm neutral    | `#4F3815` | Illustration and chart accents; not body copy            |
| Dark canvas          | `#0E1B26` | Dark-mode page background, one step below `#14293A`      |

The rail is dark in both modes. It uses `#14293A` in light mode and `#0A151F` in dark mode, with light text and a blue selected item. Peach is the warm signal; blue is the action colour. Do not use peach as large body-copy background.

## Naming architecture

| Thing         | Name                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Product       | Postwren                                                                                                                                                   |
| Packages      | `@postwren/email`, `@postwren/editor`, `@postwren/ui`, `@postwren/webapp`, `@postwren/api`, `@postwren/shared`, `@postwren/worker-kit`, `@postwren/emdash` |
| CLI           | `postwren`                                                                                                                                                 |
| Worker names  | `postwren`, `postwren-dev`                                                                                                                                 |
| EmDash plugin | id `postwren`, package `@postwren/emdash`                                                                                                                  |
| Domains       | `postwren.email` (primary), `postwren.dev`, `postwren.io`, `postwren.so`                                                                                   |

Do **not** rename the database tables, migration filenames, environment variables (`APP_URL`,
`EMAIL_FROM`, `SESSION_SECRET`, `TOKEN_SECRET`) or the `/api/public`, `/mcp`, `/oauth` paths. The
brand is a presentation layer; the wire and data contracts stay stable.

## Availability snapshot (2026-10-30)

| Check                         | Result       |
| ----------------------------- | ------------ |
| `postwren.email`              | unregistered |
| `postwren.dev`                | unregistered |
| `postwren.io`                 | unregistered |
| `postwren.so`                 | unregistered |
| `postwren.com`                | registered   |
| npm `postwren`, `@postwren/*` | unclaimed    |
| GitHub org `postwren`         | unclaimed    |
| Direct email product          | none found   |

Caveats: availability is a point-in-time snapshot, not trademark clearance. Search results are
currently polluted by a Base token called `$POSTWREN` and by example copy on unrelated sites, so the
product will need its own site and canonical descriptions to own the query. Get a proper trademark
search before spending on a logo or a paid domain.

## Names considered and rejected

| Name                                                       | Why not                                                                                 |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Posthorn                                                   | A self-hosted email gateway already uses this exact name and the post-rider horn story. |
| Handbill                                                   | An existing advertising app and an existing Cloudflare Worker tool use it.              |
| Crier                                                      | `crier.audio` is a newsletter audio product.                                            |
| Peal                                                       | Multiple companies (Peal Systems, Peal payments, Peal alarm app).                       |
| Bindery                                                    | A newsletter-to-book product already owns the newsletter adjacency.                     |
| Galley                                                     | A culinary software company owns the name.                                              |
| Stentor                                                    | An existing self-hosted email delivery platform uses it.                                |
| Soloist                                                    | An existing publishing/newsletter platform uses it.                                     |
| Postmark, Postbox, Posthorn, Mailcoach, Missive, Estafette | Direct or near-direct email/product collisions.                                         |

## Rename plan

Do it in this order, one commit per step, tests green after each.

1. **Brand only.** Add this file, change the README title and one-liner, keep `@postwren/*` and the
   Worker names. Zero risk.
2. **Workspace rename.** `@postwren/*` -> `@postwren/*` across `package.json`, imports, tsconfig paths,
   turbo filters and test aliases; root package name `postwren`; update `pnpm-lock.yaml`. Mechanical,
   no behaviour change.
3. **Infrastructure names.** `wrangler.jsonc` Worker name, D1 database, R2 bucket, queue names. Safe
   now because nothing is deployed; if a deployment exists, create new resources and migrate instead
   of renaming in place.
4. **EmDash plugin.** `id: "postwren"`, package `@postwren/emdash`, route prefix
   `/_emdash/api/plugins/postwren/*`, settings labels, README.
5. **Prose.** README, CONTEXT, docs, package descriptions, page titles. Keep the historical research
   docs' wording; add a status note if needed.

## Open questions

- Is `postwren.email` the primary domain, or should the product live on a `.dev`/`.io` and use
  `.email` only for links?
- Does the wren mark survive at favicon size, or is a simple envelope/post glyph better?
- Is the voice too whimsical for an infrastructure tool? The tagline is playful; the docs should stay
  dry to balance it.
