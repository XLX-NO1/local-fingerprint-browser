export interface SelfTestChecklistItem {
  key: string;
  label: string;
  passed: boolean;
}

export function buildSelfTestChecklist(report: Record<string, unknown> | undefined): SelfTestChecklistItem[] {
  if (!report) {
    return [];
  }

  const matched = (report.matched as Record<string, boolean> | undefined) ?? {};
  const items: SelfTestChecklistItem[] = Object.entries(matched).map(([key, passed]) => ({
    key,
    label: key,
    passed,
  }));

  const network = report.network as { proxyConfigured?: boolean; publicIp?: string | null } | undefined;
  if (network) {
    items.push({
      key: 'proxyExit',
      label: network.proxyConfigured ? 'proxy exit ip' : 'direct ip',
      passed: network.proxyConfigured ? Boolean(network.publicIp) : true,
    });
  }

  const localeConsistency = report.localeConsistency as { checks?: Array<{ key: string; label: string; passed: boolean }> } | undefined;
  for (const check of localeConsistency?.checks ?? []) {
    items.push({
      key: `locale-${check.key}`,
      label: check.label,
      passed: check.passed,
    });
  }

  const runtimeConsistency = report.runtimeConsistency as {
    browserVersionMatchesRuntime?: boolean;
    uaClientHintsConsistency?: Record<string, boolean | unknown>;
  } | undefined;
  if (runtimeConsistency) {
    items.push({
      key: 'runtimeBrowserVersion',
      label: 'runtime browser version',
      passed: Boolean(runtimeConsistency.browserVersionMatchesRuntime),
    });
    for (const [key, value] of Object.entries(runtimeConsistency.uaClientHintsConsistency ?? {})) {
      if (typeof value !== 'boolean') {
        continue;
      }
      items.push({
        key: `runtimeUaClient-${key}`,
        label: `ua client ${key}`,
        passed: value,
      });
    }
  }

  const webrtc = report.webrtc as { leakRisk?: boolean; webrtcLeakRisk?: boolean } | undefined;
  if (webrtc) {
    items.push({
      key: 'webrtcLeak',
      label: 'webrtc leak',
      passed: !(webrtc.webrtcLeakRisk ?? webrtc.leakRisk),
    });
  }

  return items;
}
