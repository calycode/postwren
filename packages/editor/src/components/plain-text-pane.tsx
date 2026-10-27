import { EmptyState } from '@mailer/ui';

export function PlainTextPane({ text }: { text: string }) {
   if (text.trim().length === 0) {
      return (
         <div className="p-4">
            <EmptyState
               title="No plain text yet"
               description="Add a block and its plain text version will appear here."
            />
         </div>
      );
   }

   return (
      <div className="p-4">
         <pre className="whitespace-pre-wrap rounded-lg border border-border bg-card p-4 font-mono text-sm text-card-foreground">
            {text}
         </pre>
      </div>
   );
}
