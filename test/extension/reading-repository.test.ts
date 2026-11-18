// @vitest-environment node
/**
 * Reading Analysis, reconciliation: what the extension's background says a learner knows of a text's words must agree EXACTLY, unit by
 * unit, with the authoritative Repository projection (the account service's own rows), and nothing of the learner's history may change.
 *
 * The account is the service's handler over the real projection engine; the device is the real background worker with its real on-device
 * Repository (see reading.support.ts). Three independent statements are compared for every word:
 *   - what the history was BUILT to mean (the level written beside each seeded word);
 *   - what the account's projection says (`GET /knowledge`), read through the pure rule (`classifyWord`) and through a hand-written oracle;
 *   - what the background answered (`op: 'classify'`).
 */
import { describe, expect, it } from 'vitest';
import type { GoEvent, UnitKnowledge } from '../../packages/repository-contract/src';
import type { KnowledgeLevel } from '../../packages/repository-contract/src/knowledge-levels';
import { classifiedVarietiesOf, knowledgeInVariety, ownKnowledgeOf } from '../../packages/repository-contract/src/varieties';
import { createFsrsScheduler, foldDeck } from '../../packages/goreview/src/scheduler';
import { MSG } from '../../packages/golearn-extension/src/platform';
import { GRANT_PREFIX } from '../../packages/golearn-extension/src/background/reading';
import { classifyWord } from '../../packages/golearn-extension/src/reading/classify';
import { MAX_WORDS_PER_MESSAGE, type WireVerdict, type WireWord } from '../../packages/golearn-extension/src/reading/protocol';
import { pendingEvent } from './rig';
import { pullPositionOf } from '../../packages/repository-local/src';
import {
  accountEvents, accountRows, ago, allDeviceRows, cardAdded, classifyAll, createAccount, createReadingRig, createRealService, deviceEvents, deviceMark, deviceRows,
  eventOf, formId, idsOf, lemmaId, lookedUp, marked, met, oracleVerdict, pause, quiet, reviewed, rowFacts, sendToAccount, shownLevel, signIn, snapshotOf, until, wordOf,
  type Phone, type ReadingRig,
} from './reading.support';

const EMAIL = 'ana@example.com';
const LONG = 180_000;
const isKnown = (l: KnowledgeLevel): boolean => l === 'known' || l === 'automatic';

/** One seeded word: the events that make its history, and what that history was built to mean. */
interface Seed { w: string; lang: string; level: KnowledgeLevel; verdict: 'known' | 'below'; events(p: Phone): GoEvent[]; note: string }

const L = lemmaId;
const F = formId;
const both = (lang: string, w: string): string[] => [L(lang, w), F(lang, w)];

/** Histories that end at each of the six levels, by evidence and by the learner's own marks, in two languages. */
const SEEDS: Seed[] = [
  // ── new ──
  { w: 'shenjëere', lang: 'sq', level: 'new', verdict: 'below', note: 'the learner marked it New', events: (p) => [marked(p, both('sq', 'shenjëere'), 'new', { at: ago(9) })] },
  { w: 'kalimtare', lang: 'sq', level: 'new', verdict: 'below', note: 'met on a page only, never clicked: Seen in the Repository, shown as New', events: (p) => [met(p, both('sq', 'kalimtare'), { at: ago(9) })] },
  { w: 'dijeharruar', lang: 'sq', level: 'new', verdict: 'below', note: 'marked Known, then marked New: the later mark stands', events: (p) => [marked(p, both('sq', 'dijeharruar'), 'known', { at: ago(9) }), marked(p, both('sq', 'dijeharruar'), 'new', { at: ago(8) })] },
  // ── seen ──
  { w: 'parë', lang: 'sq', level: 'seen', verdict: 'below', note: 'looked up once', events: (p) => [lookedUp(p, both('sq', 'parë'), { at: ago(9) })] },
  { w: 'shenjëparë', lang: 'sq', level: 'seen', verdict: 'below', note: 'marked Seen', events: (p) => [marked(p, both('sq', 'shenjëparë'), 'seen', { at: ago(9) })] },
  { w: 'rishikuar', lang: 'sq', level: 'seen', verdict: 'below', note: 'marked New, then looked up: a later meeting releases New to Seen', events: (p) => [marked(p, both('sq', 'rishikuar'), 'new', { at: ago(9) }), lookedUp(p, both('sq', 'rishikuar'), { at: ago(8) })] },
  // ── recognized ──
  { w: 'njohur', lang: 'sq', level: 'recognized', verdict: 'below', note: 'one correct answer in review', events: (p) => [reviewed(p, L('sq', 'njohur'), { at: ago(9) })] },
  { w: 'shenjënjohur', lang: 'sq', level: 'recognized', verdict: 'below', note: 'marked Recognized', events: (p) => [lookedUp(p, both('sq', 'shenjënjohur'), { at: ago(9) }), marked(p, both('sq', 'shenjënjohur'), 'recognized', { at: ago(9, 60_000) })] },
  // ── familiar ──
  { w: 'afërt', lang: 'sq', level: 'familiar', verdict: 'below', note: 'two correct answers in review', events: (p) => [reviewed(p, L('sq', 'afërt'), { at: ago(9) }), reviewed(p, L('sq', 'afërt'), { at: ago(8) })] },
  { w: 'shenjëafërt', lang: 'sq', level: 'familiar', verdict: 'below', note: 'marked Familiar', events: (p) => [marked(p, [L('sq', 'shenjëafërt')], 'familiar', { at: ago(9) })] },
  { w: 'gjashtëherë', lang: 'sq', level: 'familiar', verdict: 'below', note: 'six correct answers, none typed: not enough for Known', events: (p) => [6, 5, 4, 3, 2, 1].map((d) => reviewed(p, L('sq', 'gjashtëherë'), { at: ago(d + 3) })) },
  // ── known ──
  { w: 'ditur', lang: 'sq', level: 'known', verdict: 'known', note: 'four typed correct answers on four days', events: (p) => [cardAdded(p, L('sq', 'ditur'), { at: ago(10) }), ...[9, 8, 7, 6].map((d) => reviewed(p, L('sq', 'ditur'), { at: ago(d), typed: true }))] },
  { w: 'shenjëditur', lang: 'sq', level: 'known', verdict: 'known', note: 'looked up, then marked Known on the card', events: (p) => [lookedUp(p, both('sq', 'shenjëditur'), { at: ago(9) }), marked(p, both('sq', 'shenjëditur'), 'known', { at: ago(9, 60_000) })] },
  { w: 'ngritur', lang: 'sq', level: 'known', verdict: 'known', note: 'marked Familiar, later marked Known', events: (p) => [marked(p, [L('sq', 'ngritur')], 'familiar', { at: ago(9) }), marked(p, [L('sq', 'ngritur')], 'known', { at: ago(8) })] },
  { w: 'qëndrueshme', lang: 'sq', level: 'known', verdict: 'known', note: 'marked Known, looked up afterwards: the mark holds', events: (p) => [marked(p, both('sq', 'qëndrueshme'), 'known', { at: ago(9) }), lookedUp(p, both('sq', 'qëndrueshme'), { at: ago(8) })] },
  { w: 'vjetërshenjë', lang: 'sq', level: 'known', verdict: 'known', note: 'the older mark word "productive" (I can use it) means Known', events: (p) => [marked(p, [L('sq', 'vjetërshenjë')], 'productive', { at: ago(9) })] },
  // ── automatic ──
  { w: 'vetvetishme', lang: 'sq', level: 'automatic', verdict: 'known', note: 'marked Automatic', events: (p) => [marked(p, both('sq', 'vetvetishme'), 'automatic', { at: ago(9) })] },
  // ── a second language ──
  { w: 'casa', lang: 'es', level: 'known', verdict: 'known', note: 'Spanish, marked Known', events: (p) => [lookedUp(p, both('es', 'casa'), { at: ago(9) }), marked(p, both('es', 'casa'), 'known', { at: ago(9, 60_000) })] },
  { w: 'automática', lang: 'es', level: 'automatic', verdict: 'known', note: 'Spanish, marked Automatic', events: (p) => [marked(p, [L('es', 'automática')], 'automatic', { at: ago(9) })] },
  { w: 'perro', lang: 'es', level: 'familiar', verdict: 'below', note: 'Spanish, two correct answers', events: (p) => [reviewed(p, L('es', 'perro'), { at: ago(9) }), reviewed(p, L('es', 'perro'), { at: ago(8) })] },
  { w: 'gato', lang: 'es', level: 'seen', verdict: 'below', note: 'Spanish, looked up', events: (p) => [lookedUp(p, both('es', 'gato'), { at: ago(9) })] },
  { w: 'reconocida', lang: 'es', level: 'recognized', verdict: 'below', note: 'Spanish, one correct answer', events: (p) => [reviewed(p, L('es', 'reconocida'), { at: ago(9) })] },
  { w: 'sabida', lang: 'es', level: 'known', verdict: 'known', note: 'Spanish, four typed correct answers', events: (p) => [9, 8, 7, 6].map((d) => reviewed(p, L('es', 'sabida'), { at: ago(d), typed: true })) },
];
/** Words nothing was ever recorded about. */
const UNRECORDED: Array<{ w: string; lang: string }> = [{ w: 'panjohur', lang: 'sq' }, { w: 'asnjëherë', lang: 'sq' }, { w: 'desconocida', lang: 'es' }];

