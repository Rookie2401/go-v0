/**
 * Builds src/adapters/latin/gloss-data.ts: the LEADING gloss of the commonest Vulgate lemmas, ordered for a reader of the Vulgate.
 *
 * Why: Whitaker's glosses put the classical sense first ("owner, lord, master; the Lord"; "assembly" for ecclesia). A reader of the Vulgate
 * wants the sense the Vulgate uses first. For the ~520 lemmas the seed lexicon counts as commonest in the Clementine Vulgate:
 *   a CURATED lead (below), written by hand where the Vulgate sense differs from the first Whitaker sense, with the first senses of the Wiktionary
 *   (kaikki.org extract) entry for the lemma and part of speech as the checklist: GLOSS_REPORT=1 prints, for the commonest lemmas, the Wiktionary senses
 *   tagged Ecclesiastical / Biblical / Late Latin (first) and the first plain sense. The automatic pick was tried and rejected: for sto it led with
 *   "to be", for virga with "penis"; it is a review aid, not an input. Lemmas not listed keep Whitaker's order.
 * The runtime (lexicon.ts orderGloss) then appends Whitaker's own senses that the lead does not already say, so nothing is lost.
 *
 * Input (read only): C:/Users/CJWal/dev/romance-v0/data/dict/kaikki-la.jsonl (Wiktionary via kaikki.org, CC BY-SA 4.0 / GFDL, already on disk;
 * nothing is downloaded). Run once, by hand:  node scripts/latin-build-glosses.mjs   (about a minute; Node >= 22.18 strips the TypeScript types).
 * Output is committed; the app does not read the 1.2 GB file.
 */
import fs from 'node:fs';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const KAIKKI = process.env.KAIKKI_LA ?? 'C:/Users/CJWal/dev/romance-v0/data/dict/kaikki-la.jsonl';
const OUT = fileURLToPath(new URL('../src/adapters/latin/gloss-data.ts', import.meta.url));
const TOP = 520;

