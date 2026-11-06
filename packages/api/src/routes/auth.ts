import { Hono } from 'hono';
import type { Context } from 'hono';
import { getCookie } from 'hono/cookie';
import { z } from 'zod';
import { createId, randomToken, sha256Hex } from '@postwren/worker-kit/ids';
import { ok } from '@postwren/worker-kit/envelope';
import { AppError, UnauthorizedError } from '@postwren/worker-kit/errors';
import { RATE_LIMITS } from '@postwren/shared/contracts';
import type { AppEnv, Env } from '../env';
import { readJson } from '../lib/validation';
import { appOrigin } from '../lib/app-url';
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
const CODE_VERIFY_LIMIT = { windowSeconds: 60 * 15, max: 10 } as const;
const LOGIN_CODE_DIGITS = 6;
const LOGIN_CODE_SPACE = 10 ** LOGIN_CODE_DIGITS;

const emailField = z
   .string()
   .trim()
   .email()
   .transform((value) => value.toLowerCase());

const magicLinkInput = z.object({
   email: emailField,
});

const verifyInput = z.object({
   token: z.string().trim().min(1),
});

const verifyCodeInput = z.object({
   email: emailField,
   code: z
      .string()
      .trim()
      .regex(/^\d{6}$/),
});

export const authRoutes = new Hono<AppEnv>();

function generateLoginCode(): string {
   const values = new Uint32Array(1);
   crypto.getRandomValues(values);
   return String((values[0] ?? 0) % LOGIN_CODE_SPACE).padStart(LOGIN_CODE_DIGITS, '0');
}

/**
 * A six-digit code has little entropy on its own, so it is bound to the email
 * it was sent to and hashed with SESSION_SECRET, never stored in clear.
 */
function loginCodeHash(env: Env, email: string, code: string): Promise<string> {
   return sha256Hex(`${env.SESSION_SECRET}:login-code:${email}:${code}`);
}

async function completeSignIn(c: Context<AppEnv>, email: string): Promise<Response> {
   const now = nowSeconds();
   let user = await c.env.DB.prepare(
      'SELECT id, email, role, created_at FROM users WHERE email = ?',
   )
      .bind(email)
      .first<{ id: string; email: string; role: string; created_at: number }>();

   if (user === null) {
      const ownerEmail = c.env.OWNER_EMAIL?.trim().toLowerCase();
      if (ownerEmail !== undefined && ownerEmail.length > 0 && ownerEmail !== email) {
         throw new AppError(403, 'forbidden', 'This email is not allowed to sign in');
      }

      const id = createId('usr');
      await c.env.DB.prepare('INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)')
         .bind(id, email, 'owner', now)
         .run();

      user = { id, email, role: 'owner', created_at: now };
   }

   const session = await createSession(c.env, user.id);
   setSessionCookies(c, session.raw, session.csrf);

   return ok(user);
}

authRoutes.post('/magic-link', async (c) => {
   const body = magicLinkInput.parse(await readJson(c));
   const ip = requestClientIp(c);

   await consumeRateLimit(c.env.DB, `magic-link:ip:${ip}`, RATE_LIMITS.publicSubscribe);
   await consumeRateLimit(c.env.DB, `magic-link:email:${body.email}`, EMAIL_RATE_LIMIT);

   const raw = randomToken(32);
   const tokenHash = await sha256Hex(`${c.env.SESSION_SECRET}:${raw}`);
   const code = generateLoginCode();
   const codeHash = await loginCodeHash(c.env, body.email, code);
   const now = nowSeconds();

   await c.env.DB.prepare(
      `INSERT INTO magic_links (token_hash, email, code_hash, expires_at, created_at)
       VALUES (?, ?, ?, ?, ?)`,
   )
      .bind(tokenHash, body.email, codeHash, now + MAGIC_LINK_TTL_SECONDS, now)
      .run();

   if (c.env.ENVIRONMENT === 'production') {
      const signInUrl = `${appOrigin(c)}/login?token=${encodeURIComponent(raw)}`;
      try {
         await c.env.EMAIL.send({
            from: { email: c.env.EMAIL_FROM, name: 'Postwren' },
            to: body.email,
            subject: 'Your Postwren sign-in code',
            text: `Your Postwren sign-in code is ${code}.\n\nEnter it on the sign-in page, or open this link:\n${signInUrl}\n\nThis code and link expire in 15 minutes. If you did not request them, ignore this email.`,
            html: `<p>Your Postwren sign-in code is:</p><p style="font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:24px;font-weight:600;letter-spacing:4px;margin:12px 0;">${code}</p><p>Enter it on the sign-in page, or <a href="${signInUrl}">open this link</a>.</p><p>This code and link expire in 15 minutes. If you did not request them, ignore this email.</p>`,
         });
      } catch (error) {
         console.error('magic_link_send_failed', {
            message: error instanceof Error ? error.message : String(error),
         });
         throw new AppError(
            502,
            'email_send_failed',
            'The sign-in email could not be sent. Check EMAIL_FROM and the email binding.',
         );
      }
      return ok({ sent: true });
   }

   return ok({ sent: true, devToken: raw, devCode: code });
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

   return completeSignIn(c, link.email);
});

authRoutes.post('/verify-code', async (c) => {
   const ip = requestClientIp(c);
   await consumeRateLimit(c.env.DB, `login-code:ip:${ip}`, CODE_VERIFY_LIMIT);

   const body = verifyCodeInput.parse(await readJson(c));
   await consumeRateLimit(c.env.DB, `login-code:email:${body.email}`, CODE_VERIFY_LIMIT);

   const now = nowSeconds();
   const codeHash = await loginCodeHash(c.env, body.email, body.code);

   const link = await c.env.DB.prepare(
      `SELECT email FROM magic_links
       WHERE email = ? AND code_hash = ? AND used_at IS NULL AND expires_at > ?
       LIMIT 1`,
   )
      .bind(body.email, codeHash, now)
      .first<{ email: string }>();

   if (link === null) {
      throw new UnauthorizedError('Invalid or expired code');
   }

   // Claim every matching row, including a rare duplicate code, so one code
   // cannot sign in twice.
   const claimed = await c.env.DB.prepare(
      `UPDATE magic_links SET used_at = ?
       WHERE email = ? AND code_hash = ? AND used_at IS NULL`,
   )
      .bind(now, body.email, codeHash)
      .run();

   if ((claimed.meta.changes ?? 0) === 0) {
      throw new UnauthorizedError('Invalid or expired code');
   }

   return completeSignIn(c, link.email);
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
