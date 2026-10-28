// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createSyncStatus, type SyncStatusAccount, type SyncStatusRecorder } from '../../packages/biblia/src/syncStatus';
import type { AccountRecorderStatus } from '../../packages/biblia/src/repo';

function setup(initial: AccountRecorderStatus = { pending: 0, retrying: false }, signedIn = true, expired = false) {
  let state = { signedIn, expired };
  let status = initial;
  const accountListeners = new Set<() => void>();
  const statusListeners = new Set<(value: AccountRecorderStatus) => void>();
  const account: SyncStatusAccount = {
    state: () => state,
    subscribe(listener) { accountListeners.add(listener); return () => { accountListeners.delete(listener); }; },
  };
  const flush = vi.fn(async () => ({ status: 'ok', sent: 1, pending: 0, rejected: 0 }));
  const recorder: SyncStatusRecorder = {
    status: () => status,
    subscribeStatus(listener) {
      statusListeners.add(listener);
      listener(status);
      return () => { statusListeners.delete(listener); };
    },
    flush,
  };
  const view = createSyncStatus({ doc: document, account, recorder, now: () => 1_800_000_000_000 });
  document.body.append(view.element);
  return {
    ...view,
    account,
    recorder,
    flush,
    setState(next: typeof state) { state = next; for (const listener of accountListeners) listener(); },
    setStatus(next: AccountRecorderStatus) { status = next; for (const listener of statusListeners) listener(status); },
    accountListeners,
    statusListeners,
  };
}

describe('Biblia sync status', () => {
  it('shows pending uploads and changes to the last successful sync message', () => {
    const s = setup({ pending: 2, retryAt: 1_800_000_005_000, retrying: false });
    expect(s.element.hidden).toBe(false);
    expect(s.element.textContent).toContain('2 pending items');
    expect(s.element.textContent).toContain('about 5 seconds');

    s.setStatus({ pending: 0, lastSuccessAt: 1_799_999_880_000, retrying: false });
    expect(s.element.textContent).toContain('Uploads complete');
    expect(s.element.textContent).toContain('Last sent at');
    s.destroy();
  });

  it('is a plain block for the Settings page, not a sticky bar: no inline position, no --sync-h on <html> (2026-10-27)', () => {
    const s = setup({ pending: 2, retrying: false });
    expect(s.element.style.position).toBe('');
    expect(s.element.getAttribute('style')).toBeNull();
    expect(document.documentElement.style.getPropertyValue('--sync-h')).toBe('');
    expect(s.element.querySelector('button')?.classList.contains('btn')).toBe(true);
    s.destroy();
  });

  it('explains an expired sign-in and links back to the account screen', () => {
    const s = setup({ pending: 3, retrying: false });
    s.setState({ signedIn: false, expired: true });
    // The service clears the live session on 401, so the recorder then reports zero for that session.
    s.setStatus({ pending: 0, retrying: false });
    expect(s.element.hidden).toBe(false);
    expect(s.element.textContent).toContain('Your sign-in expired');
    expect(s.element.textContent).toContain('3 pending items');
    expect(s.element.querySelector('a')?.getAttribute('href')).toBe('#/account');
    s.destroy();
  });

  it('flushes when Sync now is pressed', async () => {
    const s = setup({ pending: 1, retrying: false });
    s.element.querySelector('button')?.click();
    expect(s.flush).toHaveBeenCalledOnce();
    s.destroy();
  });

  it('unsubscribes and removes its click listener on destroy', () => {
    const s = setup({ pending: 1, retrying: false });
    const button = s.element.querySelector('button')!;
    s.destroy();
    s.setStatus({ pending: 0, lastSuccessAt: 1_800_000_000_000, retrying: false });
    s.setState({ signedIn: true, expired: false });
    button.click();
    expect(s.element.isConnected).toBe(false);
    expect(s.statusListeners.size).toBe(0);
    expect(s.accountListeners.size).toBe(0);
    expect(s.flush).not.toHaveBeenCalled();
  });
});
