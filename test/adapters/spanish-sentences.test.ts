/** Spanish sentence segmentation: ¿ ? ¡ !, dialogue dashes, « », ellipses, abbreviations, numbers. Offsets round-trip. */
import { describe, expect, it } from 'vitest';
import { adapter } from './helpers';

const es = adapter('es');
const split = (t: string) => es.segmentSentences(t).map((s) => s.text);

describe('Spanish sentence segmentation', () => {
  it('splits at . ? ! … and keeps the opening marks with their sentence', () => {
    expect(split('¿Cómo estás? Bien.')).toEqual(['¿Cómo estás?', 'Bien.']);
    expect(split('¡Hola! ¿Qué tal? Muy bien.')).toEqual(['¡Hola!', '¿Qué tal?', 'Muy bien.']);
    expect(split('Pero, ¿qué dices? No entiendo.')).toEqual(['Pero, ¿qué dices?', 'No entiendo.']);
    expect(split('¿Qué? ¿Cómo?')).toEqual(['¿Qué?', '¿Cómo?']);
  });

  it('dialogue: a dash starts a turn; a narrator\'s remark after ? or ! stays with the speech', () => {
    expect(split('—Hola —dijo Ana—. ¿Cómo estás?')).toEqual(['—Hola —dijo Ana—.', '¿Cómo estás?']);
    expect(split('—¿Cómo estás? —preguntó Ana. —Bien, gracias.')).toEqual(['—¿Cómo estás? —preguntó Ana.', '—Bien, gracias.']);
    expect(split('—¡Vete! —gritó él. Ella se fue.')).toEqual(['—¡Vete! —gritó él.', 'Ella se fue.']);
    expect(split('—Hola.\n—Adiós.')).toEqual(['—Hola.', '—Adiós.']);
    // a new turn after a question is a new sentence even without a line break
    expect(split('—¿Vienes? —¡Sí!')).toEqual(['—¿Vienes?', '—¡Sí!']);
  });

  it('quotation marks « » travel with the sentence they close', () => {
    expect(split('Dijo: «Vamos.» Luego salió.')).toEqual(['Dijo: «Vamos.»', 'Luego salió.']);
    expect(split('Dijo «¿Vienes?» y me fui.')).toEqual(['Dijo «¿Vienes?» y me fui.']);
    expect(split('Leyó «Dios es amor». Después cerró el libro.')).toEqual(['Leyó «Dios es amor».', 'Después cerró el libro.']);
  });

  it('an ellipsis ends a sentence only when a capital follows', () => {
    expect(split('Bueno... entonces vamos. Sí.')).toEqual(['Bueno... entonces vamos.', 'Sí.']);
    expect(split('Bueno… Entonces vamos.')).toEqual(['Bueno…', 'Entonces vamos.']);
    expect(split('—No sé… —dijo Ana.')).toEqual(['—No sé… —dijo Ana.']);
  });

  it('abbreviations do not end a sentence', () => {
    expect(split('El Sr. López y la Sra. Pérez llegaron. Hablé con el Dr. García.')).toEqual(['El Sr. López y la Sra. Pérez llegaron.', 'Hablé con el Dr. García.']);
    expect(split('Hola, Srta. Gómez. ¿Cómo está Ud.? Bien.')).toEqual(['Hola, Srta. Gómez.', '¿Cómo está Ud.?', 'Bien.']);
    expect(split('Ver pág. 5. Luego sigue.')).toEqual(['Ver pág. 5.', 'Luego sigue.']);
    expect(split('Véase el núm. 3 del cap. 2.')).toEqual(['Véase el núm. 3 del cap. 2.']);
  });

  it('etc. ends a sentence when a capital follows and not when the sentence goes on', () => {
    expect(split('Compré pan, leche, etc. Luego volví.')).toEqual(['Compré pan, leche, etc.', 'Luego volví.']);
    expect(split('Compré pan, etc. y leche.')).toEqual(['Compré pan, etc. y leche.']);
  });

  it('EE. UU. and a. C. / d. C.', () => {
    expect(split('EE. UU. es grande. Mañana voy.')).toEqual(['EE. UU. es grande.', 'Mañana voy.']);
    expect(split('Vivo en EE. UU. Mañana voy.')).toEqual(['Vivo en EE. UU.', 'Mañana voy.']);
    expect(split('César murió en el 44 a. C. Luego vino Augusto.')).toEqual(['César murió en el 44 a. C.', 'Luego vino Augusto.']);
    expect(split('Nació en el año 10 d. C. y murió en Roma.')).toEqual(['Nació en el año 10 d. C. y murió en Roma.']);
    expect(split('J. R. Pérez llegó. Se sentó.')).toEqual(['J. R. Pérez llegó.', 'Se sentó.']);
  });

  it('numbers: decimals and thousands do not split', () => {
    expect(split('Mide 3.5 metros. Cuesta 1.000 pesos.')).toEqual(['Mide 3.5 metros.', 'Cuesta 1.000 pesos.']);
    expect(split('Son las 10.30 de la noche. Voy.')).toEqual(['Son las 10.30 de la noche.', 'Voy.']);
  });

  it('every span is a trimmed slice of the text, in order and without overlap', () => {
    const text = '  —¿Cómo estás? —preguntó el Sr. López—. Bien... gracias.\n\n«¡Hola!» Dijo EE. UU.  Fin.';
    const spans = es.segmentSentences(text);
    let last = 0;
    for (const s of spans) {
      expect(s.start).toBeGreaterThanOrEqual(last);
      expect(text.slice(s.start, s.end)).toBe(s.text);
      expect(s.text).toBe(s.text.trim());
      last = s.end;
    }
    expect(spans.length).toBeGreaterThan(2);
  });

  it('empty and blank text give no sentences; text with no terminator is one sentence', () => {
    expect(split('')).toEqual([]);
    expect(split('   \n  ')).toEqual([]);
    expect(split('Sin punto final')).toEqual(['Sin punto final']);
  });
});