async function seededAccount(languages: Array<string | { languageId: string; varietyId?: string }> = ['sq', 'es']) {
  const svc = createRealService();
  const phone = await createAccount(svc, EMAIL, languages);
  return { svc, phone };
}

/** Asks the background about `words` (as an extension page) and returns verdicts by word key. */
const keyOf = (w: WireWord): string => w.join(' | ');

describe('1. every knowledge level, by evidence and by mark, in two languages: the background agrees with the account, unit by unit', () => {
  it('unit id, language, level and presence of every row agree; every verdict equals the rule and the oracle applied to the ACCOUNT rows', async () => {
    const { svc, phone } = await seededAccount();
    await sendToAccount(phone, SEEDS.flatMap((s) => s.events(phone)));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);

    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified', unsent: 0 });
    expect(snap.reason).toBeUndefined();
    expect(typeof snap.verifiedAt).toBe('number');

    for (const lang of ['sq', 'es']) {
      const seeds = SEEDS.filter((s) => s.lang === lang);
      const words: WireWord[] = [...seeds.map((s) => wordOf(lang, s.w)), ...UNRECORDED.filter((u) => u.lang === lang).map((u) => wordOf(lang, u.w))];
      const ids = idsOf(words);
      const got = await classifyAll(rig, lang, words, snap.id);
      expect(got.asked).toBe(ids.length);
      expect(got.answered).toBe(got.asked);

      // the authority, fetched independently of the device
      const account = await accountRows(phone.api, ids);
      const device = await deviceRows(rig, ids);
      const identity = await rig.local({ op: 'identity' });

      // (a) row by row: the device holds a row exactly where the account does, with the same unit, language, level, mark and meeting count
      for (const id of ids) {
        const a = account.get(id);
        const d = device.get(id);
        expect(!!d, `${id}: a row on the device ${d ? 'without' : 'missing beside'} one on the account`).toBe(!!a);
        if (!a || !d) continue;
        expect(rowFacts(d), id).toEqual(rowFacts(a));
        expect(d.dimensions, id).toEqual(a.dimensions);
        expect(a.learnerId).toBe(phone.learnerId);
        expect(d.learnerId).toBe(identity.learnerId); // the device's own learner, never the account's id
        expect(d.languageId).toBe(lang);
      }

      // (b) word by word
      words.forEach((word, i) => {
        const [form, lemma] = word;
        const verdict = got.verdicts[i]!;
        const seed = seeds.find((s) => s.w === form!.split(':')[2]);
        // the pure rule, on the account's rows
        expect(verdict, `${keyOf(word)} against classifyWord on the account's rows`).toEqual(classifyWord(word, (id) => account.get(id), lang));
        // the hand-written oracle, on the account's rows
        expect(verdict, `${keyOf(word)} against the oracle`).toEqual(oracleVerdict(account.get(form!), account.get(lemma!)));
        // what the history was built to mean
        if (seed) {
          expect(verdict, `${seed.w}: ${seed.note}`).toEqual([seed.verdict, seed.level]);
          expect(isKnown(verdict[1])).toBe(seed.verdict === 'known');
        } else {
          // verified absence: asked, answered, and neither the account nor the device holds a row
          expect(account.has(form!) || account.has(lemma!)).toBe(false);
          expect(device.has(form!) || device.has(lemma!)).toBe(false);
          expect(verdict).toEqual(['below', 'new']);
        }
      });
    }
  }, LONG);

  it('the account row itself carries the level each history was built for (the seed is what it claims to be)', async () => {
    const { phone } = await seededAccount();
    await sendToAccount(phone, SEEDS.flatMap((s) => s.events(phone)));
    const rows = await accountRows(phone.api, SEEDS.map((s) => L(s.lang, s.w)));
    for (const s of SEEDS) {
      const row = rows.get(L(s.lang, s.w));
      expect(row, s.w).toBeDefined();
      // the one history whose Repository level and shown level differ by design: met only in passing
      const expected = s.w === 'kalimtare' ? 'seen' : s.level;
      expect(row!.level, `${s.w}: ${s.note}`).toBe(expected);
      expect(row!.languageId).toBe(s.lang);
    }
    // all six levels are present among the account's rows
    expect(new Set([...rows.values()].map((r) => r.level))).toEqual(new Set(['new', 'seen', 'recognized', 'familiar', 'known', 'automatic']));
  }, LONG);

  it('what goes back to the tab is a level per word and how the snapshot was verified: no learner id, no token, no row', async () => {
    const { svc, phone } = await seededAccount();
    await sendToAccount(phone, SEEDS.flatMap((s) => s.events(phone)));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect(await rig.reading({ op: 'grant', tabId: 7 }, 'page')).toEqual({ ok: true, op: 'grant' });
    const snapshot = await rig.reading({ op: 'snapshot', languageId: 'sq' }, 'content');
    expect(snapshot.ok).toBe(true);
    const id = (snapshot as unknown as { snapshot: { id: string } }).snapshot.id;
    const words = SEEDS.filter((s) => s.lang === 'sq').map((s) => wordOf('sq', s.w));
    const classified = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: id, words }, 'content');
    expect(classified.ok).toBe(true);
    const identity = await rig.local({ op: 'identity' });
    const session = (await rig.fake.local.get('golearn:session'))['golearn:session'] as { token: string; learnerId: string; email: string };
    const wire = JSON.stringify([snapshot, classified]);
    for (const secret of [phone.learnerId, session.learnerId, session.token, session.email, identity.learnerId, identity.deviceId, ...Object.values(phone.enrolments)]) expect(wire).not.toContain(secret);
    expect(wire).not.toMatch(/learnerId|enrolmentId|deviceId|dimensions|selfMark|token/);
    expect(Object.keys(classified).sort()).toEqual(['answered', 'asked', 'ok', 'op', 'snapshot', 'verdicts']);
    expect(Object.keys((snapshot as unknown as { snapshot: object }).snapshot).sort()).toEqual(['added', 'authority', 'id', 'state', 'unsent', 'verifiedAt']);
  }, LONG);

  it('a spelling with two readings, a form with no reading, and a word nothing identifies', async () => {
    const { svc, phone } = await seededAccount();
    await sendToAccount(phone, [
      marked(phone, [L('sq', 'verë', 'NOUN')], 'known', { at: ago(5) }),          // "verë" the wine: known
      lookedUp(phone, [L('sq', 'verë', 'ADJ'), F('sq', 'verë')], { at: ago(4) }),  // "verë" the other word: only looked up
      marked(phone, [L('sq', 'dy', 'NUM')], 'known', { at: ago(5) }),
      marked(phone, [L('sq', 'dy', 'DET')], 'automatic', { at: ago(5) }),
      marked(phone, [F('sq', 'vetëmformë')], 'known', { at: ago(5) }),             // the learner marked this spelling; no lemma is known for it
    ]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const snap = await snapshotOf(rig);
    const words: WireWord[] = [
      [F('sq', 'verë'), L('sq', 'verë', 'NOUN'), L('sq', 'verë', 'ADJ')],  // known in one reading, not the other
      [F('sq', 'dy'), L('sq', 'dy', 'NUM'), L('sq', 'dy', 'DET')],        // known whichever is meant
      [F('sq', 'vetëmformë')],                                               // no reading, but a record of the form
      [F('sq', 'askundgjetur')],                                             // no reading, no record
      [F('sq', 'verë'), L('sq', 'verë', 'NOUN')],                           // the same spelling sent with one reading only
    ];
    const got = await classifyAll(rig, 'sq', words, snap.id);
    const account = await accountRows(phone.api, idsOf(words));
    words.forEach((w, i) => expect(got.verdicts[i], keyOf(w)).toEqual(classifyWord(w, (id) => account.get(id), 'sq')));
    expect(got.verdicts[0]![0]).toBe('ambiguous');          // never credited, never called unknown
    expect(got.verdicts[1]).toEqual(['known', 'known']);    // the lower of the two levels it is known at
    expect(got.verdicts[2]).toEqual(['known', 'known']);    // the form's own record answers
    expect(got.verdicts[3]).toEqual(['unidentified', 'new']);
    expect(got.verdicts[4]).toEqual(['known', 'known']);
    expect(got.asked).toBe(idsOf(words).length);
    expect(got.answered).toBe(got.asked);
  }, LONG);
});

