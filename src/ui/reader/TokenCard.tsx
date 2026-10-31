/**
 * TokenCard — the layered tap-word support sheet (Biblia's word card, as a bottom sheet on every width).
 *
 * The sheet shows the gloss, then only the layers the learner has opened, in the order the stage's assistance profile
 * offers them (see assistance.ts). A course without a ladder offers gloss → phrases → grammar → sentence explanation →
 * English, and looks exactly as it always did. "More help" opens the next layer the word has something for.
 *
 * The same sheet also carries the notes of a sentence (opened from the mark at the end of the sentence): the subject is
 * then a sentence, not a word.
 *
 * Nothing here emits events or fetches evidence: the Reader opens layers and emits (see Reader.tsx).
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DescribeMorph, DictionaryView, SoundView } from './assistance';
import { varietyLine as courseVarietyLine } from '../../core';
import type { ConceptFamily, PartOfSpeech, Variety, VarietyPolicy } from '../../core';
import type { AnalysisSourceInfo, ContentNote, DictionaryInfo, HelpLayer, LanguageCode, Sentence, SyllableAnalysis, Token, TokenSupport } from '../../core';
import { useApp } from '../context';
import { I, IconBtn } from '../ui';
import { MORE_LABEL, NOTE_KIND_LABEL, analysisSourceLine, certainty, clauseSegments, compoundHeadLine, decodingSource, dictionaryName, dictionaryOthers, familyLine, hasClauseSpans, listsDiffer, maxLevel, morphAlternates, morphInWords, noteIsReviewed, olderSpellingLine, partRole, partText, pick, posWord, roleText, ruleToneLine, syllableSourceLabel, unitRoleText, unitText, varietyLine, wordParts } from './assistance';


export type SheetSubject = { kind: 'word'; token: Token } | { kind: 'sentence'; sentence: Sentence };

export interface DecodingView {
  /** `null` while it is being worked out. An empty list = nothing decodable. */
  syllables: SyllableAnalysis[] | null;
  /** The profile allows the romanization rescue (Stage 0 only) and the word has a decoding to rescue. */
  canRescue: boolean;
  /** The learner pressed the rescue button. */
  rescued: boolean;
  /** `notes.readings` lists more than one reading of the word. */
  severalReadings?: boolean;
  /** The dictionary's short name, when known ("Wiktionary"), for the source line of a dictionary reading. */
  dictionaryName?: string;
  /** Who checked the analysis, when a reviewed override itself supplies the syllables. */
  reviewedBy?: string;
  /** The romanization to show once rescued; undefined = the word has none. */
  romanization?: string;
}

