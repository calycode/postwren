# Repeating collections in templates

Status: implemented (v1) on 2026-11-09. This document began as the scoping
note and is kept as the design reference. Deviations from the original plan are
listed at the end of this section.

What shipped:

- a root-level `repeat` block with a fixed `item` alias, optional `itemKey`, up
  to 20 children, and a preview-only `sample` array;
- `item.<key>`, `{{ itemIndex }}` and `{{ itemIndex1 }}` merge paths, including
  the `date` filter for Unix seconds and ISO strings;
- campaign `data` storage, `data_snapshot` freezing at schedule/send, preview,
  test send, public web version and MCP/API fields;
- payload validation (10 collections, 50 items, flat scalar values, 128 KB) and
  a 10-repeat document limit;
- editor Repeat block, data/item key/sample fields, outline badge, and sample
  preview in the canvas;
- unique clone ids (`<blockId>:<itemKey>` or `:<index>`) for real sends, and
  template ids during editor preview so canvas selection still maps to the
  source block.

Deviation: a missing array renders zero children in a real send and does not add
a render warning. The preview falls back to `sample`. Invalid merged URLs keep
the existing render-error behaviour; they are not silently dropped.

## 1. The question that started this

"Can an automation run on a schedule?"

No. Automation triggers are `subscriber.created`, `tag.added`,
`campaign.clicked` and `api.event`. The cron trigger only advances an existing
run whose `next_run_at` is due; it never starts a run. Campaigns are also
one-shot: a campaign has one `scheduled_at` and one send.

A recurring "every two weeks, turn the latest blog posts into an issue" job is
therefore two separate things:

1. Something creates a campaign from a data payload on a cadence.
2. The template repeats over that payload.

The first is a **recurring campaign schedule**, not an automation trigger. It can
live outside the app today: a GitHub Action, a Cloudflare Worker cron, or any
script calling `POST /api/v1/campaigns` and then `/send-now` (or `/schedule`).
The second is the real missing primitive: a repeat block.

## 2. What AppGyver does

AppGyver's repeat is a property of a component, not a special "list" widget.
Reading the mirror at `exploration/oss-appgyver/composer-mirror/appgyver`:

- `ComponentRepeatEditor.jsx` binds a component to an array of objects.
- The binding has `source` and `key` (where the array comes from), an optional
  `alias` (default `current`), and an `itemKey` used to identify items.
- `itemKey` is either a unique property name (`single-key`) or `index`.
- Bindings inside the repeated subtree refer to the alias, e.g.
  `current.title`; nested repeats can shadow an outer repeat name.
- The editor resolves a schema and example values so the canvas can render three
  or four preview instances while you edit the template once.
- `getResolverRepeats.ts` derives the item schema and preview values; the
  reference resolver hides outer repeats with the same name and exposes the
  inner one.

The useful ideas are: **bind to an array, name the item, identify items for
stability, and edit the template once while previewing several instances**. The
expression/schema engine around it is much larger than we need.

## 3. Why this fits Postwren

The IR is already a tree of blocks with stable ids. Campaigns already freeze
their content into `ir_snapshot` and their metadata into `metadata_snapshot`.
Adding a repeat block is additive: it does not change the send path, the queue
job, suppression, tracking or the web version.

The missing pieces are:

- a block that says "repeat these children for each object in `posts`";
- a merge-tag scope for the current item;
- a campaign-level data payload that is snapshotted with the content;
- editor and preview support.

## 4. Options considered

### A. A repeat property on every container (AppGyver-style)

Add `repeat?: { data, alias, itemKey }` to `section` and `columns`.

Pros: layout flexibility, no new block type.
Cons: only containers can repeat; a bare image + text + button needs a section
wrapper; the IR grows a cross-cutting field; the editor has to explain why some
blocks can repeat and others cannot.

### B. A `repeat` container block

Add `type: 'repeat'` with `children: Block[]`, a data path, and an item key.

Pros: one obvious block in the library, one concept in the outline, children can
be leaf blocks or a section/columns card, and the editor can show "3 items".
Cons: another container type, and nesting rules need to be explicit.

### C. A data-bound list block

Add `type: 'list'` that owns a fixed item template (title, description, image,
url). Simpler UI, but it cannot express a blog card with an arbitrary layout and
would need a new schema every time the design changes.

**Recommendation: B.** A repeat container whose children can be any non-repeat
block. It covers a simple list and a full card layout without inventing a second
design system.

## 5. Proposed IR

```ts
type RepeatBlock = BlockBase & {
   type: 'repeat';
   /** Key in the campaign data object, e.g. "posts". */
   data: string;
   /** Merge-tag scope for one item. Fixed to "item" in v1. */
   alias: 'item';
   /** Optional path to a unique scalar, e.g. "slug". Index is the fallback. */
   itemKey?: string;
   /** Used by the editor and template preview only, never by a real send. */
   sample?: Record<string, string | number | boolean>[];
   padding: Spacing;
   children: Block[];
};
```

