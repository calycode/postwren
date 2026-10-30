import { Alert, AlertDescription, AlertTitle, Button, Skeleton } from '@postwren/ui';
import { formatNumber } from '@/lib/format';
import type { CampaignStatsView } from './model';

export type CampaignStatsProps = {
   stats: CampaignStatsView | null;
   loading: boolean;
   error: string | null;
   onRetry: () => void;
};

type Stat = { label: string; value: string };

function percent(value: number): string {
   return `${(value * 100).toFixed(1)}%`;
}

function statList(stats: CampaignStatsView): Stat[] {
   return [
      { label: 'Audience size', value: formatNumber(stats.audienceSize) },
      { label: 'Queued', value: formatNumber(stats.queued) },
      { label: 'Sent', value: formatNumber(stats.sent) },
      { label: 'Failed', value: formatNumber(stats.failed) },
      { label: 'Suppressed', value: formatNumber(stats.suppressed) },
      { label: 'Opens (approx.)', value: formatNumber(stats.uniqueOpens) },
      { label: 'Unique clicks', value: formatNumber(stats.uniqueClicks) },
      { label: 'CTR', value: percent(stats.clickThroughRate) },
      { label: 'Unsubscribes', value: formatNumber(stats.unsubscribed) },
   ];
}

export function CampaignStats({ stats, loading, error, onRetry }: CampaignStatsProps) {
   return (
      <section className="grid gap-3">
         <h2 className="font-heading text-lg font-semibold tracking-tight">Stats</h2>

         {error !== null ? (
            <Alert variant="destructive">
               <AlertTitle>Could not load stats</AlertTitle>
               <AlertDescription>
                  <p>{error}</p>
                  <Button
                     variant="outline"
                     size="sm"
                     className="mt-3"
                     onClick={onRetry}
                  >
                     Try again
                  </Button>
               </AlertDescription>
            </Alert>
         ) : loading && stats === null ? (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
               {Array.from({ length: 9 }, (_, index) => (
                  <div
                     key={index}
                     className="grid gap-2 rounded-lg border border-border p-3"
                  >
                     <Skeleton className="h-3 w-16" />
                     <Skeleton className="h-6 w-12" />
                  </div>
               ))}
            </div>
         ) : stats !== null ? (
            <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
               {statList(stats).map((stat) => (
                  <div
                     key={stat.label}
                     className="grid gap-1 rounded-lg border border-border p-3"
                  >
                     <dt className="text-xs font-medium text-muted-foreground">{stat.label}</dt>
                     <dd className="font-heading text-xl font-semibold tracking-tight">
                        {stat.value}
                     </dd>
                  </div>
               ))}
            </dl>
         ) : null}
      </section>
   );
}
