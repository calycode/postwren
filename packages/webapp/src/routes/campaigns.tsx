import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'preact-iso';
import { Plus, Search, Send } from 'lucide-react';
import {
   Alert,
   AlertDescription,
   AlertTitle,
   Badge,
   Button,
   EmptyState,
   Input,
   Select,
   SelectContent,
   SelectItem,
   SelectTrigger,
   Skeleton,
   Table,
   TableBody,
   TableCell,
   TableHead,
   TableHeader,
   TableRow,
} from '@postwren/ui';
import { PageHeader } from '@/components/page-header';
import { list as listCampaigns } from '@/lib/api/campaigns';
import type { CampaignStatus } from '@/lib/api/types';
import { errorMessage } from '@/lib/form-errors';
import { formatDate, formatDateTime, formatNumber, relativeTime, titleCase } from '@/lib/format';
import { useDebouncedValue } from '@/lib/hooks';
import {
   CAMPAIGN_STATUSES,
   campaignStatusVariant,
   isCampaignStatus,
} from '@/components/campaigns/status';
import type { CampaignView } from '@/components/campaigns/model';
import { toCampaignView } from '@/components/campaigns/model';
import { NewCampaignDialog } from '@/components/campaigns/new-campaign-dialog';

type StatusFilter = 'all' | CampaignStatus;

function sentTotal(campaign: CampaignView): string {
   if (campaign.sentCount !== null && campaign.recipientCount !== null) {
      return `${formatNumber(campaign.sentCount)} / ${formatNumber(campaign.recipientCount)}`;
   }
   if (campaign.recipientCount !== null) {
      return `— / ${formatNumber(campaign.recipientCount)}`;
   }
   return '—';
}

