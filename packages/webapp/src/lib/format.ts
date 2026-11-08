const dateFormatter = new Intl.DateTimeFormat('en-GB', {
   day: '2-digit',
   month: 'short',
   year: 'numeric',
});

const dateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
   day: '2-digit',
   month: 'short',
   year: 'numeric',
   hour: '2-digit',
   minute: '2-digit',
   hour12: false,
});

const numberFormatter = new Intl.NumberFormat('en-US');

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

function isUnixSeconds(value: number | null | undefined): value is number {
   return typeof value === 'number' && Number.isFinite(value);
}

export function formatDate(unixSeconds: number | null | undefined): string {
   if (!isUnixSeconds(unixSeconds)) return '—';
   return dateFormatter.format(new Date(unixSeconds * 1000));
}

export function formatDateTime(unixSeconds: number | null | undefined): string {
   if (!isUnixSeconds(unixSeconds)) return '—';
   return dateTimeFormatter.format(new Date(unixSeconds * 1000));
}

/** Compact duration for run logs: 850ms, 4.2s, 2m 10s, 3h 5m. */
export function formatDuration(milliseconds: number | null | undefined): string {
   if (milliseconds === null || milliseconds === undefined || !Number.isFinite(milliseconds)) {
      return '—';
   }
   if (milliseconds < 1000) return `${Math.max(0, Math.round(milliseconds))}ms`;
   const seconds = milliseconds / 1000;
   if (seconds < 60) return `${seconds < 10 ? seconds.toFixed(1) : Math.round(seconds)}s`;
   const minutes = Math.floor(seconds / 60);
   const restSeconds = Math.round(seconds % 60);
   if (minutes < 60) return `${minutes}m ${restSeconds}s`;
   const hours = Math.floor(minutes / 60);
   return `${hours}h ${minutes % 60}m`;
}

function relativePhrase(milliseconds: number): string {
   if (milliseconds < 90_000) return '1 minute';
   if (milliseconds < 45 * MINUTE) return `${Math.round(milliseconds / MINUTE)} minutes`;
   if (milliseconds < 90 * MINUTE) return '1 hour';
   if (milliseconds < 22 * HOUR) return `${Math.round(milliseconds / HOUR)} hours`;
   if (milliseconds < 36 * HOUR) return '1 day';
   if (milliseconds < 26 * DAY) return `${Math.round(milliseconds / DAY)} days`;
   if (milliseconds < 45 * DAY) return '1 month';
   if (milliseconds < 11 * MONTH) return `${Math.round(milliseconds / MONTH)} months`;
   if (milliseconds < 18 * MONTH) return '1 year';
   return `${Math.round(milliseconds / YEAR)} years`;
}

export function relativeTime(unixSeconds: number | null | undefined, nowMs = Date.now()): string {
   if (!isUnixSeconds(unixSeconds)) return '—';

   const difference = unixSeconds * 1000 - nowMs;
   const absolute = Math.abs(difference);

   if (absolute < 45_000) return 'just now';

   const phrase = relativePhrase(absolute);
   return difference < 0 ? `${phrase} ago` : `${phrase} from now`;
}

export function pluralise(count: number, singular: string, plural = `${singular}s`): string {
   return `${count} ${count === 1 ? singular : plural}`;
}

export function formatNumber(value: number): string {
   return numberFormatter.format(value);
}

export function csvFilename(prefix: string, date = new Date()): string {
   const base =
      prefix
         .trim()
         .toLowerCase()
         .replace(/[^a-z0-9]+/g, '-')
         .replace(/^-+|-+$/g, '') || 'export';
   return `${base}-${date.toISOString().slice(0, 10)}.csv`;
}

export function titleCase(value: string): string {
   return value.replace(/[_-]+/g, ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}
