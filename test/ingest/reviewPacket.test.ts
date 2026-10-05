import { describe, expect, it } from 'vitest';
import { computePublished, contentSignatureOf, validateDocument, type CorpusDocument } from '../../src/ingest';
import { advance, applyReturn, buildReviewPacket, CHECKLIST_GUIDE, CHECKLIST_ITEMS, listSentences, parseReturn, pipelineSummary, type ParsedReturn } from '../../src/ingest/pipeline';
import { PIPELINE_REASONS } from '../../src/ingest/publish';
import { baseDoc, registry } from './helpers';

const adapter = registry.get('es');
const segment = (text: string) => adapter.segmentSentences(text);
const clone = <T,>(x: T): T => structuredClone(x);
const errors = (doc: unknown) => validateDocument(doc, { registry }).filter((i) => i.severity === 'error');

/** A small machine-drafted Spanish unit: a declared paragraph (3 sentences) and a raw paragraph the adapter splits (2). */
const unit = (): CorpusDocument => ({
  ...baseDoc(), id: 'es-a1-1-01', title: 'Mi casa', generated: true, editorialTags: ['machine-drafted'], variety: 'es-HN',
  source: { id: 'src:ladder', title: 'ladder', attribution: 'GoLearn ladder', provenance: 'machine-drafted for the ladder; not yet reviewed by a person', rights: 'generated', authorship: 'generated' },
  speakers: { A: 'Ana' },
  sections: [{ title: 'Primera parte', paragraphs: [
    { sentences: [
      { id: 's1', text: 'Me llamo Ana.', english: 'My name is Ana.', speaker: 'A' },
      { id: 's2', text: 'Vivo en una casa pequeña.', spans: [{ start: 0, end: 4, lemma: 'vivir' }] },
      { id: 's3', text: 'Tengo un perro & un gato.' },
    ] },
    { text: 'Mi perro se llama Canelo. Come mucho pan.', english: ['My dog is called Canelo.', 'He eats a lot of bread.'] },
  ] }],
  pipeline: { state: 'machine-draft', history: [{ state: 'machine-draft', at: '2026-10-05', by: { kind: 'tool', name: 'ladder drafting agent' } }] },
});

const texts = (d: CorpusDocument) => listSentences(d, segment).map((s) => s.text);
const filled = (packet: ReturnType<typeof buildReviewPacket>, patch: Record<string, unknown> = {}) => {
  const ret = JSON.parse(JSON.stringify(packet.returnTemplate)) as Record<string, any>; // as a reviewer's editor would save it
  ret.reviewer = { name: 'Ana Ruiz', competence: 'native', variety: 'es-HN', role: 'linguistic-reviewer' };
  ret.date = '2026-10-12';
  return Object.assign(ret, patch);
};
const okChecklist = () => Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, { result: 'ok', note: '' }]));
const parse = (raw: unknown): ParsedReturn => {
  const p = parseReturn(raw);
  if (!p.ok) throw new Error(`refused: ${p.refusals.map((r) => r.code).join(',')}`);
  return p.value;
};
const apply = (doc: CorpusDocument, raw: unknown) => applyReturn(doc, parse(raw), { segment });
const codes = (r: ReturnType<typeof applyReturn>) => (r.ok ? [] : r.refusals.map((x) => x.code));

