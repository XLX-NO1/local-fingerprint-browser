import { describe, expect, it } from 'vitest';
import { isFingerprintSelfTestUrl } from '../src/selfTestDisplay';

describe('self-test display routing', () => {
  it('detects local fingerprint self-test pages even with run query strings', () => {
    expect(isFingerprintSelfTestUrl('file:///tmp/profile/fingerprint-self-test.html?run=abc')).toBe(true);
  });

  it('does not classify normal pages as fingerprint self-test pages', () => {
    expect(isFingerprintSelfTestUrl('https://example.com/fingerprint-self-test.html')).toBe(false);
    expect(isFingerprintSelfTestUrl('about:blank')).toBe(false);
  });
});
