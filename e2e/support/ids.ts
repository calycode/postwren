const runId = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

function suffix(): string {
   return Math.random().toString(36).slice(2, 6);
}

/** Names are unique per call, so retries can never collide with an earlier attempt. */
export function uniqueName(label: string): string {
   return `E2E ${label} ${runId}${suffix()}`;
}

export function uniqueEmail(label: string): string {
   return `e2e-${label}-${runId}${suffix()}@example.test`;
}

export function uniqueTag(label: string): string {
   return `e2e-${label}-${runId}${suffix()}`;
}
