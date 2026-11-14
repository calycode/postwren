# UI and UX review: Postwren vs Resend vs Loops

Reviewed on 7 Nov 2026 against the public marketing sites and the local Postwren
build. Screenshots are in [`artifacts/ui-review`](../artifacts/ui-review).

The goal is not parity. Postwren is deliberately narrower than both products.
The useful comparison is how each product makes its core loop feel obvious and
fast: **create → audience → send → understand what happened**.

## Short version

Postwren already has the hard parts: a real email renderer, a real editor, real
audiences, real sending, tracking, and an MCP/API surface. What it lacks is the
layer that makes those capabilities feel like a product:

1. **No home.** Signing in drops you into a subscriber table. There is no single
   screen that says "this is the state of your email programme".
2. **No visual inventory.** Templates and campaigns are text tables with no
   thumbnails, no previews, no activity.
3. **No payoff after sending.** The data exists (`campaign_recipients`,
   `link_clicks`) but the UI only shows six counters.
4. **The editor gives equal weight to three panels.** The email you are writing
   is the smallest thing on screen and is clipped at 600px.
5. **The styling is clean but generic.** Flat bordered cards, system font, muted
   teal. It reads like an internal admin tool, not a product with a point of view.

Resend and Loops are visually different from each other, but they share the same
underlying choices: a display face, a strong surface hierarchy, one obvious
primary action per screen, visual artefacts instead of tables, and analytics
that reward opening the app.

## Implementation status

Applied on 7–8 Nov 2026:

- Brand tokens, Public Sans and Newsreader, paper and ink palette, light and
  dark themes.
- Sidebar groups, a single account menu, a home screen with list health, growth
  and setup checklist.
- Home layout settings: each widget can be half width, full width or hidden, and
  the choice persists per browser.
- Template gallery with rendered thumbnails and five starters.
- Campaign results grouped into deliverability, engagement and opt-out, plus
  top links and recent clicks.
- Subscriber activity sheet with sends and clicks. Subscribers now open a single
  side rail — docked beside the table (not the header or filters) on wide screens,
  overlay below `xl` — with editable details, tags, custom fields and activity;
  rows expose two actions and double-click.
- Editor zoom, focus mode, searchable block library and wider canvas.
- Save as template, plus save any block as a reusable workspace block.
- An automations list and linear builder with runs and deliveries. Steps drag to
  reorder, insert controls appear on hover at a card's bottom edge, and Exit is
  locked last.
- Automation runs are a single history: queued/started/finished timings, duration,
  steps run, sent count, expandable delivery rows, and status/subscriber filters.
- Automation variables are indexed in Settings and edited in a dialog.
- Home is a resizable widget grid: drag a corner to change a widget's width and
  height, and Customize only toggles which widgets exist. Automation activity is a
  widget.
- Detail pages use breadcrumbs instead of a back button at the bottom of the page.
- Campaign results come before settings and summary; summary is a compact sidebar.
- Tags show subscriber, campaign and automation usage, with an inline create row.
  Renaming a tag rewrites saved audience queries and automation tag steps.
- Tables sit on their own card surface in both themes.
- API key management in Settings, with environment details under Advanced; revoked
  keys collapse into an audit group and can be deleted permanently.
- Optional Cloudflare discovery in Settings → Sending domains, backed by a
  read-only `CLOUDFLARE_API_TOKEN`, with an explicit not-configured state.
  **Check verification** asks the Email Sending API whether the address's domain
  is onboarded and enabled, then records that result; without a token the manual
  checkbox remains.
- MCP OAuth consent now lists the requested scopes as checkboxes so a client can
  be granted less than it asked for.
- Editor block library supports drag into the canvas with the same insertion
  highlight as block reordering; saved blocks and patterns drag too. Drops follow
  nesting — onto a section or a column means inside it, and blocks reorder among
  their own siblings. The library and the layout tree are separately resizable.
- Media library: upload images once, search them, and pick from a grid in the
  image/avatar/gallery fields.
