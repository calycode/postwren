import { describe, expect, it } from 'vitest';
import { createDocument } from '@mailer/email/ir';
import type { Template } from '@/lib/api/types';
import { formatBytes, parseTemplateDocument } from './template-document';

function templateWith(fields: Record<string, unknown>): Template {
   return {
      id: 'tpl_1',
      name: 'Welcome',
      subject: 'Hello there',
      revision: 1,
      irJson: undefined,
      created_at: 0,
      updated_at: 0,
      ...fields,
   } as unknown as Template;
}

describe('parseTemplateDocument', () => {
   it('reads the stored ir_json string and validates it', () => {
      const document = createDocument();
      const parsed = parseTemplateDocument(templateWith({ ir_json: JSON.stringify(document) }));

      expect(parsed.issues).toEqual([]);
      expect(parsed.doc).toEqual(document);
   });

   it('accepts a document object from the camelCase field', () => {
      const document = createDocument();
      const parsed = parseTemplateDocument(templateWith({ irJson: document }));

      expect(parsed.issues).toEqual([]);
      expect(parsed.doc).toEqual(document);
   });

   it('reports invalid JSON instead of throwing', () => {
      const parsed = parseTemplateDocument(templateWith({ ir_json: '{' }));

      expect(parsed.doc).toBeNull();
      expect(parsed.issues).toHaveLength(1);
      expect(parsed.issues[0]).toContain('not valid JSON');
   });

   it('reports schema issues from an unsupported document', () => {
      const parsed = parseTemplateDocument(
         templateWith({ ir_json: JSON.stringify({ version: 99 }) }),
      );

      expect(parsed.doc).toBeNull();
      expect(parsed.issues.length).toBeGreaterThan(0);
   });
});

describe('formatBytes', () => {
   it('formats small and large rendered sizes', () => {
      expect(formatBytes(512)).toBe('512 B');
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(102_400)).toBe('100 KB');
   });
});
