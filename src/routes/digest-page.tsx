import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/reader.js';
import { lane } from '../lane.js';
import { DigestPage } from '../views/digest.js';
import { Layout } from '../views/layout.js';

export function createDigestPageRoutes(config: RigConfig) {
  const app = new Hono();

  app.get('/:night', (c) => {
    const result = readNight(config.runsDir, c.req.param('night'));
    if (!result.found) {
      return c.html(
        <Layout title="digest not found" lane={lane()}>
          <h1>digest not found</h1>
          <p class="mute">No run log for {result.night}.</p>
        </Layout>,
        404,
      );
    }

    return c.html(
      <Layout title={`digest · ${result.night}`} lane={lane()}>
        <DigestPage night={result.night} rows={result.rows} badLines={result.badLines} />
      </Layout>,
    );
  });

  return app;
}
