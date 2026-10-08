/** The five Orca robot statuses (Ref §3, F100) in drill key order 1–5. */
export const STATUSES = ['Available', 'Unavailable', 'Offline', 'Connection Failed', 'Reserved'] as const;
export type StatusName = (typeof STATUSES)[number];

export const STATUS_TAG: Record<StatusName, string> = {
  Available: 'orca.status',
  Unavailable: 'orca.status.unavailable',
  Offline: 'orca.status.offline',
  'Connection Failed': 'orca.status.connfailed',
  Reserved: 'orca.status.reserved',
};

/** One-line meaning (assist captions under the buttons). */
export const STATUS_HINT: Record<StatusName, string> = {
  Available: 'healthy, open to general checkouts',
  Unavailable: 'only jobs that name the rig',
  Offline: 'manual: being built · health check skipped',
  'Connection Failed': 'ping dropped or non-200',
  Reserved: 'manual: someone is running locally',
};

/** Theme colours (fallbacks match --st-* in the UI theme). */
export const STATUS_COLOR: Record<StatusName, string> = {
  Available: 'var(--st-available, #43b02a)',
  Unavailable: 'var(--st-unavailable, #7b8cff)',
  Offline: 'var(--st-offline, #7d8784)',
  'Connection Failed': 'var(--st-connfailed, #ef4b3f)',
  Reserved: 'var(--st-reserved, #f5b301)',
};
