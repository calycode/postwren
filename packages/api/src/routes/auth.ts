import { Hono } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { createId, randomToken, sha256Hex } from '@mailer/worker-kit/ids';
import { ok } from '@mailer/worker-kit/envelope';
import { AppError, UnauthorizedError } from '@mailer/worker-kit/errors';
import { RATE_LIMITS } from '@mailer/shared/contracts';
import type { AppEnv } from '../env';
import { readJson } from '../lib/validation';
import { consumeRateLimit } from '../lib/rate-limit';
import { nowSeconds } from '../lib/time';
import { requestClientIp } from '../middleware/context';
import {
   SESSION_COOKIE,
   clearSessionCookies,
   createSession,
   sessionHash,
   setSessionCookies,
} from '../auth/session';

const MAGIC_LINK_TTL_SECONDS = 60 * 15;
const EMAIL_RATE_LIMIT = { windowSeconds: 60 * 15, max: 5 } as const;

const magicLinkInput = z.object({
   email: z
      .string()
      .trim()
      .email()
      .transform((value) => value.toLowerCase()),
});

const verifyInput = z.object({
   token: z.string().trim().min(1),
});

export const authRoutes = new Hono<AppEnv>();

authRoutes.post('/magic-link', async (c) => {
   const body = magicLinkInput.parse(await readJson(c));
   const ip = requestClientIp(c);

   await consumeRateLimit(c.env.DB, `magic-link:ip:${ip}`, RATE_LIMITS.publicSubscribe);
   await consumeRateLimit(c.env.DB, `magic-link:email:${body.email}`, EMAIL_RATE_LIMIT);

   const raw = randomToken(32);
   const tokenHash = await sha256Hex(`${c.env.SESSION_SECRET}:${raw}`);
   const now = nowSeconds();

   await c.env.DB.prepare(
      'INSERT INTO magic_links (token_hash, email, expires_at, created_at) VALUES (?, ?, ?, ?)',
   )
      .bind(tokenHash, body.email, now + MAGIC_LINK_TTL_SECONDS, now)
      .run();

   if (c.env.ENVIRONMENT === 'production') {
      const signInUrl = `${c.env.APP_URL}/login?token=${encodeURIComponent(raw)}`;
      try {
         await c.env.EMAIL.send({
            from: { email: c.env.EMAIL_FROM, name: 'Mailer' },
            to: body.email,
            subject: 'Your sign-in link',
            text: `Sign in to Mailer: ${signInUrl}\n\nThis link expires in 15 minutes. If you did not request it, ignore this email.`,
            html: `<a href="${signInUrl}">Sign in to Mailer</a><br>This link expires in 15 minutes.`,
         });
      } catch (error) {
         console.error('magic_link_send_failed', {
            message: error instanceof Error ? error.message : String(error),
         });
      }
      return ok({ sent: true });
   }

   return ok({ sent: true, devToken: raw });
});

authRoutes.post('/verify', async (c) => {
   const body = verifyInput.parse(await readJson(c));
   const tokenHash = await sha256Hex(`${c.env.SESSION_SECRET}:${body.token}`);
   const now = nowSeconds();

   const link = await c.env.DB.prepare(
      `SELECT email FROM magic_links
       WHERE token_hash = ? AND used_at IS NULL AND expires_at > ?`,
   )
      .bind(tokenHash, now)
      .first<{ email: string }>();

   if (link === null) {
      throw new UnauthorizedError('Invalid or expired token');
   }

   const claimed = await c.env.DB.prepare(
      'UPDATE magic_links SET used_at = ? WHERE token_hash = ? AND used_at IS NULL',
   )
      .bind(now, tokenHash)
      .run();

   if ((claimed.meta.changes ?? 0) !== 1) {
      throw new UnauthorizedError('Invalid or expired token');
   }

   let user = await c.env.DB.prepare(
      'SELECT id, email, role, created_at FROM users WHERE email = ?',
   )
      .bind(link.email)
      .first<{ id: string; email: string; role: string; created_at: number }>();

   if (user === null) {
      const ownerEmail = c.env.OWNER_EMAIL?.trim().toLowerCase();
      if (ownerEmail !== undefined && ownerEmail.length > 0 && ownerEmail !== link.email) {
         throw new AppError(403, 'forbidden', 'This email is not allowed to sign in');
      }

      const id = createId('usr');
      await c.env.DB.prepare('INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)')
         .bind(id, link.email, 'owner', now)
         .run();

      user = { id, email: link.email, role: 'owner', created_at: now };
   }

   const session = await createSession(c.env, user.id);
   setSessionCookies(c, session.raw, session.csrf);

   return ok(user);
});

authRoutes.post('/logout', async (c) => {
   const raw = getCookie(c, SESSION_COOKIE);
   if (raw !== undefined && raw.length > 0) {
      const tokenHash = await sessionHash(c.env, raw);
      await c.env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run();
   }

   clearSessionCookies(c);
   return ok({ loggedOut: true });
});

authRoutes.get('/session', async (c) => {
   const userId = c.get('userId');
   if (userId === null) {
      throw new UnauthorizedError();
   }

   const user = await c.env.DB.prepare('SELECT id, email, role, created_at FROM users WHERE id = ?')
      .bind(userId)
      .first<{ id: string; email: string; role: string; created_at: number }>();

   if (user === null) {
      throw new UnauthorizedError();
   }

   return ok(user);
});
