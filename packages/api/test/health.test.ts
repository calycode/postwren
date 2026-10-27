import { describe, expect, it } from 'vitest';
import { createAppForTest, json } from './helpers';

describe('health', () => {
   it('reports ok without authentication', async () => {
      const app = createAppForTest();
      const response = await app.request('/api/health');

      expect(response.status).toBe(200);
      const body = await json(response);
      expect(body.error).toBeNull();
      expect(body.data.status).toBe('ok');
      expect(typeof body.data.time).toBe('number');
   });
});
