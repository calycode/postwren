# @postwren/email

Table-safe email IR, renderer and merge tags. No React, no DOM, no Node APIs — the same pure
function renders the editor preview and the sent message.

```sh
pnpm add @postwren/email
```

```ts
import { createDocument } from '@postwren/email/ir';
import { renderEmail } from '@postwren/email/render';
import { applyMergeTags } from '@postwren/email/template';

const document = createDocument();
const merged = applyMergeTags(document, {
   subscriber: {
      id: 'sub_1',
      email: 'ada@example.com',
      first_name: 'Ada',
      last_name: null,
      tags: ['newsletter'],
      meta: { plan: 'pro' },
   },
   campaign: { id: 'cmp_1', subject: 'Hello', utm_campaign: '', meta: {} },
   links: { unsubscribe: 'https://example.com/u/token' },
});

const { html, text, bytes, warnings } = renderEmail(merged, {
   unsubscribeUrl: 'https://example.com/u/token',
});
```

## Entry points

| Import                     | What it gives you                                                      |
| -------------------------- | ---------------------------------------------------------------------- |
| `@postwren/email/ir`       | `createDocument`, `parseDocument`, `migrateDocument`, `documentIssues` |
| `@postwren/email/render`   | `renderEmail`                                                          |
| `@postwren/email/template` | `applyMergeTags`, `validateTemplate`, `findMergeTags`                  |

The renderer emits only `table`/`tr`/`td` layout with inline styles and MSO conditional comments,
because Outlook on Windows renders with Microsoft Word's engine. There is no `div`, no flex, and no
`max-width` outside the root table.

## License

MIT.
