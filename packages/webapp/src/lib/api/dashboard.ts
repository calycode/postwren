import { apiFetch } from './client';
import type { Dashboard } from './types';

export function get(): Promise<Dashboard> {
   return apiFetch<Dashboard>('/api/v1/dashboard');
}
