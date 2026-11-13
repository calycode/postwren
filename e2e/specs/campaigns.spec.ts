import { expect, test } from '../support/fixtures';
import type { Api } from '../support/api';
import { uniqueEmail, uniqueName, uniqueTag } from '../support/ids';
import {
   attachTag,
   createCampaign,
   createSubscriber,
   createTag,
   createTemplate,
   verifyDefaultSender,
} from '../support/seed';
import { localDateTimeInput } from '../support/ui';

async function seedTaggedAudience(
   api: Api,
   count: number,
): Promise<{ tag: { id: string; name: string }; emails: string[] }> {
   const tag = await createTag(api, uniqueTag('audience'));
   const emails: string[] = [];

   for (let index = 0; index < count; index += 1) {
      const email = uniqueEmail(`audience-${index + 1}`);
      const subscriber = await createSubscriber(api, { email, firstName: `Reader ${index + 1}` });
      await attachTag(api, subscriber.id, tag.id);
      emails.push(email);
   }

   return { tag, emails };
}

test.describe('Sending: campaign lifecycle', () => {
   test('creates a campaign draft and lists it in the campaign table', async ({ api, page }) => {
      await verifyDefaultSender(api);
      const template = await createTemplate(api, uniqueName('template'));
      const campaign = uniqueName('campaign');

      await test.step('fill the New campaign dialog', async () => {
         await page.goto('/campaigns');
         // The empty state repeats this action while the list has no rows.
         await page.getByRole('button', { name: 'New campaign' }).first().click();

         const dialog = page.getByRole('dialog', { name: 'New campaign' });
         await dialog.getByLabel('Campaign name').fill(campaign);
         await dialog.getByLabel('Template').click();
         await page.getByRole('option', { name: new RegExp(template.name) }).click();
         await expect(dialog.getByLabel('Subject')).toHaveValue(template.subject);
         await dialog.getByLabel('From name').fill('E2E sender');
         await dialog.getByRole('button', { name: 'Create campaign' }).click();
      });

      await test.step('land on the new draft', async () => {
         await expect(page).toHaveURL(/\/campaigns\/cmp[a-z0-9]+$/);
         await expect(page.getByRole('heading', { name: campaign, level: 1 })).toBeVisible();
         await expect(page.getByText('Draft', { exact: true }).first()).toBeVisible();
      });

      await test.step('see the draft in the campaign list', async () => {
         await page.goto('/campaigns');
         const row = page.getByRole('row').filter({ hasText: campaign });
         await expect(row).toBeVisible();
         await expect(row.getByText('Draft', { exact: true })).toBeVisible();
      });
   });

   test('shows the audience size and sends a test email to the owner', async ({ api, page }) => {
      const sender = await verifyDefaultSender(api);
      const template = await createTemplate(api, uniqueName('preview template'));
      const audience = await seedTaggedAudience(api, 2);
      const campaign = await createCampaign(api, {
         name: uniqueName('test send'),
         templateId: template.id,
         subject: uniqueName('test subject'),
         fromName: 'E2E sender',
         fromEmail: sender.email,
         audienceQuery: `tag:${audience.tag.name}`,
      });

      await test.step('open the campaign and see the audience preview', async () => {
         await page.goto(`/campaigns/${campaign.id}`);
         await expect(page.getByText(/Matches\s+2\s+subscribers\./)).toBeVisible();
      });

      await test.step('send a test email to the owner', async () => {
         await page.getByRole('button', { name: 'Send test' }).click();

         const dialog = page.getByRole('dialog', { name: 'Send test' });
         await expect(dialog.getByLabel('Recipient')).toHaveAttribute(
            'placeholder',
            'dev@example.com',
         );
         await dialog.getByRole('button', { name: 'Send test' }).click();
         await expect(dialog).toBeHidden();

         await expect(page.getByText('Test message sent to dev@example.com.')).toBeVisible();
      });
   });

   test('sends a campaign to a tagged audience and shows delivered results', async ({
      api,
      page,
   }) => {
      const sender = await verifyDefaultSender(api);
      const text = uniqueName('campaign body');
      const template = await createTemplate(api, uniqueName('send template'), { text });
      const audience = await seedTaggedAudience(api, 2);
      const campaign = await createCampaign(api, {
         name: uniqueName('send now'),
         templateId: template.id,
         subject: uniqueName('send subject'),
         fromName: 'E2E sender',
         fromEmail: sender.email,
         audienceQuery: `tag:${audience.tag.name}`,
      });

      await test.step('start the send from the campaign page', async () => {
         await page.goto(`/campaigns/${campaign.id}`);
         await page.getByRole('button', { name: 'Send now' }).click();

         const dialog = page.getByRole('dialog', { name: 'Send campaign now' });
         await dialog.getByRole('button', { name: 'Send now' }).click();
         await expect(dialog).toBeHidden();
      });

      await test.step('wait for the queue to finish the campaign', async () => {
         await expect
            .poll(
               async () => {
                  const current = await api.get<{ status: string }>(
                     `/api/v1/campaigns/${campaign.id}`,
                  );
                  return current.status;
               },
               { timeout: 30_000 },
            )
            .toBe('sent');

         await page.reload();
         await expect(page.getByText('Sent', { exact: true }).first()).toBeVisible();
      });

      await test.step('both recipients are marked as sent', async () => {
         for (const email of audience.emails) {
            const row = page.getByRole('row').filter({ hasText: email });
            await expect(row).toBeVisible();
            await expect(row.getByText('Sent', { exact: true })).toBeVisible();
         }
      });

      await test.step('the public web version renders the email without a session', async () => {
         const popupPromise = page.waitForEvent('popup');
         await page.getByRole('link', { name: 'Web version' }).click();
         const popup = await popupPromise;

         await expect(popup.getByText(text)).toBeVisible();
      });
   });

   test('schedules a campaign and cancels it before it sends', async ({ api, page }) => {
      const sender = await verifyDefaultSender(api);
      const template = await createTemplate(api, uniqueName('schedule template'));
      const campaign = await createCampaign(api, {
         name: uniqueName('scheduled'),
         templateId: template.id,
         subject: uniqueName('scheduled subject'),
         fromName: 'E2E sender',
         fromEmail: sender.email,
      });

      await test.step('schedule the campaign one hour from now', async () => {
         await page.goto(`/campaigns/${campaign.id}`);
         await page.getByRole('button', { name: 'Schedule' }).click();

         const dialog = page.getByRole('dialog', { name: 'Schedule campaign' });
         await dialog
            .getByLabel('Send at')
            .fill(localDateTimeInput(new Date(Date.now() + 60 * 60 * 1000)));
         await dialog.getByRole('button', { name: 'Schedule campaign' }).click();
         await expect(dialog).toBeHidden();

         await expect(page.getByText(/Campaign scheduled for/)).toBeVisible();
         await expect(page.getByText('Scheduled', { exact: true }).first()).toBeVisible();
      });

      await test.step('cancel it from the scheduled state', async () => {
         await page.getByRole('button', { name: 'Cancel', exact: true }).click();

         const dialog = page.getByRole('dialog', { name: 'Cancel campaign' });
         await dialog.getByRole('button', { name: 'Cancel campaign' }).click();
         await expect(dialog).toBeHidden();

         await expect(page.getByText('Cancelled', { exact: true }).first()).toBeVisible();
      });
   });
});
