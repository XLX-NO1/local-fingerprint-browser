export function isFingerprintSelfTestUrl(url: string | undefined): boolean {
  if (!url) {
    return false;
  }
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'file:' && parsed.pathname.endsWith('/fingerprint-self-test.html');
  } catch {
    return false;
  }
}
