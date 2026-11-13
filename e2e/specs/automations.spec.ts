import { expect, test } from '../support/fixtures';
import { uniqueEmail, uniqueName } from '../support/ids';
import { createSubscriber, createTemplate, verifyDefaultSender } from '../support/seed';
import { runScheduledTasks } from '../support/server';

test.describe('Automating: welcome sequence', () => {
   test('activates a welcome automation and sends its first email to a new subscriber', async ({
      api,
      page,
   }) => {
      const sender = await verifyDefaultSender(api);
      const template = await createTemplate(api, uniqueName('welcome template'));
      const automationName = uniqueName('welcome automation');
      let automationId = '';

      await test.step('create the automation from the dialog', async () => {
         await page.goto('/automations');
         await page.getByRole('button', { name: 'New automation' }).first().click();

         const dialog = page.getByRole('dialog', { name: 'New automation' });
         await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(automationName);
         await dialog.getByLabel('First email template').selectOption(template.id);
         await dialog.getByRole('button', { name: 'Create automation' }).click();

         await expect(page).toHaveURL(/\/automations\/atm[a-z0-9]+$/);
         await expect(page.getByRole('heading', { name: automationName, level: 1 })).toBeVisible();
         automationId = new URL(page.url()).pathname.split('/').pop() ?? '';
         expect(automationId).not.toBe('');
         expect(sender.email).not.toBe('');
      });

      await test.step('remove the one-day wait so the first send is immediate', async () => {
         await page.getByRole('button', { name: 'Delete step 1' }).click();
         await page.getByRole('button', { name: 'Save draft' }).click();
         await expect(page.getByText('Draft saved.')).toBeVisible();
      });

      await test.step('activate the sequence', async () => {
         await page.getByRole('button', { name: 'Activate' }).click();
         await expect(page.getByText(/Automation activated\./)).toBeVisible();
         await expect(page.getByText('Active', { exact: true }).first()).toBeVisible();
      });

      const email = uniqueEmail('automation');

      await test.step('add a subscriber who should enter the sequence', async () => {
         await createSubscriber(api, { email, firstName: 'New Reader' });
      });

      await test.step('run the scheduled sweep until the email is delivered', async () => {
         await expect
            .poll(
               async () => {
                  await runScheduledTasks(page.request);
                  const detail = await api.get<{
                     runs: { email: string; sentCount: number }[];
                  }>(`/api/v1/automations/${automationId}`);
                  return detail.runs.find((run) => run.email === email)?.sentCount ?? 0;
               },
               { timeout: 30_000, intervals: [1000, 1500, 2000] },
            )
            .toBeGreaterThan(0);
      });

      await test.step('the run log shows the subscriber and the delivery', async () => {
         await page.reload();

         const row = page.getByRole('row').filter({ hasText: email });
         await expect(row).toBeVisible();
         await expect(row.getByRole('cell').nth(3)).toHaveText('1');

         await page.getByRole('button', { name: `Show details for ${email}` }).click();
         await expect(page.getByText(template.subject)).toBeVisible();
      });
   });
});
