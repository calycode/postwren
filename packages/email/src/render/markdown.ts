export type MarkdownSegment =
   | { type: 'heading'; level: 1 | 2 | 3; text: string }
   | { type: 'paragraph'; text: string }
   | { type: 'list'; ordered: boolean; items: string[] }
   | { type: 'quote'; text: string }
   | { type: 'code'; text: string }
   | { type: 'divider' };

const HEADING = /^(#{1,3})\s+(.*)$/;
const DIVIDER = /^(-{3,}|\*{3,}|_{3,})$/;
const QUOTE = /^>\s?/;
const BULLET = /^[-*+]\s+/;
const NUMBER = /^\d+[.)]\s+/;
const FENCE = /^```/;

function startsBlock(line: string): boolean {
   const trimmed = line.trim();
   return (
      trimmed.length === 0 ||
      HEADING.test(trimmed) ||
      DIVIDER.test(trimmed) ||
      QUOTE.test(trimmed) ||
      BULLET.test(trimmed) ||
      NUMBER.test(trimmed) ||
      FENCE.test(trimmed)
   );
}

export function parseMarkdown(source: string): MarkdownSegment[] {
   const lines = source.replace(/\r\n?/g, '\n').split('\n');
   const segments: MarkdownSegment[] = [];
   let index = 0;

   while (index < lines.length) {
      const line = lines[index] ?? '';
      const trimmed = line.trim();

      if (trimmed.length === 0) {
         index += 1;
         continue;
      }

      if (FENCE.test(trimmed)) {
         const code: string[] = [];
         index += 1;
         while (index < lines.length && !FENCE.test((lines[index] ?? '').trim())) {
            code.push(lines[index] ?? '');
            index += 1;
         }
         index += 1;
         segments.push({ type: 'code', text: code.join('\n') });
         continue;
      }

      const heading = HEADING.exec(trimmed);
      if (heading) {
         const level = heading[1]?.length === 2 ? 2 : heading[1]?.length === 3 ? 3 : 1;
         segments.push({ type: 'heading', level, text: heading[2] ?? '' });
         index += 1;
         continue;
      }

      if (DIVIDER.test(trimmed)) {
         segments.push({ type: 'divider' });
         index += 1;
         continue;
      }

      if (QUOTE.test(line)) {
         const quote: string[] = [];
         while (index < lines.length && QUOTE.test(lines[index] ?? '')) {
            quote.push((lines[index] ?? '').replace(QUOTE, ''));
            index += 1;
         }
         segments.push({ type: 'quote', text: quote.join('\n') });
         continue;
      }

      if (BULLET.test(line) || NUMBER.test(line)) {
         const ordered = NUMBER.test(line);
         const pattern = ordered ? NUMBER : BULLET;
         const items: string[] = [];
         while (index < lines.length && pattern.test(lines[index] ?? '')) {
            items.push((lines[index] ?? '').replace(pattern, ''));
            index += 1;
         }
         segments.push({ type: 'list', ordered, items });
         continue;
      }

      const paragraph: string[] = [];
      while (index < lines.length && !startsBlock(lines[index] ?? '')) {
         paragraph.push((lines[index] ?? '').trim());
         index += 1;
      }
      if (paragraph.length > 0) {
         segments.push({ type: 'paragraph', text: paragraph.join(' ') });
      } else {
         index += 1;
      }
   }

   return segments;
}
