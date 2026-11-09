/**
 * Cheap list hygiene, not a validation vendor. A disposable-domain list and a
 * typo map catch the obvious cases with no network call; the MX lookup only
 * runs in production and fails open so a DNS hiccup cannot stop a real signup.
 */

const DISPOSABLE_DOMAINS = new Set([
   '10minutemail.com',
   'discard.email',
   'dispostable.com',
   'emailondeck.com',
   'fakeinbox.com',
   'getnada.com',
   'guerrillamail.com',
   'guerrillamail.net',
   'maildrop.cc',
   'mailinator.com',
   'mailnesia.com',
   'mintemail.com',
   'moakt.com',
   'sharklasers.com',
   'spamgourmet.com',
   'temp-mail.org',
   'tempail.com',
   'tempmail.com',
   'throwawaymail.com',
   'trashmail.com',
   'yopmail.com',
]);

const TYPO_DOMAINS: Record<string, string> = {
   'gmail.co': 'gmail.com',
   'gmail.cm': 'gmail.com',
   'gmail.con': 'gmail.com',
   'gmai.com': 'gmail.com',
   'gmial.com': 'gmail.com',
   'hotmai.com': 'hotmail.com',
   'hotmial.com': 'hotmail.com',
   'icloud.co': 'icloud.com',
   'iclould.com': 'icloud.com',
   'outllook.com': 'outlook.com',
   'outlok.com': 'outlook.com',
   'protonmai.com': 'protonmail.com',
   'protonmial.com': 'protonmail.com',
   'yaho.com': 'yahoo.com',
   'yahooo.com': 'yahoo.com',
};

export type HygieneResult =
   { ok: true } | { ok: false; reason: 'disposable' | 'typo'; suggestion?: string };

export function domainOfEmail(email: string): string {
   return email.split('@')[1]?.trim().toLowerCase() ?? '';
}

export function checkEmailHygiene(email: string): HygieneResult {
   const domain = domainOfEmail(email);

   if (DISPOSABLE_DOMAINS.has(domain)) {
      return { ok: false, reason: 'disposable' };
   }

   const suggestedDomain = TYPO_DOMAINS[domain];
   if (suggestedDomain !== undefined) {
      const [local = ''] = email.split('@');
      return { ok: false, reason: 'typo', suggestion: `${local}@${suggestedDomain}` };
   }

   return { ok: true };
}

type DohAnswer = { type: number; data: string };
type DohResponse = { Status: number; Answer?: DohAnswer[] };

async function query(
   name: string,
   type: 'MX' | 'A',
   request: typeof fetch,
): Promise<DohResponse | null> {
   try {
      const response = await request(
         `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(name)}&type=${type}`,
         {
            headers: { accept: 'application/dns-json' },
            signal: AbortSignal.timeout(3000),
         },
      );
      if (!response.ok) return null;
      return (await response.json()) as DohResponse;
   } catch {
      return null;
   }
}

function hasType(response: DohResponse | null, type: number): boolean {
   return response?.Answer?.some((answer) => answer.type === type) ?? false;
}

function hasNullMx(response: DohResponse | null): boolean {
   return (
      response?.Answer?.some((answer) => answer.type === 15 && answer.data.trim() === '0 .') ??
      false
   );
}

/**
 * `null` means "could not tell", which the caller treats as acceptable.
 * A null MX ("0 .", RFC 7505) is an explicit refusal of mail.
 */
export async function domainAcceptsMail(
   domain: string,
   request: typeof fetch = fetch,
): Promise<boolean | null> {
   if (domain.length === 0) return false;

   const [mx, a] = await Promise.all([query(domain, 'MX', request), query(domain, 'A', request)]);

   if (mx === null && a === null) return null;
   if (hasNullMx(mx)) return false;
   if (hasType(mx, 15)) return true;
   if (mx?.Status === 3) return false;

   // No MX record may still mean mail is delivered to the A/AAAA record.
   return hasType(a, 1);
}