- Block notes: a TODO/comment per block, open notes counted in the outline and
  managed in the property panel. Autosave and the Gmail clip byte badge remain in
  the editor toolbar.
- Repeat blocks: bind a root-level block to a campaign data list, edit its
  children once, preview up to three sample items, and see an item count in the
  outline. Metadata is stored in `media_assets`; files stay
  in R2.
- The template editor header uses breadcrumbs, matching the other detail pages.
- Template version history with a revision list, side-by-side preview and restore.
  Added blocks are outlined green, removed blocks red and changed blocks amber in
  both previews, like a git diff. The dialog has a fixed height, keeps the last
  preview while the next version loads, and reloads cleanly after a restore.
- Settings is split into tabs — Sending, Audience, API, Embedding, Workspace — so
  the page is scannable instead of one long scroll. Public subscribe keys and API
  keys share the same row, revoked-group and delete pattern.
- The API tab documents transactional sending with ready-to-copy cURL, Node and
  Python snippets. `POST /api/v1/emails` (`emails:write`) sends one message
  outside the campaign pipeline; automation variables now live only on the
  automation pages.

Deferred: workspace theme tokens, natural-language scheduling, previous-campaign
comparison, and a template version history browser. They need new schema or
more scope, not just styling.

The post-change screenshots are in `artifacts/ui-review/after-*.png`:

![Home after](../artifacts/ui-review/after-home-light.png)
![Templates after](../artifacts/ui-review/after-templates.png)
![Campaign results after](../artifacts/ui-review/after-campaign-results.png)
![Automations after](../artifacts/ui-review/after-automations-list.png)
![Automation canvas after](../artifacts/ui-review/after-automation-canvas.png)
![Automation runs after](../artifacts/ui-review/after-automation-runs.png)
![Campaign detail after](../artifacts/ui-review/after-campaign-detail.png)
![Tags after](../artifacts/ui-review/after-tags.png)
![Home layout after](../artifacts/ui-review/after-home-layout.png)
![Home widgets after](../artifacts/ui-review/after-home-widgets.png)
![Cloudflare discovery after](../artifacts/ui-review/after-settings-discovery.png)
![Settings tabs after](../artifacts/ui-review/after-settings-tabs.png)
![Settings audience after](../artifacts/ui-review/after-settings-audience.png)
![API quickstart after](../artifacts/ui-review/after-settings-quickstart.png)
![Version history after](../artifacts/ui-review/after-template-history.png)
![Media library after](../artifacts/ui-review/after-media-library.png)
![Subscriber panel after](../artifacts/ui-review/after-subscriber-panel.png)
![Saved blocks after](../artifacts/ui-review/after-saved-blocks.png)

## What our app looks like today

| Screen              | Screenshot                                                             |
| ------------------- | ---------------------------------------------------------------------- |
| Login               | ![Login](../artifacts/ui-review/our-login.png)                         |
| Subscribers (dark)  | ![Subscribers dark](../artifacts/ui-review/our-subscribers.png)        |
| Subscribers (light) | ![Subscribers light](../artifacts/ui-review/our-subscribers-light.png) |
| Templates           | ![Templates](../artifacts/ui-review/our-templates.png)                 |
| Editor              | ![Editor](../artifacts/ui-review/our-editor.png)                       |
| Campaigns           | ![Campaigns](../artifacts/ui-review/our-campaigns.png)                 |
| Campaign detail     | ![Campaign detail](../artifacts/ui-review/our-campaign-detail.png)     |
| New campaign dialog | ![New campaign](../artifacts/ui-review/our-new-campaign.png)           |
| Settings            | ![Settings](../artifacts/ui-review/our-settings.png)                   |
| Tags                | ![Tags](../artifacts/ui-review/our-tags.png)                           |

## What the reference products look like

