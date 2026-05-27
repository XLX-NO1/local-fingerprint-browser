import { describe, expect, it } from 'vitest';
import { buildSelfTestChecklist } from '../src/selfTestReport';

describe('buildSelfTestChecklist', () => {
  it('turns raw self-test report fields into UI checklist chips', () => {
    expect(
      buildSelfTestChecklist({
        matched: {
          userAgent: true,
          platform: false,
        },
        network: {
          proxyConfigured: true,
          publicIp: '203.0.113.10',
        },
        localeConsistency: {
          score: 100,
          status: 'ok',
          summary: '3/3 locale checks ok',
          checks: [
            { key: 'timezoneCountry', label: 'timezone matches country', passed: true },
          ],
        },
        runtimeConsistency: {
          browserVersionMatchesRuntime: true,
          uaClientHintsConsistency: {
            platformMatchesProfile: true,
            architectureMatchesProfile: false,
          },
        },
        webrtc: {
          webrtcLeakRisk: false,
        },
      }),
    ).toEqual([
      { key: 'userAgent', label: 'userAgent', passed: true },
      { key: 'platform', label: 'platform', passed: false },
      { key: 'proxyExit', label: 'proxy exit ip', passed: true },
      { key: 'locale-timezoneCountry', label: 'timezone matches country', passed: true },
      { key: 'runtimeBrowserVersion', label: 'runtime browser version', passed: true },
      { key: 'runtimeUaClient-platformMatchesProfile', label: 'ua client platformMatchesProfile', passed: true },
      { key: 'runtimeUaClient-architectureMatchesProfile', label: 'ua client architectureMatchesProfile', passed: false },
      { key: 'webrtcLeak', label: 'webrtc leak', passed: true },
    ]);
  });
});
