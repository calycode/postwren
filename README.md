# Mailer Cloudflare

Self-hosted email marketing platform on a single Cloudflare Worker.

## Layout

- `packages/email` — publishable email IR and table-safe HTML renderer. No React, no DOM.
- `packages/editor` — Preact block editor built on `@mailer/ui`.
- `packages/ui` — vendored shadcn primitives on Base UI.
- `packages/webapp` — admin SPA.
- `packages/api` — Hono Worker: auth, CRUD, campaigns, queue consumer, tracking.
- `packages/shared` — audience query compiler, signed tokens, CSV parser, contracts.
- `packages/worker-kit` — response envelope, errors, request context.

## Commands

```sh
pnpm install
pnpm db:migrate:local
pnpm dev            # Vite :5173 + Worker :8787
pnpm test
pnpm check-types
pnpm build:all
pnpm deploy
```

Sending requires the Workers Paid plan and an onboarded sending domain.
