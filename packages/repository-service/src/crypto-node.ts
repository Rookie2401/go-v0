/// <reference types="node" />
/**
 * The crypto dependencies on Node: scrypt password hashes (random 16-byte salt, N=16384, r=8, p=1, 32-byte key,
 * encoded `scrypt$<salt b64url>$<hash b64url>`), constant-time comparison, 32-byte base64url tokens, sha256 hex.
 */
import { createHash, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import type { CryptoPort } from './deps';

const N = 16384;
const KEYLEN = 32;

const derive = (password: string, salt: Buffer): Promise<Buffer> =>
  new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEYLEN, { N, r: 8, p: 1 }, (err, key) => (err ? reject(err) : resolve(key)));
  });

export const nodeCrypto: CryptoPort = {
  async hashPassword(password) {
    const salt = randomBytes(16);
    const key = await derive(password, salt);
    return `scrypt$${salt.toString('base64url')}$${key.toString('base64url')}`;
  },
  async verifyPassword(password, hash) {
    const [scheme, saltText, keyText, ...rest] = hash.split('$');
    if (scheme !== 'scrypt' || !saltText || !keyText || rest.length) return false;
    const expected = Buffer.from(keyText, 'base64url');
    if (expected.length !== KEYLEN) return false;
    const actual = await derive(password, Buffer.from(saltText, 'base64url'));
    return timingSafeEqual(actual, expected);
  },
  randomToken: () => randomBytes(32).toString('base64url'),
  sha256: (s) => createHash('sha256').update(s).digest('hex'),
};
