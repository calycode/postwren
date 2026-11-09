import { env, createExecutionContext, waitOnExecutionContext } from 'cloudflare:test';
import { createId, randomToken, sha256Hex } from '@postwren/worker-kit/ids';
import { createDocument } from '@postwren/email/ir';
import type { Document } from '@postwren/email/ir';
import type { CampaignJob, EmailBinding, Env } from '../src/env';
import { createApp } from '../src/app';
import workerHandler from '../src/index';
import { SESSION_TTL_SECONDS } from '../src/auth/session';

export type Auth = { cookie: string; csrf: string; userId: string };

export function baseEnv(overrides: Partial<Env> = {}): Env {
   const real = env as unknown as Env;
   return {
      DB: real.DB,
      MEDIA: real.MEDIA,
      ASSETS: real.ASSETS,
      CAMPAIGN_QUEUE: real.CAMPAIGN_QUEUE,
      EMAIL: real.EMAIL,
      OAUTH_KV: real.OAUTH_KV,
      ...(real.OAUTH_PROVIDER === undefined ? {} : { OAUTH_PROVIDER: real.OAUTH_PROVIDER }),
      SESSION_SECRET: real.SESSION_SECRET,
      TOKEN_SECRET: real.TOKEN_SECRET,
      APP_URL: real.APP_URL,
      ENVIRONMENT: real.ENVIRONMENT,
      EMAIL_FROM: real.EMAIL_FROM,
      ...(real.OWNER_EMAIL === undefined
         ? { OWNER_EMAIL: 'dev@example.com' }
         : { OWNER_EMAIL: real.OWNER_EMAIL }),
      ...overrides,
   };
}

export function createAppForTest(overrides: Partial<Env> = {}) {
   const target = baseEnv(overrides);
   const app = createApp(target);

   return {
      request(input: Request | string | URL, init?: RequestInit): Response | Promise<Response> {
         return app.request(input, init, target);
      },
   };
}

export function json(res: Response): Promise<any> {
   return res.json();
}

export function now(): number {
   return Math.floor(Date.now() / 1000);
}

export async function resetDb(db: D1Database = env.DB): Promise<void> {
   await db.batch([
      db.prepare('DELETE FROM webhook_deliveries'),
      db.prepare('DELETE FROM webhook_endpoints'),
      db.prepare('DELETE FROM link_clicks'),
      db.prepare('DELETE FROM email_events'),
      db.prepare('DELETE FROM automation_link_clicks'),
      db.prepare('DELETE FROM automation_deliveries'),
      db.prepare('DELETE FROM automation_runs'),
      db.prepare('DELETE FROM automations'),
      db.prepare('DELETE FROM template_comments'),
      db.prepare('DELETE FROM campaign_recipients'),
      db.prepare('DELETE FROM campaigns'),
      db.prepare('DELETE FROM templates'),
      db.prepare('DELETE FROM subscriber_metadata'),
      db.prepare('DELETE FROM media_assets'),
      db.prepare('DELETE FROM subscriber_tags'),
      db.prepare('DELETE FROM tags'),
      db.prepare('DELETE FROM subscribers'),
      db.prepare('DELETE FROM subscribe_keys'),
      db.prepare('DELETE FROM sessions'),
      db.prepare('DELETE FROM magic_links'),
      db.prepare('DELETE FROM rate_limits'),
      db.prepare('DELETE FROM sender_addresses'),
      db.prepare('DELETE FROM embed_origins'),
      db.prepare('DELETE FROM users'),
   ]);
}

