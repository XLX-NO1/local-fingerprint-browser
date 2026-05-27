import { describe, expect, it } from 'vitest';
import { buildLocaleConsistencyReport } from '../src/fingerprintLocaleConsistency';
import type { FingerprintConfig } from '../src/types';

describe('buildLocaleConsistencyReport', () => {
  it('passes when language, timezone, and proxy exit country agree', () => {
    const report = buildLocaleConsistencyReport({
      fingerprint: makeFingerprint({
        languages: ['ja-JP', 'ja', 'en-US'],
        timezone: 'Asia/Tokyo',
      }),
      network: {
        proxyConfigured: true,
        publicIp: '203.0.113.10',
        countryCode: 'JP',
        countryName: 'Japan',
        timezone: 'Asia/Tokyo',
      },
    });

    expect(report.score).toBe(100);
    expect(report.status).toBe('ok');
    expect(report.checks).toEqual([
      { key: 'timezoneCountry', label: 'timezone matches country', passed: true, expected: 'JP', observed: 'JP' },
      { key: 'languageCountry', label: 'language matches country', passed: true, expected: 'JP', observed: 'JP' },
      { key: 'networkTimezone', label: 'network timezone matches profile', passed: true, expected: 'Asia/Tokyo', observed: 'Asia/Tokyo' },
    ]);
  });

  it('warns when direct network mode cannot confirm a country', () => {
    const report = buildLocaleConsistencyReport({
      fingerprint: makeFingerprint({
        languages: ['de-DE', 'de', 'en-US'],
        timezone: 'Europe/Berlin',
      }),
      network: {
        proxyConfigured: false,
        publicIp: '198.51.100.20',
      },
    });

    expect(report.score).toBe(67);
    expect(report.status).toBe('warning');
    expect(report.checks.find((check) => check.key === 'proxyGeo')?.passed).toBe(false);
    expect(report.checks.find((check) => check.key === 'proxyGeo')?.severity).toBe('warning');
  });

  it('flags language and timezone mismatches against proxy country', () => {
    const report = buildLocaleConsistencyReport({
      fingerprint: makeFingerprint({
        languages: ['zh-CN', 'zh', 'en-US'],
        timezone: 'Asia/Shanghai',
      }),
      network: {
        proxyConfigured: true,
        publicIp: '203.0.113.20',
        countryCode: 'US',
        countryName: 'United States',
        timezone: 'America/New_York',
      },
    });

    expect(report.score).toBe(0);
    expect(report.status).toBe('risk');
    expect(report.summary).toBe('0/3 locale checks ok');
    expect(report.checks.map((check) => [check.key, check.passed])).toEqual([
      ['timezoneCountry', false],
      ['languageCountry', false],
      ['networkTimezone', false],
    ]);
  });

  it('marks direct suspicious network countries as risk when they disagree with the profile locale', () => {
    const report = buildLocaleConsistencyReport({
      fingerprint: makeFingerprint({
        languages: ['ja-JP', 'ja', 'en-US'],
        timezone: 'Asia/Tokyo',
      }),
      network: {
        proxyConfigured: false,
        publicIp: '2400:38e0:1:4078::c2',
        countryCode: 'US',
        countryName: 'United States',
        timezone: 'America/New_York',
      },
    });

    expect(report.status).toBe('risk');
    expect(report.checks.map((check) => [check.key, check.passed, check.severity])).toEqual([
      ['networkMode', false, 'risk'],
      ['timezoneCountry', false, 'risk'],
      ['languageCountry', false, 'risk'],
      ['networkTimezone', false, 'risk'],
    ]);
  });
});

function makeFingerprint(overrides: Partial<FingerprintConfig> = {}): FingerprintConfig {
  return {
    id: 'fp-locale-test',
    os: 'windows',
    browserVersion: '126.0.0.0',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    platform: 'Win32',
    languages: ['en-US', 'en'],
    timezone: 'America/New_York',
    screenWidth: 1920,
    screenHeight: 1080,
    windowWidth: 1920,
    windowHeight: 1080,
    hardwareConcurrency: 8,
    deviceMemory: 8,
    webglVendor: 'Google Inc. (NVIDIA)',
    webglRenderer: 'ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)',
    canvasSeed: 123,
    audioSeed: 456,
    webrtcPolicy: 'proxy-only',
    mediaDevices: ['default-audio-input', 'default-audio-output'],
    plugins: ['Chrome PDF Viewer'],
    mimeTypes: ['application/pdf'],
    ...overrides,
  };
}
