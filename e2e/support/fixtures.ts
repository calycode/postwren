import { test as base } from '@playwright/test';
import { Api } from './api';

export const test = base.extend<{ api: Api }>({
   api: async ({ context }, use) => {
      await use(new Api(context.request));
   },
});

export { expect } from '@playwright/test';
