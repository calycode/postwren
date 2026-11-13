import { expect, test } from '../support/fixtures';

test.describe('Dashboard overview', () => {
   test('shows the list health and growth widgets without page errors', async ({ page }) => {
      const pageErrors: string[] = [];
      page.on('pageerror', (error) => pageErrors.push(error.message));

      await test.step('open the dashboard', async () => {
         await page.goto('/');
         await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
      });

      await test.step('see the first-run widgets', async () => {
         await expect(page.getByText('List health', { exact: true })).toBeVisible();
         await expect(page.getByText('List growth', { exact: true })).toBeVisible();
         await expect(page.getByText('Active subscribers')).toBeVisible();
      });

      await test.step('finish without an uncaught page error', async () => {
         expect(pageErrors).toEqual([]);
      });
   });
});
