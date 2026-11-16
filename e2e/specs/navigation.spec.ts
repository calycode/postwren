import { expect, test } from '../support/fixtures';

type ProbeWindow = Window & { e2eShellProbe?: string };

test.describe('Navigation', () => {
   test('swaps only the page when moving between sections', async ({ page }) => {
      await page.goto('/');
      await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();

      await test.step('mark the current shell', async () => {
         await page.evaluate(() => {
            const sidebar = document.getElementById('app-sidebar');
            if (sidebar !== null) sidebar.dataset.e2eProbe = 'kept';
            (window as ProbeWindow).e2eShellProbe = 'alive';
         });
      });

      await test.step('follow a rail link', async () => {
         await page
            .getByRole('navigation', { name: 'Main' })
            .getByRole('link', { name: 'Tags' })
            .click();
         await expect(page).toHaveURL(/\/tags$/);
         await expect(page.getByRole('heading', { name: 'Tags', level: 1 })).toBeVisible();
      });

      await test.step('keep the same shell and document', async () => {
         // A rebuilt shell loses the attribute and a full document load clears the marker.
         await expect(page.locator('#app-sidebar')).toHaveAttribute('data-e2e-probe', 'kept');
         await expect
            .poll(async () => page.evaluate(() => (window as ProbeWindow).e2eShellProbe))
            .toBe('alive');
      });
   });
});
