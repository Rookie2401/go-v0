/// <reference types="node" />
/**
 * Outgoing email for the account flows (verification and password reset). The service depends on the `EmailSender` interface in ./deps only; this
 * file holds the implementations and is loaded by `main.ts` (and tests).
 *
 *  - SMTP (`SMTP_URL=smtp://user:pass@host:587`, STARTTLS; or `smtps://user:pass@host:465`, TLS from the first byte). No dependency: a small client.
 *  - Resend (`RESEND_API_KEY`), one HTTPS call.
 *  - File outbox (the default): each message is a JSON file under the outbox directory. For development and for a service with no mail account yet.
 *    A file holds the token, so the directory is created private and is never to be shared or backed up off the box.
 *  - Console: one line per message to the log (development).
 *  - Memory: tests.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import net from 'node:net';
import tls from 'node:tls';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { EmailMessage, EmailSender } from './deps';

export const SEND_TIMEOUT_MS = 15_000;

const oneLine = (s: string): string => s.replace(/[\r\n]+/g, ' ').trim();

// ───────────────────────────── file, console, memory ─────────────────────────────

export function createFileMailer(dir: string, now: () => string = () => new Date().toISOString()): EmailSender {
  return {
    kind: 'file',
    delivers: false,
    async send(m) {
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const at = now();
      const name = `${at.replace(/[:.]/g, '-')}-${randomUUID().slice(0, 8)}.json`;
      writeFileSync(join(dir, name), `${JSON.stringify({ at, to: m.to, subject: m.subject, text: m.text }, null, 2)}\n`, { mode: 0o600 });
    },
  };
}

export function createConsoleMailer(log: (line: string) => void = console.log): EmailSender {
  return {
    kind: 'console',
    delivers: false,
    async send(m) { log(`mail to=${oneLine(m.to)} subject=${oneLine(m.subject)}\n${m.text}`); },
  };
}

export interface MemoryMailer extends EmailSender { sent: EmailMessage[] }
export function createMemoryMailer(): MemoryMailer {
  const sent: EmailMessage[] = [];
  return { kind: 'memory', delivers: false, sent, async send(m) { sent.push({ ...m }); } };
}

// ───────────────────────────── Resend ─────────────────────────────

export function createResendMailer(opts: { apiKey: string; from: string; fetch?: typeof fetch; endpoint?: string }): EmailSender {
  const doFetch = opts.fetch ?? fetch;
  return {
    kind: 'resend',
    delivers: true,
    async send(m) {
      const res = await doFetch(opts.endpoint ?? 'https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${opts.apiKey}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: opts.from, to: [m.to], subject: m.subject, text: m.text }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      // never the response body or the key: neither belongs in a log
      if (!res.ok) throw new Error(`Resend answered ${res.status}`);
    },
  };
}

// ───────────────────────────── SMTP ─────────────────────────────

export interface SmtpConfig { host: string; port: number; secure: boolean; user?: string; pass?: string; from: string; helo?: string; timeoutMs?: number }

/** `smtp://user:pass@host:587` (port 587 and STARTTLS when offered) or `smtps://…@host:465`. User and password are URL-decoded. */
export function parseSmtpUrl(url: string, from: string): SmtpConfig {
  const u = new URL(url);
  if (u.protocol !== 'smtp:' && u.protocol !== 'smtps:') throw new Error('SMTP_URL must start with smtp:// or smtps://');
  const secure = u.protocol === 'smtps:';
  return {
    host: u.hostname, port: u.port ? Number(u.port) : secure ? 465 : 587, secure, from,
    ...(u.username ? { user: decodeURIComponent(u.username) } : {}), ...(u.password ? { pass: decodeURIComponent(u.password) } : {}),
  };
}

interface Reply { code: number; lines: string[] }

/** Reads SMTP replies (possibly several lines: `250-…` then `250 …`) from a socket, one at a time. */
function replyReader(socket: net.Socket): { next(): Promise<Reply>; stop(): void } {
  let buf = '';
  let current: string[] = [];
  const ready: Reply[] = [];
  let waiting: { ok: (r: Reply) => void; fail: (e: Error) => void } | undefined;
  let failure: Error | undefined;
  const deliver = (r: Reply): void => { if (waiting) { const w = waiting; waiting = undefined; w.ok(r); } else ready.push(r); };
  const onData = (chunk: Buffer | string): void => {
    buf += chunk.toString('utf8');
    for (let i = buf.indexOf('\r\n'); i >= 0; i = buf.indexOf('\r\n')) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 2);
      current.push(line);
      if (/^\d{3}( |$)/.test(line)) { deliver({ code: Number(line.slice(0, 3)), lines: current }); current = []; }
    }
  };
  const fail = (e: Error): void => { failure = e; if (waiting) { const w = waiting; waiting = undefined; w.fail(e); } };
  const onError = (e: Error): void => fail(e);
  const onClose = (): void => fail(new Error('the SMTP server closed the connection'));
  socket.on('data', onData);
  socket.on('error', onError);
  socket.on('close', onClose);
  return {
    next: () => new Promise<Reply>((ok, failNow) => {
      const r = ready.shift();
      if (r) return ok(r);
      if (failure) return failNow(failure);
      waiting = { ok, fail: failNow };
    }),
    stop: () => { socket.off('data', onData); socket.off('error', onError); socket.off('close', onClose); },
  };
}

