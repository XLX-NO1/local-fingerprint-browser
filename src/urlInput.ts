export function normalizeOpenUrl(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error('请输入要打开的网址');
  }
  if (trimmed === 'about:blank') {
    return trimmed;
  }

  const withProtocol = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  const url = new URL(withProtocol);
  if (url.protocol === 'file:' && url.pathname.endsWith('/fingerprint-self-test.html')) {
    return url.toString();
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(`不支持的网页协议: ${url.protocol.replace(':', '')}`);
  }
  return url.toString();
}
