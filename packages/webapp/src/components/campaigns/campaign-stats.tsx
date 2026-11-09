import { Info, MousePointerClick, TriangleAlert } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Button,
   Card,
   CardContent,
   Skeleton,
   Tooltip,
} from '@postwren/ui';
import { formatDateTime, formatNumber, pluralise, relativeTime } from '@/lib/format';
import type { CampaignStatsView } from './model';

export type CampaignStatsProps = {
   stats: CampaignStatsView | null;
   loading: boolean;
   error: string | null;
   onRetry: () => void;
};

function percent(numerator: number, denominator: number): string {
   if (denominator <= 0) return '—';
   return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function shortUrl(value: string): string {
   try {
      const url = new URL(value);
      const path = `${url.pathname}${url.search}`;
      return `${url.host}${path === '/' ? '' : path}`;
   } catch {
      return value;
   }
}

function MetricGroup({
   title,
   primary,
   caption,
   rows,
   accent = false,
}: {
   title: string;
   primary: string;
   caption: string;
   rows: { label: string; value: string; hint?: string }[];
   accent?: boolean;
}) {
   return (
      <div className="grid content-start gap-3 p-5 md:border-l md:border-border md:first:border-l-0">
         <p className="text-[11px] font-semibold tracking-[0.1em] text-muted-foreground uppercase">
            {title}
         </p>
         <p
            className={
               accent
                  ? 'font-display text-4xl leading-none font-medium tracking-tight text-ochre'
                  : 'font-display text-4xl leading-none font-medium tracking-tight'
            }
         >
            {primary}
         </p>
         <p className="text-xs text-muted-foreground">{caption}</p>
         <dl className="mt-1 grid gap-1.5 border-t border-border pt-3 text-xs">
            {rows.map((row) => (
               <div
                  key={row.label}
                  className="flex items-center justify-between gap-3"
               >
                  <dt className="flex min-w-0 items-center gap-1 text-muted-foreground">
                     {row.label}
                     {row.hint !== undefined && (
                        <Tooltip
                           className="rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring"
                           content={row.hint}
                           tabIndex={0}
                           aria-label={row.hint}
                        >
                           <Info
                              className="size-3.5 shrink-0"
                              aria-hidden="true"
                           />
                        </Tooltip>
                     )}
                  </dt>
                  <dd className="font-medium">{row.value}</dd>
               </div>
            ))}
         </dl>
      </div>
   );
}

export function CampaignStats({ stats, loading, error, onRetry }: CampaignStatsProps) {
   return (
      <section
         aria-label="Campaign results"
         className="grid gap-3"
      >
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
            <Skeleton className="h-56 w-full rounded-xl" />
         ) : stats !== null ? (
            <div className="grid gap-4">
               <Card className="py-0">
                  <CardContent className="grid p-0 md:grid-cols-3">
                     <MetricGroup
                        title="Deliverability"
                        primary={percent(stats.delivered, stats.audienceSize)}
                        caption="of the audience reached"
                        rows={[
                           { label: 'Sent', value: formatNumber(stats.sent) },
                           { label: 'Bounced', value: formatNumber(stats.bounced) },
                           { label: 'Failed', value: formatNumber(stats.failed) },
                           { label: 'Queued', value: formatNumber(stats.queued) },
                        ]}
                     />
                     <MetricGroup
                        title="Engagement"
                        primary={percent(stats.uniqueClicks, stats.audienceSize)}
                        caption="unique click rate"
                        accent
                        rows={[
                           {
                              label: 'Open rate',
                              value: percent(stats.uniqueOpens, stats.audienceSize),
                              hint: 'Opens are approximate. Clicks are the reliable signal.',
                           },
                           { label: 'Opens', value: formatNumber(stats.uniqueOpens) },
                           { label: 'Unique clicks', value: formatNumber(stats.uniqueClicks) },
                           { label: 'Audience', value: formatNumber(stats.audienceSize) },
                        ]}
                     />
                     <MetricGroup
                        title="Opt-out"
                        primary={formatNumber(stats.unsubscribed)}
                        caption="unsubscribed after this send"
                        rows={[
                           { label: 'Complaints', value: formatNumber(stats.complained) },
                           { label: 'Suppressed', value: formatNumber(stats.suppressed) },
                           {
                              label: 'Total recipients',
                              value: formatNumber(stats.sent + stats.queued),
                           },
                        ]}
                     />
                  </CardContent>
               </Card>

               {stats.sent === 0 && stats.queued === 0 && (
                  <Alert>
                     <AlertDescription>
                        No recipients have been dispatched yet. Results appear as the queue sends.
                     </AlertDescription>
                  </Alert>
               )}

               <div className="grid gap-4 lg:grid-cols-2">
                  <Card>
                     <CardContent className="grid min-w-0 gap-3 pt-6">
                        <div className="flex items-center justify-between gap-2">
                           <h3 className="text-sm font-semibold">Top links</h3>
                           <span className="text-xs text-muted-foreground">
                              {stats.topLinks.length === 0
                                 ? 'No clicks'
                                 : pluralise(stats.topLinks.length, 'link')}
                           </span>
                        </div>
                        {stats.topLinks.length === 0 ? (
                           <p className="text-sm text-muted-foreground">
                              Link clicks will appear here after the first click.
                           </p>
                        ) : (
                           <ol className="grid min-w-0 gap-3">
                              {stats.topLinks.map((link) => {
                                 const max = Math.max(...stats.topLinks.map((item) => item.clicks));
                                 const width = max > 0 ? (link.clicks / max) * 100 : 0;
                                 return (
                                    <li
                                       key={link.url}
                                       className="grid min-w-0 gap-1"
                                    >
                                       <div className="flex min-w-0 items-baseline justify-between gap-3">
                                          <span
                                             className="line-clamp-2 min-w-0 text-sm break-all"
                                             title={link.url}
                                          >
                                             {shortUrl(link.url)}
                                          </span>
                                          <span className="shrink-0 text-xs text-muted-foreground">
                                             {pluralise(link.clicks, 'click')}
                                          </span>
                                       </div>
                                       <div
                                          className="h-1.5 overflow-hidden rounded-full bg-muted"
                                          aria-hidden="true"
                                       >
                                          <div
                                             className="h-full rounded-full bg-primary"
                                             style={{ width: `${width}%` }}
                                          />
                                       </div>
                                       <p className="text-[11px] text-muted-foreground">
                                          {pluralise(link.clickers, 'unique clicker')} · last{' '}
                                          {relativeTime(link.lastClickedAt)}
                                       </p>
                                    </li>
                                 );
                              })}
                           </ol>
                        )}
                     </CardContent>
                  </Card>

                  <Card>
                     <CardContent className="grid min-w-0 gap-3 pt-6">
                        <div className="flex items-center justify-between gap-2">
                           <h3 className="text-sm font-semibold">Recent clicks</h3>
                           <MousePointerClick
                              className="size-4 text-muted-foreground"
                              aria-hidden="true"
                           />
                        </div>
                        {stats.recentClicks.length === 0 ? (
                           <p className="text-sm text-muted-foreground">
                              Individual clicks are listed here as they happen.
                           </p>
                        ) : (
                           <ul className="grid min-w-0 gap-2">
                              {stats.recentClicks.map((click, index) => (
                                 <li
                                    key={`${click.email ?? 'unknown'}-${click.clickedAt}-${index}`}
                                    className="flex min-w-0 items-baseline justify-between gap-3 border-b border-border pb-2 text-sm last:border-0 last:pb-0"
                                 >
                                    <span className="min-w-0 flex-1">
                                       <span className="block truncate font-medium">
                                          {click.email ?? 'Unknown subscriber'}
                                       </span>
                                       <span
                                          className="line-clamp-2 text-xs break-all text-muted-foreground"
                                          title={click.url}
                                       >
                                          {shortUrl(click.url)}
                                       </span>
                                    </span>
                                    <span
                                       className="shrink-0 text-xs text-muted-foreground"
                                       title={formatDateTime(click.clickedAt)}
                                    >
                                       {relativeTime(click.clickedAt)}
                                    </span>
                                 </li>
                              ))}
                           </ul>
                        )}
                     </CardContent>
                  </Card>
               </div>
            </div>
         ) : (
            <Alert variant="warning">
               <TriangleAlert aria-hidden="true" />
               <AlertDescription>Stats are unavailable for this campaign.</AlertDescription>
            </Alert>
         )}
      </section>
   );
}
