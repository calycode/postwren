import { AppError } from '@postwren/worker-kit/errors';
import type { Env } from '../env';

type CloudflareZone = {
   id: string;
   name: string;
   status: string;
};

type CloudflareDnsRecord = {
   id: string;
   type: string;
   name: string;
   content: string;
};

type CloudflareResponse<T> = {
   success: boolean;
   result: T;
   errors?: { code: number; message: string }[];
};

export type DiscoveredDomain = {
   id: string;
   name: string;
   status: string;
   emailRouting: boolean | null;
   mx: boolean;
   spf: boolean;
   dkim: boolean;
   dmarc: boolean;
   suggestedAddress: string;
};

type CloudflareSendingSubdomain = {
   tag: string;
   name: string;
   enabled: boolean;
   dkim_selector?: string;
   return_path_domain?: string;
};

export type SendingDomainVerification = {
   configured: boolean;
   domain: string;
   zone: string | null;
   state: 'enabled' | 'disabled' | 'not_onboarded' | 'no_zone' | 'unconfigured';
   detail: string;
};

function emailDomain(email: string): string {
   return email.split('@')[1]?.trim().toLowerCase() ?? '';
}

function wildcardCovers(pattern: string, domain: string): boolean {
   return pattern.startsWith('*.') && domain.endsWith(pattern.slice(1));
}

async function cloudflare<T>(env: Env, path: string): Promise<T> {
   const token = env.CLOUDFLARE_API_TOKEN?.trim();
   if (token === undefined || token.length === 0) {
      throw new AppError(400, 'cloudflare_not_configured', 'CLOUDFLARE_API_TOKEN is not set');
   }

   const response = await fetch(`https://api.cloudflare.com/client/v4${path}`, {
      headers: {
         authorization: `Bearer ${token}`,
         accept: 'application/json',
      },
   });

   const body = (await response.json().catch(() => null)) as CloudflareResponse<T> | null;
   if (!response.ok || body === null || body.success !== true) {
      const message =
         body?.errors?.[0]?.message ??
         `Cloudflare returned ${response.status}. Check the API token permissions.`;
      throw new AppError(502, 'cloudflare_error', message);
   }

   return body.result;
}

/**
 * Cloudflare verifies a sending *domain*, not an address: once a zone is
 * onboarded under Email Service → Email Sending and enabled, any local part on
 * that domain may send. `GET /zones/:id/email/sending/subdomains` is the
 * authoritative check; there is no per-address verification API.
 */
export async function verifySendingDomain(
   env: Env,
   email: string,
): Promise<SendingDomainVerification> {
   const domain = emailDomain(email);
   if ((env.CLOUDFLARE_API_TOKEN ?? '').trim().length === 0) {
      return {
         configured: false,
         domain,
         zone: null,
         state: 'unconfigured',
         detail: 'Set CLOUDFLARE_API_TOKEN with Email Sending read access to check verification.',
      };
   }

   const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
   const zones = await cloudflare<CloudflareZone[]>(
      env,
      accountId.length > 0
         ? `/zones?per_page=50&account.id=${encodeURIComponent(accountId)}`
         : '/zones?per_page=50',
   );

   // The longest matching suffix is the zone that actually holds the records.
   const zone = zones
      .filter((candidate) => domain === candidate.name || domain.endsWith(`.${candidate.name}`))
      .sort((a, b) => b.name.length - a.name.length)[0];

   if (zone === undefined) {
      return {
         configured: true,
         domain,
         zone: null,
         state: 'no_zone',
         detail: `${domain} is not a zone in this Cloudflare account. Email Sending needs Cloudflare DNS.`,
      };
   }

   const subdomains = await cloudflare<CloudflareSendingSubdomain[]>(
      env,
      `/zones/${encodeURIComponent(zone.id)}/email/sending/subdomains`,
   );

   const match = subdomains.find(
      (entry) =>
         entry.name.toLowerCase() === domain || wildcardCovers(entry.name.toLowerCase(), domain),
   );

   if (match === undefined) {
      return {
         configured: true,
         domain,
         zone: zone.name,
         state: 'not_onboarded',
         detail: `Onboard ${domain} under Email Service → Email Sending in the Cloudflare dashboard.`,
      };
   }

   return {
      configured: true,
      domain,
      zone: zone.name,
      state: match.enabled ? 'enabled' : 'disabled',
      detail: match.enabled
         ? `${domain} is onboarded and Email Sending is enabled.`
         : `Email Sending is disabled on ${domain}. Enable it in the Cloudflare dashboard.`,
   };
}

export async function discoverSendingDomains(env: Env): Promise<{
   configured: boolean;
   domains: DiscoveredDomain[];
}> {
   if ((env.CLOUDFLARE_API_TOKEN ?? '').trim().length === 0) {
      return { configured: false, domains: [] };
   }

   const accountId = env.CLOUDFLARE_ACCOUNT_ID?.trim() ?? '';
   const zones = await cloudflare<CloudflareZone[]>(
      env,
      accountId.length > 0
         ? `/zones?per_page=50&account.id=${encodeURIComponent(accountId)}`
         : '/zones?per_page=50',
   );

   const domains: DiscoveredDomain[] = [];

   for (const zone of zones.slice(0, 15)) {
      const [records, routing] = await Promise.all([
         cloudflare<CloudflareDnsRecord[]>(
            env,
            `/zones/${encodeURIComponent(zone.id)}/dns_records?per_page=100`,
         ).catch(() => []),
         cloudflare<{ enabled?: boolean }>(
            env,
            `/zones/${encodeURIComponent(zone.id)}/email/routing`,
         ).catch(() => null),
      ]);

      const txt = records.filter((record) => record.type === 'TXT');
      const spf = txt.some(
         (record) => record.name === zone.name && record.content.toLowerCase().includes('v=spf1'),
      );
      const dmarc = txt.some(
         (record) =>
            record.name === `_dmarc.${zone.name}` &&
            record.content.toLowerCase().includes('v=dmarc1'),
      );
      const dkim = txt.some(
         (record) =>
            record.name.includes('._domainkey.') &&
            record.content.toLowerCase().includes('v=dkim1'),
      );
      const mx = records.some((record) => record.type === 'MX');

      domains.push({
         id: zone.id,
         name: zone.name,
         status: zone.status,
         emailRouting: routing?.enabled ?? null,
         mx,
         spf,
         dkim,
         dmarc,
         suggestedAddress: `noreply@${zone.name}`,
      });
   }

   return { configured: true, domains };
}
