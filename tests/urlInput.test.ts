import { describe, expect, it } from 'vitest';
import { normalizeOpenUrl } from '../src/urlInput';

describe('normalizeOpenUrl', () => {
  it('adds https protocol for simple domains', () => {
    expect(normalizeOpenUrl('example.com')).toBe('https://example.com/');
  });

  it('keeps explicit http and https urls', () => {
    expect(normalizeOpenUrl('http://example.com/path?q=1')).toBe('http://example.com/path?q=1');
    expect(normalizeOpenUrl('https://example.com/path')).toBe('https://example.com/path');
  });

  it('allows local fingerprint self-test file pages', () => {
    expect(normalizeOpenUrl('file:///tmp/profile/fingerprint-self-test.html')).toBe('file:///tmp/profile/fingerprint-self-test.html');
  });

  it('rejects empty or unsupported protocols', () => {
    expect(() => normalizeOpenUrl('')).toThrow('请输入要打开的网址');
    expect(() => normalizeOpenUrl('file:///tmp/test.html')).toThrow('不支持的网页协议');
  });
});
