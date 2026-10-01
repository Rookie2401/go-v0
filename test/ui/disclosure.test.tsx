// @vitest-environment jsdom
/**
 * "What are you trying to say?" is a real disclosure: a native button with aria-expanded and aria-controls, a chevron that
 * rotates, a visible focus ring, collapsed by default, focus moves into the field when it opens.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { Testimony } from '../../src/ui/testimony/Testimony';
import { button, click, makeHarness, q, qa } from './harness';
import type { Mounted } from './harness';

let mounted: Mounted | undefined;
afterEach(async () => { await mounted?.unmount(); mounted = undefined; });

const css = readFileSync(resolve(process.cwd(), 'src/index.css'), 'utf8');

async function open() {
  const h = await makeHarness();
  mounted = await h.mount(<Testimony />);
  const toggle = button(mounted.container, 'What are you trying to say?');
  const panel = () => document.getElementById(toggle.getAttribute('aria-controls')!)!;
  return { h, toggle, panel };
}

describe('the "What are you trying to say?" disclosure', () => {
  it('is a real button: native (so Enter and Space activate it), focusable, aria-expanded and aria-controls', async () => {
    const { toggle, panel } = await open();
    expect(toggle.tagName).toBe('BUTTON');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.disabled).toBe(false);
    expect(toggle.tabIndex).toBe(0);
    expect(toggle.hasAttribute('aria-expanded')).toBe(true);
    expect(panel()).not.toBeNull(); // aria-controls points at something that exists even while collapsed
    expect(toggle.closest('details')).toBeNull(); // not a <summary>
  });

  it('is collapsed by default: the field is not shown, not focusable, and nothing steals focus', async () => {
    const { toggle, panel } = await open();
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel().hidden).toBe(true);
    expect(toggle.closest('.disclosure')!.classList.contains('is-open')).toBe(false);
    expect(document.activeElement).not.toBe(q(panel(), 'input'));
  });

  it('opening reveals the field, announces the state (aria-expanded), rotates the chevron, and moves focus into the field', async () => {
    const { toggle, panel } = await open();
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(panel().hidden).toBe(false);
    expect(toggle.closest('.disclosure')!.classList.contains('is-open')).toBe(true); // .is-open rotates the chevron (css below)
    const field = q<HTMLInputElement>(panel(), 'input')!;
    expect(field.getAttribute('aria-label')).toBe('What you want to say, in English');
    expect(document.activeElement).toBe(field);
    expect(qa(panel(), 'button').map((b) => b.textContent)).toContain('Help me say it');
  });

  it('closing hides the field again and does not pull focus anywhere else', async () => {
    const { toggle, panel } = await open();
    await click(toggle);
    toggle.focus();
    await click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('false');
    expect(panel().hidden).toBe(true);
    expect(document.activeElement).toBe(toggle);
  });

  it('has a chevron that is decorative (hidden from assistive technology) and a label that names what opens', async () => {
    const { toggle } = await open();
    const chevron = q(toggle, '.disclosure__chevron')!;
    expect(chevron.getAttribute('aria-hidden')).toBe('true');
    expect(q(toggle, '.disclosure__label')!.textContent).toBe('What are you trying to say?');
    expect(toggle.textContent).toBe('What are you trying to say?'); // the accessible name is the label alone
  });

  it('the stylesheet gives it a visible focus ring and rotates the chevron when open', () => {
    expect(css).toMatch(/\.disclosure__btn:focus-visible\s*\{[^}]*outline:\s*2px solid/);
    expect(css).toMatch(/\.disclosure\.is-open[^{]*\.disclosure__chevron\s*\{[^}]*rotate\(180deg\)/);
    expect(css).toMatch(/\.disclosure__chevron\s*\{[^}]*transition:\s*transform/);
    expect(css).toMatch(/\.disclosure__panel\[hidden\]\s*\{\s*display:\s*none/);
  });

  it('keeps the intent behaviour: the question is asked of GoTell, an unsupported answer shows its limitation and offers nothing to insert', async () => {
    const h = await makeHarness({ tell: { proposal: { supported: false, insertable: false, limitation: 'You have not met a word for "sin" yet.', sources: [], unexpressed: ['my sin'], familiar: [], newItems: [] } } });
    mounted = await h.mount(<Testimony />);
    await click(button(mounted.container, 'What are you trying to say?'));
    const field = q<HTMLInputElement>(mounted.container, 'input[aria-label="What you want to say, in English"]')!;
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    const { act } = await import('react');
    await act(async () => { set.call(field, 'I began to understand my sin'); field.dispatchEvent(new Event('input', { bubbles: true })); });
    await click(button(mounted.container, 'Help me say it'));
    expect(h.tell.intent).toHaveBeenCalled();
    expect(q(mounted.container, '[data-testid="intent-limitation"]')!.textContent).toContain('You have not met a word for "sin" yet.');
    expect(qa(mounted.container, 'button').some((b) => b.textContent === 'Add to my draft')).toBe(false);
  });
});
