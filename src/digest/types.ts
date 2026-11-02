export type DigestStatus = 'ok' | 'retry' | 'fail'

export type DigestRow = {
  job: string
  // Latest chronological owner, including null; equal times use source line order.
  owner: string | null
  // All valid entries for this job, and the subset whose status is retry.
  runs: number
  retries: number
  // Status of the latest chronological entry, with source line order breaking ties.
  lastStatus: DigestStatus
  // Latest chronological nonempty error, retained after a successful recovery.
  lastError: string | null
  // Chronological bounds, preserving each timestamp's original offset.
  firstAt: string
  lastAt: string
}

// Counts of all valid log entries, including repeated entries for the same job.
export type DigestCounts = Record<DigestStatus, number>

export type ReadNightResult =
  | { found: false; night: string }
  | {
      found: true
      night: string
      // One row per job, sorted by job; an existing empty night has no rows.
      rows: DigestRow[]
      badLines: number
      counts: DigestCounts
    }

// Synchronous reader contract; the implementation lives in reader.ts.
export type ReadNight = (runsDir: string, night: string) => ReadNightResult
