export function extractSelfTestReportFromExecutionResult(result: unknown): Record<string, unknown> | undefined {
  const cdpValue = (result as { result?: { value?: Record<string, unknown> } } | undefined)?.result?.value;
  if (cdpValue) {
    return cdpValue;
  }
  if (isReportObject(result)) {
    return result;
  }
  return undefined;
}

export function summarizeSelfTestReport(report: Record<string, unknown> | undefined): string | undefined {
  const matched = report?.matched as Record<string, boolean> | undefined;
  if (!matched) {
    return undefined;
  }
  const checks = Object.values(matched);
  const network = report?.network as { proxyConfigured?: boolean; publicIp?: string | null } | undefined;
  const webrtc = report?.webrtc as { leakRisk?: boolean; webrtcLeakRisk?: boolean } | undefined;

  if (network?.proxyConfigured) {
    checks.push(Boolean(network.publicIp));
  }
  const localeConsistency = report?.localeConsistency as { checks?: Array<{ passed?: boolean }> } | undefined;
  for (const check of localeConsistency?.checks ?? []) {
    checks.push(Boolean(check.passed));
  }
  const runtimeConsistency = report?.runtimeConsistency as { browserVersionMatchesRuntime?: boolean } | undefined;
  if (runtimeConsistency) {
    checks.push(Boolean(runtimeConsistency.browserVersionMatchesRuntime));
    const uaClientHintsConsistency = (runtimeConsistency as {
      uaClientHintsConsistency?: Record<string, boolean>;
    }).uaClientHintsConsistency;
    for (const [key, value] of Object.entries(uaClientHintsConsistency ?? {})) {
      if (key.endsWith('MatchesProfile')) {
        checks.push(Boolean(value));
      }
    }
  }
  if (webrtc) {
    checks.push(!(webrtc.webrtcLeakRisk ?? webrtc.leakRisk));
  }

  const passed = checks.filter(Boolean).length;
  return `${passed}/${checks.length} checks ok`;
}

export function buildNativeSelfTestCaptureScript(timeoutMs = 5000): string {
  return `
    new Promise((resolve) => {
      const startedAt = Date.now();
      const check = () => {
        const result = window.__LOCAL_FINGERPRINT_SELF_TEST_RESULT__;
        if (result && result.complete) {
          resolve(result);
          return;
        }
        if (Date.now() - startedAt > ${timeoutMs}) {
          resolve(undefined);
          return;
        }
        setTimeout(check, 150);
      };
      check();
    });
  `;
}

function isReportObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && 'matched' in value;
}
