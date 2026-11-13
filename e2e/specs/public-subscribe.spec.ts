import { expect, test } from '../support/fixtures';
import { uniqueEmail, uniqueName, uniqueTag } from '../support/ids';
import { openSettingsTab, subscriberRow } from '../support/ui';

test.describe('Growing the list: public signup', () => {
   test('confirms a double opt-in signup made with a public subscribe key', async ({ page }) => {
      const keyName = uniqueName('signup key');
      const tag = uniqueTag('signup');
      const email = uniqueEmail('signup');
      let secret = '';

      await test.step('create a double opt-in subscribe key in Settings', async () => {
         const panel = await openSettingsTab(page, 'Audience');

         await panel.getByLabel('Name').fill(keyName);
         await panel.getByLabel('Default tags').fill(tag);
         await panel.getByText('Require email confirmation (double opt-in)').click();
         await expect(
            panel.getByRole('checkbox', { name: 'Require email confirmation (double opt-in)' }),
         ).toBeChecked();
         await panel.getByRole('button', { name: 'Create subscribe key' }).click();

         const alert = page.getByRole('alert').filter({ hasText: 'Copy this key now' });
         await expect(alert).toBeVisible();
         secret = (await alert.locator('code').innerText()).trim();
         expect(secret).toMatch(/^pk_live_/);
      });

      let confirmUrl = '';

      await test.step('submit a public signup with the key', async () => {
         const response = await page.request.post('/api/public/subscribe', {
            headers: { authorization: `Bearer ${secret}` },
            data: { email, firstName: 'Public Reader' },
         });
         expect(response.status()).toBe(202);

         const body = (await response.json()) as {
            data: { pending: boolean; devConfirmUrl?: string };
         };
         expect(body.data.pending).toBe(true);
         confirmUrl = body.data.devConfirmUrl ?? '';
         expect(confirmUrl).toContain('/confirm/');
      });

      await test.step('open the confirmation link from the email', async () => {
         await page.goto(confirmUrl);
         await expect(
            page.getByRole('heading', { name: 'Subscription confirmed', level: 1 }),
         ).toBeVisible();
      });

      await test.step('the subscriber is now subscribed and carries the default tag', async () => {
         await page.goto('/subscribers');
         await page.getByLabel('Search subscribers').fill(email);

         const row = subscriberRow(page, email);
         await expect(row).toBeVisible();
         await expect(row.getByText('Subscribed', { exact: true })).toBeVisible();
         await expect(row.getByText(tag, { exact: true })).toBeVisible();
      });
   });
});