/** Hand-written leads: [lemma|POS] -> the Vulgate sense first. Whitaker's remaining senses follow at runtime. */
const CURATED = {
  'dominus|NOUN': 'lord, master (the Lord, God or Christ); owner',
  'deus|NOUN': 'God; a god',
  'filius|NOUN': 'son; (pl.) children, descendants',
  'verbum|NOUN': 'word; the Word (Christ); saying, thing, matter',
  'spiritus|NOUN': 'spirit, the Spirit (of God); breath, wind',
  'ecclesia|NOUN': 'church; assembly, congregation',
  'caro|NOUN': 'flesh; the body, human nature',
  'gratia|NOUN': 'grace; favour, thanks',
  'fides|NOUN': 'faith, belief; trust, fidelity',
  'anima|NOUN': 'soul, life; breath',
  'caelum|NOUN': 'heaven, the heavens; sky',
  'angelus|NOUN': 'angel; messenger',
  'sanguis|NOUN': 'blood; bloodshed, kinship',
  'sacerdos|NOUN': 'priest',
  'populus|NOUN': 'people, nation; crowd',
  'gens|NOUN': 'nation, people (the Gentiles); family',
  'rex|NOUN': 'king',
  'regnum|NOUN': 'kingdom; reign',
  'terra|NOUN': 'earth, land; ground',
  'mundus|NOUN': 'world',
  'dies|NOUN': 'day; time',
  'nomen|NOUN': 'name; reputation',
  'manus|NOUN': 'hand; power, band of men',
  'oculus|NOUN': 'eye',
  'cor|NOUN': 'heart; mind',
  'verbum|VERB': 'word',
  'lex|NOUN': 'law (esp. the Law of Moses); rule',
  'propheta|NOUN': 'prophet',
  'discipulus|NOUN': 'disciple; pupil',
  'apostolus|NOUN': 'apostle; messenger',
  'evangelium|NOUN': 'gospel, good news',
  'peccatum|NOUN': 'sin; fault',
  'iustitia|NOUN': 'righteousness, justice',
  'misericordia|NOUN': 'mercy, compassion',
  'gloria|NOUN': 'glory; fame',
  'pax|NOUN': 'peace',
  'vita|NOUN': 'life',
  'mors|NOUN': 'death',
  'ignis|NOUN': 'fire',
  'aqua|NOUN': 'water',
  'pater|NOUN': 'father (also God the Father); ancestor',
  'mater|NOUN': 'mother',
  'frater|NOUN': 'brother; fellow believer',
  'homo|NOUN': 'man, human being; person',
  'vir|NOUN': 'man, husband; hero',
  'mulier|NOUN': 'woman; wife',
  'servus|NOUN': 'servant, slave',
  'ancilla|NOUN': 'maidservant, handmaid',
  'templum|NOUN': 'temple',
  'civitas|NOUN': 'city; state, citizenship',
  'lux|NOUN': 'light; daylight',
  'tenebrae|NOUN': 'darkness; shadows',
  'iudicium|NOUN': 'judgement; trial, court',
  'iudex|NOUN': 'judge',
  'dico|VERB': 'say, speak, tell; call, name',
  'facio|VERB': 'make, do; cause, act',
  'video|VERB': 'see; look at, perceive',
  'venio|VERB': 'come; arrive',
  'audio|VERB': 'hear, listen; obey',
  'do|VERB': 'give; grant, offer',
  'habeo|VERB': 'have, hold; consider',
  'sum|VERB': 'be; exist',
  'credo|VERB': 'believe; trust, entrust',
  'oro|VERB': 'pray; beg, plead',
  'peto|VERB': 'ask, seek; make for',
  'quaero|VERB': 'seek, look for; ask',
  'invenio|VERB': 'find; discover, come upon',
  'dimitto|VERB': 'send away, dismiss; forgive, let go',
  'accipio|VERB': 'receive, accept; take, hear',
  'surgo|VERB': 'rise, get up; arise',
  'resurgo|VERB': 'rise again',
  'loquor|VERB': 'speak, talk',
  'ambulo|VERB': 'walk; travel',
  'adoro|VERB': 'worship, adore; pray to',
  'benedico|VERB': 'bless; speak well of',
  'baptizo|VERB': 'baptize',
  'salvo|VERB': 'save, rescue',
  'saluto|VERB': 'greet, salute',
  'sanctus|ADJ': 'holy, sacred; saintly',
  'bonus|ADJ': 'good; kind, useful',
  'malus|ADJ': 'bad, evil; wicked',
  'magnus|ADJ': 'great, large; important',
  'omnis|ADJ': 'all, every; whole',
  'multus|ADJ': 'much, many; numerous',
  'primus|ADJ': 'first; chief',
  'unus|ADJ': 'one; a single, only',
  'tuus|ADJ': 'your, yours (singular)',
  'meus|ADJ': 'my, mine',
  'suus|ADJ': 'his, her, its, their own',
  'vester|ADJ': 'your, yours (plural)',
  'noster|ADJ': 'our, ours',
  'sicut|ADV': 'as, just as, like',
  'enim|CONJ': 'for, indeed',
  'autem|CONJ': 'but, moreover; and',
  'et|CONJ': 'and; also, even',
  'ut|CONJ': 'so that, in order that; as, when',
  'quia|CONJ': 'because; that',
  'quoniam|CONJ': 'because, since; that',
  'ergo|ADV': 'therefore, so, then',
  'ecce|INTJ': 'behold, see, look',
  'amen|INTJ': 'amen, truly, so be it',
  "Pharisaeus|NOUN": "Pharisee",
  "abominatio|NOUN": "abomination",
  "benedictio|NOUN": "blessing",
  "scientia|NOUN": "knowledge",
  "soror|NOUN": "sister",
  "sors|NOUN": "lot; fate, portion",
  "spes|NOUN": "hope",
  "tribulatio|NOUN": "distress, tribulation",
  "opus|NOUN": "work, deed; labour",
  "sabbatum|NOUN": "sabbath; week",
  "sanctuarium|NOUN": "sanctuary",
  "signum|NOUN": "sign, mark; signal, standard",
  "tempus|NOUN": "time; season",
  "terminus|NOUN": "boundary, limit; end",
  "virga|NOUN": "rod, staff; twig",
  "aedifico|VERB": "build, erect; edify",
  "clamo|VERB": "cry out, call",
  "manduco|VERB": "eat, chew",
  "nosco|VERB": "learn, come to know",
  "pasco|VERB": "feed, pasture",
  "praedico|VERB": "preach, proclaim",
  "sedeo|VERB": "sit, be seated; remain",
  "sto|VERB": "stand; stay, remain",
  "visito|VERB": "visit; punish",
  "possideo|VERB": "possess, own; inherit",
  "paro|VERB": "prepare; get, provide",
  "pango|VERB": "fasten, fix; compose",
  "apprehendo|VERB": "seize, lay hold of; grasp, understand",
  "novissimus|ADJ": "last, latest; newest",
  "porro|ADV": "further, moreover; onward",
  "agnus|NOUN": "lamb",
  "altare|NOUN": "altar",
  "animus|NOUN": "mind, spirit; soul, courage",
  "arca|NOUN": "ark; chest, box",
  "caput|NOUN": "head; top, chief",
  "corpus|NOUN": "body; person",
  "domus|NOUN": "house; household, family",
  "dux|NOUN": "leader, chief, commander",
  "exercitus|NOUN": "army; host",
  "familia|NOUN": "household, family; servants",
  "foedus|NOUN": "covenant, treaty; alliance",
  "gladius|NOUN": "sword",
  "hostia|NOUN": "sacrifice, offering, victim",
  "iter|NOUN": "journey, way, road",
  "iumentum|NOUN": "beast of burden, pack animal",
  "lapis|NOUN": "stone",
  "latus|NOUN": "side, flank",
  "liber|NOUN": "book, scroll",
  "lignum|NOUN": "wood, tree; timber",
  "mandatum|NOUN": "commandment, command",
  "mensa|NOUN": "table",
  "munus|NOUN": "gift, offering; duty, office",
  "murus|NOUN": "wall",
  "natio|NOUN": "nation, people; birth",
  "fructus|NOUN": "fruit; produce, profit",
  "facies|NOUN": "face; appearance",
  "castra|NOUN": "camp; fortress",
  "causa|NOUN": "cause, reason; case, matter; (abl.) for the sake of",
  "cibus|NOUN": "food",
  "circuitus|NOUN": "circuit, circle; going round",
  "conspectus|NOUN": "sight, presence; view",
  "cubitum|NOUN": "cubit (a measure); elbow",
  "currus|NOUN": "chariot",
  "dextera|NOUN": "right hand",
  "dolor|NOUN": "pain, sorrow, grief",
  "ager|NOUN": "field; land",
  "genus|NOUN": "kind, race, family; offspring",
  "grex|NOUN": "flock; herd",
  "honor|NOUN": "honour; office, dignity",
  "hora|NOUN": "hour; time",
  "idolum|NOUN": "idol",
  "ira|NOUN": "anger, wrath",
  "labium|NOUN": "lip",
  "leo|NOUN": "lion",
  "locus|NOUN": "place; passage, opportunity",
  "merces|NOUN": "reward, wages, hire",
  "mons|NOUN": "mountain, hill",
  "multitudo|NOUN": "multitude, crowd",
  "plebs|NOUN": "people, common people; congregation",
  "sacerdos|NOUN": "priest",
  "ago|VERB": "do, act; drive, lead; spend (time)",
  "colo|VERB": "worship, honour; cultivate, till; dwell in",
  "confiteor|VERB": "confess; praise, give thanks",
  "doceo|VERB": "teach, instruct",
  "duco|VERB": "lead, bring; consider",
  "educo|VERB": "lead out, bring out",
  "impleo|VERB": "fill; fulfil",
  "iubeo|VERB": "command, order, bid",
  "lego|VERB": "read; gather, choose",
  "maneo|VERB": "remain, stay; abide",
  "mitto|VERB": "send; throw, let go",
  "ministro|VERB": "serve, minister to; supply",
  "mando|VERB": "command, charge; entrust",
  "narro|VERB": "tell, relate",
  "cado|VERB": "fall; die",
  "capio|VERB": "take, seize; capture; contain",
  "compleo|VERB": "fill; fulfil, complete",
  "gigno|VERB": "beget, bear; produce, cause",
  "invoco|VERB": "call upon, invoke",
  "immolo|VERB": "sacrifice, offer; slay",
  "iudico|VERB": "judge; decide, condemn",
  "laudo|VERB": "praise",
  "libero|VERB": "free, deliver; release",
  "magnifico|VERB": "magnify, praise highly; esteem",
  "constituo|VERB": "appoint, establish; decide",
  "convenio|VERB": "come together, assemble; suit",
  "converto|VERB": "turn, turn back; convert",
  "cognosco|VERB": "know, learn; recognise",
  "consumo|VERB": "consume, destroy; spend",
  "considero|VERB": "consider; look at",
  "confundo|VERB": "confound, put to shame; pour together",
  "dissipo|VERB": "scatter; squander, destroy",
  "divido|VERB": "divide",
  "effundo|VERB": "pour out, shed",
  "eligo|VERB": "choose, elect",
  "exalto|VERB": "exalt, raise up",
  "exaudio|VERB": "hear, listen to (a prayer)",
  "extendo|VERB": "stretch out, extend",
  "fugio|VERB": "flee, escape; avoid",
  "habito|VERB": "dwell, live in",
  "humilio|VERB": "humble, bring low",
  "impono|VERB": "lay upon, put on; impose",
  "induo|VERB": "put on, clothe",
  "interficio|VERB": "kill, slay",
  "interrogo|VERB": "ask, question",
  "altus|ADJ": "high, lofty; deep",
  "beatus|ADJ": "blessed, happy",
  "fidelis|ADJ": "faithful; believing, trustworthy",
  "immundus|ADJ": "unclean, impure",
  "iustus|ADJ": "righteous, just; lawful",
  "mirabilis|ADJ": "wonderful, marvellous",
  "cunctus|ADJ": "all, whole; (pl.) everyone",
  "neque|ADV": "nor, and not; not",
};