describe('the review packet', () => {
  const doc = unit();
  const packet = buildReviewPacket(doc, { segment, unitPath: 'data/ladder/es/units/es-a1-1-01.json', date: '2026-10-11' });

  it('the unit used here is a valid document', () => {
    expect(errors(doc)).toEqual([]);
  });

  it('numbers the sentences as the importer would see them (declared ones as given, raw paragraphs split by the adapter)', () => {
    expect(packet.sentences.map((s) => [s.n, s.text])).toEqual([
      [1, 'Me llamo Ana.'], [2, 'Vivo en una casa pequeña.'], [3, 'Tengo un perro & un gato.'], [4, 'Mi perro se llama Canelo.'], [5, 'Come mucho pan.'],
    ]);
    expect(packet.htmlName).toBe('es-a1-1-01.packet.html');
    expect(packet.returnName).toBe('es-a1-1-01.return.json');
  });

  it('the printable HTML is self-contained and carries title, language, variety, sentences, the eight questions and the reviewer\'s details', () => {
    const h = packet.html;
    expect(h.startsWith('<!doctype html>')).toBe(true);
    expect(h).not.toMatch(/<script|<link |src="http|href="http/i);
    expect(h).toContain('Mi casa');
    expect(h).toContain('Spanish');
    expect(h).toContain('es-HN');
    for (const s of packet.sentences) expect(h).toContain(`<div class="num">${s.n}</div>`);
    expect(h).toContain('Tengo un perro &amp; un gato.'); // escaped
    expect(h).toContain('Ana:'); // the speaker's display name
    expect(h).toContain('Primera parte');
    expect(h).toContain('My name is Ana.');
    expect(CHECKLIST_GUIDE.map((g) => g.item)).toEqual(CHECKLIST_ITEMS);
    expect(h).toContain('Does anything sound translated from English?');
    for (const g of CHECKLIST_GUIDE) { expect(h).toContain(g.question.replace(/&/g, '&amp;')); expect(h).toContain(g.explanation); }
    expect((h.match(/<div class="item">/g) ?? []).length).toBe(8);
    expect((h.match(/class="fix"/g) ?? []).length).toBe(5); // room for a correction under every sentence
    for (const w of ['Your name', 'Native speaker', 'Near-native', 'Professional', 'The variety you speak', 'Signature']) expect(h).toContain(w);
    expect(h).toContain('@media print');
  });

  it('writes a return template: the sentences by number, no corrections, a null checklist, empty reviewer fields', () => {
    const t = JSON.parse(JSON.stringify(packet.returnTemplate)) as Record<string, any>;
    expect(t.format).toBe('go-review-return@1');
    expect(t.unit).toMatchObject({ id: 'es-a1-1-01', lang: 'es', variety: 'es-HN', path: 'data/ladder/es/units/es-a1-1-01.json', contentSignature: contentSignatureOf(doc) });
    expect(t.sentences).toEqual(packet.sentences.map((s) => ({ n: s.n, text: s.text })));
    expect(t.corrections).toEqual([]);
    expect(t.checklist).toEqual(Object.fromEntries(CHECKLIST_ITEMS.map((k) => [k, null])));
    expect(t.reviewer).toMatchObject({ name: '', competence: '', variety: '', role: 'linguistic-reviewer' });
    expect(Object.keys(t.checklist)).toEqual(['naturalness', 'contemporaryUsage', 'register', 'grammar', 'dialect', 'soundsTranslated', 'culturalOddities', 'unnaturalSimplification']);
  });

  it('an unfilled template is refused: a person with a name and a competence is required', () => {
    const r = parseReturn(JSON.parse(JSON.stringify(packet.returnTemplate)));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.refusals.map((x) => x.code)).toEqual(['reviewer-name-missing', 'reviewer-competence-missing']);
  });
});

describe('the return: who may send it', () => {
  const packet = buildReviewPacket(unit(), { segment });
  const refusal = (patch: Record<string, unknown>) => {
    const r = parseReturn(filled(packet, patch));
    return r.ok ? [] : r.refusals.map((x) => x.code);
  };

  it('requires a name and a competence from the three allowed; refuses a tool', () => {
    expect(refusal({})).toEqual([]);
    expect(refusal({ reviewer: { name: '', competence: 'native' } })).toEqual(['reviewer-name-missing']);
    expect(refusal({ reviewer: { name: '   ', competence: 'native' } })).toEqual(['reviewer-name-missing']);
    expect(refusal({ reviewer: { name: 'Ana' } })).toEqual(['reviewer-competence-missing']);
    expect(refusal({ reviewer: { name: 'Ana', competence: 'fluent' } })).toEqual(['reviewer-competence-invalid']);
    expect(refusal({ reviewer: { kind: 'tool', name: 'a model', competence: 'native' } })).toEqual(['reviewer-not-a-person']);
    expect(refusal({ reviewer: undefined })).toEqual(['reviewer-missing']);
    for (const c of ['native', 'near-native', 'professional']) expect(refusal({ reviewer: { name: 'Ana', competence: c } })).toEqual([]);
  });

  it('refuses malformed corrections and checklist answers', () => {
    expect(refusal({ corrections: [{ sentence: 0, replacement: 'x' }] })).toEqual(['invalid-correction']);
    expect(refusal({ corrections: [{ sentence: 2, replacement: '  ' }] })).toEqual(['invalid-correction']);
    expect(refusal({ corrections: [{ sentence: 2, replacement: 'a' }, { sentence: 2, replacement: 'b' }] })).toEqual(['duplicate-correction']);
    expect(refusal({ checklist: { naturalness: { result: 'great' } } })).toEqual(['invalid-checklist']);
    expect(refusal({ date: 'tomorrow' })).toEqual(['invalid-date']);
  });
});

