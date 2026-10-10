// @vitest-environment jsdom
/**
 * The owner's report (2026-10-09): "when I tap an Albanian word it says I have not selected a language yet". The page declared
 * html lang="en" (a template), the sample was the one clicked word, and the resolver refused the chosen language against the
 * declaration. Now the controller gives the resolver the block around the selection, and the chosen language is used when the
 * text is compatible with it. Checked for every language's prose; English stays refused.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { resolveLanguage } from '../../packages/golearn-extension/src/language/resolve';
import { registerAllAnalysers } from '../support/analysers';
import { makeRig, selectText, setBody, stubLayout, type Rig } from './dom';

registerAllAnalysers();

const PAGES: Array<{ lang: string; word: string; text: string }> = [
  { lang: 'sq', word: 'arrestuan', text: 'Policia njoftoi se dy persona u arrestuan mbrëmë në Durrës pas një përplasjeje mes dy grupeve në lagjen e vjetër të qytetit.' },
  { lang: 'es', word: 'medidas', text: 'El gobierno anunció ayer nuevas medidas para reducir la inflación en los próximos meses.' },
  { lang: 'de', word: 'Gesetz', text: 'Der Bundestag hat am Donnerstag ein neues Gesetz zur Förderung erneuerbarer Energien verabschiedet.' },
  { lang: 'nb', word: 'forslag', text: 'Regjeringen la fredag fram et forslag om endringer i skatteloven for neste år.' },
  { lang: 'hi', word: 'खोज', text: 'क्षत्रिय ज्ञान की खोज में निकला। उसने कहा, मैं कल आऊँगा।' },
  { lang: 'th', word: 'ตลาด', text: 'วันนี้อากาศดีมาก ฉันไปตลาดกับเพื่อน แล้วก็กลับบ้าน' },
];

let restore: () => void;
let rig: Rig | undefined;
beforeEach(() => { restore = stubLayout(); });
afterEach(() => { rig?.controller.dispose(); rig = undefined; restore(); document.documentElement.removeAttribute('lang'); });

/** A controller whose only chosen language is `lang` (status says so), the real resolver, on a page declared as English. */
function pageIn(lang: string, text: string): Rig {
  document.documentElement.lang = 'en';
  setBody(`<main><h1>Site title</h1><p id="p">${text}</p></main>`);
  const status = { ok: true as const, connected: false, needsSignIn: false, languageId: lang, languageName: lang, packAvailable: true, installedLanguages: [lang] };
  rig = makeRig({
    resolveLanguage, analysers: [lang],
    services: { status: async () => status, profile: async () => undefined, gloss: async () => undefined, explain: async () => undefined, correct: async () => undefined, pronounceInfo: async () => undefined },
  });
  return rig;
}

describe('one clicked word on a page declared as English, with the language chosen in setup', () => {
  it.each(PAGES)('$lang: the card opens in the chosen language, decided from the words around the selection', async ({ lang, word, text }) => {
    const r = pageIn(lang, text);
    selectText(document.getElementById('p')!, word);
    const out = await r.controller.lookup({ trigger: 'click' });
    expect(out.status, JSON.stringify(out)).toBe('shown');
    if (out.status !== 'shown') return;
    expect(out.card.language?.languageId).toBe(lang);
    expect(['detection', 'team-default']).toContain(out.card.language?.basis);
    expect(r.ui.root()?.textContent).not.toMatch(/cannot tell which language/);
  });

  it('English text on the same kind of page is still refused, with the choice offered, never read with the chosen word list', async () => {
    const r = pageIn('sq', 'In the beginning God created the heaven and the earth. And the earth was without form, and void.');
    selectText(document.getElementById('p')!, 'heaven');
    const out = await r.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('message');
    if (out.status !== 'message') return;
    expect(out.reason).toBe('language-undetermined');
    expect(out.message).toMatch(/cannot tell which language this is/);
  });

  it('a page that declares the chosen language itself, or nothing, works as before', async () => {
    const r = pageIn('sq', 'Beni shkon në shkollë.');
    document.documentElement.lang = 'sq';
    selectText(document.getElementById('p')!, 'shkollë');
    expect((await r.controller.lookup({ trigger: 'command' })).status).toBe('shown');
    r.controller.dispose();
    const r2 = pageIn('sq', 'Beni shkon në shkollë.');
    document.documentElement.removeAttribute('lang');
    selectText(document.getElementById('p')!, 'shkollë');
    const out = await r2.controller.lookup({ trigger: 'command' });
    expect(out.status).toBe('shown');
    if (out.status === 'shown') expect(['detection', 'team-default']).toContain(out.card.language?.basis);
  });
});
