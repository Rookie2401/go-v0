/**
 * Probe: what does the Spanish adapter choose for written forms with two common readings, in a sentence?
 * Run: npx vite-node scripts/probe-es-ambig.mts
 */
import { createAdapterRegistry } from '../src/adapters';

const es = createAdapterRegistry().get('es');
const cases: [string, string][] = [
  ['No sé dónde está.', 'sé'],
  ['Yo sé la respuesta.', 'sé'],
  ['Sé bueno con tu hermano.', 'Sé'],
  ['Juan fue a la casa.', 'fue'],
  ['Fue un día muy bueno.', 'Fue'],
  ['Ana vino ayer.', 'vino'],
  ['Juan toma vino.', 'vino'],
  ['Yo como pan.', 'como'],
  ['Es como su padre.', 'como'],
  ['Para mí es fácil.', 'Para'],
  ['El bus para aquí.', 'para'],
  ['Juan nada en el río.', 'nada'],
  ['No tengo nada.', 'nada'],
  ['Ella se sienta en la silla.', 'sienta'],
  ['Di la verdad.', 'Di'],
  ['Ve a la casa.', 'Ve'],
  ['Él ve la casa.', 've'],
  ['Era una casa grande.', 'Era'],
  ['Sobre la mesa hay un libro.', 'Sobre'],
  ['Entre ellos hay paz.', 'Entre'],
  ['Lo dijo bajo la lluvia.', 'bajo'],
  ['La casa tiene una sala.', 'casa'],
  ['Te lo dije.', 'Te'],
  ['Quiero té.', 'té'],
];
for (const [s, w] of cases) {
  const toks = es.tokenize(s);
  const res = es.analyze(toks);
  const i = toks.findIndex((t) => t.surface === w);
  const cands = res[i]?.candidates ?? (res[i] as unknown as { analyses?: unknown[] })?.analyses ?? [];
  const line = (cands as { lemma?: string; lemmaId?: string; pos?: string; gloss?: string; confidence?: number; morph?: Record<string, string> }[])
    .slice(0, 3)
    .map((c) => `${c.lemma ?? c.lemmaId}/${c.pos} "${c.gloss ?? ''}" ${c.confidence ?? ''} ${JSON.stringify(c.morph ?? {})}`)
    .join('  ||  ');
  console.log(`${s.padEnd(34)} ${w.padEnd(7)} → ${line}`);
}
