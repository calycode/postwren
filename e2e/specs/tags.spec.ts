import { expect, test } from '../support/fixtures';
import { uniqueEmail, uniqueTag } from '../support/ids';
import { createSubscriber, createTag } from '../support/seed';
import { addTagInPicker, openSubscriberPanel, subscriberRow } from '../support/ui';

test.describe('Audience: organising tags', () => {
   test('creates a tag, assigns it to a subscriber, and filters the list by it', async ({
      api,
      page,
   }) => {
      const tag = uniqueTag('tag');
      const email = uniqueEmail('tagged');
      await createSubscriber(api, { email, firstName: 'Grace', lastName: 'Hopper' });

      await test.step('create the tag from the Tags page', async () => {
         await page.goto('/tags');
         await page.getByLabel('New tag').fill(tag);
         await page.getByRole('button', { name: 'Add tag' }).click();
         await expect(page.getByRole('cell', { name: tag, exact: true })).toBeVisible();
      });

      await test.step('assign the tag in the subscriber panel', async () => {
         await page.goto('/subscribers');
         const panel = await openSubscriberPanel(page, email);
         await addTagInPicker(page, panel.getByRole('combobox', { name: /search tags/i }), tag);

         const save = panel.getByRole('button', { name: 'Save changes' });
         await expect(save).toBeEnabled();
         await save.click();
         await expect(save).toBeDisabled();
         await panel.getByRole('button', { name: 'Close subscriber panel' }).click();
      });

      await test.step('filter the subscriber list by the tag', async () => {
         await page.getByLabel('Search subscribers').fill('');
         await page.getByLabel('Filter by tag').click();
         await page.getByRole('option').filter({ hasText: tag }).click();

         const row = subscriberRow(page, email);
         await expect(row).toBeVisible();
         await expect(row.getByText(tag, { exact: true })).toBeVisible();
      });
   });

   test('renames a tag from its detail panel and updates the tag list', async ({ api, page }) => {
      const tag = uniqueTag('rename');
      const renamed = uniqueTag('renamed');
      await createTag(api, tag);

      await test.step('open the tag panel', async () => {
         await page.goto('/tags');
         await expect(page.getByRole('cell', { name: tag, exact: true })).toBeVisible();
         await page.getByRole('button', { name: `Open ${tag}` }).click();

         const panel = page.getByRole('complementary', { name: `Tag ${tag}` });
         await expect(panel).toBeVisible();
      });

      await test.step('rename and save', async () => {
         const panel = page.getByRole('complementary', { name: `Tag ${tag}` });
         await panel.getByLabel('Name').fill(renamed);
         const save = panel.getByRole('button', { name: 'Save changes' });
         await expect(save).toBeEnabled();
         await save.click();
      });

      await test.step('see the new name in the table', async () => {
         await expect(page.getByRole('cell', { name: renamed, exact: true })).toBeVisible();
         await page.getByRole('button', { name: 'Close tag panel' }).click();
         await expect(page.getByRole('complementary', { name: `Tag ${renamed}` })).toBeHidden();
      });
   });
});