const b64 = (s: string): string => Buffer.from(s, 'utf8').toString('base64');
const wrap76 = (s: string): string => (s.match(/.{1,76}/g) ?? []).join('\r\n');
const addressOf = (from: string): string => /<([^>]+)>/.exec(from)?.[1] ?? from.trim();
const isLocalHost = (h: string): boolean => h === 'localhost' || h === '127.0.0.1' || h === '::1';

/** One message over one connection. Credentials are sent only over TLS (or to the local machine). */
export async function sendSmtp(cfg: SmtpConfig, m: EmailMessage): Promise<void> {
  const timeoutMs = cfg.timeoutMs ?? SEND_TIMEOUT_MS;
  let socket: net.Socket = cfg.secure ? tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }) : net.connect({ host: cfg.host, port: cfg.port });
  socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP timed out')));
  let reader = replyReader(socket);
  const expect = async (...codes: number[]): Promise<Reply> => {
    const r = await reader.next();
    if (!codes.includes(r.code)) throw new Error(`SMTP ${r.code}: ${r.lines[r.lines.length - 1]?.slice(4) ?? ''}`);
    return r;
  };
  const say = async (line: string, ...codes: number[]): Promise<Reply> => { socket.write(`${line}\r\n`); return expect(...codes); };
  try {
    await new Promise<void>((ok, fail) => { socket.once(cfg.secure ? 'secureConnect' : 'connect', () => ok()); socket.once('error', fail); });
    await expect(220);
    const helo = cfg.helo ?? 'go-repository';
    let caps = (await say(`EHLO ${helo}`, 250)).lines.map((l) => l.slice(4).toUpperCase());
    let encrypted = cfg.secure;
    if (!cfg.secure && caps.some((c) => c === 'STARTTLS')) {
      await say('STARTTLS', 220);
      reader.stop();
      socket = tls.connect({ socket, servername: cfg.host });
      socket.setTimeout(timeoutMs, () => socket.destroy(new Error('SMTP timed out')));
      await new Promise<void>((ok, fail) => { socket.once('secureConnect', () => ok()); socket.once('error', fail); });
      reader = replyReader(socket);
      encrypted = true;
      caps = (await say(`EHLO ${helo}`, 250)).lines.map((l) => l.slice(4).toUpperCase());
    }
    if (cfg.user !== undefined) {
      if (!encrypted && !isLocalHost(cfg.host)) throw new Error('refusing to send SMTP credentials without TLS (use smtps:// or a server that offers STARTTLS)');
      await say(`AUTH PLAIN ${b64(`\u0000${cfg.user}\u0000${cfg.pass ?? ''}`)}`, 235);
    }
    await say(`MAIL FROM:<${oneLine(addressOf(cfg.from))}>`, 250);
    await say(`RCPT TO:<${oneLine(m.to)}>`, 250, 251);
    await say('DATA', 354);
    const headers = [
      `From: ${oneLine(cfg.from)}`, `To: ${oneLine(m.to)}`, `Subject: =?UTF-8?B?${b64(oneLine(m.subject))}?=`, `Date: ${new Date().toUTCString()}`,
      `Message-ID: <${randomUUID()}@${helo}>`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', 'Content-Transfer-Encoding: base64',
    ];
    // base64 has no leading dots and no long lines, so no dot-stuffing is needed
    socket.write(`${headers.join('\r\n')}\r\n\r\n${wrap76(b64(m.text))}\r\n.\r\n`);
    await expect(250);
    try { await say('QUIT', 221); } catch { /* the message is accepted; a rude goodbye changes nothing */ }
  } finally {
    reader.stop();
    socket.destroy();
  }
}

export function createSmtpMailer(cfg: SmtpConfig): EmailSender {
  return { kind: 'smtp', delivers: true, send: (m) => sendSmtp(cfg, m) };
}

// ───────────────────────────── choosing one ─────────────────────────────

/**
 * SMTP_URL, else RESEND_API_KEY (both need MAIL_FROM), else the file outbox in `outboxDir` (MAIL_SINK=console prints instead).
 * `kind` and `delivers` tell the caller whether verification can be enforced: a file or console sink cannot reach a human.
 */
export function mailerFromEnv(env: Record<string, string | undefined>, outboxDir: string, log: (line: string) => void = console.log): EmailSender {
  const from = env.MAIL_FROM;
  if (env.SMTP_URL) {
    if (!from) throw new Error('MAIL_FROM is required with SMTP_URL (for example "Go <no-reply@your-domain>")');
    return createSmtpMailer(parseSmtpUrl(env.SMTP_URL, from));
  }
  if (env.RESEND_API_KEY) {
    if (!from) throw new Error('MAIL_FROM is required with RESEND_API_KEY (an address on a domain verified at Resend)');
    return createResendMailer({ apiKey: env.RESEND_API_KEY, from });
  }
  if ((env.MAIL_SINK ?? '').toLowerCase() === 'console') return createConsoleMailer(log);
  return createFileMailer(env.OUTBOX_DIR || outboxDir);
}
