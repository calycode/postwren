import { createId } from '@mailer/worker-kit/ids';
import { AppError } from '@mailer/worker-kit/errors';

export type SenderAddressRow = {
   id: string;
   email: string;
   name: string;
   domain: string;
   verified_at: number | null;
   is_default: number;
   created_at: number;
};

export function senderEmailFrom(value: string): string {
   const trimmed = value.trim();
   const angled = /<([^<>]+)>\s*$/.exec(trimmed);
   return (angled?.[1] ?? trimmed).trim().toLowerCase();
}

export function domainOf(email: string): string {
   const at = email.lastIndexOf('@');
   return at === -1 ? '' : email.slice(at + 1).toLowerCase();
}

export async function seedSenderAddress(
   db: D1Database,
   emailFrom: string,
   now: number,
): Promise<void> {
   const existing = await db
      .prepare('SELECT COUNT(*) AS count FROM sender_addresses')
      .first<{ count: number }>();
   if ((existing?.count ?? 0) > 0) return;

   const email = senderEmailFrom(emailFrom);
   if (email.length === 0) return;

   await db
      .prepare(
         `INSERT INTO sender_addresses (id, email, name, domain, verified_at, is_default, created_at)
          VALUES (?, ?, '', ?, ?, 1, ?)
          ON CONFLICT(email) DO NOTHING`,
      )
      .bind(createId('snd'), email, domainOf(email), now, now)
      .run();
}

function senderRejected(message: string): AppError {
   return new AppError(422, 'validation_error', message, { fields: { fromEmail: message } });
}

export async function assertSenderAllowed(
   db: D1Database,
   email: string,
   fallbackFrom: string,
): Promise<void> {
   const normalised = email.trim().toLowerCase();
   const rows = await db
      .prepare('SELECT email, verified_at FROM sender_addresses')
      .all<{ email: string; verified_at: number | null }>();

   if (rows.results.length === 0) {
      if (normalised === senderEmailFrom(fallbackFrom)) return;
      throw senderRejected(
         `Sender ${normalised} is not a configured sending address. Add it in Settings first.`,
      );
   }

   const match = rows.results.find((row) => row.email === normalised);
   if (match === undefined) {
      throw senderRejected(
         `Sender ${normalised} is not a configured sending address. Add it in Settings and verify its domain in Cloudflare.`,
      );
   }

   if (match.verified_at === null) {
      throw senderRejected(
         `Sender ${normalised} is not verified yet. Verify its domain in the Cloudflare dashboard.`,
      );
   }
}
