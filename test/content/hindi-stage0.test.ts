/**
 * H5 — the first controlled Hindi stories (Stage 0A, 0B, 0C: 26 stories). Every document is a MACHINE DRAFT: it must
 * validate with the real validator, belong to its work, stay unpublished with both explicit native and review-status blockers, and carry one
 * English line per sentence. The language budgets (sentence length, words per band, distinct forms, repetition of
 * new words) are checked on the text itself; words are counted by splitting on whitespace and stripping punctuation,
 * never with the Hindi adapter, whose analysis is being rebuilt. Analysis coverage is printed, not asserted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { computePublished, validateBatch, validateDocument, type CorpusDocument } from '../../src/ingest';
import { HINDI_WORKS } from '../../src/course/hindi';

const DIR = path.resolve(__dirname, '../../data/corpus/hi');
const registry = createAdapterRegistry();
const knownWorks = new Set(HINDI_WORKS.map((w) => w.id));

const files = fs.readdirSync(DIR).filter((f) => /^s0[abc]-.*\.json$/.test(f)).sort();
const raw: unknown[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const docs = raw as CorpusDocument[];

type S = { text: string; english?: string; spans?: unknown; corrections?: unknown };
const sentencesOf = (d: CorpusDocument): S[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? (p.sentences as S[]) : [])));
/** Whitespace-separated words with the punctuation around them stripped (the danda, commas, quotes, ? and !). */
const wordsOf = (s: string): string[] => s.split(/\s+/).map((w) => w.replace(/^[^ऀ-ॣ०-ॿ]+|[^ऀ-ॣ०-ॿ]+$/g, '')).filter(Boolean);
const textOf = (d: CorpusDocument) => sentencesOf(d).map((s) => s.text).join(' ');
const countOf = (d: CorpusDocument) => sentencesOf(d).reduce((n, s) => n + wordsOf(s.text).length, 0);

const PLAN = [
  { key: 's0a', slug: 'pehli-kahaniyan-0a', texts: 12, perStory: [60, 150], total: [1200, 1500], distinctMax: 120, difficulty: 'A0' },
  { key: 's0b', slug: 'pehli-kahaniyan-0b', texts: 8, perStory: [150, 250], total: [1200, 2000], distinctMax: 260, difficulty: 'A0' },
  { key: 's0c', slug: 'pehli-kahaniyan-0c', texts: 6, perStory: [250, 400], total: [1500, 2400], distinctMax: 450, difficulty: 'A1' },
] as const;

const byWork = (slug: string) => docs.filter((d) => d.work?.slug === slug);

describe('Hindi Stage 0: shape', () => {
  it('has the planned number of stories per band, numbered 1..n, and nothing else', () => {
    expect(docs).toHaveLength(PLAN.reduce((n, p) => n + p.texts, 0));
    for (const p of PLAN) {
      const ds = byWork(p.slug);
      expect(ds, p.slug).toHaveLength(p.texts);
      expect(ds.map((d) => d.work?.chapter?.index), p.slug).toEqual(Array.from({ length: p.texts }, (_, i) => i + 1));
      for (const [i, d] of ds.entries()) {
        expect(d.work?.chapter?.title, d.id).toBe(d.title);
        expect(d.id, d.id).toBe(`${p.key}-${String(i + 1).padStart(2, '0')}`);
        expect(files).toContain(`${d.id}.json`);
        expect(d.difficulty, d.id).toBe(p.difficulty);
        expect(d.lang).toBe('hi');
        expect(d.contentType).toBe('story');
      }
    }
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
    expect(new Set(docs.map((d) => d.source.id)).size).toBe(docs.length);
    expect(new Set(docs.map((d) => d.title)).size).toBe(docs.length);
  });

  it('reuses the existing Hindi comprehensible-input corpus and belongs to a work the Hindi course holds', () => {
    for (const d of docs) expect(d.corpus, d.id).toEqual({ id: 'ci-hi', kind: 'comprehensible-input', title: 'Comprehensible input — Hindi' });
    for (const p of PLAN) expect([...knownWorks].some((id) => id.endsWith(`:${p.slug}`)), p.slug).toBe(true);
    for (const d of docs) {
      const x = d as CorpusDocument & { streams?: string[]; domains?: string[]; variety?: string };
      expect(x.streams, d.id).toEqual(['acquisition']);
      expect(x.domains?.length, d.id).toBeGreaterThan(0);
      expect(x.variety, `${d.id}: Modern Standard Hindi carries no variety tag`).toBeUndefined();
      expect(d.topics.length, d.id).toBeGreaterThan(0);
    }
  });

  it('every story has real sentences in paragraphs (never an isolated drill) and a Devanagari title', () => {
    for (const d of docs) {
      const ss = sentencesOf(d);
      expect(ss.length, d.id).toBeGreaterThanOrEqual(15);
      expect(d.title, d.id).toMatch(/[ऀ-ॿ]/);
      expect(d.sections, d.id).toHaveLength(1);
      expect(d.sections[0].paragraphs.length, d.id).toBeGreaterThanOrEqual(3);
    }
  });
});

