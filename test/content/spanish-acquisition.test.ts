/**
 * S7 — the controlled Spanish acquisition prototype (Camino 1–3 and Honduras — Lecturas 1).
 * Every document is a machine draft: it must validate with the real validator, belong to its work, stay unpublished
 * for the one stated reason, and carry one English line per sentence. Analysis coverage is printed, not asserted.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createAdapterRegistry } from '../../src/adapters';
import { computePublished, validateBatch, validateDocument, type CorpusDocument } from '../../src/ingest';
import { SPANISH_WORKS } from '../../src/course/spanish';

const DIR = path.resolve(__dirname, '../../data/corpus/es');
const registry = createAdapterRegistry();
const knownWorks = new Set(SPANISH_WORKS.map((w) => w.id));

const files = fs.readdirSync(DIR).filter((f) => /^(camino|honduras)-.*\.json$/.test(f)).sort();
const raw: unknown[] = files.map((f) => JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')));
const docs = raw as CorpusDocument[];

type S = { text: string; english?: string; spans?: unknown; corrections?: unknown };
const sentencesOf = (d: CorpusDocument): S[] =>
  d.sections.flatMap((s) => s.paragraphs.flatMap((p) => ('sentences' in p ? (p.sentences as S[]) : [])));
const wordsOf = (s: string): string[] => s.toLowerCase().match(/[\p{L}]+/gu) ?? [];
const textOf = (d: CorpusDocument) => sentencesOf(d).map((s) => s.text).join(' ');

const PLAN = [
  { slug: 'camino-1', texts: 8, min: 8, max: 12, variety: 'es-419', streams: ['acquisition'] },
  { slug: 'camino-2', texts: 8, min: 12, max: 18, variety: 'es-419', streams: ['acquisition'] },
  { slug: 'camino-3', texts: 6, min: 18, max: 30, variety: 'es-419', streams: ['acquisition'] },
  { slug: 'honduras-lecturas-1', texts: 4, min: 14, max: 30, variety: 'es-HN', streams: ['honduras', 'acquisition'] },
] as const;

const byWork = (slug: string) => docs.filter((d) => d.work?.slug === slug);

describe('Spanish acquisition path: shape', () => {
  it('has the planned number of texts per work, numbered 1..n, and nothing else', () => {
    expect(docs).toHaveLength(PLAN.reduce((n, p) => n + p.texts, 0));
    for (const p of PLAN) {
      const ds = byWork(p.slug);
      expect(ds, p.slug).toHaveLength(p.texts);
      expect(ds.map((d) => d.work?.chapter?.index), p.slug).toEqual(Array.from({ length: p.texts }, (_, i) => i + 1));
      for (const d of ds) {
        expect(d.work?.chapter?.title, d.id).toBe(d.title);
        expect(d.id.startsWith(`${p.slug}-`), d.id).toBe(true);
        expect(files).toContain(`${d.id}.json`);
      }
    }
    expect(new Set(docs.map((d) => d.id)).size).toBe(docs.length);
    expect(new Set(docs.map((d) => d.source.id)).size).toBe(docs.length);
  });

  it('sentence counts follow the plan, one level at a time', () => {
    for (const p of PLAN) for (const d of byWork(p.slug)) {
      const n = sentencesOf(d).length;
      expect(n, d.id).toBeGreaterThanOrEqual(p.min);
      expect(n, d.id).toBeLessThanOrEqual(p.max);
    }
  });

  it('sentences lengthen from Camino 1 to 2 to 3', () => {
    const mean = (slug: string) => {
      const ss = byWork(slug).flatMap(sentencesOf);
      return ss.reduce((a, s) => a + wordsOf(s.text).length, 0) / ss.length;
    };
    expect(mean('camino-1')).toBeLessThan(mean('camino-2'));
    expect(mean('camino-2')).toBeLessThan(mean('camino-3'));
  });

  it('streams, variety and domains are set per work; the work is one the Spanish course holds', () => {
    for (const p of PLAN) {
      for (const d of byWork(p.slug)) {
        const x = d as CorpusDocument & { streams?: string[]; domains?: string[]; variety?: string };
        expect(x.streams, d.id).toEqual(p.streams);
        expect(x.variety, d.id).toBe(p.variety);
        expect(x.domains?.length, d.id).toBeGreaterThan(0);
      }
      expect([...knownWorks].some((id) => id.endsWith(`:${p.slug}`)), p.slug).toBe(true);
    }
  });
});

describe('Spanish acquisition path: validation and publication', () => {
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

  it('raises no warning except low analysis coverage (while the lexicon grows) and the adapter\'s sentence splitting', () => {
    // `adapter-would-split` is the adapter's own splitter disagreeing with a declared sentence. Spanish dialogue puts the
    // speaker tag after the question or exclamation ("—¿Es bueno? —dice Ana."), which is one sentence; the declaration
    // wins at import, so this is reported for the adapter's owner, never a reason to bend the text.
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
      expect(d.contentType, d.id).toBe('story');
      expect(d.generated, d.id).toBe(true);
      expect(d.review.status, d.id).toBe('unreviewed');
      expect(d.review.reviewedBy, d.id).toBeUndefined();
      expect(d.source.rights, d.id).toBe('owner-authored');
      expect(d.source.authorship, d.id).toBe('generated');
      expect(d.editorialTags, d.id).toEqual(expect.arrayContaining(['machine-drafted', 'needs-native-review']));
      expect(d.source.provenance, d.id).toMatch(/Drafted by an AI model for the course; not reviewed by a native speaker/);
      expect(d.english?.source, d.id).toBe('drafted with the text; not reviewed');
      const gate = computePublished(d);
      expect(gate.published, d.id).toBe(false);
      expect(gate.unpublishedReasons, d.id).toHaveLength(1);
      expect(gate.unpublishedReasons[0], d.id).toMatch(/native-speaker review/);
    }
  });

  it('Honduras texts say that a Honduran reviewer must check them', () => {
    for (const d of byWork('honduras-lecturas-1')) {
      expect(d.source.provenance, d.id).toMatch(/Honduran reviewer/);
      expect(d.editorialTags, d.id).toContain('needs-regional-review');
    }
  });
});

describe('Spanish acquisition path: sentences and English', () => {
  it('exactly one non-empty English line per declared sentence, and no author analysis spans', () => {
    for (const d of docs) {
      for (const s of sentencesOf(d)) {
        expect(s.text.trim().length, d.id).toBeGreaterThan(0);
        expect(typeof s.english === 'string' && s.english.trim().length > 0, `${d.id}: ${s.text}`).toBe(true);
        expect(s.spans, `${d.id}: ${s.text}`).toBeUndefined();
        expect(s.corrections, `${d.id}: ${s.text}`).toBeUndefined();
      }
      for (const sec of d.sections) for (const p of sec.paragraphs) expect('sentences' in p, d.id).toBe(true);
    }
  });

  it('text is NFC and trimmed; every ¿ ¡ is balanced by its ? or !', () => {
    for (const d of docs) for (const s of sentencesOf(d)) {
      expect(s.text, d.id).toBe(s.text.normalize('NFC'));
      expect(s.text, d.id).toBe(s.text.trim());
      const count = (re: RegExp) => (s.text.match(re) ?? []).length;
      expect(count(/¿/g), `${d.id}: ${s.text}`).toBe(count(/\?/g));
      expect(count(/¡/g), `${d.id}: ${s.text}`).toBe(count(/!/g));
    }
  });

  it('opens Camino 1 with narrative, not a word list', () => {
    expect(sentencesOf(byWork('camino-1')[0])[0].text).toBe('Juan tiene un libro.');
    for (const d of byWork('camino-1')) for (const s of sentencesOf(d)) expect(wordsOf(s.text).length, s.text).toBeGreaterThanOrEqual(3);
  });
});

describe('Spanish acquisition path: Latin American Spanish, voseo in exactly one text', () => {
  // vosotros forms and pronouns: vosotros / vosotras / vuestro; -áis / -éis verb endings; sois / vais; the clitic "os"
  // (\b is not Unicode-aware in JavaScript: "años" would match "os", so letters are tested explicitly.)
  const VOSOTROS = /(?<!\p{L})(vosotros|vosotras|vuestr[oa]s?|sois|vais|os)(?!\p{L})|\p{L}*(áis|éis)(?!\p{L})/iu;
  const VOS = /(?<!\p{L})(vos|tenés|querés|hacés|sos|vení|mirá|cuidate|podés|sabés|decime)(?!\p{L})/iu;

  it('uses no vosotros forms anywhere', () => {
    for (const d of docs) for (const s of sentencesOf(d)) expect(VOSOTROS.test(s.text), `${d.id}: ${s.text}`).toBe(false);
  });

  it('uses vos only in one Honduran text, among friends, with its correct forms', () => {
    const withVos = docs.filter((d) => VOS.test(textOf(d)));
    expect(withVos.map((d) => d.id)).toEqual(['honduras-lecturas-1-02']);
    const t = textOf(withVos[0]).toLowerCase();
    expect(t).toContain('vos tenés');
    expect(t).toContain('vos querés');
    expect(t).toContain('qué hacés');
    expect(t).toContain('vos sos');
  });

  it('uses usted as the ordinary polite form in the other Honduras readings', () => {
    const polite = byWork('honduras-lecturas-1').filter((d) => d.id !== 'honduras-lecturas-1-02');
    expect(polite.some((d) => /\busted\b|\bquiere sentarse\b/i.test(textOf(d)))).toBe(true);
    for (const d of polite) expect(/\b(tienes|quieres|eres|puedes)\b/i.test(textOf(d)), d.id).toBe(false);
  });

  it('uses Latin American words, not Spain\'s (carro, jugo; no coche, ordenador, zumo, vale)', () => {
    const all = docs.map(textOf).join(' ');
    expect(all).toMatch(/\bcarro\b/);
    expect(all).toMatch(/\bjugo\b/);
    for (const w of ['coche', 'ordenador', 'zumo', 'móvil', 'vale', 'vosotros']) expect(new RegExp(`\\b${w}\\b`, 'i').test(all), w).toBe(false);
  });

  it('recycles vocabulary: most words of each Camino 2 text were met in Camino 1 or 2 already', () => {
    const seen = new Set(byWork('camino-1').flatMap((d) => wordsOf(textOf(d))));
    for (const d of byWork('camino-2')) {
      const ws = [...new Set(wordsOf(textOf(d)))];
      const known = ws.filter((w) => seen.has(w)).length;
      expect(known / ws.length, d.id).toBeGreaterThan(0.3);
      for (const w of ws) seen.add(w);
    }
  });
});

describe('Spanish acquisition path: analysis coverage (reported, not asserted)', () => {
  it('prints the coverage of each text with the Spanish adapter as it is today', () => {
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
      lines.push(`${r.id.padEnd(26)} ${(c.coverage * 100).toFixed(1).padStart(5)}%  (${c.analysed}/${c.words} words, ${c.unanalysed.length} distinct unanalysed)`);
    }
    console.info(`Spanish acquisition coverage (adapter ${registry.get('es').name} v${registry.get('es').version}):\n${lines.join('\n')}`);
    console.info(`TOTAL ${(words ? (analysed / words) * 100 : 100).toFixed(1)}% (${analysed}/${words}); distinct unanalysed forms across all texts: ${unanalysed.size}`);
    console.info(`UNANALYSED FORMS: ${[...unanalysed.keys()].sort((a, b) => a.localeCompare(b, 'es')).join(' ')}`);
    expect(batch.documents.length).toBe(docs.length);
  });
});
