import { describe, expect, it } from 'vitest';
import { LANGUAGES, LANGUAGE_ROWS } from '../../src/core';
import { createAdapterRegistry } from '../../src/adapters';

describe('adapter registry', () => {
  const reg = createAdapterRegistry();

  it('exposes one adapter per course language in LANGUAGES order', () => {
    expect(reg.all().map((a) => a.lang)).toEqual([...LANGUAGES]);
    for (const l of LANGUAGES) expect(reg.get(l).lang).toBe(l);
  });

  it('throws for an unknown language', () => {
    // @ts-expect-error deliberately wrong code
    expect(() => reg.get('xx')).toThrow(/no adapter/);
  });

  it('agrees with the language configuration (script, whitespace)', () => {
    for (const row of LANGUAGE_ROWS) {
      const a = reg.get(row.id);
      expect(a.script).toBe(row.script);
      expect(a.display.wordSeparator === ' ').toBe(row.whitespaceDelimited);
      expect(a.version).toMatch(/^\d+$/);
    }
  });

  it('Thai asks the UI to show token boundaries on highlight, the others do not', () => {
    for (const a of reg.all()) expect(a.display.showBoundariesOnHighlight).toBe(a.lang === 'th');
  });
});
