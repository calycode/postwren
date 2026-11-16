---
'postwren': patch
---

Keep the app shell mounted between pages so in-app navigation swaps only the
routed content instead of rebuilding the rail, header and page. Docked subscriber
and tag panels now render outside the page tree, so the close button stays above
the sticky mobile header.
