# @postwren/docs

The docs site and landing page. Markdown lives in `docs/`; this package holds
the build output only. Nothing is deployed yet.

## Build locally

```sh
pnpm docs:build     # regenerate the manifest and references, render the site
pnpm docs:preview   # serve packages/docs/dist on :3031
pnpm docs:dev       # build, then serve on :3030
```

Output: `packages/docs/dist`, which is git-ignored.

## How it fits together

| Piece                           | Role                                                                |
| ------------------------------- | ------------------------------------------------------------------- |
| `docs/**/*.md`                  | Source of truth for every page                                      |
| `scripts/docs/manifest.ts`      | Section, URL path and order for each page                           |
| `scripts/docs/generate.ts`      | Writes `manifest.json`, `_sidebar.md`, and the generated references |
| `scripts/docs/build.ts`         | Renders Markdown, bundles search, copies assets, writes the site    |
| `scripts/docs/client.ts`        | Theme, sidebar, search and copy-to-clipboard                        |
| `util-resources/docs-template/` | Shell, landing page and CSS                                         |
| `scripts/docs/serve.mjs`        | Local static server                                                 |

The HTTP API and MCP tool pages are generated from the route modules, the scope
table and `packages/api/src/mcp/tools.ts`. Do not edit them by hand.

The logo, wordmark and favicon are copied from `packages/webapp/public` at build
time, so `pnpm brand:assets` remains the only place brand art is changed.

## Before a future deploy

1. Pick a domain and set `routes` in `wrangler.jsonc` (turn `workers_dev` off if
   the docs should only be reachable there).
2. Set `DOCS_SITE_URL` in the build environment so canonical URLs and
   `sitemap.xml` point at the real origin.
3. Add a CI step that runs `pnpm docs:build` and deploys this package. It is
   intentionally absent for now.
4. Drop an `og-image.png` into `docs/_media` to turn on the Open Graph image;
   the build omits the tag while the file is missing.
