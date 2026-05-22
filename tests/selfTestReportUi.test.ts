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
        webrtc: {
          webrtcLeakRisk: false,
        },
      }),
    ).toEqual([
      { key: 'userAgent', label: 'userAgent', passed: true },
      { key: 'platform', label: 'platform', passed: false },
      { key: 'proxyExit', label: 'proxy exit ip', passed: true },
      { key: 'webrtcLeak', label: 'webrtc leak', passed: true },
    ]);
  });
});
