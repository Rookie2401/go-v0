// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createGlossService, type PackProvider } from '../../packages/golearn-extension/src/background/gloss';
import type { SessionManager } from '../../packages/golearn-extension/src/background/session';
import { packFor } from '../../packages/language-packs/src/registry';
import { createChromeFake } from './chromeFake';

describe.each(['sq', 'de', 'es', 'hi', 'th'])('full dictionary transport: %s', (languageId) => {
  it.each(['throw', '503'] as const)('reports %s as offline and retries instead of claiming linguistic absence', async (failure) => {
    const manifest = packFor(languageId)!;
    let down = true;
    let reads = 0;
    const packs: PackProvider = {
      manifest: () => manifest,
      runtime: (_id, deps) => ({
        manifest,
        gloss: async () => undefined,
        // Like the real full-record reader, transport errors become an empty answer.
        async entry() {
          try {
            const res = await deps.fetch(`${deps.baseUrl}/dict/${languageId}/full/f-00.json`);
            if (!res.ok) return undefined;
            return { records: [{ w: 'probe', s: [{ g: 'test meaning' }] }], attribution: 'Test dictionary' };
          } catch { return undefined; }
        },
      }),
    };
    const svc = createGlossService({
      area: createChromeFake().local, packs,
      session: { getService: async () => ({ baseUrl: 'https://dictionary.example' }) } as unknown as SessionManager,
      fetch: (async (input) => {
        if (String(input).includes('/full/')) {
          reads++;
          if (down) {
            if (failure === 'throw') throw new TypeError('Failed to fetch');
            return new Response('', { status: 503 });
          }
        }
        return new Response('{}');
      }) as typeof fetch,
    });
    const request = { lemma: 'probe', languageId };
    expect(await svc.entryFor(request)).toMatchObject({ found: false, reason: 'offline', source: 'configured' });
    down = false;
    expect(await svc.entryFor(request)).toMatchObject({ found: true, records: [{ w: 'probe' }] });
    expect(reads).toBe(2);
  });
});
