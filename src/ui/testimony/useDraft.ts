/** React binding for DraftController: one controller per (learner, language), flushed on hide / pagehide / leave. */
import { useEffect, useReducer, useState } from 'react';
import { DraftController, browserDraftStorage } from './draft';
import type { DraftApi, DraftOwner, DraftStorage } from './draft';

export function useDraft(api: DraftApi, owner: DraftOwner, storage: DraftStorage = browserDraftStorage) {
  const [, bump] = useReducer((n: number) => n + 1, 0);
  const [ctrl, setCtrl] = useState<DraftController | null>(null);

  useEffect(() => {
    const c = new DraftController(api, owner, storage, bump);
    setCtrl(c);
    void c.load();
    const onVisibility = () => { if (typeof document !== 'undefined' && document.visibilityState === 'hidden') void c.flush(); };
    const onPageHide = () => { void c.flush(); };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onPageHide);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onPageHide);
      // Route change, learner switch or language switch: the final save starts now and outlives this screen.
      c.dispose();
    };
    // `owner` is compared by value through its two fields.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, owner.userId, owner.lang, storage]);

  return { ctrl, rerender: bump };
}
