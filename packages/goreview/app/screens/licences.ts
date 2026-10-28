/**
 * Licences and attribution: the text of THIRD-PARTY-NOTICES.md as the build ships it (the vite config copies it next to
 * index.html), fetched when the section is first opened and shown as plain structure (headings, lists, links). If it cannot be
 * fetched (offline, or a host that answers a missing file with the app's own page) a short fallback says what the notices say and
 * where the full text is. Everything reaches the DOM through `textContent`; a link is made only from an http(s) address.
 */
import type { AppContext } from '../context';
import { append, button, h, p } from '../dom';

export const NOTICES_FILE = 'THIRD-PARTY-NOTICES.md';

/** What the section says when the notices file cannot be read. It names the two third-party things GoReview carries. */
export const NOTICES_FALLBACK =
  'The full notices could not be loaded just now (you may be offline). In short: the Albanian dictionary is from Wiktionary, via kaikki.org, '
  + 'under Creative Commons Attribution-ShareAlike 4.0 (https://creativecommons.org/licenses/by-sa/4.0/); the review scheduler is ts-fsrs, MIT licence. '
  + `The complete text is the file ${NOTICES_FILE}, served next to this app.`;

const INLINE = /(\*\*[^*]+\*\*|`[^`]+`|https?:\/\/[^\s)<>]+)/gu;

function link(url: string): HTMLElement | string {
  const clean = url.replace(/[.,;:]+$/u, '');
  const tail = url.slice(clean.length);
  try {
    const u = new URL(clean);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return url;
  } catch { return url; }
  return h('span', {}, h('a', { href: clean, rel: 'noopener noreferrer', target: '_blank' }, clean), tail);
}

/** Bold, code and links inside one line of the notices. */
function inline(text: string): Array<Node | string> {
  const out: Array<Node | string> = [];
  let pos = 0;
  for (const m of text.matchAll(INLINE)) {
    const at = m.index ?? 0;
    if (at > pos) out.push(text.slice(pos, at));
    const tok = m[0];
    if (tok.startsWith('**')) out.push(h('strong', {}, tok.slice(2, -2)));
    else if (tok.startsWith('`')) out.push(h('code', {}, tok.slice(1, -1)));
    else out.push(link(tok));
    pos = at + tok.length;
  }
  if (pos < text.length) out.push(text.slice(pos));
  return out;
}

/** The notices (a small subset of Markdown: #, ##, -, paragraphs, **bold**, `code`, links) as DOM. */
export function renderNotices(markdown: string): HTMLElement {
  const root = h('div', { class: 'licences-text', id: 'licences-text' });
  let list: HTMLElement | undefined;
  let item: HTMLElement | undefined;
  let para: string[] = [];
  const flush = (): void => { if (para.length) { root.append(h('p', {}, ...inline(para.join(' ')))); para = []; } };
  const endList = (): void => { list = undefined; item = undefined; };
  for (const raw of markdown.replace(/\r\n?/gu, '\n').split('\n')) {
    const line = raw.replace(/\s+$/u, '');
    const heading = /^(#{1,3})\s+(.*)$/u.exec(line);
    if (heading) { flush(); endList(); root.append(h(heading[1].length === 1 ? 'h3' : 'h4', {}, ...inline(heading[2]))); continue; }
    const bullet = /^[-*]\s+(.*)$/u.exec(line);
    if (bullet) {
      flush();
      if (!list) { list = h('ul', {}); root.append(list); }
      item = h('li', {}, ...inline(bullet[1]));
      list.append(item);
      continue;
    }
    if (!line.trim()) { flush(); endList(); continue; }
    if (item && /^\s+\S/u.test(raw)) { item.append(' ', ...inline(line.trim())); continue; }
    endList();
    para.push(line.trim());
  }
  flush();
  return root;
}

/** The notices text, or undefined when the file cannot be read or what came back is not the notices (an HTML page, an empty body). */
export async function loadNotices(ctx: AppContext): Promise<string | undefined> {
  const base = (ctx.deps.config.assetBaseUrl ?? './').replace(/\/?$/u, '/');
  try {
    const res = await ctx.deps.fetch(`${base}${NOTICES_FILE}`);
    if (!res.ok) return undefined;
    const text = await res.text();
    if (!text.trim() || /^\s*<(?:!doctype|html)/iu.test(text) || !/third-party notices/iu.test(text)) return undefined;
    return text;
  } catch { return undefined; }
}

/** The "Licences and attribution" section for Settings: closed until opened, then read from the shipped notices file. */
export function licencesSection(ctx: AppContext): HTMLElement {
  const body = h('div', { id: 'licences-body' });
  const section = h('details', { class: 'card', id: 'settings-licences' }, h('summary', { id: 'licences-h' }, 'Licences and attribution'), body) as HTMLDetailsElement;
  let state: 'idle' | 'loading' | 'done' = 'idle';

  async function fill(): Promise<void> {
    state = 'loading';
    body.replaceChildren(p('Loading the notices.', 'muted'));
    const text = await loadNotices(ctx);
    if (text) {
      body.replaceChildren(renderNotices(text));
      state = 'done';
      return;
    }
    body.replaceChildren();
    append(body, [
      h('p', { id: 'licences-fallback', class: 'notice' }, ...inline(NOTICES_FALLBACK)),
      button('Try again', () => { void fill(); }, { id: 'licences-retry', class: 'btn small' }),
    ]);
    state = 'idle';
  }

  section.addEventListener('toggle', () => { if (section.open && state === 'idle') void fill(); });
  return section;
}
