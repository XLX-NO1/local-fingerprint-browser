export type NavigationDecision = {
  action: 'allow' | 'block';
  reason?: string;
};

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:', 'file:']);

export function navigationDecisionForUrl(rawUrl: string): NavigationDecision {
  const url = new URL(rawUrl);
  if (ALLOWED_PROTOCOLS.has(url.protocol)) {
    return { action: 'allow' };
  }
  return {
    action: 'block',
    reason: `Blocked external protocol: ${url.protocol.replace(':', '')}`,
  };
}
