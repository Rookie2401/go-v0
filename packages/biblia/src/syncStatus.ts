import type { AccountRecorderStatus } from './repo';

export interface SyncStatusAccount {
  state(): { signedIn: boolean; expired?: boolean };
  subscribe(listener: () => void): () => void;
}

export interface SyncStatusRecorder {
  status(): AccountRecorderStatus;
  subscribeStatus(listener: (status: AccountRecorderStatus) => void): () => void;
  flush(): Promise<unknown>;
}

export interface SyncStatusOptions {
  doc: Document;
  account: SyncStatusAccount;
  recorder: SyncStatusRecorder;
  now?: () => number;
}

export interface SyncStatusView {
  element: HTMLElement;
  destroy(): void;
}

const countText = (count: number): string => `${count} pending ${count === 1 ? 'item' : 'items'}`;

/** A compact, live sync notice for the standalone Biblia account edition. */
export function createSyncStatus(options: SyncStatusOptions): SyncStatusView {
  const { doc, account, recorder } = options;
  const now = options.now ?? Date.now;
  const element = doc.createElement('aside');
  element.className = 'sync-status';
  element.setAttribute('role', 'status');
  element.setAttribute('aria-live', 'polite');
  element.setAttribute('aria-atomic', 'true');
  Object.assign(element.style, { position: 'sticky', top: '0', zIndex: '30', padding: '0.5rem 1rem', fontSize: '0.85rem', background: 'var(--paper, #f7f2e8)', borderBottom: '1px solid var(--rule, #d7cfc2)', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'center', gap: '0.65rem' });
  element.hidden = true;

  const message = doc.createElement('span');
  message.className = 'sync-status__message';
  const action = doc.createElement('button');
  action.type = 'button';
  action.className = 'sync-status__action';
  action.textContent = 'Sync now';
  action.hidden = true;

  const signIn = doc.createElement('a');
  signIn.className = 'sync-status__signin';
  signIn.href = '#/account';
  signIn.textContent = 'Sign in';
  signIn.hidden = true;
  element.append(message, action, signIn);

  let latest = recorder.status();
  let destroyed = false;
  let pendingBeforeExpiry = 0;

  const render = (): void => {
    if (destroyed) return;
    const state = account.state();
    const expired = !!state.expired;
    const signedIn = state.signedIn;
    const pending = Math.max(0, latest.pending);
    if (signedIn && !expired) {
      if (pending > 0) pendingBeforeExpiry = pending;
      else pendingBeforeExpiry = 0;
    }
    const visiblePending = expired ? Math.max(pending, pendingBeforeExpiry) : pending;
    let text = '';
    let showAction = false;
    let showSignIn = false;

    if (expired) {
      text = visiblePending > 0
        ? `Your sign-in expired. ${countText(visiblePending)} are safe on this device; sign in again to sync them.`
        : 'Your sign-in expired. Sign in again to sync your Biblia activity.';
      showSignIn = true;
    } else if (!signedIn) {
      text = '';
    } else if (latest.retrying) {
      text = pending > 0 ? `Sending ${countText(pending)}…` : 'Syncing your Biblia activity…';
      showAction = pending > 0;
    } else if (pending > 0) {
      if (latest.retryAt !== undefined) {
        const seconds = Math.max(1, Math.ceil((latest.retryAt - now()) / 1000));
        text = `${countText(pending)} saved on this device. Trying again in about ${seconds} seconds.`;
      } else {
        text = `${countText(pending)} saved on this device. They will sync when the connection returns.`;
      }
      showAction = true;
    } else if (latest.lastError) {
      text = 'Sync could not finish yet. Your activity is safe on this device.';
    } else if (latest.lastSuccessAt !== undefined) {
      text = `Uploads complete · Last sent at ${new Date(latest.lastSuccessAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.`;
    }

    message.textContent = text;
    action.hidden = !showAction;
    signIn.hidden = !showSignIn;
    element.hidden = text.length === 0;
    // the page's sticky top bars read --sync-h (styles.css) so they stick just below this bar instead of under it
    try { doc.documentElement.style.setProperty('--sync-h', element.hidden ? '0px' : `${element.offsetHeight || 0}px`); } catch { /* no layout (tests) */ }
  };

  const onClick = (): void => { void recorder.flush().catch(() => undefined); };
  action.addEventListener('click', onClick);
  const unsubscribeStatus = recorder.subscribeStatus((status) => { latest = status; render(); });
  const unsubscribeAccount = account.subscribe(render);
  render();

  return {
    element,
    destroy() {
      if (destroyed) return;
      destroyed = true;
      unsubscribeStatus();
      unsubscribeAccount();
      action.removeEventListener('click', onClick);
      element.remove();
    },
  };
}