| Screen                      | Screenshot                                                       |
| --------------------------- | ---------------------------------------------------------------- |
| Resend home                 | ![Resend home](../artifacts/ui-review/resend-home.png)           |
| Resend templates hero       | ![Resend templates](../artifacts/ui-review/resend-templates.png) |
| Resend template editor mock | ![Resend editor](../artifacts/ui-review/resend-templates-3.png)  |
| Resend analytics cards      | ![Resend analytics](../artifacts/ui-review/resend-analytics.png) |
| Loops home                  | ![Loops home](../artifacts/ui-review/loops-home.png)             |
| Loops workflow canvas       | ![Loops workflow](../artifacts/ui-review/loops-workflow.png)     |
| Loops theme editor          | ![Loops theme](../artifacts/ui-review/loops-theme.png)           |

## Feature comparison

Legend: **Yes** = first-class in the UI, **Partial** = present but thin or
API-only, **No** = not offered.

| Capability                  | Postwren                                      | Resend                                                      | Loops                                                |
| --------------------------- | --------------------------------------------- | ----------------------------------------------------------- | ---------------------------------------------------- |
| Visual email editor         | Yes. Block IR, canvas is the real render      | Yes. WYSIWYG, keyboard commands                             | Yes. Editor plus themes/components                   |
| True preview parity         | Yes. Same `renderEmail` as the send           | Yes                                                         | Yes                                                  |
| Template starting point     | No. New template is blank                     | Template library, variables, publish flow                   | Campaign templates and workflow templates            |
| Brand tokens / themes       | No. Per-document width, font, preheader only  | Global styles per template                                  | Yes. Colours, type, spacing inherited by every email |
| Reusable saved blocks       | No. Fixed patterns only                       | Components                                                  | Components                                           |
| Template version history    | Partial. Revision number, no history          | Yes. Draft, publish, full history                           | Yes                                                  |
| Audience model              | Tags, metadata, query grammar                 | Audiences, contact properties, segments                     | Segments from properties and events                  |
| Contact profile             | Partial. Edit dialog only                     | Contact detail with attributes and engagement               | Contact record with full activity                    |
| CSV import                  | Yes                                           | Yes, with column mapping                                    | Yes                                                  |
| Campaign creation           | Yes. Modal form                               | Broadcast flow                                              | Campaign flow                                        |
| Natural-language scheduling | No. Date/time input                           | Yes (`in 1 hour`)                                           | Yes                                                  |
| Test send                   | Yes                                           | Yes                                                         | Yes                                                  |
| Per-campaign analytics      | Partial. Six counters                         | Deliverability, engagement, opt-out, top links, per-contact | Goal conversions, revenue, engagement                |
| Per-link analytics          | No UI, data exists (`link_clicks.url`)        | Yes                                                         | Yes                                                  |
| Per-recipient timeline      | No UI, data exists                            | Yes                                                         | Yes                                                  |
| Audience growth chart       | No UI, data exists (`subscribers.created_at`) | Yes                                                         | Yes                                                  |
| Home dashboard              | No. Redirects to subscribers                  | Yes                                                         | Yes                                                  |
| Setup checklist             | Partial. 10-step guided tour                  | Yes                                                         | Yes. Agent-assisted setup                            |
| Automation / workflows      | No, by design                                 | Yes                                                         | Yes                                                  |
| A/B testing                 | No, by design                                 | Yes                                                         | Yes                                                  |
| Transactional sends         | No, by design                                 | Yes                                                         | Yes                                                  |
| Hosted signup forms         | No. Public subscribe API plus embed docs      | No. Audiences API                                           | Yes                                                  |
| Webhooks                    | No                                            | Yes                                                         | Yes                                                  |
| API and agent access        | Yes. Scoped keys, MCP, OAuth                  | SDKs and API                                                | SDKs and agent integrations                          |
| Self-hosted / own data      | Yes. One Worker, D1, R2, Queues               | No                                                          | No                                                   |
| Narrow, legible product     | Yes                                           | No                                                          | No                                                   |

### Features worth considering (small, not bloat)

These fit the existing model and reuse data or infrastructure we already have.
None require a workflow builder or a second product.

1. **Home / Today screen.** Four tiles (subscribers, campaigns sent this month,
   average open rate, average click rate), a 90-day audience growth sparkline, a
   "Continue where you left off" list, and a setup checklist. No new tables.
