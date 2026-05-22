import type { ProxyConfig, ProxyType } from './types';

const supportedProxyTypes = new Set(['http:', 'https:', 'socks5:']);

export function parseProxyInput(value: string): ProxyConfig | undefined {
  const trimmed = value.trim();
  if (!trimmed) {
    return undefined;
  }

  const url = new URL(trimmed);
  if (!supportedProxyTypes.has(url.protocol)) {
    throw new Error(`Unsupported proxy protocol: ${url.protocol.replace(':', '')}`);
  }
  if (!url.hostname || !url.port) {
    throw new Error('Proxy URL must include host and port');
  }

  return {
    id: `proxy-${hash(trimmed)}`,
    type: url.protocol.replace(':', '') as ProxyType,
    host: url.hostname,
    port: Number(url.port),
    username: url.username ? decodeURIComponent(url.username) : undefined,
    password: url.password ? decodeURIComponent(url.password) : undefined,
    updatedAt: new Date().toISOString(),
  };
}

export function formatProxyInput(proxy: ProxyConfig | undefined): string {
  if (!proxy) {
    return '';
  }

  const credentials =
    proxy.username && proxy.password
      ? `${encodeURIComponent(proxy.username)}:${encodeURIComponent(proxy.password)}@`
      : proxy.username
        ? `${encodeURIComponent(proxy.username)}@`
        : '';
  return `${proxy.type}://${credentials}${proxy.host}:${proxy.port}`;
}

function hash(value: string): string {
  let result = 0;
  for (let index = 0; index < value.length; index += 1) {
    result = (result * 31 + value.charCodeAt(index)) >>> 0;
  }
  return result.toString(16).padStart(8, '0');
}
