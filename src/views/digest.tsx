import type { DigestRow } from '../digest/types.js';

export function DigestPage({ night, rows, badLines }: { night: string; rows: DigestRow[]; badLines: number }) {
  return (
    <>
      <h1>digest · {night}</h1>
      {badLines > 0 ? <p class="warn">{badLines} malformed {badLines === 1 ? 'line' : 'lines'} skipped.</p> : null}
      {rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first time</th>
              <th>last time</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const warn = row.retries >= 3 || row.lastStatus === 'fail';
              return (
                <tr class={warn ? 'warn' : undefined}>
                  <td>{row.job}</td>
                  <td>{row.owner ?? '—'}</td>
                  <td>{row.runs}</td>
                  <td class={row.retries >= 3 ? 'warn' : undefined}>{row.retries}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastStatus}</td>
                  <td class={row.lastStatus === 'fail' ? 'warn' : undefined}>{row.lastError ?? '—'}</td>
                  <td>{row.firstAt || '—'}</td>
                  <td>{row.lastAt || '—'}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </>
  );
}
