// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Text } from '../../src/core';
import { AppRoutes, Shell } from '../../src/ui/App';
import { recordTeamImport } from '../../src/ui/goread/TeamTexts';
import { button, byLabel, click, makeHarness, pickFiles, q, qa } from './harness';
import type { Harness, Mounted } from './harness';

let h: Harness;
let mounted: Mounted | undefined;
beforeEach(async () => { h = await makeHarness(); });
afterEach(async () => { await mounted?.unmount(); mounted = undefined; vi.restoreAllMocks(); });

const app = () => <Shell><AppRoutes /></Shell>;
const open = async (router = '/team-texts') => { mounted = await h.mount(app(), { router }); return mounted; };
const section = () => byLabel(mounted!.container, 'Add a text');
const listSection = () => byLabel(mounted!.container, 'Team texts');
const json = (o: unknown, name: string) => new File([JSON.stringify(o)], name, { type: 'application/json' });
const fileInput = () => byLabel<HTMLInputElement>(section(), 'Choose text files to import');
const txt = (text: string, name = 'book.txt') => new File([text], name, { type: 'text/plain' });

/** Text I wrote for these tests (never a real book): Albanian, well over the 40 words the guesser needs. */
const ALBANIAN = 'Një ditë të bukur vjeshte, djali shkoi në mal me gjyshin e tij. Ai ishte i lumtur, sepse gjyshi i tregonte histori të vjetra për fshatin dhe për njerëzit që jetonin atje. '
  + 'Kur arritën në majë, ata ndenjën nën një pemë të madhe dhe hëngrën bukë me djathë. Pastaj gjyshi tha se nuk duhet të harrojmë kurrë se nga vijmë dhe ku shkojmë. '
  + 'Djali dëgjoi me vëmendje dhe ia premtoi gjyshit se do të kujtonte çdo fjalë që kishte thënë ai. Në mbrëmje ata u kthyen në shtëpi, të lodhur por të gëzuar, dhe nëna i priti me një gjellë të ngrohtë.';
const SPANISH = 'Era una tarde tranquila en el pueblo y los niños jugaban en la plaza mientras sus madres hablaban con las vecinas. El abuelo se sentó bajo el árbol y empezó a contar una historia que todos conocían, '
  + 'pero que nadie se cansaba de escuchar. Cuando terminó, la gente aplaudió, y una niña le preguntó si podía contarla otra vez al día siguiente porque quería aprenderla de memoria.';
const CHINESE = '那天下午村子里很安静，孩子们在广场上玩耍，母亲们和邻居聊天。爷爷坐在树下，开始讲一个大家都知道的故事，可是没有人听腻。他讲完以后，大家都鼓掌，一个小女孩问他明天能不能再讲一遍，因为她想把它背下来。';

const doc = (over: Record<string, unknown>, text: string) => ({ id: 'x', title: 'X', sections: [{ paragraphs: [{ text }] }], ...over });

const textRow = (over: Partial<Text> & { id: string; title: string }): Text => ({
  corpusId: 'ci-es', lang: 'es', kind: 'story', sourceId: 'src:team', importedAt: '2026-05-04T10:00:00.000Z', tags: [], editorialTags: [], prepTargets: [],
  reviewStatus: 'unreviewed', published: false, unpublishedReasons: ['Awaiting native-speaker review.'], schemaVersion: 2, generated: false, transformations: [], contentVersion: 1, ...over,
});

