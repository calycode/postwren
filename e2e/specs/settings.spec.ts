import { expect, test } from '../support/fixtures';
import { uniqueEmail, uniqueName } from '../support/ids';
import { openSettingsTab } from '../support/ui';

test.describe('Workspace settings', () => {
   test('adds a sending address to the workspace', async ({ page }) => {
      const email = uniqueEmail('sender');

      await test.step('fill the sending address form', async () => {
         const panel = await openSettingsTab(page, 'Sending');
         await panel.getByLabel('Email address').fill(email);
         await panel.getByLabel('Display name').fill('E2E News');
         await panel.getByRole('button', { name: 'Add address' }).click();
      });

      await test.step('see the address in the sending list', async () => {
         await expect(page.getByText(email)).toBeVisible();
         await expect(page.getByRole('button', { name: `Delete ${email}` })).toBeVisible();
      });
   });

   test('creates an API key and shows the secret exactly once', async ({ page }) => {
      const name = uniqueName('api key');

      await test.step('create a key with the default scopes', async () => {
         const panel = await openSettingsTab(page, 'API');
         await panel.getByLabel('Name').fill(name);
         await panel.getByRole('button', { name: 'Create API key' }).click();
      });

      await test.step('the one-time secret is a Postwren key', async () => {
         const alert = page.getByRole('alert').filter({ hasText: 'Copy this key now' });
         await expect(alert).toBeVisible();

         const secret = (await alert.locator('code').innerText()).trim();
         expect(secret).toMatch(/^pwr_[a-z0-9]+_.+/);
      });

      await test.step('the key is listed by name', async () => {
         await expect(page.getByText(name, { exact: true })).toBeVisible();
      });
   });

   test('creates a webhook endpoint and shows its signing secret', async ({ page }) => {
      const url = `https://example.com/e2e/${uniqueName('hook').replace(/\s+/g, '-')}`;

      await test.step('fill the webhook endpoint form', async () => {
         const panel = await openSettingsTab(page, 'Webhooks');
         await panel.getByLabel('Endpoint URL').fill(url);
         await panel.getByLabel('Description').fill('E2E webhook receiver');
         await panel.getByRole('button', { name: 'Create endpoint' }).click();
      });

      await test.step('the signing secret is shown once', async () => {
         const alert = page.getByRole('alert').filter({ hasText: 'Copy this signing secret now' });
         await expect(alert).toBeVisible();

         const secret = (
            await alert
               .locator('code')
               .filter({ hasText: /^whsec_/ })
               .innerText()
         ).trim();
         expect(secret).toMatch(/^whsec_/);
      });

      await test.step('the endpoint is listed with its URL', async () => {
         await expect(page.getByText(url, { exact: true })).toBeVisible();
      });
   });

   test('allows an external origin to embed the workspace', async ({ page }) => {
      const origin = `https://embed-${Date.now().toString(36)}.example.com`;

      await test.step('add the origin to the embedding policy', async () => {
         const panel = await openSettingsTab(page, 'Embedding');
         await panel.getByLabel('Origin').fill(origin);
         await panel.getByRole('button', { name: 'Allow origin' }).click();

         const confirm = page.getByRole('dialog', { name: 'Allow iframe embedding?' });
         await confirm.getByRole('button', { name: 'Allow origin' }).click();
         await expect(confirm).toBeHidden();
      });

      await test.step('the origin is listed and rendered into the policy', async () => {
         await expect(page.getByText(origin, { exact: true })).toBeVisible();
         await expect(page.getByText(`frame-ancestors 'self' ${origin}`)).toBeVisible();
      });

      await test.step('the served HTML carries the new frame-ancestors policy', async () => {
         const response = await page.request.get('/');
         expect(response.status()).toBe(200);

         const policy = response.headers()['content-security-policy'] ?? '';
         expect(policy).toContain(`frame-ancestors 'self' ${origin}`);
      });
   });
});
