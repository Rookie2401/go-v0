/**
 * The varieties of Greek the adapter can label: the PERIODS of one language (kind 'period': Homeric, Attic, Koine, Medieval,
 * Modern — each a learner may target), the other ancient dialects (kind 'regional', recognised beside Attic), and Katharevousa as
 * a historical written form of Modern Greek. Nothing is suppressed: an Attic form in a Modern learner's text is shown and tracked,
 * with a plain statement of where it belongs.
 *
 * Analysed periods: el-koi (MorphGNT over the SBL Greek New Testament), el-att and el-hom (the Wiktionary Ancient Greek tables,
 * whose headers name the dialect) and el-mod (the Wiktionary Modern Greek tables). Medieval (Byzantine) Greek is RECOGNISED only,
 * from table headers and labels; there is no corpus for it here.
 */
import type { Variety } from '../../core';

export const EL_VARIETIES: Record<string, Variety> = {
  'el-hom': { code: 'el-hom', label: 'Homeric Greek', kind: 'period', note: 'The epic language of the Iliad, the Odyssey and Hesiod (an Ionic-based literary dialect, roughly 8th–7th century BC). Analysed from the Epic tables and forms of Wiktionary; the Perseus treebank of Homer is the agreement source.' },
  'el-att': { code: 'el-att', label: 'Attic Greek', kind: 'period', note: 'The Greek of Athens in the 5th–4th centuries BC (Plato, the tragedians, the orators), the default dialect of the Ancient Greek tables.' },
  'el-koi': { code: 'el-koi', label: 'Koine Greek', kind: 'period', note: 'The common Greek of the Hellenistic and Roman world (roughly 300 BC – AD 300), the Greek of the New Testament and the Septuagint. Analysed from MorphGNT over the SBL Greek New Testament.' },
  'el-med': { code: 'el-med', label: 'Medieval (Byzantine) Greek', kind: 'period', note: 'The Greek of the Byzantine centuries (roughly AD 600–1500). Recognised from table headers and labels only; the adapter has no text for it.' },
  'el-mod': { code: 'el-mod', label: 'Modern Greek', kind: 'period', note: 'The Greek spoken and written in Greece and Cyprus today, in monotonic spelling. Analysed from the Wiktionary Modern Greek entries and tables; the default target of the course.' },
  // other ancient dialects: recognised beside Attic, never a target of their own
  'el-ion': { code: 'el-ion', label: 'Ionic Greek', kind: 'regional', note: 'The dialect of Ionia (Herodotus, Hippocrates); the base of the epic language.' },
  'el-dor': { code: 'el-dor', label: 'Doric Greek', kind: 'regional', note: 'The dialect group of the Peloponnese, Crete and the western colonies (Pindar, Theocritus, the Spartan inscriptions).' },
  'el-aeo': { code: 'el-aeo', label: 'Aeolic Greek', kind: 'regional', note: 'The dialect group of Lesbos, Boeotia and Thessaly (Sappho, Alcaeus).' },
  'el-arc': { code: 'el-arc', label: 'Arcadocypriot Greek', kind: 'regional', note: 'The dialect of Arcadia and Cyprus, known from inscriptions.' },
  // a written form of Modern Greek, not a period: the formal, archaising standard used officially until 1976
  'el-kath': { code: 'el-kath', label: 'Katharevousa', kind: 'historical', note: 'The archaising written standard of Modern Greek (official until 1976): recognise it when reading; it is not the language written today.' },
};

/** The periods in historical order, for the Variants tab. */
export const EL_PERIOD_ORDER: readonly string[] = ['el-hom', 'el-att', 'el-koi', 'el-med', 'el-mod'];

/** Dictionary and table-header labels (lower case) → variety codes, no wider. "poetic", "rare", "archaic" name no period and map to nothing. */
const LABEL_VARIETIES: Readonly<Record<string, string>> = {
  epic: 'el-hom', homeric: 'el-hom',
  attic: 'el-att', 'old-attic': 'el-att', 'old attic': 'el-att',
  ionic: 'el-ion',
  doric: 'el-dor', laconian: 'el-dor', cretan: 'el-dor', corinthian: 'el-dor', elean: 'el-dor', locrian: 'el-dor',
  aeolic: 'el-aeo', lesbian: 'el-aeo', boeotian: 'el-aeo', thessalian: 'el-aeo',
  arcadocypriot: 'el-arc', cypriot: 'el-arc',
  koine: 'el-koi', 'koine greek': 'el-koi', 'late greek': 'el-koi', hellenistic: 'el-koi',
  byzantine: 'el-med', 'byzantine greek': 'el-med', 'medieval greek': 'el-med', medieval: 'el-med',
  katharevousa: 'el-kath',
  demotic: 'el-mod', 'modern greek': 'el-mod',
};

export function elVarietiesFromTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const t of tags) {
    // a table header such as "Epic aorist" or "Ionic declension-3" names its dialect first
    const words = t.normalize('NFC').trim().toLowerCase().replace(/^table:/, '').split(/[\s-]+/);
    const code = LABEL_VARIETIES[words.join(' ')] ?? LABEL_VARIETIES[words[0]];
    if (code && !out.includes(code)) out.push(code);
  }
  return out;
}
