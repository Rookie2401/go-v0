import type { TellEngine, TellHost } from '../../../../gotell/src/workspace/port';
import type { AppContext } from '../../context';
import { h } from '../../dom';
import type { Identity } from '../../ports';
import type { View } from '../view';

/** Everything a workspace screen needs. */
export interface TellEnv {
  el: HTMLElement;
  ctx: AppContext;
  view: View;
  id: Identity;
  host: TellHost;
  engine: TellEngine;
  /** The target-language tag for lang attributes (the variety when there is one). */
  tag: string;
}

const LINKS: Array<{ id: string; href: string; label: string }> = [
  { id: 'home', href: '#/tell', label: 'Home' },
  { id: 'prompts', href: '#/tell/prompts', label: 'Prompts' },
  { id: 'goals', href: '#/tell/goals', label: 'Goals' },
  { id: 'privacy', href: '#/tell/privacy', label: 'Privacy' },
];

export function tellNav(active: string): HTMLElement {
  return h('nav', { class: 'tell-nav', 'aria-label': 'GoTell' },
    ...LINKS.map((l) => h('a', { href: l.href, 'data-tell-nav': l.id, ...(l.id === active ? { 'aria-current': 'page' } : {}) }, l.label)));
}

export const CLASS_LABEL: Record<string, string> = {
  'grammatically-wrong': 'Probably wrong',
  'semantically-unclear': 'Meaning unclear',
  'acceptable-but-awkward': 'Acceptable, but awkward',
  'regional-variation': 'Regional variation',
  'register-difference': 'Register difference',
  'stylistic-alternative': 'Stylistic alternative',
  'uncertain-analysis': 'Uncertain: the checker is not sure',
};

export const DIFFICULTY_LABEL: Record<string, string> = {
  'first-sentences': 'First sentences',
  'short-paragraph': 'A short paragraph',
  'connected-paragraphs': 'Connected paragraphs',
};
