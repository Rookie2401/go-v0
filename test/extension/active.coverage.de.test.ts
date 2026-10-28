// @vitest-environment jsdom
/**
 * GoLearn Active on a real German page (the opening of the Manifest, marxists.org, 2026-10-27): the hand word list alone confirms
 * about half the words; with the dictionary's forms index (docs/ecosystem/GOLEARN-ACTIVE-DICTIONARY.md) nearly all of them are
 * caught, while a word of another language on the same page stays unmarked. Needs the built index (npm run dict:build-forms).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { applyConfirmations, createScanner, formsToConfirm, type Confirmations } from '../../packages/golearn-extension/src/active/scan';
import { clearAnalysers, getAnalyser, registerAnalyser } from '../../packages/golearn-extension/src/parser';
import { deAdapter } from '../../src/adapters/de';
import { createFormsService } from '../../packages/golearn-extension/src/background/forms';
import type { ShardFetch } from '../../packages/golearn-extension/src/background/gloss';

const REPO = path.resolve(__dirname, '..', '..');
const built = fs.existsSync(path.join(REPO, 'public', 'dict', 'de', 'forms', 'manifest.json'));

/** Serves public/dict/** the way the extension's background would fetch it from a dictionary location. */
const realFetch = (async (input: string | URL) => {
  const url = String(input);
  const rel = url.replace(/^.*?\/dict\//, '');
  const file = path.join(REPO, 'public', 'dict', rel);
  if (!fs.existsSync(file)) return new Response('', { status: 404 });
  return new Response(fs.readFileSync(file));
}) as typeof fetch;

const MANIFEST = [
  'Die Geschichte aller bisherigen Gesellschaft ist die Geschichte von Klassenkämpfen.',
  'Freier und Sklave, Patrizier und Plebejer, Baron und Leibeigener, Zunftbürger und Gesell, kurz, Unterdrücker und Unterdrückte standen in stetem Gegensatz zueinander, führten einen ununterbrochenen, bald versteckten, bald offenen Kampf, einen Kampf, der jedesmal mit einer revolutionären Umgestaltung der ganzen Gesellschaft endete oder mit dem gemeinsamen Untergang der kämpfenden Klassen.',
  'In den früheren Epochen der Geschichte finden wir fast überall eine vollständige Gliederung der Gesellschaft in verschiedene Stände, eine mannigfaltige Abstufung der gesellschaftlichen Stellungen. Im alten Rom haben wir Patrizier, Ritter, Plebejer, Sklaven; im Mittelalter Feudalherren, Vasallen, Zunftbürger, Gesellen, Leibeigene, und noch dazu in fast jeder dieser Klassen besondere Abstufungen.',
  'Die aus dem Untergang der feudalen Gesellschaft hervorgegangene moderne bürgerliche Gesellschaft hat die Klassengegensätze nicht aufgehoben. Sie hat nur neue Klassen, neue Bedingungen der Unterdrückung, neue Gestaltungen des Kampfes an die Stelle der alten gesetzt.',
  'Unsere Epoche, die Epoche der Bourgeoisie, zeichnet sich jedoch dadurch aus, daß sie die Klassengegensätze vereinfacht hat. Die ganze Gesellschaft spaltet sich mehr und mehr in zwei große feindliche Lager, in zwei große, einander direkt gegenüberstehende Klassen: Bourgeoisie und Proletariat.',
  'Aus den Leibeigenen des Mittelalters gingen die Pfahlbürger der ersten Städte hervor; aus dieser Pfahlbürgerschaft entwickelten sich die ersten Elemente der Bourgeoisie.',
  'Die Entdeckung Amerikas, die Umschiffung Afrikas schufen der aufkommenden Bourgeoisie ein neues Terrain. Der ostindische und chinesische Markt, die Kolonisierung von Amerika, der Austausch mit den Kolonien, die Vermehrung der Tauschmittel und der Waren überhaupt gaben dem Handel, der Schiffahrt, der Industrie einen nie gekannten Aufschwung und damit dem revolutionären Element in der zerfallenden feudalen Gesellschaft eine rasche Entwicklung.',
  'Die bisherige feudale oder zünftige Betriebsweise der Industrie reichte nicht mehr aus für den mit neuen Märkten anwachsenden Bedarf. Die Manufaktur trat an ihre Stelle. Die Zunftmeister wurden verdrängt durch den industriellen Mittelstand; die Teilung der Arbeit zwischen den verschiedenen Korporationen verschwand vor der Teilung der Arbeit in der einzelnen Werkstatt selbst.',
];

beforeEach(() => {
  clearAnalysers();
  registerAnalyser('de', deAdapter);
  document.body.innerHTML = `<article>${MANIFEST.map((p) => `<p>${p}</p>`).join('')}<p id="other">The history of all hitherto existing society. אֱלֹהִים</p></article>`;
});
afterEach(() => { clearAnalysers(); document.body.innerHTML = ''; });

describe('the Manifest\'s opening paragraphs, read as German', () => {
  it.skipIf(!built)('the word list alone leaves a large share unmarked; the forms index catches nearly every German word and no English or Hebrew one', async () => {
    const scanner = createScanner({ doc: document, adapterOf: getAnalyser, viewport: 'all' });
    const tokens = scanner.tokensIn(scanner.textNodes(document), 'de');
    const german = tokens.filter((t) => t.node.parentElement?.id !== 'other');
    const other = tokens.filter((t) => t.node.parentElement?.id === 'other');
    const before = german.filter((t) => t.known).length;
    const ratioBefore = before / german.length;

    // what the extension's background does with the forms index for the forms the analyser did not confirm: the index, then the ending
    // retry, then the compound split (background/forms.ts), over the built index served as a dictionary location would serve it
    const prefix = 'form:de:';
    const ask = formsToConfirm(tokens, 'de', new Map());
    const shardFetch = Object.assign(realFetch, { failures: 0, network: realFetch }) as unknown as ShardFetch;
    const service = createFormsService({ gloss: { dictionaryAt: async () => ({ ok: true as const, base: 'https://dictionary.test/', rel: 'dict/de', source: 'hosted' as const, fetch: shardFetch }) } });
    const reply = await service.confirm({ languageId: 'de', forms: ask.map((id) => id.slice(prefix.length)) });
    expect(reply.reason).toBeUndefined();
    const answers: Confirmations = new Map(ask.map((id) => {
      const row = reply.forms[id.slice(prefix.length)];
      return [id, row ? `lemma:de:${row[0]}${row[1] ? ':' + row[1] : ''}` : null] as const;
    }));
    applyConfirmations(tokens, answers);

    const after = german.filter((t) => t.known).length;
    const ratioAfter = after / german.length;
    const left = german.filter((t) => !t.known).map((t) => t.surface);
    // eslint-disable-next-line no-console
    console.log(`Manifest coverage: analyser ${before}/${german.length} (${(ratioBefore * 100).toFixed(0)} %), with the forms index, endings and compounds ${after}/${german.length} (${(ratioAfter * 100).toFixed(0)} %); left: ${left.join(', ')}`);

    expect(ratioBefore, 'the problem the owner reported: the word list alone').toBeLessThan(0.8);
    expect(ratioAfter, `left unmarked: ${left.join(', ')}`).toBeGreaterThanOrEqual(0.98);
    // the 2026-10-25 rule survives: English and Hebrew on the same page stay unmarked (the German dictionary lacks them)
    // ('all' is also a German word: the index lists it as a determiner, so the dictionary rightly confirms it; the fallbacks never derive an English word)
    for (const t of other) if (t.surface.toLowerCase() !== 'all') expect(t.known, t.surface).toBe(false);
  });
});