describe('Team Texts: the in-app importer', () => {
  it('has a Home back link, an "Add a text" section and an empty "Team texts" list', async () => {
    await open();
    expect(mounted!.container.textContent).toContain('Team Texts');
    expect(qa(mounted!.container, 'a').some((a) => a.getAttribute('href') === '/' && a.getAttribute('aria-label') === 'Home')).toBe(true);
    expect(fileInput().getAttribute('accept')).toBe('.json,application/json');
    expect(q(listSection(), '[data-testid="team-texts-empty"]')).not.toBeNull();
  });

  it('happy path: choose a file → validation report → import → the team record names who added it', async () => {
    await open();
    await pickFiles(fileInput(), [json({ id: 'my-story', title: 'My story' }, 'my-story.json')]);
    expect(h.controls.ingest.validate).toHaveBeenCalledWith([{ id: 'my-story', title: 'My story' }]);
    const report = q(mounted!.container, '[data-testid="import-report"]')!;
    expect(report.textContent).toContain('My story');
    expect(report.textContent).toContain('my-story.json');
    expect(report.textContent).toContain('valid');
    expect(h.controls.ingest.import).not.toHaveBeenCalled(); // checking is not importing
    expect(await h.store.meta.get('goread:es')).toBeUndefined();

    await click(button(section(), 'Import 1 document'));
    expect(h.controls.ingest.import).toHaveBeenCalledWith([{ id: 'my-story', title: 'My story' }]);
    expect(q(mounted!.container, '[data-testid="import-done"]')!.textContent).toContain('Import finished.');
    const result = qa(mounted!.container, '[data-testid="import-report"]').at(-1)!;
    expect(result.textContent).toContain('imported (new)');
    expect(result.textContent).toContain('Not published: Awaiting native-speaker review.');
    expect(result.textContent).toContain('Analysis coverage: 80%');

    const row = await h.store.meta.get('goread:es');
    expect(JSON.parse(row!.value)).toEqual([{ textId: 'text:es:my-story', by: 'Test learner', at: expect.any(String) }]);
    expect(q(listSection(), '[data-testid="team-texts-empty"]')).toBeNull();
    expect(q(listSection(), 'li.work[data-book]')!.textContent).toContain('My story');
  });

  it('a rejected file: shows the path, the message and how to fix it, and imports nothing', async () => {
    await open();
    await pickFiles(fileInput(), [json({ id: 'bad', title: 'Bad story', bad: true }, 'bad.json')]);
    const issue = q(mounted!.container, 'li.issue[data-severity="error"]')!;
    expect(issue.querySelector('.issue__path')!.textContent).toBe('title');
    expect(issue.textContent).toContain('title is required');
    expect(issue.textContent).toContain('How to fix: Add a non-empty "title".');
    expect(q(mounted!.container, '[data-testid="import-blocked"]')!.textContent).toContain('Nothing was imported');
    expect(qa(section(), 'button').some((b) => /^Import /.test(b.textContent ?? ''))).toBe(true);
    expect(button(section(), 'Import 1 document').disabled).toBe(true);
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(await h.store.meta.get('goread:es')).toBeUndefined();
  });

  it('one bad file blocks the whole batch, including the good one', async () => {
    await open();
    await pickFiles(fileInput(), [json({ id: 'good', title: 'Good' }, 'good.json'), json({ id: 'bad', title: 'Bad', bad: true }, 'bad.json')]);
    expect(qa(mounted!.container, 'section.import-doc')).toHaveLength(2);
    expect(button(section(), 'Import 2 documents').disabled).toBe(true);
    expect(q(mounted!.container, '[data-testid="import-blocked"]')).not.toBeNull();
  });

  it('a file that is not JSON is reported with a hint, and nothing else is imported with it', async () => {
    await open();
    await pickFiles(fileInput(), [new File(['{ not json'], 'broken.json', { type: 'application/json' })]);
    const issue = q(mounted!.container, 'li.issue')!;
    expect(issue.getAttribute('data-code')).toBe('invalid-json');
    expect(issue.textContent).toContain('not valid JSON');
    expect(issue.textContent).toContain('How to fix');
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
    expect(qa(section(), 'button').some((b) => /^Import /.test(b.textContent ?? ''))).toBe(false);
  });

  it('accepts a file holding an array of documents', async () => {
    await open();
    await pickFiles(fileInput(), [json([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }], 'pair.json')]);
    expect(qa(mounted!.container, 'section.import-doc')).toHaveLength(2);
    await click(button(section(), 'Import 2 documents'));
    expect(h.controls.ingest.import).toHaveBeenCalledWith([{ id: 'a', title: 'A' }, { id: 'b', title: 'B' }]);
    const entries = JSON.parse((await h.store.meta.get('goread:es'))!.value) as Array<{ textId: string }>;
    expect(entries.map((e) => e.textId).sort()).toEqual(['text:es:a', 'text:es:b']);
  });

  it('shows a valid document that was rejected only because of another one, with its note', async () => {
    h.controls.ingest.validate.mockImplementation(async (docs: unknown[]) => docs.map((d, i) => ({
      id: (d as { id: string }).id, action: 'rejected' as const, issues: [],
      note: i === 0 ? 'Not imported: another document in this batch has errors.' : undefined,
    })));
    await open();
    await pickFiles(fileInput(), [json([{ id: 'a', title: 'A' }], 'one.json')]);
    expect(q(mounted!.container, '[data-testid="import-note"]')!.textContent).toContain('another document in this batch has errors');
  });
});

