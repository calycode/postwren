import { describe, expect, it } from 'vitest';
import {
   MAX_METADATA_KEYS,
   MAX_METADATA_VALUE_LENGTH,
   mergeMetadata,
   metadataErrors,
   metadataKeyError,
   parseMetadataJson,
   recordOfStrings,
} from './index';

describe('metadataKeyError', () => {
   it('accepts lowercase snake_case keys starting with a letter', () => {
      expect(metadataKeyError('plan')).toBeNull();
      expect(metadataKeyError('signup_source_2')).toBeNull();
      expect(metadataKeyError(`a${'b'.repeat(63)}`)).toBeNull();
   });

   it('rejects malformed keys', () => {
      expect(metadataKeyError('Plan')).not.toBeNull();
      expect(metadataKeyError('1plan')).not.toBeNull();
      expect(metadataKeyError('plan-name')).not.toBeNull();
      expect(metadataKeyError('')).not.toBeNull();
      expect(metadataKeyError(`a${'b'.repeat(64)}`)).not.toBeNull();
   });

   it('rejects keys that duplicate real subscriber columns', () => {
      for (const key of ['id', 'email', 'first_name', 'last_name', 'status', 'tags']) {
         expect(metadataKeyError(key)).toMatch(/reserved/i);
      }
   });
});

describe('metadataErrors', () => {
   it('reports more than the maximum number of keys', () => {
      const metadata = Object.fromEntries(
         Array.from({ length: MAX_METADATA_KEYS + 1 }, (_, index) => [`key_${index}`, 'value']),
      );

      expect(metadataErrors(metadata).join('\n')).toMatch(/at most/i);
   });

   it('reports an oversized value', () => {
      expect(
         metadataErrors({ plan: 'a'.repeat(MAX_METADATA_VALUE_LENGTH + 1) }).join('\n'),
      ).toMatch(/1024/);
   });
});

describe('mergeMetadata', () => {
   it('overwrites keys and deletes null entries', () => {
      expect(
         mergeMetadata({ plan: 'pro', tier: 'gold' }, { plan: 'team', tier: null, region: 'eu' }),
      ).toEqual({ plan: 'team', region: 'eu' });
   });

   it('does not mutate the current record', () => {
      const current = { plan: 'pro' };
      mergeMetadata(current, { plan: 'team' });
      expect(current).toEqual({ plan: 'pro' });
   });
});

describe('parseMetadataJson', () => {
   it('parses a flat string map', () => {
      expect(parseMetadataJson('{"plan":"pro","tier":2}')).toEqual({ plan: 'pro' });
   });

   it('returns an empty record for missing or malformed values', () => {
      expect(parseMetadataJson(null)).toEqual({});
      expect(parseMetadataJson('not json')).toEqual({});
      expect(parseMetadataJson('[]')).toEqual({});
   });
});

describe('recordOfStrings', () => {
   it('keeps only string entries', () => {
      expect(recordOfStrings({ a: 'x', b: 1, c: null })).toEqual({ a: 'x' });
   });
});