Rules:

- `data` matches `^[a-z][a-z0-9_]{0,63}$`.
- `itemKey` matches the same key grammar and must exist on every item.
- `children` at least one block, at most 20.
- No `repeat` inside a `repeat` in v1. A `repeat` may contain `section` and
  `columns`; `section` and `columns` keep their existing leaf-only children.
- `repeat` lives at the document root in v1. That covers a header, a repeated
  card, and a footer. Allowing it inside a section is a later change.
- `sample` is at most 3 items and only for preview; it is stripped from the send
  path.

This is deliberately narrower than AppGyver. No expressions, no nested repeats,
no formula language.

## 6. Data payload

Campaigns need a JSON object next to their flat metadata:

```json
{
   "posts": [
      {
         "title": "Why we moved off the old stack",
         "url": "https://example.com/blog/moved",
         "excerpt": "A short summary.",
         "image": "https://example.com/blog/moved.jpg",
         "published": 1767225600
      }
   ]
}
```

The template:

```text
{{ item.title }}
{{ item.excerpt }}
[Read the post]({{ item.url }})
```

### Storage

Add to `campaigns`:

- `data_json TEXT NOT NULL DEFAULT '{}'`
- `data_snapshot TEXT NULL`

`data_snapshot` is written at schedule/send time next to `ir_snapshot` and
`metadata_snapshot`. The queue consumer renders the snapshot, so editing the
campaign after scheduling cannot change an in-flight send.

`metadata_json` stays a flat string map. Do not overload it: metadata is for
merge tags, data is for collections and structured values.

### Limits

- Request body data: 128 KB serialised.
- Root must be an object; each named value used by a repeat must be an array of
  objects.
- At most 50 items per repeat and 10 repeats per document.
- Item values: string, number, boolean or null. No nested objects or arrays in
  v1; a nested object makes the merge grammar and preview story much larger.
- Strings at most 4,000 characters; keys match the metadata key grammar.
- Empty or missing arrays render zero children. A repeat does not block a send.

### API

- `campaignInput` and `campaignPatch` accept `data?: Record<string, unknown>`.
- `CampaignResource` exposes `data`.
- `POST /api/v1/campaigns` and `PATCH /:id` validate and store it.
- Schedule/send-now copy it into `data_snapshot`.
- Preview and the public web version read the snapshot.
- MCP campaign tools gain the same field.
- Transactional email with a template and data is a later phase; today
  `/api/v1/emails` takes raw HTML, not an IR template.

## 7. Merge tags and rendering

Extend the merge context:

```ts
type MergeContext = {
   // existing subscriber, campaign, automation, links
   data: Record<string, unknown>;
   item?: Record<string, string | number | boolean | null>;
   itemIndex?: number;
};
```

New paths inside a repeat:

- `{{ item.<key> }}`
- `{{ itemIndex }}` (0-based)
- `{{ itemIndex1 }}` (1-based)

Existing filters apply: `default`, `upper`, `lower`, `trim`, `date`.

`applyMergeTags` becomes the single expansion point:

1. Walk the document.
2. On a `repeat`, read `data[data]`. If it is not an array, render zero children.
   Preview falls back to the block's `sample` array.
3. For each item, clone the children, give every cloned block a new id
   (`blockId:itemKey` or `blockId:index`), and apply tags with `item` and
   `itemIndex` in scope.
4. Continue with the outer context for blocks outside the repeat.

Why expand before `renderEmail`: the renderer stays a pure IR → HTML function,
click tracking keeps its existing `link_id` model, and preview/send parity is
unchanged. The expanded document is still table-only.

### IDs and analytics

The clone id must be unique and stable:

- If `itemKey` is set and every item has a unique value, use
  `<blockId>:<value>`.
- Otherwise use `<blockId>:<index>`.

That id is the `link_id` for click analytics, so each repeated link is measured
separately. It also keeps `data-block-id` unique in the annotated preview.

Validation should reject duplicate `itemKey` values rather than silently
collapsing analytics.

### URLs and escaping

- Text values are HTML-escaped by the existing inline renderer.
- `{{ item.url }}` in an href must resolve to an absolute `https://` URL at send
  time. If it does not, omit the link or render plain text and add a warning.
- `{{ item.image }}` must be an absolute https image URL; otherwise omit the
  image and warn.
- Never allow a data value to introduce a `javascript:` or `data:` URL.
- This is the same policy as merge tags today, extended to runtime data.

### Missing data

- Preview uses `sample`; if absent, generate placeholder values from the item
  tags used inside the repeat.