describe('Team Texts: the list of what the team added', () => {
  it('lists what the team added, grouped by book, with who added it; a text in another language is not listed', async () => {
    await h.store.texts.bulkPut([
      textRow({ id: 'text:es:libro-1', title: 'Mi libro — Uno', sourceId: 'src:libro', chapter: { index: 1 } }),
      textRow({ id: 'text:es:libro-2', title: 'Mi libro — Dos', sourceId: 'src:libro', chapter: { index: 2 } }),
      textRow({ id: 'text:es:cuento', title: 'Un cuento', sourceId: 'src:cuento' }),
      textRow({ id: 'text:es:built-in', title: 'Built in story', sourceId: 'src:bundled' }), // never added through Team Texts
      textRow({ id: 'text:de:hallo', lang: 'de', corpusId: 'ci-de', title: 'Hallo Welt', sourceId: 'src:de' }),
    ]);
    const view = (id: string) => ({ id, action: 'created' as const, issues: [] });
    await recordTeamImport(h.store, 'es', [view('libro-1'), view('libro-2'), view('cuento'), { id: 'rechazado', action: 'rejected' as const, issues: [] }], 'Ana', '2026-05-04T10:00:00.000Z');
    await recordTeamImport(h.store, 'de', [view('hallo')], 'Ben', '2026-05-04T11:00:00.000Z');
    await open();

    const rows = qa(listSection(), 'li.work[data-book]');
    expect(rows).toHaveLength(2); // the two chapters are one book
    const book = rows.find((r) => (r.textContent ?? '').includes('Mi libro'))!;
    expect(book.querySelector('.work__added')!.textContent).toMatch(/^Added by Ana · /);
    const single = rows.find((r) => (r.textContent ?? '').includes('Un cuento'))!;
    expect(single.querySelector('.work__added')!.textContent).toContain('Added by Ana');
    expect(listSection().textContent).not.toContain('Built in story');
    expect(listSection().textContent).not.toContain('Hallo Welt');
    expect(q(listSection(), '[data-testid="team-texts-empty"]')).toBeNull();
  });

  it('recordTeamImport keeps the first author and time, skips rejected documents, and writes one array per language', async () => {
    const v = (id: string, action: 'created' | 'updated' | 'unchanged' | 'rejected' | 'valid') => ({ id, action, issues: [] });
    await recordTeamImport(h.store, 'es', [v('a', 'created'), v('b', 'unchanged'), v('c', 'rejected'), v('d', 'valid')], 'Ana', '2026-05-04T10:00:00.000Z');
    await recordTeamImport(h.store, 'es', [v('a', 'updated'), v('e', 'updated')], 'Ben', '2026-06-01T10:00:00.000Z');
    expect(JSON.parse((await h.store.meta.get('goread:es'))!.value)).toEqual([
      { textId: 'text:es:a', by: 'Ana', at: '2026-05-04T10:00:00.000Z' },
      { textId: 'text:es:b', by: 'Ana', at: '2026-05-04T10:00:00.000Z' },
      { textId: 'text:es:e', by: 'Ben', at: '2026-06-01T10:00:00.000Z' },
    ]);
    expect(await h.store.meta.get('goread:de')).toBeUndefined();
  });
});

