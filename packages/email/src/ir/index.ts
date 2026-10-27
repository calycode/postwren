export * from './types';
export * from './schema';

import { IR_VERSION } from './types';
import type { Document } from './types';
import { documentSchema, starterDocument } from './schema';
import type { ZodError } from 'zod';

export class DocumentError extends Error {
   constructor(
      message: string,
      readonly issues: string[] = [],
   ) {
      super(message);
      this.name = 'DocumentError';
   }
}

export function createDocument(): Document {
   return starterDocument();
}

function readableIssues(error: ZodError): string[] {
   return error.issues.map((issue) => {
      const path = issue.path.map((part) => String(part)).join('.');
      return path ? `${path}: ${issue.message}` : issue.message;
   });
}

export function parseDocument(input: unknown): Document {
   const result = documentSchema.safeParse(input);
   if (!result.success) {
      const issues = readableIssues(result.error);
      throw new DocumentError(`Invalid email document (${issues.length} issue(s))`, issues);
   }
   return result.data as Document;
}

export function documentIssues(input: unknown): string[] {
   const result = documentSchema.safeParse(input);
   return result.success ? [] : readableIssues(result.error);
}

type Migration = {
   from: number;
   to: number;
   migrate: (input: Record<string, unknown>) => Record<string, unknown>;
};

const MIGRATIONS: readonly Migration[] = [];

export function migrateDocument(input: unknown): Document {
   if (typeof input !== 'object' || input === null || Array.isArray(input)) {
      return parseDocument(input);
   }

   let current: unknown = input;
   let version = (input as { version?: unknown }).version;
   let steps = 0;

   while (typeof version === 'number' && version < IR_VERSION) {
      const migration = MIGRATIONS.find((candidate) => candidate.from === version);
      if (!migration) {
         throw new DocumentError(`No migration path from version ${version}`, [
            `Unsupported document version ${version}`,
         ]);
      }
      current = migration.migrate(current as Record<string, unknown>);
      version = (current as { version?: unknown }).version;
      steps += 1;
      if (steps > 64) {
         throw new DocumentError('Migration chain did not converge', ['Circular migration chain']);
      }
   }

   return parseDocument(current);
}
