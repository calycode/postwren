import type { APIRequestContext } from '@playwright/test';

type Envelope<T> = {
   data: T;
   error: { code: string; message: string } | null;
};

type Method = 'GET' | 'POST' | 'PATCH' | 'DELETE';

/**
 * Typed-enough client for seeding through the same API the SPA uses. It borrows
 * the browser context's cookies, so the session comes from the setup project and
 * writes carry the readable `csrf` cookie as a header.
 */
export class Api {
   private csrf: string | undefined;

   constructor(private readonly request: APIRequestContext) {}

   private async csrfToken(): Promise<string> {
      if (this.csrf !== undefined) return this.csrf;

      const state = await this.request.storageState();
      const cookie = state.cookies.find((item) => item.name === 'csrf');
      if (cookie === undefined) {
         throw new Error('The API client has no csrf cookie; did the setup project sign in?');
      }

      this.csrf = cookie.value;
      return cookie.value;
   }

   private async send<T>(method: Method, path: string, body?: unknown): Promise<T> {
      const headers: Record<string, string> = {};
      if (method !== 'GET') headers['x-csrf-token'] = await this.csrfToken();

      const response = await this.request.fetch(path, {
         method,
         headers,
         ...(body === undefined ? {} : { data: body }),
      });

      const text = await response.text();
      if (!response.ok()) {
         throw new Error(`${method} ${path} failed with ${response.status()}: ${text}`);
      }

      if (text.length === 0) {
         throw new Error(`${method} ${path} returned an empty body`);
      }

      const envelope = JSON.parse(text) as Envelope<T>;
      return envelope.data;
   }

   get<T>(path: string): Promise<T> {
      return this.send<T>('GET', path);
   }

   post<T>(path: string, body?: unknown): Promise<T> {
      return this.send<T>('POST', path, body);
   }

   patch<T>(path: string, body?: unknown): Promise<T> {
      return this.send<T>('PATCH', path, body);
   }

   delete<T>(path: string): Promise<T> {
      return this.send<T>('DELETE', path);
   }
}
