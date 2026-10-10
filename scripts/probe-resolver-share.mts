/**
 * Probe (2026-10-09): how much of a text each Latin-script pack's word list recognises, to set the floor at which the learner's
 * chosen language may be used on a page that declares a language no pack covers (an Albanian site with html lang="en").
 *   npx vite-node scripts/probe-resolver-share.mts
 */
import { sqAdapter } from '../src/adapters/sq';
import { deAdapter } from '../src/adapters/de';
import { esAdapter } from '../src/adapters/es';
import { nbAdapter } from '../src/adapters/nb';
import type { LanguageAdapter } from '../src/core';

const TEXTS: Record<string, string[]> = {
  sq: [
    'Është mëngjes. Beni zgjohet herët. Ai lahet dhe vishet. Nëna është në kuzhinë. Ajo përgatit mëngjesin.',
    'Kryeministri deklaroi sot se qeveria do të miratojë projektligjin e ri për arsimin brenda muajit të ardhshëm, pas konsultimeve me grupet e interesit.',
    'Tirana është kryeqyteti dhe qyteti më i madh i Shqipërisë. Ajo ndodhet në pjesën qendrore të vendit dhe ka një popullsi prej rreth gjysmë milioni banorësh.',
    'Policia njoftoi se dy persona u arrestuan mbrëmë në Durrës pas një përplasjeje mes dy grupeve në lagjen e vjetër të qytetit.',
  ],
  de: ['Die Straßenbahnhaltestelle liegt gegenüber dem Rathaus; über die Brücke führt ein schöner Weg.', 'Der Bundestag hat am Donnerstag ein neues Gesetz zur Förderung erneuerbarer Energien verabschiedet.'],
  es: ['El niño comió el pingüino de chocolate y después fue a la escuela con su hermana.', 'El gobierno anunció ayer nuevas medidas para reducir la inflación en los próximos meses.'],
  nb: ['Jeg leser en bok om kvelden. Barna går på skolen hver dag.', 'Regjeringen la fredag fram et forslag om endringer i skatteloven for neste år.'],
  en: ['The quick brown fox jumps over the lazy dog and runs into the forest at night.', 'Parliament approved a new education bill on Thursday after months of debate with interest groups.', 'In the beginning God created the heaven and the earth. And the earth was without form, and void.'],
  fr: ['Le gouvernement a annoncé hier de nouvelles mesures pour réduire la dette publique.'],
  it: ['Il governo ha annunciato ieri nuove misure per ridurre il debito pubblico nei prossimi mesi.'],
};

function share(adapter: LanguageAdapter, text: string): string {
  const toks = adapter.tokenize(text.normalize('NFC'));
  const words = toks.filter((t) => t.isWord).length;
  const hits = adapter.analyze(toks).filter((a) => a.token.isWord && a.candidates.some((c) => !c.unconfirmed)).length;
  return `${hits}/${words} (${Math.round((100 * hits) / Math.max(1, words))}%)`;
}

const packs: Array<[string, LanguageAdapter]> = [['sq', sqAdapter], ['de', deAdapter], ['es', esAdapter], ['nb', nbAdapter]];
for (const [lang, texts] of Object.entries(TEXTS)) {
  for (const t of texts) {
    console.log(`${lang.padEnd(3)} ${packs.map(([p, a]) => `${p} ${share(a, t)}`).join('  ')}   ${t.slice(0, 40)}…`);
  }
}