// ───────────────────────────── 2. a large history, many batches ─────────────────────────────

const BIG = 1_900; // words: 3,800 distinct unit ids (a form and a lemma each)
const bigWord = (i: number): string => `fjalë${String(i).padStart(4, '0')}`;
/** What word `i` of the large history was built to be (eight histories, interleaved so that every batch and every chunk of 200 ids holds all of them). */
const BIG_PLAN: Array<{ verdict: 'known' | 'below'; level: KnowledgeLevel }> = [
  { verdict: 'known', level: 'known' },       // 0 looked up twice, then marked Known
  { verdict: 'known', level: 'automatic' },   // 1 looked up twice, then marked Automatic (the lemma)
  { verdict: 'below', level: 'familiar' },    // 2 looked up twice, then marked Familiar (the lemma)
  { verdict: 'below', level: 'recognized' },  // 3 looked up twice, then marked Recognized
  { verdict: 'below', level: 'seen' },        // 4 looked up twice
  { verdict: 'below', level: 'new' },         // 5 met on a page only
  { verdict: 'below', level: 'new' },         // 6 marked New
  { verdict: 'below', level: 'new' },         // 7 nothing recorded
];

function bigHistory(p: Phone): GoEvent[] {
  const events: GoEvent[] = [];
  const all = Array.from({ length: BIG }, (_, i) => i);
  const of = (k: number): number[] => all.filter((i) => i % 8 === k);
  // the lookups: two for every word of the first five histories, dated before the marks
  for (const round of [0, 1]) for (const i of all.filter((n) => n % 8 <= 4)) events.push(lookedUp(p, both('sq', bigWord(i)), { at: ago(30 - round, i * 1000) }));
  const inGroups = (list: number[], size: number): number[][] => { const out: number[][] = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; };
  for (const g of inGroups(of(0), 50)) events.push(marked(p, g.flatMap((i) => both('sq', bigWord(i))), 'known', { at: ago(9) }));
  for (const g of inGroups(of(1), 100)) events.push(marked(p, g.map((i) => L('sq', bigWord(i))), 'automatic', { at: ago(9) }));
  for (const g of inGroups(of(2), 100)) events.push(marked(p, g.map((i) => L('sq', bigWord(i))), 'familiar', { at: ago(9) }));
  for (const g of inGroups(of(3), 50)) events.push(marked(p, g.flatMap((i) => both('sq', bigWord(i))), 'recognized', { at: ago(9) }));
  for (const g of inGroups(of(5), 50)) events.push(met(p, g.flatMap((i) => both('sq', bigWord(i))), { at: ago(9) }));
  for (const g of inGroups(of(6), 50)) events.push(marked(p, g.flatMap((i) => both('sq', bigWord(i))), 'new', { at: ago(9) }));
  return events;
}

