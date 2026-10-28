// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { registry, resolveBuilder } from '../../packages/goreview/src';
import { classCards, classDeckFor, classFacts, CLASS_ESSENTIALS_DESCRIPTION, CLASS_ESSENTIALS_NOTES_LA, CLASS_LANGUAGES, isClassUnit } from '../../packages/gopractice/classEssentials';
import { decksKey, listSavedDecks, type SavedDeck } from '../../packages/gopractice/deckModel';
import { languageName } from '../../packages/gopractice/format';
import { defaultService, destroyRigs, dueCard, FakeService, ids, makeRig, queued, reopen, seed, until, type Rig } from './helpers';

afterEach(() => destroyRigs());
const A = ids('L1', 'sq');
const click = (el: Element): void => (el as HTMLElement).click();
const stored = async (rig: Rig, lang = 'sq'): Promise<SavedDeck[]> => {
  const key = decksKey('L1', lang);
  return ((await rig.area.get(key))[key] as { decks?: SavedDeck[] } | undefined)?.decks ?? [];
};

describe('Class Essentials: the cards', () => {
  it('has 28 cards in each of the seven languages (Latin is the seventh, added 2026-10-17): fourteen topics, ten number cards, no duplicates, nothing empty', () => {
    expect([...CLASS_LANGUAGES].sort()).toEqual(['de', 'es', 'hi', 'la', 'nb', 'sq', 'th']);
    for (const lang of CLASS_LANGUAGES) {
      const cards = classCards(lang);
      expect(cards, lang).toHaveLength(28);
      expect(new Set(cards.map((c) => c.topic)).size, lang).toBe(14);
      expect(cards.filter((c) => c.topic === 4), lang).toHaveLength(10);
      expect(new Set(cards.map((c) => c.unitId)).size, lang).toBe(28);
      expect(cards.every((c) => c.phrase.trim().length > 0 && c.english.trim().length > 0), lang).toBe(true);
      expect(cards.every((c) => isClassUnit(c.unitId) && c.unitId.startsWith(`class:${lang}:`)), lang).toBe(true);
    }
    expect(classCards('en')).toEqual([]);
    expect(classCards('no')).toHaveLength(28);          // the Norwegian code some enrolments use
    expect(classCards('sq-AL')).toHaveLength(28);       // a variety belongs to its language
    expect(classCards('la-ecclesiastical')).toHaveLength(28); // so do Latin's
  });

  it('keeps Thai and Hindi in their own scripts, and each language its own set', () => {
    expect(classCards('th').every((c) => /[฀-๿]/.test(c.phrase))).toBe(true);
    expect(classCards('hi').every((c) => /[ऀ-ॿ]/.test(c.phrase))).toBe(true);
    const hello = (lang: string): string => classCards(lang).find((c) => c.english === 'Hello')!.phrase;
    expect(['es', 'sq', 'th', 'hi', 'de', 'nb', 'la'].map(hello)).toEqual(['Hola', 'Përshëndetje', 'สวัสดี', 'नमस्ते', 'Hallo', 'Hei', 'Salve']);
    expect(classCards('de').find((c) => c.english === 'One coffee, please!')!.phrase).toBe('Einen Kaffee, bitte!');
    expect(classCards('nb').find((c) => c.english === 'Jesus is the Savior!')!.phrase).toBe('Jesus er Frelseren!');
    // the numbers are separate cards, in order
    expect(classCards('es').filter((c) => c.topic === 4).map((c) => c.phrase)).toEqual(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']);
  });

  it('has the Latin set (Church Latin phrasing), word for word, in class order, with the numbers as lower-case words', () => {
    expect(classCards('la').map((c) => [c.english, c.phrase])).toEqual([
      ['Hello', 'Salve'], ['Goodbye', 'Vale'], ['Please', 'Quaeso'], ['Thank you', 'Gratias tibi ago'], ["I'm sorry", 'Ignosce mihi'], ['Excuse me', 'Da veniam'],
      ['One', 'unus'], ['Two', 'duo'], ['Three', 'tres'], ['Four', 'quattuor'], ['Five', 'quinque'], ['Six', 'sex'], ['Seven', 'septem'], ['Eight', 'octo'], ['Nine', 'novem'], ['Ten', 'decem'],
      ['How much is this?', 'Quanti hoc constat?'], ['My name is…', 'Nomen mihi est…'], ["I'm from…", 'Sum ex…'], ['Where is the restroom?', 'Ubi est latrina?'],
      ['Water', 'Aqua'], ['Bottled water', 'Aqua in lagoena'], ['I would like…', 'Velim…'], ['Do you speak English?', 'Loquerisne Anglice?'], ['I do not understand', 'Non intellego'],
      ["I don't speak the country's language, but I would like to learn.", 'Latine non loquor, sed discere velim.'], ['Jesus is the Savior!', 'Iesus est Salvator!'], ['One coffee, please!', 'Unum caffeum, quaeso!'],
    ]);
    // Latin is written in Latin script with no Greek, Thai or Devanagari in it, and its ids are its own
    expect(classCards('la').every((c) => /^[A-Za-z…,.!? ]+$/.test(c.phrase) && c.unitId.startsWith('class:la:'))).toBe(true);
    expect(classFacts(classCards('la')[0].unitId, 'la-ecclesiastical')!.glosses).toEqual(['Hello']);
  });

  it('the Latin deck says it has not been reviewed by a Latinist (there is no native speaker to review it), the others by a native speaker', () => {
    const la = classDeckFor('la', 'la-ecclesiastical', '2026-10-17T00:00:00.000Z')!;
    expect(la.id).toBe('class-essentials:la');
    expect(la.languageId).toBe('la');
    expect(la.notes).toBe(CLASS_ESSENTIALS_NOTES_LA);
    expect(la.notes).toMatch(/not yet reviewed by a Latinist/);
    expect(la.notes).not.toMatch(/native speaker/);
    expect(la.items).toHaveLength(28);
    expect(classDeckFor('de', undefined, '')!.notes).toMatch(/not yet reviewed by a native speaker/);
  });

  it('answers the exercise engine with the phrase and its English meaning, and nothing for a unit it does not own', () => {
    const card = classCards('de')[0];
    const facts = classFacts(card.unitId, 'de')!;
    expect(facts.unit.label).toBe('Hallo');
    expect(facts.glosses).toEqual(['Hello']);
    expect(facts.status).toBe('provisional');
    expect(classFacts('lemma:de:hund:NOUN', 'de')).toBeUndefined();
    expect(classFacts(card.unitId, 'es')).toBeUndefined(); // another language's card is not this language's
  });

  it('every card of every language builds as a flashcard with the real written-recognition builder', async () => {
    const builder = resolveBuilder(registry as never, 'written-recognition')!;
    for (const lang of CLASS_LANGUAGES) {
      for (const card of classCards(lang)) {
        const target = { unitId: card.unitId, unitKind: 'lexeme', languageId: lang, dimension: 'written-recognition' } as never;
        const built = await builder.build(target, classFacts(card.unitId, lang)!, { now: '2026-10-16T00:00:00Z', random: () => 0 } as never);
        expect('unavailable' in built, `${lang}: ${card.phrase}`).toBe(false);
        if (!('unavailable' in built)) {
          expect(built.responseMode, `${lang}: ${card.phrase}`).toBe('typed-or-self');
          expect(built.prompt.stimulusText).toBe(card.phrase);
          expect(built.answerKey.accepted.length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('builds the deck with the owner\'s name and description, and notes that no native speaker has reviewed it', () => {
    const deck = classDeckFor('hi', undefined, '2026-10-16T00:00:00.000Z')!;
    expect(deck.id).toBe('class-essentials:hi');
    expect(deck.name).toBe('Class Essentials');
    expect(deck.description).toBe(CLASS_ESSENTIALS_DESCRIPTION);
    expect(CLASS_ESSENTIALS_DESCRIPTION).toBe('Essential phrases for language class.');
    expect(deck.notes).toMatch(/not yet reviewed by a native speaker/);
    expect(deck.items).toHaveLength(28);
    expect(classDeckFor('en', undefined, '')).toBeUndefined();
  });
});

describe('Class Essentials: in Saved decks', () => {
  it('is there on the first visit with no GoLearn encounter, and seeding again never duplicates it', async () => {
    const rig = await makeRig({ signedIn: true });
    expect(await stored(rig)).toHaveLength(1); // the first visit of the home already seeded it
    const first = await listSavedDecks(rig.app.ctx, 'L1', 'sq', 'sq-AL');
    const second = await listSavedDecks(rig.app.ctx, 'L1', 'sq', 'sq-AL');
    await rig.go('review/decks');
    await rig.go('review');
    expect(first.map((d) => d.id)).toEqual(['class-essentials:sq']);
    expect(second).toHaveLength(1);
    const decks = await stored(rig);
    expect(decks).toHaveLength(1);
    expect(decks[0].items).toHaveLength(28);
    expect(new Set(decks[0].items.map((i) => i.unitId)).size).toBe(28);
    expect(rig.q('#previous-count').textContent).toBe('1 saved');
  });

  it('lists it by name with its description and note, beside the decks the learner saved, which are untouched', async () => {
    const rig = await makeRig({ signedIn: true });
    await seed(rig, [...dueCard(A, 'zog', 'meaning-to-form'), ...dueCard(A, 'mace', 'meaning-to-form')]);
    await reopen(rig);
    click(rig.q('#save-deck'));
    await until(() => rig.q('#previous-count').textContent === '2 saved', 'the saved deck');
    const mine = (await stored(rig)).find((d) => !d.builtin)!;
    await rig.go('review/decks');
    await until(() => rig.qa('.deckrow').length === 2, 'both decks');
    expect(rig.q('h2#decks-title').textContent).toBe('Saved decks');
    const row = rig.q('[data-deck-id="class-essentials:sq"]');
    // the preloaded deck: its name as a bigger title, the count and language under it, no description or note (the owner, 2026-10-28)
    expect(row.querySelector('.deckrow-title')!.textContent).toBe('Class Essentials');
    expect(row.querySelector('.deckrow-line')!.textContent).toBe('28 cards · Albanian');
    expect(row.textContent).not.toContain('Essential phrases for language class.');
    expect(row.textContent).not.toContain('native speaker');
    expect(row.querySelector('.deckrow-note')).toBeNull();
    expect(rig.root.querySelector(`[data-deck-id="${mine.id}"] .deckrow-title`)).toBeNull(); // a deck the learner saved keeps its one line
    expect(rig.q(`[data-deck-id="${mine.id}"] .deckrow-line`).textContent).toMatch(/ · 2 cards · Albanian$/);
    expect((await stored(rig)).find((d) => d.id === mine.id)).toEqual(mine);
  });

  it('opens through the flashcard flow: the phrase, the meaning hidden, then revealed, graded once, and the ordinary queue never meets it', async () => {
    const rig = await makeRig({ signedIn: true, builders: registry as never });
    await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('[data-deck-id="class-essentials:sq"]'), 'the deck');
    click(rig.q('[data-deck-id="class-essentials:sq"] [data-action="practise-again"]'));
    await until(() => rig.app.current() === 'review/session' && !!rig.root.querySelector('#session .exercise'), 'the first card');
    const items = rig.app.ctx.run.active!.plan.items;
    expect(items).toHaveLength(28);
    expect(items.every((p) => p.family === 'written-recognition' && isClassUnit(p.item.unitId))).toBe(true);
    expect(rig.q('.exercise').classList.contains('flashcard')).toBe(true);
    expect(rig.q('#stimulus').textContent).toBe('Përshëndetje');
    expect(rig.q('#stimulus').getAttribute('lang')).toBe('sq-AL');
    expect(rig.root.querySelector('#revealed-answer')).toBeNull();           // the meaning is concealed
    expect(rig.root.querySelector('#pronounce')).not.toBeNull();             // Hear word is there (audio is available in the rig)
    click(rig.q('#reveal'));
    expect(rig.q('#revealed-answer').textContent).toBe('Hello');
    click(rig.q('[data-grade="good"]'));
    await until(async () => (await queued(rig)).some((e) => e.kind === 'CardReviewed'), 'the review event');
    const review = (await queued(rig)).find((e) => e.kind === 'CardReviewed')!;
    expect(review.subject.itemIds).toEqual(['class:sq:Përshëndetje']);

    // the cards are reviewed, but they stay out of the ordinary queue, My vocab's candidates and the home's deck
    await reopen(rig);
    expect(rig.q('#deck-count').getAttribute('data-cards')).toBe('0');
    expect(rig.q('#deck-count').textContent).toBe('Read with GoLearn to build your first deck');
    await rig.go('review/details');
    expect(rig.q('#deck').textContent).not.toContain('Përshëndetje');
  });

  it('Remove takes it out and it stays out; a quiet "Restore Class Essentials" brings it back once, without a duplicate', async () => {
    const rig = await makeRig({ signedIn: true });
    await rig.go('review/decks');
    await until(() => rig.qa('.deckrow').length === 1, 'the deck');
    expect(rig.root.querySelector('#restore-class-essentials')).toBeNull();
    click(rig.q('[data-deck-id="class-essentials:sq"] [data-action="remove-deck"]'));
    await until(() => !!rig.root.querySelector('#restore-class-essentials'), 'the restore link');
    expect(rig.qa('.deckrow')).toHaveLength(0);
    await listSavedDecks(rig.app.ctx, 'L1', 'sq');                         // another visit does not bring it back
    await rig.go('review'); await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('#restore-class-essentials'), 'still removed');
    expect(rig.qa('.deckrow')).toHaveLength(0);
    click(rig.q('#restore-class-essentials'));
    await until(() => rig.qa('.deckrow').length === 1, 'the deck again');
    expect(rig.root.querySelector('#restore-class-essentials')).toBeNull();
    expect((await stored(rig)).filter((d) => d.builtin)).toHaveLength(1);
  });

  it('shows the active language\'s own set, and no deck for a language without one', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'sq', varietyId: 'sq-AL' }, { languageId: 'de' }, { languageId: 'en' }]);
    const rig = await makeRig({ service, signedIn: true });
    // the language is switched on the home, the one place that shows the dropdown (2026-10-28: the top bar never carries it)
    const pick = async (enrolment: string): Promise<void> => {
      await rig.go('review');
      const select = rig.q<HTMLSelectElement>('#home-language #language-select');
      select.value = enrolment; select.dispatchEvent(new Event('change'));
      await until(() => { const now = rig.root.querySelector<HTMLSelectElement>('#home-language #language-select'); return !!now && now !== select && now.value === enrolment; }, 'the switch');
    };
    await pick('L1-e2');
    await rig.go('settings'); await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('.deckrow'), 'the German deck');
    expect(rig.q('.deckrow-title').textContent).toBe('Class Essentials');
    expect(rig.q('.deckrow-line').textContent).toBe('28 cards · German');
    expect((await stored(rig, 'de'))[0].items[0].label).toBe('Hallo');
    await pick('L1-e3');
    await rig.go('settings'); await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('#decks-empty'), 'no deck for English');
    expect(rig.root.querySelector('[data-deck-id^="class-essentials"]')).toBeNull();
    expect(await stored(rig, 'en')).toEqual([]);
    void defaultService;
  });

  it('seeds the Latin deck for a Latin enrolment once, however often the decks are opened, and lists it as Latin', async () => {
    const service = new FakeService();
    service.addAccount('ana@example.org', 'correct-horse-battery', 'L1', [{ languageId: 'la', varietyId: 'la-ecclesiastical' }]);
    const rig = await makeRig({ service, signedIn: true });
    expect(languageName('la')).toBe('Latin');
    expect(languageName('la-ecclesiastical')).toBe('Latin');
    expect(rig.q('#language-name').textContent).toBe('Latin'); // the GoReview home’s language kicker
    await rig.go('review/decks');
    await until(() => !!rig.root.querySelector('[data-deck-id="class-essentials:la"]'), 'the Latin deck');
    const row = rig.q('[data-deck-id="class-essentials:la"]');
    expect(row.querySelector('.deckrow-title')!.textContent).toBe('Class Essentials');
    expect(row.querySelector('.deckrow-line')!.textContent).toBe('28 cards · Latin');
    expect(row.textContent).not.toContain('Latinist'); // the note stays in the deck's record, not on this page
    await listSavedDecks(rig.app.ctx, 'L1', 'la', 'la-ecclesiastical');
    await listSavedDecks(rig.app.ctx, 'L1', 'la', 'la-ecclesiastical');
    await rig.go('review'); await rig.go('review/decks');
    const decks = await stored(rig, 'la');
    expect(decks).toHaveLength(1);
    expect(decks[0].items).toHaveLength(28);
    expect(new Set(decks[0].items.map((i) => i.unitId)).size).toBe(28);
    expect(decks[0].items[0].label).toBe('Salve');
  });
});
