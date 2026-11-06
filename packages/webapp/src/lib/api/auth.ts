import { apiFetch } from './client';
import type { AuthUser, MagicLinkResult } from './types';

const AUTH_BASE = '/api/auth';
const AUTH_TIMEOUT_MS = 15_000;

/** Prevents a stalled Worker from leaving the login card spinning forever. */
function authSignal(): AbortSignal | undefined {
   return typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(AUTH_TIMEOUT_MS)
      : undefined;
}

export function requestMagicLink(email: string): Promise<MagicLinkResult> {
   return apiFetch<MagicLinkResult>(`${AUTH_BASE}/magic-link`, {
      method: 'POST',
      body: { email },
      signal: authSignal(),
   });
}

export function verify(token: string): Promise<AuthUser> {
   return apiFetch<AuthUser>(`${AUTH_BASE}/verify`, {
      method: 'POST',
      body: { token },
      signal: authSignal(),
   });
}

export function verifyCode(email: string, code: string): Promise<AuthUser> {
   return apiFetch<AuthUser>(`${AUTH_BASE}/verify-code`, {
      method: 'POST',
      body: { email, code },
      signal: authSignal(),
   });
}

export function logout(): Promise<void> {
   return apiFetch<void>(`${AUTH_BASE}/logout`, {
      method: 'POST',
      signal: authSignal(),
   });
}

export function session(): Promise<AuthUser> {
   return apiFetch<AuthUser>(`${AUTH_BASE}/session`, { signal: authSignal() });
}
