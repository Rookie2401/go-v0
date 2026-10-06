import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CatalogText } from '../../core';
import { loadCoursePath, type PathStage } from '../../course/pathAvailability';
import { useApp } from '../context';
import { textPath } from '../format';
import { BackLink, Disclosure, Topbar } from '../ui';

/** All declared stages remain visible, including real release blockers. No empty rung claims completion. */
export function CurriculumPage() {
  const { catalog, library, course } = useApp();
  const navigate = useNavigate();
  const [path, setPath] = useState<PathStage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    setPath(null); setError(null);
    void loadCoursePath(catalog, library, course.id).then(result => { if (live) setPath(result); }).catch(e => {
      if (live) setError(e instanceof Error ? e.message : String(e));
    });
    return () => { live = false; };
  }, [catalog, library, course.id]);
  const open = async (text: CatalogText) => {
    try { navigate(textPath(await library.open(text.id))); } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  };
  const firstMissing = path?.find(s => !s.available);
  return <div>
    <Topbar title="Reading path" left={<BackLink to="/read" label="Reading" />} />
    <div className="page page--narrow course" data-testid="curriculum-path">
      <p>Read at your own pace. These bands describe the next reading skills to develop; they are not certificates or locks.</p>
      {error && <p role="alert">Could not load the reading path: {error}</p>}
      {!path && !error && <p role="status">Checking available reading…</p>}
      {firstMissing && <p role="status" data-testid="curriculum-gap">This path has a gap at {firstMissing.stage.label}. No published course reading is available there yet.</p>}
      {path?.map(({ stage, texts, heldTexts, publishedWorks, available }) => <section key={stage.id} data-stage={stage.id} aria-label={stage.label}>
        <Disclosure headingLevel={2} label={stage.label} defaultOpen={stage.index === 0} lazy>
          <p data-testid="stage-availability">{available ? `${publishedWorks} published ${publishedWorks === 1 ? 'work' : 'works'} · ${texts.length} reading ${texts.length === 1 ? 'unit' : 'units'}` : 'Not available yet'}</p>
          {heldTexts.length > 0 && <p className="card__note">{heldTexts.length} {heldTexts.length === 1 ? 'draft awaits' : 'drafts await'} review. Drafts do not fill this stage.</p>}
          {stage.contract && <>
            <h3>What this stage develops</h3>
            <ul>{stage.contract.targetCapabilities.map(capability => <li key={capability}>{capability}</li>)}</ul>
            <p className="card__note">{stage.contract.orthography.expectation}</p>
          </>}
          {!available && <p className="card__note">You can browse other reading while course material is prepared. A listed book still requires your own lawful copy.</p>}
          {available && <p className="card__note">Availability does not establish a smooth transition. Historical spelling, register and length may need extra support.</p>}
          <ul className="list">{texts.map(text => <li key={text.id}><button type="button" className="home__entry" onClick={() => { void open(text); }}>
            <span lang={text.lang}>{text.title}</span>
          </button></li>)}</ul>
        </Disclosure>
      </section>)}
      <p className="card__note">Stage checks will use separate unseen passages when reviewed assessment material is ready. Reading alone cannot establish full B2 ability.</p>
    </div>
  </div>;
}