export interface TokenCardProps {
  subject: SheetSubject;
  /** A course without a ladder: no variety line, no roles, no "other meanings" — today's sheet. */
  legacy: boolean;
  /** The layers opened so far, in order ('gloss' first). */
  opened: HelpLayer[];
  /** The layer "more help" would open (a layer the word has something for); undefined = top of the ladder. */
  next?: HelpLayer;
  /** Supports fetched so far, keyed by the level they were requested at. */
  supports: Partial<Record<number, TokenSupport>>;
  /** Everything "more help" needs has been fetched. */
  loaded: boolean;
  explanation?: string;
  english?: string;
  /** GoLearn's one-sentence account of what it knows about this word ("Seen 7 times in 2 texts; needed help twice…"). */
  why?: string;
  /** Language of the tapped form, so the surface is set in the text's own font. */
  lang?: LanguageCode;
  /** The sentence the word is in (its own text, for the clause-structure view). */
  sentence: Sentence;
  /** Notes visible for this sentence. */
  notes: ContentNote[];
  /** Whether the profile shows clause-structure notes as a labelled view. */
  clauseView: boolean;
  decoding: DecodingView;
  /** How the word sounds, for a language with no decoding (Spanish, German, Albanian); shown with the word, not behind a layer. Absent ⇒ no section. */
  sound?: SoundView;
  /** The adapter's own sources (`adapter.sources`), to name where a hand-written analysis comes from. */
  sources?: Readonly<Record<string, AnalysisSourceInfo>>;
  /** The dictionary beside the hand lexicon, when the analysis or its alternatives came from it. */
  dictionary?: DictionaryInfo;
  /** What the installed dictionary lists for this form (looked up when the sheet opened); absent while pending or when it has nothing. */
  dictionaryView?: DictionaryView;
  /** The adapter's plain-words morphology (Spanish): "first person plural, imperfect subjunctive". Absent ⇒ the sheet's own line. */
  describeMorph?: DescribeMorph;
  /** The course's variety policy and the adapter's variety definitions, for the line under the gloss. */
  varietyPolicy?: VarietyPolicy;
  varieties?: Readonly<Record<string, Variety>>;
  /** The adapter's `family()` (Bokmål jeg ↔ Nynorsk eg), for the line under the gloss; family members are never credited to this word. */
  familyOf?: (lemma: string, pos?: PartOfSpeech) => ConceptFamily | undefined;
  /** Lines from the learner's own record with this word (`golearn.itemHistory`). */
  history: string[];
  /** When the word is one piece of a lexical unit written as several words: its pieces as stretches of the text, in text order (neighbours already joined). */
  unitPieces?: string[];
  /** The sheet is up. When false it plays its exit, then calls onExited. */
  open: boolean;
  onMore(): void;
  onRescue(): void;
  onClose(): void;
  /** The exit animation has finished: the parent may drop the card. */
  onExited(): void;
}