- Campaign preview uses the campaign's real `data` when present, otherwise the
  sample.
- A real send with a missing array renders zero children and records a warning.
  It does not fail the whole campaign unless a future "required data" flag is
  added.

## 8. Editor UX

Add **Repeat** to the block library under Layout/Data.

Property panel:

- **Data key** — e.g. `posts`.
- **Identify items by** — optional property path, e.g. `slug`; otherwise index.
- **Sample items** — a small JSON editor for 1–3 preview items.
- **Children** — the same block insertion, reorder and drag behavior as a
  section. The canvas renders the children once per sample item during editing.

Outline:

- The repeat is one node with its children, not one node per preview item.
- Show a badge with the item count.
- Open notes on the repeat or on its children work as they do elsewhere.

Canvas:

- Render the sample array as repeated cards.
- A small "Repeating: 3 preview items" badge makes it clear that the user is
  editing one template, not three copies.
- Selecting a child selects the template child, not an instance.

Validation messages:

- "Data key is required."
- "Item key must match every item."
- "Add at least one block inside the repeat."

The shipped v1 validates the block shape and campaign payload, but does not yet
run a scope-aware check for `{{ item.* }}` outside a repeat. Those tags render
empty there. That check is the next editor validation pass.

## 9. Rendering and test seams

Tests belong at the existing seams:

1. `applyMergeTags` expands a repeat into the expected number of blocks.
2. Cloned ids are unique and stable when `itemKey` is used.
3. A missing array renders zero children and returns a warning.
4. Escaping and href/image validation for item values.
5. `renderEmail` output for a composed document with a repeat (golden +
   invariants).
6. Campaign lifecycle: snapshot data, replay a queue batch, assert the rendered
   message contains each item once.
7. Web version: the personalized and anonymous pages use the snapshot.
8. Editor: document in → callbacks out; repeat child operations do not duplicate
   template blocks.

## 10. Compatibility and migration

Adding a block type is additive to the IR, but a renderer published before the
change will reject it. This repository is still pre-release, so v1 kept
`IR_VERSION = 1` rather than forcing a migration. Before publishing
`@postwren/email`, decide whether the new block needs an IR version bump:

- Ship the block in a minor release with a documented new IR version if the
  schema version is bumped.
- If `IR_VERSION` moves to 2, add a v1 → v2 identity migration and fixtures.
- Old documents must continue to parse and render unchanged.
- `documentIssues` must report an unknown repeat key or a `repeat` inside a
  repeat clearly.

## 11. What is not in scope

- Fetching an RSS/JSON feed at send time.
- Nested repeats and nested item objects.
- Conditional blocks or arbitrary expressions.
- A formula language or AppGyver-style binding graph.
- Per-recipient arrays from subscriber metadata.
- A visual data mapper.
- Recurring campaign scheduling.
- Sending a different number of items per recipient.

## 12. Phased plan

1. **IR + renderer.** Add `RepeatBlock`, `item`/`itemIndex` tags, expansion,
   id generation, URL/image validation, warnings, golden tests. Publishable in
   `@postwren/email`.
2. **Campaign data.** Add `data_json` / `data_snapshot`, contracts, API,
   schedule/send snapshot, preview, web version, MCP tools, tests.
3. **Editor.** Add the block, property panel, sample data, outline badge, canvas
   preview, validation, tests.
4. **Docs and fixtures.** IR docs, comparison update, a fixture with a blog
   digest, a template starter.
5. **Optional recurring schedule.** Separate design: `campaign_schedules` with a
   cadence, next run, data source and materialisation into a campaign. Do this
   only after the repeat block is in use.

## 13. Open questions

1. Fixed `item` alias in v1, or configurable aliases? Fixed is simpler and
   covers the blog case.
2. Is `sample` authored by the user, generated from item tags, or both? Generated
   placeholders are less work but less realistic.
3. Should repeat be allowed inside a section in v2, or is root-only enough
   forever?
4. Should `itemKey` be required for lists that need per-item click analytics, or
   is index acceptable with a warning?
5. Do we need a "required data" flag so a missing array fails a campaign instead
   of sending an empty section?
6. Should `date` accept ISO strings as well as Unix seconds? Blog data will
   probably arrive as ISO.
7. Does the public web version show the same repeated data, or should it have a
   separate snapshot? Same snapshot is simpler and preserves email/web parity.

## 14. Recommendation

Build the repeat block, not a scheduled trigger. The trigger model is fine; the
missing abstraction is a collection in the template plus a snapshotted data
payload. A repeat block also makes the external recurring job trivial: generate
the posts array, create a campaign, send it.

Keep v1 narrow: one fixed `item` alias, flat item objects, root-level repeat,
no feeds, no nesting. If the blog digest works, the design has earned the right
to expand.
