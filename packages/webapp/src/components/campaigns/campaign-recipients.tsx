import { useEffect, useState } from 'react';
import { Users } from 'lucide-react';
import { Alert, AlertDescription, Badge, Button } from '@postwren/ui';
import { DataTable } from '@/components/data-table';
import type { DataTableColumn } from '@/components/data-table';
import { recipients as listRecipients } from '@/lib/api/campaigns';
import { errorMessage } from '@/lib/form-errors';
import { formatDateTime, formatNumber, pluralise, titleCase } from '@/lib/format';
import { appendCursorPage, cursorStateFrom, emptyCursorState } from '@/lib/pagination';
import type { CursorState } from '@/lib/pagination';
import { toRecipientView } from './model';
import type { RecipientView } from './model';

export type CampaignRecipientsProps = {
   campaignId: string;
   refreshKey: string;
};

function recipientVariant(
   status: string,
): 'success' | 'secondary' | 'warning' | 'destructive' | 'outline' {
   switch (status) {
      case 'sent':
      case 'delivered':
         return 'success';
      case 'queued':
         return 'secondary';
      case 'sending':
         return 'secondary';
      case 'bounced':
         return 'warning';
      case 'failed':
         return 'destructive';
      default:
         return 'outline';
   }
}

export function CampaignRecipients({ campaignId, refreshKey }: CampaignRecipientsProps) {
   const [state, setState] = useState<CursorState<RecipientView>>(emptyCursorState);
   const [loading, setLoading] = useState(true);
   const [loadingMore, setLoadingMore] = useState(false);
   const [error, setError] = useState<string | null>(null);
   const [moreError, setMoreError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);
      setMoreError(null);
      setState(emptyCursorState());

      listRecipients(campaignId, { limit: 25 })
         .then((page) => {
            if (cancelled) return;
            const normalised = page.data.map((recipient) => toRecipientView(recipient, campaignId));
            setState(
               cursorStateFrom({ data: normalised, meta: page.meta }, (recipient) => recipient.id),
            );
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load recipients'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [campaignId, refreshKey, reloadKey]);

   async function loadMore(): Promise<void> {
      if (state.nextCursor === null || loadingMore) return;

      setLoadingMore(true);
      setMoreError(null);
      try {
         const page = await listRecipients(campaignId, { cursor: state.nextCursor, limit: 25 });
         const normalised = page.data.map((recipient) => toRecipientView(recipient, campaignId));
         setState((current) =>
            appendCursorPage(
               current,
               { data: normalised, meta: page.meta },
               (recipient) => recipient.id,
            ),
         );
      } catch (cause) {
         setMoreError(errorMessage(cause, 'Could not load more recipients'));
      } finally {
         setLoadingMore(false);
      }
   }

   const columns: DataTableColumn<RecipientView>[] = [
      {
         id: 'email',
         header: 'Subscriber',
         cell: (recipient) => <span className="font-medium">{recipient.email}</span>,
      },
      {
         id: 'status',
         header: 'Status',
         cell: (recipient) => (
            <Badge variant={recipientVariant(recipient.status)}>
               {titleCase(recipient.status)}
            </Badge>
         ),
      },
      {
         id: 'sent',
         header: 'Sent',
         cell: (recipient) => (
            <span className="text-muted-foreground">{formatDateTime(recipient.sentAt)}</span>
         ),
      },
      {
         id: 'opened',
         header: 'Opened',
         cell: (recipient) => (
            <span className="text-muted-foreground">{formatDateTime(recipient.openedAt)}</span>
         ),
      },
      {
         id: 'clicked',
         header: 'Clicked',
         cell: (recipient) => (
            <span className="text-muted-foreground">{formatDateTime(recipient.clickedAt)}</span>
         ),
      },
   ];

   return (
      <section className="grid gap-3">
         <div className="flex flex-wrap items-end justify-between gap-2">
            <h2 className="font-heading text-lg font-semibold tracking-tight">Recipients</h2>
            {state.items.length > 0 && (
               <p className="text-xs text-muted-foreground">
                  Showing {formatNumber(state.items.length)}
               </p>
            )}
         </div>

         <DataTable
            caption="Campaign recipients"
            columns={columns}
            rows={state.items}
            rowKey={(recipient) => recipient.id}
            loading={loading}
            error={error}
            onRetry={() => setReloadKey((key) => key + 1)}
            empty={{
               title: 'No recipients yet',
               description: 'Recipients appear here once dispatch starts.',
               icon: <Users aria-hidden="true" />,
            }}
         />

         {moreError !== null && (
            <Alert variant="destructive">
               <AlertDescription>{moreError}</AlertDescription>
            </Alert>
         )}

         {!loading && error === null && state.items.length > 0 && (
            <div className="flex flex-col items-center gap-2">
               <p className="text-xs text-muted-foreground">
                  {pluralise(state.items.length, 'recipient')} loaded
               </p>
               {state.hasMore && (
                  <Button
                     variant="outline"
                     disabled={loadingMore}
                     onClick={() => void loadMore()}
                  >
                     {loadingMore ? 'Loading…' : 'Load more'}
                  </Button>
               )}
            </div>
         )}
      </section>
   );
}
