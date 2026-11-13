import { readFileSync } from 'node:fs';
import { expect, test } from '../support/fixtures';
import { uniqueEmail } from '../support/ids';
import { createSubscriber } from '../support/seed';
import {
   addTagInPicker,
   openSubscriberPanel,
   selectSubscriberRow,
   subscriberRow,
} from '../support/ui';

test.describe('Audience: managing subscribers', () => {
   test('adds a subscriber in the dialog, finds them with search, and opens their details', async ({
      page,
   }) => {
      const email = uniqueEmail('subscriber');

      await test.step('open the Add subscriber dialog', async () => {
         await page.goto('/subscribers');
         // The empty state repeats this action while the list has no rows.
         await page.getByRole('button', { name: 'Add subscriber' }).first().click();
      });

      await test.step('save a new address and first name', async () => {
         const dialog = page.getByRole('dialog', { name: 'Add subscriber' });
         await dialog.getByLabel('Email address').fill(email);
         await dialog.getByLabel('First name').fill('Ada');
         await dialog.getByRole('button', { name: 'Add subscriber' }).click();
         await expect(dialog).toBeHidden();
      });

      await test.step('find the new row with search', async () => {
         await page.getByLabel('Search subscribers').fill(email);
         await expect(subscriberRow(page, email)).toBeVisible();
      });

      await test.step('open and close the detail panel', async () => {
         const panel = await openSubscriberPanel(page, email);
         await expect(panel.getByText('Details')).toBeVisible();
         await panel.getByRole('button', { name: 'Close subscriber panel' }).click();
         await expect(panel).toBeHidden();
      });
   });

   test('imports a CSV file and reports the rows it skipped', async ({ page }) => {
      const valid = uniqueEmail('csv');
      const csv = [
         'email,first_name,last_name',
         `${valid},Csv,Person`,
         'not-an-address,Broken,Row',
      ].join('\n');

      await test.step('open the Import subscribers dialog', async () => {
         await page.goto('/subscribers');
         await page.getByRole('button', { name: 'Import CSV' }).click();
      });

      await test.step('upload a file with one valid and one invalid row', async () => {
         const dialog = page.getByRole('dialog', { name: 'Import subscribers' });
         await dialog.getByLabel('CSV file').setInputFiles({
            name: 'subscribers.csv',
            mimeType: 'text/csv',
            buffer: Buffer.from(csv, 'utf8'),
         });
         await dialog.getByRole('button', { name: 'Import' }).click();

         await expect(dialog.getByRole('status')).toContainText('Imported 1');
         await expect(dialog.getByRole('status')).toContainText('Invalid email: not-an-address');
      });

      await test.step('find the imported subscriber in the list', async () => {
         await page
            .getByRole('dialog', { name: 'Import subscribers' })
            .getByRole('button', { name: 'Close' })
            .first()
            .click();
         await page.getByLabel('Search subscribers').fill(valid);
         await expect(subscriberRow(page, valid)).toBeVisible();
      });
   });

   test("edits a subscriber's name and custom fields and keeps them after reload", async ({
      api,
      page,
   }) => {
      const email = uniqueEmail('edit');
      await createSubscriber(api, { email, firstName: 'Ada', lastName: 'Lovelace' });

      await test.step('open the subscriber from the list', async () => {
         await page.goto('/subscribers');
         await openSubscriberPanel(page, email);
      });

      await test.step('change the name and clear the last name', async () => {
         const panel = page.getByRole('complementary', { name: `Subscriber ${email}` });
         await panel.getByLabel('First name').fill('Grace');
         await panel.getByLabel('Last name').fill('');
      });

      await test.step('add a custom field', async () => {
         const panel = page.getByRole('complementary', { name: `Subscriber ${email}` });
         await panel.locator('summary').filter({ hasText: 'Custom fields' }).click();
         await panel.getByRole('button', { name: 'Add field' }).click();
         await panel.getByLabel('Custom field key 1').fill('company');
         await panel.getByLabel('Custom field value 1').fill('Analytical Engines');
      });

      await test.step('save and wait for the panel to settle', async () => {
         const panel = page.getByRole('complementary', { name: `Subscriber ${email}` });
         const save = panel.getByRole('button', { name: 'Save changes' });
         await expect(save).toBeEnabled();
         await save.click();
         await expect(save).toBeDisabled();
      });

      await test.step('reload and verify the saved values', async () => {
         await page.reload();
         const panel = await openSubscriberPanel(page, email);
         await expect(panel.getByLabel('First name')).toHaveValue('Grace');
         await expect(panel.getByLabel('Last name')).toHaveValue('');
         await panel.locator('summary').filter({ hasText: 'Custom fields' }).click();
         await expect(panel.getByLabel('Custom field key 1')).toHaveValue('company');
         await expect(panel.getByLabel('Custom field value 1')).toHaveValue('Analytical Engines');
      });
   });

   test('selects several subscribers and adds a new tag to all of them', async ({ api, page }) => {
      const shared = `e2e-bulk-${Date.now().toString(36)}`;
      const tag = `${shared}-tag`;
      const first = `${shared}-one@example.test`;
      const second = `${shared}-two@example.test`;
      await createSubscriber(api, { email: first, firstName: 'One' });
      await createSubscriber(api, { email: second, firstName: 'Two' });

      await test.step('filter to the two subscribers and select both', async () => {
         await page.goto('/subscribers');
         // Selection resets whenever the list reloads, so wait for the debounced
         // search result before ticking rows.
         await page.getByLabel('Search subscribers').fill(shared);
         await expect(
            page.getByRole('status').filter({ hasText: '2 subscribers loaded' }),
         ).toBeVisible();
         await selectSubscriberRow(page, first);
         await selectSubscriberRow(page, second);

         await expect(page.getByRole('region', { name: 'Bulk actions' })).toContainText(
            '2 subscribers selected',
         );
      });

      await test.step('add a new tag through the bulk action dialog', async () => {
         await page
            .getByRole('region', { name: 'Bulk actions' })
            .getByRole('button', { name: 'Add tags' })
            .click();

         const dialog = page.getByRole('dialog', { name: 'Add tags to selected subscribers' });
         await addTagInPicker(page, dialog.getByRole('combobox', { name: 'Tags' }), tag);
         await dialog.getByRole('button', { name: 'Add tags' }).click();
         await expect(dialog).toBeHidden();
      });

      await test.step('filter the list by the new tag and see both subscribers', async () => {
         // The tag filter list is loaded when the page mounts, so reload after
         // the dialog created the tag.
         await page.reload();
         await page.getByLabel('Search subscribers').fill('');
         await page.getByLabel('Filter by tag').click();

         const option = page.getByRole('option').filter({ hasText: tag });
         await expect(option).toBeVisible();
         await option.click();

         await expect(subscriberRow(page, first)).toBeVisible();
         await expect(subscriberRow(page, second)).toBeVisible();
      });
   });

   test('exports the current subscriber list as a CSV download', async ({ api, page }) => {
      const email = uniqueEmail('export');
      await createSubscriber(api, { email, firstName: 'Ada' });

      await test.step('request the export from the subscribers page', async () => {
         await page.goto('/subscribers');
         await expect(subscriberRow(page, email)).toBeVisible();

         const downloadPromise = page.waitForEvent('download');
         await page.getByRole('button', { name: 'Export CSV' }).click();
         const download = await downloadPromise;

         await test.step('the download is named after the list', async () => {
            expect(download.suggestedFilename()).toMatch(/^subscribers-.*\.csv$/);
         });

         await test.step('the file contains the subscriber', async () => {
            const file = await download.path();
            expect(file).not.toBeNull();
            const contents = readFileSync(file as string, 'utf8');
            expect(contents).toContain(email);
         });
      });
   });

   test('deletes a subscriber after confirming the action', async ({ api, page }) => {
      const email = uniqueEmail('delete');
      await createSubscriber(api, { email, firstName: 'Ada' });

      await test.step('find the subscriber and ask to delete them', async () => {
         await page.goto('/subscribers');
         await page.getByLabel('Search subscribers').fill(email);
         await expect(subscriberRow(page, email)).toBeVisible();
         await subscriberRow(page, email)
            .getByRole('button', { name: `Delete ${email}` })
            .click();
      });

      await test.step('confirm the deletion', async () => {
         const dialog = page.getByRole('dialog', { name: 'Delete subscriber' });
         await dialog.getByRole('button', { name: 'Delete subscriber' }).click();
         await expect(dialog).toBeHidden();
      });

      await test.step('the subscriber is gone from the list', async () => {
         await expect(subscriberRow(page, email)).toBeHidden();
      });
   });
});