describe('Team Texts: the language gate', () => {
  it('a .json text in another language is turned away kindly, and is never validated or imported', async () => {
    await open();
    const albanian = doc({ id: 'x', title: 'X', lang: 'sq' }, ALBANIAN);
    await pickFiles(fileInput(), [json(albanian, 'shqip.json')]);
    const report = q(mounted!.container, '[data-testid="import-report"]')!;
    expect(report.textContent).toContain('shqip.json');
    const issue = q(mounted!.container, 'li.issue[data-severity="error"]')!;
    expect(issue.getAttribute('data-code')).toBe('not-the-team-language');
    expect(issue.querySelector('.issue__path')!.textContent).toBe('lang');
    expect(issue.textContent).toContain('Thank you — but this text');
    expect(issue.textContent).toContain('Albanian');
    expect(issue.textContent).toContain('the Honduras team reads Spanish');
    expect(q(mounted!.container, '[data-testid="import-blocked"]')).not.toBeNull();
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(qa(section(), 'button').some((b) => /^Import \d/.test(b.textContent ?? '') && !(b as HTMLButtonElement).disabled)).toBe(false);
  });

  it('the same Albanian text with no language field is recognised by its words', async () => {
    await open();
    await pickFiles(fileInput(), [json(doc({ id: 'x2' }, ALBANIAN), 'unmarked.json')]);
    const issue = q(mounted!.container, 'li.issue[data-severity="error"]')!;
    expect(issue.getAttribute('data-code')).toBe('not-the-team-language');
    expect(issue.textContent).toContain('looks like Albanian');
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
  });

  it('a document marked as German is turned away even when its text is Spanish', async () => {
    await open();
    await pickFiles(fileInput(), [json(doc({ id: 'de', lang: 'de' }, SPANISH), 'de.json')]);
    const issue = q(mounted!.container, 'li.issue[data-severity="error"]')!;
    expect(issue.getAttribute('data-code')).toBe('not-the-team-language');
    expect(issue.textContent).toContain('is marked as German ("de")');
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
  });

  it('one text in the wrong language blocks the batch; the good Spanish one is not imported with it', async () => {
    await open();
    await pickFiles(fileInput(), [json(doc({ id: 'ok', lang: 'es' }, SPANISH), 'ok.json'), json(doc({ id: 'sq', lang: 'sq' }, ALBANIAN), 'sq.json')]);
    expect(q(mounted!.container, '[data-testid="import-blocked"]')).not.toBeNull();
    expect(qa(mounted!.container, 'li.issue[data-code="not-the-team-language"]')).toHaveLength(1);
    const validated = h.controls.ingest.validate.mock.calls.flatMap((c) => c[0] as Array<{ id: string }>);
    expect(validated.map((d) => d.id)).not.toContain('sq');
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
    expect(await h.store.meta.get('goread:es')).toBeUndefined();
  });

  it('Spanish text marked Spanish passes to the validator', async () => {
    await open();
    const spanish = doc({ id: 'ok', lang: 'es' }, SPANISH);
    await pickFiles(fileInput(), [json(spanish, 'ok.json')]);
    expect(h.controls.ingest.validate).toHaveBeenCalledWith([spanish]);
    expect(q(mounted!.container, 'li.issue[data-code="not-the-team-language"]')).toBeNull();
    expect(button(section(), 'Import 1 document').disabled).toBe(false);
  });

  it('a document with no language and only a few words passes to the validator (short texts are not judged)', async () => {
    await open();
    const short = doc({ id: 'short' }, 'Hello there, this is a short note');
    await pickFiles(fileInput(), [json(short, 'short.json')]);
    expect(h.controls.ingest.validate).toHaveBeenCalledWith([short]);
    expect(q(mounted!.container, 'li.issue[data-code="not-the-team-language"]')).toBeNull();
    expect(q(mounted!.container, '[data-testid="import-blocked"]')).toBeNull();
  });

  it('a .txt in Mandarin is turned away before any conversion', async () => {
    await open();
    await click(button(section(), 'Add a book from a text file'));
    await pickFiles(byLabel<HTMLInputElement>(section(), 'Choose a text file with the text of a book'), [txt(CHINESE, 'xiaoshuo.txt')]);
    // the check may come at once or when the title is confirmed: press "Check this file" if the importer is asking for it
    const check = qa<HTMLButtonElement>(section(), 'button').find((b) => (b.textContent ?? '').trim() === 'Check this file');
    if (check) await click(check);
    const alert = q(section(), 'p[role="alert"].error')!;
    expect(alert).not.toBeNull();
    expect(alert.textContent).toContain('Thank you — but this text');
    expect(alert.textContent).toContain('Chinese');
    expect(alert.textContent).toContain('the Honduras team reads Spanish');
    expect(h.controls.ingest.convertPlainText).not.toHaveBeenCalled();
    expect(h.controls.ingest.validate).not.toHaveBeenCalled();
    expect(q(section(), '[data-testid="copy-preview"]')).toBeNull();
    expect(h.controls.ingest.import).not.toHaveBeenCalled();
  });
});

describe('Home: the Team Texts entry', () => {
  it('sits right after Testimony and leads to /team-texts', async () => {
    await open('/');
    const entries = qa<HTMLAnchorElement>(mounted!.container, 'a.home__entry');
    const hrefs = entries.map((a) => a.getAttribute('href'));
    const team = entries.find((a) => a.getAttribute('href') === '/team-texts')!;
    expect(team).toBeDefined();
    expect(hrefs.indexOf('/team-texts')).toBe(hrefs.indexOf('/testimony') + 1);
    expect(team.querySelector('.home__entry-name')!.textContent).toBe('Team Texts');
    expect(team.querySelector('.home__entry-sub')!.textContent).toBe('GoRead — what your team reads');
  });
});
