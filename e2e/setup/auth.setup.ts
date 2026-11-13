import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import { completeSignIn, requestSignInCode } from '../support/auth';
import { AUTH_FILE } from '../support/paths';
import { skipProductTour } from '../support/ui';

test('sign in as the owner and remember the session for other specs', async ({ page }) => {
   await test.step('request and enter the sign-in code', async () => {
      const code = await requestSignInCode(page);
      await completeSignIn(page, code);
   });

   await test.step('dismiss the first-run product tour', async () => {
      await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
      await skipProductTour(page);
   });

   await test.step('save the authenticated browser state', async () => {
      await mkdir(path.dirname(AUTH_FILE), { recursive: true });
      await page.context().storageState({ path: AUTH_FILE });
   });
});
