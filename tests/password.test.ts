import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { createCredential, hashPassword, sha256Hex, verifyCredential } from '../src/utils/password';

describe('password hashing', () => {
  it('matches Node SHA-256 for the iterated, salted hash', () => {
    const salt = 'abc';
    const pw = 'héllo wörld'.repeat(10);
    let d = createHash('sha256').update(`${salt}:${pw}`).digest();
    for (let i = 1; i < 2000; i++) d = createHash('sha256').update(Buffer.concat([d, Buffer.from(salt)])).digest();
    expect(hashPassword(pw, salt)).toBe(d.toString('hex'));
  });

  it('sha256Hex matches Node', () => {
    expect(sha256Hex('aiya')).toBe(createHash('sha256').update('aiya').digest('hex'));
  });

  it('verifies the right password only', () => {
    const cred = createCredential('u1', 'rahasia');
    expect(cred.salt).toHaveLength(32);
    expect(verifyCredential(cred, 'rahasia')).toBe(true);
    expect(verifyCredential(cred, 'salah')).toBe(false);
    expect(verifyCredential(null, 'rahasia')).toBe(false);
  });

  it('uses a different salt each time', () => {
    expect(createCredential('u1', 'x').hash).not.toBe(createCredential('u1', 'x').hash);
  });
});
