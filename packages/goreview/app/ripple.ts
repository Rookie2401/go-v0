/**
 * The home's deck tiles have no outline (the owner, 2026-11-12): a tile answers the pointer by turning a lighter colour, and the lighter colour
 * spreads from the point of contact like a ripple. The wash itself is the tile's ::before in styles.css (a circle scaled from nothing to the
 * tile's farthest corner); this module only says where it starts and how far it must reach, and turns it on and off:
 *
 *   --ripple-x, --ripple-y   the point of contact, from the tile's top left
 *   --ripple-r               the circle's radius, long enough that its solid part covers the tile from that point
 *   data-lit                 present while the pointer is on the tile (a mouse over it, a finger or pen down on it)
 *
 * When the pointer leaves, the wash draws back to the point where it left. A tap is shorter than the wash, so a lit tile stays lit for at least
 * MIN_LIT_MS. A tile with nothing to press (its deck is empty, its button disabled) does not light. From the keyboard the stylesheet lights the
 * focused tile from its centre, and nothing here is needed for that. The spread plays whatever the motion preference (the owner's decision).
 */

/** The share of the circle's radius that is the solid lighter colour; the rest is the soft leading edge. The same number as in styles.css. */
export const RIPPLE_SOLID = 0.62;
/** How long a tile stays lit at least, so that a quick tap still shows the wash. */
export const MIN_LIT_MS = 420;

const clamp = (n: number, low: number, high: number): number => Math.min(high, Math.max(low, n));

/** Whether the tile holds something the learner can press now. */
const pressable = (tile: HTMLElement): boolean => !!tile.querySelector('a[href], button:not(:disabled)');

export function attachRipple(tile: HTMLElement): void {
  const win = tile.ownerDocument.defaultView;
  if (!win) return;
  let litAt = 0;
  let timer: number | undefined;

  /** Put the circle's centre at the pointer, and make it long enough to cover the tile from there. */
  const place = (event: PointerEvent): void => {
    const box = tile.getBoundingClientRect();
    if (!box.width || !box.height) return; // not laid out: the stylesheet's centred default stands
    const x = clamp(event.clientX - box.left, 0, box.width);
    const y = clamp(event.clientY - box.top, 0, box.height);
    const farthestCorner = Math.hypot(Math.max(x, box.width - x), Math.max(y, box.height - y));
    tile.style.setProperty('--ripple-x', `${Math.round(x)}px`);
    tile.style.setProperty('--ripple-y', `${Math.round(y)}px`);
    tile.style.setProperty('--ripple-r', `${Math.ceil(farthestCorner / RIPPLE_SOLID)}px`);
  };
  const cancelTimer = (): void => { if (timer !== undefined) { win.clearTimeout(timer); timer = undefined; } };

  const light = (event: PointerEvent): void => {
    cancelTimer();
    if (tile.hasAttribute('data-lit') || !pressable(tile)) return;
    place(event);
    litAt = win.performance.now();
    tile.setAttribute('data-lit', '');
  };
  const dim = (event: PointerEvent): void => {
    if (!tile.hasAttribute('data-lit')) return;
    cancelTimer();
    const go = (): void => { timer = undefined; place(event); tile.removeAttribute('data-lit'); };
    const wait = MIN_LIT_MS - (win.performance.now() - litAt);
    if (wait > 0) timer = win.setTimeout(go, wait); else go();
  };

  // a mouse enters and leaves; a finger or pen "enters" as it touches and "leaves" as it lifts (Pointer Events), so one pair covers all three
  tile.addEventListener('pointerenter', light);
  tile.addEventListener('pointerleave', dim);
  tile.addEventListener('pointercancel', dim); // the touch became a scroll
}
