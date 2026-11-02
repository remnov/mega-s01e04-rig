import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestCounts, DigestRow, DigestStatus, ReadNight } from './types.js';

type Entry = {
  at: string;
  time: number;
  fraction: string;
  job: string;
  status: DigestStatus;
  owner: string | null;
  error?: string;
};

function isDate(value: string): boolean {
  if (value.length !== 10 || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return month >= 1 && month <= 12 && day >= 1 && day <= days[month - 1];
}

function parseEntry(line: string): Entry | null {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.at !== 'string' ||
    typeof record.job !== 'string' || !record.job.trim() ||
    (record.status !== 'ok' && record.status !== 'retry' && record.status !== 'fail') ||
    (record.owner !== null && typeof record.owner !== 'string') ||
    (record.error !== undefined && typeof record.error !== 'string')
  ) return null;

  // Require a real calendar date and an explicit zone, not Date.parse's permissive inputs.
  const timestamp = /^(\d{4}-\d{2}-\d{2})T([01]\d|2[0-3]):([0-5]\d):([0-5]\d)(?:\.(\d+))?(?:Z|[+-]([01]\d|2[0-3]):([0-5]\d))$/.exec(record.at);
  if (!timestamp || timestamp[0] !== record.at || !isDate(timestamp[1])) return null;
  const time = Date.parse(record.at);
  if (!Number.isFinite(time)) return null;
  return {
    at: record.at,
    time,
    // Date.parse truncates finer precision; keep it to order submillisecond entries too.
    fraction: (timestamp[5] ?? '').slice(3).replace(/0+$/, ''),
    job: record.job,
    status: record.status,
    owner: record.owner,
    error: record.error,
  };
}

export const readNight: ReadNight = (runsDir, night) => {
  if (!isDate(night)) return { found: false, night };
  let source: string;
  try {
    source = readFileSync(join(runsDir, `${night}.jsonl`), 'utf8');
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
      return { found: false, night };
    }
    throw error;
  }

  const lines = source === '' ? [] : source.split(/\r?\n/);
  // A final newline terminates the last record rather than starting another one.
  if (lines.at(-1) === '') lines.pop();
  const entries: Entry[] = [];
  let badLines = 0;
  for (const line of lines) {
    const entry = parseEntry(line);
    if (entry) entries.push(entry);
    else badLines++;
  }
  // Stable sorting leaves equal instants in source order.
  entries.sort((a, b) => a.time - b.time || compare(a.fraction, b.fraction));
  const rows = new Map<string, DigestRow>();
  const counts: DigestCounts = { ok: 0, retry: 0, fail: 0 };
  for (const entry of entries) {
    counts[entry.status]++;
    const row = rows.get(entry.job) ?? {
      job: entry.job,
      owner: entry.owner,
      runs: 0,
      retries: 0,
      lastStatus: entry.status,
      lastError: null,
      firstAt: entry.at,
      lastAt: entry.at,
    };
    row.runs++;
    if (entry.status === 'retry') row.retries++;
    row.owner = entry.owner;
    row.lastStatus = entry.status;
    row.lastAt = entry.at;
    if (entry.error?.trim()) row.lastError = entry.error;
    rows.set(entry.job, row);
  }
  return {
    found: true,
    night,
    rows: [...rows.values()].sort((a, b) => compare(a.job, b.job)),
    badLines,
    counts,
  };
};

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
