import { createId } from '@postwren/worker-kit/ids';
import { ConflictError, ValidationError } from '@postwren/worker-kit/errors';
import { MAX_METADATA_KEYS, mergeMetadata, metadataErrors } from '@postwren/shared/metadata';
import type { MetadataRecord } from '@postwren/shared/metadata';
import { isUniqueViolation } from './validation';

export type SubscriberUpsertInput = {
   email: string;
   firstName?: string | null;
   lastName?: string | null;
   status?: string;
   source?: string | null;
   sourceUrl?: string | null;
   updateSource?: boolean;
   tags?: string[];
   metadata?: MetadataRecord;
   metadataDeletes?: string[];
   createOnly?: boolean;
};

export type SubscriberUpsertResult = { id: string; created: boolean; addedTags: string[] };

type ExistingSubscriber = { id: string; deleted_at: number | null };

function normaliseName(value: string | null | undefined): string | null {
   const trimmed = value?.trim() ?? '';
   return trimmed.length > 0 ? trimmed : null;
}

function assertMetadata(metadata: MetadataRecord): void {
   const errors = metadataErrors(metadata);
   const limit = Object.keys(metadata).length > MAX_METADATA_KEYS;
   if (errors.length > 0) {
      throw new ValidationError(errors[0] ?? 'Invalid metadata', {
         metadata: errors,
         ...(limit ? { limit: MAX_METADATA_KEYS } : {}),
      });
   }
}

export async function ensureTag(db: D1Database, name: string, now: number): Promise<string> {
   const normalised = name.trim().toLowerCase();
   await db
      .prepare(
         `INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)
          ON CONFLICT(name) DO NOTHING`,
      )
      .bind(createId('tag'), normalised, now)
      .run();

   const row = await db.prepare('SELECT id FROM tags WHERE name = ?').bind(normalised).first<{
      id: string;
   }>();

   if (row === null) {
      throw new ValidationError('Tag could not be created');
   }

   return row.id;
}

export async function attachTag(
   db: D1Database,
   subscriberId: string,
   tagId: string,
): Promise<boolean> {
   const result = await db
      .prepare('INSERT OR IGNORE INTO subscriber_tags (subscriber_id, tag_id) VALUES (?, ?)')
      .bind(subscriberId, tagId)
      .run();
   return (result.meta.changes ?? 0) > 0;
}

function metadataStatements(
   db: D1Database,
   subscriberId: string,
   metadata: MetadataRecord,
   deletes: string[],
): D1PreparedStatement[] {
   const statements: D1PreparedStatement[] = [];

   for (const [key, value] of Object.entries(metadata)) {
      statements.push(
         db
            .prepare(
               `INSERT INTO subscriber_metadata (subscriber_id, key, value) VALUES (?, ?, ?)
             ON CONFLICT(subscriber_id, key) DO UPDATE SET value = excluded.value`,
            )
            .bind(subscriberId, key, value),
      );
   }

   for (const key of deletes) {
      statements.push(
         db
            .prepare('DELETE FROM subscriber_metadata WHERE subscriber_id = ? AND key = ?')
            .bind(subscriberId, key),
      );
   }

   return statements;
}

export async function writeSubscriberMetadata(
   db: D1Database,
   subscriberId: string,
   metadata: MetadataRecord,
   deletes: string[] = [],
): Promise<void> {
   assertMetadata(metadata);
   const statements = metadataStatements(db, subscriberId, metadata, deletes);
   if (statements.length > 0) await db.batch(statements);
}

export async function loadSubscriberTags(db: D1Database, subscriberId: string): Promise<string[]> {
   const rows = await db
      .prepare(
         `SELECT t.name FROM tags t JOIN subscriber_tags st ON st.tag_id = t.id
          WHERE st.subscriber_id = ? ORDER BY t.name`,
      )
      .bind(subscriberId)
      .all<{ name: string }>();

   return rows.results.map((row) => row.name);
}

export async function loadSubscriberMetadata(
   db: D1Database,
   subscriberId: string,
): Promise<MetadataRecord> {
   const rows = await db
      .prepare('SELECT key, value FROM subscriber_metadata WHERE subscriber_id = ? ORDER BY key')
      .bind(subscriberId)
      .all<{ key: string; value: string }>();

   const metadata: MetadataRecord = {};
   for (const row of rows.results) metadata[row.key] = row.value;
   return metadata;
}

