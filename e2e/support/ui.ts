import { expect, type Locator, type Page } from '@playwright/test';

/** The tour opens once per account and covers the page until it is dismissed. */
export async function skipProductTour(page: Page): Promise<void> {
   const tour = page.getByRole('dialog', { name: 'Product tour' });
   await expect(tour).toBeVisible();
   await page.getByRole('button', { name: 'Skip tour' }).click();
   await expect(tour).toBeHidden();
}

export function subscriberRow(page: Page, email: string): Locator {
   return page.getByRole('row').filter({ hasText: email });
}

/** Ticks a row checkbox. The real input is visually hidden, so click its label. */
export async function selectSubscriberRow(page: Page, email: string): Promise<void> {
   await subscriberRow(page, email).locator('label[data-slot="checkbox"]').click();
   await expect(subscriberRow(page, email)).toHaveAttribute('data-state', 'selected');
}

/** Searches the list and opens the docked detail panel for one subscriber. */
export async function openSubscriberPanel(page: Page, email: string): Promise<Locator> {
   await page.getByLabel('Search subscribers').fill(email);

   const row = subscriberRow(page, email);
   await expect(row).toBeVisible();
   await row.getByRole('button', { name: `Open ${email}` }).click();

   const panel = page.getByRole('complementary', { name: `Subscriber ${email}` });
   await expect(panel).toBeVisible();
   return panel;
}

/** Picks an existing tag, or creates it when the picker offers that. */
export async function addTagInPicker(
   page: Page,
   combobox: Locator,
   tagName: string,
): Promise<void> {
   await combobox.fill(tagName);

   const listbox = page.getByRole('listbox');
   const create = page.getByRole('button', { name: /^Create tag / });
   await expect(listbox.or(create).first()).toBeVisible();

   const matching = listbox.getByRole('option').filter({ hasText: tagName });
   if ((await matching.count()) > 0) {
      await matching.first().click();
   } else {
      await create.click();
   }
}

/** Opens Settings and returns the visible tab panel. */
export async function openSettingsTab(page: Page, name: string): Promise<Locator> {
   await page.goto('/settings');
   await page.getByRole('tab', { name }).click();

   const panel = page.getByRole('tabpanel');
   await expect(panel).toBeVisible();
   return panel;
}

/** `datetime-local` expects local wall time, not an ISO string with a Z. */
export function localDateTimeInput(date: Date): string {
   const pad = (value: number) => String(value).padStart(2, '0');
   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