describe('2. a large history asked in many batches: every unit id is answered, and the union equals the account projection', () => {
  it('3,800 distinct ids over five messages; nothing stops after 60 or 200 ids; more than 400 words is refused, never trimmed', async () => {
    const { svc, phone } = await seededAccount(['sq']);
    const history = bigHistory(phone);
    expect(history.length).toBeGreaterThan(2_300); // three pages of the account's event list
    await sendToAccount(phone, history);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);

    const status = await rig.local({ op: 'status' });
    expect(status.fromAccount).toBe(history.length); // every event of the account is on the device
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified' });

    // count what the device Repository is really asked (the calls go through untouched)
    const repo = (await rig.bg.local.open())!;
    const askedOfRepository: string[][] = [];
    const knowledge = repo.api.knowledge.bind(repo.api);
    repo.api.knowledge = ((unitIds?: string[], opts?: { languageId?: string }) => { askedOfRepository.push([...(unitIds ?? [])]); return knowledge(unitIds, opts); }) as typeof repo.api.knowledge;

    const words = Array.from({ length: BIG }, (_, i) => wordOf('sq', bigWord(i)));
    const ids = idsOf(words);
    expect(ids).toHaveLength(3_800);
    const got = await classifyAll(rig, 'sq', words, snap.id, { batch: 380 });
    repo.api.knowledge = knowledge as typeof repo.api.knowledge;

    expect(got.messages).toBe(5);
    for (const m of got.perMessage) {
      expect(m.words).toBe(380);
      expect(m.asked).toBe(760);          // every id of the message, not the first 60 or 200
      expect(m.answered).toBe(m.asked);
    }
    expect(got.verdicts).toHaveLength(BIG);
    // the Repository was asked about each of the 3,800 ids exactly once, in requests of at most 200
    expect(askedOfRepository.every((c) => c.length > 0 && c.length <= 200)).toBe(true);
    expect(askedOfRepository).toHaveLength(20);
    expect(askedOfRepository.flat().sort()).toEqual([...ids].sort());

    const account = await accountRows(phone.api, ids);
    const device = await deviceRows(rig, ids);
    expect([...device.keys()].sort()).toEqual([...account.keys()].sort()); // the same units have a row, no more, no fewer
    for (const id of ids) {
      const a = rowFacts(account.get(id));
      const d = rowFacts(device.get(id));
      if (JSON.stringify(a) !== JSON.stringify(d)) throw new Error(`${id}: the device says ${JSON.stringify(d)}, the account ${JSON.stringify(a)}`);
    }

    const counts: Record<string, number> = {};
    words.forEach((word, i) => {
      const v = got.verdicts[i]!;
      const plan = BIG_PLAN[i % 8]!;
      if (v[0] !== plan.verdict || v[1] !== plan.level) throw new Error(`word ${i} (${word[0]}): ${JSON.stringify(v)}, built to be ${JSON.stringify(plan)}`);
      const rule = classifyWord(word, (id) => account.get(id), 'sq');
      const oracle = oracleVerdict(account.get(word[0]), account.get(word[1]!));
      if (v[0] !== rule[0] || v[1] !== rule[1]) throw new Error(`word ${i}: ${JSON.stringify(v)} against the rule on the account rows ${JSON.stringify(rule)}`);
      if (v[0] !== oracle[0] || v[1] !== oracle[1]) throw new Error(`word ${i}: ${JSON.stringify(v)} against the oracle ${JSON.stringify(oracle)}`);
      counts[`${v[0]}/${v[1]}`] = (counts[`${v[0]}/${v[1]}`] ?? 0) + 1;
    });
    const per = (k: number): number => Array.from({ length: BIG }, (_, i) => i).filter((i) => i % 8 === k).length;
    expect(counts).toEqual({ 'known/known': per(0), 'known/automatic': per(1), 'below/familiar': per(2), 'below/recognized': per(3), 'below/seen': per(4), 'below/new': per(5) + per(6) + per(7) });
    // known words far past the old limits, in the last message as in the first
    expect(got.verdicts[1_896]).toEqual(['known', 'known']);
    expect(got.verdicts[1_897]).toEqual(['known', 'automatic']);

    // the limit of a message: 400 words are answered whole, 401 are refused whole
    const full = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: words.slice(0, MAX_WORDS_PER_MESSAGE) });
    expect(full).toMatchObject({ ok: true, op: 'classify', asked: 800, answered: 800 });
    expect((full as unknown as { verdicts: WireVerdict[] }).verdicts).toHaveLength(400);
    const over = await rig.reading({ op: 'classify', languageId: 'sq', snapshot: snap.id, words: words.slice(0, MAX_WORDS_PER_MESSAGE + 1) });
    expect(over).toMatchObject({ ok: false, error: 'too-many' });
    expect((over as { verdicts?: unknown }).verdicts).toBeUndefined();
  }, 600_000);
});

// ───────────────────────────── 3. another device changes the account ─────────────────────────────

const getEvents = (rig: ReadingRig, from = 0): number => rig.log.slice(from).filter((l) => l.method === 'GET' && l.path === '/events').length;

