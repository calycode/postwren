import { describe, expect, it } from 'vitest';
import type { SenderAddress } from './api/types';
import { groupByDomain, isOnlySender } from './senders';

function sender(domain: string, email: string, isDefault = 0): SenderAddress {
   return {
      id: email,
      email,
      name: '',
      domain,
      verified_at: null,
      is_default: isDefault,
      created_at: 0,
   };
}

describe('groupByDomain', () => {
   it('groups addresses under their domain in API domain order', () => {
      const groups = groupByDomain(
         [
            sender('example.org', 'a@example.org'),
            sender('example.com', 'b@example.com'),
            sender('example.com', 'c@example.com'),
         ],
         ['example.com', 'example.org'],
      );

      expect(groups.map((group) => group.domain)).toEqual(['example.com', 'example.org']);
      expect(groups[0]?.addresses.map((address) => address.email)).toEqual([
         'b@example.com',
         'c@example.com',
      ]);
   });

   it('includes domains that only exist on the addresses', () => {
      const groups = groupByDomain([sender('extra.test', 'x@extra.test')], ['example.com']);

      expect(groups.map((group) => group.domain)).toEqual(['example.com', 'extra.test']);
   });
});

describe('isOnlySender', () => {
   it('blocks the default address and the last remaining one', () => {
      expect(isOnlySender(sender('example.com', 'a@example.com', 1), 2)).toBe(true);
      expect(isOnlySender(sender('example.com', 'a@example.com', 0), 1)).toBe(true);
      expect(isOnlySender(sender('example.com', 'a@example.com', 0), 2)).toBe(false);
   });
});
