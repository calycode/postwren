import { signToken } from '@postwren/shared/tokens';
import type { Block, Document } from '@postwren/email/ir';
import type { Env } from '../env';

const CLICK_TTL_SECONDS = 60 * 60 * 24;
const INLINE_LINK = /\[[^\]]+\]\((https:\/\/[^\s)]+)\)/g;

type LinkTarget = { href: string; linkId: string };

export function collectLinks(document: Document): LinkTarget[] {
   const targets: LinkTarget[] = [];

   const visit = (block: Block): void => {
      switch (block.type) {
         case 'button':
            targets.push({ href: block.href, linkId: block.id });
            return;
         case 'image':
            if (block.href !== undefined) targets.push({ href: block.href, linkId: block.id });
            return;
         case 'social':
            for (const link of block.links) targets.push({ href: link.href, linkId: block.id });
            return;
         case 'heading':
         case 'text':
         case 'markdown':
            for (const match of block.text.matchAll(INLINE_LINK)) {
               const href = match[1];
               if (href !== undefined) targets.push({ href, linkId: block.id });
            }
            return;
         case 'list':
            for (const item of block.items.split('\n')) {
               for (const match of item.matchAll(INLINE_LINK)) {
                  const href = match[1];
                  if (href !== undefined) targets.push({ href, linkId: block.id });
               }
            }
            return;
         case 'quote':
            for (const match of block.text.matchAll(INLINE_LINK)) {
               const href = match[1];
               if (href !== undefined) targets.push({ href, linkId: block.id });
            }
            return;
         case 'link':
            targets.push({ href: block.href, linkId: block.id });
            return;
         case 'code':
            return;
         case 'avatar':
            if (block.href !== undefined) targets.push({ href: block.href, linkId: block.id });
            return;
         case 'gallery':
            for (const image of block.images) {
               if (image.href !== undefined) targets.push({ href: image.href, linkId: block.id });
            }
            return;
         case 'table':
            for (const value of [block.header, block.rows]) {
               for (const match of value.matchAll(INLINE_LINK)) {
                  const href = match[1];
                  if (href !== undefined) targets.push({ href, linkId: block.id });
               }
            }
            return;
         case 'section':
         case 'repeat':
            for (const child of block.children) visit(child);
            return;
         case 'columns':
            for (const column of block.columns) {
               for (const child of column.blocks) visit(child);
            }
            return;
         default:
            return;
      }
   };

   for (const block of document.children) visit(block);
   return targets;
}

export function linkKey(linkId: string, href: string): string {
   return `${linkId}\u0000${href}`;
}

export async function signClickLinks(
   env: Env,
   origin: string,
   document: Document,
   messageId: string,
): Promise<Map<string, string>> {
   const resolved = new Map<string, string>();
   const seen = new Set<string>();

   for (const target of collectLinks(document)) {
      const key = linkKey(target.linkId, target.href);
      if (seen.has(key)) continue;
      seen.add(key);

      const token = await signToken(
         { m: messageId, u: target.href, l: target.linkId },
         { secret: env.TOKEN_SECRET, purpose: 'click', ttlSeconds: CLICK_TTL_SECONDS },
      );
      resolved.set(key, `${origin}/t/c/${token}`);
   }

   return resolved;
}
