/**
 * The varieties the Norwegian adapters can label (see core/variety.ts for how a course uses them). Bokmål and Nynorsk are two
 * equal written standards (Språkrådet); there is no official spoken standard, so no variety here is a spoken one. The older
 * layers are 'historical': the words are the same language, the text is kept as written, and the standing says it is not
 * today's spelling. Riksmål is a living private norm: it is kind 'historical' because it is not the official norm, and its
 * note says plainly that it is still written today. MACHINE-DRAFTED labels and notes, pending native review.
 */
import type { Variety } from '../../core';

export const NB_VARIETIES: Record<string, Variety> = {
  nb: { code: 'nb', label: 'Bokmål', kind: 'national', note: 'The written standard of Bokmål (the norm of 2005). One of Norway\'s two equal written standards; there is no official spoken standard.' },
  'nb-riksmal': {
    code: 'nb-riksmal', label: 'Riksmål', kind: 'historical', parent: 'nb',
    note: 'Riksmål is the older, more conservative Bokmål-type spelling (efter, nu, sprog, sne). It had official status before 1929 and its norm is kept privately and is still written today by Riksmål writers, but it is not part of the official Bokmål norm. Recognise it; do not use it as Bokmål.',
  },
  'nb-dano': {
    code: 'nb-dano', label: 'Dano-Norwegian (pre-1907)', kind: 'historical', parent: 'nb',
    note: 'Danish-based written language in Norway before the reform of 1907 (soft consonants such as gade and bog, hvad, mig, capital letters on nouns, aa for å). Not written this way today.',
  },
};

export const NN_VARIETIES: Record<string, Variety> = {
  nn: { code: 'nn', label: 'Nynorsk', kind: 'national', note: 'The written standard of Nynorsk (the norm of 2012). One of Norway\'s two equal written standards; read here, not the target of the course.' },
  'nn-landsmal': {
    code: 'nn-landsmal', label: 'Landsmål (pre-1929)', kind: 'historical', parent: 'nn',
    note: 'Ivar Aasen\'s Landsmål and its spelling before the name Nynorsk (1929) and the reforms of 1917, 1938 and 1959. Recognise it when reading older Nynorsk; it is not the spelling of today.',
  },
  'nn-hognorsk': {
    code: 'nn-hognorsk', label: 'Høgnorsk', kind: 'historical', parent: 'nn',
    note: 'Høgnorsk is a conservative Nynorsk norm kept by a small group of writers, close to Aasen\'s Landsmål; it is still written today but is not part of the official Nynorsk norm.',
  },
};

export const NB_VARIETY_CODES: readonly string[] = Object.keys(NB_VARIETIES);
export const NN_VARIETY_CODES: readonly string[] = Object.keys(NN_VARIETIES);
