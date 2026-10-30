import { DocumentError, parseDocument } from '@postwren/email/ir';
import type { Document } from '@postwren/email/ir';
import type { Template } from '@/lib/api/types';

export type ParsedTemplateDocument = {
   doc: Document | null;
   issues: string[];
};

function rawDocument(template: Template): unknown {
   return (template as Template & { ir_json?: unknown }).ir_json ?? template.irJson;
}

export function parseTemplateDocument(template: Template): ParsedTemplateDocument {
   const raw = rawDocument(template);
   if (raw === undefined || raw === null) {
      return { doc: null, issues: ['The template has no email document stored.'] };
   }

   let candidate: unknown = raw;
   if (typeof raw === 'string') {
      try {
         candidate = JSON.parse(raw);
      } catch (cause) {
         const detail = cause instanceof Error ? cause.message : 'unknown parse error';
         return { doc: null, issues: [`The stored document is not valid JSON: ${detail}`] };
      }
   }

   try {
      return { doc: parseDocument(candidate), issues: [] };
   } catch (cause) {
      if (cause instanceof DocumentError) {
         return { doc: null, issues: cause.issues.length > 0 ? cause.issues : [cause.message] };
      }
      return {
         doc: null,
         issues: [
            cause instanceof Error ? cause.message : 'The stored document could not be read.',
         ],
      };
   }
}
