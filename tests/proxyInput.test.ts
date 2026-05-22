import { describe, expect, it } from 'vitest';
import { formatProxyInput, parseProxyInput } from '../src/proxyInput';

describe('parseProxyInput', () => {
  it('returns undefined for empty proxy input', () => {
    expect(parseProxyInput('')).toBeUndefined();
  });

  it('parses authenticated socks proxy input', () => {
    expect(parseProxyInput('socks5://user:pass@127.0.0.1:1080')).toMatchObject({
      type: 'socks5',
      host: '127.0.0.1',
      port: 1080,
      username: 'user',
      password: 'pass',
    });
  });

  it('formats authenticated proxy input without dropping credentials', () => {
    const proxy = parseProxyInput('socks5://user:p%40ss@127.0.0.1:1080');

    expect(proxy ? formatProxyInput(proxy) : '').toBe('socks5://user:p%40ss@127.0.0.1:1080');
  });
});