describe('3. a change made on another device reaches the analysis without signing out', () => {
  it('a snapshot pulls it in: Familiar on the account becomes Known, and the next classify says so', async () => {
    const { svc, phone } = await seededAccount(['sq']);
    const word = wordOf('sq', 'rritje');
    await sendToAccount(phone, [reviewed(phone, word[1]!, { at: ago(9) }), reviewed(phone, word[1]!, { at: ago(8) })]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const first = await snapshotOf(rig);
    expect(first).toMatchObject({ state: 'verified', added: 0 });
    expect((await classifyAll(rig, 'sq', [word], first.id)).verdicts).toEqual([['below', 'familiar']]);

    // the phone: the learner marks the word Known in GoReview
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(0, -60_000), app: 'gopractice-review' })]);
    expect((await accountRows(phone.api, [word[1]!])).get(word[1]!)!.level).toBe('known');

    const second = await snapshotOf(rig);
    expect(second).toMatchObject({ authority: 'account', state: 'verified', added: 1 });
    expect(second.id).not.toBe(first.id);
    // a batch that still names the old snapshot is not answered from the new state
    expect(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: first.id, words: [word] })).toMatchObject({ ok: false, error: 'snapshot-changed' });
    const got = await classifyAll(rig, 'sq', [word], second.id);
    const account = await accountRows(phone.api, idsOf([word]));
    expect(got.verdicts).toEqual([['known', 'known']]);
    expect(got.verdicts[0]).toEqual(classifyWord(word, (id) => account.get(id), 'sq'));
  }, LONG);

  it('enough correct typed answers on another device (no mark) do the same', async () => {
    const { svc, phone } = await seededAccount(['sq']);
    const word = wordOf('sq', 'përparim');
    await sendToAccount(phone, [reviewed(phone, word[1]!, { at: ago(9), typed: true }), reviewed(phone, word[1]!, { at: ago(8), typed: true })]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const first = await snapshotOf(rig);
    expect((await classifyAll(rig, 'sq', [word], first.id)).verdicts).toEqual([['below', 'familiar']]);
    await sendToAccount(phone, [reviewed(phone, word[1]!, { at: ago(6), typed: true }), reviewed(phone, word[1]!, { at: ago(4), typed: true })]);
    const second = await snapshotOf(rig);
    expect(second).toMatchObject({ state: 'verified', added: 2 });
    expect((await classifyAll(rig, 'sq', [word], second.id)).verdicts).toEqual([['known', 'known']]);
    expect((await accountRows(phone.api, [word[1]!])).get(word[1]!)!.level).toBe('known');
  }, LONG);

  it('a deletion made on another device (the learner removes an event from the account) reaches the analysis too', async () => {
    // FINDING: the device Repository only ever ADDS what the account holds (repository-local/src/transfer.ts `pull` reads GET /events after
    // its cursor; nothing reads the account's tombstones). When the learner deletes an event, a source or a time range on the account
    // (POST /tombstones: the events are removed there and the projection refolded), the device keeps them and goes on counting them, and the
    // snapshot is `verified`: nothing new lies after the cursor. The figure then rests on a record the learner deleted.
    const { svc, phone } = await seededAccount(['sq']);
    const word = wordOf('sq', 'fshirë');
    const mark = marked(phone, [word[1]!], 'known', { at: ago(5) });
    await sendToAccount(phone, [lookedUp(phone, both('sq', 'tjetër'), { at: ago(6) }), mark]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const first = await snapshotOf(rig);
    expect(first).toMatchObject({ state: 'verified' });
    expect((await classifyAll(rig, 'sq', [word], first.id)).verdicts).toEqual([['known', 'known']]);

    // on the phone: the learner deletes that mark
    const deleted = await phone.api.putTombstone({ kind: 'event', id: mark.id }, 'marked by mistake');
    expect(deleted.ok && deleted.data.applied?.events).toBe(1);
    const account = await accountRows(phone.api, idsOf([word]));
    const authoritative = classifyWord(word, (id) => account.get(id), 'sq');
    expect(authoritative).toEqual(['below', 'new']);
    expect((await accountEvents(svc, phone.learnerId)).some((e) => e.id === mark.id)).toBe(false);

    const snap = await snapshotOf(rig);
    const verdict = (await classifyAll(rig, 'sq', [word], snap.id)).verdicts[0];
    const held = (await deviceEvents(rig)).some((e) => e.id === mark.id);
    // either the device is brought in line with the account, or the snapshot does not call it verified
    expect({ state: snap.state, verdict, deviceStillHoldsTheDeletedEvent: held })
      .toEqual(snap.state === 'verified' ? { state: 'verified', verdict: authoritative, deviceStillHoldsTheDeletedEvent: false } : { state: snap.state, verdict, deviceStillHoldsTheDeletedEvent: held });
  }, LONG);

  it('the sync round of the worker brings it in (no analysis running), and events this device pushed itself ask for no event list', async () => {
    const { svc, phone } = await seededAccount(['sq']);
    const word = wordOf('sq', 'rrugëtim');
    await sendToAccount(phone, [reviewed(phone, word[1]!, { at: ago(9) }), reviewed(phone, word[1]!, { at: ago(8) })]);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    expect((await deviceRows(rig, [word[1]!])).get(word[1]!)!.level).toBe('familiar');

    // (a) this device records and pushes its own event: the round pulls it back, and no event list is fetched for it
    let mark = rig.log.length;
    expect(await rig.content({ type: MSG.record, event: pendingEvent('libër') })).toMatchObject({ ok: true, attributed: 'account' });
    await rig.fireTimers();
    await quiet(rig);
    expect(rig.log.slice(mark).some((l) => l.path === '/sync/push' && l.status === 200)).toBe(true);
    expect(getEvents(rig, mark)).toBe(0);
    // (b) rounds with nothing new ask for no event list either
    mark = rig.log.length;
    await rig.page({ type: MSG.syncNow });
    await rig.page({ type: MSG.syncNow });
    await quiet(rig);
    expect(getEvents(rig, mark)).toBe(0);

    // (c) the phone marks the word Known; the next round sees an event of another device and the device Repository takes it in
    await sendToAccount(phone, [marked(phone, [word[1]!], 'known', { at: ago(0, -60_000), app: 'gopractice-review' })]);
    mark = rig.log.length;
    expect(await rig.page({ type: MSG.syncNow })).toMatchObject({ ok: true });
    expect(await until(async () => (await deviceRows(rig, [word[1]!])).get(word[1]!)?.level === 'known')).toBe(true);
    await quiet(rig);
    expect(getEvents(rig, mark)).toBeGreaterThanOrEqual(1);
    expect(getEvents(rig, mark)).toBeLessThanOrEqual(2); // the new event, and at most the empty page that proves the head
    // the analysis that follows finds the device level already
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ state: 'verified', added: 0 });
    expect((await classifyAll(rig, 'sq', [word], snap.id)).verdicts).toEqual([['known', 'known']]);
    // (d) and the round after that asks for nothing again
    mark = rig.log.length;
    await rig.page({ type: MSG.syncNow });
    await quiet(rig);
    expect(getEvents(rig, mark)).toBe(0);
  }, LONG);
});

// ───────────────────────────── 4. a change on this device, not sent yet ─────────────────────────────

/** The word a device event is about, as the content script would name it. */
const wordOfEvent = (e: GoEvent, surface: string): WireWord => [F(e.languageId, surface), ...(e.subject.itemIds ?? []).filter((i) => i.startsWith('lemma:'))];

describe('4. a mark made on this device and not pushed yet', () => {
  const word: WireWord = [F('sq', 'shtëpinë'), L('sq', 'shtëpi')];

  it('counts at once, is reported as unsent, and the account agrees once it is pushed', async () => {
    const { svc, phone } = await seededAccount(['sq']);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const before = await snapshotOf(rig);
    expect(before).toMatchObject({ state: 'verified', unsent: 0 });
    expect((await classifyAll(rig, 'sq', [word], before.id)).verdicts).toEqual([['below', 'new']]);

    const event = deviceMark('shtëpinë', 'known', new Date());
    expect(event.subject.itemIds).toContain(word[1]); // the card names the lemma; the page word is asked about as its form and that lemma
    expect(await rig.content({ type: MSG.record, event })).toMatchObject({ ok: true, attributed: 'account' });
    // not pushed: the debounced round has not run, and the account knows nothing of it
    expect((await accountRows(phone.api, idsOf([word]))).size).toBe(0);

    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified', unsent: 1 });
    expect(snap.id).not.toBe(before.id);
    expect((await classifyAll(rig, 'sq', [word], snap.id)).verdicts).toEqual([['known', 'known']]);

    await rig.fireTimers(); // the push
    await quiet(rig);
    const after = await snapshotOf(rig);
    expect(after).toMatchObject({ state: 'verified', unsent: 0 });
    const account = await accountRows(phone.api, idsOf([word]));
    expect(account.get(word[1]!)!.level).toBe('known');
    expect((await classifyAll(rig, 'sq', [word], after.id)).verdicts).toEqual([classifyWord(word, (id) => account.get(id), 'sq')]);
  }, LONG);

  it('two quick changes to one word (Known, then New) end with the later one, before and after they are pushed', async () => {
    const { svc, phone } = await seededAccount(['sq']);
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const t = Date.now() - 5_000;
    expect(await rig.content({ type: MSG.record, event: deviceMark('shtëpinë', 'known', new Date(t)) })).toMatchObject({ ok: true });
    expect(await rig.content({ type: MSG.record, event: deviceMark('shtëpinë', 'new', new Date(t + 400)) })).toMatchObject({ ok: true });
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ state: 'verified', unsent: 2 });
    expect((await classifyAll(rig, 'sq', [word], snap.id)).verdicts).toEqual([['below', 'new']]);
    await rig.fireTimers();
    await quiet(rig);
    const account = await accountRows(phone.api, idsOf([word]));
    expect(account.get(word[1]!)!.selfMark?.mark).toBe('new');
    const after = await snapshotOf(rig);
    expect(after.unsent).toBe(0);
    expect((await classifyAll(rig, 'sq', [word], after.id)).verdicts).toEqual([['below', 'new']]);
    expect(classifyWord(word, (id) => account.get(id), 'sq')).toEqual(['below', 'new']);

    // and the other order: New, then Known
    const first = deviceMark('bukur', 'new', new Date(t + 1_000));
    expect(await rig.content({ type: MSG.record, event: first })).toMatchObject({ ok: true });
    expect(await rig.content({ type: MSG.record, event: deviceMark('bukur', 'known', new Date(t + 1_400)) })).toMatchObject({ ok: true });
    const s2 = await snapshotOf(rig);
    expect((await classifyAll(rig, 'sq', [wordOfEvent(first, 'bukur')], s2.id)).verdicts).toEqual([['known', 'known']]);
  }, LONG);
});