2. **Campaign results, upgraded.** Group the existing counters into
   Deliverability / Engagement / Opt-out, add deltas against the previous
   campaign, and add two tables that the database already supports: top clicked
   links (group `link_clicks` by `url`) and most engaged recipients
   (`campaign_recipients.opened_at`, `clicked_at`).
3. **Subscriber activity sheet.** Clicking a subscriber opens a side sheet with
   profile, tags, metadata, source, and a timeline of campaigns received,
   opened, and clicked. Reuses `campaign_recipients` and `link_clicks`.
4. **Starter template gallery.** Six to eight named starters with thumbnails:
   newsletter, product launch, welcome, event, changelog, plain text. We already
   ship eleven patterns; promote them into full documents and show them instead
   of a blank table row when the user has no templates.
5. **Theme tokens per workspace.** Loops does "design once, send everywhere".
   We already have document settings. Add a small theme object (background,
   text, link, button background, button radius, font stack) that new documents
   inherit, editable in Settings. This is a handful of fields, not a design
   system builder.
6. **API key management in Settings.** The backend route exists
   (`/api/v1/settings/api-keys`) and the README says it is under Settings, but
   there is no UI for it. This is a consistency fix, not a new feature.

### Deliberately not recommended

Automations/workflow canvas, A/B testing, inbound email, dedicated IPs,
multi-tenant billing, or an in-app AI chat. They are the main places where
Resend and Loops become large products. Our narrowness is a differentiator.

## UI and UX evaluation

Scores are subjective, on a 10-point scale, judged on the screens a user sees
every day rather than on marketing pages.

| Dimension                | Postwren | Resend | Loops | Comment                                                          |
| ------------------------ | -------- | ------ | ----- | ---------------------------------------------------------------- |
| Visual craft             | 6        | 10     | 9     | Our surfaces are flat, borders do all the work, no depth or glow |
| Typographic hierarchy    | 5        | 9      | 9     | One sans family, 20px headings, no display moments               |
| Information architecture | 5        | 9      | 9     | Five flat nav items, no home, no grouping, no search             |
| Empty and zero states    | 4        | 8      | 9     | Large empty canvases with one line of copy                       |
| Editor experience        | 6        | 9      | 8     | Canvas is the smallest panel and clips at 600px                  |
| Analytics payoff         | 4        | 9      | 9     | Counters only; no trends, links, or people                       |
| Onboarding               | 6        | 8      | 9     | Tour is good, but it is a tour, not a setup path                 |
| Focus / restraint        | 9        | 7      | 6     | We win here; keep it                                             |

### 1. Foundation: type, colour, surface

**Resend** uses a near-black canvas, a high-contrast serif display face for
editorial moments, white sans-serif body text, thin 1px outlines, and a single
warm-glowing 3D object per section. **Loops** uses a warm charcoal canvas, the
same serif/sans pairing, a vivid orange accent rail, and product screenshots
with real UI density.

Our palette is a cool dark teal (`oklch(0.17 0.015 200)`) with a muted teal
primary. In dark mode the primary button and the "Subscribed" badge are almost
the same value, so nothing pops. Cards are `border-border` plus background; no
shadow, highlight, or gradient.

Concrete direction, keeping the teal brand:

- **Surfaces (dark):** `#0B0D0D` page, `#121515` card, `#171B1B` raised,
  border `rgba(255,255,255,0.08)`, inset top highlight
  `inset 0 1px 0 rgba(255,255,255,0.04)`.
- **Surfaces (light):** `#FAFAF8` page, `#FFFFFF` card, border
  `rgba(17,24,39,0.08)`, shadow `0 1px 2px rgba(16,24,40,0.06)`.
- **Primary:** a brighter teal in dark mode (`#2DD4BF`, dark text) and a deeper
  teal in light mode (`#0F766E`, white text). Use it only for the primary action,
  active nav, and focus ring.
- **Accent:** one warm secondary (amber/coral) reserved for "live", "sending",
  and highlights, so teal does not carry every meaning.
