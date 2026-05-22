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
