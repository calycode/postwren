import { expect, test } from '../support/fixtures';
import { completeSignIn, requestSignInCode, signIn, submitSignInEmail } from '../support/auth';
import { skipProductTour } from '../support/ui';

test.describe('Signing in', () => {
   test.use({ storageState: { cookies: [], origins: [] } });

   test('returns a signed-out visitor to the page they asked for after signing in', async ({
      page,
   }) => {
      await test.step('open a protected page while signed out', async () => {
         await page.goto('/subscribers');
         await expect(page).toHaveURL(/\/login\?next=%2Fsubscribers$/);
      });

      await test.step('request and enter the sign-in code', async () => {
         const code = await submitSignInEmail(page);
         await completeSignIn(page, code);
      });

      await test.step('land back on the subscribers page', async () => {
         await expect(page).toHaveURL(/\/subscribers$/);
         await expect(page.getByRole('heading', { name: 'Subscribers', level: 1 })).toBeVisible();
      });
   });

   test('rejects a wrong code and then accepts the code that was sent', async ({ page }) => {
      const code = await test.step('request a sign-in code', () => requestSignInCode(page));

      await test.step('try a different six-digit code', async () => {
         const wrong = code === '000001' ? '000002' : '000001';
         await page.getByLabel('6-digit code').fill(wrong);
         await page.getByRole('button', { name: 'Sign in with code' }).click();
         await expect(page.getByRole('alert')).toContainText(/invalid or expired/i);
         await expect(page).toHaveURL(/\/login/);
      });

      await test.step('enter the code from the Development mode panel', async () => {
         await page.getByLabel('6-digit code').fill(code);
         await page.getByRole('button', { name: 'Sign in with code' }).click();
         await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
      });
   });
});

test.describe('Signing out', () => {
   // Logging out deletes the session server-side, so it must not share the
   // session that every other spec reuses.
   test.use({ storageState: { cookies: [], origins: [] } });

   test('ends the session and keeps protected pages closed afterwards', async ({ page }) => {
      await test.step('sign in and dismiss the product tour', async () => {
         await signIn(page);
         await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
         await skipProductTour(page);
      });

      await test.step('sign out from the account menu', async () => {
         await page.getByLabel('Account menu').click();
         await page.getByRole('menuitem', { name: 'Sign out' }).click();
         await expect(page).toHaveURL(/\/login$/);
      });

      await test.step('confirm a protected page still asks for a session', async () => {
         await page.goto('/subscribers');
         await expect(page).toHaveURL(/\/login\?next=%2Fsubscribers$/);
      });
   });
});