- **Type:** add Inter (or Geist) for UI and one display serif (Instrument Serif
  or Newsreader) for the login screen, empty-state headlines, and the home
  greeting. Product headings stay sans, but move to 30/32px with tighter
  tracking. Keep body at 14px, labels at 12px uppercase with 0.04em tracking.
- **Radius and spacing:** cards 12px, controls 8px, page padding 32px, content
  max-width 1440px instead of 2000px. Right now tables stretch to 2000px on wide
  screens, which makes rows hard to scan.

### 2. Chrome: the header and sidebar are doing too little

`app-shell.tsx` renders a 56px sticky header whose only content is the page
title, which is repeated immediately below as the `<h1>` in `page-header.tsx`.
That is a whole band of vertical space for no information.

Replace the header with one of:

- a breadcrumb (`Campaigns / October send`) plus global search and a
  `New` split button, or
- remove it on list pages and let the page header own the top of the content.

Sidebar changes:

- Group navigation: **Audience** (Subscribers, Tags), **Email** (Templates,
  Campaigns), **Workspace** (Settings).
- Put theme, guide, and sign-out inside the account menu. Today the sidebar
  footer has four controls stacked under the user card and feels like a
  debugging toolbar.
- Add a `⌘K` search / command palette. Resend has global search; for us it can
  start as a template and campaign jump list.
- Keep the collapse behaviour. It is good.

### 3. Lists: tables are not an inventory

Templates is a five-column table with no image, no preview, and no sense of
which template produced which campaign. Resend shows template cards with
previews and status. Loops shows grouped lists with type icons and statuses.

Suggestions:

- Templates: a responsive card grid with a 16:9 thumbnail rendered from
  `preview_html`, name, subject, revision, last edited, and a "Use in campaign"
  action. Keep a table toggle for power users.
- Campaigns: a row layout with status dot, name, audience, send time, and a
  small inline open/click bar. Add a thumbnail on the left. This turns a data
  dump into a history.
- Fix the filters. Both Subscribers and Campaigns show the raw value `all` in
  the select trigger. They should read "All statuses" and "All tags".
- Row actions: delete is a red icon in every row, in both themes. It draws the
  eye more than the content. Make row actions neutral until hover, and put
  delete inside an overflow menu.
- Campaign detail: the recipient table shows `subgga31xaw...` instead of the
  subscriber's email. That is a real trust bug, not a styling issue.

### 4. The editor needs to prioritise the email

Today, at 1440px wide, the editor spends 256px on the app sidebar, 264px on the
blocks/outline panel, and 320px on properties. The canvas gets the remainder and
the 600px email is horizontally clipped, with its own scrollbars.

This is the single biggest UX problem in the product.

- Default the blocks panel to a narrow icon rail, or collapse it when a block is
  selected. Keep the outline behind a tab.
- Show the properties panel only when something is selected; when nothing is
  selected it currently shows a large empty card plus document settings.
- Give the canvas a zoom control (50/75/100/fit) and a focus mode that hides
  both side panels. Resend's editor mock is almost entirely canvas.
- Move the 17 block types plus 11 patterns into a searchable command menu
  (`/` or a single "Add block" button) instead of a permanently scrolling
  library. Keep categories, lose the wall.
- The "New blocks are added at the end of the email" hint is a symptom: the
  insertion model is not visible. A hover `+` between blocks, or an insertion
  affordance at the end of the canvas, would remove the need for that sentence.
- The toolbar is good: undo/redo, 600/375, warnings, bytes. Keep it, but give it
  a stronger selected state and reduce the visual weight of the byte counter.

### 5. Campaign creation is a long modal with the action below the fold

`New campaign` opens a single scrolling dialog containing name, template,
subject, from name, from email, reply-to, tags, query, custom fields, and an
advanced section. On a 1000px viewport the primary action is not visible.

- Split it into two steps: **Content** (template, name, subject, sender) and
  **Audience & schedule** (tags/query, preview count, when). Keep a live summary
  on the right or in a sticky footer.
