import { Hono } from 'hono';
import type { RigConfig } from '../config.js';
import { readNight } from '../digest/reader.js';

export function createDigestApiRoutes(config: RigConfig) {
  const routes = new Hono();

  routes.get('/:night', (c) => {
    const result = readNight(config.runsDir, c.req.param('night'));

    if (!result.found) {
      return c.json({ error: 'night not found' }, 404);
    }

    return c.json(result);
  });

  return routes;
}
