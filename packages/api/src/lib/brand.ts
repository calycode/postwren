/**
 * Worker-rendered pages (unsubscribe, subscription confirmation, OAuth consent)
 * are plain HTML with inline styles, so they share one snippet instead of the
 * SPA component. The PNG comes from the assets binding at the same origin, which
 * is why the consent page only needs `img-src 'self'` in its policy.
 */
export function brandWordmark(width = 104): string {
   const height = Math.round((width * 120) / 238);
   return `<img src="/brand/postwren-wordmark.png" alt="Postwren" width="${width}" height="${height}" style="display:block;width:${width}px;height:auto;margin:0 0 1.25rem;">`;
}
