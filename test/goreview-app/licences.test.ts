// @vitest-environment jsdom
/** Settings → "Licences and attribution": the shipped THIRD-PARTY-NOTICES.md, read at runtime, with a fallback when it cannot be. */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { NOTICES_FALLBACK, renderNotices } from '../../packages/goreview/app/screens/licences';
import { destroyRigs, makeRig, until } from './helpers';

afterEach(() => destroyRigs());

const NOTICES = fs.readFileSync(path.resolve(__dirname, '../../THIRD-PARTY-NOTICES.md'), 'utf8');
const click = (el: Element): void => { (el as HTMLElement).click(); };
const open = (el: HTMLElement): void => { (el as HTMLDetailsElement).open = true; el.dispatchEvent(new Event('toggle')); };
const reply = (body: string, status = 200): Response => ({ ok: status >= 200 && status < 300, status, text: async () => body }) as unknown as Response;

describe('the Licences and attribution section in Settings', () => {
  it('is a closed section that fetches nothing until it is opened, then shows the shipped notices as headings, lists and links', async () => {
    const rig = await makeRig({ signedIn: true });
    const urls: string[] = [];
    // the account blocks of Settings talk to the service; only the notices file is counted here
    rig.deps.fetch = (async (u: string) => { if (!String(u).startsWith('https://repository.example.org/')) urls.push(String(u)); return reply(NOTICES); }) as unknown as typeof fetch;
    await rig.go('settings');
    const section = rig.q<HTMLDetailsElement>('#settings-licences');
    expect(section.querySelector('summary')?.textContent).toBe('Licences and attribution');
    expect(section.open).toBe(false);
    expect(urls).toEqual([]);
    open(section);
    await until(() => !!rig.root.querySelector('#licences-text'), 'the notices');
    expect(urls).toEqual(['./THIRD-PARTY-NOTICES.md']);
    const text = rig.q('#licences-text');
    expect(text.querySelector('h3')?.textContent).toBe('Third-party notices');
    expect([...text.querySelectorAll('h4')].map((x) => x.textContent)).toEqual(expect.arrayContaining(['Data', 'Code bundled into the applications', 'Audio', 'Our own material']));
    expect(text.textContent).toContain('Albanian dictionary');
    expect(text.textContent).toContain('Attribution-ShareAlike 4.0');
    expect(text.textContent).toContain('ts-fsrs');
    expect(text.textContent).toContain('kaikki-sq@2026-09-28'); // the edition
    expect(text.textContent).toMatch(/last-modified date is 2026-09-28/);
    expect(text.textContent).toMatch(/Changes: the shards are an adaptation/);
    expect(text.querySelectorAll('li').length).toBeGreaterThanOrEqual(3);
    const hrefs = [...text.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(hrefs).toContain('https://creativecommons.org/licenses/by-sa/4.0/');
    expect(hrefs).toContain('https://kaikki.org/dictionary/Albanian/kaikki.org-dictionary-Albanian.jsonl.gz');
    for (const a of text.querySelectorAll('a')) expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(rig.root.querySelector('#licences-fallback')).toBeNull();
    // opening it again does not fetch again
    open(section);
    expect(urls).toHaveLength(1);
  });

  it('says what the notices say, and where the full text is, when the file cannot be fetched; Try again recovers', async () => {
    const rig = await makeRig({ signedIn: true });
    let up = false;
    rig.deps.fetch = (async () => { if (!up) throw new Error('offline'); return reply(NOTICES); }) as unknown as typeof fetch;
    await rig.go('settings');
    open(rig.q('#settings-licences'));
    await until(() => !!rig.root.querySelector('#licences-fallback'), 'the fallback');
    const fb = rig.q('#licences-fallback').textContent ?? '';
    expect(fb).toBe(NOTICES_FALLBACK);
    expect(fb).toMatch(/kaikki\.org/);
    expect(fb).toMatch(/CC|Creative Commons Attribution-ShareAlike/);
    expect(fb).toMatch(/THIRD-PARTY-NOTICES\.md/);
    expect(rig.root.querySelector('#licences-text')).toBeNull();
    up = true;
    click(rig.q('#licences-retry'));
    await until(() => !!rig.root.querySelector('#licences-text'), 'the notices after a retry');
    expect(rig.root.querySelector('#licences-fallback')).toBeNull();
  });

  it('treats a missing file, an HTTP error and a host that answers with the app\'s own page as a failure', async () => {
    for (const answer of [reply('', 404), reply('<!doctype html><html><body>app</body></html>'), reply('   '), reply('some other text')]) {
      const rig = await makeRig({ signedIn: true });
      rig.deps.fetch = (async () => answer) as unknown as typeof fetch;
      await rig.go('settings');
      open(rig.q('#settings-licences'));
      await until(() => !!rig.root.querySelector('#licences-fallback'), 'the fallback');
      expect(rig.root.querySelector('#licences-text')).toBeNull();
      destroyRigs();
    }
  });

  it('reads the file next to the app when the config names another asset base', async () => {
    const rig = await makeRig({ signedIn: true, config: { serviceUrl: 'https://repository.example.org', assetBaseUrl: 'https://cdn.example.org/go' } });
    const urls: string[] = [];
    rig.deps.fetch = (async (u: string) => { if (!String(u).startsWith('https://repository.example.org/')) urls.push(String(u)); return reply(NOTICES); }) as unknown as typeof fetch;
    await rig.go('settings');
    open(rig.q('#settings-licences'));
    await until(() => urls.length === 1, 'the fetch');
    expect(urls[0]).toBe('https://cdn.example.org/go/THIRD-PARTY-NOTICES.md');
  });
});

describe('renderNotices', () => {
  it('shows markup as text and makes links only from http(s) addresses', () => {
    const el = renderNotices('# Third-party notices\n\n- **bold** <img src=x onerror=alert(1)> see https://example.org/a. and javascript:alert(1)\n  continued line with `code`\n');
    expect(el.querySelector('img')).toBeNull();
    expect(el.querySelector('li')?.textContent).toContain('<img src=x onerror=alert(1)>');
    expect(el.querySelector('li strong')?.textContent).toBe('bold');
    expect(el.querySelector('li code')?.textContent).toBe('code');
    expect(el.querySelector('li')?.textContent).toContain('continued line');
    const a = [...el.querySelectorAll('a')];
    expect(a.map((x) => x.getAttribute('href'))).toEqual(['https://example.org/a']);
    expect(el.querySelector('li')?.textContent).toContain('example.org/a.'); // the full stop stays outside the link
  });

  it('joins the lines of a paragraph and starts a new one at a blank line', () => {
    const el = renderNotices('first line\nsecond line\n\nnext paragraph');
    expect([...el.querySelectorAll('p')].map((x) => x.textContent)).toEqual(['first line second line', 'next paragraph']);
  });
});
