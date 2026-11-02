import { afterEach, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { readNight } from '../src/digest/reader.js';

const night = '2026-10-28';
const directories: string[] = [];
function fixture(source: string): string {
  const directory = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  directories.push(directory);
  writeFileSync(join(directory, `${night}.jsonl`), source);
  return directory;
}
function event(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return { at: '2026-10-28T23:00:00+01:00', job: 'job', status: 'ok', owner: 'rook', ...overrides };
}
function readEvents(events: unknown[]) {
  return readNight(fixture(events.map((entry) => JSON.stringify(entry)).join('\n')), night);
}
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true });
});

describe('readNight', () => {
  it('reads the real fixture without changing it: five sorted jobs and one bad line', () => {
    const result = readNight('runs', night);
    expect(result.found).toBe(true);
    if (!result.found) throw new Error('Missing read-only fixture');
    expect(result.badLines).toBe(1);
    expect(result.counts).toEqual({ ok: 10, retry: 4, fail: 1 });
    expect(result.rows.map((row) => row.job)).toEqual([
      'digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs',
    ]);
    expect(result.rows[0]).toMatchObject({ owner: null, runs: 1, lastError: null });
    expect(result.rows[1]).toEqual({
      job: 'fixtures/refresh', owner: 'rook', runs: 4, retries: 3,
      lastStatus: 'ok', lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00', lastAt: '2026-10-29T01:37:00+01:00',
    });
    expect(result.rows[2]).toMatchObject({ runs: 8, retries: 1, lastError: 'lock held' });
    expect(result.rows[3]).toMatchObject({ lastStatus: 'fail', lastError: 'quota exceeded' });
  });

  it('distinguishes a missing night from an empty existing file', () => {
    const directory = fixture('');
    expect(readNight(directory, '2026-10-27')).toEqual({ found: false, night: '2026-10-27' });
    expect(readNight(directory, night)).toEqual({
      found: true, night, rows: [], badLines: 0, counts: { ok: 0, retry: 0, fail: 0 },
    });
    expect(readNight(join(directory, 'missing'), night)).toEqual({ found: false, night });
  });

  it('orders by actual instants, preserves offsets, and resolves ties by source order', () => {
    const result = readEvents([
      event({ at: '2026-10-29T01:00:00+02:00', status: 'ok', owner: 'latest' }),
      event({ at: '2026-10-29T00:30:00+02:00', status: 'retry', error: 'newer error' }),
      event({ at: '2026-10-29T00:00:00+03:00', status: 'fail', error: 'older error' }),
      event({ at: '2026-10-28T23:00:00Z', owner: null, error: '  ' }),
    ]);
    expect(result).toMatchObject({
      found: true, badLines: 0, counts: { ok: 2, retry: 1, fail: 1 },
      rows: [{ job: 'job', runs: 4, retries: 1, owner: null, lastStatus: 'ok',
        lastError: 'newer error', firstAt: '2026-10-29T00:00:00+03:00', lastAt: '2026-10-28T23:00:00Z' }],
    });
  });

  it('keeps the last error at tied instants and respects submillisecond chronology', () => {
    const result = readEvents([
      event({ at: '2026-10-28T23:00:00.0002Z', status: 'fail', error: 'first' }),
      event({ at: '2026-10-28T23:00:00.0002Z', status: 'retry', error: 'second' }),
      event({ at: '2026-10-28T23:00:00.0001Z', status: 'fail', error: 'old' }),
      event({ at: '2026-10-28T23:00:00.0003Z', status: 'ok', error: '' }),
    ]);
    expect(result).toMatchObject({ rows: [{ lastStatus: 'ok', lastError: 'second',
      firstAt: '2026-10-28T23:00:00.0001Z', lastAt: '2026-10-28T23:00:00.0003Z' }] });
  });

  it('counts malformed JSON, schema, and timestamps without dropping valid entries', () => {
    const invalid = [
      null, [], 42, 'string', {}, event({ job: '' }), event({ job: '  ' }),
      event({ status: 'unknown' }), event({ owner: undefined }), event({ owner: 7 }),
      event({ error: null }), event({ error: {} }), event({ at: 123 }),
      event({ at: 'not a date' }), event({ at: '2026-02-29T00:00:00Z' }),
      event({ at: '2026-04-31T00:00:00Z' }), event({ at: '2026-10-28' }),
      event({ at: '2026-10-28T00:00:00' }), event({ at: '2026-10-28T24:00:00Z' }),
      event({ at: '2026-10-28T23:60:00Z' }), event({ at: '2026-10-28T23:00:00+24:00' }),
    ];
    const source = [...invalid.map((entry) => JSON.stringify(entry)), '{bad', '', '  ',
      JSON.stringify(event({ at: '2024-02-29T00:00:00Z', owner: null })), ''].join('\r\n');
    expect(readNight(fixture(source), night)).toMatchObject({
      found: true, badLines: invalid.length + 3, counts: { ok: 1, retry: 0, fail: 0 },
      rows: [{ runs: 1, owner: null }],
    });
  });

  it.each(['../2026-10-28', '/2026-10-28', '2026-10-28/..', '2026-02-29', '2026-13-01',
    '2026-04-31', '2026-10-00', '2026-1-01', '2026-10-28\n', ''])('rejects unsafe or invalid night %j', (invalid) => {
    expect(readNight(fixture(''), invalid)).toEqual({ found: false, night: invalid });
  });

  it('propagates filesystem failures other than a missing file', () => {
    const directory = fixture('');
    rmSync(join(directory, `${night}.jsonl`));
    mkdirSync(join(directory, `${night}.jsonl`));
    expect(() => readNight(directory, night)).toThrow();
    const regularFile = join(directory, 'file');
    writeFileSync(regularFile, '');
    expect(() => readNight(regularFile, night)).toThrow();
  });
});
