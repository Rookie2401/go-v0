/**
 * The GoRead team server on Cloudflare Workers + D1 (contract: docs/goread/BACKEND.md). The same handler as Node, with
 * the D1 store and the LIGHT document check only (the free plan allows about 10 ms of CPU per request); a text that
 * passes it but is broken more deeply is still turned away by every app's own importer. Steps: docs/goread/DEPLOY.md.
 */
import { COURSES } from '../../src/core/config.ts';
import { lightCheck } from './check.ts';
import { handle } from './handler.ts';
import { createD1Store, type D1Like } from './store-d1.ts';

export interface Env { DB: D1Like }

export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, { store: createD1Store(env.DB), courses: COURSES, check: lightCheck });
  },
};
