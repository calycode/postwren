const pad = (value: number): string => String(value).padStart(2, '0');

export function toLocalDateTimeInput(unixSeconds: number): string {
   const date = new Date(unixSeconds * 1000);
   return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseLocalDateTime(value: string): number | null {
   if (value.length === 0) return null;
   const milliseconds = new Date(value).getTime();
   if (!Number.isFinite(milliseconds)) return null;
   return Math.floor(milliseconds / 1000);
}

export function formatUtcDateTime(unixSeconds: number): string {
   return `${new Date(unixSeconds * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}