// ───────────────────────────── 5. no account ─────────────────────────────

describe('5. signed out: this device is the record', () => {
  for (const mode of ['IndexedDB', 'storage rows'] as const) {
    it(`an empty Repository answers every word New, or not identified, and says it was asked (${mode})`, async () => {
      const rig = createReadingRig(mode === 'IndexedDB' ? {} : { idb: false });
      const snap = await snapshotOf(rig);
      expect(snap).toMatchObject({ authority: 'device', state: 'verified', unsent: 0 });
      expect(snap.reason).toBeUndefined();
      expect(typeof snap.verifiedAt).toBe('number');
      const words: WireWord[] = [wordOf('sq', 'shtëpi'), wordOf('sq', 'libër'), [F('sq', 'xhfjkq')], [F('sq', 'dyshe'), L('sq', 'dyshe', 'NOUN'), L('sq', 'dyshe', 'ADJ')]];
      const got = await classifyAll(rig, 'sq', words, snap.id);
      expect(got.verdicts).toEqual([['below', 'new'], ['below', 'new'], ['unidentified', 'new'], ['below', 'new']]);
      expect(got.asked).toBe(idsOf(words).length);
      expect(got.answered).toBe(got.asked);
      expect((await deviceRows(rig, idsOf(words))).size).toBe(0);
      expect((await rig.local({ op: 'status' })).events).toBe(0);
      expect(rig.log).toEqual([]); // nothing was asked of any service
    }, LONG);
  }

  it('the events of the device answer: a lookup is Seen, a mark of Known is Known, and the snapshot changes when one is recorded', async () => {
    const rig = createReadingRig();
    const empty = await snapshotOf(rig);
    const looked = pendingEvent('libër');
    const known = deviceMark('shtëpinë', 'known', new Date(Date.now() - 2_000));
    const familiar = deviceMark('bukur', 'familiar', new Date(Date.now() - 1_000));
    for (const event of [looked, known, familiar]) expect(await rig.content({ type: MSG.record, event })).toMatchObject({ ok: true, attributed: 'local' });
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'device', state: 'verified', unsent: 3 });
    expect(snap.id).not.toBe(empty.id);
    expect(await rig.reading({ op: 'classify', languageId: 'sq', snapshot: empty.id, words: [wordOf('sq', 'libër')] })).toMatchObject({ ok: false, error: 'snapshot-changed' });

    const words = [wordOfEvent(looked, 'libër'), wordOfEvent(known, 'shtëpinë'), wordOfEvent(familiar, 'bukur'), wordOf('sq', 'qytet')];
    const got = await classifyAll(rig, 'sq', words, snap.id);
    const device = await deviceRows(rig, idsOf(words));
    expect(got.verdicts).toEqual([['below', 'seen'], ['known', 'known'], ['below', 'familiar'], ['below', 'new']]);
    words.forEach((w, i) => {
      expect(got.verdicts[i]).toEqual(classifyWord(w, (id) => device.get(id), 'sq'));
      expect(got.verdicts[i]).toEqual(oracleVerdict(device.get(w[0]), device.get(w[1]!)));
    });
    expect(rig.log).toEqual([]);
  }, LONG);
});

// ───────────────────────────── 6. Hebrew and Greek: one variety at a time ─────────────────────────────

/** A lookup in a reader that declares the variety of its text (Biblia reading the Hebrew Bible). */
const declaredLookup = (p: Phone, unit: string, varietyId: string, o: { at: string; sentenceKey: string }): GoEvent => eventOf(p, 'SelectionLookedUp', [unit],
  { surface: unit.split(':')[2], tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'demo', helpShown: ['gloss'], language: { languageId: unit.split(':')[1], varietyId, basis: 'override', confidence: 1, override: true } }, o);
/** A lookup whose sentence the analyser read in one period. */
const analysedLookup = (p: Phone, unit: string, varietyId: string, o: { at: string; sentenceKey: string }): GoEvent => eventOf(p, 'SelectionLookedUp', [unit],
  { surface: unit.split(':')[2], tokenCount: 1, contextKind: 'sentence', contextConfidence: 1, readerId: 'demo', helpShown: ['gloss'], variety: { varietyId, basis: 'analysed' } }, o);

/**
 * The oracle for one lemma row read in one variety, from the contract's two readers: what the variety's view says (`knowledgeInVariety`), and
 * whether the evidence classified in that variety says Known by itself (`ownKnowledgeOf`).
 */
function varietyOracle(row: UnitKnowledge | undefined, varietyId: string): WireVerdict {
  if (!row) return ['below', 'new'];
  const view = knowledgeInVariety(row, varietyId).knowledge;
  const level = shownLevel(view);
  if (!isKnown(level)) return ['below', level];
  const own = ownKnowledgeOf(row, varietyId);
  return [own && isKnown(own.level) ? 'known' : 'unsettled', level];
}

