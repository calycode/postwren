# Templates and the editor

A template is the reusable document behind every campaign. It stores an email
IR, a name and a subject; campaigns pin one revision of it.

## Create a template

Templates → New gives you a starter or an empty document. The shipped starters
are:

- **Newsletter** — a short intro, three updates and a read-more link.
- **Product launch** — a headline, a short pitch and one action.
- **Welcome** — expectations plus the first useful link.
- **Event invite** — who, what, when and one RSVP button.
- **Plain update** — text only.

Starters are ordinary templates after creation. Nothing about them is special or
locked.

## Blocks

The editor has 18 block types:

| Group      | Blocks                                                          |
| ---------- | --------------------------------------------------------------- |
| Content    | Heading, Text, Markdown, Button, Image, Link, Quote, Code, List |
| Layout     | Divider, Spacer, Columns, Section, Table, Gallery               |
| Social     | Social links, Avatar                                            |
| Collection | Repeat                                                          |

`Columns` and `Section` are containers. A section holds up to 20 leaf children
and cannot nest. `Repeat` is a root-level container bound to one campaign data
list; it cannot nest inside another repeat.

Every block has a stable id. Revisions, block notes and click analytics all key
off that id, so reordering a block does not change its identity.

## Editing and saving

- Edits autosave after two seconds and flush when the page is hidden.
- An explicit **Save** advances the template revision.
- Every revision bump writes an immutable version row with the name, subject,
  IR and preview HTML.
- Restoring an old version creates a new revision. History is never rewritten.
- Campaigns pin the revision that existed when they were scheduled.

The toolbar reports the live document size and warns above **102,400 bytes**,
the point at which Gmail clips a message.

## Preview and parity

Preview renders through the same `renderEmail` call the queue consumer uses.
Only link resolution differs: preview keeps editor links, the send rewrites them
to tracked URLs. That is what makes the preview trustworthy.

A campaign's **test** action delivers one real message to an address you choose.
Use it before scheduling, especially for Outlook on Windows, which is the client
the table-only renderer exists for.

## Merge tags

Templates can reference:

| Tag                                    | Source                             |
| -------------------------------------- | ---------------------------------- |
| `{{ subscriber.email }}`               | The recipient                      |
| `{{ subscriber.first_name }}`          | Subscriber first name              |
| `{{ subscriber.meta.plan }}`           | Subscriber custom metadata         |
| `{{ campaign.meta.product }}`          | Campaign custom fields             |
| `{{ item.title }}`                     | Current item inside a repeat block |
| `{{ itemIndex }}` / `{{ itemIndex1 }}` | Zero- or one-based repeat index    |
| `{{ links.web }}`                      | Signed per-recipient web version   |

Filters apply to any value: `default`, `upper`, `lower`, `trim` and `date`.
`date` accepts Unix seconds or an ISO timestamp.

```text
Hello {{ subscriber.first_name | default: "there" }},

{{ campaign.meta.offer | default: "The usual." }}
```

In an `href`, a merged value must resolve to an absolute `https://` URL at send
time. The editor flags values it cannot resolve.

## Repeating collections

A `repeat` block renders its children once per item in a named campaign data
list. The campaign carries the data as JSON:

```json
{
   "posts": [
      { "title": "First post", "url": "https://example.com/one" },
      { "title": "Second post", "url": "https://example.com/two" }
   ]
}
```

Bind the block to `posts`, use `{{ item.title }}` and `{{ item.url }}` inside it,
and set sample items for the editor preview. At schedule time the payload is
frozen into `data_snapshot`, so editing the campaign later cannot change an
in-flight send. Missing lists render zero children. Limits are 10 collections,
50 items each and 128 KB total.

## Block notes

Any block can carry a note from its property panel. Open notes show a count on
the block outline; done notes stay as history. Notes are per template, keyed to
the stable block id, and survive saves and revisions.

## Saved blocks

A configured block or section can be saved for reuse across templates. Saved
blocks are workspace-level, not per template, and are inserted as copies.

## Media

Images upload to R2 and are listed in the media picker. Uploaded assets get a
stable URL served from `/media/*`; the editor also accepts an existing URL.
Media is not automatically deleted when a template is deleted.