- Show the audience count and a sample recipient before creating. We already
  have `use-audience-preview`.
- Make the primary button sticky: Cancel on the left, Create campaign on the
  right.
- Custom fields belong behind "Advanced" or in the campaign detail, not in the
  first-run path.

### 6. Analytics needs to answer "did it work?"

The campaign detail screen is the best structure we have: summary card, stats,
recipients. But the stats are eight identical bordered boxes with no grouping,
no trend, and no colour. Resend groups metrics into Deliverability, Engagement,
and Opt-out cards with big percentages and status dots. Loops leads with
conversions and revenue.

Use the data we already collect:

- Three grouped tiles: **Delivered** (sent, bounced, failed), **Engagement**
  (open rate, click rate, clicks per clicker), **Opt-out** (unsubscribes,
  complaints, suppression).
- A comparison line: "vs previous campaign" for each rate.
- Top links table from `link_clicks`: URL, clicks, unique clickers, share.
- Openers/clickers table with recipient email and timestamp. This is the
  "understand engagement on an individual level" feature Resend markets, and
  our schema already supports it.
- A send timeline (created → scheduled → started → completed → paused) using the
  campaign columns.

### 7. Zero states and onboarding

The guided tour is solid and the dev-mode login panel is genuinely helpful. But
a first-run user still lands on an empty table. Loops leads with a one-screen
setup path; Resend's empty dashboard is a checklist.

- Add a persistent "Finish setting up" card on Home until the workspace has a
  verified sender, a template, and a sent campaign. Three items, each linking to
  the right screen.
- Empty templates should show the starter gallery, not a single `New template`
  button.
- Empty subscribers should show the two intake paths (CSV import, public
  subscribe key) as cards, with the snippet ready to copy.
- Move the environment/API base URL card out of Settings into an "Advanced"
  section. It is developer information, not a workspace setting.
- Add the missing API key card to Settings, since the README promises it.

### 8. Motion and polish

Resend and Loops use subtle motion to make the product feel alive: hover lifts,
fades, product demos, glowing objects. We have a toast animation and little
else.

Small, cheap wins:

- 150ms ease-out on card hover, row hover, and dropdown open.
- Page content fade-in on route change (respect `prefers-reduced-motion`).
- A skeleton that matches the final layout; the current campaign skeleton does.
- Focus rings that are visible in both themes. Today the ring is the same muted
  teal as the primary and gets lost on dark surfaces.
- A real empty-state illustration or pattern, not just an icon in a circle.

## Suggested rework sequence

**Phase 1: foundation (1–2 days).** Tokens in
`packages/ui/src/styles/theme.css`; Inter plus a display serif; new surface,
primary, border, and shadow values; header/sidebar cleanup; filter labels; row
action tone; content max-width.

**Phase 2: information architecture (3–5 days).** Home screen with checklist,
tiles, and growth sparkline; template gallery with thumbnails; campaign list as
history rows; campaign detail grouped stats, top links, and recipient emails;
subscriber activity sheet.

**Phase 3: editor (2–3 days).** Canvas-first layout, collapsible rails,
properties on selection, zoom/focus mode, searchable add-block menu, insertion
affordances.

**Phase 4: optional depth (2–3 days).** Workspace theme tokens, starter
template gallery, API key management UI, natural-language scheduling.

Phase 1 and 2 give most of the perceived quality gap. Phase 3 fixes the screen
users spend the most time in. Phase 4 is where we take one or two ideas from
Loops without copying its product.

## What to protect

- The renderer is the moat. The preview is the send; do not replace it with a
  DOM editor that drifts from the output.
- Self-hosted, one Worker, own data. Neither competitor offers this.
- Campaigns freeze content and sends are idempotent. That is a real reliability
  story and deserves better UI language than "pinned revision".
- The MCP/API surface is ahead of both products for agent workflows. Surface it
  on the home screen and in Settings instead of hiding it in docs.
- Restraint. The target is not "Resend with fewer features"; it is "the email
  tool that feels calm, fast, and honest about what it sent".
