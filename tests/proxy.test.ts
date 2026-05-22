import { createServer, type Server } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { checkProxyReachability, proxyAuthForLogin, proxyIdentity, parseProxyUrl, proxyToChromiumUrl } from '../electron/services/proxy';

let server: Server | undefined;

afterEach(async () => {
  if (!server) return;
  await new Promise<void>((resolve, reject) => {
    server?.close((error) => (error ? reject(error) : resolve()));
  });
  server = undefined;
});

describe('proxy helpers', () => {
  it('parses http proxy urls', () => {
    expect(parseProxyUrl('http://127.0.0.1:8080')).toMatchObject({
      type: 'http',
      host: '127.0.0.1',
      port: 8080,
    });
  });

  it('parses socks5 proxy urls with auth', () => {
    expect(parseProxyUrl('socks5://user:pass@example.com:1080')).toMatchObject({
      type: 'socks5',
      host: 'example.com',
      port: 1080,
      username: 'user',
      password: 'pass',
    });
  });

  it('rejects unsupported protocols', () => {
    expect(() => parseProxyUrl('ftp://example.com:21')).toThrow('Unsupported proxy protocol');
  });

  it('formats chromium proxy urls', () => {
    const proxy = parseProxyUrl('https://proxy.example:8443');
    expect(proxyToChromiumUrl(proxy)).toBe('https://proxy.example:8443');
  });

  it('keeps auth out of chromium proxy urls and exposes login credentials separately', () => {
    const proxy = parseProxyUrl('http://user:p%40ss@proxy.example:8080');

    expect(proxyToChromiumUrl(proxy)).toBe('http://proxy.example:8080');
    expect(proxyAuthForLogin(proxy)).toEqual({ username: 'user', password: 'p@ss' });
  });

  it('computes a stable proxy identity including auth changes', () => {
    expect(proxyIdentity(parseProxyUrl('socks5://user:a@example.com:1080'))).not.toBe(
      proxyIdentity(parseProxyUrl('socks5://user:b@example.com:1080')),
    );
  });

  it('checks whether a proxy host and port are reachable', async () => {
    server = createServer((socket) => socket.end());
    await new Promise<void>((resolve) => server?.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('server did not bind');

    const result = await checkProxyReachability({
      ...parseProxyUrl(`http://127.0.0.1:${address.port}`),
      updatedAt: new Date().toISOString(),
    });

    expect(result.status).toBe('ok');
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