const NEG = /^(obsolete|archaic|poetic|rare|dated|historical|medieval|humorous|slang|vulgar|Late-Latin-only)$/i;
const POSITIVE = /^(Ecclesiastical|Biblical|Christianity|Church-Latin|Late-Latin|Late Latin|Medieval-Latin)$/i;
const FORMISH = /^(inflection of|form of|alternative (form|spelling)|obsolete (form|spelling)|misspelling|nominative|genitive|dative|accusative|ablative|vocative|first-person|second-person|third-person|supine of|participle of|gerund of|gerundive of|perfect (active|passive) (indicative|participle)|present (active|passive) (indicative|participle)|(\w+ )?(singular|plural) of)/i;
const POSMAP = { NOUN: ['noun'], PROPN: ['name', 'noun'], ADJ: ['adj'], VERB: ['verb'], AUX: ['verb'], ADV: ['adv'], ADP: ['prep'], CONJ: ['conj'], SCONJ: ['conj'], INTJ: ['intj'], PRON: ['pron'], DET: ['det', 'pron'], NUM: ['num'] };

// ── 1. the commonest lemmas of the seed lexicon
const seed = await import('../src/adapters/latin/lexicon-data.ts');
const extra = await import('../src/adapters/latin/lexicon-extra.ts');
const rows = [];
const push = (lemma, pos, gloss, count) => rows.push({ lemma, pos, gloss, count: Number(count) || 0 });
for (const r of [...seed.NOUN_ROWS, ...extra.EXTRA_NOUNS]) push(r[0], 'NOUN', r[3], r[4]);
for (const r of [...seed.ADJ_ROWS, ...extra.EXTRA_ADJS]) push(r[0], 'ADJ', r[4], r[5]);
for (const r of [...seed.VERB_ROWS, ...extra.EXTRA_VERBS]) push(r[0], 'VERB', r[6], r[7]);
for (const r of [...seed.ADV_ROWS, ...extra.EXTRA_ADVS]) push(r[0], 'ADV', r[1], r[2]);
for (const r of seed.CONJ_ROWS) push(r[0], 'CONJ', r[1], r[2]);
for (const r of seed.INTJ_ROWS) push(r[0], 'INTJ', r[1], r[2]);
const seen = new Set();
const top = rows.filter((r) => { const k = r.lemma + '|' + r.pos; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => b.count - a.count).slice(0, TOP);
const want = new Map();
for (const r of top) { const l = want.get(r.lemma) ?? []; l.push(r); want.set(r.lemma, l); }
for (const k of Object.keys(CURATED)) { const [l, p] = k.split('|'); if (!want.has(l)) want.set(l, []); if (!want.get(l).some((r) => r.pos === p)) want.get(l).push({ lemma: l, pos: p, gloss: '', count: 0 }); }

// ── 2. Wiktionary senses (streamed)
const picked = new Map();
const rl = readline.createInterface({ input: fs.createReadStream(KAIKKI, { encoding: 'utf8' }), crlfDelay: Infinity });
for await (const line of rl) {
  // the headword is the "word" that is followed by the language (descendants and derived terms have their own "word" keys)
  const m = /"word": "([^"]+)", "lang": "Latin"/.exec(line);
  if (!m) continue;
  const word = m[1];
  if (!want.has(word)) continue;
  let o;
  try { o = JSON.parse(line); } catch { continue; }
  for (const r of want.get(word)) {
    if (!(POSMAP[r.pos] ?? []).includes(o.pos)) continue;
    const key = r.lemma + '|' + r.pos;
    const senses = (o.senses ?? []).filter((s) => s.glosses?.length && !(s.tags ?? []).some((t) => /form-of|alt-of|misspelling|obsolete-spelling/.test(t)) && !FORMISH.test(s.glosses[0]));
    const scored = senses.map((s, i) => {
      const tags = [...(s.tags ?? []), ...(s.categories ?? []).map((c) => c.name ?? '')];
      const pos = tags.some((t) => POSITIVE.test(t) || /Ecclesiastical Latin|Christianity|Late Latin|Biblical/i.test(t)) ? 0 : 1;
      const neg = (s.tags ?? []).some((t) => NEG.test(t)) ? 1 : 0;
      return { i, g: s.glosses[s.glosses.length - 1] && s.glosses.length > 1 ? s.glosses[0] + ': ' + s.glosses[s.glosses.length - 1] : s.glosses[0], rank: neg * 2 + pos, eccl: pos === 0 };
    }).sort((a, b) => a.rank - b.rank || a.i - b.i);
    const prev = picked.get(key);
    if (!prev || prev.length === 0) picked.set(key, scored);
  }
}

