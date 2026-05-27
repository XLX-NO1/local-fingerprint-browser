import { describe, expect, it } from 'vitest';
import { summarizeSelfTestReport } from '../electron/services/selfTestResult';

describe('summarizeSelfTestReport', () => {
  it('summarizes fingerprint, proxy, and webrtc checklist results', () => {
    const summary = summarizeSelfTestReport({
      matched: {
        userAgent: true,
        platform: true,
        timezone: true,
        screen: true,
      },
      network: {
        proxyConfigured: true,
        publicIp: '203.0.113.10',
      },
      localeConsistency: {
        checks: [
          { key: 'timezoneCountry', passed: true },
          { key: 'languageCountry', passed: true },
          { key: 'networkTimezone', passed: true },
        ],
      },
      runtimeConsistency: {
        browserVersionMatchesRuntime: true,
        uaClientHintsConsistency: {
          platformMatchesProfile: true,
          architectureMatchesProfile: true,
          platformVersionMatchesProfile: true,
          fullVersionMatchesProfile: true,
        },
      },
      hardwareRuntime: {
        validation: {
          valid: true,
        },
      },
      webrtc: {
        candidateCount: 0,
        webrtcLeakRisk: false,
      },
    });

    expect(summary).toBe('15/15 checks ok');
  });

  it('counts missing proxy exit and webrtc leaks as failed checks', () => {
    const summary = summarizeSelfTestReport({
      matched: {
        userAgent: true,
        platform: false,
      },
      network: {
        proxyConfigured: true,
        publicIp: undefined,
      },
      localeConsistency: {
        checks: [
          { key: 'timezoneCountry', passed: false },
          { key: 'languageCountry', passed: true },
        ],
      },
      runtimeConsistency: {
        browserVersionMatchesRuntime: false,
        uaClientHintsConsistency: {
          platformMatchesProfile: true,
          architectureMatchesProfile: false,
          platformVersionMatchesProfile: false,
          fullVersionMatchesProfile: false,
        },
      },
      hardwareRuntime: {
        validation: {
          valid: false,
        },
      },
      webrtc: {
        candidateCount: 2,
        webrtcLeakRisk: true,
      },
    });

    expect(summary).toBe('3/12 checks ok');
  });

  it('does not count direct network mode as a proxy failure', () => {
    const summary = summarizeSelfTestReport({
      matched: {
        userAgent: true,
        platform: true,
      },
      network: {
        proxyConfigured: false,
        publicIp: '198.51.100.20',
      },
      webrtc: {
        candidateCount: 0,
        webrtcLeakRisk: false,
      },
    });

    expect(summary).toBe('3/3 checks ok');
  });
});

describe('extractSelfTestReportFromExecutionResult', () => {
  it('accepts report objects read directly from an embedded BrowserView', async () => {
    const { extractSelfTestReportFromExecutionResult } = await import('../electron/services/selfTestResult');
    const report = { matched: { userAgent: true } };

    expect(extractSelfTestReportFromExecutionResult(report)).toBe(report);
  });

  it('accepts CDP Runtime.evaluate result objects', async () => {
    const { extractSelfTestReportFromExecutionResult } = await import('../electron/services/selfTestResult');
    const report = { matched: { userAgent: true } };

    expect(extractSelfTestReportFromExecutionResult({ result: { value: report } })).toBe(report);
  });
});
