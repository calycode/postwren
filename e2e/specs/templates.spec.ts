import type { Page } from '@playwright/test';
import { expect, test } from '../support/fixtures';
import { uniqueName } from '../support/ids';
import { createTemplate } from '../support/seed';

const canvaFrame = (page: Page) => page.frameLocator('iframe[title="Email canvas"]');

test.describe('Email design: building a template', () => {
   test('creates a template from a starter and saves an edited body block', async ({ page }) => {
      const subject = uniqueName('subject');
      const body = uniqueName('body');

      await test.step('create a template from the Newsletter starter', async () => {
         await page.goto('/templates');
         await page.getByRole('button', { name: 'Browse starters' }).click();

         const starters = page.getByRole('dialog', { name: 'Start from a starter' });
         await starters.getByRole('button', { name: /Newsletter/ }).click();

         await expect(page).toHaveURL(/\/templates\/tpl[a-z0-9]+$/);
         await expect(page.getByLabel('Template name')).toHaveValue('Newsletter');
      });

      await test.step('edit a text block in the email canvas', async () => {
         const canvas = canvaFrame(page);
         await canvas.locator('[data-block-kind="text"]').first().click();
         await page.getByLabel('Text', { exact: true }).fill(body);
         await expect(canvas.getByText(body)).toBeVisible();
      });

      await test.step('change the subject and save', async () => {
         await page.getByLabel('Subject').fill(subject);
         await expect(
            page.getByRole('status').filter({ hasText: /^Unsaved changes$/ }),
         ).toBeVisible();

         await page.getByRole('button', { name: 'Save', exact: true }).click();
         await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();
      });

      await test.step('reload and see both edits persisted', async () => {
         await page.reload();
         await expect(page.getByLabel('Subject')).toHaveValue(subject);
         await expect(canvaFrame(page).getByText(body)).toBeVisible();
      });
   });

   test('previews the saved email before sending', async ({ api, page }) => {
      const text = uniqueName('preview body');
      const template = await createTemplate(api, uniqueName('preview template'), {
         text,
      });

      await test.step('open the template and start the preview', async () => {
         await page.goto(`/templates/${template.id}`);
         await page.getByRole('button', { name: 'Preview', exact: true }).click();
      });

      await test.step('see the rendered email in the preview dialog', async () => {
         const dialog = page.getByRole('dialog', { name: `Preview: ${template.name}` });
         await expect(dialog).toBeVisible();

         const preview = dialog.frameLocator('iframe[title="Rendered email preview"]');
         await expect(preview.getByText(text)).toBeVisible();
      });
   });

   test('duplicates a template from the template list', async ({ api, page }) => {
      const template = await createTemplate(api, uniqueName('duplicate template'));

      await test.step('duplicate the template card', async () => {
         await page.goto('/templates');
         await page.getByRole('button', { name: `Duplicate ${template.name}` }).click();
      });

      await test.step('see the copy in the list', async () => {
         await expect(page.getByText(`${template.name} (copy)`, { exact: true })).toBeVisible();
      });
   });

   test('uploads an image and places it in a template', async ({ api, page }) => {
      const template = await createTemplate(api, uniqueName('image template'));

      await test.step('open the template and add an image block', async () => {
         await page.goto(`/templates/${template.id}`);
         await page
            .getByRole('complementary', { name: 'Blocks' })
            .getByRole('button', { name: 'Image', exact: true })
            .click();
         await expect(page.getByLabel('Image URL', { exact: true })).toBeVisible();
      });

      let mediaUrl = '';

      await test.step('upload a PNG through the image field', async () => {
         await page.getByLabel('Upload Image URL', { exact: true }).setInputFiles({
            name: 'e2e-pixel.png',
            mimeType: 'image/png',
            buffer: Buffer.from(
               'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl2nXcAAAAASUVORK5CYII=',
               'base64',
            ),
         });

         const imageUrl = page.getByLabel('Image URL', { exact: true });
         await expect(imageUrl).toHaveValue(/\/media\//);
         mediaUrl = await imageUrl.inputValue();
      });

      await test.step('the uploaded file is served back from the Worker', async () => {
         const response = await page.request.get(mediaUrl);
         expect(response.status()).toBe(200);
         expect(response.headers()['content-type']).toContain('image/png');
      });

      await test.step('save and keep the image after reload', async () => {
         await page.getByRole('button', { name: 'Save', exact: true }).click();
         await expect(page.getByRole('status').filter({ hasText: /^Saved$/ })).toBeVisible();

         await page.reload();
         await canvaFrame(page).locator('[data-block-kind="image"]').first().click();
         await expect(page.getByLabel('Image URL', { exact: true })).toHaveValue(mediaUrl);
      });
   });
});
