# Release and remote checklist

Remote: [`calycode/postwren`](https://github.com/calycode/postwren) (private). Nothing is published
to npm yet.

## GitHub

The repository lives under the `calycode` organisation on `main`. CI
(`.github/workflows/ci.yml`) runs on every push to `main` and on pull requests.

If the project ever moves to a different owner, use GitHub's transfer flow. The old URLs redirect,
so the npm metadata and docs do not need to change immediately.

### Before the first push

```sh
pnpm install
pnpm check-types
pnpm lint
pnpm test
pnpm build:all
pnpm build:worker
```

- No secrets are committed. `.dev.vars` is ignored; production secrets are set with
  `wrangler secret put`.
- `wrangler.jsonc` keeps placeholder resource ids on purpose (an omitted `DB.database_id`, the
  all-zero `OAUTH_KV.id`), so Appflare and the Cloudflare Deploy button provision them. Create the
  D1 database, R2 bucket, queues and the `OAUTH_KV` namespace only when you actually deploy; add the
  returned ids for a manual wrangler deploy. See `docs/APPFLARE.md`.
- The repo is pre-release. Version `0.1.0` everywhere; do not tag a release before the npm phase.

## npm: phased release

The workspace has one publishable package today: `@postwren/email`. Everything else is private on
purpose. Publishing is opt-in per package, not a workspace-wide release.

### Phase 0 — now

- Keep the npm scope unclaimed, or reserve `@postwren` by creating an npm org/account with that name.
- `@postwren/email` is already built for publishing: `exports` point at `dist`, `files` is limited,
  `publishConfig.access` is public, and `prepublishOnly` rebuilds the package.
- Verify the tarball locally:

```sh
pnpm pack:email
tar -tf artifacts/postwren-email-0.1.0.tgz
```

- Test the packed artifact from a scratch directory, not the workspace:

```sh
mkdir /tmp/postwren-pack-check && cd /tmp/postwren-pack-check
pnpm init
pnpm add /path/to/artifacts/postwren-email-0.1.0.tgz
node -e "import('@postwren/email/render').then(m => console.log(typeof m.renderEmail))"
```

### Phase 1 — publish the email layer only

Prerequisite: the packed artifact passes the smoke test, and the npm scope exists.

```sh
npm login
pnpm --filter @postwren/email publish --access public
```

Then tag it: `git tag email-v0.1.0 && git push --tags`.

Do not publish the application packages. `@postwren/api`, `@postwren/webapp`, `@postwren/editor`,
`@postwren/ui` and `@postwren/worker-kit` are deployables or internals, not libraries.

### Phase 2 — shared primitives (not ready)

`@postwren/shared` still exports TypeScript sources (`./src/*.ts`) and is private. Before publishing
it needs the same treatment as `email`: a tsup build, `dist` exports, a package README, and a
stability pass on `audience`, `contracts`, `csv`, `metadata` and `tokens`.

### Phase 3 — EmDash adapter (after a real-site test)

`@postwren/emdash` ships TypeScript sources for the site's Vite build. Publish it only after it has
run in a real EmDash site, and after deciding whether to ship TS or a built entry.

### Scope fallback

If `@postwren` is unavailable on npm, do not rename the repo. Options, in order:

1. Publish under a personal scope, e.g. `@mihalytoth/email`, and keep the `postwren` brand in the
   README.
2. Publish unscoped as `postwren-email`.
3. Wait and reserve the scope later.

The package name is a distribution detail; the product name is not.

## Versioning

- `0.x` until the HTTP and IR contracts are stable.
- `@postwren/email` follows semver for the IR shape, the renderer output and the merge-tag grammar.
  A renderer output change that alters bytes is a breaking change.
- Changesets is the natural next step once more than one package is published. It is deliberately
  not a dependency yet.

## Domains

`postwren.email` is the intended canonical product domain; `postwren.dev` and `postwren.io` are
available as backups. `postwren.com` is taken. Register the primary before publishing the package.