export function Campaigns() {
   const { route, query } = useLocation();
   const [campaigns, setCampaigns] = useState<CampaignView[]>([]);
   const [loading, setLoading] = useState(true);
   const [error, setError] = useState<string | null>(null);
   const [reloadKey, setReloadKey] = useState(0);
   const [search, setSearch] = useState('');
   const debouncedSearch = useDebouncedValue(search, 250);
   const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
   const [createOpen, setCreateOpen] = useState(query.new === '1');

   useEffect(() => {
      if (query.new === '1') setCreateOpen(true);
   }, [query.new]);

   useEffect(() => {
      let cancelled = false;
      setLoading(true);
      setError(null);

      listCampaigns({
         q: debouncedSearch.trim() || undefined,
         status: statusFilter === 'all' ? undefined : statusFilter,
      })
         .then((page) => {
            if (!cancelled) setCampaigns(page.data.map(toCampaignView));
         })
         .catch((cause: unknown) => {
            if (!cancelled) setError(errorMessage(cause, 'Could not load campaigns'));
         })
         .finally(() => {
            if (!cancelled) setLoading(false);
         });

      return () => {
         cancelled = true;
      };
   }, [debouncedSearch, statusFilter, reloadKey]);

   const filteredCampaigns = useMemo(() => {
      const needle = debouncedSearch.trim().toLowerCase();
      return campaigns.filter((campaign) => {
         if (statusFilter !== 'all' && campaign.status !== statusFilter) return false;
         if (needle.length === 0) return true;
         return (
            campaign.name.toLowerCase().includes(needle) ||
            campaign.subject.toLowerCase().includes(needle)
         );
      });
   }, [campaigns, debouncedSearch, statusFilter]);

   const filtersActive = debouncedSearch.trim().length > 0 || statusFilter !== 'all';

   function openCampaign(id: string): void {
      route(`/campaigns/${id}`);
   }

   function clearFilters(): void {
      setSearch('');
      setStatusFilter('all');
   }

   return (
      <div className="grid gap-6">
         <PageHeader
            title="Campaigns"
            description="Pin a template revision, choose an audience, and schedule the send."
            actionGuideId="campaigns-actions"
            actions={
               <Button onClick={() => setCreateOpen(true)}>
                  <Plus aria-hidden="true" />
                  New campaign
               </Button>
            }
         />

         <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            <div className="relative flex-1">
               <label
                  htmlFor="campaign-search"
                  className="sr-only"
               >
                  Search campaigns
               </label>
               <Search
                  className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                  aria-hidden="true"
               />
               <Input
                  id="campaign-search"
                  value={search}
                  placeholder="Search by name or subject"
                  className="pl-9"
                  onInput={(event) => setSearch(event.currentTarget.value)}
               />
            </div>

            <div className="w-full sm:w-48">
               <Select
                  value={statusFilter}
                  onValueChange={(value) => {
                     if (value === 'all') setStatusFilter('all');
                     else if (isCampaignStatus(value)) setStatusFilter(value);
                  }}
               >
                  <SelectTrigger aria-label="Filter by status">
                     <span className="truncate">
                        {statusFilter === 'all' ? 'All statuses' : titleCase(statusFilter)}
                     </span>
                  </SelectTrigger>
                  <SelectContent>
                     <SelectItem value="all">All statuses</SelectItem>
                     {CAMPAIGN_STATUSES.map((status) => (
                        <SelectItem
                           key={status}
                           value={status}
                        >
                           {titleCase(status)}
                        </SelectItem>
                     ))}
                  </SelectContent>
               </Select>
            </div>
         </div>

         <p
            className="sr-only"
            role="status"
            aria-live="polite"
         >
            {loading ? 'Loading campaigns' : `${filteredCampaigns.length} campaigns loaded`}
         </p>

         {error !== null ? (
            <Alert variant="destructive">
               <AlertTitle>Could not load campaigns</AlertTitle>
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
         ) : !loading && filteredCampaigns.length === 0 ? (
            <EmptyState
               icon={<Send aria-hidden="true" />}
               title={filtersActive ? 'No campaigns match' : 'No campaigns yet'}
               description={
                  filtersActive
                     ? 'Try another search or status filter.'
                     : 'Create a campaign to pin a template, pick an audience, and choose a send time.'
               }
               action={
                  filtersActive ? (
                     <Button
                        variant="outline"
                        onClick={clearFilters}
                     >
                        Clear filters
                     </Button>
                  ) : (
                     <Button onClick={() => setCreateOpen(true)}>
                        <Plus aria-hidden="true" />
                        New campaign
                     </Button>
                  )
               }
            />
         ) : (
            <div
               data-guide="campaigns-table"
               className="overflow-hidden rounded-xl border border-border bg-card shadow-sm"
            >
               <Table>
                  <caption className="sr-only">Campaigns</caption>
                  <TableHeader>
                     <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Audience</TableHead>
                        <TableHead>Scheduled</TableHead>
                        <TableHead>Sent / total</TableHead>
                        <TableHead>Updated</TableHead>
                     </TableRow>
                  </TableHeader>
                  <TableBody>
                     {loading && campaigns.length === 0
                        ? Array.from({ length: 5 }, (_, rowIndex) => (
                             <TableRow key={`skeleton-${rowIndex}`}>
                                {Array.from({ length: 6 }, (_, cellIndex) => (
                                   <TableCell key={`skeleton-${rowIndex}-${cellIndex}`}>
                                      <Skeleton className="h-4 w-full max-w-40" />
                                   </TableCell>
                                ))}
                             </TableRow>
                          ))
                        : filteredCampaigns.map((campaign) => (
                             <TableRow
                                key={campaign.id}
                                tabIndex={0}
                                className="cursor-pointer outline-none hover:bg-accent/40 focus-visible:bg-accent/40"
                                onClick={() => openCampaign(campaign.id)}
                                onKeyDown={(event) => {
                                   if (event.key === 'Enter' || event.key === ' ') {
                                      event.preventDefault();
                                      openCampaign(campaign.id);
                                   }
                                }}
                             >
                                <TableCell>
                                   <a
                                      href={`/campaigns/${campaign.id}`}
                                      className="font-medium underline-offset-4 hover:underline"
                                      onClick={(event) => {
                                         event.preventDefault();
                                         event.stopPropagation();
                                         openCampaign(campaign.id);
                                      }}
                                   >
                                      {campaign.name}
                                   </a>
                                </TableCell>
                                <TableCell>
                                   <Badge variant={campaignStatusVariant(campaign.status)}>
                                      {titleCase(campaign.status)}
                                   </Badge>
                                </TableCell>
                                <TableCell>
                                   <span className="text-muted-foreground">
                                      {campaign.audienceCount !== null
                                         ? formatNumber(campaign.audienceCount)
                                         : '—'}
                                   </span>
                                </TableCell>
                                <TableCell>
                                   <span className="text-muted-foreground">
                                      {formatDateTime(campaign.scheduledAt)}
                                   </span>
                                </TableCell>
                                <TableCell>
                                   <span className="text-muted-foreground">
                                      {sentTotal(campaign)}
                                   </span>
                                </TableCell>
                                <TableCell>
                                   <span
                                      className="text-muted-foreground"
                                      title={formatDate(campaign.updated_at)}
                                   >
                                      {relativeTime(campaign.updated_at)}
                                   </span>
                                </TableCell>
                             </TableRow>
                          ))}
                  </TableBody>
               </Table>
            </div>
         )}

         <NewCampaignDialog
            open={createOpen}
            onOpenChange={setCreateOpen}
         />
      </div>
   );
}
