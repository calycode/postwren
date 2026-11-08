import { useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import type { ComponentChildren } from 'preact';
import {
   ArrowRight,
   Check,
   FileText,
   MailOpen,
   MousePointerClick,
   MoveDiagonal2,
   Send,
   SlidersHorizontal,
   Upload,
} from 'lucide-react';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Badge,
   Button,
   Card,
   CardContent,
   CardDescription,
   CardHeader,
   CardTitle,
   Dialog,
   DialogClose,
   DialogContent,
   DialogDescription,
   DialogFooter,
   DialogHeader,
   DialogTitle,
   Skeleton,
   buttonVariants,
   cn,
} from '@postwren/ui';
import { PageHeader } from '@/components/page-header';
import { get as getDashboard } from '@/lib/api/dashboard';
import type { Dashboard, DashboardCampaign } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import {
   formatDate,
   formatDateTime,
   formatNumber,
   pluralise,
   relativeTime,
   titleCase,
} from '@/lib/format';
import { campaignStatusVariant } from '@/components/campaigns/status';

const HOME_LAYOUT_KEY = 'postwren-home-layout';
const HOME_COLUMNS = 4;

type WidgetId = 'health' | 'growth' | 'recent' | 'next' | 'automations';
type WidgetSize = { w: number; h: number; hidden: boolean };
type HomeLayout = Record<WidgetId, WidgetSize>;

const WIDGETS: readonly {
   id: WidgetId;
   label: string;
   description: string;
   defaultSize: WidgetSize;
}[] = [
   {
      id: 'health',
      label: 'List health',
      description: 'Subscriber count and 30-day engagement.',
      defaultSize: { w: 2, h: 4, hidden: false },
   },
   {
      id: 'growth',
      label: 'List growth',
      description: '12-week subscriber trend and list status.',
      defaultSize: { w: 2, h: 5, hidden: false },
   },
   {
      id: 'recent',
      label: 'Recent sends',
      description: 'The last campaigns and how they performed.',
      defaultSize: { w: 2, h: 5, hidden: false },
   },
   {
      id: 'automations',
      label: 'Automation runs',
      description: 'What your automations did in the last 7 days.',
      defaultSize: { w: 2, h: 4, hidden: false },
   },
   {
      id: 'next',
      label: 'Next actions',
      description: 'Shortcuts to the next useful move.',
      defaultSize: { w: 2, h: 5, hidden: false },
   },
];

const DEFAULT_LAYOUT: HomeLayout = Object.fromEntries(
   WIDGETS.map((widget) => [widget.id, widget.defaultSize]),
) as HomeLayout;

function clampSize(size: WidgetSize): WidgetSize {
   return {
      w: Math.max(1, Math.min(HOME_COLUMNS, Math.round(size.w))),
      h: Math.max(2, Math.min(9, Math.round(size.h))),
      hidden: size.hidden === true,
   };
}

function readLayout(): HomeLayout {
   try {
      const raw = window.localStorage.getItem(HOME_LAYOUT_KEY);
      if (raw === null) return DEFAULT_LAYOUT;
      const parsed = JSON.parse(raw) as Record<string, Partial<WidgetSize> | undefined>;
      const next = { ...DEFAULT_LAYOUT };
      for (const { id } of WIDGETS) {
         const value = parsed[id];
         if (value === undefined || typeof value !== 'object') continue;
         next[id] = clampSize({
            w: value.w ?? DEFAULT_LAYOUT[id].w,
            h: value.h ?? DEFAULT_LAYOUT[id].h,
            hidden: value.hidden === true,
         });
      }
      return next;
   } catch {
      return DEFAULT_LAYOUT;
   }
}

function percent(value: number | null): string {
   return value === null ? '—' : `${(value * 100).toFixed(1)}%`;
}