export async function seedOwner(target: Env = baseEnv()): Promise<Auth> {
   const email = (target.OWNER_EMAIL ?? 'owner@example.com').toLowerCase();
   const userId = createId('usr');
   const createdAt = now();

   await target.DB.prepare('INSERT INTO users (id, email, role, created_at) VALUES (?, ?, ?, ?)')
      .bind(userId, email, 'owner', createdAt)
      .run();

   const raw = randomToken(32);
   const tokenHash = await sha256Hex(`${target.SESSION_SECRET}:${raw}`);
   const csrf = randomToken(24);

   await target.DB.prepare(
      'INSERT INTO sessions (token_hash, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)',
   )
      .bind(tokenHash, userId, createdAt + SESSION_TTL_SECONDS, createdAt)
      .run();

   return { cookie: `sid=${raw}; csrf=${csrf}`, csrf, userId };
}

export function authHeaders(
   auth: Auth,
   extra: Record<string, string> = {},
): Record<string, string> {
   return {
      cookie: auth.cookie,
      'x-csrf-token': auth.csrf,
      'content-type': 'application/json',
      ...extra,
   };
}

export async function ensureTag(db: D1Database, name: string): Promise<string> {
   const normalised = name.trim().toLowerCase();
   const existing = await db
      .prepare('SELECT id FROM tags WHERE name = ?')
      .bind(normalised)
      .first<{ id: string }>();
   if (existing !== null) return existing.id;

   const id = createId('tag');
   await db
      .prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)')
      .bind(id, normalised, now())
      .run();
   return id;
}

export async function seedSubscribers(
   target: Env,
   entries: Array<{
      email: string;
      tags?: string[];
      status?: string;
      first_name?: string;
      last_name?: string;
      metadata?: Record<string, string>;
      createdAt?: number;
   }>,
): Promise<string[]> {
   const ids: string[] = [];

   for (const [index, entry] of entries.entries()) {
      const id = createId('sub');
      ids.push(id);

      await target.DB.prepare(
         `INSERT INTO subscribers (id, email, first_name, last_name, status, source, created_at)
          VALUES (?, ?, ?, ?, ?, 'seed', ?)`,
      )
         .bind(
            id,
            entry.email.toLowerCase(),
            entry.first_name ?? null,
            entry.last_name ?? null,
            entry.status ?? 'subscribed',
            entry.createdAt ?? now() - index,
         )
         .run();

      for (const tag of entry.tags ?? []) {
         const tagId = await ensureTag(target.DB, tag);
         await target.DB.prepare(
            'INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)',
         )
            .bind(id, tagId)
            .run();
      }

      for (const [key, value] of Object.entries(entry.metadata ?? {})) {
         await target.DB.prepare(
            'INSERT INTO subscriber_metadata (subscriber_id, key, value) VALUES (?, ?, ?)',
         )
            .bind(id, key, value)
            .run();
      }
   }

   return ids;
}

export async function seedTemplate(
   target: Env,
   options: { name?: string; document?: Document; irJson?: string; subject?: string } = {},
): Promise<{ id: string; document: Document; revision: number }> {
   const document = options.document ?? createDocument();
   const id = createId('tpl');
   const createdAt = now();

   await target.DB.prepare(
      `INSERT INTO templates (id, name, subject, ir_json, preview_html, revision, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, 1, ?, ?)`,
   )
      .bind(
         id,
         options.name ?? 'Template',
         options.subject ?? 'Subject',
         options.irJson ?? JSON.stringify(document),
         createdAt,
         createdAt,
      )
      .run();

   return { id, document, revision: 1 };
}

