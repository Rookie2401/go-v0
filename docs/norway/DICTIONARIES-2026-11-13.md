# Norwegian dictionaries (Bokmål and Nynorsk), 2026-11-13

The language audit of 2026-11-13 found `nb` and `nn` were the only modern languages with no dictionary: on its uniform probe
(Wikipedia, Brød / Vann for Bokmål and Brød / Vatn for Nynorsk) cards gave a meaning for 66.0 % (nb) and 68.9 % (nn) of words,
missing ordinary words such as molekyl, flytende, oksygen, energi (nb) and mjøl, deig (nn). This records how the two dictionaries
were built and what the hard gold sets still miss. Every figure was measured on this date.

## Sources: one extract per written standard

kaikki.org splits Norwegian into separate extracts. Each dictionary is built from its own standard's extract only, so no
Nynorsk entry is ever a source for Bokmål or the reverse. kaikki's small mixed "Norwegian" extract (1.5 MB) was not used.

| | Bokmål (`nb`) | Nynorsk (`nn`) |
|---|---|---|
| downloaded (owner's yes, 2026-11-13) | `kaikki.org-dictionary-NorwegianBokmål.jsonl.gz`, 11,624,423 bytes | `kaikki.org-dictionary-NorwegianNynorsk.jsonl.gz`, 8,388,771 bytes |
| from | `https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/` | `https://kaikki.org/dictionary/Norwegian%20Nynorsk/` |
| last modified (server) | 2026-10-30 | 2026-10-30 |
| sha256 of the `.gz` | `11e269eb3678b84f87ccdefbfc93844078fcd1ec3429d3aaea147fd2420e664f` | `9fa67d92330776b58c925a16cff4ec5984d5c1a58ed958878fa98fc6e713020b` |
| lines (all with that `lang_code`) | 81,648, every one `nb` | 63,406, every one `nn` |
| licence | CC BY-SA 4.0 (Wiktionary contributors, via kaikki.org) | the same |

The extracts are kept, not committed, in `data/dictionaries/` (git-ignored), as for the other languages.

## Build

```sh
npm run dict:build -- --in "data/dictionaries/kaikki.org-dictionary-NorwegianBokmål.jsonl" --lang nb --out public/dict \
  --source-url "https://kaikki.org/dictionary/Norwegian%20Bokm%C3%A5l/kaikki.org-dictionary-NorwegianBokm%C3%A5l.jsonl.gz" --last-modified 2026-10-30 --retrieved 2026-11-13
npm run dict:build -- --in data/dictionaries/kaikki.org-dictionary-NorwegianNynorsk.jsonl --lang nn --out public/dict \
  --source-url "https://kaikki.org/dictionary/Norwegian%20Nynorsk/kaikki.org-dictionary-NorwegianNynorsk.jsonl.gz" --last-modified 2026-10-30 --retrieved 2026-11-13
```

The builder needed no change: it already knew both languages' normalizers. `public/dict/nb/frequency.json` (built earlier by
`library:frequency`) was in place, so the Bokmål manifest records `hasFrequency: true`; Nynorsk has no frequency list.

| | entries | forms | inflected-form entries | senses kept | shards | size |
|---|---|---|---|---|---|---|
| `kaikki-nb@2026-10-30` | 79,874 | 76,216 | 55,470 | 32,267 | 256 | 6.7 MB |
| `kaikki-nn@2026-10-30` | 61,827 | 58,079 | 35,527 | 34,000 | 256 | 5.0 MB |

Both packs (`packages/language-packs/src/packs/nb.ts`, `nn.ts`) now declare their dictionary; GoLearn's background service reads
the declaration and downloads it, with no extension code change. Every word the audit named now has a meaning: molekyl
("a molecule"), flytende ("liquid"), oksygen, energi in Bokmål; mjøl ("flour"), deig ("dough") in Nynorsk.

**Not yet live.** The dictionaries reach learners only once they are published where the apps read them (today GitHub Pages,
`dict/`; `npm run dict:publish -- --dest <gh-pages checkout>/dict --langs nb,nn`, docs/ops/DICTIONARIES.md). That publish needs the
owner's yes.

## The hard gold sets: what the lemma misses are

The dictionary adds meanings, not lemmas, so hard-set lemma accuracy is unchanged: **nb 72.6 % (20 misses of 73), nn 68.4 %
(24 of 76)**. The gold labels are AI-judged and unreviewed. Sorted by cause:

| cause | nb | nn | what it is |
|---|---|---|---|
| particle-verb convention | 7 (står, opp, slo, på, ut, ned, ringte) | 5 (opp, av, imot, gjev, tek) | The analyser gives every piece of a particle verb the unit's lemma (*stå opp*); the gold wants the plain verb or particle. A documented convention (STATUS.md, holdout notes), not an error; in most of these the gold lemma is among the candidates. |
| Nynorsk spelling choice | – | 6 (gamle, eldre, eldste → *gamal*; kasta, spelar → *kasta, spela*; kom → *koma*) | Both forms are valid Nynorsk (*gamal/gammal*, *kaste/kasta*, *kome/koma*); the word list chose one, the gold the other. A choice for the owner or a native reviewer, not a bug. |
| Bokmål words in Nynorsk text | – | 6 (ikke, Jeg, Hun, De, Hva, Hvor) | The gold maps a Bokmål word to its Nynorsk lemma (*jeg* → *eg*). The packs deliberately never credit one standard's word to the other; at most a card could say "this is Bokmål for *eg*". A design decision for the owner. |
| homograph needing context | 5 (så, fall, vann, lyst, leser) | 1 (bur) | One spelling, two words (*vann* the noun or the past of *vinne*); the analyser has no parser to decide. |
| real analyser gaps | 8 (meget; sees, møtes, skammer: the -s forms; færre, mer, dårligere: comparatives; Fotballaget: a capitalised compound read as a name) | 6 (hylla: feminine definite; hoppar, talar: present of a-verbs; ringde: -de past; lommebok: compound; fleire: suppletive comparative) | Rules or word-list entries that are missing. These are worth fixing, carefully: the hard set is small and AI-labelled, so a fix must be a general rule checked on the blind holdout, not fitted to these items. |

So about a third of the misses are true gaps (14 of 44); the rest are conventions and choices that need the owner's (or a native
reviewer's) decision before any number moves.
