import type { Context } from 'hono';
import { getCookie, setCookie, deleteCookie } from 'hono/cookie';
import { sha256Hex, randomToken } from '@mailer/worker-kit/ids';
import type { Env, AppEnv } from '../env';
import { nowSeconds } from '../lib/time';

export const SESSION_COOKIE = 'sid';
export const CSRF_COOKIE = 'csrf';
export const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30;

export type SessionUser = {
   id: string;
   email: string;
   role: string;
   created_at: number;
};

export function sessionHash(env: Env, raw: string): Promise<string> {
   return sha256Hex(`${env.SESSION_SECRET}:${raw}`);
}

export async function createSession(
   env: Env,
   userId: string,
): Promise<{ raw: string; csrf: string }> {
   const raw = randomToken(32);
   const tokenHash = await sessionHash(env, raw);
   const now = nowSeconds();

   await env.DB.prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
   )
      .bind(tokenHash, userId, now + SESSION_TTL_SECONDS, now)
      .run();

   return { raw, csrf: randomToken(24) };
}

export function isSecureRequest(c: Context<AppEnv>): boolean {
   return new URL(c.req.url).protocol === 'https:';
}

export function setSessionCookies(c: Context<AppEnv>, raw: string, csrf: string): void {
   const secure = isSecureRequest(c);
   setCookie(c, SESSION_COOKIE, raw, {
      httpOnly: true,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
      secure,
   });
   setCookie(c, CSRF_COOKIE, csrf, {
      httpOnly: false,
      sameSite: 'Lax',
      path: '/',
      maxAge: SESSION_TTL_SECONDS,
      secure,
   });
}

export function clearSessionCookies(c: Context<AppEnv>): void {
   deleteCookie(c, SESSION_COOKIE, { path: '/' });
   deleteCookie(c, CSRF_COOKIE, { path: '/' });
}

export async function findSessionUser(env: Env, raw: string): Promise<SessionUser | null> {
   const tokenHash = await sessionHash(env, raw);
   const row = await env.DB.prepare(
      `SELECT u.id, u.email, u.role, u.created_at
       FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.token_hash = ? AND s.expires_at > ?`,
   )
      .bind(tokenHash, nowSeconds())
      .first<SessionUser>();

   return row ?? null;
}

export function sessionCookie(c: Context<AppEnv>): string | undefined {
   return getCookie(c, SESSION_COOKIE);
}