export function TokenCard(props: TokenCardProps) {
  const { subject, legacy, opened, next, supports, loaded, explanation, english, why, lang, sentence, notes, clauseView, decoding, sound, sources, dictionary, dictionaryView, describeMorph, varietyPolicy, varieties, familyOf, history, unitPieces, open, onMore, onRescue, onClose, onExited } = props;
  const { store } = useApp();
  const token = subject.kind === 'word' ? subject.token : undefined;
  const level = maxLevel(opened);

  const gloss = pick(supports, 'gloss');
  const analysis = pick(supports, 'analysis');
  const phrases = pick(supports, 'phrases') ?? [];
  const patterns = pick(supports, 'patterns') ?? [];
  const lemma = pick(supports, 'lemma');
  const morphologyLine = pick(supports, 'morphologyLine');
  const wordAnalysis = pick(supports, 'wordAnalysis');
  const prior = pick(supports, 'priorEncounters') ?? [];
  const exampleIds = pick(supports, 'knownExamples') ?? [];
  const uncertain = pick(supports, 'uncertain') ?? false;
  const anyLoaded = Object.keys(supports).length > 0;
  /** Nothing is known about this word yet: say so, never guess. */
  const unanalysed = anyLoaded && !gloss && !lemma && !analysis && !morphologyLine;
  const has = (l: HelpLayer) => opened.includes(l);

  const [examples, setExamples] = useState<Sentence[]>([]);
  const exampleKey = exampleIds.slice(0, 3).join('|');
  const showExamples = legacy && has('grammar');
  useEffect(() => {
    let live = true;
    if (!showExamples || !exampleKey) { setExamples([]); return; }
    void store.sentences.getMany(exampleKey.split('|')).then((rows) => {
      if (live) setExamples(rows.filter((r): r is Sentence => !!r));
    });
    return () => { live = false; };
  }, [store, showExamples, exampleKey]);

  // Titles of the texts where the learner has met this word ("Seen 7 times in Story 1, Story 2").
  const [titles, setTitles] = useState<string[]>([]);
  const priorKey = [...new Set(prior.map((p) => p.textId))].slice(0, 3).join('|');
  useEffect(() => {
    let live = true;
    if (!showExamples || !priorKey) { setTitles([]); return; }
    void store.texts.getMany(priorKey.split('|')).then((rows) => {
      if (live) setTitles(rows.filter((t): t is NonNullable<typeof t> => !!t).map((t) => t.title));
    });
    return () => { live = false; };
  }, [store, showExamples, priorKey]);

  const [otherMeanings, setOtherMeanings] = useState(false);
  useEffect(() => { setOtherMeanings(false); }, [token?.id]);

  // ── the sheet: rises on mount, falls on close (kept mounted until the exit has played) ──
  const openRef = useRef(open);
  openRef.current = open;
  const exitedRef = useRef(onExited);
  exitedRef.current = onExited;
  const finish = useCallback(() => { if (!openRef.current) exitedRef.current(); }, []);
  useEffect(() => {
    if (open) return;
    const reduced = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced) { finish(); return; }
    const t = setTimeout(finish, 340); // animationend normally gets there first; this covers anything that never animates
    return () => clearTimeout(t);
  }, [open, finish]);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeRef.current(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const dialogLabel = subject.kind === 'word' ? `Help for ${subject.token.surface}` : `Notes for sentence ${subject.sentence.index + 1}`;
  const senses = !legacy ? sensesOf(analysis?.notes?.senses) : [];
  const variety = !legacy ? varietyLine(analysis?.register) : undefined;
  // the lemma support arrives with a layer; the analysis's lemma id ("lemma:nb:jeg:PRON") is there from the start
  const familyLemma = lemma?.lemma ?? (analysis?.lemmaId ? analysis.lemmaId.split(':')[2] : undefined);
  const familyPos = lemma?.pos ?? analysis?.pos;
  // shown under every profile (the courses' shelves still use the plain profile): it is information about the other standard, never a help layer
  const familyText = familyOf && familyLemma && lang ? familyLine(familyOf(familyLemma, familyPos), lang) : undefined;
  // Parts, variety tags and a modern aid appear only when the analysis carries them (the Spanish adapter fills them).
  const parts = wordParts(analysis);
  const varietyTagsLine = analysis?.varieties?.length ? courseVarietyLine(analysis.varieties, varietyPolicy, varieties) : undefined;
  const unit = analysis?.unit;
  const headLine = compoundHeadLine(parts);
  // An older spelling (the adapter's statement) says it all; the plain `notes.modern` aid is for analyses that only have the note.
  const spelling = olderSpellingLine(analysis?.orthography, varieties);
  const modern = !spelling && typeof analysis?.notes?.modern === 'string' ? analysis.notes.modern : undefined;
  const surface = token?.surface ?? '';
  const morphText = morphInWords(describeMorph, analysis?.morph, analysis?.pos ?? lemma?.pos, lemma?.lemma, surface) ?? morphologyLine;
  const morphOthers = morphAlternates(describeMorph, analysis, surface);
  const sourceLine = analysisSourceLine(analysis, sources, dictionary);
  const others = dictionaryOthers(analysis, dictionaryView);
  const differ = listsDiffer(analysis, gloss, dictionaryView);
  const [altOpen, setAltOpen] = useState(false);
  useEffect(() => { setAltOpen(false); }, [token?.id]);
  // said for every course: a meaning that came from the dictionary (as the analysis, or as the lemma's gloss of a word read by rule)
  const fromDictionary = analysis?.origin === 'dictionary' || !!analysis?.analyzer?.startsWith('dict:');

  return (
    <aside
      className={`panel ${open ? 'panel--rise' : 'panel--fall'}`} role="dialog" aria-label={dialogLabel} data-level={subject.kind === 'word' ? level : undefined}
      onAnimationEnd={(e) => { if (e.target === e.currentTarget && !open) finish(); }}
    >
      <div className="panel__grip" aria-hidden="true" />
      <div className="panel__body" key={token?.id ?? sentence.id}>
      <div className="panel__head">
        <span className="label">{subject.kind === 'word' ? 'Word' : 'Notes'}</span>
        <IconBtn label={subject.kind === 'word' ? 'Close word help' : 'Close notes'} onClick={onClose}>{I.close}</IconBtn>
      </div>

      {subject.kind === 'sentence' ? (
        <>
          <p className="card__text sheet__sentence" lang={lang}>{sentence.text}</p>
          <NotesList notes={notes} sentenceText={sentence.text} lang={lang} clauseView={clauseView} />
        </>
      ) : (
        <>
          <div className="card__surface" lang={lang}>{subject.token.surface}</div>

          <section aria-label="Gloss">
            {!anyLoaded ? (
              <p className="card__note">Looking up…</p>
            ) : gloss ? (
              <p className="card__gloss">{uncertain ? 'possibly ' : ''}{gloss}</p>
            ) : (
              unanalysed
                ? <p className="card__note" data-testid="not-analysed">Not analysed yet. Go has no dictionary entry for this word, and it will not guess.</p>
                : <p className="card__note">No gloss for this word yet.</p>
            )}
            {wordAnalysis?.lexicalMeaning && (wordAnalysis.contextualMeaning || wordAnalysis.inflectedMeaning)
              && wordAnalysis.lexicalMeaning.text !== (wordAnalysis.contextualMeaning?.text ?? wordAnalysis.inflectedMeaning?.text)
              && <p className="card__note" data-testid="lemma-gloss">Lemma gloss: {wordAnalysis.lexicalMeaning.text}</p>}
            {wordAnalysis?.lexicalMeaning && !wordAnalysis.contextualMeaning && !wordAnalysis.inflectedMeaning
              && <p className="card__note" data-testid="lemma-gloss-only">Lemma gloss; inflected/contextual meaning unavailable.</p>}
            {wordAnalysis?.contextualMeaning && wordAnalysis.inflectedMeaning
              && <p className="card__note" data-testid="inflected-meaning">Literal inflected meaning: {wordAnalysis.inflectedMeaning.text}</p>}
            {wordAnalysis?.references.map((r) => <p className="card__note" data-testid="word-analysis-reference" key={r.uri ?? r.label}>Context-specific rendering: {r.label}</p>)}
            {!!wordAnalysis?.ambiguity.length && <p className="card__note" data-testid="word-ambiguity">Morphology remains ambiguous: {wordAnalysis.ambiguity.join('; ')}</p>}
            {fromDictionary && gloss && <p className="card__note" data-testid="dictionary-gloss">dictionary meaning, not checked for this sentence</p>}
            {sourceLine && <p className="card__note sheet__source" data-testid="analysis-source">{sourceLine}</p>}
            {variety && <p className="card__note sheet__variety" data-testid="variety">{variety}</p>}
            {familyText && <p className="card__note sheet__variety" data-testid="family" title="The same idea in the other written standard; it is a different word, counted on its own">{familyText}</p>}
            {unit && (
              <p className="card__note sheet__unit" data-testid="word-unit">
                <span lang={lang} data-testid="unit-pieces">{unitText(unitPieces ?? [], unit.display)}</span>
                {' — '}<span data-testid="unit-role">{unitRoleText(unit.role)}</span>
              </p>
            )}
            {parts.length > 0 && (
              <p className="card__note sheet__parts" data-testid="word-parts">
                <span lang={lang}>{surface}</span> ={' '}
                {parts.map((p, i) => {
                  const role = partRole(p);
                  return <span key={`${p.start}-${i}`}>{i > 0 ? ' + ' : ''}<span lang={lang}>{partText(p)}</span>{role ? ` (${role})` : ''}</span>;
                })}
              </p>
            )}
            {headLine && <p className="card__note sheet__parts" data-testid="compound-head">{headLine}</p>}
            {varietyTagsLine && <p className="card__note sheet__variety" data-testid="variety-tags">{varietyTagsLine}</p>}
            {spelling && (
              <p className="card__note" data-testid="older-spelling" title="Today's spelling beside the text; the text itself stays as written">
                today: <span lang={lang}>{spelling.modern}</span>{spelling.label ? ` — ${spelling.label}` : ''}
              </p>
            )}
            {modern &&<p className="card__note" data-testid="modern-form" title="A modern aid beside the text; the text itself stays as written">today: <span lang={lang}>{modern}</span></p>}
            {uncertain && anyLoaded && <p className="card__note">The analysis here is uncertain.</p>}
            {!legacy && analysis?.role && (
              <div className="card__line"><span className="k">What it does here</span><span data-testid="word-role">{roleText(analysis.role)}</span></div>
            )}
            {lemma && lemma.lemma !== subject.token.surface.toLowerCase() && (
              <div className="card__line"><span className="k">Lemma</span><span lang={lang}>{lemma.lemma}</span></div>
            )}
            {lemma?.pos && <div className="card__line"><span className="k">Part of speech</span><span>{posWord(lemma.pos)}</span></div>}
            {senses.length > 0 && (
              <div className="sheet__senses">
                <button type="button" className="btn btn--small btn--quiet" aria-expanded={otherMeanings} onClick={() => setOtherMeanings((v) => !v)}>Other meanings</button>
                {otherMeanings && <ul className="sheet__list" aria-label="Other meanings">{senses.map((s) => <li key={s}>{s}</li>)}</ul>}
              </div>
            )}
            {others.glosses.length > 0 && (
              <div className="sheet__alts">
                <button type="button" className="btn btn--small btn--quiet" aria-expanded={altOpen} onClick={() => setAltOpen((v) => !v)}>{dictionaryName(dictionary) ?? 'The dictionary'} also lists</button>
                {altOpen && (
                  <>
                    <ul className="sheet__list" aria-label="Dictionary alternatives">
                      {others.items.map((alt, i) => <li key={`${i}:${alt.gloss}`}>{alt.gloss}{alt.pos ? <span className="faint"> ({alt.pos.toLowerCase()})</span> : null}</li>)}
                    </ul>
                    {!others.stored && others.pos.length > 0 && <p className="card__note">In the dictionary: {others.pos.map((x) => x.toLowerCase()).join(', ')}</p>}
                    {dictionary?.attribution && <p className="card__note">{dictionary.attribution}</p>}
                  </>
                )}
              </div>
            )}
            {differ && <p className="card__note" data-testid="lists-differ">The course word list and the dictionary differ here.</p>}
            {why && <p className="card__prov" aria-label="What Go knows about this word" data-testid="word-why">{why}</p>}
          </section>

          {sound && <SoundSection sound={sound} />}

          {opened.filter((l) => l !== 'gloss').map((layer) => {
            switch (layer) {
              case 'decoding':
                return <DecodingSection key={layer} decoding={decoding} loaded={loaded} lang={lang} onRescue={onRescue} />;
              case 'phrase':
                return (
                  <section key={layer} className="card__section" aria-label="Phrases">
                    <h3 className="label">Phrases</h3>
                    {phrases.length === 0 ? (
                      <p className="card__text">This word is not part of a known phrase here.</p>
                    ) : (
                      <ul className="chips">
                        {phrases.map(({ phrase, occurrence }) => (
                          <li key={occurrence.id} className="chip" title={phrase.gloss ?? phrase.kind}>
                            <span className="chip-text" lang={lang}>{phrase.display}</span>
                            {phrase.gloss && <span className="chip-gloss"> — {phrase.gloss}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                );
              case 'grammar':
                return (
                  <section key={layer} className="card__section" aria-label="Grammar">
                    <h3 className="label">Grammar</h3>
                    {morphText ? (
                      <div className="card__line"><span className="k">Morphology</span><span data-testid="morph-line">{morphText}</span></div>
                    ) : (
                      <p className="card__text">{unanalysed ? 'Not analysed yet.' : 'No grammar analysis available.'}</p>
                    )}
                    {morphOthers.length > 0 && <p className="card__note" data-testid="morph-alternates">or: {morphOthers.join('; or: ')}</p>}
                    {patterns.map((p) => (
                      <p key={p.id} className="card__text"><b>{p.title}.</b> {p.explanation}</p>
                    ))}
                    {legacy && (
                      <p className="card__prov" aria-label="Prior encounters">
                        {prior.length === 0
                          ? 'You have not met this word before.'
                          : `Seen ${prior.length} time${prior.length === 1 ? '' : 's'}${titles.length ? ` in ${titles.join(', ')}` : ''}.`}
                      </p>
                    )}
                    {legacy && examples.length > 0 && (
                      <ul className="examples" aria-label="Where you met it">
                        {examples.map((s) => <li key={s.id} lang={s.lang} className="literal">{s.text}</li>)}
                      </ul>
                    )}
                  </section>
                );
              case 'definition':
                return (
                  <section key={layer} className="card__section" aria-label="Definition">
                    <h3 className="label">Definition</h3>
                    <p className="card__text" lang={lang} data-testid="word-definition">{analysis?.definition ?? <span className="faint">No definition in the language of the text for this word.</span>}</p>
                  </section>
                );
              case 'discourse':
                return (
                  <section key={layer} className="card__section" aria-label="What this word does">
                    <h3 className="label">What it does here</h3>
                    <p className="card__text"><b>{analysis?.role ? capitalise(roleText(analysis.role)) : 'No role recorded'}.</b></p>
                    {patterns.map((p) => (
                      <p key={p.id} className="card__text"><b>{p.title}.</b> {p.explanation}</p>
                    ))}
                  </section>
                );
              case 'note':
                return (
                  <section key={layer} className="card__section" aria-label="Notes">
                    <h3 className="label">Notes on this sentence</h3>
                    <NotesList notes={notes.filter((n) => !(clauseView && n.kind === 'clause-structure'))} sentenceText={sentence.text} lang={lang} clauseView={false} />
                  </section>
                );
              case 'clause-structure':
                return (
                  <section key={layer} className="card__section" aria-label="Sentence structure">
                    <h3 className="label">Sentence structure</h3>
                    {notes.filter((n) => n.kind === 'clause-structure' && hasClauseSpans(sentence.text, n.spans)).map((n) => (
                      <ClauseView key={n.id} note={n} sentenceText={sentence.text} lang={lang} />
                    ))}
                  </section>
                );
              case 'sentence':
                return (
                  <section key={layer} className="card__section" aria-label="Sentence explanation">
                    <h3 className="label">This sentence</h3>
                    <p className="card__text">{explanation ?? <span className="faint">No written explanation for this sentence.</span>}</p>
                  </section>
                );
              case 'english':
                return (
                  <section key={layer} className="card__section" aria-label="English">
                    <h3 className="label">English</h3>
                    <p className="natural">{english ?? <span className="faint">No English available for this sentence.</span>}</p>
                  </section>
                );
              case 'history':
                return (
                  <section key={layer} className="card__section" aria-label="Your history with this word">
                    <h3 className="label">Your history with this word</h3>
                    <ul className="sheet__list">{history.map((line) => <li key={line} className="card__text">{line}</li>)}</ul>
                  </section>
                );
              default:
                return null;
            }
          })}

          {next && loaded && (
            <div className="card__actions">
              <button type="button" className="btn btn--small btn--quiet" onClick={onMore}>{MORE_LABEL[next]}</button>
            </div>
          )}
        </>
      )}
      </div>
    </aside>
  );
}

const capitalise = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s);

function sensesOf(v: string | string[] | undefined): string[] {
  const list = Array.isArray(v) ? v : typeof v === 'string' ? [v] : [];
  return [...new Set(list.map((s) => s.trim()).filter(Boolean))];
}

// ───────────────────────────── decoding ─────────────────────────────

function DecodingSection({ decoding, loaded, lang, onRescue }: { decoding: DecodingView; loaded: boolean; lang?: LanguageCode; onRescue(): void }) {
  const { syllables } = decoding;
  const src = decodingSource(syllables ?? [], { dictionary: decoding.dictionaryName, reviewedBy: decoding.reviewedBy });
  return (
    <section className="card__section" aria-label="Decoding">
      <h3 className="label">How it is read</h3>
      {!loaded || syllables === null ? (
        <p className="card__note">Looking up…</p>
      ) : syllables.length === 0 ? (
        <p className="card__text" data-testid="cannot-decode">Go cannot decode this spelling reliably.</p>
      ) : (
        <>
          {src.top && <p className="card__note" data-testid="decoding-source">{src.top}</p>}
          {decoding.severalReadings && <p className="card__text" data-testid="several-readings">This word has more than one reading.</p>}
          {syllables.some((s) => s.respelled) && <p className="card__text" data-testid="not-as-spelled">This word is not read exactly as it is spelled.</p>}
          <ol className="decode" aria-label="Syllables">
            {syllables.map((s, i) => <SyllableRow key={`${s.start}-${i}`} s={s} lang={lang} sourceLabel={src.perSyllable ? syllableSourceLabel(s.source, decoding.dictionaryName) : undefined} />)}
          </ol>
        </>
      )}
      {loaded && syllables !== null && decoding.canRescue && (
        decoding.rescued ? (
          <p className="card__text decode__rescue" data-testid="romanization">
            <span className="k">Romanization (rescue)</span>{' '}
            {decoding.romanization ? <span>{decoding.romanization}</span> : <span className="faint">Go has no romanization for this word.</span>}
          </p>
        ) : (
          <div className="card__actions">
            <button type="button" className="btn btn--small btn--quiet" onClick={onRescue}>Show romanization (rescue)</button>
          </div>
        )
      )}
    </section>
  );
}

/** How a word sounds when Go has no decoding for the language: the dictionary's IPA, then the adapter's notes. */
function SoundSection({ sound }: { sound: SoundView }) {
  return (
    <section className="card__section" aria-label="How it sounds">
      <h3 className="label">How it sounds</h3>
      {sound.ipa && (
        <>
          <p className="card__text" data-testid="sound-ipa">{sound.source ? `${sound.source}: ` : ''}<span>{sound.ipa}</span></p>
          {sound.key && <p className="card__note" data-testid="sound-key">{sound.key}</p>}
        </>
      )}
      {sound.notes.length > 0 && (
        <ul className="sheet__list" aria-label="Sound notes" data-testid="sound-notes">{sound.notes.map((n) => <li key={n} className="card__text">{n}</li>)}</ul>
      )}
    </section>
  );
}

const ENDING_WORD = { open: 'open (no final consonant)', live: 'live', dead: 'dead' } as const;
const INHERENT_VOWEL_WORD = { pronounced: 'said (a)', dropped: 'not said here', uncertain: 'may or may not be said — Go will not guess' } as const;

function SyllableRow({ s, lang, sourceLabel }: { s: SyllableAnalysis; lang?: LanguageCode; sourceLabel?: string }) {
  // Source and certainty are two statements: where the reading came from (`source`), and how sure the engine is (`confidence`).
  const sure = certainty(s.confidence);
  const low = sure === 'uncertain';
  const toneLine = ruleToneLine(s);
  const unwritten = s.vowel === '◌';
  return (
    <li className="decode__syl" data-uncertain={low ? 'true' : undefined}>
      <div className="decode__head">
        <span className="decode__text" lang={lang}>{s.text}</span>
        {low && <span className="chip chip--wine">uncertain</span>}
        {s.irregular && <span className="chip">irregular spelling</span>}
      </div>
      {sourceLabel && <p className="card__note" data-testid="syllable-source">{sourceLabel}</p>}
      {sure === 'less-certain' && <p className="card__note" data-testid="less-certain">less certain</p>}
      {s.respelled && <p className="card__text decode__respelled">Read as <span lang={lang}>{s.respelled}</span></p>}
      {s.initial && (
        <div className="card__line"><span className="k">Letters</span><span lang={lang}>{[s.cluster && s.cluster !== s.initial ? `${s.initial} (${s.cluster})` : s.initial, s.final ? `final ${s.final}` : ''].filter(Boolean).join(' · ')}</span></div>
      )}
      {s.initialClass && <div className="card__line"><span className="k">Consonant class</span><span>{s.initialClass}</span></div>}
      {s.vowel && (
        <div className="card__line">
          <span className="k">Vowel</span>
          {unwritten ? (
            <span data-testid="vowel-unwritten">{['not written', [s.vowelLength, s.vowelSound].filter(Boolean).join(' ')].filter(Boolean).join(' — ')}</span>
          ) : (
            <span><span lang={lang}>{s.vowel}</span>{s.vowelLength ? `, ${s.vowelLength}` : ''}{s.vowelSound ? ` — ${s.vowelSound}` : ''}</span>
          )}
        </div>
      )}
      {s.inherentVowel && (
        <div className="card__line" data-testid="inherent-vowel"><span className="k">Unwritten vowel</span><span>{INHERENT_VOWEL_WORD[s.inherentVowel]}</span></div>
      )}
      {s.signs && s.signs.length > 0 && <div className="card__line"><span className="k">Signs</span><span>{s.signs.join(', ')}</span></div>}
      {/* ending and tone belong to a tonal script (Thai): a unit that states no ending shows none of the three lines */}
      {s.ending !== undefined && (
        <>
          <div className="card__line"><span className="k">Ending</span><span>{ENDING_WORD[s.ending]}</span></div>
          <div className="card__line"><span className="k">Tone mark</span><span lang={s.toneMark ? lang : undefined}>{s.toneMark ?? 'none'}</span></div>
          <div className="card__line"><span className="k">Tone</span><span>{s.tone ?? 'not decided — Go will not guess'}</span></div>
        </>
      )}
      {s.rule && <p className="card__text decode__rule">{s.rule}</p>}
      {toneLine && <p className="card__note" data-testid="rule-tone">{toneLine}</p>}
    </li>
  );
}

// ───────────────────────────── notes ─────────────────────────────

function NotesList({ notes, sentenceText, lang, clauseView }: { notes: ContentNote[]; sentenceText: string; lang?: LanguageCode; clauseView: boolean }) {
  if (notes.length === 0) return <p className="card__text">No notes for this sentence.</p>;
  return (
    <ul className="notes" aria-label="Notes">
      {notes.map((n) => (
        <li key={n.id} className="note" data-kind={n.kind}>
          <span className="label">{NOTE_KIND_LABEL[n.kind]}</span>
          {!noteIsReviewed(n) && (
            <span className="chip chip--wine note__status">{n.provenance === 'machine' ? 'machine draft, not reviewed' : 'not reviewed yet'}</span>
          )}
          <p className="card__text">{n.body}</p>
          {clauseView && n.kind === 'clause-structure' && hasClauseSpans(sentenceText, n.spans) && <ClauseView note={n} sentenceText={sentenceText} lang={lang} />}
          {n.topics && n.topics.length > 0 && (
            <ul className="chips note__topics" aria-label="Topics">{n.topics.map((t) => <li key={t} className="chip">{t}</li>)}</ul>
          )}
        </li>
      ))}
    </ul>
  );
}

/**
 * The sentence's own text with a note's labelled spans underlined. The text itself is never rewritten: the labels are
 * drawn by CSS from `data-label` (so the element's text is exactly the sentence) and listed below for assistive technology.
 */
function ClauseView({ note, sentenceText, lang }: { note: ContentNote; sentenceText: string; lang?: LanguageCode }) {
  const segments = clauseSegments(sentenceText, note.spans);
  return (
    <div className="clause">
      <p className="clause__text" lang={lang} data-testid="clause-text">
        {segments.map((s, i) => (s.label
          ? <span key={i} className="clause__span" data-label={s.label}>{s.text}</span>
          : <span key={i}>{s.text}</span>))}
      </p>
      <ul className="clause__legend" aria-label="Parts of this sentence">
        {segments.filter((s) => s.label).map((s, i) => (
          <li key={i}><span className="clause__label">{s.label}</span> <span lang={lang}>{s.text}</span></li>
        ))}
      </ul>
    </div>
  );
}
