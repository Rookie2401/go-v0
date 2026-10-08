import type { LanguageCode } from '../../core';
import { bibleAccessFor } from '../../course/bibleAccess';

/** Language-wide route on the Scripture page; individual catalogue editions keep their own rights. */
export function BibleAccess({ lang }: { lang: LanguageCode }) {
  const access = bibleAccessFor(lang);
  const notBundled = access.status === 'not-bundled';
  const personal = access.status === 'linked-online';
  return (
    <section className="card__note bible-access" data-testid="bible-access">
      <strong>{personal ? 'Read the Bible online' : 'Bible access'}</strong>
      {notBundled && <p>No Bible text is bundled in GoLearn for this language yet: the rights have not been verified. {access.importMethod}</p>}
      {!notBundled && <p>{personal ? `${access.translation} is available through YouVersion. This linked edition is not bundled in GoLearn and is separate from the catalogue’s ALB and historical editions.` : `${access.translation} is available in GoLearn’s Scripture library.`}</p>}
      <p><a href={access.sourceUrl} target="_blank" rel="noreferrer">{notBundled ? 'Read the publisher’s statement' : personal ? 'Read on YouVersion' : 'Open the source edition'}</a></p>
      {personal && <p>You can also add a copy you have permission to use for ordinary reading on this device. Imported books do not yet have Bible verse navigation.</p>}
      <p className="faint">{access.translation}. {access.rights}</p>
    </section>
  );
}
