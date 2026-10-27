import { apiFetch } from './client';
import type { AuthUser, MagicLinkResult } from './types';

const AUTH_BASE = '/api/auth';

export function requestMagicLink(email: string): Promise<MagicLinkResult> {
   return apiFetch<MagicLinkResult>(`${AUTH_BASE}/magic-link`, {
      method: 'POST',
      body: { email },
   });
}

export function verify(token: string): Promise<AuthUser> {
   return apiFetch<AuthUser>(`${AUTH_BASE}/verify`, {
      method: 'POST',
      body: { token },
   });
}

export function logout(): Promise<void> {
   return apiFetch<void>(`${AUTH_BASE}/logout`, { method: 'POST' });
}

export function session(): Promise<AuthUser> {
   return apiFetch<AuthUser>(`${AUTH_BASE}/session`);
}
