import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import {
   Badge,
   Button,
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
   cn,
   useToast,
} from '@postwren/ui';
import { API_BASE_URL } from '@/lib/api/client';

type Language = 'curl' | 'node' | 'python';

function snippets(origin: string, from: string): Record<Language, string> {
   const fromLine = from.length > 0 ? `\n    "from": ${JSON.stringify(from)},` : '';

   return {
      curl: `curl -X POST "${origin}/api/v1/emails" \\
  -H "Authorization: Bearer $POSTWREN_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "customer@example.com",${fromLine}
    "subject": "Your receipt",
    "html": "<p>Thanks for your order.</p>"
  }'`,
      node: `const response = await fetch('${origin}/api/v1/emails', {
  method: 'POST',
  headers: {
    Authorization: \`Bearer \${process.env.POSTWREN_API_KEY}\`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    to: 'customer@example.com',${from.length > 0 ? `\n    from: ${JSON.stringify(from)},` : ''}
    subject: 'Your receipt',
    html: '<p>Thanks for your order.</p>',
  }),
});

const email = await response.json();`,
      python: `import os
import requests

response = requests.post(
    "${origin}/api/v1/emails",
    headers={"Authorization": f"Bearer {os.environ['POSTWREN_API_KEY']}"},
    json={
        "to": "customer@example.com",${from.length > 0 ? `\n        "from": ${JSON.stringify(from)},` : ''}
        "subject": "Your receipt",
        "html": "<p>Thanks for your order.</p>",
    },
)
response.raise_for_status()
print(response.json())`,
   };
}

export function ApiQuickstartCard({ defaultFrom }: { defaultFrom: string }) {
   const { toast } = useToast();
   const [language, setLanguage] = useState<Language>('curl');
   const [copied, setCopied] = useState(false);

   const origin =
      API_BASE_URL.length > 0 ? API_BASE_URL.replace(/\/$/, '') : window.location.origin;
   const code = snippets(origin, defaultFrom)[language];

   async function copy() {
      try {
         await navigator.clipboard.writeText(code);
         setCopied(true);
         toast({ title: 'Snippet copied', variant: 'success' });
      } catch {
         toast({ title: 'Could not copy the snippet', variant: 'destructive' });
      }
   }

   return (
      <Card data-guide="settings-api-quickstart">
         <CardHeader>
            <CardTitle>Send transactional email</CardTitle>
            <CardDescription>
               Send one message to one recipient with an API key that has the{' '}
               <code className="rounded bg-muted px-1 py-0.5">emails:write</code> scope. Campaigns
               are still created and scheduled in the app.
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <dl className="grid gap-2 rounded-lg border border-border p-3 text-xs">
               <div className="flex flex-wrap items-center justify-between gap-2">
                  <dt className="flex flex-wrap items-center gap-1.5">
                     <Badge variant="secondary">emails:write</Badge>
                     <code className="text-muted-foreground">POST /api/v1/emails</code>
                  </dt>
                  <dd className="text-muted-foreground">Transactional message</dd>
               </div>
               <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                  <dt className="flex flex-wrap items-center gap-1.5">
                     <Badge variant="outline">send:write</Badge>
                     <code className="text-muted-foreground">
                        POST /api/v1/campaigns/&#123;id&#125;/send-now
                     </code>
                  </dt>
                  <dd className="text-muted-foreground">Send an existing campaign</dd>
               </div>
               <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
                  <dt className="flex flex-wrap items-center gap-1.5">
                     <Badge variant="outline">events:write</Badge>
                     <code className="text-muted-foreground">POST /api/v1/events</code>
                  </dt>
                  <dd className="text-muted-foreground">Start an automation</dd>
               </div>
            </dl>

            <div className="flex flex-wrap items-center justify-between gap-2">
               <div className="inline-flex rounded-lg bg-muted p-1">
                  {(['curl', 'node', 'python'] as const).map((option) => (
                     <button
                        key={option}
                        type="button"
                        aria-pressed={language === option}
                        onClick={() => {
                           setLanguage(option);
                           setCopied(false);
                        }}
                        className={cn(
                           'rounded-md px-2.5 py-1 text-xs font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
                           language === option
                              ? 'bg-background text-foreground shadow-sm'
                              : 'text-muted-foreground hover:text-foreground',
                        )}
                     >
                        {option === 'curl' ? 'cURL' : option === 'node' ? 'Node' : 'Python'}
                     </button>
                  ))}
               </div>
               <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void copy()}
               >
                  {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
                  {copied ? 'Copied' : 'Copy'}
               </Button>
            </div>

            <pre className="max-h-80 overflow-auto rounded-lg border border-border bg-muted/40 p-3 font-mono text-[11px] leading-relaxed whitespace-pre">
               <code>{code}</code>
            </pre>

            <p className="text-xs text-muted-foreground">
               Recipients that hard-bounced or complained are refused. The sender must be a verified
               address in <strong>Sending domains</strong>.
            </p>
         </CardContent>
      </Card>
   );
}
