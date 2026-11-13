import { expect, type Page } from '@playwright/test';
import { OWNER_EMAIL } from './paths';

/** Requires an unauthenticated page that already sits on /login, e.g. after a redirect. */
export async function submitSignInEmail(page: Page, email = OWNER_EMAIL): Promise<string> {
   await page.getByLabel('Email address').fill(email);
   await page.getByRole('button', { name: 'Send code' }).click();
   await expect(page.getByRole('heading', { name: 'Check your email' })).toBeVisible();

   const code = await page
      .locator('code')
      .filter({ hasText: /^\d{6}$/ })
      .innerText();
   return code.trim();
}

export async function requestSignInCode(page: Page, email = OWNER_EMAIL): Promise<string> {
   await page.goto('/login');
   return submitSignInEmail(page, email);
}

export async function completeSignIn(page: Page, code: string): Promise<void> {
   await page.getByLabel('6-digit code').fill(code);
   await page.getByRole('button', { name: 'Sign in with code' }).click();
   await expect(page).not.toHaveURL(/\/login/);
}

export async function signIn(page: Page, email = OWNER_EMAIL): Promise<void> {
   const code = await requestSignInCode(page, email);
   await completeSignIn(page, code);
}
