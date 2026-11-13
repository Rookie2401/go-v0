import type { LanguageCode } from '../core';

/** Load only the requested language adapter when a Node dictionary build needs its normalizer. */
export async function loadAdapterNormalizer(lang: LanguageCode): Promise<(surface: string) => string> {
  switch (lang) {
    case 'es': return (await import('../adapters/es')).esAdapter.normalize;
    case 'sq': return (await import('../adapters/sq')).sqAdapter.normalize;
    case 'th': return (await import('../adapters/th')).thAdapter.normalize;
    case 'hi': return (await import('../adapters/hi')).hiAdapter.normalize;
    case 'de': return (await import('../adapters/de')).deAdapter.normalize;
    case 'nb': return (await import('../adapters/nb')).nbAdapter.normalize;
    case 'nn': return (await import('../adapters/nn')).nnAdapter.normalize;
    case 'he': return (await import('../adapters/he')).heAdapter.normalize;
    case 'el': return (await import('../adapters/el')).elAdapter.normalize;
    case 'arc': return (await import('../adapters/arc')).arcAdapter.normalize;
    case 'la': return (await import('../adapters/la')).laAdapter.normalize;
  }
}