function SetupChecklist({ dashboard }: { dashboard: Dashboard }) {
   const items = [
      {
         label: 'Verify a sending address',
         detail: 'Campaigns can only send from an address you have verified.',
         href: '/settings',
         done: dashboard.setup.verifiedSender,
      },
      {
         label: 'Create a template',
         detail: 'Build the email once, then reuse it across campaigns.',
         href: '/templates',
         done: dashboard.setup.template,
      },
      {
         label: 'Send your first campaign',
         detail: 'Pick an audience and send a test before the real one.',
         href: '/campaigns',
         done: dashboard.setup.sentCampaign,
      },
   ];

   if (items.every((item) => item.done)) return null;

   return (
      <Card className="border-ochre/45 bg-accent/40">
         <CardHeader>
            <CardTitle>Finish setting up</CardTitle>
            <CardDescription>
               Three steps between this workspace and its first send.
            </CardDescription>
         </CardHeader>
         <CardContent>
            <ol className="grid gap-1">
               {items.map((item, index) => (
                  <li key={item.label}>
                     <a
                        href={item.href}
                        className="flex items-start gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-background/60 focus-visible:ring-2 focus-visible:ring-ring"
                     >
                        <span
                           aria-hidden="true"
                           className={cn(
                              'mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold',
                              item.done
                                 ? 'bg-success text-success-foreground'
                                 : 'border border-border bg-card text-muted-foreground',
                           )}
                        >
                           {item.done ? <Check className="size-3.5" /> : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                           <span
                              className={cn(
                                 'block text-sm font-medium',
                                 item.done && 'text-muted-foreground line-through',
                              )}
                           >
                              {item.label}
                           </span>
                           {!item.done && (
                              <span className="block text-xs text-muted-foreground">
                                 {item.detail}
                              </span>
                           )}
                        </span>
                        {!item.done && (
                           <ArrowRight
                              className="mt-1 size-4 shrink-0 text-muted-foreground"
                              aria-hidden="true"
                           />
                        )}
                     </a>
                  </li>
               ))}
            </ol>
         </CardContent>
      </Card>
   );
}

function GrowthChart({ dashboard }: { dashboard: Dashboard }) {
   const max = Math.max(1, ...dashboard.growth.map((week) => week.count));
   const total = dashboard.growth.reduce((sum, week) => sum + week.count, 0);
   const first = dashboard.growth[0];
   const last = dashboard.growth[dashboard.growth.length - 1];

   return (
      <Card className="flex h-full flex-col">
         <CardHeader>
            <CardTitle>List growth</CardTitle>
            <CardDescription>
               {formatNumber(total)} subscribers added in the last 12 weeks.
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <figure className="grid gap-3">
               <div
                  className="flex h-36 items-end gap-1.5"
                  role="img"
                  aria-label={`Subscribers added per week for the last 12 weeks. Total ${total}.`}
               >
                  {dashboard.growth.map((week) => {
                     const height = week.count === 0 ? 2 : Math.max(6, (week.count / max) * 100);
                     return (
                        <div
                           key={week.weekStart}
                           className="flex h-full min-w-0 flex-1 items-end"
                           title={`Week of ${formatDate(week.weekStart)}: ${formatNumber(week.count)}`}
                        >
                           <span
                              className={cn(
                                 'w-full rounded-sm',
                                 week.count === 0 ? 'bg-border' : 'bg-primary',
                              )}
                              style={{ height: `${height}%` }}
                           />
                        </div>
                     );
                  })}
               </div>
               <figcaption className="flex items-center justify-between text-[11px] text-muted-foreground">
                  <span>{first === undefined ? '' : formatDate(first.weekStart)}</span>
                  <span>This week</span>
                  <span>{last === undefined ? '' : formatDate(last.weekStart)}</span>
               </figcaption>
            </figure>
            <div className="grid grid-cols-3 gap-3 border-t border-border pt-4 text-sm">
               <div>
                  <p className="text-xs text-muted-foreground">Active</p>
                  <p className="font-medium">{formatNumber(dashboard.counts.activeSubscribers)}</p>
               </div>
               <div>
                  <p className="text-xs text-muted-foreground">Unsubscribed</p>
                  <p className="font-medium">{formatNumber(dashboard.counts.unsubscribed)}</p>
               </div>
               <div>
                  <p className="text-xs text-muted-foreground">Scheduled</p>
                  <p className="font-medium">{formatNumber(dashboard.counts.scheduled)}</p>
               </div>
            </div>
         </CardContent>
      </Card>
   );
}

function CampaignRow({ campaign }: { campaign: DashboardCampaign }) {
   const when = campaign.completedAt ?? campaign.scheduledAt ?? campaign.updatedAt;

   return (
      <a
         href={`/campaigns/${campaign.id}`}
         className="flex items-center gap-3 rounded-lg px-2 py-2.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
         <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{campaign.name}</span>
            <span className="block truncate text-xs text-muted-foreground">
               {campaign.audienceCount === null
                  ? campaign.subject
                  : pluralise(campaign.audienceCount, 'recipient')}
            </span>
         </span>
         <Badge variant={campaignStatusVariant(campaign.status)}>
            {titleCase(campaign.status)}
         </Badge>
         <span
            className="hidden w-24 shrink-0 text-right text-xs text-muted-foreground sm:block"
            title={formatDateTime(when)}
         >
            {relativeTime(when)}
         </span>
      </a>
   );
}

function RecentCampaigns({ dashboard }: { dashboard: Dashboard }) {
   return (
      <Card className="flex h-full flex-col">
         <CardHeader>
            <CardTitle>Recent sends</CardTitle>
            <CardDescription>Open a campaign to see its links and recipients.</CardDescription>
         </CardHeader>
         <CardContent className="flex-1">
            {dashboard.recent.length === 0 ? (
               <div className="grid gap-3 rounded-lg border border-dashed border-border px-4 py-6">
                  <p className="text-sm text-muted-foreground">
                     No campaigns yet. Create one when your list and template are ready.
                  </p>
                  <a
                     href="/campaigns"
                     className={`${buttonVariants({ size: 'sm' })} w-fit`}
                  >
                     <Send aria-hidden="true" />
                     Create a campaign
                  </a>
               </div>
            ) : (
               <div className="grid gap-0.5">
                  {dashboard.recent.map((campaign) => (
                     <CampaignRow
                        key={campaign.id}
                        campaign={campaign}
                     />
                  ))}
               </div>
            )}
         </CardContent>
      </Card>
   );
}

function NextActions({ dashboard }: { dashboard: Dashboard }) {
   return (
      <Card className="flex h-full flex-col">
         <CardHeader>
            <CardTitle>Next</CardTitle>
            <CardDescription>
               {dashboard.upcoming.length > 0
                  ? 'Scheduled sends, and a few ways to keep the list moving.'
                  : 'A few ways to keep the list moving.'}
            </CardDescription>
         </CardHeader>
         <CardContent className="grid flex-1 content-start gap-3">
            {dashboard.upcoming.length > 0 && (
               <div className="grid gap-1 border-b border-border pb-3">
                  {dashboard.upcoming.map((campaign) => (
                     <a
                        key={campaign.id}
                        href={`/campaigns/${campaign.id}`}
                        className="flex items-center gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                     >
                        <span className="min-w-0 flex-1">
                           <span className="block truncate text-sm font-medium">
                              {campaign.name}
                           </span>
                           <span className="block text-xs text-muted-foreground">
                              {campaign.scheduledAt === null
                                 ? 'No send time'
                                 : formatDateTime(campaign.scheduledAt)}
                           </span>
                        </span>
                        <Badge variant="outline">Scheduled</Badge>
                     </a>
                  ))}
               </div>
            )}

            <a
               href="/campaigns"
               className="flex items-start gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
               <Send
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
               />
               <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Create a campaign</span>
                  <span className="block text-xs text-muted-foreground">
                     Pin a template and choose an audience.
                  </span>
               </span>
            </a>
            <a
               href="/templates"
               className="flex items-start gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
               <FileText
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
               />
               <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Start from a template</span>
                  <span className="block text-xs text-muted-foreground">
                     Newsletter, launch, welcome or plain update.
                  </span>
               </span>
            </a>
            <a
               href="/subscribers"
               className="flex items-start gap-3 rounded-lg px-2 py-2 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
            >
               <Upload
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
               />
               <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">Bring in your list</span>
                  <span className="block text-xs text-muted-foreground">
                     Import a CSV or use a public subscribe key.
                  </span>
               </span>
            </a>
         </CardContent>
      </Card>
   );
}

function AutomationRunsWidget({ dashboard }: { dashboard: Dashboard }) {
   const data = dashboard.automations;

   return (
      <Card className="flex h-full flex-col">
         <CardHeader>
            <CardTitle>Automation runs</CardTitle>
            <CardDescription>
               Activity over the last {data.windowDays} days. {data.activeAutomations}{' '}
               {data.activeAutomations === 1 ? 'automation' : 'automations'} active.
            </CardDescription>
         </CardHeader>
         <CardContent className="grid gap-4">
            <dl className="grid grid-cols-3 gap-3">
               <div className="grid gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">Running now</dt>
                  <dd className="text-lg font-medium">{formatNumber(data.activeRuns)}</dd>
               </div>
               <div className="grid gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">Entered</dt>
                  <dd className="text-lg font-medium">{formatNumber(data.runs7d)}</dd>
               </div>
               <div className="grid gap-0.5">
                  <dt className="text-[11px] text-muted-foreground">Sent</dt>
                  <dd className="text-lg font-medium">{formatNumber(data.sent7d)}</dd>
               </div>
            </dl>

            {data.recent.length === 0 ? (
               <p className="text-sm text-muted-foreground">
                  No runs yet. Turn on an automation to start one.
               </p>
            ) : (
               <ul className="grid gap-1 border-t border-border pt-3">
                  {data.recent.map((run) => (
                     <li key={run.id}>
                        <a
                           href={`/automations/${encodeURIComponent(run.automationId)}`}
                           className="flex items-start justify-between gap-3 rounded-lg px-1.5 py-1.5 outline-none transition-colors hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring"
                        >
                           <span className="min-w-0">
                              <span className="block truncate text-sm font-medium">
                                 {run.automationName}
                              </span>
                              <span className="block truncate text-xs text-muted-foreground">
                                 {run.email}
                              </span>
                           </span>
                           <span className="shrink-0 text-right">
                              <Badge variant="outline">{titleCase(run.status)}</Badge>
                              <span className="mt-0.5 block text-[11px] text-muted-foreground">
                                 {relativeTime(run.enteredAt)}
                              </span>
                           </span>
                        </a>
                     </li>
                  ))}
               </ul>
            )}
         </CardContent>
      </Card>
   );
}

function WidgetFrame({
   id,
   label,
   size,
   resizing,
   onResizeStart,
   children,
}: {
   id: WidgetId;
   label: string;
   size: WidgetSize;
   resizing: boolean;
   onResizeStart: (id: WidgetId, event: PointerEvent) => void;
   children: ComponentChildren;
}) {
   const style = {
      '--widget-w': String(size.w),
      '--widget-h': String(size.h),
   } as unknown as CSSProperties;

   return (
      <div
         style={style}
         className={cn(
            'relative min-w-0 md:[grid-column:span_var(--widget-w)] md:[grid-row:span_var(--widget-h)]',
            resizing && 'z-10',
         )}
      >
         <div className="h-full min-h-0">{children}</div>
         <button
            type="button"
            aria-label={`Resize ${label}`}
            title="Drag to resize"
            onPointerDown={(event) => onResizeStart(id, event)}
            className="absolute right-1.5 bottom-1.5 hidden size-6 cursor-nwse-resize items-center justify-center rounded-md text-muted-foreground/70 outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:inline-flex"
         >
            <MoveDiagonal2
               className="size-3.5"
               aria-hidden="true"
            />
         </button>
      </div>
   );
}

function HomeSkeleton() {
   return (
      <div className="grid gap-6">
         <div className="grid gap-2">
            <Skeleton className="h-9 w-40" />
            <Skeleton className="h-4 w-80" />
         </div>
         <div className="grid gap-6 lg:grid-cols-[1.15fr_1fr]">
            <Skeleton className="h-48 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
         </div>
         <div className="grid gap-6 lg:grid-cols-2">
            <Skeleton className="h-64 rounded-xl" />
            <Skeleton className="h-64 rounded-xl" />
         </div>
      </div>
   );
}

export function Home() {
   const [dashboard, setDashboard] = useState<Dashboard | null>(null);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   const [layout, setLayout] = useState<HomeLayout>(readLayout);
   const [customizeOpen, setCustomizeOpen] = useState(false);
   const [resizingId, setResizingId] = useState<WidgetId | null>(null);
   const gridRef = useRef<HTMLDivElement>(null);

   function startResize(id: WidgetId, event: PointerEvent) {
      event.preventDefault();
      const grid = gridRef.current;
      if (grid === null || window.matchMedia('(max-width: 767px)').matches) return;

      const columns = window.getComputedStyle(grid).gridTemplateColumns.split(' ').length;
      const gap = Number.parseFloat(window.getComputedStyle(grid).columnGap) || 16;
      const width = grid.getBoundingClientRect().width;
      const columnWidth = (width - gap * (columns - 1)) / Math.max(1, columns);
      const rowHeight = 72;
      const start = layout[id];
      const startX = event.clientX;
      const startY = event.clientY;

      setResizingId(id);
      document.body.classList.add('select-none');

      const move = (moveEvent: PointerEvent) => {
         const dw = Math.round((moveEvent.clientX - startX) / (columnWidth + gap));
         const dh = Math.round((moveEvent.clientY - startY) / (rowHeight + gap));
         setLayout((current) => ({
            ...current,
            [id]: clampSize({
               ...current[id],
               w: Math.min(start.w + dw, columns),
               h: start.h + dh,
            }),
         }));
      };

      const stop = () => {
         window.removeEventListener('pointermove', move);
         window.removeEventListener('pointerup', stop);
         window.removeEventListener('pointercancel', stop);
         document.body.classList.remove('select-none');
         setResizingId(null);
      };

      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', stop);
      window.addEventListener('pointercancel', stop);
   }

   useEffect(() => {
      try {
         window.localStorage.setItem(HOME_LAYOUT_KEY, JSON.stringify(layout));
      } catch {
         // Preferences are optional; the dashboard still works without storage.
      }
   }, [layout]);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);

      getDashboard()
         .then((result) => {
            if (!cancelled) setDashboard(result);
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load the dashboard'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [reloadKey]);

   if (loading && dashboard === null) {
      return <HomeSkeleton />;
   }

   return (
      <div className="grid gap-6">
         <PageHeader
            title="Home"
            description="What your list is doing, and where the next send stands."
            actions={
               <>
                  <Button
                     variant="outline"
                     onClick={() => setCustomizeOpen(true)}
                  >
                     <SlidersHorizontal aria-hidden="true" />
                     Customize
                  </Button>
                  <a
                     href="/campaigns?new=1"
                     className={buttonVariants()}
                  >
                     <Send aria-hidden="true" />
                     New campaign
                  </a>
               </>
            }
         />

         {error !== null && (
            <Alert variant="destructive">
               <AlertTitle>Could not load the dashboard</AlertTitle>
               <AlertDescription>
                  <p>{error}</p>
                  <Button
                     variant="outline"
                     size="sm"
                     className="mt-3"
                     onClick={() => setReloadKey((key) => key + 1)}
                  >
                     Try again
                  </Button>
               </AlertDescription>
            </Alert>
         )}

         {dashboard !== null && (
            <>
               <SetupChecklist dashboard={dashboard} />

               <div
                  ref={gridRef}
                  className="grid grid-cols-1 gap-4 md:grid-cols-2 md:auto-rows-[minmax(4.5rem,auto)] xl:grid-cols-4"
                  style={{ gridAutoFlow: 'row dense' }}
               >
                  {!layout.health.hidden && (
                     <WidgetFrame
                        id="health"
                        label="List health"
                        size={layout.health}
                        resizing={resizingId === 'health'}
                        onResizeStart={startResize}
                     >
                        <Card className="flex h-full flex-col">
                           <CardHeader>
                              <CardTitle>List health</CardTitle>
                              <CardDescription>
                                 {dashboard.engagement.sent === 0
                                    ? `Engagement over the last ${dashboard.engagement.windowDays} days will appear after your first send.`
                                    : `Engagement over the last ${dashboard.engagement.windowDays} days.`}
                              </CardDescription>
                           </CardHeader>
                           <CardContent className="grid flex-1 gap-5">
                              <div className="flex items-end justify-between gap-4">
                                 <div>
                                    <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                                       Active subscribers
                                    </p>
                                    <p className="font-display text-4xl leading-none font-medium tracking-tight">
                                       {formatNumber(dashboard.counts.activeSubscribers)}
                                    </p>
                                 </div>
                                 <p className="pb-1 text-xs text-muted-foreground">
                                    {formatNumber(dashboard.counts.totalSubscribers)} total
                                 </p>
                              </div>

                              <dl className="grid grid-cols-3 gap-3 border-t border-border pt-4">
                                 <div className="grid gap-0.5">
                                    <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                       <Send
                                          className="size-3.5"
                                          aria-hidden="true"
                                       />
                                       Sent
                                    </dt>
                                    <dd className="text-lg font-medium">
                                       {formatNumber(dashboard.engagement.sent)}
                                    </dd>
                                 </div>
                                 <div className="grid gap-0.5">
                                    <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                       <MailOpen
                                          className="size-3.5"
                                          aria-hidden="true"
                                       />
                                       Opened
                                    </dt>
                                    <dd className="text-lg font-medium">
                                       {percent(dashboard.engagement.openRate)}
                                    </dd>
                                 </div>
                                 <div className="grid gap-0.5">
                                    <dt className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                                       <MousePointerClick
                                          className="size-3.5"
                                          aria-hidden="true"
                                       />
                                       Clicked
                                    </dt>
                                    <dd className="text-lg font-medium">
                                       {percent(dashboard.engagement.clickRate)}
                                    </dd>
                                 </div>
                              </dl>

                              <p className="text-xs text-muted-foreground">
                                 Opens are approximate. Clicks are the reliable signal.
                              </p>
                           </CardContent>
                        </Card>
                     </WidgetFrame>
                  )}

                  {!layout.growth.hidden && (
                     <WidgetFrame
                        id="growth"
                        label="List growth"
                        size={layout.growth}
                        resizing={resizingId === 'growth'}
                        onResizeStart={startResize}
                     >
                        <GrowthChart dashboard={dashboard} />
                     </WidgetFrame>
                  )}

                  {!layout.recent.hidden && (
                     <WidgetFrame
                        id="recent"
                        label="Recent sends"
                        size={layout.recent}
                        resizing={resizingId === 'recent'}
                        onResizeStart={startResize}
                     >
                        <RecentCampaigns dashboard={dashboard} />
                     </WidgetFrame>
                  )}

                  {!layout.automations.hidden && (
                     <WidgetFrame
                        id="automations"
                        label="Automation runs"
                        size={layout.automations}
                        resizing={resizingId === 'automations'}
                        onResizeStart={startResize}
                     >
                        <AutomationRunsWidget dashboard={dashboard} />
                     </WidgetFrame>
                  )}

                  {!layout.next.hidden && (
                     <WidgetFrame
                        id="next"
                        label="Next actions"
                        size={layout.next}
                        resizing={resizingId === 'next'}
                        onResizeStart={startResize}
                     >
                        <NextActions dashboard={dashboard} />
                     </WidgetFrame>
                  )}
               </div>

               {Object.values(layout).every((value) => value.hidden) && (
                  <Card>
                     <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-6">
                        <p className="text-sm text-muted-foreground">
                           Every widget is hidden. Bring the dashboard back from Home layout.
                        </p>
                        <Button
                           variant="outline"
                           onClick={() => setCustomizeOpen(true)}
                        >
                           <SlidersHorizontal aria-hidden="true" />
                           Home layout
                        </Button>
                     </CardContent>
                  </Card>
               )}
            </>
         )}

         <Dialog
            open={customizeOpen}
            onOpenChange={setCustomizeOpen}
         >
            <DialogContent>
               <DialogHeader>
                  <DialogTitle>Home layout</DialogTitle>
                  <DialogDescription>
                     Choose which widgets appear on Home. Drag a widget&apos;s bottom-right corner
                     to resize it. This only affects this browser.
                  </DialogDescription>
               </DialogHeader>

               <ul className="grid gap-2">
                  {WIDGETS.map((widget) => {
                     const size = layout[widget.id];
                     return (
                        <li
                           key={widget.id}
                           className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border px-3 py-2"
                        >
                           <span className="min-w-0">
                              <span className="block text-sm font-medium">{widget.label}</span>
                              <span className="block text-xs text-muted-foreground">
                                 {widget.description}
                              </span>
                           </span>
                           <label className="inline-flex shrink-0 items-center gap-2 text-xs">
                              <input
                                 type="checkbox"
                                 className="size-4 accent-primary"
                                 checked={!size.hidden}
                                 onChange={(event) =>
                                    setLayout((current) => ({
                                       ...current,
                                       [widget.id]: {
                                          ...current[widget.id],
                                          hidden: !event.currentTarget.checked,
                                       },
                                    }))
                                 }
                              />
                              Show
                           </label>
                        </li>
                     );
                  })}
               </ul>

               <DialogFooter>
                  <Button
                     variant="outline"
                     onClick={() => setLayout(DEFAULT_LAYOUT)}
                  >
                     Reset sizes
                  </Button>
                  <DialogClose>Done</DialogClose>
               </DialogFooter>
            </DialogContent>
         </Dialog>
      </div>
   );
}
