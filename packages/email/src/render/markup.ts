export function escapeHtml(value: string): string {
   return value
      .replace(/&(?!(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);)/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
}

export function decodeEntities(value: string): string {
   return value
      .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
      .replace(/&#x([0-9a-fA-F]+);/g, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, '\u00a0')
      .replace(/&amp;/g, '&');
}

export type InlineToken =
   | { type: 'text'; text: string }
   | { type: 'strong'; text: string }
   | { type: 'em'; text: string }
   | { type: 'link'; text: string; href: string };

const INLINE = /\*\*([\s\S]+?)\*\*|\*([^*\n]+?)\*|\[([^\]]+)\]\((https:\/\/[^\s)]+)\)/g;

export function parseInline(text: string): InlineToken[] {
   const tokens: InlineToken[] = [];
   let cursor = 0;

   for (const match of text.matchAll(INLINE)) {
      const index = match.index ?? 0;
      if (index > cursor) {
         tokens.push({ type: 'text', text: text.slice(cursor, index) });
      }
      if (match[1] !== undefined) {
         tokens.push({ type: 'strong', text: match[1] });
      } else if (match[2] !== undefined) {
         tokens.push({ type: 'em', text: match[2] });
      } else {
         tokens.push({ type: 'link', text: match[3] ?? '', href: match[4] ?? '' });
      }
      cursor = index + match[0].length;
   }

   if (cursor < text.length) {
      tokens.push({ type: 'text', text: text.slice(cursor) });
   }

   return tokens;
}

export function inlineToText(text: string): string {
   return parseInline(text)
      .map((token) => {
         if (token.type === 'link') return `${decodeEntities(token.text)} (${token.href})`;
         return decodeEntities(token.text);
      })
      .join('');
}

export function inlineToHtml(
   text: string,
   style: { link: string; resolve: (href: string) => string },
): string {
   return parseInline(text)
      .map((token) => {
         if (token.type === 'strong') {
            return `<strong>${escapeHtml(token.text).replace(/\n/g, '<br>')}</strong>`;
         }
         if (token.type === 'em') {
            return `<em>${escapeHtml(token.text).replace(/\n/g, '<br>')}</em>`;
         }
         if (token.type === 'link') {
            return `<a href="${escapeHtml(style.resolve(token.href))}" style="${style.link}">${escapeHtml(
               token.text,
            )}</a>`;
         }
         return escapeHtml(token.text).replace(/\n/g, '<br>');
      })
      .join('');
}