export async function loadSubscriberMetadataFor(
   db: D1Database,
   subscriberIds: string[],
): Promise<Map<string, MetadataRecord>> {
   const result = new Map<string, MetadataRecord>();
   if (subscriberIds.length === 0) return result;

   const placeholders = subscriberIds.map(() => '?').join(', ');
   const rows = await db
      .prepare(
         `SELECT subscriber_id, key, value FROM subscriber_metadata
          WHERE subscriber_id IN (${placeholders})
          ORDER BY subscriber_id, key`,
      )
      .bind(...subscriberIds)
      .all<{ subscriber_id: string; key: string; value: string }>();

   for (const row of rows.results) {
      const metadata = result.get(row.subscriber_id) ?? {};
      metadata[row.key] = row.value;
      result.set(row.subscriber_id, metadata);
   }

   return result;
}

async function applyTags(
   db: D1Database,
   subscriberId: string,
   tags: string[],
   now: number,
): Promise<string[]> {
   const added: string[] = [];
   for (const name of new Set(tags.map((tag) => tag.trim().toLowerCase()).filter(Boolean))) {
      const tagId = await ensureTag(db, name, now);
      if (await attachTag(db, subscriberId, tagId)) added.push(name);
   }
   return added;
}

export async function upsertSubscriber(
   db: D1Database,
   input: SubscriberUpsertInput,
   now: number,
): Promise<SubscriberUpsertResult> {
   const email = input.email.trim().toLowerCase();
   const firstName = normaliseName(input.firstName);
   const lastName = normaliseName(input.lastName);
   const metadata = input.metadata ?? {};
   const tags = input.tags ?? [];
   const sourceUrl = input.sourceUrl ?? null;

   assertMetadata(metadata);

   const existing = await db
      .prepare('SELECT id, deleted_at FROM subscribers WHERE email = ?')
      .bind(email)
      .first<ExistingSubscriber>();

   if (existing !== null) {
      if (input.createOnly === true) {
         throw new ConflictError('A subscriber with that email already exists');
      }

      const sets = ['first_name = COALESCE(?, first_name)', 'last_name = COALESCE(?, last_name)'];
      const params: (string | null)[] = [firstName, lastName];

      if (input.updateSource === true) {
         sets.push('source = COALESCE(?, source)', 'source_url = COALESCE(?, source_url)');
         params.push(input.source ?? null, sourceUrl);
      }

      if (Object.keys(metadata).length > 0 || (input.metadataDeletes ?? []).length > 0) {
         const current = await loadSubscriberMetadata(db, existing.id);
         const merged = mergeMetadata(current, {
            ...metadata,
            ...Object.fromEntries((input.metadataDeletes ?? []).map((key) => [key, null])),
         });

         if (Object.keys(merged).length > MAX_METADATA_KEYS) {
            throw new ValidationError(`At most ${MAX_METADATA_KEYS} metadata keys are allowed`);
         }
      }

      params.push(existing.id);
      await db
         .prepare(`UPDATE subscribers SET ${sets.join(', ')} WHERE id = ?`)
         .bind(...params)
         .run();

      await writeSubscriberMetadata(db, existing.id, metadata, input.metadataDeletes ?? []);
      const addedTags = await applyTags(db, existing.id, tags, now);

      return { id: existing.id, created: false, addedTags };
   }

   const id = createId('sub');
   try {
      await db
         .prepare(
            `INSERT INTO subscribers
             (id, email, first_name, last_name, status, source, source_url, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
         )
         .bind(
            id,
            email,
            firstName,
            lastName,
            input.status ?? 'subscribed',
            input.source ?? null,
            sourceUrl,
            now,
         )
         .run();
   } catch (error) {
      if (isUniqueViolation(error)) {
         if (input.createOnly === true) {
            throw new ConflictError('A subscriber with that email already exists');
         }
         return upsertSubscriber(db, { ...input, createOnly: false, metadataDeletes: [] }, now);
      }
      throw error;
   }

   await writeSubscriberMetadata(db, id, metadata);
   const addedTags = await applyTags(db, id, tags, now);

   return { id, created: true, addedTags };
}
