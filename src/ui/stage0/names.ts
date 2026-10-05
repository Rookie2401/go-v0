import type { LanguageCode } from '../../core';
import type { Stage0World } from '../../stage0/content';

/** The Stage 0 cast member a word names in this language, if any. */
export function castName(world: Stage0World | undefined, lang: LanguageCode, surface: string): { role: string } | undefined {
  const s = surface.normalize('NFC').toLowerCase();
  const c = world?.characters.find((x) => (x.names[lang] ?? '').normalize('NFC').toLowerCase() === s);
  return c ? { role: c.role } : undefined;
}