export async function seedCampaign(
   target: Env,
   options: {
      templateId: string;
      audienceQuery?: string;
      status?: string;
      scheduledAt?: number | null;
      utmSource?: string;
      utmMedium?: string;
      utmCampaign?: string;
      templateRevision?: number;
      name?: string;
      metadata?: Record<string, string>;
   },
): Promise<string> {
   const id = createId('cmp');
   const createdAt = now();

   await target.DB.prepare(
      `INSERT INTO campaigns
       (id, template_id, template_revision, name, subject, from_name, from_email, reply_to,
        audience_query, scheduled_at, status, utm_source, utm_medium, utm_campaign,
        metadata_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         id,
         options.templateId,
         options.templateRevision ?? 1,
         options.name ?? 'Campaign',
         'Hello',
         'Sender',
         'sender@example.com',
         options.audienceQuery ?? '',
         options.scheduledAt ?? null,
         options.status ?? 'draft',
         options.utmSource ?? '',
         options.utmMedium ?? '',
         options.utmCampaign ?? '',
         JSON.stringify(options.metadata ?? {}),
         createdAt,
         createdAt,
      )
      .run();

   return id;
}

export async function seedRecipient(
   target: Env,
   input: {
      campaignId: string;
      subscriberId: string;
      messageId?: string;
      status?: string;
      attempts?: number;
      providerMessageId?: string;
   },
): Promise<string> {
   const messageId = input.messageId ?? createId('msg');

   await target.DB.prepare(
      `INSERT INTO campaign_recipients
       (campaign_id, subscriber_id, message_id, status, attempts, provider_message_id)
       VALUES (?, ?, ?, ?, ?, ?)`,
   )
      .bind(
         input.campaignId,
         input.subscriberId,
         messageId,
         input.status ?? 'queued',
         input.attempts ?? 0,
         input.providerMessageId ?? null,
      )
      .run();

   return messageId;
}

export class FakeQueue {
   readonly batches: CampaignJob[][] = [];

   async send(body: CampaignJob): Promise<void> {
      this.batches.push([body]);
   }

   async sendBatch(messages: Array<{ body: CampaignJob }>): Promise<void> {
      this.batches.push(messages.map((message) => message.body));
   }

   get jobCount(): number {
      return this.batches.reduce((sum, batch) => sum + batch.length, 0);
   }
}

export type SentMessage = {
   from: { name: string; email: string };
   replyTo?: string;
   to: string;
   subject: string;
   html: string;
   text: string;
   headers?: Record<string, string>;
};

export class FakeEmail {
   readonly sent: SentMessage[] = [];
   failWith: unknown = null;

   async send(input: SentMessage): Promise<{ messageId: string }> {
      if (this.failWith !== null) throw this.failWith;
      this.sent.push(input);
      return { messageId: `provider-${this.sent.length}` };
   }
}

export function withEmail(target: Env, email: FakeEmail): Env {
   return { ...target, EMAIL: email as unknown as EmailBinding };
}

export function withQueue(target: Env, queue: FakeQueue): Env {
   return { ...target, CAMPAIGN_QUEUE: queue as unknown as Env['CAMPAIGN_QUEUE'] };
}

export type TestMessage = {
   id: string;
   timestamp: number;
   body: CampaignJob;
   attempts: number;
   ack: () => void;
   retry: () => void;
};

export function makeBatch(jobs: CampaignJob[]): {
   batch: MessageBatch<CampaignJob>;
   messages: TestMessage[];
} {
   const messages: TestMessage[] = jobs.map((body, index) => ({
      id: `msg-${index}-${Math.random().toString(36).slice(2)}`,
      timestamp: Date.now(),
      body,
      attempts: 1,
      ack: () => undefined,
      retry: () => undefined,
   }));

   return {
      batch: {
         queue: 'postwren-campaigns-dev',
         messages,
      } as unknown as MessageBatch<CampaignJob>,
      messages,
   };
}

export async function runScheduledWith(target: Env): Promise<void> {
   const ctx = createExecutionContext();
   await workerHandler.scheduled(
      {
         cron: '* * * * *',
         scheduledTime: Date.now(),
         noRetry: () => undefined,
      } as unknown as ScheduledController,
      target,
      ctx,
   );
   await waitOnExecutionContext(ctx);
}

export async function signTokenForTest(
   secret: string,
   purpose: 'click' | 'open' | 'unsubscribe' | 'confirm' | 'web',
   payload: Record<string, unknown>,
   ttlSeconds = 3600,
): Promise<string> {
   const { signToken } = await import('@postwren/shared/tokens');
   return signToken(payload, { secret, purpose, ttlSeconds });
}
