/**
 * The class of a root, from its ordered radicals alone (the root itself is the source's: it is never derived by stripping letters).
 * The classes the grammars of Arabic name: sound (no weak letter, no hamza, no doubling), assimilated (initial و or ي), hollow (middle
 * و or ي), defective (final و or ي), doubly weak (two weak radicals: lafīf), geminate (second and third radical alike), hamzated
 * (a hamza among the radicals). A root of four radicals is quadriliteral and says so: the weak classes are named by position only for
 * three radicals.
 */
import { rootRadicals } from './text';

export type ArRootClass = 'sound' | 'assimilated' | 'hollow' | 'defective' | 'doubly-weak' | 'geminate' | 'hamzated';

const WEAK = new Set(['و', 'ي', 'ى', 'ا']);
const HAMZA = new Set(['ء', 'أ', 'إ', 'ؤ', 'ئ', 'آ']);

export interface ArRootInfo {
  /** The classes the root belongs to (a root may be hamzated and defective at once), in a fixed order; ['sound'] when none apply. */
  classes: ArRootClass[];
  /** 3 for a triliteral root, 4 for a quadriliteral one (0 when there is no root). */
  radicals: number;
  /** The one name notes carry: the first class, 'quadriliteral' for four radicals that are sound. */
  label: string;
}

export function rootInfo(root: string | undefined): ArRootInfo {
  const r = rootRadicals(root);
  if (r.length < 3) return { classes: [], radicals: r.length, label: '' };
  const isW = (x: string): boolean => WEAK.has(x);
  const classes: ArRootClass[] = [];
  if (r.length === 3) {
    const [a, b, c] = r;
    const weak = [isW(a), isW(b), isW(c)];
    if (weak.filter(Boolean).length >= 2) classes.push('doubly-weak');
    else if (weak[0]) classes.push('assimilated');
    else if (weak[1]) classes.push('hollow');
    else if (weak[2]) classes.push('defective');
    if (b === c && !weak[1]) classes.push('geminate');
    if (r.some((x) => HAMZA.has(x))) classes.push('hamzated');
  } else {
    if (r.some((x) => HAMZA.has(x))) classes.push('hamzated');
    if (isW(r[r.length - 1])) classes.push('defective');

  }
  if (!classes.length) classes.push('sound');
  return { classes, radicals: r.length, label: r.length === 4 && classes[0] === 'sound' ? 'quadriliteral' : classes.join(', ') };
}

/** The one-word class of a root for notes (`notes.rootClass`): "hollow", "defective, hamzated", "quadriliteral". "" without a root. */
export const rootClass = (root: string | undefined): string => rootInfo(root).label;
