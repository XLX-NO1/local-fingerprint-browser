import type { ProxyConfig, ProxyType } from '../../src/types';
import { Socket } from 'node:net';

const SUPPORTED_PROTOCOLS = new Set(['http:', 'https:', 'socks5:']);

export function parseProxyUrl(value: string): ProxyConfig {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Invalid proxy URL');
  }

  if (!SUPPORTED_PROTOCOLS.has(url.protocol)) {
    throw new Error(`Unsupported proxy protocol: ${url.protocol.replace(':', '')}`);
  }

  if (!url.hostname || !url.port) {
    throw new Error('Proxy URL must include host and port');
  }

  return {
    id: `proxy-${stableHash(value)}`,
    type: url.protocol.replace(':', '') as ProxyType,
    host: url.hostname,
    port: Number(url.port),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function proxyToChromiumUrl(proxy: ProxyConfig): string {
  return `${proxy.type}://${proxy.host}:${proxy.port}`;
}

export function proxyAuthForLogin(proxy: ProxyConfig): { username: string; password: string } | undefined {
  if (!proxy.username) {
    return undefined;
  }
  return {
    username: proxy.username,
    password: proxy.password ?? '',
  };
}

export function proxyIdentity(proxy: ProxyConfig | undefined): string {
  if (!proxy) {
    return 'direct';
  }
  return [
    proxy.type,
    proxy.host,
    String(proxy.port),
    proxy.username ?? '',
    proxy.password ?? '',
  ].join('|');
}

export async function checkProxyReachability(proxy: ProxyConfig, timeoutMs = 2500): Promise<{ status: 'ok' | 'failed'; latencyMs: number; error?: string }> {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const socket = new Socket();
    const finish = (status: 'ok' | 'failed', error?: string) => {
      socket.destroy();
      resolve({ status, latencyMs: Date.now() - startedAt, error });
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish('ok'));
    socket.once('timeout', () => finish('failed', 'Proxy connection timed out'));
    socket.once('error', (error) => finish('failed', error.message));
    socket.connect(proxy.port, proxy.host);
  });
}

function stableHash(value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