// ── 3. write
const clean = (g) => g.replace(/\s*\([^)]*\)\s*$/, '').replace(/\s+/g, ' ').trim().replace(/[.;]+$/, '');
const out = {};
let nCur = 0, nWik = 0, nNone = 0;
const report = [];
for (const r of top) {
  const key = r.lemma + '|' + r.pos;
  if (CURATED[key]) { out[key] = CURATED[key]; nCur++; continue; }
  // Wiktionary leads only where it marks a sense as Ecclesiastical / Biblical / Late Latin: that sense first, then the plain first sense; elsewhere Whitaker's order stands
  const sc = picked.get(key) ?? [];
  const eccl = sc.filter((x) => x.eccl).sort((a, b) => a.i - b.i)[0];
  const plain = sc.filter((x) => !x.eccl).sort((a, b) => a.i - b.i)[0];
  const lead = [eccl, plain].filter(Boolean).map((x) => clean(x.g)).filter((g) => g && g.length <= 70);
  const uniq = [...new Set(lead)];
  if (eccl && uniq.length) { nWik++; report.push(`${key}: ${uniq.join('; ')}`); } else nNone++;
}
for (const k of Object.keys(CURATED)) if (!out[k]) { out[k] = CURATED[k]; nCur++; }
const L = [];
L.push('/**');
L.push(' * GENERATED by scripts/latin-build-glosses.mjs, then reviewed by hand (the CURATED table in that script) — do not edit here.');
L.push(' * The leading gloss of the commonest Vulgate lemmas, ordered for a reader of the Vulgate: key "lemma|POS". The lexicon appends Whitaker\'s own senses after the lead.');
L.push(' * Source of the non-curated leads: the first senses of the Wiktionary entry (kaikki.org extract), Ecclesiastical / Biblical senses first. Wiktionary text is');
L.push(' * CC BY-SA 4.0; the curated leads are written for this app (also offered under CC BY-SA 4.0 with the rest of the adapter\'s data).');
L.push(' */');
L.push('export const GLOSS_LEAD: Record<string, string> = {');
for (const k of Object.keys(out).sort()) L.push(`  ${JSON.stringify(k)}: ${JSON.stringify(out[k])},`);
L.push('};');
L.push('');
fs.writeFileSync(OUT, L.join('\n'));
if (process.env.GLOSS_REPORT) console.log(report.join('\n'));
console.log(`gloss-data.ts: ${Object.keys(out).length} leads (${nCur} curated; Wiktionary offered an Ecclesiastical / Biblical sense for ${nWik} of the commonest lemmas, ${nNone} had none: all left to review, Whitaker's order stands)`);
