# Developer guide

This guide is for deploying, extending and auditing Postwren. It assumes you can
read TypeScript and are comfortable with Cloudflare Workers.

## Start here

| Task                                    | Page                                             |
| --------------------------------------- | ------------------------------------------------ |
| Deploy it                               | [Self-hosting](self-hosting.md)                  |
| Understand the system                   | [Architecture](architecture.md)                  |
| Change environment variables or secrets | [Configuration](configuration.md)                |
| Accept signups from a site              | [Public subscribe endpoint](public-subscribe.md) |
| Receive events elsewhere                | [Webhooks](webhooks.md)                          |
| Handle bounces and complaints           | [Bounces and complaints](email-events.md)        |
| Automate with scripts or agents         | [Agent access](agent-access.md)                  |
| Embed the admin in another site         | [Iframe embedding](iframe-embedding.md)          |
| Ship the EmDash plugin                  | [EmDash plugin](emdash-plugin.md)                |
| Deploy with Appflare                    | [Deploy with Appflare](appflare.md)              |
| Read the exact routes and MCP tools     | [Reference](#generated-reference)                |

## Repository map

```text
packages/
  email/       IR, schema, migrations, table-safe renderer, merge tags   (publishable)
  editor/      block editor, property panel, live canvas
  ui/          vendored shadcn primitives, theme tokens
  webapp/      admin SPA
  api/         Hono routes, jobs, adapters, tracking
  shared/      audience compiler, signed tokens, CSV, contracts
  worker-kit/  envelope, errors, ids, request context
migrations/    numbered SQL
e2e/           Playwright suite and its own Worker harness
scripts/       email packaging, brand assets, docs build
```

## Rules that keep the seams clean

- `@postwren/email` imports nothing but `zod`. No React, no DOM, no Hono, no app
  code. Lint enforces the import list.
- The editor receives upload and media-pick callbacks from its host. It imports
  no API code.
- Callers never construct HTML, SQL or signed tokens themselves. Use the module
  that owns that grammar.
- Campaign and automation sends both go through one delivery module; each job
  owns only its persistence and retry policy.
- Errors are values where the caller must branch (render warnings, CSV row
  errors); exceptions are for genuine faults.
- The browser preview and the sent message call the same renderer. Only link
  resolution differs.

## Test at the seams

Vitest covers pure logic in Node. API tests run inside `workerd` against real D1
with migrations applied per run. The suite is organised around observable
behaviour:

1. `renderEmail` output for each block type and composed documents.
2. IR parse and migration round-trips from fixtures.
3. `applyMergeTags` on documents with known context.
4. `compileAudience` returning `{ sql, params }`.
5. HTTP status and envelope through `createApp`.
6. Campaign lifecycle through the real queue handler: replay a batch, assert one
   send.
7. Editor document operations, not DOM internals.
8. Automation sweep: replay a due run, assert one step and one delivery.
9. Double opt-in: pending, confirm, subscribed, one enrolment.
10.   Webhook signature and retry schedule with a stub fetch.
11.   A replayed complaint produces one status change and one webhook row.

The Playwright suite is documented in [End-to-end tests](e2e.md).

## Generated reference

Two pages are generated from source and must not be edited by hand:

- [HTTP API](reference/api.md) — routes, scopes and access, scanned from the
  route modules and the scope table.
- [MCP tools](reference/mcp-tools.md) — the tool list, scopes and read/write
  classification, imported from the server definitions.

`pnpm docs:build` regenerates both. A route added without a docs change still
appears in the reference, which is the point.

## Documentation conventions

- Dry, plain, short sentences. Name the tradeoff instead of hiding it.
- Describe behaviour, not file history. Research notes may keep their original
  wording and dates.
- Link to the reference when listing routes or tools; do not duplicate the
  table.
- The user guide addresses the operator. The developer guide addresses the
  person deploying or changing the system.
