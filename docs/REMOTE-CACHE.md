# Remote cache

Turborepo caches task results locally and shares them through
`https://trc.calycode.com`, a remote cache running on Cloudflare Workers. A cache hit
skips the task, downloads its logs and declared outputs, and replays them.

## What is committed

`turbo.json` carries the non-secret half of the configuration:

```json
"remoteCache": {
   "apiUrl": "https://trc.calycode.com",
   "teamId": "team_calycode"
}
```

`teamId` namespaces the artifacts on the server and must start with `team_`; Turborepo
ignores values without that prefix. Laptops, GitHub Actions and Workers Builds have to
use the same value or their caches never meet.

The token is **not** in the repository. There is no `.env` in this project: Turborepo
does not read `.env` files for its own configuration, so a token there would do nothing.
Application secrets live in `.dev.vars`; the cache token never belongs there either,
because it is a build credential, not a Worker runtime secret.

## The token

`TURBO_TOKEN` is the Bearer token the cache Worker checks on every request.

### Local machine

Log in once; this writes the token to `~/.turbo/config.json`, outside the repository:

```sh
pnpm exec turbo login --manual --api=https://trc.calycode.com
# then paste the token when prompted
```

Or set it for the current shell only:

```sh
export TURBO_TOKEN=...    # bash/zsh
$env:TURBO_TOKEN="..."    # PowerShell
```

`turbo login` stores the API URL and token, so it is the shorter path; the team still comes
from `turbo.json`. A plain `turbo login` is for Vercel and does not work with this server.

### GitHub Actions

`.github/workflows/ci.yml` passes `secrets.TURBO_TOKEN` to the job. Add it once under
_Settings › Secrets and variables › Actions › New repository secret_.

Pull requests from forks do not receive repository secrets. Those runs fall back to the
local cache, log `Remote caching unavailable`, and still pass.

### Cloudflare Workers Builds

The Worker's build runs `build.command` from `wrangler.jsonc` → `pnpm build` → `turbo`,
so the token must be present in the **build** environment:

Dashboard → Workers & Pages → `postwren` → Settings → Build → _Build variables and
secrets_ → add `TURBO_TOKEN` as a secret.

Do not use `wrangler secret put TURBO_TOKEN`: that writes a runtime secret, which the
build never sees. The same applies to Appflare or Deploy button installs in other
accounts — they get no token, so they build with the local cache only.

### Appflare

Appflare's repository install builds in a sandbox container with no credentials. The
install form has no build-time variables or secrets — `.dev.vars.example` only fills the
runtime settings form — so `TURBO_TOKEN` cannot be supplied, and every build starts with
an empty local cache. Appflare builds therefore always run from scratch and log
`Remote caching unavailable`.

If those warnings are noise you would rather not see, move `remoteCache.apiUrl` and
`teamId` out of `turbo.json` and set `TURBO_API` and `TURBO_TEAM` next to `TURBO_TOKEN`
in CI and locally. Appflare builds then skip the remote cache entirely.

## What is cached

`turbo.json` caches `build` (outputs `dist/**`), `test`, `check-types` and `lint`. Logs
are artifacts too, so cached test and lint runs replay their output instead of running.

`build:worker` and `pack:email` are plain package scripts outside Turbo; they are never
cached. If they become slow, turn them into Turbo tasks with declared outputs.

Only `build` bakes environment values into its output. `VITE_API_BASE_URL` is declared in
the `build` task's `env`, and `.env*` files are in its `inputs`, so changing either misses
the cache instead of restoring a bundle built for another environment.

Turborepo does not hash the operating system or architecture. The build outputs here are
portable JavaScript and assets, so a Windows laptop and Linux CI can share them; the
flip side is that a cache entry created on one OS also satisfies a lookup on another,
including cached `test` and `lint` logs. Key the cache by platform if that ever bites.

## Verify

```sh
pnpm exec turbo run build --force      # runs and uploads
rm -rf .turbo/cache                    # PowerShell: Remove-Item -Recurse -Force .turbo\cache
pnpm exec turbo run build              # expect "Remote cache hit"
```

`Authentication failed — check TURBO_TOKEN` (or `401` on every artifact) means the token
is missing or does not match the cache Worker's secret. `Remote cache is unavailable`
with a network error means the Worker or the hostname is down; builds still succeed on
the local cache.

Note that a cached `build` replaces `dist/` wholesale. If a task starts writing outside
its declared `outputs`, the restored result is incomplete even though the run looks fast.
