import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';

const baseConfig = {
  adapter: 'shim',
  installed: '2026-10-29T14:06:00+01:00',
  beatEverySeconds: 60,
};

let runsDir: string;

beforeEach(async () => {
  vi.stubEnv('LANE_MARKER', 'ROUTE-TEST');
  runsDir = await mkdtemp(join(tmpdir(), 'rig-digest-routes-'));
});

afterEach(async () => {
  vi.unstubAllEnvs();
  await rm(runsDir, { recursive: true, force: true });
});

function app() {
  return createApp({ ...baseConfig, runsDir });
}

function logLine(at: string, job: string, status: 'ok' | 'retry' | 'fail', owner: string | null, error?: string) {
  return JSON.stringify({ at, job, status, owner, ...(error === undefined ? {} : { error }) });
}

describe('digest routes', () => {
  it('renders the same sorted jobs as JSON and safely escapes untrusted values', async () => {
    const night = '2026-10-28';
    const offsetOne = '2026-10-28T23:55:00-07:00';
    const offsetTwo = '2026-10-29T00:15:00-07:00';
    const hostileJob = 'zeta <img src=x onerror=alert(1)>';
    const hostileError = '</td><script>alert(1)</script>';
    const failingJob = 'alpha & <script>alert(2)</script>';
    const failingError = '<script>alert(3)</script>';
    const content = [
      'not-json',
      logLine(offsetOne, hostileJob, 'retry', null, hostileError),
      logLine('2026-10-29T00:00:00-07:00', hostileJob, 'retry', null),
      logLine('2026-10-29T00:10:00-07:00', hostileJob, 'retry', null),
      logLine(offsetTwo, hostileJob, 'ok', null),
      logLine('2026-10-29T01:00:00+02:00', failingJob, 'fail', 'reader', failingError),
    ].join('\n');
    await writeFile(join(runsDir, `${night}.jsonl`), content);

    const [pageResponse, apiResponse] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);
    const html = await pageResponse.text();
    const json = await apiResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(apiResponse.status).toBe(200);
    expect(json).toEqual({
      found: true,
      night,
      rows: [
        {
          job: failingJob,
          owner: 'reader',
          runs: 1,
          retries: 0,
          lastStatus: 'fail',
          lastError: failingError,
          firstAt: '2026-10-29T01:00:00+02:00',
          lastAt: '2026-10-29T01:00:00+02:00',
        },
        {
          job: hostileJob,
          owner: null,
          runs: 4,
          retries: 3,
          lastStatus: 'ok',
          lastError: hostileError,
          firstAt: offsetOne,
          lastAt: offsetTwo,
        },
      ],
      badLines: 1,
      counts: { ok: 1, retry: 3, fail: 1 },
    });

    expect(html).toContain('1 malformed line skipped.');
    expect(html).toContain('—');
    expect(html).toContain(offsetOne);
    expect(html).toContain(offsetTwo);
    expect(html.indexOf('alpha &amp; &lt;script&gt;')).toBeLessThan(html.indexOf('zeta &lt;img'));
    expect(html).toContain('&lt;script&gt;alert(3)&lt;/script&gt;');
    expect(html).toContain('&lt;/td&gt;&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('class="warn"');
    expect(html).not.toMatch(/<script\b/i);
    expect(html).not.toMatch(/<img\b/i);
  });

  it('returns 404 for a missing night in both formats', async () => {
    const night = '2099-01-01';
    const [pageResponse, apiResponse] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(await pageResponse.text()).toContain('digest not found');
    expect(apiResponse.status).toBe(404);
    expect(await apiResponse.json()).toEqual({ error: 'night not found' });
  });

  it('renders an existing empty night with zero counts', async () => {
    const night = '2026-10-27';
    await writeFile(join(runsDir, `${night}.jsonl`), '');

    const [pageResponse, apiResponse] = await Promise.all([
      app().request(`/digest/${night}`),
      app().request(`/api/digest/${night}`),
    ]);

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
    expect(apiResponse.status).toBe(200);
    expect(await apiResponse.json()).toEqual({
      found: true,
      night,
      rows: [],
      badLines: 0,
      counts: { ok: 0, retry: 0, fail: 0 },
    });
  });
});
