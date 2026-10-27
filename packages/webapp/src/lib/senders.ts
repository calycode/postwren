import type { SenderAddress } from './api/types';

export type SenderGroup = {
   domain: string;
   addresses: SenderAddress[];
};

export function groupByDomain(
   addresses: readonly SenderAddress[],
   domains: readonly string[] = [],
): SenderGroup[] {
   const groups = new Map<string, SenderAddress[]>();

   for (const address of addresses) {
      const group = groups.get(address.domain) ?? [];
      group.push(address);
      groups.set(address.domain, group);
   }

   const ordered = domains.length > 0 ? [...domains] : [...groups.keys()];
   for (const domain of groups.keys()) {
      if (!ordered.includes(domain)) ordered.push(domain);
   }

   return ordered.map((domain) => ({
      domain,
      addresses: groups.get(domain) ?? [],
   }));
}

export function isOnlySender(address: SenderAddress, total: number): boolean {
   return address.is_default === 1 || total <= 1;
}
