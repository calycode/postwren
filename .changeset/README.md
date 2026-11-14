# Changesets

Every pull request that changes behaviour ships a changeset: a short Markdown file
in this directory that says what changed and how the next release moves.

```sh
pnpm changeset          # pick a package and bump, write the summary
pnpm changeset:status   # what is queued for the next release
pnpm changeset:version  # apply bumps, rewrite the changelogs, delete the files
pnpm changeset:tag      # create the git tags for the versions just applied
```

## Two versioned packages

- `postwren` (the repository root) is the self-hosted application. Any product
  change belongs here, even when the edited file lives in `packages/api`,
  `packages/webapp` or `packages/editor`: those packages are ignored by
  Changesets and ship with the Worker. Bumps land in the root `CHANGELOG.md`.
- `@postwren/email` is the only publishable library. Bumps land in
  `packages/email/CHANGELOG.md` and in the published tarball.

A change to the email layer that also changes the product lists both packages in
one changeset. A library-only change lists `@postwren/email` alone, so the app
version does not move without a product change.

Changesets only sees packages declared in `pnpm-workspace.yaml`, so the repository
root is listed there as `.`. The root's composite scripts filter it back out
(`--filter=!postwren`) so a root task never re-enters its own Turbo run.

## Bump levels

- `patch` — a fix that keeps every contract intact.
- `minor` — a new capability, or a new field/route/step type. Prefer additive.
  While the repo is `0.x`, a breaking change to the HTTP wire format, the IR
  shape, the renderer's bytes or the merge-tag grammar is also a `minor`, with
  the break called out in the summary.
- `major` — reserved for the move to `1.0.0`, when the HTTP and IR contracts are
  declared stable.

## Rules

- The summary is written for someone deciding whether to upgrade, not for the
  commit log. Name the behaviour, not the file.
- Do not hand-edit `CHANGELOG.md` for unreleased work; run `pnpm changeset`.
  Keeping the generated sections intact is what makes `changeset version` a
  clean diff. The `Unreleased` block already in `CHANGELOG.md` predates
  Changesets: fold those entries into the first generated release section.
- CI fails a pull request that adds no changeset. Apply the `skip-changeset`
  label for docs-only, CI-only or dependency-only pull requests.