describe('Hindi Stage 0: validation and publication', () => {
  const batch = validateBatch(raw, { registry, knownWorks });

  it('every document validates with the real validator (batch and one by one)', () => {
    expect(batch.documents).toHaveLength(docs.length);
    for (const r of batch.documents) {
      const errors = r.issues.filter((i) => i.severity === 'error');
      expect(errors.map((e) => `${e.path}: ${e.message}`), r.id).toEqual([]);
    }
    expect(batch.ok).toBe(true);
    for (const d of docs) expect(validateDocument(d, { registry, knownWorks }).filter((i) => i.severity === 'error'), d.id).toEqual([]);
  });

  it('raises no warning except low analysis coverage (while the Hindi lexicon grows) and the adapter\'s sentence splitting', () => {
    // `adapter-would-split` is the adapter's own splitter disagreeing with a declared sentence. Here that is a sentence
    // that carries a quotation (the speech ends in a danda or a question mark inside the quotation marks); the
    // declaration wins at import, so this is reported for the adapter's owner, never a reason to bend the text.
    const other: string[] = [];
    let splits = 0;
    for (const r of batch.documents) {
      for (const w of r.issues.filter((i) => i.severity === 'warning')) {
        if (w.code === 'adapter-would-split') splits++;
        else if (w.code !== 'low-analysis-coverage') other.push(`${r.id} ${w.code} ${w.path}`);
      }
    }
    console.info(`adapter-would-split warnings (declared sentences the adapter's splitter would cut): ${splits}`);
    expect(other).toEqual([]);
  });

  it('every document is a machine draft, owner-authored, unreviewed and NOT published, for the one stated reason', () => {
    for (const d of docs) {
      expect(d.generated, d.id).toBe(true);
      expect(d.review.status, d.id).toBe('unreviewed');
      expect(d.review.reviewedBy, d.id).toBeUndefined();
      expect(d.source.rights, d.id).toBe('owner-authored');
      expect(d.source.authorship, d.id).toBe('generated');
      expect(d.editorialTags, d.id).toEqual(['needs-native-review', 'machine-drafted']);
      expect(d.source.provenance, d.id).toMatch(/Drafted by an AI model for the course; not reviewed by a native speaker/);
      expect(d.source.attribution, d.id).toMatch(/not yet reviewed by a native speaker/);
      expect(d.english?.source, d.id).toBe('drafted with the text; not reviewed');
      const gate = computePublished(d);
      expect(gate.published, d.id).toBe(false);
      expect(gate.unpublishedReasons, d.id).toHaveLength(2);
      expect(gate.unpublishedReasons[0], d.id).toMatch(/native-speaker review/);
    }
  });
});

