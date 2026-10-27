import { fieldErrorsFrom } from '../../lib/form-errors';

export function issuesFromDetails(details: unknown): string[] {
   const lines = new Set<string>();

   if (typeof details === 'object' && details !== null) {
      const issues = (details as { issues?: unknown }).issues;
      if (Array.isArray(issues)) {
         for (const issue of issues) {
            if (typeof issue === 'string') {
               lines.add(issue);
               continue;
            }
            if (typeof issue !== 'object' || issue === null) continue;

            const record = issue as { path?: unknown; message?: unknown };
            if (typeof record.message !== 'string') continue;
            const path = Array.isArray(record.path)
               ? record.path.map((part) => String(part)).join('.')
               : typeof record.path === 'string'
                 ? record.path
                 : '';
            lines.add(path.length > 0 ? `${path}: ${record.message}` : record.message);
         }
      }
   }

   for (const [path, message] of Object.entries(fieldErrorsFrom(details))) {
      if (path === 'issues') continue;
      lines.add(path.length > 0 ? `${path}: ${message}` : message);
   }

   return [...lines];
}
