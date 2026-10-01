// @vitest-environment jsdom
/**
 * The import report never says a learner's own copy will be "published to learners": it is readable on this device
 * only. (Found in the browser during the audit round: the per-chapter line contradicted the summary above it.)
 */
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { ImportReport } from '../../src/ui/pages/settings/ImportReport';
import type { ImportDocView } from '../../src/ui/context';

let host: HTMLDivElement | undefined;
let root: ReturnType<typeof createRoot> | undefined;
afterEach(async () => { await act(async () => { root?.unmount(); }); host?.remove(); host = undefined; root = undefined; });

async function render(docs: ImportDocView[]): Promise<string> {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => { root!.render(<ImportReport docs={docs} />); });
  return host.querySelector('[data-testid="would-publish"]')?.textContent ?? '';
}

describe('what the import preview says will happen to a text', () => {
  it('a personal copy is readable on this device, not published to learners', async () => {
    const line = await render([{ id: 'book-ch01', action: 'valid', published: true, personalCopy: true, issues: [] }]);
    expect(line).toMatch(/readable on this device/);
    expect(line).toMatch(/not published to anyone else/);
    expect(line).not.toMatch(/published to learners/);
  });

  it('a reviewed course text is published to learners, and a held text says what is missing', async () => {
    expect(await render([{ id: 'story', action: 'valid', published: true, issues: [] }])).toBe('Will be published to learners when imported.');
    await act(async () => { root?.unmount(); });
    host?.remove();
    const held = await render([{ id: 'story', action: 'valid', published: false, unpublishedReasons: ['needs a review'], issues: [] }]);
    expect(held).toMatch(/NOT published to learners yet: needs a review/);
  });
});