describe('Hindi Stage 0: sentences, script and English', () => {
  it('exactly one non-empty English line per declared sentence, no author analysis spans, and English that is English', () => {
    for (const d of docs) {
      for (const s of sentencesOf(d)) {
        expect(s.text.trim().length, d.id).toBeGreaterThan(0);
        expect(typeof s.english === 'string' && s.english.trim().length > 0, `${d.id}: ${s.text}`).toBe(true);
        expect(s.english, `${d.id}: ${s.text}`).not.toMatch(/[ऀ-ॿ]/);
        expect(s.spans, `${d.id}: ${s.text}`).toBeUndefined();
        expect(s.corrections, `${d.id}: ${s.text}`).toBeUndefined();
      }
      for (const sec of d.sections) for (const p of sec.paragraphs) expect('sentences' in p, d.id).toBe(true);
    }
  });

  it('the Hindi is NFC and trimmed, every sentence ends with a danda, ? or !, and a danda closes every statement', () => {
    for (const d of docs) for (const s of sentencesOf(d)) {
      expect(s.text, d.id).toBe(s.text.normalize('NFC'));
      expect(s.text, d.id).toBe(s.text.trim());
      expect(/[।?!]"?$/.test(s.text), `${d.id}: ${s.text}`).toBe(true);
      expect(s.text, `${d.id}: ${s.text}`).not.toMatch(/\.\s|\.$/); // never a Latin full stop
      expect((s.text.match(/"/g) ?? []).length % 2, `${d.id}: unbalanced quotation marks in ${s.text}`).toBe(0);
    }
  });

  it('no Latin letters, no romanization and no digits other than Devanagari digits in the Hindi (titles included)', () => {
    // allowed: Devanagari, space, the danda, comma, ? ! and the double quotation mark
    const ALLOWED = /^[ऀ-ॿ ,?!"।]+$/;
    for (const d of docs) {
      for (const t of [d.title, d.sections[0].title ?? '', d.work?.chapter?.title ?? '']) {
        expect(t, `${d.id}: title`).toMatch(/^[ऀ-ॿ ,?!"।]+$/);
      }
      for (const s of sentencesOf(d)) {
        expect(/[A-Za-z]/.test(s.text), `${d.id}: Latin letter in ${s.text}`).toBe(false);
        expect(/[0-9]/.test(s.text), `${d.id}: ASCII digit in ${s.text}`).toBe(false);
        expect(s.text, `${d.id}: ${s.text}`).toMatch(ALLOWED);
        expect(/[०-९]/.test(s.text), `${d.id}: Devanagari digit in ${s.text}`).toBe(false); // numerals are written as words in Stage 0
      }
    }
  });

  it('one spelling per word: the nukta, chandrabindu and anusvara forms the course settled on', () => {
    const all = docs.map(textOf).join(' ');
    const forms = new Set(wordsOf(all));
    // the standard forms are present...
    for (const w of ['माँ', 'हैं', 'में', 'मैं', 'नहीं', 'हूँ', 'यहाँ', 'कहाँ', 'हाँ', 'आँगन', 'बाज़ार', 'सफ़ेद', 'ज़रूर', 'फ़ोन', 'दफ़्तर', 'रोज़', 'मेज़', 'आवाज़', 'ज़ोर', 'तरफ़', 'दरवाज़ा', 'पाँच']) {
      expect(forms.has(w), `${w} should occur`).toBe(true);
    }
    // ...and their variants never occur
    for (const w of ['मां', 'हे', 'मे', 'नही', 'हूं', 'यहां', 'कहां', 'हां', 'आंगन', 'बाजार', 'सफेद', 'जरूर', 'फोन', 'दफ्तर', 'रोज', 'मेज', 'आवाज', 'जोर', 'तरफ', 'दरवाजा', 'पांच', 'गयी', 'गये', 'आयी', 'हैँ', 'चाहिये', 'हिन्दी', 'कहानीयां']) {
      expect(forms.has(w), `${w} must not occur`).toBe(false);
    }
    // the honorific compounds are written as two words throughout
    expect(/दादाजी|शर्माजी|पिताजी/.test(all)).toBe(false);
    // and no nukta is left decomposed in some places and precomposed in others (NFC keeps the nukta as a separate sign)
    expect(all).not.toMatch(/[क़-य़]/);
  });
});

describe('Hindi Stage 0: the language budgets', () => {
  it('each story is within its word range and each band within its total', () => {
    for (const p of PLAN) {
      const ds = byWork(p.slug);
      for (const d of ds) {
        const n = countOf(d);
        expect(n, `${d.id}: ${n} words`).toBeGreaterThanOrEqual(p.perStory[0]);
        expect(n, `${d.id}: ${n} words`).toBeLessThanOrEqual(p.perStory[1]);
      }
      const total = ds.reduce((a, d) => a + countOf(d), 0);
      console.info(`${p.slug}: ${total} running words in ${ds.length} stories`);
      expect(total, p.slug).toBeGreaterThanOrEqual(p.total[0]);
      expect(total, p.slug).toBeLessThanOrEqual(p.total[1]);
    }
  });

  it('sentences stay short: at most 6 words at first and 8 by the end of 0A; longer only in 0B and 0C', () => {
    const longest = (d: CorpusDocument) => Math.max(...sentencesOf(d).map((s) => wordsOf(s.text).length));
    byWork('pehli-kahaniyan-0a').forEach((d, i) => expect(longest(d), `${d.id}`).toBeLessThanOrEqual(i < 7 ? 6 : 8));
    for (const d of byWork('pehli-kahaniyan-0b')) expect(longest(d), d.id).toBeLessThanOrEqual(14);
    for (const d of byWork('pehli-kahaniyan-0c')) expect(longest(d), d.id).toBeLessThanOrEqual(18);
    // every sentence in the whole of Stage 0A has at least three words: a real sentence, never a label
    for (const d of byWork('pehli-kahaniyan-0a')) for (const s of sentencesOf(d)) expect(wordsOf(s.text).length, s.text).toBeGreaterThanOrEqual(3);
    // sentences lengthen from band to band
    const mean = (slug: string) => {
      const ss = byWork(slug).flatMap(sentencesOf);
      return ss.reduce((a, s) => a + wordsOf(s.text).length, 0) / ss.length;
    };
    expect(mean('pehli-kahaniyan-0a')).toBeLessThan(mean('pehli-kahaniyan-0b'));
    expect(mean('pehli-kahaniyan-0b')).toBeLessThan(mean('pehli-kahaniyan-0c'));
  });

  it('keeps the distinct-form budget of each band (cumulative from 0A) and reports the numbers', () => {
    const seen = new Set<string>();
    for (const p of PLAN) {
      for (const d of byWork(p.slug)) for (const w of wordsOf(textOf(d))) seen.add(w);
      console.info(`${p.slug}: ${seen.size} distinct word forms cumulative`);
      expect(seen.size, `${p.slug} cumulative distinct forms`).toBeLessThanOrEqual(p.distinctMax);
    }
    expect(seen.size).toBeGreaterThan(300); // the bands really do add language
  });

  it('introduces at most 12 new forms in a 0A story, and each of them occurs at least three times in that story', () => {
    const seen = new Set<string>();
    const report: string[] = [];
    for (const d of byWork('pehli-kahaniyan-0a')) {
      const counts = new Map<string, number>();
      for (const w of wordsOf(textOf(d))) counts.set(w, (counts.get(w) ?? 0) + 1);
      const fresh = [...counts.keys()].filter((w) => !seen.has(w));
      report.push(`${d.id}: ${fresh.length} new`);
      expect(fresh.length, `${d.id} new forms`).toBeLessThanOrEqual(12);
      for (const w of fresh) expect(counts.get(w), `${d.id}: "${w}" is new here and must occur at least three times`).toBeGreaterThanOrEqual(3);
      for (const w of counts.keys()) seen.add(w);
    }
    console.info(report.join('; '));
  });

  it('a new word comes back in a later story: every form of stories 1–9 returns in a later 0A story, every form of 10–12 in a later Stage 0 story', () => {
    const order = [...byWork('pehli-kahaniyan-0a'), ...byWork('pehli-kahaniyan-0b'), ...byWork('pehli-kahaniyan-0c')];
    const sets = order.map((d) => new Set(wordsOf(textOf(d))));
    const first = new Map<string, number>();
    sets.forEach((s, i) => { for (const w of s) if (!first.has(w)) first.set(w, i); });
    const inBandOnly: string[] = [];
    for (const [w, i] of first) {
      if (i >= 12) continue; // only the forms introduced in Stage 0A are held to this
      const returnsIn0A = sets.slice(i + 1, 12).some((s) => s.has(w));
      const returnsLater = sets.slice(i + 1).some((s) => s.has(w));
      expect(returnsLater, `"${w}" is introduced in ${order[i].id} and never returns`).toBe(true);
      if (i < 9) expect(returnsIn0A, `"${w}" (introduced in ${order[i].id}) must return within 0A`).toBe(true);
      if (!returnsIn0A) inBandOnly.push(w);
    }
    console.info(`0A forms that return only in 0B or 0C (${inBandOnly.length}): ${inBandOnly.join(' ')}`);
    // the recurring cast and the core small words occur in many 0A stories
    const form = new Map<string, number>();
    for (const s of sets.slice(0, 12)) for (const w of s) form.set(w, (form.get(w) ?? 0) + 1);
    for (const w of ['है', 'हैं', 'में', 'रवि', 'मीरा', 'नहीं', 'और', 'भी']) expect(form.get(w) ?? 0, w).toBeGreaterThanOrEqual(8);
  });

  it('the grammar arrives in order: no 0B grammar in 0A, the 0B grammar in 0B, the narrative past in 0C', () => {
    const forms = (slug: string) => new Set(byWork(slug).flatMap((d) => wordsOf(textOf(d))));
    const a = forms('pehli-kahaniyan-0a');
    const b = forms('pehli-kahaniyan-0b');
    const c = forms('pehli-kahaniyan-0c');
    // 0A: no genitive, no dative or ablative postposition, no ergative, no progressive, no past of "be", no commands
    for (const w of ['का', 'के', 'की', 'को', 'से', 'ने', 'रहा', 'रही', 'रहे', 'था', 'थी', 'थे', 'आओ', 'बैठो', 'देखो', 'आइए', 'मेरा', 'मेरी', 'मेरे', 'अपना', 'उसका', 'तुम']) {
      expect(a.has(w), `0A must not contain ${w}`).toBe(false);
    }
    // 0A has the habitual late and the questions late
    const aDocs = byWork('pehli-kahaniyan-0a');
    const firstWith = (re: RegExp) => aDocs.findIndex((d) => re.test(textOf(d)));
    expect(firstWith(/(खाता|खाती|पीता|पीती) है/)).toBeGreaterThanOrEqual(7);
    expect(firstWith(/क्या|कहाँ|कौन/)).toBeGreaterThanOrEqual(9);
    // 0B: postpositions, oblique forms, plural, possessives, question words, habitual, progressive, was/were, commands
    for (const w of ['का', 'के', 'की', 'को', 'से', 'मेरा', 'मेरी', 'मेरे', 'तुम्हारी', 'उसका', 'अपने', 'अपनी', 'कमरे', 'किताबें', 'बच्चों', 'लड़के', 'कब', 'क्यों', 'कैसे', 'कितने', 'किसकी', 'किसका',
      'रहा', 'रही', 'रहे', 'था', 'थी', 'थे', 'थीं', 'आओ', 'बैठो', 'देखो', 'आइए', 'बैठिए', 'लीजिए']) {
      expect(b.has(w), `0B should contain ${w}`).toBe(true);
    }
    // 0C: the perfective with ने, the verbs of the narrative past, the compound verbs, the linking words
    for (const w of ['गया', 'आया', 'कहा', 'देखा', 'दिया', 'लिया', 'लगा', 'ने', 'गई', 'आई', 'लेकिन', 'फिर', 'क्योंकि', 'इसलिए', 'जब', 'अगर', 'कि', 'ज़रूर']) {
      expect(c.has(w), `0C should contain ${w}`).toBe(true);
    }
    const textC = byWork('pehli-kahaniyan-0c').map(textOf).join(' ');
    for (const phrase of ['आ गया', 'कर दिया', 'ले लिया', 'बैठ गया']) expect(textC, phrase).toContain(phrase);
  });
});

describe('Hindi Stage 0: the cast', () => {
  it('the recurring cast is named in the stories, and no romanized name appears anywhere in the Hindi', () => {
    const all = docs.map(textOf).join(' ');
    for (const n of ['रवि', 'मीरा', 'माँ', 'पापा', 'दादी', 'दादा', 'अमित', 'नेहा', 'राजू', 'सीता', 'शर्मा', 'मोती']) expect(wordsOf(all), n).toContain(n);
    // Stage 0A introduces the home, school and market; the village is in 0B and the city in 0B
    const a = wordsOf(byWork('pehli-kahaniyan-0a').map(textOf).join(' '));
    for (const w of ['घर', 'स्कूल', 'बाज़ार']) expect(a, w).toContain(w);
    expect(wordsOf(byWork('pehli-kahaniyan-0b').map(textOf).join(' '))).toEqual(expect.arrayContaining(['गाँव', 'शहर']));
  });
});

describe('Hindi Stage 0: analysis coverage (reported, not asserted)', () => {
  it('prints the coverage of each text with the Hindi adapter as it is today', () => {
    const batch = validateBatch(raw, { registry, knownWorks });
    const unanalysed = new Map<string, number>();
    let words = 0;
    let analysed = 0;
    const lines: string[] = [];
    for (const r of batch.documents) {
      const c = r.coverage;
      if (!c) { lines.push(`${r.id}: no coverage`); continue; }
      words += c.words; analysed += c.analysed;
      for (const u of c.unanalysed) unanalysed.set(u, (unanalysed.get(u) ?? 0) + 1);
      lines.push(`${r.id.padEnd(10)} ${(c.coverage * 100).toFixed(1).padStart(5)}%  (${c.analysed}/${c.words} words, ${c.unanalysed.length} distinct unanalysed)`);
    }
    console.info(`Hindi Stage 0 coverage (adapter ${registry.get('hi').name} v${registry.get('hi').version}):\n${lines.join('\n')}`);
    console.info(`TOTAL ${(words ? (analysed / words) * 100 : 100).toFixed(1)}% (${analysed}/${words}); distinct unanalysed forms across all texts: ${unanalysed.size}`);
    console.info(`UNANALYSED FORMS: ${[...unanalysed.keys()].sort((a, b) => a.localeCompare(b, 'hi')).join(' ')}`);
    expect(batch.documents.length).toBe(docs.length);
  });
});