interface VarietyCase { unit: string; note: string; events(p: Phone): GoEvent[]; expect: Record<string, WireVerdict> }
const HE = (w: string): string => L('he', w);
const EL = (w: string): string => L('el', w);
const VARIETY_CASES: VarietyCase[] = [
  { unit: HE('melekh'), note: 'looked up in a Biblical text and marked Known on that card',
    events: (p) => [declaredLookup(p, HE('melekh'), 'he-bib', { at: ago(9), sentenceKey: 's:melekh' }), marked(p, [HE('melekh')], 'known', { at: ago(9, 60_000), sentenceKey: 's:melekh' })],
    expect: { 'he-bib': ['known', 'known'], 'he-mod': ['below', 'new'] } },
  { unit: HE('shalom'), note: 'a mark of Known made before varieties were recorded: language-wide, assigned to none',
    events: (p) => [marked(p, [HE('shalom')], 'known', { at: ago(40) })],
    expect: { 'he-bib': ['unsettled', 'known'], 'he-mod': ['unsettled', 'known'] } },
  { unit: HE('davar'), note: 'four typed correct answers on a card of the Modern variety',
    events: (p) => [9, 8, 7, 6].map((d) => reviewed(p, HE('davar'), { at: ago(d), typed: true, cardId: `card:written-recognition@he-mod:${HE('davar')}`, varietyId: 'he-mod' })),
    expect: { 'he-mod': ['known', 'known'], 'he-bib': ['below', 'new'] } },
  { unit: HE('bayit'), note: 'a legacy language-wide mark of Known, and later only a lookup in a Biblical text',
    events: (p) => [marked(p, [HE('bayit')], 'known', { at: ago(40) }), declaredLookup(p, HE('bayit'), 'he-bib', { at: ago(5), sentenceKey: 's:bayit' })],
    expect: { 'he-bib': ['unsettled', 'known'], 'he-mod': ['unsettled', 'known'] } },
  { unit: HE('sefer'), note: 'looked up once in a sentence the analyser read as Modern',
    events: (p) => [analysedLookup(p, HE('sefer'), 'he-mod', { at: ago(9), sentenceKey: 's:sefer' })],
    expect: { 'he-mod': ['below', 'seen'], 'he-bib': ['below', 'new'] } },
  { unit: HE('eretz'), note: 'looked up in a Biblical text and marked Automatic on that card',
    events: (p) => [declaredLookup(p, HE('eretz'), 'he-bib', { at: ago(9), sentenceKey: 's:eretz' }), marked(p, [HE('eretz')], 'automatic', { at: ago(9, 60_000), sentenceKey: 's:eretz' })],
    expect: { 'he-bib': ['known', 'automatic'], 'he-mod': ['below', 'new'] } },
  { unit: HE('ir'), note: 'nothing recorded', events: () => [], expect: { 'he-bib': ['below', 'new'], 'he-mod': ['below', 'new'] } },
  { unit: EL('logos'), note: 'Greek: looked up in a Koine text and marked Known on that card',
    events: (p) => [declaredLookup(p, EL('logos'), 'el-koi', { at: ago(9), sentenceKey: 's:logos' }), marked(p, [EL('logos')], 'known', { at: ago(9, 60_000), sentenceKey: 's:logos' })],
    expect: { 'el-koi': ['known', 'known'], 'el-att': ['below', 'new'], 'el-mod': ['below', 'new'] } },
  { unit: EL('anthropos'), note: 'Greek: a legacy language-wide mark of Known',
    events: (p) => [marked(p, [EL('anthropos')], 'known', { at: ago(40) })],
    expect: { 'el-koi': ['unsettled', 'known'], 'el-att': ['unsettled', 'known'], 'el-mod': ['unsettled', 'known'] } },
  { unit: EL('thalassa'), note: 'Greek: looked up in a Modern text and marked Familiar there',
    events: (p) => [declaredLookup(p, EL('thalassa'), 'el-mod', { at: ago(9), sentenceKey: 's:thalassa' }), marked(p, [EL('thalassa')], 'familiar', { at: ago(9, 60_000), sentenceKey: 's:thalassa' })],
    expect: { 'el-mod': ['below', 'familiar'], 'el-koi': ['below', 'new'], 'el-att': ['below', 'new'] } },
];

describe('6. Hebrew and Greek: knowledge is read in the variety of the text', () => {
  it('each variety agrees with knowledgeInVariety / ownKnowledgeOf on the ACCOUNT rows; a legacy language-wide mark is unsettled, never known', async () => {
    const { svc, phone } = await seededAccount(['sq', { languageId: 'he', varietyId: 'he-bib' }, 'el']);
    await sendToAccount(phone, VARIETY_CASES.flatMap((c) => c.events(phone)));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const snap = await snapshotOf(rig);
    expect(snap).toMatchObject({ authority: 'account', state: 'verified' });

    for (const [lang, varieties] of [['he', ['he-bib', 'he-mod']], ['el', ['el-koi', 'el-att', 'el-mod']]] as const) {
      const cases = VARIETY_CASES.filter((c) => c.unit.split(':')[1] === lang);
      const words: WireWord[] = cases.map((c) => [F(lang, c.unit.split(':')[2]!), c.unit]);
      const ids = idsOf(words);
      const account = await accountRows(phone.api, ids);
      const device = await deviceRows(rig, ids);
      // the rows: the same units, the same varieties classified, the same view and the same own evidence in every variety
      expect([...device.keys()].sort()).toEqual([...account.keys()].sort());
      for (const id of ids) {
        const a = account.get(id);
        const d = device.get(id);
        if (!a || !d) continue;
        expect(rowFacts(d), id).toEqual(rowFacts(a));
        expect(classifiedVarietiesOf(d), id).toEqual(classifiedVarietiesOf(a));
        for (const v of varieties) {
          expect(knowledgeInVariety(d, v).basis, `${id} in ${v}`).toBe(knowledgeInVariety(a, v).basis);
          expect(knowledgeInVariety(d, v).knowledge.level, `${id} in ${v}`).toBe(knowledgeInVariety(a, v).knowledge.level);
          expect(ownKnowledgeOf(d, v)?.level, `${id} own in ${v}`).toBe(ownKnowledgeOf(a, v)?.level);
        }
      }
      for (const v of varieties) {
        const got = await classifyAll(rig, lang, words, snap.id, { varietyId: v });
        expect(got.answered).toBe(got.asked);
        cases.forEach((c, i) => {
          const verdict = got.verdicts[i]!;
          expect(verdict, `${c.unit} in ${v} against classifyWord on the account rows`).toEqual(classifyWord(words[i]!, (id) => account.get(id), lang, v));
          expect(verdict, `${c.unit} in ${v} against the contract's readers`).toEqual(varietyOracle(account.get(c.unit), v));
          expect(verdict, `${c.unit} in ${v}: ${c.note}`).toEqual(c.expect[v]);
        });
      }
    }

    // a legacy mark is never credited in any variety, and what is known in one variety is not known in another
    const legacy: WireWord = [F('he', 'shalom'), HE('shalom')];
    for (const v of ['he-bib', 'he-mod', 'he-mish', 'he-med']) {
      const r = await classifyAll(rig, 'he', [legacy], snap.id, { varietyId: v });
      expect(r.verdicts[0]![0], v).toBe('unsettled');
    }
    // the longer spelling of a variety id is the same variety
    const alias = await classifyAll(rig, 'he', [[F('he', 'melekh'), HE('melekh')]], snap.id, { varietyId: 'he-biblical' });
    expect(alias.verdicts).toEqual([['known', 'known']]);
  }, LONG);

  it('a request for Hebrew or Greek that names no variety, an unknown one, or one of another language is refused whole', async () => {
    const { svc, phone } = await seededAccount(['sq', 'he', 'el']);
    await sendToAccount(phone, VARIETY_CASES.flatMap((c) => c.events(phone)));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    const snap = await snapshotOf(rig);
    const he: WireWord[] = [[F('he', 'melekh'), HE('melekh')]];
    const el: WireWord[] = [[F('el', 'logos'), EL('logos')]];
    const ask = (languageId: string, words: WireWord[], varietyId?: unknown) => rig.reading({ op: 'classify', languageId, snapshot: snap.id, words, ...(varietyId !== undefined ? { varietyId } : {}) });
    for (const r of [await ask('he', he), await ask('el', el), await ask('he', he, ''), await ask('he', he, 'he-klingon'), await ask('he', he, 'el-koi'), await ask('el', el, 'he-bib'), await ask('he', he, 7), await ask('he', he, 'he')]) {
      expect(r).toMatchObject({ ok: false, error: 'invalid' });
      expect((r as { verdicts?: unknown }).verdicts).toBeUndefined();
    }
    // with the variety said, the same request is answered
    expect(await ask('he', he, 'he-bib')).toMatchObject({ ok: true, verdicts: [['known', 'known']] });
    expect(await ask('el', el, 'el-koi')).toMatchObject({ ok: true, verdicts: [['known', 'known']] });
    // a language without learning varieties ignores a variety it is given
    await sendToAccount(phone, [marked(phone, [L('sq', 'mal')], 'known', { at: ago(3) })]);
    const again = await snapshotOf(rig);
    expect(await rig.reading({ op: 'classify', languageId: 'sq', varietyId: 'he-bib', snapshot: again.id, words: [wordOf('sq', 'mal')] })).toMatchObject({ ok: true, verdicts: [['known', 'known']] });
  }, LONG);
});

