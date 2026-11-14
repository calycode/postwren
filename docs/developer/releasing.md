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
- The repo is pre-release. Versions start at `0.1.0` and move through Changesets
  (`pnpm changeset version`); no release is tagged before the npm phase.

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
pnpm changeset:version
pnpm --filter @postwren/email publish --access public
pnpm changeset:tag
git push --follow-tags
```

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

Two packages move independently under Changesets (`.changeset/config.json`):

- `postwren` (the repository root, private) is the application: Worker, D1 schema,
  HTTP API, admin SPA and deploy. Every product change is recorded here, including
  changes to packages that have no release of their own.
- `@postwren/email` (publishable) follows semver for the IR shape, the renderer
  output and the merge-tag grammar. A renderer output change that alters bytes is a
  breaking change.

`@postwren/api`, `editor`, `shared`, `ui`, `webapp`, `worker-kit` and `emdash` are
listed under `ignore`: they ship inside the Worker or the site build, so they have
no version of their own. A change there still needs a `postwren` changeset.

`0.x` until the HTTP and IR contracts are stable.

### Pull requests

```sh
pnpm changeset        # choose package and bump, write the summary
pnpm changeset:status # inspect what the next release would contain
```

Commit the generated `.changeset/*.md` file with the change. CI fails a pull request
that adds no changeset; apply the `skip-changeset` label for docs-only, CI-only or
dependency-only work (create the label once under the repository's Issues → Labels).
The summary is read by someone deciding whether to upgrade, so describe the
behaviour rather than the file.

The repository root is a pnpm workspace package only so Changesets can version it;
the root scripts use `--filter=!postwren` so Turbo never treats a root task as a
workspace task and re-enters its own run.

### Cutting a release

```sh
pnpm changeset:version   # bump versions, rewrite CHANGELOG.md and packages/email/CHANGELOG.md
pnpm check-types
pnpm lint
pnpm test
pnpm build:all
git add .
git commit -m "chore: release"
pnpm changeset:tag       # tags postwren@x.y.z and @postwren/email@x.y.z
git push --follow-tags
```

`changeset version` exits non-zero when no changesets are queued, which means there
is nothing to release. The hand-written `Unreleased` block at the top of
`CHANGELOG.md` predates Changesets; fold its entries into the first generated
release section instead of leaving both.

## Domains

`postwren.email` is the intended canonical product domain; `postwren.dev` and `postwren.io` are
available as backups. `postwren.com` is taken. Register the primary before publishing the package.
