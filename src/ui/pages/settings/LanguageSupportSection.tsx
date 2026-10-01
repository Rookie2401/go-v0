/**
 * Settings → Advanced → Language support: what each language adapter can honestly do, straight from `adapter.support`,
 * with its stated limitations. "Seed words only" means the dictionary covers the built-in texts; supplied texts
 * will have words that show "not analysed yet".
 */
import type { AdapterSupport, SupportLevel } from '../../../core';
import { useApp } from '../../context';
import { nameOfLang } from '../../format';

const LEVEL_WORD: Record<SupportLevel, string> = {
  dependable: 'dependable',
  limited: 'limited',
  'seed-only': 'seed words only',
  none: 'not supported',
};

const COLUMNS: Array<[keyof Omit<AdapterSupport, 'limitations'>, string]> = [
  ['tokenization', 'Words'],
  ['sentenceSegmentation', 'Sentences'],
  ['lemmatization', 'Dictionary forms'],
  ['morphology', 'Grammar detail'],
  ['phraseDetection', 'Phrases'],
  ['productionChecks', 'Writing checks'],
];

export function LanguageSupportSection() {
  const { adapters, lang } = useApp();
  const all = adapters.all();
  return (
    <section aria-label="Language support">
      <h3 className="subsection-head">Language support</h3>
      <p className="card__note">What Go can and cannot do for each language today. Where a column says “seed words only”, the dictionary covers the built-in texts, so texts you supply will have words that are not analysed yet.</p>
      <div className="table-wrap">
        <table className="datatable support" aria-label="Language support table">
          <thead><tr><th>Language</th>{COLUMNS.map(([, label]) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>
            {all.map((a) => (
              <tr key={a.lang} data-lang={a.lang} className={a.lang === lang ? 'is-current' : undefined}>
                <th scope="row">{nameOfLang(a.lang)}{a.lang === lang ? ' (your team)' : ''}</th>
                {COLUMNS.map(([key, label]) => (
                  <td key={key} data-label={label} data-level={a.support[key]}>{LEVEL_WORD[a.support[key]]}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {all.map((a) => (
        a.support.limitations.length > 0 && (
          <details key={a.lang} className="support__limits" open={a.lang === lang}>
            <summary>{nameOfLang(a.lang)}: limitations</summary>
            <ul className="reasons">{a.support.limitations.map((l) => <li key={l}>{l}</li>)}</ul>
          </details>
        )
      ))}
    </section>
  );
}