// ───────────────────────────── 7. read-only ─────────────────────────────

const FOLD_AT = '2027-01-01T00:00:00.000Z';
const withoutRetention = (rows: UnitKnowledge[]): unknown[] => rows.map((r) => { const { retention: _computedAtReadTime, ...rest } = r; void _computedAtReadTime; return rest; });

describe('7. a whole analysis changes nothing of the learner\'s history', () => {
  it('no event anywhere, no knowledge row, no queue row and no review schedule differs after grant, snapshots and many batches', async () => {
    const { svc, phone } = await seededAccount();
    await sendToAccount(phone, SEEDS.flatMap((s) => s.events(phone)));
    const rig = createReadingRig({ svc });
    await signIn(rig, EMAIL);
    // this device has a mark of its own that is not pushed yet, so the queue is not empty
    expect(await rig.content({ type: MSG.record, event: deviceMark('shtëpinë', 'familiar', new Date(Date.now() - 3_000)) })).toMatchObject({ ok: true, attributed: 'account' });
    await pause(50);

    const scheduler = createFsrsScheduler();
    const repo = (await rig.bg.local.open())!;
    const identity = await rig.local({ op: 'identity' });
    const state = async () => {
      const local = await rig.fake.local.get(null);
      const account = await accountEvents(svc, phone.learnerId);
      const device = await deviceEvents(rig);
      const all = await phone.api.knowledge();
      if (!all.ok) throw new Error('account knowledge');
      return {
        accountEvents: account,
        deviceEvents: device,
        accountRows: withoutRetention([...all.data.knowledge].sort((a, b) => (a.unitId < b.unitId ? -1 : 1))), // the retention estimate is worked out from the clock at each read; every stored field is compared
        deviceRows: withoutRetention(await allDeviceRows(rig)),
        accountDeck: foldDeck(account, scheduler, { now: FOLD_AT, learnerId: phone.learnerId }),
        deviceDeck: foldDeck(device, scheduler, { now: FOLD_AT, learnerId: identity.learnerId }),
        queue: Object.fromEntries(Object.entries(local).filter(([k]) => k.startsWith('queue:'))),
        eventLog: Object.fromEntries(Object.entries(local).filter(([k]) => k.startsWith('golearn:event:'))),
        pullPosition: await pullPositionOf(repo),
        localStorage: local,
        sessionStorage: await rig.fake.sessionArea.get(null),
        status: await rig.local({ op: 'status' }),
      };
    };
    const before = await state();
    expect(before.accountEvents.length).toBeGreaterThan(30);
    expect(before.deviceEvents.length).toBe(before.accountEvents.filter((e) => e.producer.app !== 'repository').length + 1);
    expect(Object.keys(before.queue)).toHaveLength(1);
    expect(before.accountDeck.items.length).toBeGreaterThan(0); // the account has a card with a schedule
    const mark = rig.log.length;

    // the analysis, as the popup and the content script of tab 7 run it: twice over, with batches in every language
    expect(await rig.reading({ op: 'grant', tabId: 7 }, 'page')).toEqual({ ok: true, op: 'grant' });
    for (let run = 0; run < 2; run++) {
      for (const lang of ['sq', 'es']) {
        const snap = await snapshotOf(rig, 'content', lang);
        expect(snap).toMatchObject({ authority: 'account', state: 'verified', added: 0, unsent: 1 });
        const words: WireWord[] = [
          ...SEEDS.filter((s) => s.lang === lang).map((s) => wordOf(lang, s.w)),
          ...Array.from({ length: 900 }, (_, i) => wordOf(lang, `panjohur${i}`)),
          [F(lang, 'pagjetur')],
        ];
        const got = await classifyAll(rig, lang, words, snap.id, { as: 'content', batch: 400 });
        expect(got.messages).toBe(Math.ceil(words.length / 400));
        expect(got.answered).toBe(got.asked);
      }
    }
    await quiet(rig);
    const after = await state();

    // no event was appended, removed or rewritten, on the account or on the device
    expect(after.accountEvents).toEqual(before.accountEvents);
    expect(after.deviceEvents).toEqual(before.deviceEvents);
    for (const kind of ['EncounterRecorded', 'SelectionLookedUp', 'ItemMarked', 'CardReviewed', 'CardAdded', 'AssistanceRequested', 'AnalysisShown']) {
      expect(after.accountEvents.filter((e) => e.kind === kind).map((e) => e.id), kind).toEqual(before.accountEvents.filter((e) => e.kind === kind).map((e) => e.id));
      expect(after.deviceEvents.filter((e) => e.kind === kind).map((e) => e.id), kind).toEqual(before.deviceEvents.filter((e) => e.kind === kind).map((e) => e.id));
    }
    // no level, mark, meeting count or dimension changed
    expect(after.accountRows).toEqual(before.accountRows);
    expect(after.deviceRows).toEqual(before.deviceRows);
    // GoReview's deck is a fold of the events (CardAdded, the reviews): the same schedule for every card, on the account and from the device's copy
    expect(after.accountDeck).toEqual(before.accountDeck);
    expect(after.deviceDeck).toEqual(before.deviceDeck);
    // nothing was queued for the account, nothing was written to the device's own log, the pull did not move
    expect(after.queue).toEqual(before.queue);
    expect(after.eventLog).toEqual(before.eventLog);
    expect(after.pullPosition).toEqual(before.pullPosition);
    expect({ events: after.status.events, pendingUpload: after.status.pendingUpload, uploaded: after.status.uploaded, fromAccount: after.status.fromAccount })
      .toEqual({ events: before.status.events, pendingUpload: before.status.pendingUpload, uploaded: before.status.uploaded, fromAccount: before.status.fromAccount });
    // what the worker's storage gained: the time of the check, and the grant; nothing else changed
    const changed = (a: Record<string, unknown>, b: Record<string, unknown>): string[] => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((k) => JSON.stringify(a[k]) !== JSON.stringify(b[k])).sort();
    expect(changed(before.localStorage, after.localStorage).filter((k) => k !== 'golearn:local-level')).toEqual([]);
    expect(changed(before.sessionStorage, after.sessionStorage)).toEqual([`${GRANT_PREFIX}7`]);
    // and what was asked of the service: who the account is and its events after the cursor. Nothing was sent.
    const asked = rig.log.slice(mark);
    expect(asked.length).toBeGreaterThan(0);
    expect(asked.filter((l) => l.method !== 'GET')).toEqual([]);
    // who the account is, what the learner deleted (GET /tombstones, read since the deletion finding of this suite was repaired), its events after the cursor
    expect([...new Set(asked.map((l) => l.path))].sort()).toEqual(['/events', '/me', '/tombstones']);
  }, LONG);
});