describe('packet and apply: the round trip', () => {
  it('corrections change exactly the targeted sentences; the rest of the document is byte-identical; the pipeline moves in-review -> corrections-pending', () => {
    const before = unit();
    const frozen = clone(before);
    const packet = buildReviewPacket(before, { segment, unitPath: 'u.json' });
    const ret = filled(packet, {
      corrections: [
        { sentence: 2, replacement: 'Vivo en una casita.', note: 'more natural in Honduras' },
        { sentence: 5, replacement: 'Come mucho pan dulce.' }, // inside the raw paragraph
      ],
      checklist: { ...okChecklist(), naturalness: { result: 'changed', note: 'sentence 2' }, dialect: { result: 'changed' } },
    });
    const r = apply(before, JSON.parse(JSON.stringify(ret)));
    if (!r.ok) throw new Error(JSON.stringify(r.refusals));
    expect(before).toEqual(frozen); // pure

    // exactly the targeted sentences changed
    const was = texts(before);
    const now = texts(r.doc);
    expect(now).toEqual([was[0], 'Vivo en una casita.', was[2], was[3], 'Come mucho pan dulce.']);
    expect(r.changes.map((c) => [c.n, c.before, c.after])).toEqual([[2, 'Vivo en una casa pequeña.', 'Vivo en una casita.'], [5, 'Come mucho pan.', 'Come mucho pan dulce.']]);
    expect(r.changes[0].note).toBe('more natural in Honduras');
    // sentence 2's span described the old wording: dropped, and said so
    expect(r.changes[0].dropped).toEqual(['spans (1)']);
    expect(r.warnings.join(' ')).toContain('English rescue lines were kept');

    // everything else in the document is byte-identical
    const sentences = (d: CorpusDocument) => (d.sections[0].paragraphs[0] as unknown as { sentences: Array<Record<string, unknown>> }).sentences;
    expect(JSON.stringify(sentences(r.doc)[0])).toBe(JSON.stringify(sentences(before)[0]));
    expect(JSON.stringify(sentences(r.doc)[2])).toBe(JSON.stringify(sentences(before)[2]));
    expect(sentences(r.doc)[1]).toEqual({ id: 's2', text: 'Vivo en una casita.' });
    const par2 = (d: CorpusDocument) => d.sections[0].paragraphs[1] as { text: string; english: string[] };
    expect(par2(r.doc).text).toBe('Mi perro se llama Canelo. Come mucho pan dulce.');
    expect(par2(r.doc).english).toEqual(par2(before).english);
    expect({ ...r.doc, sections: 0, pipeline: 0 }).toEqual({ ...before, sections: 0, pipeline: 0 });
    expect(r.doc.sections[0].title).toBe('Primera parte');

    // the pipeline: in-review, then corrections-pending with the checklist and the count
    expect(r.previousState).toBe('machine-draft');
    expect(r.state).toBe('corrections-pending');
    expect(r.doc.pipeline!.history.map((e) => e.state)).toEqual(['machine-draft', 'in-review', 'corrections-pending']);
    expect(r.doc.pipeline!.history[1]).toEqual({ state: 'in-review', at: '2026-10-12', by: { kind: 'person', name: 'Ana Ruiz', competence: 'native', variety: 'es-HN', role: 'linguistic-reviewer' } });
    const last = r.doc.pipeline!.history[2];
    expect(last).toMatchObject({ state: 'corrections-pending', at: '2026-10-12', corrections: 2 });
    expect(last.checklist!.naturalness).toEqual({ result: 'changed', note: 'sentence 2' });
    expect(last.checklist!.grammar).toEqual({ result: 'ok' });
    expect(Object.keys(last.checklist!)).toEqual(CHECKLIST_ITEMS);

    expect(errors(r.doc)).toEqual([]);
    expect(computePublished(r.doc).unpublishedReasons).toContain(PIPELINE_REASONS.corrections);
    expect(pipelineSummary(r.doc)).toMatchObject({ state: 'corrections-pending', correctionRounds: 1, correctionsTotal: 2, correctionsPending: true });
  });

  it('a second return with no corrections moves corrections-pending -> reviewed; then recording and publication complete the road', () => {
    const first = apply(unit(), filled(buildReviewPacket(unit(), { segment }), { corrections: [{ sentence: 1, replacement: 'Me llamo Ana María.' }], checklist: okChecklist() }));
    if (!first.ok) throw new Error(JSON.stringify(first.refusals));
    expect(texts(first.doc)[0]).toBe('Me llamo Ana María.');

    // the reviewer must read the corrected wording: a fresh packet of the corrected unit
    const second = buildReviewPacket(first.doc, { segment });
    expect(second.sentences[0].text).toBe('Me llamo Ana María.');
    const r = apply(first.doc, filled(second, { checklist: okChecklist(), date: '2026-10-13' }));
    if (!r.ok) throw new Error(JSON.stringify(r.refusals));
    expect(r.previousState).toBe('corrections-pending');
    expect(r.state).toBe('reviewed');
    expect(r.entries.map((e) => e.state)).toEqual(['reviewed']);
    expect(r.changes).toEqual([]);
    expect(texts(r.doc)).toEqual(texts(first.doc));
    expect(r.doc.sections).toEqual(first.doc.sections);
    expect(r.doc.pipeline!.history.map((e) => e.state)).toEqual(['machine-draft', 'in-review', 'corrections-pending', 'reviewed']);
    expect(r.doc.pipeline!.history[3].contentSignature).toBe(contentSignatureOf(r.doc));
    expect(computePublished(r.doc).unpublishedReasons).toEqual([PIPELINE_REASONS.recording]);

    const ana = r.doc.pipeline!.history[3].by!;
    const rec = advance(r.doc, 'audio-ready', ana, { recordings: 'recordings/es-a1-1-01', at: '2026-10-20' });
    if (!rec.ok) throw new Error('refused');
    expect(computePublished(rec.doc)).toEqual({ published: true, unpublishedReasons: [] });
    expect(errors(rec.doc)).toEqual([]);
  });

  it('a return with no corrections on a unit still in machine-draft or in-review goes in-review -> reviewed', () => {
    const r = apply(unit(), filled(buildReviewPacket(unit(), { segment }), { checklist: okChecklist() }));
    if (!r.ok) throw new Error(JSON.stringify(r.refusals));
    expect(r.entries.map((e) => e.state)).toEqual(['in-review', 'reviewed']);
    expect(r.doc.sections).toEqual(unit().sections);
    // already in-review: only `reviewed` is appended
    const inReview = advance(unit(), 'in-review', { kind: 'person', name: 'Ana Ruiz', competence: 'native', role: 'linguistic-reviewer' });
    if (!inReview.ok) throw new Error('refused');
    const r2 = apply(inReview.doc, filled(buildReviewPacket(inReview.doc, { segment }), { checklist: okChecklist() }));
    if (!r2.ok) throw new Error(JSON.stringify(r2.refusals));
    expect(r2.entries.map((e) => e.state)).toEqual(['reviewed']);
  });

  it('a new round of corrections on a corrections-pending unit goes back through in-review', () => {
    const first = apply(unit(), filled(buildReviewPacket(unit(), { segment }), { corrections: [{ sentence: 1, replacement: 'Yo me llamo Ana.' }] }));
    if (!first.ok) throw new Error('refused');
    const again = apply(first.doc, filled(buildReviewPacket(first.doc, { segment }), { corrections: [{ sentence: 3, replacement: 'Tengo un perro y un gato.' }] }));
    if (!again.ok) throw new Error(JSON.stringify(again.refusals));
    expect(again.doc.pipeline!.history.map((e) => e.state)).toEqual(['machine-draft', 'in-review', 'corrections-pending', 'in-review', 'corrections-pending']);
    expect(errors(again.doc)).toEqual([]);
  });

  it('blank checklist items are allowed with corrections (noted), but a sign-off needs all eight and no open "problem"', () => {
    const doc = unit();
    const packet = buildReviewPacket(doc, { segment });
    const withCorr = apply(doc, filled(packet, { corrections: [{ sentence: 1, replacement: 'Soy Ana.' }] }));
    if (!withCorr.ok) throw new Error('refused');
    expect(withCorr.warnings.join(' ')).toContain('checklist items left blank');
    expect('checklist' in withCorr.doc.pipeline!.history[2]).toBe(false);

    expect(codes(apply(doc, filled(packet)))).toEqual(['checklist-incomplete']);
    expect(codes(apply(doc, filled(packet, { checklist: { ...okChecklist(), register: null } })))).toEqual(['checklist-incomplete']);
    expect(codes(apply(doc, filled(packet, { checklist: { ...okChecklist(), register: { result: 'problem', note: 'tú vs usted' } } })))).toEqual(['checklist-problem-unresolved']);
    // the same problem is fine alongside the corrections that address it
    expect(apply(doc, filled(packet, { checklist: { ...okChecklist(), register: { result: 'problem' } }, corrections: [{ sentence: 1, replacement: 'Soy Ana.' }] })).ok).toBe(true);
  });

  it('refuses a stale return, a return for another unit, a missing sentence, and a unit with no valid pipeline', () => {
    const doc = unit();
    const packet = buildReviewPacket(doc, { segment });
    const first = apply(doc, filled(packet, { corrections: [{ sentence: 1, replacement: 'Soy Ana.' }] }));
    if (!first.ok) throw new Error('refused');
    // the old packet's return, sent again after the unit was corrected
    expect(codes(apply(first.doc, filled(packet, { checklist: okChecklist() })))).toEqual(['stale-return']);
    // without the signature, the sentences the reviewer saw are compared
    const noSig = filled(packet, { checklist: okChecklist() });
    delete noSig.unit.contentSignature;
    expect(codes(apply(first.doc, noSig))).toEqual(['stale-return']);
    expect(apply(doc, noSig).ok).toBe(true);
    // another unit
    expect(codes(apply(doc, filled(packet, { unit: { ...packet.returnTemplate.unit as object, id: 'es-a1-1-02' } })))).toEqual(['wrong-unit']);
    expect(codes(apply(doc, filled(packet, { corrections: [{ sentence: 9, replacement: 'No.' }] })))).toEqual(['sentence-out-of-range']);
    // no pipeline block
    const bare = { ...doc } as Partial<CorpusDocument>;
    delete bare.pipeline;
    expect(codes(apply(bare as CorpusDocument, filled(packet, { checklist: okChecklist() })))).toEqual(['no-pipeline']);
  });

  it('a return on a unit that is already reviewed and changes nothing has nothing to do; with corrections it sends the unit back', () => {
    const reviewed = apply(unit(), filled(buildReviewPacket(unit(), { segment }), { checklist: okChecklist() }));
    if (!reviewed.ok) throw new Error('refused');
    const packet = buildReviewPacket(reviewed.doc, { segment });
    expect(codes(apply(reviewed.doc, filled(packet, { checklist: okChecklist() })))).toEqual(['nothing-to-do']);
    const back = apply(reviewed.doc, filled(packet, { corrections: [{ sentence: 2, replacement: 'Vivo en una casa.' }] }));
    if (!back.ok) throw new Error(JSON.stringify(back.refusals));
    expect(back.entries.map((e) => e.state)).toEqual(['in-review', 'corrections-pending']);
  });

  it('a replacement identical to the text changes nothing and is reported; one that re-splits a raw paragraph is refused', () => {
    const doc = unit();
    const packet = buildReviewPacket(doc, { segment });
    const same = apply(doc, filled(packet, { corrections: [{ sentence: 1, replacement: 'Me llamo Ana.' }], checklist: okChecklist() }));
    if (!same.ok) throw new Error(JSON.stringify(same.refusals));
    expect(same.ignored).toEqual([1]);
    expect(same.changes).toEqual([]);
    expect(same.state).toBe('reviewed');
    expect(codes(apply(doc, filled(packet, { corrections: [{ sentence: 4, replacement: 'Mi perro se llama Canelo. Es muy grande.' }] })))).toEqual(['sentence-count-changed']);
  });

  it('a correction cannot make the document invalid unnoticed: the result still validates for ordinary replacements', () => {
    const doc = unit();
    const r = apply(doc, filled(buildReviewPacket(doc, { segment }), { corrections: [{ sentence: 3, replacement: '  Tengo un perro.  ' }] }));
    if (!r.ok) throw new Error('refused');
    expect(texts(r.doc)[2]).toBe('Tengo un perro.'); // the reviewer's stray spaces are not kept
    expect(errors(r.doc)).toEqual([]);
  });

  it('the review does not touch rights, review block or any field outside the sentences and the pipeline', () => {
    const doc = unit();
    const r = apply(doc, filled(buildReviewPacket(doc, { segment }), { corrections: [{ sentence: 1, replacement: 'Soy Ana.' }] }));
    if (!r.ok) throw new Error('refused');
    expect(r.doc.review).toEqual({ status: 'unreviewed' });
    expect(r.doc.source).toEqual(doc.source);
    expect(r.doc.generated).toBe(true);
    expect(r.doc.editorialTags).toEqual(['machine-drafted']);
  });
});
