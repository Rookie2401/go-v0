// @vitest-environment jsdom
/**
 * The source line of the reader: a text taken from a published source names it where it is read — the credit always,
 * the licence and what was left out one disclosure away. A text written for the course has none.
 * With the real bundled Hindi Scripture: the Indian Revised Version's rights holder, licence and distributor are on the page.
 */
import { afterEach, describe, expect, it } from 'vitest';
import type { ContentSource } from '../../src/core';
import { loadBundledCorpus } from '../../src/ingest';
import { SourceLine, sourceView } from '../../src/ui/reader/SourceLine';
import { click, makeHarness, q } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const source = (over: Partial<ContentSource>): ContentSource => ({ id: 'src:x', title: 'A source', rights: 'licensed', authorship: 'licensed', ...over } as ContentSource);

describe('sourceView (pure)', () => {
  it('a licensed or public-domain source is named; a course text, a generated text and the learner\'s own writing are not', () => {
    expect(sourceView(source({ attribution: 'A translation — © Holder; CC BY-SA 4.0' }))?.attribution).toBe('A translation — © Holder; CC BY-SA 4.0');
    expect(sourceView(source({ rights: 'public-domain', attribution: 'An old edition, public domain' }))?.attribution).toBe('An old edition, public domain');
    for (const rights of ['owner-authored', 'unverified', 'user-private'] as const) expect(sourceView(source({ rights: rights as ContentSource['rights'], attribution: 'x' })), rights).toBeNull();
    expect(sourceView(undefined)).toBeNull();
  });

  it('without an attribution line the title, edition and publisher stand in; a link is kept only when it is a web address', () => {
    expect(sourceView(source({ title: 'Bible', edition: '2019', publisher: 'A Society' }))?.attribution).toBe('Bible, 2019, A Society');
    expect(sourceView(source({ attribution: 'x', url: 'https://example.org/a' }))?.url).toBe('https://example.org/a');
    expect(sourceView(source({ attribution: 'x', url: 'javascript:alert(1)' }))?.url).toBeUndefined();
  });
});

describe('SourceLine', () => {
  it('shows the credit with the text and the licence and provenance behind one disclosure', async () => {
    const h = await makeHarness();
    await h.store.sources.put(source({ id: 'src:lic', attribution: 'A translation — © Holder; CC BY-SA 4.0', licenseNote: 'CC BY-SA 4.0: share alike.', provenance: 'Footnotes are not included.', url: 'https://example.org/a' }));
    mounted = await h.mount(<SourceLine text={{ sourceId: 'src:lic', lang: 'hi' }} />);
    expect(q(mounted.container, '[data-testid="source-attribution"]')!.textContent).toBe('A translation — © Holder; CC BY-SA 4.0');
    const button = q<HTMLButtonElement>(mounted.container, 'button')!;
    expect(button.textContent).toContain('Licence and source');
    await click(button);
    expect(q(mounted.container, '[data-testid="source-licence"]')!.textContent).toBe('CC BY-SA 4.0: share alike.');
    expect(q(mounted.container, '[data-testid="source-provenance"]')!.textContent).toBe('Footnotes are not included.');
    expect(q<HTMLAnchorElement>(mounted.container, 'a')!.getAttribute('href')).toBe('https://example.org/a');
  });

  it('renders nothing for a text written for the course', async () => {
    const h = await makeHarness();
    await h.store.sources.put(source({ id: 'src:own', rights: 'owner-authored', authorship: 'generated', attribution: 'Go course authors' }));
    mounted = await h.mount(<SourceLine text={{ sourceId: 'src:own', lang: 'hi' }} />);
    expect(q(mounted.container, '[data-testid="source-line"]')).toBeNull();
  });
});

describe('the bundled Hindi Scripture carries what its licence asks for', () => {
  it('every Indian Revised Version text names the translation, the rights holder, the licence and the distributor, and says what was left out', () => {
    const docs = loadBundledCorpus().filter((d) => d.lang === 'hi' && d.contentType === 'scripture');
    expect(docs.length).toBeGreaterThanOrEqual(5);
    for (const d of docs) {
      const v = sourceView(d.source as unknown as ContentSource)!;
      expect(v, d.id).not.toBeNull();
      expect(v.attribution, d.id).toMatch(/IRV/);
      expect(v.attribution, d.id).toMatch(/Bridge Connectivity Solutions/);
      expect(v.attribution, d.id).toMatch(/CC BY-SA 4\.0/);
      expect(v.attribution, d.id).toMatch(/eBible\.org/);
      expect(v.licence, d.id).toMatch(/same licence/);
      expect(`${v.provenance}`, d.id).toMatch(/not included|verify-scripture/);
    }
  });

  it('every bundled public-domain or licensed text of any course has a credit to show', () => {
    for (const d of loadBundledCorpus().filter((x) => x.source.rights === 'licensed' || x.source.rights === 'public-domain')) {
      expect(sourceView(d.source as unknown as ContentSource), `${d.lang}/${d.id}`).not.toBeNull();
    }
  });
});
